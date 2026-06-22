import React, { useState, useEffect, useRef } from 'react';
import { User, GroupChat } from '../types';
import { Search, LogOut, Loader2, Camera, Sun, Moon, Star, X, Smile, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';
import { useTheme } from '../context/ThemeContext';
import { EmojiPicker } from './EmojiPicker';
import { CreateGroupModal } from './CreateGroupModal';

interface SidebarProps {
  currentUser: User;
  activePartner: User | null;
  activeGroup: GroupChat | null;
  onSelectPartner: (user: User) => void;
  onSelectGroup: (group: GroupChat) => void;
  onLogout: () => void;
  onlineUserIds: string[];
  onAvatarUpdate: (url: string) => void;
  unreadCounts: Record<string, number>;
  isMobile: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  currentUser, activePartner, activeGroup, onSelectPartner, onSelectGroup, onLogout,
  onlineUserIds, onAvatarUpdate, unreadCounts,
  isMobile, mobileOpen, onMobileClose,
}: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [recentChats, setRecentChats] = useState<User[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pinnedConvoIds, setPinnedConvoIds] = useState<Set<string>>(new Set());
  const [hoveredConvoId, setHoveredConvoId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusEmoji, setStatusEmoji] = useState(currentUser.statusEmoji ?? '');
  const [statusText, setStatusText] = useState(currentUser.statusText ?? '');
  const [showStatusEmojiPicker, setShowStatusEmojiPicker] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const saveStatus = async () => {
    setEditingStatus(false);
    await supabase.from('users').update({ status_emoji: statusEmoji.trim(), status_text: statusText.trim() }).eq('id', currentUser.id);
  };

  const fetchRecentChats = async () => {
    const { data: convs } = await supabase
      .from('conversations').select('id, participants, updated_at')
      .contains('participants', [currentUser.id])
      .order('updated_at', { ascending: false });
    if (!convs?.length) return;

    // Preserve the conversation order (most recent first) while deduplicating
    const orderedPartnerIds: string[] = [];
    const seen = new Set<string>();
    for (const c of convs as { id: string; participants: string[]; updated_at: string }[]) {
      const pid = c.participants.find(id => id !== currentUser.id);
      if (pid && !seen.has(pid)) { orderedPartnerIds.push(pid); seen.add(pid); }
    }
    if (!orderedPartnerIds.length) return;

    const { data: users } = await supabase
      .from('users').select('id, username, display_name, avatar_url, status_emoji, status_text')
      .in('id', orderedPartnerIds.slice(0, 20));
    if (!users) return;

    // Re-sort fetched users back into conversation order (IN query doesn't preserve order)
    const userMap = new Map(users.map((u: any) => [u.id, u]));
    const sorted = orderedPartnerIds
      .filter(id => userMap.has(id))
      .map(id => {
        const u = userMap.get(id)!;
        return {
          id: u.id, username: u.username, displayName: u.display_name ?? undefined,
          avatarUrl: u.avatar_url ?? undefined, statusEmoji: u.status_emoji ?? undefined,
          statusText: u.status_text ?? undefined,
        };
      });
    setRecentChats(sorted);
  };

  const loadPinnedConvos = async () => {
    const { data } = await supabase
      .from('user_pinned_conversations').select('conversation_id').eq('user_id', currentUser.id);
    if (data) setPinnedConvoIds(new Set(data.map((r: any) => r.conversation_id)));
  };

  const fetchGroupChats = async () => {
    const { data } = await supabase.rpc('get_user_groups', { p_user_id: currentUser.id });
    if (data) {
      setGroupChats(data.map((g: any) => ({
        id: g.id,
        name: g.group_name ?? 'Unnamed Group',
        avatarUrl: g.group_avatar_url ?? undefined,
        participants: g.participants ?? [],
        updatedAt: g.updated_at,
        memberCount: g.member_count,
      })));
    }
  };

  useEffect(() => {
    fetchRecentChats();
    fetchGroupChats();
    loadPinnedConvos();
    const ch = supabase.channel('sidebar_convs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchRecentChats();
        fetchGroupChats();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentUser.id]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('users').select('id, username, display_name, avatar_url, status_emoji, status_text')
          .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`).neq('id', currentUser.id).limit(10);
        setSearchResults((data ?? []).map((u: any) => ({
          id: u.id, username: u.username, displayName: u.display_name ?? undefined,
          avatarUrl: u.avatar_url ?? undefined, statusEmoji: u.status_emoji ?? undefined, statusText: u.status_text ?? undefined,
        })));
      } finally { setIsSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, currentUser.id]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
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
      await supabase.from('user_pinned_conversations').delete().eq('user_id', currentUser.id).eq('conversation_id', chatId);
      setPinnedConvoIds(prev => { const s = new Set(prev); s.delete(chatId); return s; });
    } else {
      await supabase.from('user_pinned_conversations').insert({ user_id: currentUser.id, conversation_id: chatId });
      setPinnedConvoIds(prev => new Set([...prev, chatId]));
    }
  };

  const baseList = searchQuery.trim() ? searchResults : recentChats;
  const pinnedList = baseList.filter(u => pinnedConvoIds.has([currentUser.id, u.id].sort().join('_')));
  const unpinnedList = baseList.filter(u => !pinnedConvoIds.has([currentUser.id, u.id].sort().join('_')));
  const displayList = [...pinnedList, ...unpinnedList];

  const sidebarContent = (
    <div className={cn(
      'flex flex-col h-full bg-[var(--surface2)]',
      isMobile ? 'w-full' : 'w-72 border-r border-[var(--border)] shrink-0'
    )}>
      {/* Header */}
      <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Chatice logo" className="w-8 h-8 object-contain" />
          <h1 className="text-xl font-bold tracking-tighter text-cyan-500">CHATice</h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowCreateGroup(true)}
            className="p-2 text-[var(--txt3)] hover:text-cyan-400 hover:bg-[var(--surface3)] transition-colors rounded-lg"
            title="Create group chat">
            <Users className="w-4 h-4" />
          </button>
          <button onClick={toggleTheme}
            className="p-2 text-[var(--txt3)] hover:text-[var(--txt)] transition-colors rounded-lg hover:bg-[var(--surface3)]"
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={onLogout}
            className="p-2 text-[var(--txt3)] hover:text-[var(--txt)] transition-colors rounded-lg hover:bg-[var(--surface3)]"
            title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
          {/* Close drawer button — mobile only */}
          {isMobile && (
            <button onClick={onMobileClose}
              className="p-2 text-[var(--txt3)] hover:text-[var(--txt)] transition-colors rounded-lg hover:bg-[var(--surface3)]"
              title="Close menu">
              <X className="w-4 h-4" />
            </button>
          )}
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
          {/* Group Chats */}
          {!searchQuery.trim() && groupChats.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-[var(--txt3)] uppercase tracking-wider mb-2 px-2 mt-1">
                Groups
              </h3>
              {groupChats.map(group => {
                const isActive = activeGroup?.id === group.id;
                const unread = unreadCounts[group.id] ?? 0;
                return (
                  <button
                    key={group.id}
                    onClick={() => onSelectGroup(group)}
                    onMouseEnter={() => setHoveredConvoId(group.id)}
                    onMouseLeave={() => setHoveredConvoId(null)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 text-left rounded-lg transition-colors',
                      isActive
                        ? 'bg-[var(--surface4)] border-l-2 border-cyan-500'
                        : 'hover:bg-[var(--surface3)] text-[var(--txt2)] hover:text-[var(--txt)]'
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white flex-shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={cn('text-sm font-semibold truncate', isActive ? 'text-[var(--txt)]' : '')}>
                        {group.name}
                      </h4>
                      <div className="text-[10px] text-[var(--txt3)]">
                        {group.memberCount ?? group.participants.length} members
                      </div>
                    </div>
                    {unread > 0 && (
                      <div className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                        {unread > 99 ? '99+' : unread}
                      </div>
                    )}
                  </button>
                );
              })}
              <div className="h-3" />
            </>
          )}

          {/* Direct Messages */}
          <h3 className="text-xs font-semibold text-[var(--txt3)] uppercase tracking-wider mb-2 px-2">
            {searchQuery.trim() ? 'Search Results' : 'Chats'}
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
                    isActive
                      ? 'bg-[var(--surface4)] border-l-2 border-cyan-500'
                      : 'hover:bg-[var(--surface3)] text-[var(--txt2)] hover:text-[var(--txt)]'
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
                        {u.displayName || `@${u.username}`}
                      </h4>
                      {isPinned && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                    </div>
                    <div className="text-[10px] text-[var(--txt3)]">
                      {u.displayName && <span className="text-[var(--txt3)]">@{u.username} · </span>}
                      {isOnline ? <span className="text-green-400">Online</span> : 'Offline'}
                    </div>
                    {(u.statusEmoji || u.statusText) && (
                      <div className="text-[10px] text-[var(--txt3)] truncate mt-0.5">
                        {u.statusEmoji} {u.statusText}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
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
            <div className="text-xs font-semibold text-[var(--txt)] truncate">
              {currentUser.displayName || `@${currentUser.username}`}
            </div>
            {currentUser.displayName && (
              <div className="text-[10px] text-[var(--txt3)]">@{currentUser.username}</div>
            )}
            {editingStatus ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-1.5">
                  {/* Emoji picker button */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setShowStatusEmojiPicker(p => !p)}
                      className="w-8 h-8 bg-[var(--surface4)] border border-[var(--border2)] rounded-lg flex items-center justify-center hover:bg-[var(--surface3)] hover:border-[var(--border3)] transition-colors"
                      title="Pick emoji"
                    >
                      {statusEmoji
                        ? <span className="text-base leading-none">{statusEmoji}</span>
                        : <Smile className="w-4 h-4 text-[var(--txt3)]" />}
                    </button>
                    <AnimatePresence>
                      {showStatusEmojiPicker && (
                        <div className="absolute bottom-full mb-2 left-0 z-50">
                          <EmojiPicker
                            onSelect={emoji => { setStatusEmoji(emoji); setShowStatusEmojiPicker(false); }}
                            onClose={() => setShowStatusEmojiPicker(false)}
                          />
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                  <input
                    value={statusText}
                    onChange={e => setStatusText(e.target.value)}
                    placeholder="Set a status…"
                    onKeyDown={e => { if (e.key === 'Enter') saveStatus(); if (e.key === 'Escape') { setEditingStatus(false); setShowStatusEmojiPicker(false); } }}
                    className="flex-1 min-w-0 bg-[var(--surface4)] border border-[var(--border2)] rounded-lg px-2 py-1.5 text-xs text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-700 transition-colors"
                    maxLength={40}
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-between px-0.5">
                  <button onClick={() => { setStatusEmoji(''); setStatusText(''); }}
                    className="text-[10px] text-[var(--txt3)] hover:text-red-400 transition-colors">
                    Clear status
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingStatus(false); setShowStatusEmojiPicker(false); }}
                      className="text-[10px] text-[var(--txt3)] hover:text-[var(--txt2)] transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveStatus}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingStatus(true)}
                className="mt-1 w-full text-left flex items-center gap-1.5 group"
              >
                {(statusEmoji || statusText) ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    {statusEmoji && <span className="text-sm leading-none flex-shrink-0">{statusEmoji}</span>}
                    <span className="text-[11px] text-[var(--txt2)] truncate group-hover:text-[var(--txt)] transition-colors">
                      {statusText || <span className="italic text-[var(--txt3)]">Edit status</span>}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-[var(--txt3)] group-hover:text-[var(--txt2)] transition-colors flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0 shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
                    Online · <span className="underline underline-offset-2 decoration-dotted">set a status</span>
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Mobile: full-screen slide-in drawer with backdrop
  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={onMobileClose}
            />
            {/* Drawer */}
            <motion.div
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 z-50 w-[85vw] max-w-sm shadow-2xl"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Desktop: static sidebar
  return (
    <>
      {sidebarContent}
      <AnimatePresence>
        {showCreateGroup && (
          <CreateGroupModal
            currentUser={currentUser}
            onClose={() => setShowCreateGroup(false)}
            onGroupCreated={(groupId, groupName) => {
              setShowCreateGroup(false);
              fetchGroupChats();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
