import { useState, useEffect } from "react";
import { useLocalParticipant, useRoomInfo } from "@livekit/components-react";
import { toast } from "sonner";
import {
  useEndBreakoutSessionMutation,
  useGetWhiteboardAccessQuery,
  useToggleMeetingChatMutation,
  useToggleWaitingRoomStatusMutation,
  useUpdateApprovalPermissionMutation,
} from "@/lib/redux/api/meetingsApi";
import { useTranslations } from "next-intl";
import {
  LivekitBreakoutRoom,
  LivekitRoomMetadata,
  ParticipantMetadata,
} from "@tobomeet/shared/types";

// Hook quản lý cài đặt phòng (Chat, Phòng chờ, Quyền duyệt) dùng trong cuộc họp
export function useRoomSettings({
  meetingCode,
}: {
  meetingCode?: string;
}) {
  const t = useTranslations("server.errors");
  const tToolbar = useTranslations("meeting.toolbar");
  const tSession = useTranslations("meeting.session");
  const { localParticipant } = useLocalParticipant();
  const { metadata: roomMetadata } = useRoomInfo();

  const [toggleChatApi] = useToggleMeetingChatMutation();
  const [toggleWaitingRoomApi] = useToggleWaitingRoomStatusMutation(); // API bật/tắt phòng chờ
  const [updateApprovalPermissionApi] = useUpdateApprovalPermissionMutation(); // Khởi tạo mutation

  const { data: wbAccessData } = useGetWhiteboardAccessQuery(
    meetingCode || "",
    { skip: !meetingCode },
  );

  const [isChatEnabled, setIsChatEnabled] = useState(true);
  const [isWaitingRoomEnabled, setIsWaitingRoomEnabled] = useState(false); // Mặc định tắt phòng chờ
  const [roomType, setRoomType] = useState<"main" | "breakout">("main");
  const [meetingType, setMeetingType] = useState<"personal" | "channel">("channel");
  const [breakoutRoomsList, setBreakoutRoomsList] = useState<
    LivekitBreakoutRoom[]
  >([]);
  const [isBreakoutActive, setIsBreakoutActive] = useState(false);
  const [endBreakoutApi, { isLoading: isEndingBreakout }] =
    useEndBreakoutSessionMutation();
  const [breakoutStartedAt, setBreakoutStartedAt] = useState<number>(0);
  const [breakoutDuration, setBreakoutDuration] = useState<number>(0);
  const [roomName, setRoomName] = useState<string>("");
  const [recordingInfo, setRecordingInfo] = useState<{
    isRecording: boolean;
    recorderId: string;
    startedAt?: number;
    status?: "recording" | "stopping";
  } | null>(null);

  // State quản lý quyền duyệt
  const [approvalPermission, setApprovalPermission] = useState<
    "admin_only" | "member_and_admin" | "everyone"
  >("admin_only");

  // Kiểm tra quyền Chủ phòng/Admin & Role của user
  let isHost = false;
  let userRole: "owner" | "admin" | "member" | "guest" = "guest";
  try {
    if (localParticipant?.metadata) {
      const userMeta: ParticipantMetadata = JSON.parse(
        localParticipant.metadata,
      );
      userRole = userMeta.role || "guest";
      isHost = userMeta.role === "owner" || userMeta.role === "admin";
    }
  } catch (e) { }

  const canAccessWhiteboard = !meetingCode
    ? false
    : wbAccessData !== undefined
      ? wbAccessData.canAccess
      : true;

  // Lắng nghe và đồng bộ trạng thái cài đặt chung từ Server (Metadata của LiveKit)
  useEffect(() => {
    if (!roomMetadata) return;
    try {
      const meta: LivekitRoomMetadata = JSON.parse(roomMetadata);

      setRoomName(meta.roomName);
      if (meta.meetingType) {
        setMeetingType(meta.meetingType);
      }

      if (meta.roomType === "breakout") {
        setRoomType("breakout");
        if (meta.parentMetadata) {
          setIsChatEnabled(meta.parentMetadata.isChatEnabled);
          setApprovalPermission(meta.parentMetadata.approvalPermission);
          if (meta.parentMetadata.meetingType) {
            setMeetingType(meta.parentMetadata.meetingType);
          }
        }

        setBreakoutStartedAt(meta.startedAt || 0);
        setBreakoutDuration(meta.durationMinutes || 0);
        setIsWaitingRoomEnabled(false);
        setRecordingInfo(meta.parentMetadata?.recording || null);
      } else {
        setRoomType("main");

        // Cập nhật cài đặt của phòng họp
        setIsChatEnabled(meta.isChatEnabled);
        setIsWaitingRoomEnabled(meta.isWaitingRoomEnabled);
        setApprovalPermission(meta.approvalPermission);
        setRecordingInfo(meta.recording || null);

        // Cập nhật trạng thái và danh sách nhóm thảo luận (Breakout)
        setIsBreakoutActive(meta.breakoutSession?.status === "active");
        setBreakoutRoomsList(meta.breakoutSession?.rooms || []);
        setBreakoutStartedAt(meta.breakoutSession?.startedAt || 0);
        setBreakoutDuration(
          meta.breakoutSession?.rooms?.[0]?.durationMinutes || 0,
        );
      }
    } catch (e) {
      console.error("Lỗi parse metadata phòng:", e);
    }
  }, [roomMetadata]);

  const canChat = isChatEnabled || isHost;

  // Hàm xử lý bật/tắt Chat
  const handleToggleChat = async () => {
    const newState = !isChatEnabled;
    setIsChatEnabled(newState); // Optimistic UI

    if (!meetingCode) return;

    try {
      await toggleChatApi({
        meetingCode,
        isChatEnabled: newState,
      }).unwrap();
    } catch (error: any) {
      if (error?.code) {
        const errorCode = String(error.code);
        toast.error(t(errorCode) || t("5011"));
      } else toast.error(tSession("general_action_error"));
      setIsChatEnabled(!newState); // Rollback nếu lỗi
    }
  };

  // Hàm xử lý bật/tắt Phòng chờ
  const handleToggleWaitingRoom = async () => {
    const newState = !isWaitingRoomEnabled;
    setIsWaitingRoomEnabled(newState); // Optimistic UI

    if (!meetingCode) return;

    try {
      await toggleWaitingRoomApi({
        meetingCode,
        isWaitingRoomEnabled: newState,
      }).unwrap();
    } catch (error: any) {
      if (error?.code) {
        const errorCode = String(error.code);
        toast.error(t(errorCode) || t("5011"));
      } else toast.error(tSession("general_action_error"));
      setIsWaitingRoomEnabled(!newState); // Rollback nếu lỗi
    }
  };

  // Hàm xử lý đổi quyền duyệt
  const handleUpdateApprovalPermission = async (
    permission: "admin_only" | "member_and_admin" | "everyone",
  ) => {
    const oldState = approvalPermission;
    setApprovalPermission(permission); // Optimistic UI

    if (!meetingCode) return;

    try {
      await updateApprovalPermissionApi({
        code: meetingCode,
        permission: permission,
      }).unwrap();
    } catch (error: any) {
      if (error?.code) {
        const errorCode = String(error.code);
        toast.error(t(errorCode) || t("5011"));
      } else toast.error(tSession("general_action_error"));
      setApprovalPermission(oldState); // Rollback
    }
  };

  const handleEndBreakout = async () => {
    if (!meetingCode) return;
    try {
      await endBreakoutApi({
        code: meetingCode,
      }).unwrap();
    } catch (error: any) {
      console.error("Lỗi khi kết thúc breakout", error);
      if (error?.code) {
        toast.error(t(String(error.code)) || tToolbar("end_breakout_error"));
      } else {
        toast.error(tToolbar("end_breakout_error"));
      }
    }
  };



  const isCloudRecordingStopping = recordingInfo?.status === "stopping";
  const isCloudRecordingActive = !!recordingInfo?.isRecording && !isCloudRecordingStopping;
  const isRecordingByMe =
    (isCloudRecordingActive || isCloudRecordingStopping) &&
    !!recordingInfo?.recorderId &&
    recordingInfo.recorderId === localParticipant?.identity;
  const isRecordingByOther =
    (isCloudRecordingActive || isCloudRecordingStopping) &&
    !!recordingInfo?.recorderId &&
    recordingInfo.recorderId !== localParticipant?.identity;

  return {
    isChatEnabled,
    canChat,
    isWaitingRoomEnabled,
    approvalPermission,
    canAccessWhiteboard,
    isBreakoutActive,
    breakoutRoomsList,
    breakoutDuration,
    breakoutStartedAt,
    isHost,
    roomType,
    meetingType,
    isPersonalMeeting: meetingType === "personal",
    roomName,
    isEndingBreakout,
    recordingInfo,
    isCloudRecordingActive,
    isCloudRecordingStopping,
    isRecordingByMe,
    isRecordingByOther,

    handleToggleChat,
    handleToggleWaitingRoom,
    handleUpdateApprovalPermission,
    handleEndBreakout,
  };
}
