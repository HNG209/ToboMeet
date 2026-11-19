// src/components/meeting/MeetingLobby.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Loader2,
  ChevronDown,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useMeetingSessionContext } from "./contexts/MeetingSessionContext";
import { useCanStartMeetingQuery } from "@/lib/redux/api/meetingsApi";

interface MeetingLobbyProps {
  meetingCode: string;
  displayName: string;
  setDisplayName: (name: string) => void;
  camOn: boolean;
  setCamOn: (val: boolean) => void;
  micOn: boolean;
  setMicOn: (val: boolean) => void;
  isJoining: boolean;
}

async function detectBestResolution(deviceId: string) {
  const resolutions = [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 800, height: 600 },
    { width: 640, height: 480 },
    { width: 320, height: 240 },
  ];

  for (const resolution of resolutions) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: resolution.width,
          height: resolution.height,
        },
      });
      stream.getTracks().forEach((t) => t.stop());
      return resolution;
    } catch { }
  }
  return { width: 640, height: 480 };
}

export default function MeetingLobby({
  meetingCode,
  displayName,
  setDisplayName,
  camOn,
  setCamOn,
  micOn,
  setMicOn,
  isJoining,
}: MeetingLobbyProps) {
  const t = useTranslations("meeting.lobby");
  const { handleJoinByCode } = useMeetingSessionContext();

  const { data: canStartData, isLoading: isCheckingCanStart } =
    useCanStartMeetingQuery({ meetingCode }, { skip: !meetingCode });

  const canStart = canStartData?.canStart ?? false;

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<
    MediaDeviceInfo[]
  >([]);

  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicId, setSelectedMicId] = useState("");
  const [selectedSpeakerId, setSelectedSpeakerId] = useState("");

  const [cameraResolution, setCameraResolution] = useState({
    width: 640,
    height: 480,
  });

  const [isE2EE, setIsE2EE] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPermissionChecked, setIsPermissionChecked] = useState(false);

  useEffect(() => {
    const requestInitialPermissions = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        console.warn("Người dùng từ chối quyền hoặc lỗi thiết bị:", error);
        toast.error(t("permission_error"));
      } finally {
        setIsPermissionChecked(true);
      }
    };

    requestInitialPermissions();
  }, []);

  useEffect(() => {
    if (!isPermissionChecked) return;

    let currentStream: MediaStream | null = null;

    const startMedia = async () => {
      try {
        if (!camOn && !micOn) {
          if (videoRef.current) videoRef.current.srcObject = null;
          await enumerateDevices();
          return;
        }

        const constraints: MediaStreamConstraints = {
          video: camOn
            ? selectedCameraId
              ? { deviceId: { exact: selectedCameraId } }
              : true
            : false,
          audio: micOn
            ? selectedMicId
              ? { deviceId: { exact: selectedMicId } }
              : true
            : false,
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        await enumerateDevices();

        if (videoRef.current && camOn) {
          videoRef.current.srcObject = currentStream;
        } else if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      } catch (err) {
        toast.error(t("media_access_error"));
        console.error("Lỗi media preview:", err);
      }
    };

    const enumerateDevices = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");
      const mics = devices.filter((d) => d.kind === "audioinput");
      const speakers = devices.filter((d) => d.kind === "audiooutput");

      setVideoDevices(cameras);
      setAudioDevices(mics);
      setAudioOutputDevices(speakers);

      if (!selectedCameraId && cameras.length > 0)
        setSelectedCameraId(cameras[0].deviceId);
      if (!selectedMicId && mics.length > 0) setSelectedMicId(mics[0].deviceId);
      if (!selectedSpeakerId && speakers.length > 0)
        setSelectedSpeakerId(speakers[0].deviceId);
    };

    startMedia();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [
    camOn,
    micOn,
    selectedCameraId,
    selectedMicId,
    selectedSpeakerId,
    isPermissionChecked,
  ]);

  const handleCameraChange = async (deviceId: string) => {
    setSelectedCameraId(deviceId);
    const resolution = await detectBestResolution(deviceId);
    setCameraResolution(resolution);
  };

  const handleJoin = () => {
    sessionStorage.setItem(
      `device_config_${meetingCode}`,
      JSON.stringify({
        camOn,
        micOn,
        micId: selectedMicId,
        speakerId: selectedSpeakerId,
        cameraConfig: cameraResolution,
      }),
    );
    handleJoinByCode(canStart, false, isE2EE);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] flex items-center justify-center p-4 lg:p-8 font-sans">
      <style>{`
        @keyframes smoothFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes slideUpStagger {
          0% { opacity: 0; transform: translateY(30px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: smoothFadeIn 0.8s ease-out forwards;
        }
        .animate-slide-up-1 {
          opacity: 0;
          animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
        }
        .animate-slide-up-2 {
          opacity: 0;
          animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
        }
        .animate-slide-up-3 {
          opacity: 0;
          animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;
        }
      `}</style>

      {/* Nền trang trí */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/30 via-[#0a0a0a] to-[#0a0a0a]" />
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-brand-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[380px] h-[380px] rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-[460px] h-[460px] rounded-full bg-blue-500/8 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* Card chính */}
      <div className="relative z-10 w-full max-w-5xl animate-fade-in">
        <div className="rounded-3xl border border-white/10 bg-[#121214]/90 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 lg:px-8 py-5 border-b border-white/5 animate-slide-up-1">
            <div>
              <h1 className="text-xl lg:text-2xl font-semibold text-white tracking-tight">
                {t("title")}
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10">
              <span className="text-[11px] text-slate-500">
                {t("meeting_code")}
              </span>
              <span className="text-sm font-semibold font-mono text-brand-400 tracking-wide">
                {meetingCode}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 lg:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Preview */}
              <div className="lg:col-span-7 flex flex-col items-center animate-slide-up-2">
                <div className="w-full aspect-video rounded-2xl overflow-hidden relative bg-[#0a0a0a] border border-white/10 shadow-inner flex items-center justify-center">
                  {camOn ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100 transition-opacity duration-700 opacity-100"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-slate-500 animate-fade-in">
                      <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-3">
                        <VideoOff size={28} className="opacity-70" />
                      </div>
                      <span className="text-sm font-medium">
                        {t("camera_off")}
                      </span>
                    </div>
                  )}

                  {!micOn && (
                    <div className="absolute top-3 right-3 bg-rose-500/90 text-white p-2 rounded-xl shadow-lg border border-rose-400/30 animate-fade-in">
                      <MicOff size={15} />
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                </div>

                <div className="flex gap-3 justify-center mt-5">
                  <button
                    type="button"
                    onClick={() => setMicOn(!micOn)}
                    className={`p-3.5 rounded-full transition-all duration-200 shadow-lg hover:scale-105 active:scale-95 border ${micOn
                      ? "bg-white/10 hover:bg-white/15 text-white border-white/10"
                      : "bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border-rose-500/30"
                      }`}
                    title={micOn ? t("turn_off_mic") : t("turn_on_mic")}
                  >
                    {micOn ? <Mic size={20} /> : <MicOff size={20} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCamOn(!camOn)}
                    className={`p-3.5 rounded-full transition-all duration-200 shadow-lg hover:scale-105 active:scale-95 border ${camOn
                      ? "bg-white/10 hover:bg-white/15 text-white border-white/10"
                      : "bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border-rose-500/30"
                      }`}
                    title={camOn ? t("turn_off_cam") : t("turn_on_cam")}
                  >
                    {camOn ? <Video size={20} /> : <VideoOff size={20} />}
                  </button>
                </div>
              </div>

              {/* Form */}
              <div className="lg:col-span-5 space-y-4 animate-slide-up-3">
                <div>
                  <label className="block text-[13px] font-medium text-slate-400 mb-1.5">
                    {t("display_name_label")}
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("display_name_placeholder")}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10 placeholder:text-slate-600 focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition-all"
                  />
                </div>

                <div className="relative">
                  <label className="block text-[13px] font-medium text-slate-400 mb-1.5">
                    {t("mic_label")}
                  </label>
                  <select
                    value={selectedMicId}
                    onChange={(e) => setSelectedMicId(e.target.value)}
                    className="w-full appearance-none truncate text-sm text-white bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 pr-10 focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition-all cursor-pointer"
                  >
                    {audioDevices.map((device) => (
                      <option
                        key={device.deviceId}
                        value={device.deviceId}
                        className="bg-[#1c1c1e] text-white"
                      >
                        {device.label || t("default_mic")}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-[38px] pointer-events-none text-slate-500">
                    <ChevronDown size={15} />
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-[13px] font-medium text-slate-400 mb-1.5">
                    {t("speaker_label")}
                  </label>
                  <select
                    value={selectedSpeakerId}
                    onChange={(e) => setSelectedSpeakerId(e.target.value)}
                    className="w-full appearance-none truncate text-sm text-white bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 pr-10 focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition-all cursor-pointer"
                  >
                    {audioOutputDevices.length > 0 ? (
                      audioOutputDevices.map((device) => (
                        <option
                          key={device.deviceId}
                          value={device.deviceId}
                          className="bg-[#1c1c1e] text-white"
                        >
                          {device.label || t("default_speaker")}
                        </option>
                      ))
                    ) : (
                      <option value="" className="bg-[#1c1c1e] text-white">
                        {t("default_speaker")}
                      </option>
                    )}
                  </select>
                  <div className="absolute right-3.5 top-[38px] pointer-events-none text-slate-500">
                    <ChevronDown size={15} />
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-[13px] font-medium text-slate-400 mb-1.5">
                    {t("camera_label")}
                  </label>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="w-full appearance-none truncate text-sm text-white bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 pr-10 focus:outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/30 transition-all cursor-pointer"
                  >
                    {videoDevices.map((device) => (
                      <option
                        key={device.deviceId}
                        value={device.deviceId}
                        className="bg-[#1c1c1e] text-white"
                      >
                        {device.label || t("default_camera")}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-[38px] pointer-events-none text-slate-500">
                    <ChevronDown size={15} />
                  </div>
                </div>

                {/* TÙY CHỌN MÃ HÓA ĐẦU CUỐI (CHỈ HIỂN THỊ KHI BẮT ĐẦU CUỘC HỌP) */}
                {canStart && (
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex flex-col gap-2.5 transition-all">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isE2EE}
                        onChange={(e) => setIsE2EE(e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/30 accent-emerald-500 cursor-pointer"
                      />
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                        <ShieldCheck size={15} className="text-emerald-400" />
                        <span>
                          {t("e2ee_label", {
                            defaultValue: "Mã hoá đầu cuối an toàn",
                          })}
                        </span>
                      </div>
                    </label>

                    {isE2EE && (
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-tight animate-fade-in">
                        <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-400" />
                        <span>
                          <strong>
                            {t("e2ee_warning_prefix", { defaultValue: "Lưu ý:" })}
                          </strong>{" "}
                          {t("e2ee_warning", {
                            defaultValue:
                              "Ghi hình đám mây (Cloud Recording) và phụ đề trực tiếp sẽ không khả dụng khi bật tính năng này.",
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={isJoining || isCheckingCanStart || !isPermissionChecked}
                    className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:hover:bg-brand-600 shadow-lg shadow-brand-600/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 flex justify-center items-center gap-2"
                  >
                    {isJoining || isCheckingCanStart ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : canStart ? (
                      t("start_button", { defaultValue: "Bắt đầu cuộc họp" })
                    ) : (
                      t("join_button")
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          {t("privacy_notice")}
        </p>
      </div>
    </div>
  );
}
