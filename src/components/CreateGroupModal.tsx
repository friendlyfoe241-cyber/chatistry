import React, { useState, useEffect } from 'react';
import { X, Users, Search, Check, Loader2 } from 'lucide-react';
import { User, GroupMember } from '../types';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';

interface CreateGroupModalProps {
  currentUser: User;
  onClose: () => void;
  onGroupCreated: (groupId: string, groupName: string) => void;
}

export function CreateGroupModal({ currentUser, onClose, onGroupCreated }: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  // Search for users to add
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('users').select('id, username, display_name, avatar_url, status_emoji, status_text')
          .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
          .neq('id', currentUser.id)
          .limit(10);
        setSearchResults((data ?? []).map((u: any) => ({
          id: u.id, username: u.username, displayName: u.display_name ?? undefined,
          avatarUrl: u.avatar_url ?? undefined, statusEmoji: u.status_emoji ?? undefined, statusText: u.status_text ?? undefined,
        })));
      } finally { setIsSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, currentUser.id]);

  const addMember = (user: User) => {
    if (!selectedMembers.find(m => m.id === user.id)) {
      setSelectedMembers([...selectedMembers, user]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeMember = (userId: string) => {
    setSelectedMembers(selectedMembers.filter(m => m.id !== userId));
  };

  const createGroup = async () => {
    if (!groupName.trim()) { setError('Please enter a group name'); return; }
    if (selectedMembers.length < 1) { setError('Please add at least one member'); return; }

    setIsCreating(true);
    setError('');

    try {
      const participantIds = [currentUser.id, ...selectedMembers.map(m => m.id)];
      const { data, error: rpcError } = await supabase.rpc('create_group_conversation', {
        p_group_name: groupName.trim(),
        p_participant_ids: participantIds,
      });

      if (rpcError) throw rpcError;

      onGroupCreated(data as string, groupName.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold">Create Group</h2>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[var(--surface3)] flex items-center justify-center text-[var(--txt3)] hover:text-[var(--txt)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Group Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--txt2)] mb-1.5">Group Name</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name…"
              className="w-full px-3 py-2.5 bg-[var(--surface3)] border border-[var(--border)] rounded-xl text-sm text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-700 transition-colors"
              maxLength={50}
              autoFocus
            />
          </div>

          {/* Selected Members */}
          {selectedMembers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--txt2)] mb-1.5">
                Members ({selectedMembers.length + 1})
              </label>
              <div className="flex flex-wrap gap-2">
                {/* Current user (you) */}
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--surface3)] border border-[var(--border)] rounded-lg">
                  <Avatar user={currentUser} size="xs" />
                  <span className="text-xs text-[var(--txt)]">
                    {currentUser.displayName || `@${currentUser.username}`}
                  </span>
                  <span className="text-[10px] text-cyan-400 font-medium">(You)</span>
                </div>
                {/* Selected members */}
                {selectedMembers.map(member => (
                  <div key={member.id}
                    className="flex items-center gap-1.5 px-2 py-1 bg-[var(--surface3)] border border-[var(--border)] rounded-lg">
                    <Avatar user={member} size="xs" />
                    <span className="text-xs text-[var(--txt)]">
                      {member.displayName || `@${member.username}`}
                    </span>
                    <button onClick={() => removeMember(member.id)}
                      className="text-[var(--txt3)] hover:text-red-400 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-[var(--txt2)] mb-1.5">Add Members</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--txt3)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by name or username…"
                className="w-full pl-9 pr-3 py-2.5 bg-[var(--surface3)] border border-[var(--border)] rounded-xl text-sm text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-700 transition-colors"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--txt3)] animate-spin" />
              )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-2 bg-[var(--surface3)] border border-[var(--border)] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                {searchResults.map(user => {
                  const isSelected = selectedMembers.find(m => m.id === user.id);
                  return (
                    <button
                      key={user.id}
                      onClick={() => !isSelected && addMember(user)}
                      disabled={isSelected}
                      className={`w-full flex items-center gap-3 p-3 hover:bg-[var(--surface)] transition-colors text-left ${
                        isSelected ? 'opacity-50 cursor-not-allowed' : ''
                      }`}>
                      <Avatar user={user} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--txt)] truncate">
                          {user.displayName || `@${user.username}`}
                        </div>
                        <div className="text-xs text-[var(--txt3)]">@{user.username}</div>
                      </div>
                      {isSelected ? (
                        <Check className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-[var(--border2)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {searchQuery && !isSearching && searchResults.length === 0 && (
              <div className="mt-2 p-3 text-sm text-[var(--txt3)] text-center">
                No users found
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-[var(--border)] bg-[var(--surface2)]">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--txt2)] hover:text-[var(--txt)] transition-colors">
            Cancel
          </button>
          <button
            onClick={createGroup}
            disabled={isCreating || !groupName.trim() || selectedMembers.length === 0}
            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-600/50 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white flex items-center gap-2 transition-colors">
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                Create Group
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
