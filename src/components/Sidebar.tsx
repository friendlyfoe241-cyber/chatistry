import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Search, LogOut, Loader2 } from 'lucide-react';
import { cn } from '../utils';
import { supabase } from '../supabase';

interface SidebarProps {
  currentUser: User;
  activePartner: User | null;
  onSelectPartner: (user: User) => void;
  onLogout: () => void;
  onlineUserIds: string[];
}

export function Sidebar({ currentUser, activePartner, onSelectPartner, onLogout, onlineUserIds }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [recentChats, setRecentChats] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Listen for recent conversations
  useEffect(() => {
    // Initial fetch of recent chats
    const fetchRecentChats = async () => {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, participants')
        .contains('participants', [currentUser.id]);

      if (convs && convs.length > 0) {
        const partnerIds = new Set<string>();
        convs.forEach((c: any) => {
          const partnerId = c.participants.find((id: string) => id !== currentUser.id);
          if (partnerId) partnerIds.add(partnerId);
        });

        if (partnerIds.size > 0) {
          const pIds = Array.from(partnerIds).slice(0, 10);
          const { data: users } = await supabase
            .from('users')
            .select('id, username')
            .in('id', pIds);

          if (users) {
            setRecentChats(users as User[]);
          }
        }
      }
    };

    fetchRecentChats();

    // Listen to changes in conversations
    const channel = supabase
      .channel('recent_chats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchRecentChats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser.id]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delay = setTimeout(async () => {
      try {
        const { data: users } = await supabase
          .from('users')
          .select('id, username')
          .ilike('username', `%${searchQuery}%`)
          .neq('id', currentUser.id)
          .limit(10);
        
        if (users) {
          setSearchResults(users as User[]);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delay);
  }, [searchQuery, currentUser.id]);

  const displayList = searchQuery.trim() ? searchResults : recentChats;

  return (
    <div className="w-72 bg-[#121212] border-r border-[#2A2A2A] flex flex-col h-screen shrink-0 pb-env(safe-area-inset-bottom)">
      {/* Header Profile */}
      <div className="p-6 border-b border-[#2A2A2A] flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tighter text-cyan-500">LITECHAT</h1>
        <button 
          onClick={onLogout}
          className="p-2 text-[#666] hover:text-white transition-colors"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-4">
        <div className="relative group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#555] group-focus-within:text-cyan-600 transition-colors" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1E1E1E] border border-[#333] rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-cyan-600 transition-colors placeholder-[#555] text-[#E0E0E0]"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto w-full">
        <div className="px-2 space-y-1">
          <h3 className="text-xs font-semibold text-[#555] uppercase tracking-wider mb-2 px-2 mt-2">
            {searchQuery.trim() ? 'Search Results' : 'Recent Chats'}
          </h3>
          
          {isSearching ? (
             <div className="flex justify-center p-4">
               <Loader2 className="w-5 h-5 text-[#666] animate-spin" />
             </div>
          ) : displayList.length === 0 ? (
            <div className="p-4 text-center text-[#555] text-sm">
              {searchQuery.trim() ? 'No users found matching query' : 'No chats yet'}
            </div>
          ) : (
            displayList.map(user => {
              const isActive = activePartner?.id === user.id;
              const isOnline = onlineUserIds.includes(user.id);
              
              return (
                <button
                  key={user.id}
                  onClick={() => onSelectPartner(user)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 text-left rounded-lg transition-colors",
                    isActive ? "bg-[#1E1E1E] border-l-2 border-cyan-500" : "hover:bg-[#181818] text-gray-400 hover:text-[#E0E0E0]"
                  )}
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-[#2A2A2A] flex items-center justify-center font-bold text-cyan-400">
                      {user.username.substring(0, 2).toUpperCase()}
                    </div>
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#121212] rounded-full shadow-[0_0_4px_rgba(34,197,94,0.6)]"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={cn("text-sm font-semibold truncate", isActive ? "text-[#E0E0E0]" : "")}>
                      @{user.username}
                    </h4>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      
      <div className="p-4 bg-[#0F0F0F] border-t border-[#2A2A2A]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-cyan-900/30 flex items-center justify-center border border-cyan-700/50">
            <span className="text-xs font-bold text-cyan-400 uppercase">{currentUser.username.substring(0, 2)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#E0E0E0] truncate">@{currentUser.username}</div>
            <div className="text-[10px] text-[#555] flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_4px_rgba(34,197,94,0.6)]"></div>
              Supabase Connected
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
