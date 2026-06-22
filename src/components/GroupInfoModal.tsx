import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Users, Camera, Loader2, Search, UserPlus, UserMinus, LogOut, Crown, Pencil, Check } from 'lucide-react';
import { User, UserRow } from '../types';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';
import { cn } from '../utils';

interface GroupInfoModalProps {
  conversationId: string;
  name: string;
  avatarUrl?: string;
  createdBy?: string;
  currentUser: User;
  members: User[];
  onlineUserIds: string[];
  onClose: () => void;
  onLeft: () => void;
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

export function GroupInfoModal({
  conversationId, name, avatarUrl, createdBy, currentUser, members, onlineUserIds, onClose, onLeft,
}: GroupInfoModalProps) {
  const isCreator = createdBy === currentUser.id;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNameDraft(name); }, [name]);
  useEffect(() => { if (editingName) setTimeout(() => nameInputRef.current?.focus(), 50); }, [editingName]);

  const memberIds = new Set(members.map(m => m.id));

  useEffect(() => {
    if (!addOpen || !query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('users').select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', currentUser.id).limit(12);
      setSearchResults((data ?? [])
        .filter((u: UserRow) => !memberIds.has(u.id))
        .map((u: UserRow) => ({ id: u.id, username: u.username, displayName: u.display_name ?? undefined, avatarUrl: u.avatar_url ?? undefined })));
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query, addOpen, currentUser.id]);

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) { setEditingName(false); setNameDraft(name); return; }
    setSavingName(true);
    const { error: err } = await supabase.from('conversations').update({ name: trimmed, updated_at: new Date().toISOString() }).eq('id', conversationId);
    setSavingName(false);
    if (err) { console.warn('Rename failed:', err.message); setError('Could not rename group'); }
    setEditingName(false);
  };

  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return; }
    setUploadingAvatar(true);
    setError(null);
    try {
      const compressed = await compressGroupAvatar(file);
      const ext = compressed.name.split('.').pop() || 'jpg';
      const path = `groups/${conversationId}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, compressed, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const busted = `${publicUrl}?t=${Date.now()}`;
      await supabase.from('conversations').update({ avatar_url: busted, updated_at: new Date().toISOString() }).eq('id', conversationId);
    } catch (err) {
      console.error('Group avatar upload failed:', err);
      setError('Failed to update group photo');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleAdd = async (u: User) => {
    setAddingId(u.id);
    setError(null);
    const { error: err } = await supabase.rpc('add_group_member', { p_conversation_id: conversationId, p_new_member: u.id });
    setAddingId(null);
    if (err) { console.warn('Add member failed:', err.message); setError('Could not add member'); return; }
    setSearchResults(prev => prev.filter(r => r.id !== u.id));
    setQuery('');
  };

  const handleRemove = async (u: User) => {
    setRemovingId(u.id);
    setError(null);
    const { error: err } = await supabase.rpc('remove_group_member', { p_conversation_id: conversationId, p_member: u.id });
    setRemovingId(null);
    if (err) { console.warn('Remove member failed:', err.message); setError('Could not remove member'); }
  };

  const handleLeave = async () => {
    if (!confirm(`Leave "${name}"? You won't be able to see this conversation anymore.`)) return;
    setLeaving(true);
    const { error: err } = await supabase.rpc('remove_group_member', { p_conversation_id: conversationId, p_member: currentUser.id });
    setLeaving(false);
    if (err) { console.warn('Leave group failed:', err.message); setError('Could not leave group'); return; }
    onLeft();
  };

  const groupAvatarUser = { id: conversationId, username: name, avatarUrl } as User;

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
        <div className="px-5 pt-5 pb-4 flex items-start justify-between shrink-0 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
              <button onClick={() => isCreator && avatarInputRef.current?.click()} disabled={!isCreator}
                className="relative block" title={isCreator ? 'Change group photo' : undefined}>
                <Avatar user={groupAvatarUser} size="lg" />
                {isCreator && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    {uploadingAvatar ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
                  </div>
                )}
              </button>
            </div>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input ref={nameInputRef} value={nameDraft} onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setNameDraft(name); } }}
                    maxLength={60}
                    className="flex-1 min-w-0 bg-[var(--surface4)] border border-cyan-700/50 rounded-lg px-2 py-1 text-sm text-[var(--txt)] focus:outline-none" />
                  <button onClick={saveName} disabled={savingName} className="text-cyan-400 hover:text-cyan-300 flex-shrink-0">
                    {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <button onClick={() => isCreator && setEditingName(true)} className="flex items-center gap-1.5 group max-w-full" disabled={!isCreator}>
                  <span className="font-semibold text-[var(--txt)] truncate">{name}</span>
                  {isCreator && <Pencil className="w-3 h-3 text-[var(--txt3)] group-hover:text-cyan-400 transition-colors flex-shrink-0" />}
                </button>
              )}
              <div className="text-[11px] text-[var(--txt3)] mt-0.5">{members.length} members</div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--txt3)] hover:text-[var(--txt)] hover:bg-[var(--surface4)] transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <div className="px-5 pt-3 text-xs text-red-400">{error}</div>}

        {/* Add members toggle */}
        <div className="px-5 pt-3 shrink-0">
          <button onClick={() => setAddOpen(o => !o)}
            className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors',
              addOpen ? 'border-cyan-700 bg-cyan-900/20 text-cyan-300' : 'border-[var(--border)] bg-[var(--surface3)] text-[var(--txt2)] hover:border-cyan-800')}>
            <UserPlus className="w-4 h-4" /> Add members
          </button>
          {addOpen && (
            <div className="mt-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--txt3)]" />
                <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
                  placeholder="Search people…"
                  className="w-full bg-[var(--surface4)] border border-[var(--border2)] rounded-xl py-2 pl-8 pr-3 text-sm text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-700 transition-colors" />
              </div>
              {query.trim() && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface3)]">
                  {searching ? (
                    <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 text-[var(--txt3)] animate-spin" /></div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-3 text-xs text-[var(--txt3)]">No users found</div>
                  ) : (
                    searchResults.map(u => (
                      <button key={u.id} onClick={() => handleAdd(u)} disabled={addingId === u.id}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface4)] transition-colors text-left">
                        <Avatar user={u} size="sm" />
                        <span className="flex-1 text-xs text-[var(--txt)] truncate">{u.displayName || `@${u.username}`}</span>
                        {addingId === u.id ? <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" /> : <UserPlus className="w-3.5 h-3.5 text-[var(--txt3)]" />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {members.map(m => {
            const isOnline = onlineUserIds.includes(m.id);
            const isMemberCreator = m.id === createdBy;
            const isSelf = m.id === currentUser.id;
            return (
              <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--surface3)] transition-colors group">
                <div className="relative flex-shrink-0">
                  <Avatar user={m} size="md" isCurrentUser={isSelf} />
                  {isOnline && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[var(--surface2)] rounded-full" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--txt)] truncate flex items-center gap-1.5">
                    {m.displayName || `@${m.username}`} {isSelf && <span className="text-[var(--txt3)]">(you)</span>}
                    {isMemberCreator && <span title="Group creator"><Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" /></span>}
                  </div>
                  <div className="text-[11px] text-[var(--txt3)]">@{m.username}</div>
                </div>
                {isCreator && !isSelf && (
                  <button onClick={() => handleRemove(m)} disabled={removingId === m.id}
                    className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md flex items-center justify-center text-[var(--txt3)] hover:text-red-400 hover:bg-red-950/30 transition-all flex-shrink-0"
                    title="Remove from group">
                    {removingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
          <button onClick={handleLeave} disabled={leaving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-950/30 border border-red-900/40 text-red-400 text-sm font-medium hover:bg-red-950/50 transition-colors disabled:opacity-50">
            {leaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Leave group
          </button>
        </div>
      </motion.div>
    </div>
  );
}
