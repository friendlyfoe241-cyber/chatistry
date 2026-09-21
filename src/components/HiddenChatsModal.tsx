import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Eye, EyeOff, Loader2, MoreVertical, X } from 'lucide-react';
import { ConversationRow, ConversationSummary, User, UserRow } from '../types';
import { supabase } from '../supabase';
import { cn } from '../utils';
import { Avatar } from './Avatar';

// Simple shared passcode for the hidden-chats drawer. This is intentionally
// client-side: it's an accidental-discovery guard, not a security boundary.

export const HIDDEN_CHATS_PASSWORD = '12345';

// Kebab-menu geometry (matches the w-44 menu width below).
const MENU_W = 176;
const MENU_H = 48;

interface HiddenChatsModalProps {
  currentUser: User;
  onClose: () => void;
  onOpenConversation: (conv: ConversationSummary) => void;
  onUnhide?: (convId: string) => void;
}

export function HiddenChatsModal({ currentUser, onClose, onOpenConversation, onUnhide }: HiddenChatsModalProps) {
  const [stage, setStage] = useState<'password' | 'list'>('password');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [menuConvoId, setMenuConvoId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Clicking anywhere outside the kebab menu closes it. The menu itself is
  // portaled to <body> so it can never be clipped by the scrolling list.
  useEffect(() => {
    if (!menuConvoId) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (menuRef.current?.contains(target)) return;
      if (target.closest?.('[data-hidden-chat-menu-trigger]')) return;
      setMenuConvoId(null);
      setMenuPos(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuConvoId]);

  const openMenu = (e: ReactMouseEvent, convId: string) => {
    e.stopPropagation();
    if (menuConvoId === convId) { setMenuConvoId(null); setMenuPos(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Flip above only when there isn't room below in the viewport.
    const above = window.innerHeight - rect.bottom < MENU_H + 8;
    const x = Math.max(8, Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 8));
    setMenuPos({ x, y: above ? rect.top : rect.bottom, above });
    setMenuConvoId(convId);
  };

  const unhide = async (convId: string) => {
    setMenuConvoId(null);
    setMenuPos(null);
    const { error } = await supabase.from('hidden_conversations').delete().eq('user_id', currentUser.id).eq('conversation_id', convId);
    if (error) {
      console.warn('Failed to unhide conversation:', error.message);
      alert(`Couldn't unhide conversation:\n\n${error.message}`);
      return;
    }
    setConvos(prev => prev.filter(c => c.id !== convId));
    onUnhide?.(convId);
  };

  const open = async () => {
    if (password.trim() !== HIDDEN_CHATS_PASSWORD) {
      setError(true);
      return;
    }
    setError(false);
    setStage('list');
    setLoading(true);
    try {
      const { data: hidRows } = await supabase
        .from('hidden_conversations').select('conversation_id').eq('user_id', currentUser.id);
      if (!hidRows?.length) { setConvos([]); return; }
      const ids = hidRows.map((r: { conversation_id: string }) => r.conversation_id);
      const { data: rows } = await supabase
        .from('conversations').select('id, participants, updated_at, is_group, name, avatar_url, created_by')
        .in('id', ids);
      if (!rows?.length) { setConvos([]); return; }
      const convRows = rows as ConversationRow[];
      const dmPartnerIds = Array.from(new Set(
        convRows.filter(c => !c.is_group)
          .map(c => c.participants.find(id => id !== currentUser.id))
          .filter((id): id is string => !!id)
      ));
      const partnerMap = new Map<string, UserRow>();
      if (dmPartnerIds.length) {
        const { data: users } = await supabase
          .from('users').select('id, username, display_name, avatar_url, status_emoji, status_text')
          .in('id', dmPartnerIds);
        (users as UserRow[] ?? []).forEach(u => partnerMap.set(u.id, u));
      }
      const summaries: ConversationSummary[] = [];
      for (const c of convRows) {
        if (c.is_group) {
          summaries.push({
            id: c.id, isGroup: true,
            name: c.name || 'Group chat',
            avatarUrl: c.avatar_url ?? undefined,
            subtitle: `${c.participants.length} member${c.participants.length !== 1 ? 's' : ''}`,
            participantIds: c.participants,
            updatedAt: c.updated_at,
            createdBy: c.created_by ?? undefined,
          });
        } else {
          const pid = c.participants.find(id => id !== currentUser.id);
          const u = pid ? partnerMap.get(pid) : undefined;
          if (!u) continue;
          summaries.push({
            id: c.id, isGroup: false,
            name: u.display_name || `@${u.username}`,
            avatarUrl: u.avatar_url ?? undefined,
            subtitle: u.display_name ? `@${u.username}` : undefined,
            participantIds: c.participants,
            updatedAt: c.updated_at,
            partner: {
              id: u.id, username: u.username, displayName: u.display_name ?? undefined,
              avatarUrl: u.avatar_url ?? undefined, statusEmoji: u.status_emoji ?? undefined, statusText: u.status_text ?? undefined,
            },
            statusEmoji: u.status_emoji ?? undefined,
            statusText: u.status_text ?? undefined,
          });
        }
      }
      setConvos(summaries);
    } finally { setLoading(false); }
  };

  const mainPortal = createPortal(<>
    <button className="fixed inset-0 z-[90] cursor-default bg-black/35 backdrop-blur-sm" onClick={onClose} aria-label="Close hidden chats" />
    <section role="dialog" aria-modal="true" aria-label="Hidden chats" className="appearance-menu fixed z-[100] left-1/2 top-1/2 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-5">
      <header className="flex items-center gap-2.5">
        {stage === 'list' ? (
          <button onClick={() => setStage('password')}
            className="grid h-8 w-8 place-items-center rounded-xl text-[var(--txt3)] hover:bg-[var(--surface4)] hover:text-[var(--txt)]"
            aria-label="Back to passcode">
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--surface4)] text-[var(--accent)]"><EyeOff className="h-4 w-4" /></span>
        )}
        <div>
          <h2 className="text-sm font-bold tracking-[-.02em] text-[var(--txt)]">Hidden chats</h2>
          <p className="text-[10px] text-[var(--txt3)]">{stage === 'password' ? 'Enter passcode to view' : `${convos.length} hidden`}</p>
        </div>
        <button onClick={onClose}
          className="ml-auto grid h-8 w-8 place-items-center rounded-xl text-[var(--txt3)] hover:bg-[var(--surface4)] hover:text-[var(--txt)]"
          aria-label="Close hidden chats">
          <X className="h-4 w-4" />
        </button>
      </header>

      {stage === 'password' ? (
        <div className="mt-5">
          <input
            type="password"
            name="hidden-chat-passcode"
            autoComplete="new-password"
            data-lpignore="true"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false); }}
            onKeyDown={e => { if (e.key === 'Enter') open(); }}
            placeholder="Enter passcode"
            autoFocus
            className={cn(
              'w-full bg-[var(--surface4)] border rounded-xl px-3 py-2.5 text-sm text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-600 transition-colors',
              error ? 'border-red-500' : 'border-[var(--border2)]'
            )}
          />
          {error && <p className="mt-2 text-[11px] text-red-400">Wrong passcode — try again.</p>}
          <p className="mt-3 text-center text-[10px] text-[var(--txt3)]">Hint: the shared passcode is 12345</p>
          <button onClick={open}
            className="mt-4 w-full rounded-xl liquid-button py-2.5 text-sm font-semibold">
            View hidden chats
          </button>
        </div>
      ) : (
        <div className="mt-4 max-h-[calc(100vh-14rem)] overflow-y-auto space-y-1 pr-1">
          {loading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--txt3)]" /></div>
          ) : convos.length === 0 ? (
            <p className="p-6 text-center text-xs text-[var(--txt3)]">Nothing hidden yet — use the ⋮ menu on a chat to hide it.</p>
          ) : (
            convos.map(c => (
              <div key={c.id} className="relative flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-[var(--surface4)]">
                <button onClick={() => { onOpenConversation(c); onClose(); }} aria-label={`Open ${c.name}`}
                  className="flex flex-1 min-w-0 items-center gap-3 text-left">
                  <Avatar user={{ id: c.id, username: c.name, avatarUrl: c.avatarUrl } as User} size="sm" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold text-[var(--txt)] truncate">{c.name}</h4>
                    <div className="text-[10px] text-[var(--txt3)]">{c.subtitle ?? (c.isGroup ? 'Group chat' : '')}</div>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-[var(--accent)]"><Eye className="h-3 w-3" /> Open</span>
                </button>
                <button
                  data-hidden-chat-menu-trigger
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => openMenu(e, c.id)}
                  className={cn('w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0',
                    menuConvoId === c.id ? 'text-[var(--txt)] bg-[var(--surface4)]' : 'text-[var(--txt3)] hover:text-[var(--txt)] hover:bg-[var(--surface4)]')}
                  title="Options"
                  aria-label="Options for hidden chat"
                  aria-expanded={menuConvoId === c.id}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  </>, document.body);

  // Portaled menu drawn over the whole page, positioned at the trigger button,
  // so it's never clipped by the modal's scrollable list.
  const contextMenu = menuConvoId && menuPos ? createPortal(
    <div
      ref={menuRef}
      data-hidden-chat-menu
      className="fixed z-[120] w-44 rounded-xl border border-[var(--border2)] p-1 shadow-2xl"
      style={{
        left: menuPos.x,
        top: menuPos.above ? menuPos.y - MENU_H : menuPos.y,
        transform: menuPos.above ? 'translateY(-100%)' : 'translateY(4px)',
        background: 'linear-gradient(145deg, var(--surface), var(--surface2))',
        backdropFilter: 'blur(28px) saturate(150%)',
        WebkitBackdropFilter: 'blur(28px) saturate(150%)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <button
        onClick={() => unhide(menuConvoId)}
        className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--txt2)] hover:bg-[var(--surface4)] hover:text-[var(--txt)] transition-colors">
        <EyeOff className="w-3.5 h-3.5" />
        Unhide conversation
      </button>
    </div>,
    document.body,
  ) : null;

  return <>{mainPortal}{contextMenu}</>;
}