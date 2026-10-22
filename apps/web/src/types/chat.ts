export interface ChatAttachment {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: "image" | "video" | "file";
}

export interface ChatMessageReaction {
  emoji: string;
  userIds: string[];
}

export interface ChatParticipant {
  supabaseId: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
  status?: string;
}

export interface DirectConversationResponse {
  id: string;
  participantIds: string[];
  recipient: ChatParticipant;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  unreadCount: number;
  pinnedCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DirectMessageResponse {
  id: string;
  _id?: string;
  conversationId: string;
  senderId: string;
  sender?: ChatParticipant;
  type: "text" | "file" | "video" | "image";
  content: string;
  attachments: ChatAttachment[];
  replyToId?: {
    _id: string;
    content: string;
    senderId: string;
    type: "text" | "file" | "video" | "image";
    attachments?: ChatAttachment[];
    deletedAt?: string | null;
  } | null;
  reactions: ChatMessageReaction[];
  deletedAt?: string | null;
  isPinned?: boolean;
  pinnedBy?: string | null;
  pinnedAt?: string | null;
  pinner?: ChatParticipant;
  createdAt: string;
  updatedAt: string;
}

export interface PinnedMessageDetail extends DirectMessageResponse {
  isPinned: boolean;
  pinnedBy: string;
  pinnedAt: string;
  pinner?: ChatParticipant;
}

export interface ChatMessagesPaginationResponse {
  messages: DirectMessageResponse[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ChatMessageReactionUserDetail {
  userId: string;
  reaction: string;
  user: {
    supabaseId: string;
    displayName: string;
    avatarUrl?: string;
  };
}
