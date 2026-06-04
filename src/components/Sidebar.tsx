import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { Search, LogOut, Loader2, Camera } from 'lucide-react';
import { cn } from '../utils';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';

interface SidebarProps {
  currentUser: User;
  activePartner: User | null;
  onSelectPartner: (user: User) => void;
  onLogout: () => void;
  onlineUserIds: string[];
  onAvatarUpdate: (url: string) => void;
}

export function Sidebar({ currentUser, activePartner, onSelectPartner, onLogout, onlineUserIds, onAvatarUpdate }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [recentChats, setRecentChats] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const fetchRecentChats = async () => {
    const { data: convs } = await supabase
      .from('conversations')
      .select('id, participants')
      .contains('participants', [currentUser.id]);

    if (convs && convs.length > 0) {
      const partnerIds = new Set<string>();
      convs.forEach((c: any) => {
        const pid = c.participants.find((id: string) => id !== currentUser.id);
        if (pid) partnerIds.add(pid);
      });

      if (partnerIds.size > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, username, avatar_url')
          .in('id', Array.from(partnerIds).slice(0, 20));

        if (users) {
          setRecentChats(users.map((u: any) => ({
            id: u.id,
            username: u.username,
            avatarUrl: u.avatar_url ?? undefined,
          })));
        }
      }
    }
  };

  useEffect(() => {
    fetchRecentChats();
    const channel = supabase.channel('sidebar_convs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, fetchRecentChats)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser.id]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data: users } = await supabase
          .from('users')
          .select('id, username, avatar_url')
          .ilike('username', `%${searchQuery}%`)
          .neq('id', currentUser.id)
          .limit(10);
        setSearchResults((users ?? []).map((u: any) => ({
          id: u.id, username: u.username, avatarUrl: u.avatar_url ?? undefined,
        })));
      } finally { setIsSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, currentUser.id]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return; }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${currentUser.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      // Add cache-buster
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;

      await supabase.from('users').update({ avatar_url: bustedUrl }).eq('id', currentUser.id);
      onAvatarUpdate(bustedUrl);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const displayList = searchQuery.trim() ? searchResults : recentChats;

  return (
    <div className="w-72 bg-[#121212] border-r border-[#2A2A2A] flex flex-col h-screen shrink-0">
      {/* Header */}
      <div className="p-5 border-b border-[#2A2A2A] flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tighter text-cyan-500">CHATICE</h1>
        <button onClick={onLogout} className="p-2 text-[#666] hover:text-white transition-colors" title="Sign out">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#555] group-focus-within:text-cyan-600 transition-colors" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#1E1E1E] border border-[#333] rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-cyan-600 transition-colors placeholder-[#555] text-[#E0E0E0]"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 space-y-0.5">
          <h3 className="text-xs font-semibold text-[#555] uppercase tracking-wider mb-2 px-2 mt-1">
            {searchQuery.trim() ? 'Search Results' : 'Recent Chats'}
          </h3>
          {isSearching ? (
            <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 text-[#666] animate-spin" /></div>
          ) : displayList.length === 0 ? (
            <div className="p-4 text-center text-[#555] text-sm">
              {searchQuery.trim() ? 'No users found' : 'No chats yet'}
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
                    'w-full flex items-center gap-3 p-3 text-left rounded-lg transition-colors',
                    isActive ? 'bg-[#1E1E1E] border-l-2 border-cyan-500' : 'hover:bg-[#181818] text-gray-400 hover:text-[#E0E0E0]'
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <Avatar user={user} size="md" />
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#121212] rounded-full shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={cn('text-sm font-semibold truncate', isActive ? 'text-[#E0E0E0]' : '')}>
                      @{user.username}
                    </h4>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Current User Footer */}
      <div className="p-4 bg-[#0F0F0F] border-t border-[#2A2A2A]">
        <div className="flex items-center gap-3">
          <div className="relative group flex-shrink-0">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="relative block"
              title="Change avatar"
              disabled={uploadingAvatar}
            >
              <Avatar user={currentUser} size="md" isCurrentUser />
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar
                  ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  : <Camera className="w-3.5 h-3.5 text-white" />
                }
              </div>
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#E0E0E0] truncate">@{currentUser.username}</div>
            <div className="text-[10px] text-[#555] flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
              Online
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
