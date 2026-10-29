// src/hooks/useMeetingSession.ts
import { useParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useDeviceId } from "@/hooks/useDeviceId";
import { useMeetingCacheManager } from "@/hooks/useMeetingCacheManager";
import {
  useJoinBreakoutRoomMutation,
  useJoinMeetingMutation,
  useLazyGetMemberStatusQuery,
  useReturnToMainRoomMutation,
} from "@/lib/redux/api/meetingsApi";
import { useGetMeQuery } from "@/lib/redux/api/usersApi";
import { useTranslations } from "next-intl";

export function useMeetingSession() {
  const t = useTranslations("server.errors");
  const tSession = useTranslations("meeting.session");
  const params = useParams();
  const deviceId = useDeviceId();
  const { clearMeetingDeviceStatus, syncMeetingEnded } = useMeetingCacheManager();
  const [getMemberStatus] = useLazyGetMemberStatusQuery();

  const meetingCode = params.code as string; // parent/main meeting code

  // Trạng thái thiết bị (Lobby)
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [hardwareConfig, setHardwareConfig] = useState<{
    micId?: string | null;
    speakerId?: string | null;
    parsedCameraConfig?: {
      deviceId?: string;
      width?: number;
      height?: number;
    } | null;
  }>({});
  const [displayName, setDisplayName] = useState("");

  // Dữ liệu meeting cá nhân
  // roomId + channelId chỉ có khi người dùng là thành viên của kênh
  const [meetingData, setMeetingData] = useState<{
    token: string;
    roomId?: string;
    channelId?: string;
    ownerId?: string;
  } | null>(null);

  // Trạng thái kết nối
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [status, setStatus] = useState<
    | "IN_LOBBY"
    | "JOINED"
    | "RECONNECTING"
    | "SWITCHING_BREAKOUT"
    | "RETURNING_TO_MAIN"
  >("IN_LOBBY");

  const [joinMeetingApi, { isLoading: isJoining }] = useJoinMeetingMutation();
  const [returnToMainRoomApi, { isLoading: isLeavingBreakout }] =
    useReturnToMainRoomMutation();
  const [joinBreakoutApi, { isLoading: isJoiningBreakout }] =
    useJoinBreakoutRoomMutation();

  const hasTriedReconnectRef = useRef(false);
  const isUnloadingRef = useRef(false);

  // ===== KIỂM TRA ĐĂNG NHẬP (AUTHENTICATION) =====
  const {
    data: myProfile,
    error: myProfileError,
    isLoading: isAuthenticating,
  } = useGetMeQuery();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (!myProfile) return;
    if (!myProfile.displayName) return;
    setDisplayName(myProfile.displayName);
  }, [myProfile]);

  useEffect(() => {
    if (!isAuthenticating) {
      if (myProfile !== undefined) {
        // Có dữ liệu trả về thành công -> Đã đăng nhập
        setIsAuthenticated(true);
      } else if (myProfileError) {
        // Có lỗi (thường là 401/403) -> Chưa đăng nhập
        setIsAuthenticated(false);
      }
    }
  }, [myProfile, myProfileError, isAuthenticating]);
  // =================================================

  // Phục hồi lại cài đặt thiết bị từ sessionStorage
  useEffect(() => {
    const storedConfigStr = sessionStorage.getItem(
      `device_config_${meetingCode}`,
    );
    if (storedConfigStr) {
      try {
        const storedConfig = JSON.parse(storedConfigStr);
        setCamOn(storedConfig.camOn ?? false);
        setMicOn(storedConfig.micOn ?? false);
        setHardwareConfig({
          micId: storedConfig.micId,
          speakerId: storedConfig.speakerId,
          parsedCameraConfig: storedConfig.cameraConfig,
        });
      } catch (e) {
        console.error("Lỗi khi đọc cấu hình thiết bị từ session", e);
      }
    }
  }, [meetingCode]);

  // Lắng nghe sự kiện F5 hoặc tắt Tab
  useEffect(() => {
    const handleBeforeUnload = () => {
      isUnloadingRef.current = true;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, []);

  const handleSmartRedirect = async (
    fallbackRoomId?: string,
    isIntentionalLeave = false,
  ) => {
    try {
      const memberStatus = await getMemberStatus({ meetingCode }).unwrap();

      if (memberStatus.isMember && memberStatus.roomId) {
        window.location.href = `/room/${memberStatus.roomId}`;
      } else {
        if (isIntentionalLeave) {
          window.location.href = "/dashboard";
        } else {
          setStatus("IN_LOBBY");
        }
      }
    } catch (error) {
      if (fallbackRoomId) {
        window.location.href = `/room/${fallbackRoomId}`;
      } else {
        window.location.href = "/dashboard";
      }
    }
  };

  // Tham gia phòng breakout
  const handleSwitchToBreakout = useCallback(
    async (newRoomId: string) => {
      if (!deviceId) return;

      try {
        const response = await joinBreakoutApi({
          code: meetingCode,
          breakoutRoomId: newRoomId,
          deviceId,
        }).unwrap();

        setStatus("SWITCHING_BREAKOUT");

        // Cập nhật Token mới
        setMeetingData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            token: response.token,
            roomId: newRoomId,
          };
        });

        setTimeout(() => {
          setStatus("JOINED");
        }, 1000);
      } catch (error: any) {
        const msg = error?.code
          ? t(String(error.code))
          : tSession("join_breakout_error");
        toast.error(msg);
        setStatus("JOINED");
      }
    },
    [meetingCode, deviceId, joinBreakoutApi, t, tSession],
  );

  // Quay về phòng chính
  const handleReturnToMain = useCallback(
    async (fullBreakoutRoomName: string) => {
      if (!deviceId) return;
      try {
        const response = await returnToMainRoomApi({
          fullBreakoutRoomName,
          deviceId: deviceId,
        }).unwrap();

        setStatus("RETURNING_TO_MAIN");

        // Cập nhật lại token để tham gia phòng
        setMeetingData({
          token: response.token,
          roomId: response.roomId,
          channelId: response.channelId,
        });

        setTimeout(() => {
          setStatus("JOINED");
        }, 1000);
      } catch (error: any) {
        const msg = error?.code
          ? t(String(error.code))
          : tSession("return_main_error");
        toast.error(msg);
        setStatus("JOINED");
      }
    },
    [deviceId, returnToMainRoomApi, t, tSession],
  );

  // Tham gia/bắt đầu cuộc họp
  const handleJoinByCode = useCallback(async (allowStart = false) => {
    if (!meetingCode) return;
    if (!deviceId) {
      console.log("[Meeting] Waiting for deviceId...");
      return;
    }

    try {
      const savedName = sessionStorage.getItem(`meeting_name_${meetingCode}`);
      const finalName = displayName || savedName || undefined;

      const response = await joinMeetingApi({
        meetingCode,
        deviceId: deviceId,
        displayName: finalName,
        allowStart: allowStart,
      }).unwrap();

      sessionStorage.setItem(`is_joined_${meetingCode}`, "true");
      if (finalName) {
        sessionStorage.setItem(`meeting_name_${meetingCode}`, finalName);
      }

      // Lưu lại thiết lập ở sảnh vào Session để xài lại
      sessionStorage.setItem(
        `device_config_${meetingCode}`,
        JSON.stringify({
          camOn,
          micOn,
          micId: hardwareConfig.micId,
          speakerId: hardwareConfig.speakerId,
          cameraConfig: hardwareConfig.parsedCameraConfig,
        }),
      );

      setMeetingData({
        token: response.token,
        roomId: response.roomId,
        channelId: response.channelId,
      });

      setStatus("JOINED");
      hasTriedReconnectRef.current = false;
    } catch (error: any) {
      sessionStorage.removeItem(`is_joined_${meetingCode}`);
      hasTriedReconnectRef.current = false;
      const errorCode = String(error.code);

      if (error?.code === 4013) {
        toast.error(
          t(errorCode) || "Bạn đang ở trong phòng này trên thiết bị/tab khác.",
        );
      } else if (error?.code === 4014) {
        toast.error(t(errorCode) || "Cuộc họp chưa bắt đầu hoặc đã kết thúc");
        await handleSmartRedirect();
      } else if (error?.code && t(errorCode)) {
        toast.error(t(errorCode));
        setStatus("IN_LOBBY");
      } else {
        toast.error(tSession("reconnect_error"));
        setStatus("IN_LOBBY");
      }
    }
  }, [meetingCode, displayName, deviceId, joinMeetingApi, t, tSession]);

  // Kiểm tra Session khi tải trang (F5 / Reconnect)
  useEffect(() => {
    if (!meetingCode) return;

    const isJoined = sessionStorage.getItem(`is_joined_${meetingCode}`);

    if (isJoined) {
      setStatus("RECONNECTING");
    } else {
      setStatus("IN_LOBBY");
    }
  }, [meetingCode]);

  // khi RECONNECTING + deviceId sẵn sàng → join
  useEffect(() => {
    if (status !== "RECONNECTING") return;
    if (!deviceId) return;
    if (hasTriedReconnectRef.current) return;

    hasTriedReconnectRef.current = true;
    handleJoinByCode();
  }, [status, deviceId, handleJoinByCode]);

  // Rời cuộc họp
  const handleDisconnect = () => {
    if (isUnloadingRef.current) return;

    setIsDisconnecting(true);

    setTimeout(() => {
      sessionStorage.removeItem(`is_joined_${meetingCode}`);
      sessionStorage.removeItem(`meeting_name_${meetingCode}`);
      // Xoá cấu hình thiết bị khi rời khỏi phòng
      sessionStorage.removeItem(`device_config_${meetingCode}`);

      clearMeetingDeviceStatus(meetingCode);
      syncMeetingEnded(meetingCode);

      if (meetingData?.roomId) {
        const syncChannel = new BroadcastChannel(
          `meeting_sync_${meetingData.roomId}`,
        );
        syncChannel.postMessage({
          type: "MEETING_DISCONNECTED",
          channelId: meetingData.channelId,
          meetingCode,
        });
        syncChannel.close();
      }

      handleSmartRedirect(meetingData?.roomId, true);
    }, 500);
  };

  return {
    isAuthenticated,
    meetingCode,
    status,
    meetingData,
    isDisconnecting,
    isJoiningBreakout,
    isLeavingBreakout,
    isJoining,
    camOn,
    micOn,
    displayName,
    hardwareConfig,

    setCamOn,
    setMicOn,
    setDisplayName,
    handleJoinByCode,
    handleDisconnect,
    handleSwitchToBreakout,
    handleReturnToMain,
  };
}
