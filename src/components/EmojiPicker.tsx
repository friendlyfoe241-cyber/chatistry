import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';

const CATEGORIES = [
  {
    label: 'Smileys',
    emojis: ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','🙂','🤗','🤩','🤔','😐','🙄','😏','😮','😪','😴','😌','😛','😜','😝','😒','😔','😕','🙃','🤑','😲','😢','😭','😨','😩','🤯','😬','😰','😱','😠','😡','🤬','😷','😇','🥳','🤠','🥺','😻','🤓'],
  },
  {
    label: 'Gestures',
    emojis: ['👍','👎','👌','🤌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','✋','👏','🙌','🤝','🙏','💅','✍️','💪','🫶','🫂'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️'],
  },
  {
    label: 'Fun & Objects',
    emojis: ['🔥','💥','✨','⭐','🌟','💫','🎉','🎊','🎈','🎁','🏆','🥇','💯','🚀','⚡','🌈','☀️','🌙','❄️','💎','👑','🍕','🍔','🌮','🍦','🎂','🥂','😴','💤','💩','👻','💀','🤖','👽'],
  },
  {
    label: 'Animals',
    emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦋','🐝','🦜','🦄','🐉','🦈','🐬','🦧','🦊'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // slight delay so the open-click doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full mb-3 left-0 w-72 bg-[#1C1C1C] border border-[#2E2E2E] rounded-2xl shadow-2xl overflow-hidden z-30"
    >
      <div className="h-64 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {CATEGORIES.map(cat => (
          <div key={cat.label}>
            <div className="text-[10px] text-[#555] font-semibold uppercase tracking-wider mb-1.5 px-1">
              {cat.label}
            </div>
            <div className="flex flex-wrap">
              {cat.emojis.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => onSelect(emoji)}
                  className="w-9 h-9 text-xl flex items-center justify-center rounded-lg hover:bg-[#2A2A2A] transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
