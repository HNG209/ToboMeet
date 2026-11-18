import { useCallback, useState, useEffect } from "react";
import { useIsRecording, useRoomContext } from "@livekit/components-react";
import { toast } from "sonner";
import {
  useStartCloudRecordingMutation,
  useStopCloudRecordingMutation,
} from "@/lib/redux/api/meetingsApi";
import { useTranslations } from "next-intl";

export function useCloudRecorder({
  meetingCode,
}: {
  meetingCode?: string;
} = {}) {
  const t = useTranslations("meeting.toolbar");
  const tServer = useTranslations("server.errors");
  const room = useRoomContext();
  const targetCode = meetingCode || room?.name;

  const isLivekitRecording = useIsRecording();
  const [isFinalizingStop, setIsFinalizingStop] = useState(false);

  const [startCloudRecordingApi, { isLoading: isStarting }] =
    useStartCloudRecordingMutation();
  const [stopCloudRecordingApi, { isLoading: isStoppingApi }] =
    useStopCloudRecordingMutation();

  // Khi LiveKit room ghi nhận Egress đã thoát hẳn -> giải phóng cờ đang dừng
  useEffect(() => {
    if (!isLivekitRecording) {
      setIsFinalizingStop(false);
    }
  }, [isLivekitRecording]);

  const startRecording = useCallback(async () => {
    if (!targetCode) return;
    try {
      await startCloudRecordingApi({ meetingCode: targetCode }).unwrap();
      toast.success(t("cloud_recording_started"));
    } catch (error: any) {
      console.error("Lỗi khi bắt đầu ghi hình trên cloud:", error);
      const errorCode = error?.data?.code || error?.code;
      const errorMsg = error?.data?.message || error?.message;
      if (errorCode) {
        try {
          toast.error(tServer(String(errorCode)));
        } catch {
          toast.error(errorMsg || t("cloud_recording_error"));
        }
      } else if (errorMsg) {
        toast.error(errorMsg);
      } else {
        toast.error(t("cloud_recording_error"));
      }
    }
  }, [targetCode, startCloudRecordingApi, t, tServer]);

  const stopRecording = useCallback(async () => {
    if (!targetCode) return;
    try {
      await stopCloudRecordingApi({ meetingCode: targetCode }).unwrap();
      setIsFinalizingStop(true);
      toast.success(t("cloud_recording_stopped"));
    } catch (error: any) {
      console.error("Lỗi khi dừng ghi hình trên cloud:", error);
      const errorCode = error?.data?.code || error?.code;
      const errorMsg = error?.data?.message || error?.message;
      if (errorCode) {
        try {
          toast.error(tServer(String(errorCode)));
        } catch {
          toast.error(errorMsg || t("cloud_recording_error"));
        }
      } else if (errorMsg) {
        toast.error(errorMsg);
      } else {
        toast.error(t("cloud_recording_error"));
      }
    }
  }, [targetCode, stopCloudRecordingApi, t, tServer]);

  const isStopping = isStoppingApi || isFinalizingStop;
  const isRecording = isLivekitRecording && !isFinalizingStop;

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isStarting,
    isStopping,
    isLoading: isStarting || isStopping,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
