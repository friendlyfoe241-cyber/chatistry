import React, { useState, useEffect, useRef } from 'react';
import { User } from './types';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Notifications, NotificationItem } from './components/Notifications';
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

  const isMobile = useIsMobile();
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activePartnerRef = useRef<User | null>(null);
  const userCacheRef = useRef<Map<string, User>>(new Map());

  useEffect(() => { activePartnerRef.current = activePartner; }, [activePartner]);

  // Keep currentUser.avatarUrl reliably in sync.
  // fetchProfile can race against the auth session propagating to the DB, returning null data.
  // This effect re-fetches after the user is set and subscribes to live profile changes.
  useEffect(() => {
    if (!user) return;

    // Re-fetch in case the initial fetchProfile missed avatarUrl due to a race condition
    supabase.from('users').select('avatar_url').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.avatar_url && data.avatar_url !== user.avatarUrl) {
          setUser(prev => prev ? { ...prev, avatarUrl: data.avatar_url } : prev);
        }
      });

    // Subscribe to realtime updates on the current user's row
    const ch = supabase.channel(`profile-sync:${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}`
      }, ({ new: row }) => {
        setUser(prev => prev ? { ...prev, avatarUrl: (row as any).avatar_url ?? undefined } : prev);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const fetchProfile = async (userId: string, username: string): Promise<User> => {
    const { data } = await supabase.from('users').select('avatar_url, last_seen_at').eq('id', userId).single();
    return { id: userId, username, avatarUrl: data?.avatar_url ?? undefined, lastSeenAt: data?.last_seen_at ?? undefined };
  };

  const loadUnreadCounts = async (userId: string) => {
    const { data: convs } = await supabase
      .from('conversations').select('id, participants').contains('participants', [userId]);
    if (!convs?.length) return;
    const convIds = convs.map((c: any) => c.id);
    const { data: reads } = await supabase
      .from('conversation_reads').select('conversation_id, last_read_at')
      .eq('user_id', userId).in('conversation_id', convIds);
    const readMap: Record<string, string> = {};
    reads?.forEach((r: any) => { readMap[r.conversation_id] = r.last_read_at; });
    const counts: Record<string, number> = {};
    await Promise.all(convs.map(async (conv: any) => {
      const partnerId = conv.participants.find((id: string) => id !== userId);
      if (!partnerId) return;
      const lastRead = readMap[conv.id] ?? '1970-01-01T00:00:00Z';
      const { count } = await supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id).neq('sender_id', userId).gt('created_at', lastRead);
      if (count && count > 0) counts[partnerId] = count;
    }));
    setUnreadCounts(counts);
  };

  useEffect(() => {
    if (!user) return;
    const update = () => {
      supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id);
    };
    window.addEventListener('beforeunload', update);
    return () => window.removeEventListener('beforeunload', update);
  }, [user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.user_metadata.username);
        setUser(profile);
        await loadUnreadCounts(session.user.id);
      }
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.user_metadata.username);
        setUser(profile);
        await loadUnreadCounts(session.user.id);
      } else { setUser(null); setUnreadCounts({}); }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('online-users');
    channel
      .on('presence', { event: 'sync' }, () => {
        const ids = Object.values(channel.presenceState()).flat().map((p: any) => p.user_id as string);
        setOnlineUserIds(ids);
      })
      .subscribe(async status => { if (status === 'SUBSCRIBED') await channel.track({ user_id: user.id }); });
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
        let sender = userCacheRef.current.get(msg.sender_id);
        if (!sender) {
          const { data } = await supabase.from('users').select('id, username, avatar_url').eq('id', msg.sender_id).single();
          if (data) { sender = { id: data.id, username: data.username, avatarUrl: data.avatar_url ?? undefined }; userCacheRef.current.set(msg.sender_id, sender); }
        }
        if (!sender) return;
        const senderSnapshot = sender;
        setUnreadCounts(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }));
        const notifId = `${Date.now()}-${Math.random()}`;
        setNotifications(prev => [...prev.slice(-4), { id: notifId, sender: senderSnapshot, message: msg.content ?? '', messageType: msg.message_type ?? 'text' }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notifId)), 5000);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [user]);

  const handleSelectPartner = async (partner: User) => {
    setActivePartner(partner);
    setUnreadCounts(prev => ({ ...prev, [partner.id]: 0 }));
    setNotifications(prev => prev.filter(n => n.sender.id !== partner.id));
    // On mobile, close sidebar when a chat is selected
    if (isMobile) setMobileSidebarOpen(false);
    if (user) {
      const chatId = [user.id, partner.id].sort().join('_');
      await supabase.from('conversation_reads').upsert(
        { user_id: user.id, conversation_id: chatId, last_read_at: new Date().toISOString() },
        { onConflict: 'user_id,conversation_id' }
      );
    }
  };

  const handleLogout = async () => {
    if (user) await supabase.from('users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id);
    if (presenceChannelRef.current) await presenceChannelRef.current.untrack();
    await supabase.auth.signOut();
    setUser(null); setActivePartner(null); setUnreadCounts({});
  };

  const handleAvatarUpdate = (avatarUrl: string) => setUser(prev => prev ? { ...prev, avatarUrl } : prev);

  const handleBackToSidebar = () => {
    setMobileSidebarOpen(true);
    setActivePartner(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[var(--border)] border-t-cyan-500 rounded-full animate-spin" />
    </div>
  );

  if (!user) return <AuthScreen />;

  return (
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

      {/* On mobile: only show ChatArea when sidebar is closed */}
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
  );
}
