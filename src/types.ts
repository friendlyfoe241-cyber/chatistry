// ── App-level models ────────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  avatarUrl?: string;
  lastSeenAt?: string;
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

// ── Database row shapes (replaces `any` in Supabase queries) ────
export interface UserRow {
  id: string;
  username: string;
  avatar_url: string | null;
  last_seen_at: string | null;
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
