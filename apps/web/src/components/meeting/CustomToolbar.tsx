import { useHandRaise } from "@/hooks/useHandRaise";
import { useParticipantManager } from "@/hooks/useParticipantManager";
import { useRoomSettings } from "@/hooks/useRoomSettings";
import {
  Check,
  Copy,
  Hand,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreVertical,
  LogOut,
  Users,
  VideoIcon,
  VideoOff,
  Loader2,
  ShieldCheck,
  UserCog,
  ChevronRight,
  UserPlus,
  Play,
  Pause,
  Square,
  Grid2X2,
  Cloud,
  Laptop,
  Info,
  Disc,
  ChevronUp,
  PenTool,
  Settings,
  Captions,
  BarChart2,
  Languages,
  Globe,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import InviteMemberModal from "./InviteMemberModal";
import { useTranslations } from "next-intl";
import { useIsElectron } from "@/hooks/useIsElectron";
import { useScreenRecorder } from "@/hooks/useScreenRecorder";
import { useCloudRecorder } from "@/hooks/useCloudRecorder";
import { useToolbarActions } from "@/hooks/useToolbarActions";
import CreateBreakoutModal from "./CreateBreakoutModal";
import JoinBreakoutModal from "./JoinBreakoutModal";
import { useSafeMeetingWhiteboard } from "./contexts/MeetingWhiteboardContext";
import { useMediaDeviceSelect, useRoomContext } from "@livekit/components-react";

const DEEPGRAM_LANGUAGES = [
  { code: "vi", label: "Tiếng Việt", native: "Vietnamese" },
  { code: "en", label: "Tiếng Anh", native: "English" },
  { code: "en-US", label: "English (US)", native: "United States" },
  { code: "en-GB", label: "English (UK)", native: "United Kingdom" },
  { code: "en-AU", label: "English (Australia)", native: "Australia" },
  { code: "en-IN", label: "English (India)", native: "India" },
  { code: "zh", label: "Tiếng Trung (Phổ thông)", native: "中文 (Mandarin)" },
  { code: "zh-CN", label: "Tiếng Trung (Giản thể)", native: "简体中文" },
  { code: "zh-TW", label: "Tiếng Trung (Phồn thể)", native: "繁體中文" },
  { code: "ja", label: "Tiếng Nhật", native: "日本語 (Japanese)" },
  { code: "ko", label: "Tiếng Hàn", native: "한국어 (Korean)" },
  { code: "fr", label: "Tiếng Pháp", native: "Français" },
  { code: "fr-CA", label: "French (Canada)", native: "Français (Canada)" },
  { code: "de", label: "Tiếng Đức", native: "Deutsch" },
  { code: "es", label: "Tiếng Tây Ban Nha", native: "Español" },
  { code: "es-419", label: "Spanish (Latin America)", native: "Español (Latinoamérica)" },
  { code: "pt", label: "Tiếng Bồ Đào Nha", native: "Português" },
  { code: "pt-BR", label: "Portuguese (Brazil)", native: "Português (Brasil)" },
  { code: "ru", label: "Tiếng Nga", native: "Русский" },
  { code: "it", label: "Tiếng Ý", native: "Italiano" },
  { code: "id", label: "Tiếng Indonesia", native: "Bahasa Indonesia" },
  { code: "th", label: "Tiếng Thái", native: "ไทย (Thai)" },
  { code: "hi", label: "Tiếng Hindi", native: "हिन्दी" },
  { code: "tr", label: "Tiếng Thổ Nhĩ Kỳ", native: "Türkçe" },
  { code: "nl", label: "Tiếng Hà Lan", native: "Nederlands" },
  { code: "pl", label: "Tiếng Ba Lan", native: "Polski" },
  { code: "sv", label: "Tiếng Thụy Điển", native: "Svenska" },
  { code: "da", label: "Tiếng Đan Mạch", native: "Dansk" },
  { code: "no", label: "Tiếng Na Uy", native: "Norsk" },
  { code: "uk", label: "Tiếng Ukraina", native: "Українська" },
  { code: "ta", label: "Tiếng Tamil", native: "தமிழ்" },
  { code: "cs", label: "Tiếng Séc", native: "Čeština" },
  { code: "el", label: "Tiếng Hy Lạp", native: "Ελληνικά" },
  { code: "fi", label: "Tiếng Phần Lan", native: "Suomi" },
  { code: "hu", label: "Tiếng Hungary", native: "Magyar" },
  { code: "ms", label: "Tiếng Mã Lai", native: "Bahasa Melayu" },
  { code: "ro", label: "Tiếng Romania", native: "Română" },
  { code: "sk", label: "Tiếng Slovakia", native: "Slovenčina" },
  { code: "bg", label: "Tiếng Bulgaria", native: "Български" },
  { code: "hr", label: "Tiếng Croatia", native: "Hrvatski" },
  { code: "ar", label: "Tiếng Ả Rập", native: "العربية" },
  { code: "multi", label: "Đa ngôn ngữ", native: "Multilingual" },
];

const TRANSLATE_LANGUAGES = [
  { code: "off", label: "Tắt dịch", native: "Off" },
  { code: "vi", label: "Tiếng Việt", native: "Vietnamese" },
  { code: "en", label: "Tiếng Anh", native: "English" },
  { code: "zh", label: "Tiếng Trung", native: "Chinese" },
  { code: "ja", label: "Tiếng Nhật", native: "Japanese" },
  { code: "ko", label: "Tiếng Hàn", native: "Korean" },
  { code: "fr", label: "Tiếng Pháp", native: "French" },
  { code: "de", label: "Tiếng Đức", native: "German" },
  { code: "es", label: "Tiếng Tây Ban Nha", native: "Spanish" },
  { code: "pt", label: "Tiếng Bồ Đào Nha", native: "Portuguese" },
  { code: "ru", label: "Tiếng Nga", native: "Russian" },
  { code: "it", label: "Tiếng Ý", native: "Italian" },
  { code: "id", label: "Tiếng Indonesia", native: "Indonesian" },
  { code: "nl", label: "Tiếng Hà Lan", native: "Dutch" },
  { code: "pl", label: "Tiếng Ba Lan", native: "Polish" },
  { code: "sv", label: "Tiếng Thụy Điển", native: "Swedish" },
  { code: "tr", label: "Tiếng Thổ Nhĩ Kỳ", native: "Turkish" },
  { code: "uk", label: "Tiếng Ukraina", native: "Ukrainian" },
  { code: "ar", label: "Tiếng Ả Rập", native: "Arabic" },
];

/**
 * COMPONENT: Thanh điều khiển (Toolbar)
 * Bố cục chuẩn Zoom: Các nút vuông vức, tràn viền chiều cao, không khoảng trống.
 * Reponsive: Gom thành 1 khối căn giữa ở màn hình sm/md, chia 3 cụm ở màn hình lg.
 */
export default function CustomToolbar({
  meetingCode,
  activeTab,
  onToggleSidebar,
  onCreatePoll,
  hasUnreadChat,
  isLiveCaptionEnabled,
  onToggleLiveCaption,
}: {
  meetingCode: string;
  activeTab: "chat" | "people" | "polls" | "captions" | null;
  onToggleSidebar: (tab: "chat" | "people" | "polls" | "captions") => void;
  onCreatePoll?: () => void;
  hasUnreadChat: boolean;
  isLiveCaptionEnabled?: boolean;
  onToggleLiveCaption?: () => void;
}) {
  const t = useTranslations("meeting.toolbar");

  const [isApprovalSubmenuOpen, setIsApprovalSubmenuOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isBreakoutModalOpen, setIsBreakoutModalOpen] = useState(false);
  const [isJoinBreakoutModalOpen, setIsJoinBreakoutModalOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isRecordMenuOpen, setIsRecordMenuOpen] = useState(false);
  const [isLeaveMenuOpen, setIsLeaveMenuOpen] = useState(false);
  const [isCamMenuOpen, setIsCamMenuOpen] = useState(false);
  const [isMicMenuOpen, setIsMicMenuOpen] = useState(false);
  const [isLangSubmenuOpen, setIsLangSubmenuOpen] = useState(false);
  const [transcribeLanguage, setTranscribeLanguage] = useState<string>("vi");
  const [langSearch, setLangSearch] = useState<string>("");

  const [isTranslateSubmenuOpen, setIsTranslateSubmenuOpen] = useState(false);
  const [translateTargetLanguage, setTranslateTargetLanguage] = useState<string>("off");
  const [translateLangSearch, setTranslateLangSearch] = useState<string>("");

  const room = useRoomContext();

  useEffect(() => {
    const saved = localStorage.getItem("tobomeet_transcribe_language") || "vi";
    setTranscribeLanguage(saved);
    if (room?.localParticipant) {
      room.localParticipant.setAttributes({
        transcribe_language: saved,
      });
    }

    const savedTranslate = localStorage.getItem("tobomeet_translate_target_language") || "off";
    setTranslateTargetLanguage(savedTranslate);
    if (room?.localParticipant) {
      room.localParticipant.setAttributes({
        translate_target_language: savedTranslate,
      });
    }
  }, [room]);

  const handleSelectLanguage = (langCode: string) => {
    setTranscribeLanguage(langCode);
    localStorage.setItem("tobomeet_transcribe_language", langCode);
    if (room?.localParticipant) {
      room.localParticipant.setAttributes({
        transcribe_language: langCode,
      });
      try {
        room.localParticipant.sendText(
          JSON.stringify({ type: "SET_LANGUAGE", language: langCode }),
          { topic: "lk.transcription.config" }
        );
      } catch (e) {
        // ignore
      }
    }
    const langObj = DEEPGRAM_LANGUAGES.find((l) => l.code === langCode);
    toast.success(
      `${t("transcribe_language_updated")}: ${langObj ? langObj.label : langCode}`
    );
  };

  const handleSelectTranslateLanguage = (langCode: string) => {
    setTranslateTargetLanguage(langCode);
    localStorage.setItem("tobomeet_translate_target_language", langCode);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("tobomeet_translate_target_changed", { detail: langCode })
      );
    }
    if (room?.localParticipant) {
      room.localParticipant.setAttributes({
        translate_target_language: langCode,
      });
      try {
        room.localParticipant.sendText(
          JSON.stringify({ type: "SET_TRANSLATE_TARGET", language: langCode }),
          { topic: "lk.transcription.config" }
        );
      } catch (e) {
        // ignore
      }
    }
    const langObj = TRANSLATE_LANGUAGES.find((l) => l.code === langCode);
    toast.success(
      langCode === "off"
        ? t("translate_off")
        : `${t("translate_language_updated")}: ${langObj ? langObj.label : langCode}`
    );
  };

  const filteredLanguages = useMemo(() => {
    const query = langSearch.trim().toLowerCase();
    if (!query) return DEEPGRAM_LANGUAGES;
    return DEEPGRAM_LANGUAGES.filter(
      (l) =>
        l.label.toLowerCase().includes(query) ||
        l.native.toLowerCase().includes(query) ||
        l.code.toLowerCase().includes(query)
    );
  }, [langSearch]);

  const filteredTranslateLanguages = useMemo(() => {
    const query = translateLangSearch.trim().toLowerCase();
    if (!query) return TRANSLATE_LANGUAGES;
    return TRANSLATE_LANGUAGES.filter(
      (l) =>
        l.label.toLowerCase().includes(query) ||
        l.native.toLowerCase().includes(query) ||
        l.code.toLowerCase().includes(query)
    );
  }, [translateLangSearch]);

  const {
    devices: videoDevices,
    activeDeviceId: activeVideoDeviceId,
    setActiveMediaDevice: setActiveVideoDevice,
  } = useMediaDeviceSelect({ kind: "videoinput" });

  const {
    devices: audioDevices,
    activeDeviceId: activeAudioDeviceId,
    setActiveMediaDevice: setActiveAudioDevice,
  } = useMediaDeviceSelect({ kind: "audioinput" });

  const { isLocalHandRaised, toggleHandRaise } = useHandRaise();
  const isElectron = useIsElectron();

  const wbContext = useSafeMeetingWhiteboard();
  const isWhiteboardActive = !!wbContext?.isWhiteboardActive;
  const isLoadingWhiteboard = !!wbContext?.isLoadingToken;
  const toggleWhiteboard = wbContext?.toggleWhiteboard || (async () => { });

  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    isSomeoneElseSharing,
    isMicLoading,
    isCamLoading,
    isScreenShareLoading,
    isCopied,
    isLeavingBreakout,

    // Actions
    toggleMic,
    toggleCam,
    toggleScreenShare,
    handleLeaveClick,
    handleCopyLink,
    handleLeaveBreakout,
  } = useToolbarActions();

  // Cloud Recorder (LiveKit Egress)
  const {
    isRecording: isCloudRecording,
    isLoading: isCloudRecordingLoading,
    startRecording: startCloudRecording,
    stopRecording: stopCloudRecording,
  } = useCloudRecorder({
    meetingCode,
  });

  // Local Recorder (Electron MediaRecorder)
  const {
    isRecording: isLocalRecording,
    isPaused: isLocalPaused,

    // Actions
    pauseRecording: pauseLocalRecording,
    resumeRecording: resumeLocalRecording,
    startRecording: startLocalRecording,
    stopRecording: stopLocalRecording,
  } = useScreenRecorder({
    isMicrophoneEnabled, // Chỉ thu mic khi người dùng mở
  });

  const {
    isHost,
    isChatEnabled,
    isWaitingRoomEnabled,
    isBreakoutActive,
    approvalPermission,
    canAccessWhiteboard,
    breakoutRoomsList,
    roomType,
    isPersonalMeeting,
    isEndingBreakout,
    recordingInfo,
    isCloudRecordingActive,
    isRecordingByMe,
    isRecordingByOther,

    // Actions
    handleToggleChat,
    handleEndBreakout,
    handleToggleWaitingRoom,
    handleUpdateApprovalPermission,
  } = useRoomSettings({
    meetingCode,
  });

  const isEffectiveCloudRecording =
    isCloudRecording || isCloudRecordingActive || !!recordingInfo?.isRecording;

  const canShowCloudRecordOption = isEffectiveCloudRecording
    ? isRecordingByMe
    : isHost;

  // Xác nhận trước khi quay màn hình bằng toast
  const handleConfirmStartCloudRecording = () => {
    setIsRecordMenuOpen(false);
    if (isInBreakoutRoom) {
      toast.error(t("cannot_record_breakout"));
      return;
    }
    if (isRecordingByOther) {
      toast.error(t("recording_by_other"));
      return;
    }
    toast(t("confirm_record_cloud_title"), {
      description: t("confirm_record_cloud_desc"),
      action: {
        label: t("confirm_record_action"),
        onClick: () => {
          startCloudRecording();
        },
      },
      cancel: {
        label: t("cancel"),
        onClick: () => { },
      },
      duration: 8000,
    });
  };

  const handleConfirmStartLocalRecording = () => {
    if (!isElectron) return;
    setIsRecordMenuOpen(false);
    toast(t("confirm_record_local_title"), {
      description: t("confirm_record_local_desc"),
      action: {
        label: t("confirm_record_action"),
        onClick: () => {
          startLocalRecording();
        },
      },
      cancel: {
        label: t("cancel"),
        onClick: () => { },
      },
      duration: 8000,
    });
  };

  const isInBreakoutRoom = roomType === "breakout";

  const { displayParticipants } = useParticipantManager({
    meetingCode,
  });

  const getBtnStyle = (
    isActive: boolean,
    customActiveColor = "text-blue-400",
  ) =>
    `relative flex flex-col items-center justify-center min-w-[50px] sm:min-w-[58px] h-11 px-2 rounded-lg transition-all cursor-pointer ${
      isActive
        ? `${customActiveColor} hover:bg-white/5`
        : "bg-transparent text-slate-300 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <footer className="flex flex-row items-center justify-center lg:justify-between h-16 px-2 sm:px-3 bg-[#111113] border-t border-[#232328] z-30 w-full shrink-0 select-none">
      {/* ================= PHẦN BÊN TRÁI: CAMERA & MICROPHONE KÈM LỰA CHỌN THIẾT BỊ ================= */}
      <div className="flex items-center gap-1 sm:gap-1.5 mr-1 sm:mr-2 h-full lg:flex-1 justify-center lg:justify-start lg:pl-1 shrink-0">
        {/* Nút Camera + Menu chọn Camera */}
        <div className="relative flex items-center h-11">
          <button
            onClick={toggleCam}
            disabled={isCamLoading}
            title={isCameraEnabled ? t("camera") : `${t("camera")} (Off)`}
            className={`h-11 min-w-[50px] sm:min-w-[56px] px-2 rounded-l-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
              !isCameraEnabled
                ? "text-red-400 hover:bg-white/5"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {isCamLoading ? (
              <Loader2 size={21} className="animate-spin text-red-400" />
            ) : isCameraEnabled ? (
              <VideoIcon size={21} />
            ) : (
              <VideoOff size={21} />
            )}
            <span className="text-[10px] mt-0.5 hidden sm:block font-medium">
              {t("camera")}
            </span>
          </button>
          <button
            onClick={() => {
              setIsCamMenuOpen(!isCamMenuOpen);
              setIsMicMenuOpen(false);
            }}
            title={t("select_camera")}
            className={`h-11 px-1.5 rounded-r-lg flex items-center justify-center transition-all cursor-pointer ${
              !isCameraEnabled
                ? "text-red-400 hover:bg-white/5"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            } ${isCamMenuOpen ? "text-white bg-white/10" : ""}`}
          >
            <ChevronUp
              size={13}
              className={`transition-transform duration-200 ${
                isCamMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Popover danh sách Camera */}
          {isCamMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsCamMenuOpen(false)}
              />
              <div className="absolute bottom-full mb-2 left-0 z-50 w-72 bg-[#161619] border border-[#232328] rounded-lg shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#232328] mb-1 flex items-center gap-1.5">
                  <VideoIcon size={12} className="text-blue-400" />
                  <span>{t("select_camera")}</span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
                  {videoDevices.length === 0 ? (
                    <div className="px-2.5 py-2 text-xs text-slate-500">
                      {t("no_camera_found")}
                    </div>
                  ) : (
                    videoDevices.map((device, idx) => {
                      const isSelected = device.deviceId === activeVideoDeviceId;
                      return (
                        <button
                          key={device.deviceId || idx}
                          onClick={async () => {
                            await setActiveVideoDevice(device.deviceId);
                            setIsCamMenuOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/20"
                              : "text-slate-300 hover:bg-[#232328] hover:text-white"
                          }`}
                        >
                          <span className="truncate mr-2">
                            {device.label || t("default_camera_label", { number: idx + 1 })}
                          </span>
                          {isSelected && (
                            <Check size={14} className="shrink-0 text-blue-400" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Nút Microphone + Menu chọn Microphone */}
        <div className="relative flex items-center h-11">
          <button
            onClick={toggleMic}
            disabled={isMicLoading}
            title={isMicrophoneEnabled ? t("mic") : `${t("mic")} (Muted)`}
            className={`h-11 min-w-[50px] sm:min-w-[56px] px-2 rounded-l-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
              !isMicrophoneEnabled
                ? "text-red-400 hover:bg-white/5"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {isMicLoading ? (
              <Loader2 size={21} className="animate-spin text-red-400" />
            ) : isMicrophoneEnabled ? (
              <Mic size={21} />
            ) : (
              <MicOff size={21} />
            )}
            <span className="text-[10px] mt-0.5 hidden sm:block font-medium">
              {t("mic")}
            </span>
          </button>
          <button
            onClick={() => {
              setIsMicMenuOpen(!isMicMenuOpen);
              setIsCamMenuOpen(false);
            }}
            title={t("select_microphone")}
            className={`h-11 px-1.5 rounded-r-lg flex items-center justify-center transition-all cursor-pointer ${
              !isMicrophoneEnabled
                ? "text-red-400 hover:bg-white/5"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            } ${isMicMenuOpen ? "text-white bg-white/10" : ""}`}
          >
            <ChevronUp
              size={13}
              className={`transition-transform duration-200 ${
                isMicMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Popover danh sách Microphone */}
          {isMicMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMicMenuOpen(false)}
              />
              <div className="absolute bottom-full mb-2 left-0 z-50 w-72 bg-[#161619] border border-[#232328] rounded-lg shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#232328] mb-1 flex items-center gap-1.5">
                  <Mic size={12} className="text-blue-400" />
                  <span>{t("select_microphone")}</span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
                  {audioDevices.length === 0 ? (
                    <div className="px-2.5 py-2 text-xs text-slate-500">
                      {t("no_mic_found")}
                    </div>
                  ) : (
                    audioDevices.map((device, idx) => {
                      const isSelected = device.deviceId === activeAudioDeviceId;
                      return (
                        <button
                          key={device.deviceId || idx}
                          onClick={async () => {
                            await setActiveAudioDevice(device.deviceId);
                            setIsMicMenuOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/20"
                              : "text-slate-300 hover:bg-[#232328] hover:text-white"
                          }`}
                        >
                          <span className="truncate mr-2">
                            {device.label || t("default_mic_label", { number: idx + 1 })}
                          </span>
                          {isSelected && (
                            <Check size={14} className="shrink-0 text-blue-400" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ================= PHẦN CHÍNH GIỮA ================= */}
      <div className="flex items-center gap-1 sm:gap-1.5 justify-center h-full shrink-0">
        <button
          onClick={() => onToggleSidebar("people")}
          className={getBtnStyle(activeTab === "people")}
        >
          <div className="relative flex items-center justify-center">
            <Users
              size={21}
              className={activeTab === "people" ? "text-brand-400" : ""}
            />
            <span className="absolute -top-1 -right-2.5 text-[10px] font-semibold text-slate-300">
              {displayParticipants.length}
            </span>
          </div>
          <span className="text-[10px] mt-0.5 hidden sm:block font-medium">
            {t("participants")}
          </span>
        </button>

        <button
          onClick={() => onToggleSidebar("chat")}
          className={getBtnStyle(activeTab === "chat")}
        >
          <div className="relative flex items-center justify-center">
            <MessageSquare
              size={21}
              className={activeTab === "chat" ? "text-brand-400" : ""}
            />
            {hasUnreadChat && activeTab !== "chat" && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 hidden sm:block font-medium">
            {t("chat")}
          </span>
        </button>

        <button
          onClick={() => onToggleSidebar("polls")}
          className={getBtnStyle(activeTab === "polls")}
          title={t("polls")}
        >
          <div className="relative flex items-center justify-center">
            <BarChart2
              size={21}
              className={activeTab === "polls" ? "text-brand-400" : ""}
            />
          </div>
          <span className="text-[10px] mt-0.5 hidden sm:block font-medium">
            {t("polls")}
          </span>
        </button>

        <button
          onClick={() => {
            if (!isLiveCaptionEnabled) {
              onToggleLiveCaption?.();
            } else {
              onToggleSidebar("captions");
            }
          }}
          className={getBtnStyle(activeTab === "captions")}
          title="Phụ đề"
        >
          <div className="relative flex items-center justify-center">
            <Captions
              size={21}
              className={activeTab === "captions" ? "text-brand-400" : ""}
            />
          </div>
          <span className="text-[10px] mt-0.5 hidden sm:block font-medium">
            Phụ đề
          </span>
        </button>

        <button
          onClick={toggleScreenShare}
          disabled={isSomeoneElseSharing || isScreenShareLoading}
          title={
            isScreenShareEnabled
              ? t("stop_share")
              : isSomeoneElseSharing
              ? t("screen_share_busy")
              : t("share_screen")
          }
          className={`hidden md:flex relative flex-col items-center justify-center min-w-[50px] sm:min-w-[58px] h-11 px-2 rounded-lg transition-all cursor-pointer ${
            isScreenShareEnabled
              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
              : "bg-transparent text-slate-300 hover:bg-white/5 hover:text-white"
          } ${isSomeoneElseSharing || isScreenShareLoading ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          {isScreenShareLoading ? (
            <Loader2
              size={21}
              className={`animate-spin ${isScreenShareEnabled ? "text-white" : "text-emerald-400"}`}
            />
          ) : (
            <MonitorUp
              size={21}
              className={isScreenShareEnabled ? "text-white" : "text-slate-300"}
            />
          )}
          <span className="text-[10px] mt-0.5 hidden sm:block font-medium">
            {isScreenShareEnabled ? t("stop_share") : t("share_screen")}
          </span>
        </button>

        {/* ================= NÚT GHI HÌNH VỚI TOOLTIP / POPOVER MENU ================= */}
        <div className="relative h-11 hidden md:flex items-center">
          <button
            onClick={() => setIsRecordMenuOpen(!isRecordMenuOpen)}
            disabled={isCloudRecordingLoading}
            className={getBtnStyle(
              isRecordMenuOpen || isEffectiveCloudRecording || isLocalRecording,
              isEffectiveCloudRecording
                ? "text-red-400"
                : isLocalRecording
                  ? "text-amber-400"
                  : "text-blue-400",
            )}
            title={t("record")}
          >
            <div className="relative flex items-center justify-center">
              {isCloudRecordingLoading ? (
                <Loader2 size={21} className="animate-spin text-red-500" />
              ) : isEffectiveCloudRecording ? (
                <div className="relative flex items-center justify-center">
                  <Disc size={21} className="text-red-500 animate-spin" />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                </div>
              ) : isLocalRecording ? (
                <div className="relative flex items-center justify-center">
                  <Disc size={21} className="text-amber-500 animate-pulse" />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                </div>
              ) : (
                <Disc
                  size={21}
                  className={isRecordMenuOpen ? "text-blue-400" : "text-slate-300"}
                />
              )}
              <ChevronUp
                size={11}
                className={`absolute -top-1.5 -right-4.5 text-slate-400 transition-transform duration-200 ${isRecordMenuOpen ? "rotate-180 text-white" : ""
                  }`}
              />
            </div>
            <span
              className={`text-[10px] mt-0.5 hidden sm:block font-medium ${isEffectiveCloudRecording
                ? "text-red-500 font-semibold"
                : isLocalRecording
                  ? "text-amber-500 font-semibold"
                  : isRecordMenuOpen
                    ? "text-blue-400 font-medium"
                    : ""
                }`}
            >
              {t("record")}
            </span>
          </button>

          {/* MENU TOOLTIP / POPOVER TÙY CHỌN GHI HÌNH */}
          {isRecordMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsRecordMenuOpen(false)}
              ></div>
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-72 bg-[#161619] border border-[#232328] rounded-lg shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#232328] mb-1 flex items-center justify-between">
                  <span>{t("record_options")}</span>
                  {(isEffectiveCloudRecording || isLocalRecording) && (
                    <span className="flex items-center gap-1 text-[9px] text-red-400 font-semibold lowercase bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                      {t("recording_in_progress")}
                    </span>
                  )}
                </div>

                {/* OPTION 1: GHI HÌNH TRÊN ĐÁM MÂY (CLOUD RECORDING) */}
                {canShowCloudRecordOption && (
                  <div className="px-1.5 py-1">
                    {isInBreakoutRoom ? (
                      <div className="w-full text-left p-2 rounded-md bg-[#131315] border border-[#232328] opacity-50 cursor-not-allowed flex items-start gap-2.5 select-none">
                        <div className="p-2 rounded-lg bg-slate-800 text-slate-500 shrink-0 mt-0.5">
                          <Cloud size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                            <span>{t("record_cloud")}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                              Cloud
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                            {t("cannot_record_breakout")}
                          </p>
                        </div>
                      </div>
                    ) : !isEffectiveCloudRecording ? (
                      <button
                        type="button"
                        disabled={isCloudRecordingLoading || isRecordingByOther}
                        onClick={handleConfirmStartCloudRecording}
                        className="w-full text-left p-2 rounded-md hover:bg-[#232328] flex items-start gap-2.5 transition-colors group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="p-2 rounded-lg bg-red-500/10 text-red-400 group-hover:bg-red-500/20 transition-colors shrink-0 mt-0.5">
                          {isCloudRecordingLoading ? (
                            <Loader2 size={16} className="animate-spin text-red-500" />
                          ) : (
                            <Cloud size={16} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-200 group-hover:text-white flex items-center justify-between">
                            <span>{t("record_cloud")}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                              Cloud
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                            {isRecordingByOther
                              ? t("recording_by_other")
                              : t("record_cloud_desc")}
                          </p>
                        </div>
                      </button>
                    ) : (
                      <div className="p-2 rounded-md bg-red-950/20 border border-red-900/30 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative flex items-center justify-center shrink-0">
                            <Cloud size={16} className="text-red-400 animate-pulse" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-red-400 truncate">
                              {t("record_cloud")}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {`${t("recording_in_progress")}...`}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isCloudRecordingLoading}
                          onClick={() => {
                            setIsRecordMenuOpen(false);
                            stopCloudRecording();
                          }}
                          className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          {isCloudRecordingLoading ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Square size={11} fill="currentColor" />
                          )}
                          <span>{t("stop_recording")}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* OPTION 2: GHI HÌNH CỤC BỘ (LOCAL RECORDING) */}
                <div className="px-1.5 pb-1">
                  {!isElectron ? (
                    <div
                      className="w-full text-left p-2 rounded-md bg-[#131315] border border-[#232328] opacity-40 cursor-not-allowed flex items-start gap-2.5 select-none"
                      title={t("electron_only_badge")}
                    >
                      <div className="p-2 rounded-lg bg-slate-800 text-slate-500 shrink-0 mt-0.5">
                        <Laptop size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                          <span>{t("record_local")}</span>
                          <span className="text-[9px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded border border-slate-700">
                            Local
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                          {t("record_local_desc")}
                        </p>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-500/80 font-medium">
                          <Info size={11} />
                          <span>{t("electron_only_badge")}</span>
                        </div>
                      </div>
                    </div>
                  ) : !isLocalRecording ? (
                    <button
                      type="button"
                      onClick={handleConfirmStartLocalRecording}
                      className="w-full text-left p-2 rounded-md hover:bg-[#232328] flex items-start gap-2.5 transition-colors group cursor-pointer"
                    >
                      <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors shrink-0 mt-0.5">
                        <Laptop size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-200 group-hover:text-white flex items-center justify-between">
                          <span>{t("record_local")}</span>
                          <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">
                            Desktop
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {t("record_local_desc")}
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div className="p-2 rounded-md bg-amber-950/20 border border-amber-900/30 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative flex items-center justify-center shrink-0">
                          <Laptop size={16} className="text-amber-400 animate-pulse" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-amber-400 truncate">
                            {t("record_local")}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {isLocalPaused ? t("pause") : `${t("recording_in_progress")}...`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={isLocalPaused ? resumeLocalRecording : pauseLocalRecording}
                          className="p-1.5 text-xs text-amber-400 hover:bg-white/10 rounded transition-colors cursor-pointer"
                          title={isLocalPaused ? t("resume") : t("pause")}
                        >
                          {isLocalPaused ? (
                            <Play size={13} fill="currentColor" />
                          ) : (
                            <Pause size={13} fill="currentColor" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsRecordMenuOpen(false);
                            stopLocalRecording();
                          }}
                          className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          title={t("stop_recording")}
                        >
                          <Square size={11} fill="currentColor" />
                          <span>{t("stop_recording")}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <button
          onClick={toggleHandRaise}
          className={getBtnStyle(
            isLocalHandRaised,
            "text-amber-400",
          )}
        >
          <Hand
            size={21}
            className={isLocalHandRaised ? "animate-bounce" : ""}
          />
          <span className="text-[10px] mt-0.5 hidden sm:block font-medium">
            {t("raise_hand")}
          </span>
        </button>

        {/* NÚT BREAKOUT: CHỈ HIỂN THỊ KHI ĐANG CÓ PHIÊN HOẠT ĐỘNG */}
        {isBreakoutActive && (
          <button
            onClick={() => setIsJoinBreakoutModalOpen(true)}
            className={getBtnStyle(
              false,
              "text-blue-400",
            )}
          >
            <Grid2X2
              size={21}
              className="text-blue-400 animate-pulse drop-shadow-md"
            />
            <span className="text-[10px] mt-0.5 hidden sm:block font-medium text-blue-400">
              {t("breakout")}
            </span>
          </button>
        )}

        {/* Nút Tuỳ chọn và phần menu còn lại */}
        <div className="relative h-11 flex items-center">
          <button
            onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
            className={getBtnStyle(isMoreMenuOpen)}
          >
            <MoreVertical size={21} />
            <span className="text-[10px] mt-0.5 hidden sm:block font-medium">
              {t("options")}
            </span>
          </button>

          {isMoreMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMoreMenuOpen(false)}
              ></div>
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-56 bg-[#161619] border border-[#232328] rounded-lg shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-[#232328] mb-1">
                  {t("general_options")}
                </div>
                <button
                  onClick={handleCopyLink}
                  className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  {isCopied ? (
                    <Check size={16} className="text-emerald-400" />
                  ) : (
                    <Copy size={16} />
                  )}
                  <span>{isCopied ? t("link_copied") : t("copy_link")}</span>
                </button>

                <button
                  onClick={() => {
                    setIsInviteModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <UserPlus size={16} />
                  <span>{t("invite_participants")}</span>
                </button>

                {/* MỞ BÌNH CHỌN CHO TẤT CẢ MỌI NGƯỜI */}
                <button
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    onToggleSidebar("polls");
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <BarChart2 size={16} />
                  <span>{t("open_polls")}</span>
                </button>

                {/* THAM GIA HOẶC ĐÓNG WHITEBOARD */}
                <div className="w-full px-3 py-1.5 flex items-center justify-between text-sm text-slate-200 hover:bg-[#232328] transition-colors rounded">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsMoreMenuOpen(false);
                      await toggleWhiteboard();
                    }}
                    disabled={!canAccessWhiteboard || isLoadingWhiteboard}
                    title={!canAccessWhiteboard ? t("whiteboard_no_permission") : undefined}
                    className="flex-1 text-left flex items-center gap-2.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isLoadingWhiteboard ? (
                      <Loader2 size={16} className="animate-spin text-blue-400" />
                    ) : (
                      <PenTool
                        size={16}
                        className={isWhiteboardActive ? "text-blue-400" : "text-slate-300"}
                      />
                    )}
                    <span className={isWhiteboardActive ? "text-blue-400 font-medium" : ""}>
                      {isWhiteboardActive
                        ? t("leave_whiteboard")
                        : t("join_whiteboard")}
                    </span>
                  </button>
                </div>

                {/* PHỤ ĐỀ (CLICK ĐỂ MỞ TAB VÀ KÍCH HOẠT AGENT) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMoreMenuOpen(false);
                    if (!isLiveCaptionEnabled) {
                      onToggleLiveCaption?.();
                    } else {
                      onToggleSidebar("captions");
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors cursor-pointer rounded"
                >
                  <Captions size={16} className="text-slate-300" />
                  <span>Phụ đề</span>
                </button>

                {isHost && (
                  <>
                    <div className="px-3 py-1.5 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-y border-[#232328] bg-[#232328]/50">
                      {t("admin_tools")}
                    </div>

                    {/* TẠO BÌNH CHỌN TRONG CUỘC HỌP */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMoreMenuOpen(false);
                        onCreatePoll?.();
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-slate-200 hover:bg-[#232328] flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <BarChart2 size={16} className="text-blue-400" />
                        <span>{t("create_poll")}</span>
                      </div>
                    </div>

                    {/* MENU CHIA NHÓM THẢO LUẬN TỰ ĐỘNG CHUYỂN ĐỔI */}
                    {!isBreakoutActive ? (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsBreakoutModalOpen(true);
                          setIsMoreMenuOpen(false); // Ẩn dropdown đi
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm text-slate-200 hover:bg-[#232328] flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <Grid2X2 size={16} className="text-blue-400" />
                          <span>{t("create_breakout")}</span>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isEndingBreakout}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await handleEndBreakout();
                          setIsMoreMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2.5 font-medium">
                          {isEndingBreakout ? (
                            <Loader2 size={16} className="animate-spin text-red-400" />
                          ) : (
                            <Square
                              size={16}
                              className="text-red-500"
                              fill="currentColor"
                            />
                          )}
                          <span>{t("end_breakout")}</span>
                        </div>
                      </button>
                    )}

                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleChat();
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-slate-200 hover:bg-[#232328] flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <MessageSquare
                          size={16}
                          className={
                            isChatEnabled
                              ? "text-emerald-400"
                              : "text-slate-500"
                          }
                        />
                        <span>{t("enable_chat")}</span>
                      </div>
                      <div
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isChatEnabled ? "bg-emerald-500" : "bg-slate-600"
                          }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isChatEnabled ? "translate-x-4" : "translate-x-0"
                            }`}
                        />
                      </div>
                    </div>

                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleWaitingRoom();
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-slate-200 hover:bg-[#232328] flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldCheck
                          size={16}
                          className={
                            isWaitingRoomEnabled
                              ? "text-amber-400"
                              : "text-slate-500"
                          }
                        />
                        <span>{t("waiting_room")}</span>
                      </div>
                      <div
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${isWaitingRoomEnabled
                          ? "bg-emerald-500"
                          : "bg-slate-600"
                          }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isWaitingRoomEnabled
                            ? "translate-x-4"
                            : "translate-x-0"
                            }`}
                        />
                      </div>
                    </div>

                    {isWaitingRoomEnabled && (
                      <div
                        className="relative"
                        onMouseEnter={() => setIsApprovalSubmenuOpen(true)}
                        onMouseLeave={() => setIsApprovalSubmenuOpen(false)}
                      >
                        <div className="w-full text-left px-3 py-2.5 text-sm text-slate-200 hover:bg-[#232328] flex items-center justify-between transition-colors cursor-pointer">
                          <div className="flex items-center gap-2.5">
                            <UserCog size={16} className="text-slate-500" />
                            <span>{t("approval_permission")}</span>
                          </div>
                          <ChevronRight size={16} className="text-slate-500" />
                        </div>

                        {isApprovalSubmenuOpen && (
                          <div className="absolute left-full bottom-0 ml-1 w-48 bg-[#161619] border border-[#232328] rounded-lg shadow-2xl py-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateApprovalPermission("admin_only");
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors cursor-pointer"
                            >
                              <Check
                                size={14}
                                className={
                                  approvalPermission === "admin_only"
                                    ? "opacity-100 text-emerald-400"
                                    : "opacity-0"
                                }
                              />
                              <span>{t("admin_only")}</span>
                            </button>

                            {!isPersonalMeeting && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateApprovalPermission(
                                    "member_and_admin",
                                  );
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors cursor-pointer"
                              >
                                <Check
                                  size={14}
                                  className={
                                    approvalPermission === "member_and_admin"
                                      ? "opacity-100 text-emerald-400"
                                      : "opacity-0"
                                  }
                                />
                                <span>{t("member_and_admin")}</span>
                              </button>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateApprovalPermission("everyone");
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-[#232328] flex items-center gap-2.5 transition-colors cursor-pointer"
                            >
                              <Check
                                size={14}
                                className={
                                  approvalPermission === "everyone"
                                    ? "opacity-100 text-emerald-400"
                                    : "opacity-0"
                                }
                              />
                              <span>{t("everyone")}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ================= PHẦN BÊN PHẢI (GỘP NÚT RỜI PHÒNG) ================= */}
      <div className="relative flex items-center h-full lg:flex-1 justify-center lg:justify-end lg:pr-1 shrink-0">
        <button
          onClick={() => {
            if (isInBreakoutRoom) {
              // Bật/tắt menu tooltip khi đang ở trong breakout room
              setIsLeaveMenuOpen(!isLeaveMenuOpen);
            } else {
              // Nếu ở phòng họp chính, chạy thẳng hàm thoát
              handleLeaveClick();
            }
          }}
          disabled={isLeavingBreakout}
          title={isInBreakoutRoom ? t("leave_short") : t("leave_meeting")}
          className="group h-10 px-3 sm:px-4 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-medium transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLeavingBreakout ? (
            <Loader2 size={18} className="animate-spin text-white" />
          ) : (
            <LogOut
              size={18}
              className="inline-block sm:hidden transition-transform duration-200 group-hover:translate-x-0.5 text-white"
            />
          )}
          <span className="hidden sm:inline text-xs font-semibold text-white">
            {isInBreakoutRoom ? t("leave_short") : t("leave_meeting")}
          </span>
        </button>

        {/* TOOLTIP MENU KHI Ở PHÒNG BREAKOUT */}
        {isLeaveMenuOpen && isInBreakoutRoom && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsLeaveMenuOpen(false)}
            ></div>
            <div className="absolute bottom-full right-2 lg:right-4 mb-2 z-50 w-52 bg-[#161619] border border-[#232328] rounded-lg shadow-2xl py-1.5 overflow-hidden animate-in fade-in zoom-in duration-200">
              <button
                onClick={() => {
                  setIsLeaveMenuOpen(false);
                  handleLeaveBreakout();
                }}
                disabled={isLeavingBreakout}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#232328] flex items-center gap-2.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <LogOut size={16} className="-scale-x-100" />
                <span>{t("leave_breakout_room")}</span>
              </button>

              <button
                onClick={() => {
                  setIsLeaveMenuOpen(false);
                  handleLeaveClick();
                }}
                className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-[#232328] flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <LogOut size={16} />
                <span>{t("leave_meeting")}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ================= MODAL MỜI THÀNH VIÊN ================= */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        meetingCode={meetingCode}
        displayParticipants={displayParticipants}
      />

      {/* ================= MODAL TẠO BREAKOUT ================= */}
      <CreateBreakoutModal
        isOpen={isBreakoutModalOpen}
        onClose={() => setIsBreakoutModalOpen(false)}
        meetingCode={meetingCode}
      />

      {/* ================= MODAL JOIN BREAKOUT ================= */}
      <JoinBreakoutModal
        meetingCode={meetingCode}
        isOpen={isJoinBreakoutModalOpen}
        onClose={() => setIsJoinBreakoutModalOpen(false)}
        rooms={breakoutRoomsList}
      />
    </footer>
  );
}
