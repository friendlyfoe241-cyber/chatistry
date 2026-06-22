import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Search, X, Users, Camera, Loader2, Check } from 'lucide-react';
import { User, ConversationSummary, UserRow } from '../types';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';
import { cn } from '../utils';

interface NewGroupModalProps {
  currentUser: User;
  onClose: () => void;
  onCreated: (conversation: ConversationSummary) => void;
}

async function compressGroupAvatar(file: File, maxDimension = 400, quality = 0.85): Promise<File> {
  if (file.type === 'image/gif') return file;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export function NewGroupModal({ currentUser, onClose, onCreated }: NewGroupModalProps) {
  const [step, setStep] = useState<'members' | 'details'>('members');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, User>>(new Map());
  const [groupName, setGroupName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => searchInputRef.current?.focus(), 80); }, []);
  useEffect(() => { if (step === 'details') setTimeout(() => setError(null), 0); }, [step]);

  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('users').select('id, username, display_name, avatar_url, status_emoji, status_text')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', currentUser.id).limit(12);
      setSearchResults((data ?? []).map((u: UserRow) => ({
        id: u.id, username: u.username, displayName: u.display_name ?? undefined,
        avatarUrl: u.avatar_url ?? undefined, statusEmoji: u.status_emoji ?? undefined, statusText: u.status_text ?? undefined,
      })));
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query, currentUser.id]);

  const toggleSelect = (u: User) => {
    setSelected(prev => {
      const next = new Map(prev);
      next.has(u.id) ? next.delete(u.id) : next.set(u.id, u);
      return next;
    });
  };

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    const name = groupName.trim();
    if (!name || selected.size === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const id = `group_${crypto.randomUUID()}`;
      let avatarUrl: string | null = null;

      if (avatarFile) {
        const compressed = await compressGroupAvatar(avatarFile);
        const ext = compressed.name.split('.').pop() || 'jpg';
        const path = `groups/${id}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, compressed, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = `${publicUrl}?t=${Date.now()}`;
      }

      const participantIds = [currentUser.id, ...Array.from(selected.keys())];
      const now = new Date().toISOString();
      const { error: insErr } = await supabase.from('conversations').insert({
        id, participants: participantIds, is_group: true,
        name, avatar_url: avatarUrl, created_by: currentUser.id,
        created_at: now, updated_at: now,
      });
      if (insErr) throw insErr;

      // Mark as read immediately so it doesn't show as unread for the creator
      await supabase.from('conversation_reads').upsert(
        { user_id: currentUser.id, conversation_id: id, last_read_at: now },
        { onConflict: 'user_id,conversation_id' }
      );

      onCreated({
        id, isGroup: true, name, avatarUrl: avatarUrl ?? undefined,
        subtitle: `${participantIds.length} members`,
        participantIds, updatedAt: now, createdBy: currentUser.id,
      });
      onClose();
    } catch (err) {
      console.error('Group creation failed:', err);
      setError('Failed to create group. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-[var(--surface2)] border border-[var(--border2)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-[var(--txt)]">
              {step === 'members' ? 'New group' : 'Group details'}
            </span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--txt3)] hover:text-[var(--txt)] hover:bg-[var(--surface4)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'members' ? (
          <>
            {/* Selected chips */}
            {selected.size > 0 && (
              <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                {Array.from(selected.values()).map(u => (
                  <button key={u.id} onClick={() => toggleSelect(u)}
                    className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-cyan-900/30 border border-cyan-700/40 text-xs text-cyan-200 hover:bg-cyan-900/50 transition-colors">
                    <Avatar user={u} size="sm" />
                    {u.displayName || `@${u.username}`}
                    <X className="w-3 h-3 opacity-70" />
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="px-5 pb-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--txt3)]" />
                <input ref={searchInputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Search people to add…"
                  className="w-full bg-[var(--surface4)] border border-[var(--border2)] rounded-xl py-2 pl-8 pr-3 text-sm text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-700 transition-colors" />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pb-2 min-h-[120px]">
              {searching ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[var(--txt3)] animate-spin" /></div>
              ) : !query.trim() ? (
                <div className="text-center py-8 text-sm text-[var(--txt3)]">Search for people to add to your group</div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8 text-sm text-[var(--txt3)]">No users found</div>
              ) : (
                searchResults.map(u => {
                  const isSel = selected.has(u.id);
                  return (
                    <button key={u.id} onClick={() => toggleSelect(u)}
                      className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--surface3)] transition-colors text-left">
                      <Avatar user={u} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--txt)] truncate">{u.displayName || `@${u.username}`}</div>
                        {u.displayName && <div className="text-xs text-[var(--txt3)]">@{u.username}</div>}
                      </div>
                      <div className={cn('w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors',
                        isSel ? 'bg-cyan-500 border-cyan-500' : 'border-[var(--border3)]')}>
                        {isSel && <Check className="w-3 h-3 text-black" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
              <button onClick={() => setStep('details')} disabled={selected.size === 0}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-medium transition-colors">
                Next {selected.size > 0 ? `(${selected.size} selected)` : ''}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 pb-4 flex flex-col items-center gap-4">
              {/* Avatar picker */}
              <div className="relative">
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
                <button onClick={() => avatarInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-full bg-[var(--surface4)] border border-[var(--border2)] flex items-center justify-center overflow-hidden group">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Group avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-7 h-7 text-[var(--txt3)]" />
                  )}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </button>
              </div>

              {/* Name */}
              <input
                value={groupName} onChange={e => setGroupName(e.target.value)}
                placeholder="Group name" autoFocus maxLength={60}
                className="w-full bg-[var(--surface4)] border border-[var(--border2)] rounded-xl px-4 py-2.5 text-sm text-center text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-700 transition-colors"
              />

              <div className="w-full text-xs text-[var(--txt3)] text-center">
                {selected.size + 1} members: you, {Array.from(selected.values()).map(u => u.displayName || `@${u.username}`).join(', ')}
              </div>

              {error && <div className="text-xs text-red-400 text-center">{error}</div>}
            </div>

            <div className="px-5 py-4 border-t border-[var(--border)] flex gap-2 shrink-0">
              <button onClick={() => setStep('members')}
                className="flex-1 py-2.5 rounded-xl bg-[var(--surface3)] border border-[var(--border)] text-[var(--txt2)] text-sm font-medium hover:bg-[var(--surface4)] transition-colors">
                Back
              </button>
              <button onClick={handleCreate} disabled={!groupName.trim() || creating}
                className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create group'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
