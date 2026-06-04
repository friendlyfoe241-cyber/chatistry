import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Message } from '../types';
import { Send, MessageSquareDashed, ImageIcon, X, Pencil, Trash2, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';

interface ChatAreaProps {
  currentUser: User;
  partner: User | null;
}

// Parse URLs in text and return mixed text/anchor nodes
function renderTextWithLinks(text: string): React.ReactNode[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^\[\]`]+/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = urlRegex.exec(text)) !== null) {
    if (m.index > last) nodes.push(<span key={last}>{text.slice(last, m.index)}</span>);
    nodes.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer"
        className="text-cyan-400 underline decoration-dotted underline-offset-2 hover:text-cyan-300 break-all"
        onClick={e => e.stopPropagation()}>
        {m[0]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<span key={last}>{text.slice(last)}</span>);
  return nodes;
}

function mapRow(m: any, currentUserId: string, partnerId: string): Message {
  return {
    id: m.id,
    senderId: m.sender_id,
    receiverId: m.sender_id === currentUserId ? partnerId : currentUserId,
    content: m.content ?? '',
    timestamp: m.created_at,
    messageType: m.message_type ?? 'text',
    imageUrl: m.image_url ?? undefined,
    isEdited: m.is_edited ?? false,
    originalContent: m.original_content ?? undefined,
  };
}

export function ChatArea({ currentUser, partner }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Image sending
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Expanded originals (for edited messages)
  const [expandedOriginals, setExpandedOriginals] = useState<Set<string>>(new Set());

  // Hover state
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!partner) return;
    setLoading(true);
    setMessages([]);
    setIsTyping(false);
    setEditingId(null);
    setExpandedOriginals(new Set());

    const chatId = [currentUser.id, partner.id].sort().join('_');

    // Fetch history
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', chatId)
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        if (data) setMessages(data.map(m => mapRow(m, currentUser.id, partner.id)));
        setLoading(false);
        setTimeout(scrollToBottom, 50);
      });

    // Realtime: INSERT, UPDATE, DELETE
    const msgChannel = supabase
      .channel(`messages:${chatId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${chatId}` },
        ({ new: m }) => {
          setMessages(prev => {
            if (prev.some(x => x.id === m.id)) return prev;
            return [...prev, mapRow(m, currentUser.id, partner.id)];
          });
          setTimeout(scrollToBottom, 50);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${chatId}` },
        ({ new: m }) => {
          setMessages(prev => prev.map(x => x.id === m.id ? mapRow(m, currentUser.id, partner.id) : x));
        }
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${chatId}` },
        ({ old: m }) => {
          setMessages(prev => prev.filter(x => x.id !== m.id));
        }
      )
      .subscribe();

    // Typing via Broadcast
    const typingChannel = supabase
      .channel(`typing:${chatId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === partner.id) {
          setIsTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
        }
      })
      .subscribe();

    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [partner, currentUser.id, scrollToBottom]);

  useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (partner && typingChannelRef.current) {
      typingChannelRef.current.send({
        type: 'broadcast', event: 'typing', payload: { userId: currentUser.id },
      });
    }
  };

  const ensureConversation = async (chatId: string) => {
    const { data } = await supabase.from('conversations').select('id').eq('id', chatId).single();
    if (!data) {
      await supabase.from('conversations').insert({
        id: chatId, participants: [currentUser.id, partner!.id],
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
    }
  };

  const bumpConversation = async (chatId: string) =>
    supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', chatId);

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !partner || uploading) return;
    const text = input.trim();
    setInput('');
    const chatId = [currentUser.id, partner.id].sort().join('_');
    await ensureConversation(chatId);
    await supabase.from('messages').insert({
      conversation_id: chatId, sender_id: currentUser.id,
      content: text, message_type: 'text', created_at: new Date().toISOString(),
    });
    await bumpConversation(chatId);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('Image must be under 8MB'); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSendImage = async () => {
    if (!imageFile || !partner || uploading) return;
    setUploading(true);
    try {
      const chatId = [currentUser.id, partner.id].sort().join('_');
      await ensureConversation(chatId);
      const ext = imageFile.name.split('.').pop();
      const path = `${chatId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('chat-images').upload(path, imageFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path);
      await supabase.from('messages').insert({
        conversation_id: chatId, sender_id: currentUser.id,
        content: imageFile.name, message_type: 'image', image_url: publicUrl,
        created_at: new Date().toISOString(),
      });
      await bumpConversation(chatId);
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Image send failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const cancelImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const cancelEdit = () => { setEditingId(null); setEditContent(''); };

  const saveEdit = async (msg: Message) => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === msg.content) { cancelEdit(); return; }
    await supabase.from('messages').update({
      content: trimmed,
      is_edited: true,
      original_content: msg.isEdited ? msg.originalContent : msg.content,
    }).eq('id', msg.id);
    cancelEdit();
  };

  const handleDelete = async (msgId: string) => {
    await supabase.from('messages').delete().eq('id', msgId);
  };

  const toggleOriginal = (msgId: string) => {
    setExpandedOriginals(prev => {
      const next = new Set(prev);
      next.has(msgId) ? next.delete(msgId) : next.add(msgId);
      return next;
    });
  };

  if (!partner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#080808] text-[#555]">
        <MessageSquareDashed className="w-16 h-16 mb-4 opacity-30" />
        <h2 className="text-xl font-medium text-[#E0E0E0]">No chat selected</h2>
        <p className="text-sm mt-2">Search for a user or pick a recent chat.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#080808] max-h-screen text-[#E0E0E0]">
      {/* Header */}
      <div className="h-16 border-b border-[#2A2A2A] bg-[#0E0E0E] px-6 flex items-center gap-3 shrink-0">
        <Avatar user={partner} size="md" />
        <div>
          <div className="font-semibold">@{partner.username}</div>
        </div>
        <div className="ml-2 px-2 py-0.5 rounded bg-cyan-900/20 border border-cyan-800/40 text-[10px] text-cyan-400 font-mono">LIVE</div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#333] border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center opacity-30 mt-20">
            <p className="text-[#888]">Say hello to @{partner.username}!</p>
          </div>
        ) : (
          <div className="flex flex-col space-y-1">
            {messages.map((msg, i) => {
              const isMe = msg.senderId === currentUser.id;
              const prevMsg = messages[i - 1];
              const grouped = prevMsg && prevMsg.senderId === msg.senderId;
              const isHovered = hoveredId === msg.id;
              const isEditing = editingId === msg.id;
              const originalExpanded = expandedOriginals.has(msg.id);

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'flex items-end gap-2 group',
                    isMe ? 'flex-row-reverse' : 'flex-row',
                    grouped ? 'mt-0.5' : 'mt-4'
                  )}
                  onMouseEnter={() => setHoveredId(msg.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Avatar */}
                  <div className="flex-shrink-0 self-end mb-1">
                    {grouped
                      ? <div className="w-9 h-9" />
                      : <Avatar user={isMe ? currentUser : partner} size="md" isCurrentUser={isMe} />
                    }
                  </div>

                  {/* Bubble + actions */}
                  <div className={cn('flex flex-col max-w-[55%]', isMe ? 'items-end' : 'items-start')}>
                    {isEditing ? (
                      // Edit mode
                      <div className="w-full bg-[#1A1A1A] border border-cyan-700/50 rounded-xl p-3 space-y-2">
                        <textarea
                          ref={editInputRef}
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg); }
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="w-full bg-transparent text-sm text-[#EEE] resize-none outline-none min-h-[40px]"
                          rows={2}
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={cancelEdit} className="text-[10px] text-[#666] hover:text-[#aaa] transition-colors">Cancel</button>
                          <button onClick={() => saveEdit(msg)} className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
                            <Check className="w-3 h-3" /> Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Message bubble */}
                        <div className={cn(
                          'relative px-4 py-2.5 text-sm leading-relaxed break-words max-w-full',
                          isMe
                            ? 'bg-cyan-950/40 border border-cyan-900/60 text-cyan-50 rounded-tl-2xl rounded-bl-2xl rounded-br-2xl'
                            : 'bg-[#181818] border border-[#252525] text-[#E0E0E0] rounded-tr-2xl rounded-br-2xl rounded-bl-2xl',
                          grouped && isMe ? 'rounded-tr-md' : '',
                          grouped && !isMe ? 'rounded-tl-md' : '',
                        )}>
                          {msg.messageType === 'image' ? (
                            <img
                              src={msg.imageUrl}
                              alt="sent image"
                              className="max-w-[280px] max-h-[320px] rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setLightboxUrl(msg.imageUrl!)}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap">{renderTextWithLinks(msg.content)}</p>
                          )}
                        </div>

                        {/* Edited indicator */}
                        {msg.isEdited && (
                          <button
                            onClick={() => toggleOriginal(msg.id)}
                            className="flex items-center gap-1 mt-0.5 text-[10px] text-[#555] hover:text-[#888] transition-colors"
                          >
                            <span className="italic">edited</span>
                            <ChevronDown className={cn('w-2.5 h-2.5 transition-transform', originalExpanded ? 'rotate-180' : '')} />
                          </button>
                        )}

                        {/* Original content */}
                        <AnimatePresence>
                          {msg.isEdited && originalExpanded && msg.originalContent && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-1 px-3 py-2 rounded-lg border border-[#2A2A2A] bg-[#111] text-[11px] text-[#555] italic max-w-full break-words">
                                <span className="text-[#444] not-italic font-medium">Original: </span>
                                {msg.originalContent}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Timestamp */}
                        <div className={cn('text-[10px] text-[#444] px-1 mt-0.5', isMe ? 'text-right' : '')}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Hover action buttons (own messages only) */}
                  {isMe && !isEditing && (
                    <div className={cn(
                      'flex items-center gap-1 self-center transition-opacity duration-100',
                      isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    )}>
                      {msg.messageType === 'text' && (
                        <button
                          onClick={() => startEdit(msg)}
                          className="w-7 h-7 rounded-md bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#666] hover:text-cyan-400 hover:border-cyan-800 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="w-7 h-7 rounded-md bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[#666] hover:text-red-400 hover:border-red-900 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Typing indicator */}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-end gap-2 mt-4"
              >
                <Avatar user={partner} size="md" />
                <div className="px-4 py-3 bg-[#181818] border border-[#252525] rounded-tr-2xl rounded-br-2xl rounded-bl-2xl flex gap-1.5 items-center">
                  <div className="w-1.5 h-1.5 bg-cyan-500/70 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-cyan-500/70 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-cyan-500/70 rounded-full animate-bounce" />
                </div>
              </motion.div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Image preview above input */}
      <AnimatePresence>
        {imagePreview && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="px-6 pt-4 bg-[#0E0E0E] border-t border-[#2A2A2A]"
          >
            <div className="relative inline-block">
              <img src={imagePreview} alt="preview" className="h-24 rounded-lg object-cover border border-[#333]" />
              <button
                onClick={cancelImage}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[#333] border border-[#444] flex items-center justify-center text-[#aaa] hover:text-white hover:bg-[#444] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <footer className="p-5 bg-[#0E0E0E] border-t border-[#2A2A2A] shrink-0">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
        <div className="flex items-end gap-3">
          {/* Image button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-full bg-[#181818] border border-[#2A2A2A] flex items-center justify-center text-[#555] hover:text-cyan-400 hover:border-cyan-800 transition-colors flex-shrink-0 mb-0.5"
            title="Send image"
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          {imagePreview ? (
            // Send image button
            <button
              type="button"
              onClick={handleSendImage}
              disabled={uploading}
              className="flex-1 h-10 rounded-full bg-cyan-600 hover:bg-cyan-500 text-black text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {uploading ? (
                <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Uploading…</>
              ) : (
                <><Send className="w-4 h-4" /> Send Image</>
              )}
            </button>
          ) : (
            // Text input
            <form onSubmit={handleSendText} className="flex-1 flex items-end gap-3">
              <div className="flex-1 flex items-end bg-[#181818] border border-[#2A2A2A] rounded-2xl px-4 py-2.5 focus-within:border-cyan-700 transition-colors">
                <textarea
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(e as any); }
                  }}
                  placeholder="Type a message…"
                  className="flex-1 bg-transparent outline-none text-sm placeholder-[#555] text-[#EEE] resize-none max-h-32 min-h-[20px] block w-full"
                  rows={1}
                />
              </div>
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-10 h-10 bg-cyan-600 hover:bg-cyan-500 rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(8,145,178,0.15)] disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </footer>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8"
            onClick={() => setLightboxUrl(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              src={lightboxUrl}
              alt="full image"
              className="max-w-full max-h-full rounded-lg object-contain"
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-[#222] border border-[#333] flex items-center justify-center text-[#aaa] hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
