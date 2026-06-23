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

// A single item in the sidebar chat list — either a 1:1 DM or a group chat.
// `id` always equals the underlying conversations.id row, so it can be used
// directly as the realtime/unread-count/read-receipt key for both kinds.
export interface ConversationSummary {
  id: string;
  isGroup: boolean;
  name: string;                 // resolved display name (group name, or partner's name)
  avatarUrl?: string;           // group avatar, or partner's avatar
  subtitle?: string;            // "@username" for DM, "N members" for group
  participantIds: string[];
  updatedAt: string;
  createdBy?: string;           // group creator (group admin) — undefined for DMs
  // DM-only:
  partner?: User;
  statusEmoji?: string;
  statusText?: string;
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
  is_group: boolean;
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
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
  conversation_id: string;
  unread_count: number;
}
