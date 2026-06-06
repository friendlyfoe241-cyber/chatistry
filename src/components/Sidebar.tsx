import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { Search, LogOut, Loader2, Camera, Sun, Moon, Star } from 'lucide-react';
import { cn } from '../utils';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  currentUser: User;
  activePartner: User | null;
  onSelectPartner: (user: User) => void;
  onLogout: () => void;
  onlineUserIds: string[];
  onAvatarUpdate: (url: string) => void;
  unreadCounts: Record<string, number>;
}

export function Sidebar({ currentUser, activePartner, onSelectPartner, onLogout, onlineUserIds, onAvatarUpdate, unreadCounts }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [recentChats, setRecentChats] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pinnedConvoIds, setPinnedConvoIds] = useState<Set<string>>(new Set());
  const [hoveredConvoId, setHoveredConvoId] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const fetchRecentChats = async () => {
    const { data: convs } = await supabase
      .from('conversations').select('id, participants, updated_at')
      .contains('participants', [currentUser.id])
      .order('updated_at', { ascending: false });
    if (convs?.length) {
      const ids = new Set<string>();
      convs.forEach((c: any) => {
        const pid = c.participants.find((id: string) => id !== currentUser.id);
        if (pid) ids.add(pid);
      });
      if (ids.size) {
        const { data: users } = await supabase
          .from('users').select('id, username, avatar_url').in('id', Array.from(ids).slice(0, 20));
        if (users) setRecentChats(users.map((u: any) => ({ id: u.id, username: u.username, avatarUrl: u.avatar_url ?? undefined })));
      }
    }
  };

  const loadPinnedConvos = async () => {
    const { data } = await supabase
      .from('user_pinned_conversations').select('conversation_id').eq('user_id', currentUser.id);
    if (data) setPinnedConvoIds(new Set(data.map((r: any) => r.conversation_id)));
  };

  useEffect(() => {
    fetchRecentChats();
    loadPinnedConvos();
    const ch = supabase.channel('sidebar_convs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, fetchRecentChats)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentUser.id]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('users').select('id, username, avatar_url')
          .ilike('username', `%${searchQuery}%`).neq('id', currentUser.id).limit(10);
        setSearchResults((data ?? []).map((u: any) => ({ id: u.id, username: u.username, avatarUrl: u.avatar_url ?? undefined })));
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
      await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;
      await supabase.from('users').update({ avatar_url: bustedUrl }).eq('id', currentUser.id);
      onAvatarUpdate(bustedUrl);
    } catch (err) { console.error('Avatar upload failed:', err); }
    finally { setUploadingAvatar(false); if (avatarInputRef.current) avatarInputRef.current.value = ''; }
  };

  const togglePinConvo = async (e: React.MouseEvent, u: User) => {
    e.stopPropagation();
    const chatId = [currentUser.id, u.id].sort().join('_');
    if (pinnedConvoIds.has(chatId)) {
      await supabase.from('user_pinned_conversations')
        .delete().eq('user_id', currentUser.id).eq('conversation_id', chatId);
      setPinnedConvoIds(prev => { const s = new Set(prev); s.delete(chatId); return s; });
    } else {
      await supabase.from('user_pinned_conversations')
        .insert({ user_id: currentUser.id, conversation_id: chatId });
      setPinnedConvoIds(prev => new Set([...prev, chatId]));
    }
  };

  const baseList = searchQuery.trim() ? searchResults : recentChats;
  const pinnedList = baseList.filter(u => pinnedConvoIds.has([currentUser.id, u.id].sort().join('_')));
  const unpinnedList = baseList.filter(u => !pinnedConvoIds.has([currentUser.id, u.id].sort().join('_')));
  const displayList = [...pinnedList, ...unpinnedList];

  return (
    <div className="w-72 bg-[var(--surface2)] border-r border-[var(--border)] flex flex-col h-screen shrink-0">
      {/* Header */}
      <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Chatice logo" className="w-8 h-8 object-contain" />
          <h1 className="text-xl font-bold tracking-tighter text-cyan-500">CHATice</h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleTheme}
            className="p-2 text-[var(--txt3)] hover:text-[var(--txt)] transition-colors rounded-lg hover:bg-[var(--surface3)]"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={onLogout}
            className="p-2 text-[var(--txt3)] hover:text-[var(--txt)] transition-colors rounded-lg hover:bg-[var(--surface3)]"
            title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--txt3)] group-focus-within:text-cyan-600 transition-colors" />
          <input
            type="text" placeholder="Search users..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--surface4)] border border-[var(--border3)] rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-cyan-600 transition-colors placeholder-[var(--txt3)] text-[var(--txt)]"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-2 space-y-0.5">
          <h3 className="text-xs font-semibold text-[var(--txt3)] uppercase tracking-wider mb-2 px-2 mt-1">
            {searchQuery.trim() ? 'Search Results' : 'Recent Chats'}
          </h3>
          {isSearching ? (
            <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 text-[var(--txt3)] animate-spin" /></div>
          ) : displayList.length === 0 ? (
            <div className="p-4 text-center text-[var(--txt3)] text-sm">
              {searchQuery.trim() ? 'No users found' : 'No chats yet'}
            </div>
          ) : (
            displayList.map(u => {
              const chatId = [currentUser.id, u.id].sort().join('_');
              const isActive = activePartner?.id === u.id;
              const isOnline = onlineUserIds.includes(u.id);
              const unread = unreadCounts[u.id] ?? 0;
              const isPinned = pinnedConvoIds.has(chatId);
              const isHov = hoveredConvoId === u.id;

              return (
                <button
                  key={u.id}
                  onClick={() => onSelectPartner(u)}
                  onMouseEnter={() => setHoveredConvoId(u.id)}
                  onMouseLeave={() => setHoveredConvoId(null)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 text-left rounded-lg transition-colors',
                    isActive ? 'bg-[var(--surface4)] border-l-2 border-cyan-500' : 'hover:bg-[var(--surface3)] text-[var(--txt2)] hover:text-[var(--txt)]'
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <Avatar user={u} size="md" />
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[var(--surface2)] rounded-full shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className={cn('text-sm font-semibold truncate', isActive ? 'text-[var(--txt)]' : '')}>
                        @{u.username}
                      </h4>
                      {isPinned && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                    </div>
                    <div className="text-[10px] text-[var(--txt3)]">
                      {isOnline ? <span className="text-green-400">Online</span> : 'Offline'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Star/pin button — visible on hover */}
                    {(isHov || isPinned) && unread === 0 && (
                      <button
                        onClick={e => togglePinConvo(e, u)}
                        className={cn('w-6 h-6 rounded flex items-center justify-center transition-colors',
                          isPinned ? 'text-yellow-400 hover:text-yellow-300' : 'text-[var(--txt3)] hover:text-yellow-400'
                        )}
                        title={isPinned ? 'Unpin' : 'Pin conversation'}
                      >
                        <Star className={cn('w-3.5 h-3.5', isPinned ? 'fill-yellow-400' : '')} />
                      </button>
                    )}
                    {unread > 0 && (
                      <div className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                        {unread > 99 ? '99+' : unread}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 bg-[var(--surface)] border-t border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="relative group flex-shrink-0">
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <button onClick={() => avatarInputRef.current?.click()} className="relative block" title="Change avatar" disabled={uploadingAvatar}>
              <Avatar user={currentUser} size="md" isCurrentUser />
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
              </div>
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--txt)] truncate">@{currentUser.username}</div>
            <div className="text-[10px] text-[var(--txt3)] flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_4px_rgba(34,197,94,0.6)]" /> Online
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
