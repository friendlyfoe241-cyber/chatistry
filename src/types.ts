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
  messageType: 'text' | 'image';
  imageUrl?: string;
  isEdited: boolean;
  originalContent?: string;
}

export interface ChatPartner extends User {
  lastMessage?: string;
}
