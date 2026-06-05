export interface User {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  messageType: 'text' | 'image' | 'video';
  mediaUrl?: string;
  isEdited: boolean;
  originalContent?: string;
  // Reply fields
  replyToId?: string;
  replyToContent?: string;
  replyToSenderId?: string;
  replyToMessageType?: 'text' | 'image' | 'video';
}

// emoji -> array of userIds who reacted
export type ReactionsMap = Record<string, string[]>;

export interface ChatPartner extends User {
  lastMessage?: string;
}
