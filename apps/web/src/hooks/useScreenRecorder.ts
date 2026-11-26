import { useState, useRef, useCallback, useEffect } from "react";
import { useRoomContext } from "@livekit/components-react";
import { useMeetingConfig } from "./useMeetingConfig";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CanvasCompositor } from "@/lib/recording/canvasCompositor";
import { MeetingAudioMixer } from "@/lib/recording/meetingAudioMixer";
import { setIsLocalRecording } from "@/lib/recording/localRecordingState";

const RECORDING_WIDTH = 1920;
const RECORDING_HEIGHT = 1080;
const RECORDING_FPS = 30;
const VIDEO_BITRATE_BPS = 8_000_000; // 8 Mbps cho Full HD 1080p sắc nét chữ/code
const AUDIO_BITRATE_BPS = 192_000; // 192 kbps Opus

const PREFERRED_MIME_TYPES = [
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function selectSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return undefined;
}

interface RecordingStatusEvent {
  jobId: string;
  status: "completed" | "error";
  filePath?: string;
  format?: "mp4" | "webm";
  error?: string;
}

export function useScreenRecorder({
  isMicrophoneEnabled,
}: {
  isMicrophoneEnabled: boolean;
}) {
  const t = useTranslations("meeting.toolbar");
  const room = useRoomContext();
  const { config } = useMeetingConfig();

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const compositorRef = useRef<CanvasCompositor | null>(null);
  const audioMixerRef = useRef<MeetingAudioMixer | null>(null);
  const chunkQueueRef = useRef<Promise<void>>(Promise.resolve());

  const isRecordingRef = useRef(false);
  const isStoppingRef = useRef(false);

  // Lắng nghe kết quả xuất file chạy nền từ Electron Main Process
  useEffect(() => {
    const electronAPI = (window as any)?.electronAPI;
    if (!electronAPI?.onRecordingStatus) return;

    const cleanup = electronAPI.onRecordingStatus(
      (payload: RecordingStatusEvent) => {
        if (!payload?.jobId) return;

        if (payload.status === "completed") {
          const savedPath = payload.filePath || config.recordingPath || "Downloads";
          toast.success(t("recording_saved", { path: savedPath }), {
            id: payload.jobId,
            duration: 6000,
            ...(payload.filePath && electronAPI.showRecordingInFolder
              ? {
                  action: {
                    label: "Mở thư mục",
                    onClick: () => {
                      electronAPI.showRecordingInFolder(payload.filePath);
                    },
                  },
                }
              : {}),
          });
        } else if (payload.status === "error") {
          toast.error(payload.error || t("error_occurred"), {
            id: payload.jobId,
            duration: 6000,
          });
        }
      },
    );

    return cleanup;
  }, [config.recordingPath, t]);

  // Đồng bộ lại audio mixer ngay khi người dùng bật/tắt mic trên toolbar
  useEffect(() => {
    if (audioMixerRef.current) {
      audioMixerRef.current.syncTracks();
    }
  }, [isMicrophoneEnabled]);

  const cleanupPipelines = useCallback(() => {
    if (compositorRef.current) {
      compositorRef.current.destroy();
      compositorRef.current = null;
    }
    if (audioMixerRef.current) {
      audioMixerRef.current.destroy();
      audioMixerRef.current = null;
    }
    setIsLocalRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isStoppingRef.current) return;

    const electronAPI = (window as any)?.electronAPI;
    if (!electronAPI || !room) {
      return;
    }

    let electronSessionStarted = false;

    try {
      // 1. Bật cờ toàn cục để useSelectiveSubscription giữ subscribe ScreenShare ở mọi trang
      setIsLocalRecording(true);

      // 2. Khởi tạo Canvas Compositor 1920x1080@30fps (chỉ lấy ScreenShare, nền đen khi không có share)
      const compositor = new CanvasCompositor(room, {
        width: RECORDING_WIDTH,
        height: RECORDING_HEIGHT,
        fps: RECORDING_FPS,
      });
      compositorRef.current = compositor;
      const videoTrack = compositor.start();

      // 3. Khởi tạo Web Audio Mixer (48kHz, 1 clock chung, trộn Local/Remote Mic + ScreenShareAudio + Keep-Alive)
      const audioMixer = new MeetingAudioMixer(room);
      audioMixerRef.current = audioMixer;
      const audioTrack = await audioMixer.start();

      const combinedStream = new MediaStream([videoTrack, audioTrack]);
      const mimeType = selectSupportedMimeType();

      // 4. Mở file ghi tạm trên Electron Main Process
      const startResult = await electronAPI.startRecording({
        format: config.recordingFormat,
        savePath: config.recordingPath,
        mimeType: mimeType || "video/webm",
        fps: RECORDING_FPS,
      });

      if (startResult && startResult.success === false) {
        throw new Error(
          startResult.error || "Không thể khởi tạo phiên ghi hình trên Desktop.",
        );
      }
      electronSessionStarted = true;

      // 5. Khởi tạo MediaRecorder chất lượng cao + hàng đợi gửi chunk tuần tự
      chunkQueueRef.current = Promise.resolve();

      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: VIDEO_BITRATE_BPS,
        audioBitsPerSecond: AUDIO_BITRATE_BPS,
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      const mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          const blob = event.data;
          chunkQueueRef.current = chunkQueueRef.current
            .then(async () => {
              const buffer = await blob.arrayBuffer();
              await electronAPI.saveVideoChunk(buffer);
            })
            .catch((err) => {
              console.error("[LocalRecorder] Lỗi gửi video chunk:", err);
            });
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error("[LocalRecorder] Lỗi MediaRecorder:", event);
      };

      mediaRecorder.onstop = async () => {
        try {
          // Chờ toàn bộ chunk (bao gồm chunk cuối) được ghi xong hoàn toàn xuống đĩa
          await chunkQueueRef.current;

          // Giải phóng compositor & mixer ngay khi recorder dừng hẳn
          cleanupPipelines();

          // Electron đóng writeStream và đẩy FFmpeg sang chạy nền -> trả về gần như tức thì
          const stopResult = await electronAPI.stopRecording();
          if (stopResult && stopResult.success === false) {
            toast.error(stopResult.error || t("error_occurred"));
          } else if (stopResult?.status === "processing" && stopResult.jobId) {
            const fmtLabel = (stopResult.format || config.recordingFormat).toUpperCase();
            toast.loading(`Đang xuất file ${fmtLabel} trong nền...`, {
              id: stopResult.jobId,
              duration: Infinity,
            });
          } else {
            const savedPath =
              stopResult?.filePath || config.recordingPath || "Downloads";
            toast.success(t("recording_saved", { path: savedPath }));
          }
        } catch (err) {
          console.error("[LocalRecorder] Lỗi khi hoàn tất bản ghi:", err);
          toast.error(t("error_occurred"));
        } finally {
          mediaRecorderRef.current = null;
          isRecordingRef.current = false;
          isStoppingRef.current = false;
          setIsRecording(false);
          setIsPaused(false);
          setIsStopping(false);
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;
      isStoppingRef.current = false;
      setIsRecording(true);
      setIsPaused(false);
      setIsStopping(false);
    } catch (error) {
      console.error("[LocalRecorder] Lỗi khi bắt đầu ghi hình cục bộ:", error);
      cleanupPipelines();
      if (electronSessionStarted) {
        electronAPI.stopRecording().catch(() => {});
      }
      mediaRecorderRef.current = null;
      isRecordingRef.current = false;
      isStoppingRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      setIsStopping(false);
      toast.error(t("error_occurred"));
    }
  }, [room, config, cleanupPipelines, t]);

  const pauseRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      compositorRef.current?.pause();
      mediaRecorderRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "paused"
    ) {
      compositorRef.current?.resume();
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (isStoppingRef.current) return;

      isStoppingRef.current = true;
      setIsStopping(true);

      if (recorder.state === "paused") {
        compositorRef.current?.resume();
        recorder.resume();
      }

      // Gọi stop() sẽ tự xả chunk cuối và kích hoạt onstop ở trên
      recorder.stop();
    } else {
      cleanupPipelines();
      isRecordingRef.current = false;
      isStoppingRef.current = false;
      setIsRecording(false);
      setIsPaused(false);
      setIsStopping(false);
    }
  }, [cleanupPipelines]);

  // Nếu component unmount (vd rời phòng đột ngột khi đang quay) -> dừng gọn để vẫn xuất nền
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          if (recorder.state === "paused") {
            compositorRef.current?.resume();
            recorder.resume();
          }
          recorder.stop();
        } catch {
          cleanupPipelines();
        }
      } else {
        cleanupPipelines();
      }
    };
  }, [cleanupPipelines]);

  return {
    isRecording,
    isPaused,
    isStopping,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  };
}
