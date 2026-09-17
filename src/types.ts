export interface User {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatar: string;
  role?: "user" | "superadmin";
  status: "online" | "offline" | "in-call";
  createdAt?: number;
  lastSeen?: number;
}

export interface GroupMember {
  id: string;
  username: string;
  fullName: string;
  avatar: string;
  status: "online" | "offline" | "in-call";
  role?: "admin" | "member";
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  avatar: string;
  creatorId: string;
  memberIds: string[];
  members?: GroupMember[];
  createdAt: number;
  lastMessage?: string;
  lastMessageTime?: number;
  lastMessageSenderName?: string;
  unreadCount?: number;
}

export interface Contact {
  id: string;
  username: string;
  fullName: string;
  avatar: string;
  status: "online" | "offline" | "in-call";
  lastSeen?: number;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount?: number;
  isGroup?: boolean;
  groupData?: Group;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatar: string;
  role: "user" | "superadmin";
  status: "online" | "offline" | "in-call";
  createdAt: number;
  lastSeen: number;
  contactsCount?: number;
  messagesCount?: number;
}

export interface Story {
  id: string;
  userId: string;
  userFullName: string;
  userUsername: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption?: string;
  createdAt: number;
  expiresAt: number;
  restrictedUserIds: string[];
  viewers: string[];
}

export type MessageType = "text" | "voice" | "video" | "file" | "location";

export interface MessageMetadata {
  duration?: number;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  thumbnail?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  type: MessageType;
  content: string;
  metadata?: MessageMetadata;
  timestamp: number;
  read: boolean;
  isGroup?: boolean;
  groupId?: string;
  senderName?: string;
  senderAvatar?: string;
  senderUsername?: string;
  reactions?: Record<string, string[]>;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
  isForwarded?: boolean;
}

export interface CallSession {
  id: string;
  peerId: string;
  peerUser: {
    id: string;
    username: string;
    fullName: string;
    avatar: string;
    status?: "online" | "offline" | "in-call";
  };
  isInitiator: boolean;

  type: "video" | "audio";
  status: "calling" | "incoming" | "connected" | "ended";
  startTime?: number;
  durationSeconds: number;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isHostCameraOnly: boolean; // Host option to only show host camera to viewers
}

export interface CallSummaryData {
  callType: "video" | "audio";
  durationSeconds: number;
  peerName: string;
  summary: string;
  actionItems?: string[];
  timestamp: number;
}

export interface CallRecord {
  id: string;
  callerId: string;
  callerName: string;
  callerUsername: string;
  callerAvatar: string;
  receiverId: string;
  receiverName: string;
  receiverUsername: string;
  receiverAvatar: string;
  type: "video" | "audio";
  status: "completed" | "missed" | "declined" | "cancelled";
  durationSeconds: number;
  timestamp: number;
  isOutgoing?: boolean;
  isMissed?: boolean;
  peer?: {
    id: string;
    fullName: string;
    username: string;
    avatar: string;
  };
}
