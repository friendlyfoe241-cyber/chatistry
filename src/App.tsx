import React, { useState, useEffect, useRef } from 'react';
import { User } from './types';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { supabase } from './supabase';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePartner, setActivePartner] = useState<User | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchProfile = async (userId: string, username: string): Promise<User> => {
    const { data } = await supabase
      .from('users')
      .select('avatar_url')
      .eq('id', userId)
      .single();
    return { id: userId, username, avatarUrl: data?.avatar_url ?? undefined };
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.user_metadata.username);
        setUser(profile);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.user_metadata.username);
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Online presence
  useEffect(() => {
    if (!user) {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel('online-users');
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = Object.values(state).flat().map((p: any) => p.user_id as string);
        setOnlineUserIds(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track({ user_id: user.id });
      });

    presenceChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); presenceChannelRef.current = null; };
  }, [user]);

  const handleLogout = async () => {
    if (presenceChannelRef.current) await presenceChannelRef.current.untrack();
    await supabase.auth.signOut();
    setUser(null);
    setActivePartner(null);
  };

  const handleAvatarUpdate = (avatarUrl: string) => {
    setUser(prev => prev ? { ...prev, avatarUrl } : prev);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#333] border-t-cyan-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <div className="flex h-screen bg-[#080808] overflow-hidden font-sans text-[#E0E0E0]">
      <Sidebar
        currentUser={user}
        activePartner={activePartner}
        onSelectPartner={setActivePartner}
        onLogout={handleLogout}
        onlineUserIds={onlineUserIds}
        onAvatarUpdate={handleAvatarUpdate}
      />
      <ChatArea currentUser={user} partner={activePartner} />
    </div>
  );
}
