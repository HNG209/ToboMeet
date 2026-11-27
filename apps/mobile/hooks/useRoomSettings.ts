// hooks/useRoomSettings.ts
import { useState, useEffect } from "react";
import { useLocalParticipant, useRoomInfo } from "@livekit/react-native";
import { toast } from "../lib/toast";
import {
  useEndBreakoutSessionMutation,
  useToggleMeetingChatMutation,
  useToggleWaitingRoomStatusMutation,
  useUpdateApprovalPermissionMutation,
} from "../lib/redux/features/meetings/meetingsApi";
import {
  LivekitBreakoutRoom,
  LivekitRoomMetadata,
  ParticipantMetadata,
  WhiteboardSettings,
} from "@tobomeet/shared/types";
import { useTranslation } from "react-i18next";
import { axiosInstance } from "../lib/axios";
import { socket } from "../lib/socket";

export function useRoomSettings({
  meetingCode,
}: {
  meetingCode?: string;
} = {}) {
  const { localParticipant } = useLocalParticipant();
  const { metadata: roomMetadata } = useRoomInfo();

  const [toggleChatApi] = useToggleMeetingChatMutation();
  const [toggleWaitingRoomApi] = useToggleWaitingRoomStatusMutation();
  const [updateApprovalPermissionApi] = useUpdateApprovalPermissionMutation();
  const [endBreakoutApi] = useEndBreakoutSessionMutation();

  const [isChatEnabled, setIsChatEnabled] = useState(true);
  const [isWaitingRoomEnabled, setIsWaitingRoomEnabled] = useState(false);
  const [approvalPermission, setApprovalPermission] = useState<
    "admin_only" | "member_and_admin" | "everyone"
  >("admin_only");

  const [whiteboardSettings, setWhiteboardSettings] =
    useState<WhiteboardSettings>({
      allowedRoles: ["admin", "member", "guest"],
      memberPermission: "edit",
      guestPermission: "edit",
    });

  const [roomType, setRoomType] = useState<"main" | "breakout">("main");
  const [meetingType, setMeetingType] = useState<"personal" | "channel">("channel");
  const [breakoutRoomsList, setBreakoutRoomsList] = useState<
    LivekitBreakoutRoom[]
  >([]);
  const [isBreakoutActive, setIsBreakoutActive] = useState(false);
  const [breakoutStartedAt, setBreakoutStartedAt] = useState<number>(0);
  const [breakoutDuration, setBreakoutDuration] = useState<number>(0);
  const [roomName, setRoomName] = useState<string>("");
  const [channelName, setChannelName] = useState<string>("");
  const [ownerName, setOwnerName] = useState<string>("");
  const [isE2EE, setIsE2EE] = useState<boolean>(false);

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
  } catch (e) {}

  const canAccessWhiteboard = isHost
    ? true
    : userRole === "member"
      ? (whiteboardSettings.allowedRoles?.includes("member") ?? true)
      : (whiteboardSettings.allowedRoles?.includes("guest") ?? true);

  // Fetch initial whiteboard settings từ API
  useEffect(() => {
    if (!meetingCode) return;
    axiosInstance
      .get(`/meetings/${meetingCode}/whiteboard-settings`)
      .then((res: any) => {
        if (res?.data) {
          setWhiteboardSettings(res.data);
        }
      })
      .catch(() => {});
  }, [meetingCode]);

  // Lắng nghe cập nhật realtime phân quyền Whiteboard từ socket backend
  useEffect(() => {
    if (!meetingCode) return;
    const handleWbSettingsUpdated = (newSettings: WhiteboardSettings) => {
      setWhiteboardSettings(newSettings);
    };

    socket.on("meeting:whiteboard-settings-updated", handleWbSettingsUpdated);
    return () => {
      socket.off("meeting:whiteboard-settings-updated", handleWbSettingsUpdated);
    };
  }, [meetingCode]);

  // Lắng nghe và đồng bộ trạng thái cài đặt chung từ Server (Metadata của LiveKit)
  useEffect(() => {
    if (!roomMetadata) return;
    try {
      const meta: LivekitRoomMetadata = JSON.parse(roomMetadata);

      setRoomName(meta.roomName || "");
      if (meta.channelName) setChannelName(meta.channelName);
      if (meta.ownerName) setOwnerName(meta.ownerName);
      setIsE2EE(Boolean(meta.isE2EE));
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
          if (meta.parentMetadata.channelName) {
            setChannelName(meta.parentMetadata.channelName);
          }
          if (meta.parentMetadata.ownerName) {
            setOwnerName(meta.parentMetadata.ownerName);
          }
        }

        setBreakoutStartedAt(meta.startedAt || 0);
        setBreakoutDuration(meta.durationMinutes || 0);
        setIsWaitingRoomEnabled(false);
      } else {
        setRoomType("main");

        setIsChatEnabled(meta.isChatEnabled);
        setIsWaitingRoomEnabled(meta.isWaitingRoomEnabled);
        setApprovalPermission(meta.approvalPermission);

        setIsBreakoutActive(meta.breakoutSession?.status === "active");
        setBreakoutRoomsList(meta.breakoutSession?.rooms || []);
        setBreakoutStartedAt(meta.breakoutSession?.startedAt || 0);
      }
    } catch (e) {
      console.error("Lỗi parse metadata phòng:", e);
    }
  }, [roomMetadata]);

  const canChat = isChatEnabled || isHost;

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
      if (error?.code === 4032 || error?.status === 403) {
        toast.error("Bạn không đủ quyền thực hiện chức năng này");
      } else toast.error("Chưa thể thực hiện thao tác này");
      setIsChatEnabled(!newState); // Rollback nếu lỗi
    }
  };

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
      if (error?.code === 4032 || error?.status === 403) {
        toast.error("Bạn không đủ quyền thực hiện chức năng này");
      } else toast.error("Chưa thể thực hiện thao tác này");
      setIsWaitingRoomEnabled(!newState); // Rollback nếu lỗi
    }
  };

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
      if (error?.code === 4032 || error?.status === 403) {
        toast.error("Bạn không đủ quyền thực hiện chức năng này");
      } else toast.error("Chưa thể thực hiện thao tác này");
      setApprovalPermission(oldState); // Rollback
    }
  };

  const { t } = useTranslation();

  const handleEndBreakout = async () => {
    if (!meetingCode) return;
    try {
      await endBreakoutApi({
        code: meetingCode,
      }).unwrap();
      toast.success(
        t("meeting.toolbar.end_breakout_success", {
          defaultValue: "Đã kết thúc phiên thảo luận nhóm",
        }),
      );
    } catch (error: any) {
      console.error("Lỗi khi kết thúc breakout", error);
      toast.error(
        t("meeting.toolbar.end_breakout_error", {
          defaultValue: "Không thể kết thúc thảo luận lúc này.",
        }),
      );
    }
  };

  return {
    isChatEnabled,
    canChat,
    isWaitingRoomEnabled,
    approvalPermission,
    isBreakoutActive,
    breakoutRoomsList,
    breakoutDuration,
    breakoutStartedAt,
    isHost,
    roomType,
    meetingType,
    roomName,
    channelName,
    ownerName,
    isE2EE,
    whiteboardSettings,
    canAccessWhiteboard,

    handleToggleChat,
    handleToggleWaitingRoom,
    handleUpdateApprovalPermission,
    handleEndBreakout,
  };
}

