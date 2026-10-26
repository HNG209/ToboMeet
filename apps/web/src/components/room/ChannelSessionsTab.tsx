"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  useEnsureChannelMeetingMutation,
  useGetSessionAttendanceQuery,
} from "@/lib/redux/api/meetingsApi";
import { useFetchMeetingSession } from "@/hooks/useFetchMeetingSession";
import { MeetingSessionResponse, SessionAttendanceItem, SessionRecording } from "@tobomeet/shared/types";
import {
  Video,
  Clock,
  Calendar,
  Users,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Loader2,
  CheckCircle2,
  PlayCircle,
  Radio,
  Timer,
  UserCheck,
  UserX,
  FileSpreadsheet,
  HardDrive,
  Film,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import ExportAttendanceModal, { ExportMode } from "./ExportAttendanceModal";
import HlsRecordingPlayer from "./HlsRecordingPlayer";

interface ChannelSessionsTabProps {
  roomId: string;
  channelId: string;
  channelName?: string;
  userId: string;
}

export default function ChannelSessionsTab({
  roomId,
  channelId,
  channelName,
  userId,
}: ChannelSessionsTabProps) {
  const t = useTranslations("room");
  const locale = useLocale();
  const router = useRouter();

  const [meetingCode, setMeetingCode] = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<MeetingSessionResponse | null>(null);

  const [ensureChannelMeeting, { isLoading: isEnsuringMeeting }] =
    useEnsureChannelMeetingMutation();

  // Gọi ensureChannelMeeting để lấy mã phòng (meetingCode) khi mount hoặc chuyển kênh
  useEffect(() => {
    let isMounted = true;
    if (!roomId || !channelId) return;

    const fetchMeetingCode = async () => {
      try {
        const res = await ensureChannelMeeting({ roomId, channelId }).unwrap();
        if (isMounted && res?.meetingCode) {
          setMeetingCode(res.meetingCode);
        }
      } catch (err: any) {
        console.error("Lỗi khi lấy meetingCode:", err);
        if (isMounted) {
          toast.error(
            err?.data?.message || err?.message || t("session_error_get_meeting"),
          );
        }
      }
    };

    fetchMeetingCode();
    // Reset selectedSession khi đổi kênh
    setSelectedSession(null);

    return () => {
      isMounted = false;
    };
  }, [roomId, channelId, ensureChannelMeeting, t]);

  // Hook fetch meeting sessions có phân trang (50 sessions / page)
  const {
    sessions,
    hasNext,
    isInitialLoading,
    isLoadingMore,
    isFetching,
    loadMore,
    refresh,
  } = useFetchMeetingSession({
    meetingCode,
    limit: 50,
    skip: !meetingCode,
  });

  // Format ngày giờ theo locale
  const formatDateTime = (dateVal?: string | Date) => {
    if (!dateVal) return "--:--";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "--:--";
    return d.toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatTimeOnly = (dateVal?: string | Date) => {
    if (!dateVal) return "--:--";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "--:--";
    return d.toLocaleTimeString(locale === "vi" ? "vi-VN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Format thời lượng từ giây sang giờ phút giây
  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return "--";
    const sec = Math.max(0, Math.floor(seconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;

    if (h > 0) {
      return m > 0
        ? t("session_duration_hours", { hours: h, minutes: m })
        : t("session_duration_hours_only", { hours: h });
    }
    if (m > 0) {
      return s > 0
        ? t("session_duration_minutes", { minutes: m, seconds: s })
        : t("session_duration_minutes_only", { minutes: m });
    }
    return t("session_duration_seconds", { seconds: s });
  };



  // Render Skeleton khi đang tải mã phòng hoặc danh sách lần đầu
  if (isEnsuringMeeting || (isInitialLoading && sessions.length === 0)) {
    return (
      <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-slate-50/50">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
          </div>
          <div className="h-9 w-24 bg-slate-200 rounded-lg animate-pulse" />
        </div>

        <div className="space-y-3.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-full bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center justify-between gap-4 animate-pulse"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="w-12 h-12 rounded-xl bg-slate-100 shrink-0" />
                <div className="space-y-2.5 flex-1">
                  <div className="h-4 w-1/4 bg-slate-200 rounded" />
                  <div className="h-3.5 w-1/2 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="h-9 w-28 bg-slate-100 rounded-xl shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ===================== MÀN HÌNH CHI TIẾT PHIÊN HỌP =====================
  if (selectedSession) {
    return (
      <SessionDetailView
        session={selectedSession}
        onBack={() => setSelectedSession(null)}
        formatDateTime={formatDateTime}
        formatTimeOnly={formatTimeOnly}
        formatDuration={formatDuration}
        t={t}
      />
    );
  }

  // ===================== MÀN HÌNH DANH SÁCH PHIÊN HỌP (LONG CARDS) =====================
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* Header bar */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-slate-900">
              {t("sessions_title")}
            </h2>
            {channelName && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                #{channelName}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("sessions_subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-brand-600 bg-slate-100 hover:bg-brand-50 hover:border-brand-200 border border-slate-200/80 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin text-brand-600" : ""} />
            <span>{t("sessions_refresh")}</span>
          </button>
        </div>
      </div>

      {/* Danh sách các session dạng card dài */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3.5 custom-scrollbar">
        {sessions.length === 0 ? (
          <div className="h-80 flex flex-col items-center justify-center text-center p-8 bg-white border border-dashed border-slate-200 rounded-2xl">
            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-3.5">
              <Video size={28} />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              {t("sessions_empty_title")}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm">
              {t("sessions_empty_desc")}
            </p>
          </div>
        ) : (
          <>
            {sessions.map((session, index) => {
              const isOngoing = session.status === "ongoing";
              const sessionIndex = index + 1;

              return (
                <div
                  key={session._id}
                  onClick={() => setSelectedSession(session)}
                  className={`
                    group relative w-full bg-white rounded-2xl border transition-all duration-200 p-4 sm:p-5
                    flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer
                    ${isOngoing
                      ? "border-emerald-300 shadow-sm hover:shadow-md hover:border-emerald-400 bg-gradient-to-r from-emerald-50/20 via-white to-white"
                      : "border-slate-200 hover:border-brand-300 hover:shadow-md"
                    }
                  `}
                >
                  {/* Left Side: Status Icon & Details */}
                  <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                    {/* Status Badge Icon */}
                    <div
                      className={`
                        w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold transition-transform group-hover:scale-105
                        ${isOngoing
                          ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                        }
                      `}
                    >
                      {isOngoing ? (
                        <Radio size={22} className="animate-pulse" />
                      ) : (
                        <Video size={20} className="text-slate-500" />
                      )}
                    </div>

                    {/* Metadata Breakdown */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 group-hover:text-brand-600 transition-colors">
                          {t("session_item_title", { index: sessionIndex })}
                        </span>

                        {isOngoing ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            {t("session_live")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                            <CheckCircle2 size={12} className="text-slate-500" />
                            {t("session_ended")}
                          </span>
                        )}

                        <span className="text-[11px] text-slate-400 font-mono">
                          ID: {session._id.slice(-6).toUpperCase()}
                        </span>
                      </div>

                      {/* Timestamps & Info Row */}
                      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-slate-600">
                        {/* Start time */}
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400 shrink-0" />
                          <span>
                            <strong className="font-medium text-slate-700">
                              {t("session_started")}
                            </strong>{" "}
                            {formatDateTime(session.startedAt || session.createdAt)}
                          </span>
                        </div>

                        {/* End time */}
                        {session.endedAt && (
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className="text-slate-400 shrink-0" />
                            <span>
                              <strong className="font-medium text-slate-700">
                                {t("session_ended_label")}
                              </strong>{" "}
                              {formatDateTime(session.endedAt)}
                            </span>
                          </div>
                        )}

                        {/* Duration */}
                        <div className="flex items-center gap-1.5">
                          <Timer size={13} className="text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-700">
                            {t("session_duration")}{" "}
                            <span className="font-bold text-slate-900">
                              {formatDuration(session.durationSeconds)}
                            </span>
                          </span>
                        </div>

                        {/* Participants Count */}
                        {session.totalParticipants !== undefined && session.totalParticipants > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Users size={13} className="text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-700">
                              <span className="font-bold text-slate-900">
                                {t("session_participants_count", { count: session.totalParticipants })}
                              </span>
                            </span>
                          </div>
                        )}

                        {/* Recordings Count */}
                        {session.recordings && session.recordings.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Video size={13} className="text-rose-500 shrink-0" />
                            <span className="font-medium text-slate-700">
                              <span className="font-bold text-rose-700">
                                {t("session_recordings_count", { count: session.recordings.length })}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Actions & Navigate Arrow */}
                  <div className="flex items-center justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 group-hover:text-brand-600 transition-colors">
                      <span className="hidden sm:inline">
                        {t("session_details")}
                      </span>
                      <ChevronRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load more button */}
            {hasNext && (
              <div className="pt-3 pb-6 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-brand-300 text-slate-700 hover:text-brand-600 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 size={15} className="animate-spin text-brand-600" />
                      <span>{t("session_loading_more")}</span>
                    </>
                  ) : (
                    <span>{t("session_load_more")}</span>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===================== SUB-COMPONENT: SESSION DETAIL VIEW =====================

interface SessionDetailViewProps {
  session: MeetingSessionResponse;
  onBack: () => void;
  formatDateTime: (d?: string | Date) => string;
  formatTimeOnly: (d?: string | Date) => string;
  formatDuration: (s?: number) => string;
  t: any;
}

function SessionDetailView({
  session,
  onBack,
  formatDateTime,
  formatTimeOnly,
  formatDuration,
  t,
}: SessionDetailViewProps) {
  const isOngoing = session.status === "ongoing";

  const {
    data: attendanceList = [],
    isLoading: isAttendanceLoading,
    refetch: refetchAttendance,
    isFetching: isAttendanceFetching,
  } = useGetSessionAttendanceQuery({
    meetingCode: session.meetingCode,
    sessionId: session._id,
  });

  const locale = useLocale();
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeRecording, setActiveRecording] = useState<SessionRecording | null>(null);

  const recordings = session.recordings || [];

  const resolveRecordingUrl = (recording: SessionRecording) => {
    if (
      recording.playlistUrl &&
      (recording.playlistUrl.startsWith("http://") ||
        recording.playlistUrl.startsWith("https://"))
    ) {
      return recording.playlistUrl;
    }
    const publicBaseUrl =
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
      "https://pub-313a77fbb1de4d04a7cf5e485af3cbc2.r2.dev";
    const cleanBase = publicBaseUrl.replace(/\/$/, "");
    const path = recording.storagePath || recording.playlistUrl || "";
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `${cleanBase}/${cleanPath}`;
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb < 0.1) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const handleExportExcel = async ({
    lang,
    mode,
  }: {
    lang: string;
    mode: ExportMode;
  }) => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading(
      t("session_export_loading", { defaultValue: "Đang tạo file Excel..." }),
    );
    try {
      const response = await axios.get(
        `/api/meetings/${session.meetingCode}/attendance/export?sessionId=${session._id}&lang=${lang}&mode=${mode}`,
        { responseType: "blob" },
      );

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const contentDisposition = response.headers["content-disposition"];
      let fileName = `diem-danh-${session.meetingCode}-${session._id.slice(-6)}-${mode}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(
          /filename\*?=(?:UTF-8'')?([^;]+)/i,
        );
        if (match && match[1]) {
          fileName = decodeURIComponent(match[1].replace(/["']/g, ""));
        }
      }

      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(link.href);

      toast.success(
        t("session_export_success", {
          defaultValue: "Xuất file Excel thành công!",
        }),
        { id: toastId },
      );
      setShowExportModal(false);
    } catch (error) {
      console.error("Export Excel error:", error);
      toast.error(
        t("session_export_failed", {
          defaultValue: "Không thể xuất file Excel. Vui lòng thử lại!",
        }),
        { id: toastId },
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* Top Bar with Back Button */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title={t("session_back")}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                {t("session_detail_title")}
              </h2>
              {isOngoing ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  {t("session_live")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                  <CheckCircle2 size={12} className="text-slate-500" />
                  {t("session_ended")}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              Session ID: {session._id} • Meeting Code: {session.meetingCode}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2.5 text-slate-500 text-xs font-medium mb-1.5">
              <Calendar size={15} className="text-brand-500" />
              <span>{t("session_start_time")}</span>
            </div>
            <div className="text-sm font-bold text-slate-800">
              {formatDateTime(session.startedAt || session.createdAt)}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2.5 text-slate-500 text-xs font-medium mb-1.5">
              <Clock size={15} className="text-amber-500" />
              <span>{t("session_end_time")}</span>
            </div>
            <div className="text-sm font-bold text-slate-800">
              {session.endedAt
                ? formatDateTime(session.endedAt)
                : t("session_in_progress")}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2.5 text-slate-500 text-xs font-medium mb-1.5">
              <Timer size={15} className="text-purple-500" />
              <span>{t("session_total_duration")}</span>
            </div>
            <div className="text-sm font-bold text-slate-800">
              {formatDuration(session.durationSeconds)}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2.5 text-slate-500 text-xs font-medium mb-1.5">
              <Users size={15} className="text-emerald-500" />
              <span>{t("session_participants")}</span>
            </div>
            <div className="text-sm font-bold text-slate-800">
              {attendanceList.length > 0
                ? t("session_users_count", { count: attendanceList.length })
                : session.totalParticipants !== undefined
                  ? t("session_users_count", { count: session.totalParticipants })
                  : "0"}
            </div>
          </div>
        </div>

        {/* Phần Bản ghi cuộc họp (Recordings Section) - Nằm giữa Thống kê và Danh sách điểm danh */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video size={18} className="text-rose-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {t("session_recordings_title")}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">
                {t("session_recordings_count", { count: recordings.length })}
              </span>
            </div>
          </div>

          {/* Active Video Player */}
          {activeRecording && (
            <div className="p-4 sm:p-6 bg-slate-950 border-b border-slate-800">
              <HlsRecordingPlayer
                src={resolveRecordingUrl(activeRecording)}
                title={`${t("session_recording_item", {
                  index:
                    recordings.findIndex(
                      (r: SessionRecording) => r.recordingId === activeRecording.recordingId,
                    ) + 1,
                })} • ${formatDateTime(activeRecording.createdAt)}`}
                durationSeconds={activeRecording.durationSeconds}
                onClose={() => setActiveRecording(null)}
                autoPlay={true}
              />
            </div>
          )}

          {/* Recording Items Grid */}
          <div className="p-6">
            {recordings.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Film size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-medium">
                  {t("session_recordings_empty")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recordings.map((rec: SessionRecording, idx: number) => {
                  const isSelected =
                    activeRecording?.recordingId === rec.recordingId;
                  return (
                    <div
                      key={rec.recordingId || idx}
                      className={`relative p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${isSelected
                          ? "bg-rose-50/50 border-rose-300 shadow-xs"
                          : "bg-slate-50/70 hover:bg-slate-50 border-slate-200 hover:border-slate-300"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`p-2 rounded-lg ${isSelected
                                ? "bg-rose-500 text-white shadow-xs"
                                : "bg-white text-rose-600 border border-slate-200"
                              }`}
                          >
                            <Video size={16} />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">
                              {t("session_recording_item", { index: idx + 1 })}
                            </h4>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {formatDateTime(rec.createdAt)}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-700 rounded-full font-mono">
                          HLS
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-200/60 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-slate-400" />
                          <span>{formatDuration(rec.durationSeconds)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <HardDrive size={13} className="text-slate-400" />
                          <span>{formatBytes(rec.sizeBytes)}</span>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          setActiveRecording(isSelected ? null : rec)
                        }
                        className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${isSelected
                            ? "bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                            : "bg-white hover:bg-rose-600 hover:text-white text-slate-800 border border-slate-200 hover:border-rose-600 shadow-2xs"
                          }`}
                      >
                        <PlayCircle size={15} />
                        <span>
                          {isSelected
                            ? t("session_recording_playing")
                            : t("session_recording_play")}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Danh sách người tham gia / Điểm danh */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck size={18} className="text-brand-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {t("session_attendance_title")}
              </h3>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-slate-500 font-semibold">
                {t("session_records_count", { count: attendanceList.length })}
              </span>
              <button
                onClick={() => setShowExportModal(true)}
                disabled={isExporting || attendanceList.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title={t("session_export_excel", { defaultValue: "Xuất Excel" })}
              >
                {isExporting ? (
                  <Loader2 size={12} className="animate-spin text-emerald-600" />
                ) : (
                  <FileSpreadsheet size={12} className="text-emerald-600" />
                )}
                <span>{t("session_export_excel", { defaultValue: "Xuất Excel" })}</span>
              </button>
              <button
                onClick={() => refetchAttendance()}
                disabled={isAttendanceFetching}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                title={t("sessions_refresh", { defaultValue: "Làm mới" })}
              >
                <RefreshCw
                  size={12}
                  className={isAttendanceFetching ? "animate-spin text-brand-600" : ""}
                />
                <span>{t("sessions_refresh", { defaultValue: "Làm mới" })}</span>
              </button>
            </div>
          </div>

          {isAttendanceLoading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 size={24} className="animate-spin text-brand-500" />
              <p className="text-xs">{t("session_attendance_loading")}</p>
            </div>
          ) : attendanceList.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <UserX size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-medium">
                {t("session_attendance_empty")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200">
                    <th className="py-3 px-4">{t("session_th_participant")}</th>
                    <th className="py-3 px-4">{t("session_th_first_joined")}</th>
                    <th className="py-3 px-4">{t("session_th_last_left")}</th>
                    <th className="py-3 px-4">{t("session_th_time_in_session")}</th>
                    <th className="py-3 px-4 text-center">{t("session_th_visits")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceList.map((att: SessionAttendanceItem, idx: number) => {
                    return (
                      <tr key={att.userId || idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xs shrink-0">
                              {(att.displayName || "U").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate">
                                {att.displayName || t("session_user_default")}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono truncate">
                                {att.userId}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-slate-600 font-mono">
                          {formatTimeOnly(att.firstJoinedAt)}
                        </td>

                        <td className="py-3 px-4 text-slate-600 font-mono">
                          {att.lastLeftAt ? formatTimeOnly(att.lastLeftAt) : (isOngoing ? `-- (${t("session_in_call")})` : "--")}
                        </td>

                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {formatDuration(att.totalDurationSeconds)}
                        </td>

                        <td className="py-3 px-4 text-center text-slate-600 font-semibold">
                          {att.visitCount || 1}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal tùy chỉnh xuất Excel */}
      <ExportAttendanceModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onConfirm={handleExportExcel}
        isExporting={isExporting}
        defaultLang={locale}
      />
    </div>
  );
}
