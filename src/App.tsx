import React, { useState, useEffect, useRef } from 'react';
import { User, UserRow, UnreadCountRow } from './types';
import { AuthScreen } from './components/AuthScreen';
import { LandingPage } from './components/LandingPage';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Notifications, NotificationItem } from './components/Notifications';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from './supabase';
import { useIsMobile } from './hooks/useIsMobile';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePartner, setActivePartner] = useState<User | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);

  const isMobile = useIsMobile();
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activePartnerRef = useRef<User | null>(null);
  const userCacheRef = useRef<Map<string, User>>(new Map());

  useEffect(() => { activePartnerRef.current = activePartner; }, [activePartner]);

  // Keep currentUser.avatarUrl reliably in sync.
  // Retries with backoff to handle the window where the auth session
  // hasn't fully propagated to the DB client yet on initial load.
  useEffect(() => {
    if (!user) return;

    const fetchAvatarWithRetry = async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 350 * attempt));
        const { data } = await supabase.from('users').select('avatar_url').eq('id', user.id).single();
        if (data?.avatar_url) {
          if (data.avatar_url !== user.avatarUrl)
            setUser(prev => prev ? { ...prev, avatarUrl: data.avatar_url! } : prev);
          return;
        }
      }
    };
    fetchAvatarWithRetry();

    const ch = supabase.channel(`profile-sync:${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}`
      }, ({ new: row }) => {
        const r = row as UserRow;
        setUser(prev => prev ? { ...prev, avatarUrl: r.avatar_url ?? undefined } : prev);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // Build a User object from a DB row
  const rowToUser = (row: UserRow): User => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    statusEmoji: row.status_emoji ?? undefined,
    statusText: row.status_text ?? undefined,
  });

  const fetchProfile = async (userId: string, username: string): Promise<User> => {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, last_seen_at, status_emoji, status_text')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.warn('fetchProfile query failed, using auth metadata only:', error?.message);
      return { id: userId, username };
    }

    return rowToUser(data as UserRow);
  };

  // Single RPC call instead of N+1 queries per conversation.
  // Falls back to the old loop-based approach if the RPC isn't deployed yet.
  const loadUnreadCounts = async (userId: string) => {
    const { data, error } = await supabase.rpc('get_unread_counts', { p_user_id: userId });

    if (!error && data) {
      const counts: Record<string, number> = {};
      (data as UnreadCountRow[]).forEach(row => {
        if (row.partner_id) counts[row.partner_id] = Number(row.unread_count);
      });
      setUnreadCounts(counts);
      return;
    }

    // Fallback if RPC not yet deployed
    console.warn('get_unread_counts RPC unavailable, using fallback:', error?.message);
    const { data: convs, error: convErr } = await supabase
      .from('conversations').select('id, participants').contains('participants', [userId]);
    if (convErr) { console.error('Failed to load conversations:', convErr.message); return; }
    if (!convs?.length) return;

    const convIds = (convs as { id: string; participants: string[] }[]).map(c => c.id);
    const { data: reads, error: readsErr } = await supabase
      .from('conversation_reads').select('conversation_id, last_read_at')
      .eq('user_id', userId).in('conversation_id', convIds);
    if (readsErr) console.warn('Failed to load reads:', readsErr.message);

    const readMap: Record<string, string> = {};
    (reads ?? []).forEach((r: { conversation_id: string; last_read_at: string }) => {
      readMap[r.conversation_id] = r.last_read_at;
    });

    const counts: Record<string, number> = {};
    await Promise.all(
      (convs as { id: string; participants: string[] }[]).map(async conv => {
        const partnerId = conv.participants.find(id => id !== userId);
        if (!partnerId) return;
        const lastRead = readMap[conv.id] ?? '1970-01-01T00:00:00Z';
        const { count, error: cErr } = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id).neq('sender_id', userId).gt('created_at', lastRead);
        if (cErr) { console.warn('Failed to count messages:', cErr.message); return; }
        if (count && count > 0) counts[partnerId] = count;
      })
    );
    setUnreadCounts(counts);
  };

  useEffect(() => {
    if (!user) return;
    const update = () => {
      supabase.from('users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(({ error }) => { if (error) console.warn('last_seen_at update failed:', error.message); });
    };
    window.addEventListener('beforeunload', update);
    return () => window.removeEventListener('beforeunload', update);
  }, [user?.id]);

  // Request push notification permission when user logs in
  useEffect(() => {
    if (!user) return;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [user?.id]);

  // Single source of truth for auth — onAuthStateChange fires as INITIAL_SESSION
  // on page load, so getSession is redundant and causes a double fetchProfile race.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.user_metadata.username ?? '');
        setUser(profile);
        await loadUnreadCounts(session.user.id);
      } else {
        setUser(null);
        setUnreadCounts({});
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('online-users');
    channel
      .on('presence', { event: 'sync' }, () => {
        const ids = Object.values(channel.presenceState()).flat().map((p: Record<string, unknown>) => p.user_id as string);
        setOnlineUserIds(ids);
      })
      .subscribe(async (status, err) => {
        if (err) { console.error('Presence subscribe error:', err); return; }
        if (status === 'SUBSCRIBED') await channel.track({ user_id: user.id });
      });
    presenceChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); presenceChannelRef.current = null; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('app-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async ({ new: msg }) => {
        if (msg.sender_id === user.id) return;
        const activeId = activePartnerRef.current?.id;
        const activeChatId = activeId ? [user.id, activeId].sort().join('_') : null;
        if (msg.conversation_id === activeChatId) return;

        let sender = userCacheRef.current.get(msg.sender_id as string);
        if (!sender) {
          const { data, error } = await supabase
            .from('users').select('id, username, avatar_url, last_seen_at')
            .eq('id', msg.sender_id).single();
          if (error) { console.warn('Failed to fetch notification sender:', error.message); return; }
          if (data) {
            sender = rowToUser(data as UserRow);
            userCacheRef.current.set(msg.sender_id as string, sender);
          }
        }
        if (!sender) return;

        const senderSnapshot = sender;
        setUnreadCounts(prev => ({ ...prev, [msg.sender_id as string]: (prev[msg.sender_id as string] || 0) + 1 }));

        // Browser push notification when tab is not focused
        if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
          const body = msg.message_type === 'image' ? '📷 Image'
            : msg.message_type === 'audio' ? '🎤 Voice message'
            : msg.message_type === 'video' ? '🎥 Video'
            : (msg.content as string) ?? '';
          new Notification(senderSnapshot.displayName || `@${senderSnapshot.username}`, {
            body, icon: senderSnapshot.avatarUrl || '/logo.png', badge: '/logo.png',
            tag: senderSnapshot.id,
          });
        }
        const notifId = `${Date.now()}-${Math.random()}`;
        setNotifications(prev => [
          ...prev.slice(-4),
          { id: notifId, sender: senderSnapshot, message: (msg.content as string) ?? '', messageType: (msg.message_type as string) ?? 'text' },
        ]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notifId)), 5000);
      })
      .subscribe((_, err) => { if (err) console.error('Notification channel error:', err); });

    return () => supabase.removeChannel(channel);
  }, [user]);

  const handleSelectPartner = async (partner: User) => {
    setActivePartner(partner);
    setUnreadCounts(prev => ({ ...prev, [partner.id]: 0 }));
    setNotifications(prev => prev.filter(n => n.sender.id !== partner.id));
    if (isMobile) setMobileSidebarOpen(false);
    if (user) {
      const chatId = [user.id, partner.id].sort().join('_');
      const { error } = await supabase.from('conversation_reads').upsert(
        { user_id: user.id, conversation_id: chatId, last_read_at: new Date().toISOString() },
        { onConflict: 'user_id,conversation_id' }
      );
      if (error) console.warn('Failed to mark conversation as read:', error.message);
    }
  };

  const handleLogout = async () => {
    if (user) {
      const { error } = await supabase.from('users')
        .update({ last_seen_at: new Date().toISOString() }).eq('id', user.id);
      if (error) console.warn('last_seen_at on logout failed:', error.message);
    }
    if (presenceChannelRef.current) await presenceChannelRef.current.untrack();
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign out failed:', error.message);
    setUser(null); setActivePartner(null); setUnreadCounts({});
  };

  const handleAvatarUpdate = (avatarUrl: string) =>
    setUser(prev => prev ? { ...prev, avatarUrl } : prev);

  const handleBackToSidebar = () => {
    setMobileSidebarOpen(true);
    setActivePartner(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[var(--border)] border-t-cyan-500 rounded-full animate-spin" />
    </div>
  );

  if (!user) {
    if (authMode) return <AuthScreen initialMode={authMode} onBack={() => setAuthMode(null)} />;
    return (
      <LandingPage
        onSignIn={() => setAuthMode('signin')}
        onSignUp={() => setAuthMode('signup')}
      />
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-[var(--bg)] overflow-hidden font-sans text-[var(--txt)]">
        <Sidebar
          currentUser={user}
          activePartner={activePartner}
          onSelectPartner={handleSelectPartner}
          onLogout={handleLogout}
          onlineUserIds={onlineUserIds}
          onAvatarUpdate={handleAvatarUpdate}
          unreadCounts={unreadCounts}
          isMobile={isMobile}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        {(!isMobile || !mobileSidebarOpen) && (
          <ChatArea
            currentUser={user}
            partner={activePartner}
            onlineUserIds={onlineUserIds}
            onBackToSidebar={isMobile ? handleBackToSidebar : undefined}
          />
        )}
        <Notifications
          items={notifications}
          onDismiss={id => setNotifications(prev => prev.filter(n => n.id !== id))}
          onOpen={sender => handleSelectPartner(sender)}
        />
      </div>
    </ErrorBoundary>
  );
}
