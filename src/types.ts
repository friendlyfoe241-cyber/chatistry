export interface User {
  id: string;
  username: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
}

export interface ChatPartner extends User {
  lastMessage?: string;
}
