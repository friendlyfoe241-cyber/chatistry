import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          username: session.user.user_metadata.username,
        });
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          username: session.user.user_metadata.username,
        });
        
        // Mark as online
        await supabase
          .from('users')
          .update({ is_online: true, updated_at: new Date().toISOString() })
          .eq('id', session.user.id);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Listen for online users
    const channel = supabase
      .channel('public:users')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        (payload) => {
          fetchOnlineUsers();
        }
      )
      .subscribe();

    const fetchOnlineUsers = async () => {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('is_online', true);
      
      if (data) {
        setOnlineUserIds(data.map(u => u.id));
      }
    };

    fetchOnlineUsers();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Set user as offline when leaving
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (user) {
        await supabase
          .from('users')
          .update({ is_online: false, updated_at: new Date().toISOString() })
          .eq('id', user.id);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user]);

  const handleLogout = async () => {
    if (user) {
      await supabase
        .from('users')
        .update({ is_online: false, updated_at: new Date().toISOString() })
        .eq('id', user.id);
    }
    await supabase.auth.signOut();
    setUser(null);
    setActivePartner(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#333] border-t-cyan-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="flex h-screen bg-[#080808] overflow-hidden font-sans text-[#E0E0E0]">
      <Sidebar 
        currentUser={user} 
        activePartner={activePartner} 
        onSelectPartner={setActivePartner} 
        onLogout={handleLogout}
        onlineUserIds={onlineUserIds}
      />
      <ChatArea 
        currentUser={user} 
        partner={activePartner} 
      />
    </div>
  );
}

