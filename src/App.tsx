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

  // Keep ref in sync with state
  useEffect(() => { activePartnerRef.current = activePartner; }, [activePartner]);

  const fetchProfile = async (userId: string, username: string): Promise<User> => {
    const { data } = await supabase.from('users').select('avatar_url').eq('id', userId).single();
    return { id: userId, username, avatarUrl: data?.avatar_url ?? undefined };
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) setUser(await fetchProfile(session.user.id, session.user.user_metadata.username));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session?.user) setUser(await fetchProfile(session.user.id, session.user.user_metadata.username));
      else setUser(null);
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

  // Global incoming message listener — notifications + unread badges
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('app-notifications')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async ({ new: msg }) => {
          if (msg.sender_id === user.id) return;

          // Skip if this is the currently open conversation
          const activeId = activePartnerRef.current?.id;
          const activeChatId = activeId ? [user.id, activeId].sort().join('_') : null;
          if (msg.conversation_id === activeChatId) return;

          // Resolve sender (cache to avoid repeated DB calls)
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

          // Unread badge
          setUnreadCounts(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }));

          // Toast notification (cap at 5 simultaneous)
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

  const handleSelectPartner = (partner: User) => {
    setActivePartner(partner);
    setUnreadCounts(prev => ({ ...prev, [partner.id]: 0 }));
    setNotifications(prev => prev.filter(n => n.sender.id !== partner.id));
  };

  const handleLogout = async () => {
    if (presenceChannelRef.current) await presenceChannelRef.current.untrack();
    await supabase.auth.signOut();
    setUser(null); setActivePartner(null);
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
