import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, UserRow, UnreadCountRow, ConversationSummary } from './types';
import { AuthScreen } from './components/AuthScreen';
import { LandingPage } from './components/LandingPage';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Notifications, NotificationItem } from './components/Notifications';
import { ErrorBoundary } from './components/ErrorBoundary';
import { supabase } from './supabase';
import { useIsMobile } from './hooks/useIsMobile';
import { playNotificationSound } from './utils';

interface ConvMeta {
  isGroup: boolean;
  name: string | null;
  avatarUrl: string | null;
  participantIds: string[];
  createdBy: string | null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeConversation, setActiveConversation] = useState<ConversationSummary | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);

  const isMobile = useIsMobile();
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeConversationRef = useRef<ConversationSummary | null>(null);
  const windowFocusedRef = useRef<boolean>(typeof document !== 'undefined' ? document.hasFocus() : true);
  const userCacheRef = useRef<Map<string, User>>(new Map());
  const convCacheRef = useRef<Map<string, ConvMeta>>(new Map());

  useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);

  // Track real visibility so messages arriving while the user is away bust the
  // unread badge, and re-clear it (via markConversationRead) when they come back.
  // `focus`/`blur` events are unreliable for "another overlapping window is in front"
  // (they often only fire on minimize/tab-switch), so we ALSO poll document.hasFocus(),
  // which returns the live focus state regardless of how it was lost. Combined with
  // the Page Visibility API this catches minimize, tab switches, and covered windows.
  useEffect(() => {
    const syncWindowState = () => {
      const focused = document.hasFocus() && !document.hidden;
      const wasFocused = windowFocusedRef.current;
      windowFocusedRef.current = focused;
      // Only act on the unfocused -> focused transition, so polling while un
      // focused doesn't spam loads/upserts.
      if (focused && !wasFocused && activeConversationRef.current && user) {
        markConversationRead(activeConversationRef.current.id);
      }
    };
    syncWindowState();
    window.addEventListener('focus', syncWindowState);
    window.addEventListener('blur', syncWindowState);
    document.addEventListener('visibilitychange', syncWindowState);
    window.addEventListener('pageshow', syncWindowState);
    const interval = setInterval(syncWindowState, 1000);
    return () => {
      window.removeEventListener('focus', syncWindowState);
      window.removeEventListener('blur', syncWindowState);
      document.removeEventListener('visibilitychange', syncWindowState);
      window.removeEventListener('pageshow', syncWindowState);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
  // Keyed by conversation_id so it works uniformly for DMs and group chats.
  // Falls back to the old loop-based approach if the RPC isn't deployed yet.
  const loadUnreadCounts = async (userId: string) => {
    const { data, error } = await supabase.rpc('get_unread_counts', { p_user_id: userId });

    if (!error && data) {
      const counts: Record<string, number> = {};
      (data as UnreadCountRow[]).forEach(row => {
        if (row.conversation_id) counts[row.conversation_id] = Number(row.unread_count);
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
      convIds.map(async convId => {
        const lastRead = readMap[convId] ?? '1970-01-01T00:00:00Z';
        const { count, error: cErr } = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', convId).neq('sender_id', userId).gt('created_at', lastRead);
        if (cErr) { console.warn('Failed to count messages:', cErr.message); return; }
        if (count && count > 0) counts[convId] = count;
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

  // Boot the auth flow with a timeout around every await, plus a hard ceiling on
  // the whole effect. Supabase's onAuthStateChange INITIAL_SESSION event can
  // occasionally never fire (or the profile/unread queries hang), which used to
  // leave the app stuck on the loading spinner forever. getSession() is therefore
  // used to kick things off, with the callback as a backup, so some path always
  // resolves within a bounded time and the watchdog (below) can reload if not.
  useEffect(() => {
    // Reject a promise after `ms` unless it wins first; the timer is always
    // cleared so a fast query never leaves a stray timeout hanging around.
    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
      });
      return Promise.race([p, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
      });
    };

    // Boot completed without needing a reload — clear the watchdog flag so the
    // next visit can auto-reload again if it ever gets stuck.
    const finishBoot = () => {
      try { sessionStorage.removeItem('chatistry:boot-reload'); } catch { /* ignore */ }
      setLoading(false);
    };

    const settle = async () => {
      try {
        const { data: { session } } = await withTimeout(supabase.auth.getSession(), 5000);
        if (session?.user) {
          const profile = await withTimeout(fetchProfile(session.user.id, session.user.user_metadata.username ?? ''), 4000).catch(err => {
            console.warn('fetchProfile timed out/failed, using auth metadata only:', err);
            return { id: session.user.id, username: session.user.user_metadata.username ?? '' };
          });
          setUser(profile);
          await withTimeout(loadUnreadCounts(session.user.id), 4000).catch(err =>
            console.warn('loadUnreadCounts timed out/failed:', err));
        } else {
          setUser(null);
          setUnreadCounts({});
        }
      } catch (err) {
        // getSession timed out or the network is down — the onAuthStateChange
        // callback and the 4s bail are still our safety nets, so just stop
        // loading rather than spin forever.
        console.warn('Auth boot failed, falling back:', err);
      }
      finishBoot();
    };
    settle();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await withTimeout(fetchProfile(session.user.id, session.user.user_metadata.username ?? ''), 4000).catch(err => {
          console.warn('fetchProfile timed out/failed, using auth metadata only:', err);
          return { id: session.user.id, username: session.user.user_metadata.username ?? '' };
        });
        setUser(profile);
        await withTimeout(loadUnreadCounts(session.user.id), 4000).catch(err =>
          console.warn('loadUnreadCounts timed out/failed:', err));
      } else {
        setUser(null);
        setUnreadCounts({});
      }
      finishBoot();
    });

    // Hard ceiling: whatever happens, stop showing the boot spinner after 4s so
    // the watchdog (in the loading view) can take over instead of spinning forever.
    const bail = setTimeout(() => finishBoot(), 4000);

    return () => { subscription.unsubscribe(); clearTimeout(bail); };
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

  // Resolve (and cache) the conversation this message belongs to, so notifications
  // can show the right title/avatar for both 1:1 DMs and group chats.
  const getConvMeta = async (conversationId: string): Promise<ConvMeta | null> => {
    const cached = convCacheRef.current.get(conversationId);
    if (cached) return cached;
    const { data, error } = await supabase
      .from('conversations').select('is_group, name, avatar_url, participants, created_by')
      .eq('id', conversationId).single();
    if (error || !data) { console.warn('Failed to fetch conversation meta:', error?.message); return null; }
    const meta: ConvMeta = {
      isGroup: data.is_group, name: data.name, avatarUrl: data.avatar_url,
      participantIds: data.participants, createdBy: data.created_by,
    };
    convCacheRef.current.set(conversationId, meta);
    return meta;
  };

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('app-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async ({ new: msg }) => {
        if (msg.sender_id === user.id) return;
        const convId = msg.conversation_id as string;
        if (convId === activeConversationRef.current?.id) return;

        const meta = await getConvMeta(convId);
        if (!meta) return;

        let sender = userCacheRef.current.get(msg.sender_id as string);
        if (!sender) {
          const { data, error } = await supabase
            .from('users').select('id, username, display_name, avatar_url, last_seen_at')
            .eq('id', msg.sender_id).single();
          if (error) { console.warn('Failed to fetch notification sender:', error.message); return; }
          if (data) {
            sender = rowToUser(data as UserRow);
            userCacheRef.current.set(msg.sender_id as string, sender);
          }
        }
        if (!sender) return;

        const senderSnapshot = sender;
        // Skip bumping for the active conversation while the window is focused.
        // If the user is in another tab/app, still count it so the badge shows on their return.
        setUnreadCounts(prev => {
          if (convId === activeConversationRef.current?.id && windowFocusedRef.current) return prev;
          return { ...prev, [convId]: (prev[convId] || 0) + 1 };
        });

        // Ring only for conversations the user isn't currently viewing — same rule
        // as the red banner (which early-returns if it's the active conversation).
        playNotificationSound();

        const senderLabel = senderSnapshot.displayName || `@${senderSnapshot.username}`;
        const groupName = meta.name || 'Group chat';
        const notifTitle = meta.isGroup ? groupName : senderLabel;
        const notifAvatar = meta.isGroup ? (meta.avatarUrl ?? undefined) : senderSnapshot.avatarUrl;
        const notifFallback = meta.isGroup ? groupName : senderLabel;

        // Browser push notification when tab is not focused
        if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) {
          const bodyText = msg.message_type === 'image' ? '📷 Image'
            : msg.message_type === 'audio' ? '🎤 Voice message'
            : msg.message_type === 'video' ? '🎥 Video'
            : (msg.content as string) ?? '';
          const body = meta.isGroup ? `${senderLabel}: ${bodyText}` : bodyText;
          new Notification(notifTitle, {
            body, icon: notifAvatar || '/logo.png', badge: '/logo.png',
            tag: convId,
          });
        }
        const notifId = `${Date.now()}-${Math.random()}`;
        setNotifications(prev => [
          ...prev.slice(-4),
          {
            id: notifId, conversationId: convId, senderId: msg.sender_id as string, isGroup: meta.isGroup,
            title: notifTitle, avatarUrl: notifAvatar, avatarFallback: notifFallback,
            senderName: meta.isGroup ? senderLabel : undefined,
            message: (msg.content as string) ?? '', messageType: (msg.message_type as string ?? 'text') as NotificationItem['messageType'],
          },
        ]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notifId)), 5000);
      })
      .subscribe((_, err) => { if (err) console.error('Notification channel error:', err); });

    return () => supabase.removeChannel(channel);
  }, [user]);

  // Mark a conversation as read (clears its unread dot) and refresh the source of
  // truth for unread counts so the badge disappears in real time — no reload needed.
  const markConversationRead = useCallback(async (convId: string) => {
    setUnreadCounts(prev => ({ ...prev, [convId]: 0 }));
    setNotifications(prev => prev.filter(n => n.conversationId !== convId));
    if (!user) return;
    await supabase.from('conversation_reads').upsert(
      { user_id: user.id, conversation_id: convId, last_read_at: new Date().toISOString() },
      { onConflict: 'user_id,conversation_id' }
    );
    await loadUnreadCounts(user.id);
  }, [user, loadUnreadCounts]);

  const handleSelectConversation = async (conv: ConversationSummary) => {
    setActiveConversation(conv);
    setNotifications(prev => prev.filter(n => n.conversationId !== conv.id));
    if (isMobile) setMobileSidebarOpen(false);
    await markConversationRead(conv.id);
  };

  const handleOpenNotification = (item: NotificationItem) => {
    const meta = convCacheRef.current.get(item.conversationId);
    if (meta?.isGroup) {
      handleSelectConversation({
        id: item.conversationId, isGroup: true,
        name: meta.name || 'Group chat', avatarUrl: meta.avatarUrl ?? undefined,
        subtitle: `${meta.participantIds.length} members`,
        participantIds: meta.participantIds, updatedAt: new Date().toISOString(),
        createdBy: meta.createdBy ?? undefined,
      });
    } else {
      const sender = userCacheRef.current.get(item.senderId);
      if (!sender) return;
      handleSelectConversation({
        id: item.conversationId, isGroup: false,
        name: sender.displayName || `@${sender.username}`,
        avatarUrl: sender.avatarUrl, subtitle: sender.displayName ? `@${sender.username}` : undefined,
        partner: sender, participantIds: meta?.participantIds ?? [sender.id],
        statusEmoji: sender.statusEmoji, statusText: sender.statusText,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleConversationDeleted = (convId: string) => {
    if (activeConversation?.id === convId) setActiveConversation(null);
    setUnreadCounts(prev => { const next = { ...prev }; delete next[convId]; return next; });
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
    setUser(null); setActiveConversation(null); setUnreadCounts({});
  };

  const handleAvatarUpdate = (avatarUrl: string) =>
    setUser(prev => prev ? { ...prev, avatarUrl } : prev);

  const handleBackToSidebar = () => {
    setMobileSidebarOpen(true);
    setActiveConversation(null);
  };

  const handleLeftGroup = () => {
    setActiveConversation(null);
    if (isMobile) setMobileSidebarOpen(true);
  };

  if (loading) {
    // Watchdog: the auth boot above has timeouts/retries, but if the loading
    // screen is somehow still stuck after ~1.5s, force a real page reload. A
    // reload only resolves this class of bug (a dropped auth event or an
    // unfulfilled network promise), and the flag prevents an infinite
    // reload-loop if the problem is transient recurrence. A manual button is
    // also offered in case the browser blocks the automatic reload.
    return (
      <BootWatchdog />
    );
  }

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
      <div className="liquid-shell flex h-screen gap-4 overflow-hidden p-4 font-sans text-[var(--txt)]">
        <Sidebar
          currentUser={user}
          activeConversation={activeConversation}
          onSelectConversation={handleSelectConversation}
          onConversationDeleted={handleConversationDeleted}
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
            conversation={activeConversation}
            onlineUserIds={onlineUserIds}
            onBackToSidebar={isMobile ? handleBackToSidebar : undefined}
            onLeftGroup={handleLeftGroup}
            onMarkConversationRead={activeConversation ? (convId) => markConversationRead(convId) : undefined}
          />
        )}
        <Notifications
          items={notifications}
          onDismiss={id => setNotifications(prev => prev.filter(n => n.id !== id))}
          onOpen={handleOpenNotification}
        />
      </div>
    </ErrorBoundary>
  );
}

// ── Boot watchdog ──────────────────────────────────────────────────────────
const LOADING_WATCHDOG_MS = 1500;
const BOOT_RELOAD_FLAG = 'chatistry:boot-reload';

// Shown while the app is booting. If the spinner is still up after
// LOADING_WATCHDOG_MS, the page reloads automatically (same fix as a manual
// refresh, but hands-free). The sessionStorage flag makes sure we only reload
// once per visit — a reload that lands on the same stuck state means the
// problem isn't boot-time and an infinite reload loop would be worse.
function BootWatchdog() {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      try {
        if (sessionStorage.getItem(BOOT_RELOAD_FLAG)) return; // already tried
        sessionStorage.setItem(BOOT_RELOAD_FLAG, '1');
      } catch { /* storage unavailable */ }
      setReloading(true);
      window.location.reload();
    }, LOADING_WATCHDOG_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-[var(--border)] border-t-cyan-500 rounded-full animate-spin" />
        {reloading && (
          <>
            <p className="text-sm text-[var(--txt2)]">Taking a while — reloading…</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold rounded-full border border-[var(--border3)] bg-[var(--surface3)] text-[var(--txt)] hover:brightness-125 transition"
            >
              Reload now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
