import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Search, X, Forward, Check, Loader2, Users } from 'lucide-react';
import { User, Message, UserRow, ConversationRow } from '../types';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';
import { cn } from '../utils';

interface ForwardModalProps {
  message: Message;
  currentUser: User;
  excludeConversationId: string;
  onClose: () => void;
}

interface GroupTarget {
  id: string;
  name: string;
  avatarUrl?: string;
  memberCount: number;
}

export function ForwardModal({ message, currentUser, excludeConversationId, onClose }: ForwardModalProps) {
  const [query, setQuery] = useState('');
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [recentGroups, setRecentGroups] = useState<GroupTarget[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [forwarded, setForwarded] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 80);
    const load = async () => {
      const { data: convs } = await supabase
        .from('conversations').select('id, participants, is_group, name, avatar_url')
        .contains('participants', [currentUser.id])
        .order('updated_at', { ascending: false }).limit(20);
      if (!convs?.length) return;

      const rows = convs as ConversationRow[];
      const dmRows = rows.filter(c => !c.is_group && c.id !== excludeConversationId);
      const groupRows = rows.filter(c => c.is_group && c.id !== excludeConversationId);

      setRecentGroups(groupRows.slice(0, 10).map(g => ({
        id: g.id, name: g.name || 'Group chat', avatarUrl: g.avatar_url ?? undefined, memberCount: g.participants.length,
      })));

      const dmPartnerIds = dmRows.map(c => c.participants.find(id => id !== currentUser.id)).filter((id): id is string => !!id).slice(0, 10);
      if (dmPartnerIds.length) {
        const { data } = await supabase.from('users')
          .select('id, username, display_name, avatar_url').in('id', dmPartnerIds);
        if (data) setRecentUsers((data as UserRow[]).map(u => ({
          id: u.id, username: u.username, displayName: u.display_name ?? undefined, avatarUrl: u.avatar_url ?? undefined,
        })));
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from('users').select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', currentUser.id).limit(8);
      setSearchResults((data ?? []).map((u: UserRow) => ({
        id: u.id, username: u.username, displayName: u.display_name ?? undefined, avatarUrl: u.avatar_url ?? undefined,
      })));
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const sendForward = async (conversationId: string) => {
    const content = message.messageType !== 'text'
      ? (message.content || `${message.messageType} message`)
      : message.content;
    await supabase.from('messages').insert({
      conversation_id: conversationId, sender_id: currentUser.id,
      content, message_type: message.messageType,
      image_url: message.mediaUrl ?? null,
      created_at: new Date().toISOString(),
    });
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  };

  const handleForwardToUser = async (recipient: User) => {
    if (forwarding || forwarded) return;
    setForwarding(recipient.id);
    try {
      const chatId = [currentUser.id, recipient.id].sort().join('_');
      const { data: existing } = await supabase.from('conversations').select('id').eq('id', chatId).maybeSingle();
      if (!existing) {
        await supabase.from('conversations').insert({
          id: chatId, participants: [currentUser.id, recipient.id],
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
      }
      await sendForward(chatId);
      setForwarded(recipient.id);
      setTimeout(onClose, 900);
    } catch (err) {
      console.error('Forward failed:', err);
    } finally {
      setForwarding(null);
    }
  };

  const handleForwardToGroup = async (group: GroupTarget) => {
    if (forwarding || forwarded) return;
    setForwarding(group.id);
    try {
      await sendForward(group.id);
      setForwarded(group.id);
      setTimeout(onClose, 900);
    } catch (err) {
      console.error('Forward to group failed:', err);
    } finally {
      setForwarding(null);
    }
  };

  const isSearching = query.trim().length > 0;
  const filteredGroups = isSearching
    ? recentGroups.filter(g => g.name.toLowerCase().includes(query.trim().toLowerCase()))
    : recentGroups;
  const previewText = message.messageType !== 'text'
    ? (message.messageType === 'image' ? '📷 Image' : message.messageType === 'audio' ? '🎤 Voice' : '🎥 Video')
    : (message.content.length > 60 ? message.content.slice(0, 60) + '…' : message.content);

  const nothingToShow = isSearching
    ? (filteredGroups.length === 0 && searchResults.length === 0 && !searching)
    : (filteredGroups.length === 0 && recentUsers.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-[var(--surface2)] border border-[var(--border2)] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Forward className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-[var(--txt)]">Forward message</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--txt3)] hover:text-[var(--txt)] hover:bg-[var(--surface4)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message preview */}
        <div className="mx-5 mb-3 px-3 py-2 rounded-xl bg-[var(--surface4)] border border-[var(--border)] text-xs text-[var(--txt2)] truncate">
          {previewText}
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--txt3)]" />
            <input ref={searchRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search chats or people…"
              className="w-full bg-[var(--surface4)] border border-[var(--border2)] rounded-xl py-2 pl-8 pr-3 text-sm text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-700 transition-colors" />
          </div>
        </div>

        {/* List */}
        <div className="max-h-72 overflow-y-auto pb-3">
          {nothingToShow ? (
            <div className="text-center py-8 text-sm text-[var(--txt3)]">
              {isSearching ? 'No users found' : 'No chats to forward to yet'}
            </div>
          ) : (
            <>
              {filteredGroups.length > 0 && (
                <>
                  <div className="px-5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--txt3)]">Groups</div>
                  {filteredGroups.map(g => {
                    const done = forwarded === g.id;
                    const busy = forwarding === g.id;
                    const avatarUser = { id: g.id, username: g.name, avatarUrl: g.avatarUrl } as User;
                    return (
                      <button key={g.id} onClick={() => handleForwardToGroup(g)}
                        disabled={!!forwarding || !!forwarded}
                        className={cn('w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--surface3)] transition-colors text-left', done ? 'opacity-60' : '')}>
                        <Avatar user={avatarUser} size="md" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--txt)] truncate">{g.name}</div>
                          <div className="text-xs text-[var(--txt3)] flex items-center gap-1"><Users className="w-3 h-3" /> {g.memberCount} members</div>
                        </div>
                        <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center">
                          {done ? <Check className="w-4 h-4 text-green-400" />
                            : busy ? <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                            : <Forward className="w-4 h-4 text-[var(--txt3)]" />}
                        </div>
                      </button>
                    );
                  })}
                </>
              )}

              <div className="px-5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--txt3)]">
                {isSearching ? 'People' : 'Recent Chats'}
              </div>
              {searching ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[var(--txt3)] animate-spin" /></div>
              ) : (isSearching ? searchResults : recentUsers).map(u => {
                const done = forwarded === u.id;
                const busy = forwarding === u.id;
                return (
                  <button key={u.id} onClick={() => handleForwardToUser(u)}
                    disabled={!!forwarding || !!forwarded}
                    className={cn('w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--surface3)] transition-colors text-left', done ? 'opacity-60' : '')}>
                    <Avatar user={u} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--txt)] truncate">{u.displayName || `@${u.username}`}</div>
                      {u.displayName && <div className="text-xs text-[var(--txt3)]">@{u.username}</div>}
                    </div>
                    <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center">
                      {done ? <Check className="w-4 h-4 text-green-400" />
                        : busy ? <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                        : <Forward className="w-4 h-4 text-[var(--txt3)]" />}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
