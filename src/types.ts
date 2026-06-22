// ── App-level models ─────────────────────────────────────────────
export interface User {
  id: string;
  username: string;       // login handle (unique, lowercase)
  displayName?: string;   // shown name (not unique, free text)
  avatarUrl?: string;
  lastSeenAt?: string;
  statusEmoji?: string;
  statusText?: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  messageType: 'text' | 'image' | 'video' | 'audio';
  mediaUrl?: string;
  isEdited: boolean;
  originalContent?: string;
  replyToId?: string;
  replyToContent?: string;
  replyToSenderId?: string;
  replyToMessageType?: string;
}

export type ReactionsMap = Record<string, string[]>;

export interface PinnedMessage {
  id: string;
  messageId: string;
  conversationId: string;
  messageContent: string;
  messageType: 'text' | 'image' | 'video' | 'audio';
  pinnedBy: string;
  pinnedAt: string;
}

// ── Database row shapes ──────────────────────────────────────────
export interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  last_seen_at: string | null;
  status_emoji: string | null;
  status_text: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: string;
  image_url: string | null;
  is_edited: boolean;
  original_content: string | null;
  reply_to_id: string | null;
  reply_to_content: string | null;
  reply_to_sender_id: string | null;
  reply_to_message_type: string | null;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  participants: string[];
  updated_at: string;
}

export interface ReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
}

export interface ConversationReadRow {
  user_id: string;
  conversation_id: string;
  last_read_at: string;
}

export interface PinnedMessageRow {
  id: string;
  conversation_id: string;
  message_id: string;
  message_content: string;
  message_type: string;
  pinned_by: string;
  pinned_at: string;
}

export interface UnreadCountRow {
  partner_id: string;
  unread_count: number;
}

// ── Group Chat types ────────────────────────────────────────────
export interface GroupChat {
  id: string;
  name: string;
  avatarUrl?: string;
  participants: string[];
  updatedAt: string;
  memberCount?: number;
}

export interface GroupMember {
  userId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  role: 'admin' | 'member';
  joinedAt: string;
}
