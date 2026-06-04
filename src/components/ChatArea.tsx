import React, { useState, useEffect, useRef } from 'react';
import { User, Message } from '../types';
import { Send, MessageSquareDashed } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../utils';
import { supabase } from '../supabase';

interface ChatAreaProps {
  currentUser: User;
  partner: User | null;
}

export function ChatArea({ currentUser, partner }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!partner) return;
    
    setLoading(true);
    const chatId = [currentUser.id, partner.id].sort().join('_');
    
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', chatId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (data) {
        setMessages(data.map(m => ({
          id: m.id,
          senderId: m.sender_id,
          receiverId: m.sender_id === currentUser.id ? partner.id : currentUser.id,
          content: m.content,
          timestamp: m.created_at
        })));
      }
      setLoading(false);
      scrollToBottom();
    };

    fetchMessages();

    // Listen to new messages
    const messageChannel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${chatId}` },
        (payload) => {
          const m = payload.new;
          setMessages(prev => {
            const hasDuplicate = prev.some(msg => msg.id === m.id);
            if (hasDuplicate) return prev;
            return [...prev, {
              id: m.id,
              senderId: m.sender_id,
              receiverId: m.sender_id === currentUser.id ? partner.id : currentUser.id,
              content: m.content,
              timestamp: m.created_at
            }];
          });
        }
      )
      .subscribe();

    // Listen to partner's typing status
    const typingChannel = supabase
      .channel('typing_status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${partner.id}` },
        (payload) => {
          const u = payload.new;
          setIsTyping(u.is_typing_to === currentUser.id);
          if (u.is_typing_to === currentUser.id) {
            scrollToBottom();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(typingChannel);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [partner, currentUser.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const setTypingStatus = async (typingTo: string | null) => {
    await supabase
      .from('users')
      .update({ is_typing_to: typingTo, updated_at: new Date().toISOString() })
      .eq('id', currentUser.id);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    if (partner) {
      setTypingStatus(partner.id);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        setTypingStatus(null);
      }, 1500);
    }
  };

  const ensureConversation = async (chatId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', chatId)
      .single();

    if (!data) {
      await supabase
        .from('conversations')
        .insert({
          id: chatId,
          participants: [currentUser.id, partner!.id],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !partner) return;
    
    const text = input.trim();
    setInput('');
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setTypingStatus(null);

    const chatId = [currentUser.id, partner.id].sort().join('_');
    await ensureConversation(chatId);

    const { data } = await supabase
      .from('messages')
      .insert({
        conversation_id: chatId,
        sender_id: currentUser.id,
        content: text,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (data) {
      // Optimistic update
      setMessages(prev => {
        const hasDuplicate = prev.some(msg => msg.id === data.id);
        if (hasDuplicate) return prev;
        return [...prev, {
          id: data.id,
          senderId: data.sender_id,
          receiverId: partner.id,
          content: data.content,
          timestamp: data.created_at
        }];
      });
    }

    // Update recent conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', chatId);
  };

  if (!partner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#080808] text-[#555]">
        <MessageSquareDashed className="w-16 h-16 mb-4 opacity-50" />
        <h2 className="text-xl font-medium text-[#E0E0E0]">No chat selected</h2>
        <p className="text-sm mt-2">Search for a user or select an existing chat to start messaging.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#080808] max-h-screen text-[#E0E0E0]">
      {/* Header */}
      <div className="h-16 border-b border-[#2A2A2A] bg-[#0E0E0E] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="text-lg font-semibold">@{partner.username}</div>
          <div className="px-2 py-0.5 rounded bg-cyan-900/20 border border-cyan-800/40 text-[10px] text-cyan-400 font-mono">SUPABASE_SYNCED</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 relative">
        {loading ? (
          <div className="flex justify-center py-4">
             <div className="w-6 h-6 border-2 border-[#333] border-t-cyan-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center opacity-30 pointer-events-none mb-4 mt-10">
            <p className="mt-8 text-[#888]">Say hello to @{partner.username}!</p>
          </div>
        ) : (
          <div className="flex flex-col space-y-4">
             {messages.map((msg, i) => {
               const isMe = msg.senderId === currentUser.id;
               const prevMsg = messages[i - 1];
               const showAvatar = !isMe && (!prevMsg || prevMsg.senderId !== msg.senderId);

               return (
                 <motion.div 
                   initial={{ opacity: 0, y: 10, scale: 0.95 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   key={msg.id} 
                   className={cn(
                     "flex max-w-[60%]",
                     isMe ? "self-end flex-row-reverse" : "self-start",
                     showAvatar ? "mt-4" : ""
                   )}
                 >
                   {!isMe ? (
                     showAvatar ? (
                       <div className="w-8 h-8 rounded bg-[#1A1A1A] flex-shrink-0 flex items-center justify-center text-[10px] font-bold border border-[#2A2A2A] text-[#E0E0E0] mr-3">
                         {partner.username.substring(0, 2).toUpperCase()}
                       </div>
                     ) : (
                       <div className="w-8 h-8 flex-shrink-0 mr-3" />
                     )
                   ) : (
                     <div className="w-8 h-8 rounded bg-cyan-900 flex-shrink-0 flex items-center justify-center text-[10px] font-bold border border-cyan-800 text-cyan-50 ml-3">
                       {currentUser.username.substring(0, 2).toUpperCase()}
                     </div>
                   )}
                   <div className="w-full space-y-1">
                     <div 
                       className={cn(
                         "p-3 text-sm leading-relaxed whitespace-pre-wrap break-words min-w-0 max-w-full",
                         isMe 
                            ? "bg-cyan-950/40 border border-cyan-900/60 rounded-tl-xl rounded-bl-xl rounded-br-xl text-cyan-50" 
                            : "bg-[#181818] border border-[#222] rounded-tr-xl rounded-br-xl rounded-bl-xl text-[#E0E0E0]"
                       )}
                     >
                       {msg.content}
                     </div>
                     <div className={cn("text-[10px] text-[#555] px-1 italic", isMe ? "text-right" : "")}>
                       {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                     </div>
                   </div>
                 </motion.div>
               );
             })}
             {isTyping && (
               <motion.div 
                 initial={{ opacity: 0, y: 10, scale: 0.95 }}
                 animate={{ opacity: 1, y: 0, scale: 1 }}
                 className="flex max-w-[60%] self-start mt-4"
               >
                 <div className="w-8 h-8 rounded bg-[#1A1A1A] flex-shrink-0 flex items-center justify-center text-[10px] font-bold border border-[#2A2A2A] text-[#E0E0E0] mr-3">
                   {partner.username.substring(0, 2).toUpperCase()}
                 </div>
                 <div className="w-full space-y-1">
                   <div className="p-3.5 flex gap-1.5 w-fit bg-[#181818] border border-[#222] rounded-tr-xl rounded-br-xl rounded-bl-xl items-center">
                     <div className="w-1.5 h-1.5 bg-cyan-500/80 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                     <div className="w-1.5 h-1.5 bg-cyan-500/80 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                     <div className="w-1.5 h-1.5 bg-cyan-500/80 rounded-full animate-bounce"></div>
                   </div>
                 </div>
               </motion.div>
             )}
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* Input Box */}
      <footer className="p-6 bg-[#0E0E0E] border-t border-[#2A2A2A] shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-4">
          <div className="flex-1 flex items-center bg-[#181818] border border-[#2A2A2A] rounded-full px-5 py-2.5 focus-within:border-cyan-600 transition-all">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Type a message..."
              className="flex-1 bg-transparent border-none outline-none text-sm placeholder-[#555] text-[#EEE] max-h-32 min-h-[20px] resize-none overflow-hidden block w-full"
              rows={1}
            />
          </div>
          <button 
            type="submit"
            disabled={!input.trim()}
            className="w-11 h-11 bg-cyan-600 hover:bg-cyan-500 rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(8,145,178,0.2)] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </footer>
    </div>
  );
}
