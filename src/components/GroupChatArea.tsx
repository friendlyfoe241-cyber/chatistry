import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GroupChat, Message, GroupMember } from '../types';
import {
  Send, Paperclip, X, Smile, Mic, ArrowLeft, Users, Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';
import { EmojiPicker } from './EmojiPicker';
import { GroupMembersPanel } from './GroupMembersPanel';

const PAGE_SIZE = 50;

interface GroupChatAreaProps {
  currentUser: { id: string; username: string; displayName?: string; avatarUrl?: string };
  group: GroupChat;
  onBackToSidebar?: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800000) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function GroupChatArea({ currentUser, group, onBackToSidebar }: GroupChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const chatId = group.id;
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasMoreRef = useRef(false);
  const oldestTimestampRef = useRef<string | null>(null);

  // Load messages
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    loadMessages();
    loadMembers();

    // Subscribe to new messages
    const channel = supabase.channel(`group-messages:${chatId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${chatId}` },
        ({ new: msg }: any) => {
          const newMsg: Message = {
            id: msg.id,
            senderId: msg.sender_id,
            receiverId: '',
            content: msg.content ?? '',
            timestamp: msg.created_at,
            messageType: msg.message_type ?? 'text',
            mediaUrl: msg.image_url ?? undefined,
            isEdited: msg.is_edited ?? false,
          };
          setMessages(prev => [...prev, newMsg]);
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  const loadMessages = async () => {
    const { data } = await supabase.from('messages').select('*')
      .eq('conversation_id', chatId)
      .order('created_at', { ascending: false }).limit(PAGE_SIZE);
    if (data) {
      const msgs = data.reverse().map((m: any) => ({
        id: m.id,
        senderId: m.sender_id,
        receiverId: '',
        content: m.content ?? '',
        timestamp: m.created_at,
        messageType: m.message_type ?? 'text',
        mediaUrl: m.image_url ?? undefined,
        isEdited: m.is_edited ?? false,
      }));
      setMessages(msgs);
      hasMoreRef.current = data.length === PAGE_SIZE;
      setHasMore(data.length === PAGE_SIZE);
      if (msgs.length > 0) oldestTimestampRef.current = msgs[0].timestamp;
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
    }
    setLoading(false);
  };

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !oldestTimestampRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const { data } = await supabase.from('messages').select('*')
      .eq('conversation_id', chatId)
      .lt('created_at', oldestTimestampRef.current)
      .order('created_at', { ascending: false }).limit(PAGE_SIZE);
    if (data && data.length > 0) {
      const older = data.reverse().map((m: any) => ({
        id: m.id,
        senderId: m.sender_id,
        receiverId: '',
        content: m.content ?? '',
        timestamp: m.created_at,
        messageType: m.message_type ?? 'text',
        mediaUrl: m.image_url ?? undefined,
        isEdited: m.is_edited ?? false,
      }));
      setMessages(prev => [...older, ...prev]);
      hasMoreRef.current = data.length === PAGE_SIZE;
      setHasMore(data.length === PAGE_SIZE);
      if (older.length > 0) oldestTimestampRef.current = older[0].timestamp;
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [chatId]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el && el.scrollTop < 80) loadMore();
  }, [loadMore]);

  const loadMembers = async () => {
    const { data } = await supabase.rpc('get_group_members', { p_conversation_id: chatId });
    if (data) {
      setMembers(data.map((m: any) => ({
        userId: m.user_id,
        username: m.username,
        displayName: m.display_name ?? undefined,
        avatarUrl: m.avatar_url ?? undefined,
        role: m.role,
        joinedAt: m.joined_at,
      })));
      const currentMember = data.find((m: any) => m.user_id === currentUser.id);
      setIsAdmin(currentMember?.role === 'admin');
    }
  };

  const insertEmoji = (emoji: string) => {
    setInput(prev => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const trimmed = text.trim();
    setInput('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }

    await supabase.from('messages').insert({
      conversation_id: chatId,
      sender_id: currentUser.id,
      content: trimmed,
      message_type: 'text',
    });
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', chatId);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const getSenderName = (senderId: string): string => {
    if (senderId === currentUser.id) return 'You';
    const member = members.find(m => m.userId === senderId);
    return member?.displayName || member?.username || 'Unknown';
  };

  const getSenderAvatar = (senderId: string) => {
    if (senderId === currentUser.id) return currentUser;
    return members.find(m => m.userId === senderId);
  };

  // Group messages by sender for consecutive messages
  const groupedMessages = messages.reduce((groups: { senderId: string; messages: Message[] }[], msg) => {
    const last = groups[groups.length - 1];
    if (last && last.senderId === msg.senderId) {
      last.messages.push(msg);
    } else {
      groups.push({ senderId: msg.senderId, messages: [msg] });
    }
    return groups;
  }, []);

  return (
    <div className="flex flex-col flex-1 bg-[var(--bg)] min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-[var(--surface)] border-b border-[var(--border)] shrink-0">
        {onBackToSidebar && (
          <button onClick={onBackToSidebar}
            className="w-9 h-9 rounded-full hover:bg-[var(--surface3)] flex items-center justify-center text-[var(--txt3)] hover:text-[var(--txt)] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white flex-shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-[var(--txt)] truncate">{group.name}</h2>
          <button onClick={() => setShowMembers(true)}
            className="text-xs text-[var(--txt3)] hover:text-cyan-400 transition-colors">
            {members.length} members
          </button>
        </div>
        <button onClick={() => setShowMembers(true)}
          className="w-9 h-9 rounded-full hover:bg-[var(--surface3)] flex items-center justify-center text-[var(--txt3)] hover:text-[var(--txt)] transition-colors">
          <Users className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        onScroll={handleScroll}>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-[var(--txt3)] animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-[var(--txt3)]">
            <Users className="w-12 h-12 mb-3 opacity-50" />
            <p>No messages yet</p>
            <p className="text-sm">Start the conversation!</p>
          </div>
        ) : (
          <>
            {loadingMore && (
              <div className="flex justify-center py-2">
                <Loader2 className="w-4 h-4 text-[var(--txt3)] animate-spin" />
              </div>
            )}
            {groupedMessages.map((group, idx) => {
              const sender = getSenderAvatar(group.senderId);
              const senderName = getSenderName(group.senderId);
              const isCurrentUser = group.senderId === currentUser.id;
              const showAvatar = idx === 0 || groupedMessages[idx - 1]?.senderId !== group.senderId;

              return (
                <div key={group.messages[0].id} className="space-y-1.5">
                  {showAvatar && (
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar user={sender as any} size="sm" />
                      <span className="text-sm font-medium text-[var(--txt)]">{senderName}</span>
                      <span className="text-xs text-[var(--txt3)]">{formatTime(group.messages[0].timestamp)}</span>
                    </div>
                  )}
                  {group.messages.map((msg, msgIdx) => (
                    <div key={msg.id} className={cn('flex', !isCurrentUser && 'ml-8')}>
                      <div className={cn(
                        'max-w-[70%] px-4 py-2 rounded-2xl text-sm',
                        isCurrentUser
                          ? 'bg-cyan-600 text-white rounded-br-md ml-auto'
                          : 'bg-[var(--surface3)] text-[var(--txt)] rounded-bl-md'
                      )}>
                        {msg.messageType === 'text' ? msg.content : `[${msg.messageType}]`}
                        {msg.isEdited && <span className="ml-1 text-[10px] opacity-60">(edited)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            <div ref={endRef} />
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="p-3 md:p-5 bg-[var(--surface)] border-t border-[var(--border)] shrink-0">
        <div className="flex items-end gap-3">
          {/* Emoji */}
          <div className="relative flex-shrink-0 mb-0.5">
            <button type="button" onClick={() => setShowEmojiPicker(p => !p)}
              className={cn('w-10 h-10 rounded-full bg-[var(--surface3)] border flex items-center justify-center transition-colors',
                showEmojiPicker ? 'border-cyan-700 text-cyan-400' : 'border-[var(--border)] text-[var(--txt3)] hover:text-cyan-400 hover:border-cyan-800')}>
              <Smile className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {showEmojiPicker && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmojiPicker(false)} />}
            </AnimatePresence>
          </div>

          {/* Input */}
          <form onSubmit={handleSendText} className="flex-1 flex items-end gap-3">
            <div className="flex-1 flex items-end bg-[var(--input-bg)] border border-[var(--border)] rounded-2xl px-4 py-2.5 focus-within:border-cyan-700 transition-colors">
              <textarea ref={textareaRef} value={input} onChange={handleInputChange}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(e as any); } }}
                placeholder="Type a message…"
                className="flex-1 bg-transparent outline-none text-sm placeholder-[var(--txt3)] text-[var(--txt)] resize-none max-h-32 min-h-[20px] block w-full"
                rows={1} />
            </div>
            <button type="submit" disabled={!input.trim()}
              className="w-10 h-10 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-600/50 disabled:cursor-not-allowed rounded-full flex items-center justify-center text-white shadow-[0_0_15px_rgba(8,145,178,0.15)] flex-shrink-0 transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </footer>

      {/* Members Panel */}
      <AnimatePresence>
        {showMembers && (
          <GroupMembersPanel
            conversationId={chatId}
            currentUserId={currentUser.id}
            isAdmin={isAdmin}
            onClose={() => setShowMembers(false)}
            onMembersChanged={loadMembers}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
