// Shared TypeScript interfaces — dùng chung cho Web, Mobile, Desktop, Server

export interface UserResponse {
  _id: string;
  email: string;
  supabaseId: string;
  displayName?: string;
  avatarUrl?: string;
  hasUnreadNotifications?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Meeting {
  id: string;
  roomCode: string;
  title?: string;
  hostId: string;
  participants: Participant[];
  startedAt: string;
  endedAt?: string;
  isActive: boolean;
}

export interface Participant {
  userId: string;
  name: string;
  avatarUrl?: string;
  isMuted: boolean;
  isCameraOff: boolean;
  joinedAt: string;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  result: T;
}

export interface ErrorDetail {
  code: number;
  message: string;
  statusCode: number; // Dùng để NestJS biết nên trả về 400, 404 hay 500
}

export const ErrorCode: Record<string, ErrorDetail> = {
  USER_NOT_FOUND: {
    code: 4041,
    message: "Người dùng không tồn tại",
    statusCode: 404,
  },
  ROOM_OR_CHANNEL_NOT_FOUND: {
    code: 4041,
    message: "Phòng hoặc kênh không tồn tại",
    statusCode: 404,
  },
  ACCOUNT_LOCKED: {
    code: 4031,
    message: "Tài khoản của bạn đã bị khóa",
    statusCode: 403,
  },
  INVALID_PERMISSION: {
    code: 4032,
    message: "Bạn không đủ quyền thực hiện chức năng này",
    statusCode: 403,
  },
  INVALID_TOKEN: {
    code: 4011,
    message: "Token không hợp lệ hoặc đã hết hạn",
    statusCode: 401,
  },
  INVALID_CREDENTIALS: {
    code: 4012,
    message: "Email hoặc mật khẩu không đúng",
    statusCode: 401,
  },
  ALREADY_IN_MEETING: {
    code: 4013,
    message: "Đã trong cuộc họp",
    statusCode: 401,
  },
  MEETING_NOT_STARTED_OR_ENDED: {
    code: 4014,
    message: "Cuộc họp chưa bắt đầu hoặc đã kết thúc",
    statusCode: 401,
  },
  USER_EXISTED: {
    code: 4001,
    message: "Email này đã được sử dụng",
    statusCode: 400,
  },
  UNAUTHORIZED: {
    code: 4011,
    message: "Vui lòng đăng nhập để tiếp tục",
    statusCode: 401,
  },
  ROOM_FULL: {
    code: 4002,
    message: "Phòng họp đã đạt số lượng tối đa",
    statusCode: 400,
  },
  // Lỗi hệ thống (50x), không public lỗi chi tiết cho người dùng
  SERVER_ERROR: {
    code: 5011,
    message: "Lỗi hệ thống, vui lòng thử lại sau",
    statusCode: 501,
  },

  // Meeting invite error
  MEETING_INVITE_ROOM_NOT_ACTIVE: {
    code: 4003,
    message: "Cuộc họp hiện không diễn ra.",
    statusCode: 400,
  },
  MEETING_INVITE_ACCESS_FAILED: {
    code: 4004,
    message: "Không thể truy cập thông tin cuộc họp.",
    statusCode: 400,
  },
  MEETING_INVITE_NOT_ALLOWED: {
    code: 4005,
    message: "Bạn phải đang tham gia cuộc họp mới có thể gửi lời mời.",
    statusCode: 400,
  },
  MEETING_INVITE_SESSION_INVALID: {
    code: 4006,
    message: "Phiên họp không tồn tại hoặc đã kết thúc.",
    statusCode: 400,
  },
  MEETING_INVITE_SESSION_NOT_FOUND: {
    code: 4042,
    message: "Không tìm thấy phiên họp này.",
    statusCode: 404,
  },
  MEETING_INVITE_RATE_LIMITED: {
    code: 4291,
    message:
      "Bạn đã gửi lời mời cho người này rồi. Vui lòng thử lại sau ít phút.",
    statusCode: 429,
  },

  // Meeting & Control errors
  WAITING_ROOM_UPDATE_FAILED: {
    code: 4007,
    message: "Không thể cập nhật trạng thái phòng chờ",
    statusCode: 400,
  },
  APPROVE_PARTICIPANT_FAILED: {
    code: 4008,
    message: "Không thể duyệt người dùng này",
    statusCode: 400,
  },
  APPROVAL_PERMISSION_UPDATE_FAILED: {
    code: 4009,
    message: "Không thể cập nhật cấu hình quyền duyệt",
    statusCode: 400,
  },
  PARTICIPANT_NOT_IN_MEETING: {
    code: 4043,
    message: "Người dùng không tồn tại trong cuộc họp",
    statusCode: 404,
  },
  SCREEN_SHARE_ALREADY_ACTIVE: {
    code: 4015,
    message: "Một người khác đang chia sẻ màn hình. Vui lòng đợi họ kết thúc.",
    statusCode: 400,
  },
  REMOVE_PARTICIPANT_FAILED: {
    code: 4016,
    message: "Không thể xoá người dùng khỏi cuộc họp",
    statusCode: 400,
  },
  TOGGLE_CHAT_FAILED: {
    code: 4017,
    message: "Không thể cập nhật trạng thái chat",
    statusCode: 400,
  },
  MUTE_PARTICIPANT_FAILED: {
    code: 4018,
    message: "Không thể thao tác trên người dùng này",
    statusCode: 400,
  },
  MEETING_NOT_FOUND: {
    code: 4044,
    message: "Không tìm thấy cuộc họp",
    statusCode: 404,
  },

  // Breakout errors
  START_BREAKOUT_FAILED: {
    code: 4019,
    message: "Không thể tạo phiên thảo luận nhóm",
    statusCode: 400,
  },
  END_BREAKOUT_FAILED: {
    code: 4020,
    message: "Không thể kết thúc phiên thảo luận nhóm",
    statusCode: 400,
  },
  BREAKOUT_ROOM_NOT_FOUND_OR_CLOSED: {
    code: 4045,
    message: "Phòng thảo luận không tồn tại hoặc đã đóng",
    statusCode: 404,
  },
  INVALID_BREAKOUT_ROOM: {
    code: 4021,
    message: "Yêu cầu không hợp lệ. Đây không phải là phòng thảo luận",
    statusCode: 400,
  },
  BREAKOUT_ROOM_NOT_ACTIVE: {
    code: 4022,
    message: "Phòng thảo luận này không còn hoạt động",
    statusCode: 400,
  },
  BREAKOUT_ROOM_DATA_INVALID: {
    code: 4023,
    message: "Dữ liệu phòng thảo luận không hợp lệ",
    statusCode: 400,
  },
  MUST_BE_IN_MAIN_ROOM: {
    code: 4024,
    message: "Bạn phải đang ở phòng họp chính mới được vào phòng thảo luận",
    statusCode: 400,
  },
  MAIN_ROOM_NOT_ACTIVE: {
    code: 4025,
    message: "Phòng họp chính không hoạt động",
    statusCode: 400,
  },
  MAIN_ROOM_INFO_NOT_FOUND: {
    code: 4046,
    message: "Không tìm thấy thông tin phòng họp chính",
    statusCode: 404,
  },
  NOT_IN_BREAKOUT_ROOM: {
    code: 4026,
    message: "Bạn không có mặt trong phòng thảo luận này",
    statusCode: 400,
  },
  NOT_ASSIGNED_TO_BREAKOUT_ROOM: {
    code: 4027,
    message: "Bạn không được phân công vào phòng thảo luận này",
    statusCode: 403,
  },
  BREAKOUT_ROOM_FREE_TO_CHOOSE: {
    code: 4028,
    message: "Phòng thảo luận ở chế độ tự do chọn, không thể chỉ định thành viên",
    statusCode: 400,
  },
  RENAME_PARTICIPANT_FAILED: {
    code: 4029,
    message: "Không thể đổi tên người tham gia",
    statusCode: 400,
  },
  CANNOT_RECORD_BREAKOUT_ROOM: {
    code: 4030,
    message: "Không thể ghi hình trong phòng thảo luận nhóm",
    statusCode: 400,
  },
  RECORDING_ALREADY_IN_PROGRESS: {
    code: 4033,
    message: "Cuộc họp đã có người đang ghi hình",
    statusCode: 400,
  },
  ONLY_RECORDER_CAN_STOP_RECORDING: {
    code: 4034,
    message: "Chỉ người bắt đầu ghi hình mới có quyền dừng ghi hình",
    statusCode: 403,
  },

  // Calendar errors
  CALENDAR_EVENT_NOT_FOUND: {
    code: 4048,
    message: "Không tìm thấy sự kiện lịch họp",
    statusCode: 404,
  },
  CALENDAR_EVENT_FORBIDDEN: {
    code: 4035,
    message: "Bạn không có quyền thực hiện thao tác này trên sự kiện lịch",
    statusCode: 403,
  },
  CALENDAR_EVENT_CONFLICT: {
    code: 40015,
    message: "Một hoặc nhiều thành viên được mời đã bận lịch khác vào khung giờ này",
    statusCode: 400,
  },
  CALENDAR_START_TIME_INVALID: {
    code: 40016,
    message: "Thời gian bắt đầu họp phải sau thời gian hiện tại",
    statusCode: 400,
  },
  CALENDAR_END_TIME_INVALID: {
    code: 40017,
    message: "Thời gian bắt đầu phải trước thời gian kết thúc",
    statusCode: 400,
  },
  CALENDAR_CHANNEL_MEETING_INVALID: {
    code: 40018,
    message: "Cuộc họp kênh yêu cầu phải chọn phòng và kênh.",
    statusCode: 400,
  },
  CALENDAR_ROOM_NOT_FOUND: {
    code: 4049,
    message: "Phòng không tồn tại hoặc đã bị giải tán.",
    statusCode: 404,
  },
  CALENDAR_CHANNEL_NOT_FOUND: {
    code: 40410,
    message: "Kênh không thuộc phòng đã chọn. Dữ liệu không hợp lệ.",
    statusCode: 404,
  },
};

export interface NavLink {
  label: string;
  href: string;
}

export interface Feature {
  iconName: string;
  title: string;
  description: string;
  gradient: string;
}

export interface Platform {
  iconName: string;
  name: string;
  badges: string[];
  description: string;
}

export interface ChannelResponse {
  _id: string;
  name: string;
  members?: ChannelMemberResponse[];
  isPrivate: boolean;
  createdAt: string;
}

export interface RoomResponse {
  _id: string;
  name: string;
  description?: string;
  code: string;
  ownerId: string;
  type?: string;
  members?: RoomMemberResponse[];
  channels: ChannelResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface RoomMemberResponse {
  userId: string;
  role: "owner" | "admin" | "member" | string;
  displayRole?: string;
  status?: "active" | "removed" | "left";
  joinedAt: string;
  removedAt?: string;
  removedBy?: string;
  rejoinedAt?: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
}

export interface ChannelMemberResponse {
  userId: string;
  role: "admin" | "member";
}

export interface MeetingJoinResponse {
  token: string;
  meetingCode: string;
  status: string;
  displayName: string;

  roomId?: string;
  channelId?: string;
}

export interface ActiveMeetingResponse {
  isOngoing: boolean;
  meetingCode: string | null;
  hostId: string;
}

export type PacketType = "CHAT" | "REACT";

// Cấu trúc gói tin chat trong meeting (dùng chung cho Web, Mobile, Desktop)
export interface ChatMessage {
  id: string;
  type: PacketType;
  senderIdentity: string;
  senderName: string;
  content?: string;
  timestamp: number;
  isPrivate: boolean;
  targetName?: string; // Tên người nhận (để hiển thị UI cho người gửi)
  targetIdentity?: string;

  // Dành cho FILE_START & FILE_DONE
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  publicUrl?: string;

  // Dành cho tính năng Reply
  replyToMsgId?: string;
  replyToSender?: string;
  replyToContent?: string;

  // Dành cho tính năng Thả cảm xúc
  reactions?: { [emoji: string]: string[] }; // Lưu theo dạng: { "👍": ["user_id_1", "user_id_2"] }
  targetMessageId?: string; // (Chỉ dùng cho loại gói tin REACT)
  emoji?: string; // (Chỉ dùng cho loại gói tin REACT)
}

export interface PresignedUploadResponse {
  presignedUrl: string;
  publicUrl: string;
}

export interface MeetingDeviceStatus {
  isJoinedOnThisDevice: boolean;
  meetingCode: string;
}

export interface RoomMemberStatus {
  isMember: boolean;
  roomId?: string;
}

export interface ParticipantMetadata {
  deviceId: string; // xác định thiết bị nào đang trong cuộc họp
  avatarUrl: string;
  hasAdminPowers: boolean;
  role: "owner" | "admin" | "member" | "guest";
  status: "joined" | "waiting";
}

export type WhiteboardAccessRole = "admin" | "member" | "guest";
export type WhiteboardPermissionLevel = "view" | "edit";

export interface WhiteboardSettings {
  allowedRoles: WhiteboardAccessRole[];
  memberPermission: WhiteboardPermissionLevel;
  guestPermission: WhiteboardPermissionLevel;
}

export interface WhiteboardAccessResponse {
  canAccess: boolean;
  role: "owner" | "admin" | "member" | "guest";
  hasAdminPowers: boolean;
  permission: WhiteboardPermissionLevel;
  isReadOnly: boolean;
}

export interface WhiteboardUserInfo {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface WhiteboardTokenResponse {
  token: string;
  roomId: string;
  whiteboardUrl: string;
  user?: WhiteboardUserInfo;
}

export interface WhiteboardJwtPayload {
  sub?: string;
  role?: WhiteboardAccessRole | "owner";
  meetingCode?: string;
  roomId?: string;
  displayName?: string;
  isReadOnly?: boolean;
  isReadonly?: boolean;
  iss?: string;
  aud?: string;
  exp?: number;
  iat?: number;
}

// Định nghĩa các trường dùng chung (nếu có)
export interface BaseRoomMetadata {
  roomName: string;
  meetingType: "personal" | "channel";
}

// Dành riêng cho phòng họp chính
export interface MainRoomMetadata extends BaseRoomMetadata {
  roomType: "main";
  sessionId: string;
  isWaitingRoomEnabled: boolean;
  isChatEnabled: boolean;
  approvalPermission: "admin_only" | "member_and_admin" | "everyone";
  /** @deprecated Cấu hình Whiteboard hiện được lưu trực tiếp trong TLDocument.meta trên tldraw sync server */
  whiteboardSettings?: WhiteboardSettings;
  breakoutSession?: {
    status: string;
    rooms: LivekitBreakoutRoom[];
    startedAt: number;
  };
  recording?: {
    isRecording: boolean;
    recorderId: string;
    startedAt?: number;
  };
}

// Dành riêng cho phòng Breakout
export interface BreakoutRoomMetadata extends BaseRoomMetadata {
  roomType: "breakout";
  parentRoom: string;
  parentMetadata: MainRoomMetadata;
  durationMinutes: number;
  startedAt: number;
  status: "active" | "closing";
  assignedUsers?: string[];
}

export type LivekitRoomMetadata = MainRoomMetadata | BreakoutRoomMetadata;

export interface LivekitBreakoutRoom {
  id: string;
  name: string;
  maxParticipants: number;
  durationMinutes: number;
  assignedUsers?: string[];
}

// Đồng bộ với dto bên BE
export interface CreateBreakoutRoomDto {
  name: string;
  maxParticipants?: number;
  durationMinutes?: number;
  assignedUsers?: string[];
}

export interface ChannelFileResponse {
  _id: string;
  roomId: string;
  channelId: string;
  uploadedBy: string;
  uploadedByName: string;
  fileName: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  isFolder?: boolean;
  parentFolderId?: string | null;
  isPinned?: boolean;
  pinnedAt?: string;
}

export interface PageResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
}

export interface NotificationResponse {
  _id: string;
  userId: string;
  type: string;
  referenceId?: string;
  metadata: Record<string, any>;
  isRead: boolean;
  isNotified?: boolean; // Dành cho Popup/Toast
  canPopup?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecording {
  recordingId: string;
  folderName: string;
  storagePath: string;
  playlistUrl?: string;
  durationSeconds?: number;
  sizeBytes?: number;
  createdAt: Date | string;
}

export interface MeetingSessionResponse {
  _id: string;
  meetingCode: string;
  status: "ongoing" | "ended";
  sessionFolder?: string;
  recordings?: SessionRecording[];
  startedAt: string | Date;
  endedAt?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  durationSeconds?: number;
  totalParticipants?: number;
}

export interface GetMeetingSessionsArgs {
  meetingCode: string;
  page: number;
  limit?: number;
}

export interface SessionAttendanceItem {
  userId: string;
  displayName?: string;
  totalDurationSeconds: number;
  visitCount: number;
  visits?: Array<{
    joinedAt: Date | string;
    leftAt?: Date | string;
    durationSeconds: number;
  }>;
  firstJoinedAt?: Date | string;
  lastLeftAt?: Date | string;
}

// Recording service

export interface R2FolderDetails {
  bucket_name: string;
  folder_prefix: string;
  endpoint_url: string;
  public_base_url?: string;
  timeline_key: string;
}

export interface TimelineSegmentAudio {
  participant: string;
  start: number;
  end: number;
  duration?: number;
  file: string;
}

export interface TimelineSegmentScreen {
  participant: string;
  start: number;
  end: number;
  frames?: number;
  real_duration_sec?: number;
  file: string;
}

export interface TimelineData {
  room: string;
  session_id: string;
  start_time?: number;
  duration_sec?: number;
  audio_segments?: TimelineSegmentAudio[];
  screen_segments?: TimelineSegmentScreen[];
  output_dir?: string;
}

export interface RecordingWebhookDto {
  event: string; // "RECORDING_UPLOADED"
  room_name: string;
  session_id: string;
  folder: string; // e.g. "recordings/meet-6a80-ii70qip/string2"
  duration_sec: number;
  r2: R2FolderDetails;
}

// Calendar Service Shared Types
export type CalendarRSVPStatus = "ACCEPTED" | "DECLINED" | "TENTATIVE" | "PENDING";

export interface CalendarRSVPMember {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  status: CalendarRSVPStatus;
  isHost?: boolean;
}

export interface CalendarEventResponse {
  _id: string;
  title: string;
  description?: string;
  hostId: string;
  hostEmail?: string;
  hostDisplayName?: string;
  hostAvatarUrl?: string;
  roomId?: string;
  channelId?: string;
  roomType?: "meeting" | "classroom" | "channel_meeting";
  startDate: string | Date;
  endDate: string | Date;
  timezone?: string;
  location?: string;
  meetingCode: string;
  meetingPassword?: string;
  recurrenceRule?: string;
  recurrenceExceptions?: string[];
  acceptedUserIds?: string[];
  pendingUserIds?: string[];
  declinedUserIds?: string[];
  isRecurring?: boolean;
  recurrenceEndDate?: string | Date | null;
  isOccurrence?: boolean;
  occurrenceDate?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

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
  createdAt: string;
  updatedAt: string;
}

