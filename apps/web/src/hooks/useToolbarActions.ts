import { useState, useCallback, useEffect } from "react";
import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import localforage from "localforage";
import { toast } from "sonner";
import { useSelectiveSubscription } from "@/hooks/useSelectiveSubscription";
import {
  useStartScreenShareMutation,
  useStopScreenShareMutation,
} from "@/lib/redux/api/meetingsApi";
import { useTranslations } from "next-intl";
import { useDeviceId } from "./useDeviceId";
import { useMeetingSessionContext } from "@/components/meeting/contexts/MeetingSessionContext";

export function useToolbarActions() {
  const room = useRoomContext();
  const deviceId = useDeviceId();

  const code = room.name; // code sẽ là phòng hiện tại (của main hoặc breakout)
  const t = useTranslations("meeting.toolbar");
  const tServer = useTranslations("server.errors");
  const { handleReturnToMain, isLeavingBreakout } = useMeetingSessionContext();

  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant();

  const [startScreenShare] = useStartScreenShareMutation();
  const [stopScreenShare] = useStopScreenShareMutation();

  // Lấy trạng thái chia sẻ màn hình của người khác
  const { isSomeoneElseSharing } = useSelectiveSubscription();

  // Local states cho UI loading và trạng thái copy
  const [isMicLoading, setIsMicLoading] = useState(false);
  const [isCamLoading, setIsCamLoading] = useState(false);
  const [isScreenShareLoading, setIsScreenShareLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleLeaveBreakout = async () => {
    if (!deviceId || !code) return;
    handleReturnToMain(code);
  };

  const toggleMic = async () => {
    try {
      setIsMicLoading(true);
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (error) {
      console.error("Lỗi Mic:", error);
    } finally {
      setIsMicLoading(false);
    }
  };

  const toggleCam = async () => {
    try {
      setIsCamLoading(true);
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (error) {
      console.error("Lỗi Camera:", error);
    } finally {
      setIsCamLoading(false);
    }
  };

  const toggleScreenShare = async () => {
    if (isSomeoneElseSharing) {
      toast.error(
        t("screen_share_busy") || "Một người khác đang chia sẻ màn hình.",
      );
      return;
    }

    try {
      setIsScreenShareLoading(true);
      if (!isScreenShareEnabled) {
        await startScreenShare({ meetingCode: code }).unwrap();
        await localParticipant.setScreenShareEnabled(true, {
          audio: true,
          selfBrowserSurface: "include",
          systemAudio: "include",
        });
      } else {
        await localParticipant.setScreenShareEnabled(false);
        await stopScreenShare({ meetingCode: code }).unwrap();
      }
    } catch (error: any) {
      const errorMessage =
        (error?.code && tServer(String(error.code))) ||
        error?.message ||
        t("error_occurred") ||
        "Không thể thực hiện thao tác này.";
      toast.error(errorMessage);
    } finally {
      setIsScreenShareLoading(false);
    }
  };

  const leaveMeeting = useCallback(async () => {
    await localforage.removeItem(`meeting_chat_${code}`);
    room.disconnect();
    if (
      typeof window !== "undefined" &&
      (window as any).electronAPI?.confirmCloseMeetingWindow
    ) {
      (window as any).electronAPI.confirmCloseMeetingWindow();
    }
  }, [code, room]);

  const handleLeaveClick = useCallback(() => {
    toast(t("confirm_leave_title"), {
      description: t("confirm_leave_description"),
      action: { label: t("confirm_leave_action"), onClick: leaveMeeting },
      cancel: { label: t("cancel"), onClick: () => {} },
      duration: 8000,
    });
  }, [t, leaveMeeting]);

  // Lắng nghe sự kiện bấm nút [X] ở cửa sổ Desktop để kích hoạt toast xác nhận rời
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window as any).electronAPI?.onTriggerLeaveMeeting
    ) {
      const cleanup = (window as any).electronAPI.onTriggerLeaveMeeting(() => {
        handleLeaveClick();
      });
      return cleanup;
    }
  }, [handleLeaveClick]);

  const handleCopyLink = () => {
    const pathName = window.location.pathname;
    const localeRegex = /^\/[a-z]{2,3}(?=\/|$)/;
    const cleanPath = pathName.replace(localeRegex, "");
    const cleanUrl = `${window.location.origin}${cleanPath}`;

    navigator.clipboard.writeText(cleanUrl).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    isSomeoneElseSharing,
    isMicLoading,
    isCamLoading,
    isScreenShareLoading,
    isCopied,
    isLeavingBreakout,

    toggleMic,
    toggleCam,
    toggleScreenShare,
    handleLeaveClick,
    handleCopyLink,
    handleLeaveBreakout,
  };
}
