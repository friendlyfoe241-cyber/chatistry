import React, { useState, useEffect } from 'react';
import { X, Users, Search, Loader2, Crown, UserMinus, UserPlus } from 'lucide-react';
import { GroupMember } from '../types';
import { supabase } from '../supabase';
import { Avatar } from './Avatar';

interface GroupMembersPanelProps {
  conversationId: string;
  currentUserId: string;
  isAdmin: boolean;
  onClose: () => void;
  onMembersChanged: () => void;
}

export function GroupMembersPanel({
  conversationId, currentUserId, isAdmin, onClose, onMembersChanged
}: GroupMembersPanelProps) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
  }, [conversationId]);

  const loadMembers = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_group_members', { p_conversation_id: conversationId });
    if (data) {
      setMembers(data.map((m: any) => ({
        userId: m.user_id,
        username: m.username,
        displayName: m.display_name ?? undefined,
        avatarUrl: m.avatar_url ?? undefined,
        role: m.role,
        joinedAt: m.joined_at,
      })));
    }
    setLoading(false);
  };

  // Search for users to add
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('users').select('id, username, display_name, avatar_url')
          .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
          .limit(10);
        // Filter out existing members
        const existingIds = members.map(m => m.userId);
        setSearchResults((data ?? []).filter((u: any) => !existingIds.includes(u.id)));
      } finally { setIsSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, members]);

  const addMember = async (userId: string) => {
    setActionLoading(userId);
    try {
      await supabase.rpc('add_group_member', { p_conversation_id: conversationId, p_user_id: userId });
      await loadMembers();
      onMembersChanged();
    } catch (err) {
      console.error('Failed to add member:', err);
    }
    setActionLoading(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeMember = async (userId: string) => {
    if (userId === currentUserId) return; // Can't remove yourself this way
    setActionLoading(userId);
    try {
      await supabase.rpc('remove_group_member', { p_conversation_id: conversationId, p_user_id: userId });
      await loadMembers();
      onMembersChanged();
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
    setActionLoading(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold">Group Members</h2>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[var(--surface3)] flex items-center justify-center text-[var(--txt3)] hover:text-[var(--txt)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-[var(--txt3)] animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {members.map(member => (
                <div key={member.userId}
                  className="flex items-center gap-3 p-3 bg-[var(--surface3)] rounded-xl">
                  <Avatar user={member} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-[var(--txt)] truncate">
                        {member.displayName || `@${member.username}`}
                      </span>
                      {member.userId === currentUserId && (
                        <span className="text-[10px] text-cyan-400 font-medium">(You)</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--txt3)]">@{member.username}</div>
                  </div>
                  {member.role === 'admin' ? (
                    <div className="flex items-center gap-1 text-xs text-yellow-400">
                      <Crown className="w-3.5 h-3.5" />
                      Admin
                    </div>
                  ) : isAdmin && member.userId !== currentUserId ? (
                    <button
                      onClick={() => removeMember(member.userId)}
                      disabled={actionLoading === member.userId}
                      className="w-8 h-8 rounded-full hover:bg-red-500/20 flex items-center justify-center text-[var(--txt3)] hover:text-red-400 transition-colors">
                      {actionLoading === member.userId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserMinus className="w-4 h-4" />
                      )}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* Add Member (Admin only) */}
          {isAdmin && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <label className="block text-sm font-medium text-[var(--txt2)] mb-1.5">Add Member</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--txt3)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users…"
                  className="w-full pl-9 pr-3 py-2.5 bg-[var(--surface3)] border border-[var(--border)] rounded-xl text-sm text-[var(--txt)] placeholder-[var(--txt3)] focus:outline-none focus:border-cyan-700 transition-colors"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--txt3)] animate-spin" />
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-2 bg-[var(--surface3)] border border-[var(--border)] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {searchResults.map(user => (
                    <button
                      key={user.id}
                      onClick={() => addMember(user.id)}
                      disabled={actionLoading === user.id}
                      className="w-full flex items-center gap-3 p-3 hover:bg-[var(--surface)] transition-colors text-left">
                      <Avatar user={user} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--txt)] truncate">
                          {user.display_name || `@${user.username}`}
                        </div>
                        <div className="text-xs text-[var(--txt3)]">@{user.username}</div>
                      </div>
                      {actionLoading === user.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4 text-cyan-400" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
