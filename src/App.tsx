import React, { useState, useEffect, useRef } from 'react';
import { User } from './types';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Notifications, NotificationItem } from './components/Notifications';
import { supabase } from './supabase';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePartner, setActivePartner] = useState<User | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activePartnerRef = useRef<User | null>(null);
  const userCacheRef = useRef<Map<string, User>>(new Map());

  useEffect(() => { activePartnerRef.current = activePartner; }, [activePartner]);

  const fetchProfile = async (userId: string, username: string): Promise<User> => {
    const { data } = await supabase.from('users').select('avatar_url').eq('id', userId).single();
    return { id: userId, username, avatarUrl: data?.avatar_url ?? undefined };
  };

  // Load persistent unread counts from DB — works even if website was closed
  const loadUnreadCounts = async (userId: string) => {
    const { data: convs } = await supabase
      .from('conversations')
      .select('id, participants')
      .contains('participants', [userId]);

    if (!convs?.length) return;

    // Fetch all read timestamps for this user at once
    const convIds = convs.map((c: any) => c.id);
    const { data: reads } = await supabase
      .from('conversation_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId)
      .in('conversation_id', convIds);

    const readMap: Record<string, string> = {};
    reads?.forEach((r: any) => { readMap[r.conversation_id] = r.last_read_at; });

    // Count unread messages per conversation in parallel
    const counts: Record<string, number> = {};
    await Promise.all(convs.map(async (conv: any) => {
      const partnerId = conv.participants.find((id: string) => id !== userId);
      if (!partnerId) return;

      const lastRead = readMap[conv.id] ?? '1970-01-01T00:00:00Z';
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', userId)
        .gt('created_at', lastRead);

      if (count && count > 0) counts[partnerId] = count;
    }));

    setUnreadCounts(counts);
  };

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
      } else {
        setUser(null);
        setUnreadCounts({});
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Online presence
  useEffect(() => {
    if (!user) {
      if (presenceChannelRef.current) { supabase.removeChannel(presenceChannelRef.current); presenceChannelRef.current = null; }
      return;
    }
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

  // Global incoming message listener — real-time notifications + in-session unread increments
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('app-notifications')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async ({ new: msg }) => {
          if (msg.sender_id === user.id) return;

          const activeId = activePartnerRef.current?.id;
          const activeChatId = activeId ? [user.id, activeId].sort().join('_') : null;
          if (msg.conversation_id === activeChatId) return;

          let sender = userCacheRef.current.get(msg.sender_id);
          if (!sender) {
            const { data } = await supabase
              .from('users').select('id, username, avatar_url').eq('id', msg.sender_id).single();
            if (data) {
              sender = { id: data.id, username: data.username, avatarUrl: data.avatar_url ?? undefined };
              userCacheRef.current.set(msg.sender_id, sender);
            }
          }
          if (!sender) return;

          const senderSnapshot = sender;

          // Increment in-memory unread
          setUnreadCounts(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }));

          // Toast
          const notifId = `${Date.now()}-${Math.random()}`;
          setNotifications(prev => [
            ...prev.slice(-4),
            { id: notifId, sender: senderSnapshot, message: msg.content ?? '', messageType: msg.message_type ?? 'text' },
          ]);
          setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notifId)), 5000);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  const handleSelectPartner = async (partner: User) => {
    setActivePartner(partner);
    setUnreadCounts(prev => ({ ...prev, [partner.id]: 0 }));
    setNotifications(prev => prev.filter(n => n.sender.id !== partner.id));

    // Persist read timestamp so unread state survives page refresh/close
    if (user) {
      const chatId = [user.id, partner.id].sort().join('_');
      await supabase.from('conversation_reads').upsert(
        { user_id: user.id, conversation_id: chatId, last_read_at: new Date().toISOString() },
        { onConflict: 'user_id,conversation_id' }
      );
    }
  };

  const handleLogout = async () => {
    if (presenceChannelRef.current) await presenceChannelRef.current.untrack();
    await supabase.auth.signOut();
    setUser(null); setActivePartner(null); setUnreadCounts({});
  };

  const handleAvatarUpdate = (avatarUrl: string) => setUser(prev => prev ? { ...prev, avatarUrl } : prev);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#333] border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <div className="flex h-screen bg-[#080808] overflow-hidden font-sans text-[#E0E0E0]">
      <Sidebar
        currentUser={user}
        activePartner={activePartner}
        onSelectPartner={handleSelectPartner}
        onLogout={handleLogout}
        onlineUserIds={onlineUserIds}
        onAvatarUpdate={handleAvatarUpdate}
        unreadCounts={unreadCounts}
      />
      <ChatArea currentUser={user} partner={activePartner} />
      <Notifications
        items={notifications}
        onDismiss={id => setNotifications(prev => prev.filter(n => n.id !== id))}
        onOpen={sender => handleSelectPartner(sender)}
      />
    </div>
  );
}
