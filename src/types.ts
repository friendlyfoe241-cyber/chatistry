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
