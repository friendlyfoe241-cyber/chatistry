import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ImageIcon } from 'lucide-react';
import { Avatar } from './Avatar';
import { User } from '../types';

export interface NotificationItem {
  id: string;
  conversationId: string;
  senderId: string;
  isGroup: boolean;
  title: string;            // sender's name for a DM, group name for a group
  avatarUrl?: string;       // sender's avatar for a DM, group avatar for a group
  avatarFallback: string;   // text used for initials when no avatarUrl
  senderName?: string;      // shown as a prefix in group notifications, e.g. "Sam: "
  message: string;
  messageType: 'text' | 'image' | 'video' | 'audio';
}

function ProgressBar() {
  const [width, setWidth] = useState(100);
  useEffect(() => {
    const t = setTimeout(() => setWidth(0), 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="h-0.5 bg-[#252525]">
      <div
        className="h-full bg-cyan-500/60 transition-[width] ease-linear"
        style={{ width: `${width}%`, transitionDuration: '5000ms' }}
      />
    </div>
  );
}

function Toast({
  item, onDismiss, onOpen,
}: {
  item: NotificationItem;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const avatarUser = { id: item.conversationId, username: item.avatarFallback, avatarUrl: item.avatarUrl } as User;
  const mediaLabel = item.messageType === 'image' ? 'Sent an image'
    : item.messageType === 'video' ? 'Sent a video'
    : item.messageType === 'audio' ? 'Sent a voice message'
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.9, transition: { duration: 0.15 } }}
      className="w-72 bg-[#1C1C1C] border border-[#2E2E2E] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden cursor-pointer select-none"
      onClick={onOpen}
    >
      <div className="p-3.5 flex items-start gap-3">
        <div className="relative flex-shrink-0">
          <Avatar user={avatarUser} size="sm" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-500 border-2 border-[#1C1C1C]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-[#E0E0E0] leading-none mb-1 truncate">{item.title}</div>
          <div className="text-xs text-[#888] truncate leading-snug">
            {item.senderName && <span className="text-[#aaa]">{item.senderName}: </span>}
            {mediaLabel
              ? <span className="inline-flex items-center gap-1"><ImageIcon className="w-3 h-3 inline" /> {mediaLabel}</span>
              : item.message.length > 70 ? item.message.slice(0, 70) + '…' : item.message}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDismiss(); }}
          className="text-[#555] hover:text-[#aaa] transition-colors flex-shrink-0 mt-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <ProgressBar />
    </motion.div>
  );
}

interface NotificationsProps {
  items: NotificationItem[];
  onDismiss: (id: string) => void;
  onOpen: (item: NotificationItem) => void;
}

export function Notifications({ items, onDismiss, onOpen }: NotificationsProps) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence mode="popLayout">
        {items.map(item => (
          <div key={item.id} className="pointer-events-auto">
            <Toast
              item={item}
              onDismiss={() => onDismiss(item.id)}
              onOpen={() => { onOpen(item); onDismiss(item.id); }}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
