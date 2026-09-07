import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { ConversationRow, ConversationSummary, User, UserRow } from '../types';
import { supabase } from '../supabase';
import { cn } from '../utils';
import { Avatar } from './Avatar';

// Simple shared passcode for the hidden-chats drawer. This is intentionally
// client-side: it's an accidental-discovery guard, not a security boundary.

export const HIDDEN_CHATS_PASSWORD = '12345';

interface HiddenChatsModalProps {
  currentUser: User;
  onClose: () => void;
  onOpenConversation: (conv: ConversationSummary) => void;
}

export function HiddenChatsModal({ currentUser, onClose, onOpenConversation }: HiddenChatsModalProps) {
  const [stage, setStage] = useState<'password' | 'list'>('password');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [convos, setConvos] = useState<ConversationSummary[]>([]);

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

  return createPortal(<>
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
        <div className="mt-4 max-h-[45vh] overflow-y-auto space-y-1 pr-1">
          {loading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--txt3)]" /></div>
          ) : convos.length === 0 ? (
            <p className="p-6 text-center text-xs text-[var(--txt3)]">Nothing hidden yet — use the ⋮ menu on a chat to hide it.</p>
          ) : (
            convos.map(c => (
              <button key={c.id} onClick={() => { onOpenConversation(c); onClose(); }}
                className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[var(--surface4)] transition-colors">
                <Avatar user={{ id: c.id, username: c.name, avatarUrl: c.avatarUrl } as User} size="sm" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-[var(--txt)] truncate">{c.name}</h4>
                  <div className="text-[10px] text-[var(--txt3)]">{c.subtitle ?? (c.isGroup ? 'Group chat' : '')}</div>
                </div>
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-medium text-[var(--accent)]"><Eye className="h-3 w-3" /> Open</span>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  </>, document.body);
}