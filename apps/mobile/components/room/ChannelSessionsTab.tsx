import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  useEnsureChannelMeetingMutation,
  useGetSessionAttendanceQuery,
} from "../../lib/redux/features/meetings/meetingsApi";
import { useFetchMeetingSession } from "../../hooks/useFetchMeetingSession";
import {
  MeetingSessionResponse,
  SessionAttendanceItem,
  SessionRecording,
} from "@tobomeet/shared/types";
import { toast } from "../../lib/toast";
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
  const { t, i18n } = useTranslation();
  const isVi = i18n.language === "vi";
  const router = useRouter();

  const [meetingCode, setMeetingCode] = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<MeetingSessionResponse | null>(null);

  const [ensureChannelMeeting, { isLoading: isEnsuringMeeting }] =
    useEnsureChannelMeetingMutation();

  // Gọi ensureChannelMeeting để lấy mã phòng khi mount hoặc đổi kênh
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
            err?.data?.message || err?.message || t("room.session_error_get_meeting"),
          );
        }
      }
    };

    fetchMeetingCode();
    setSelectedSession(null);

    return () => {
      isMounted = false;
    };
  }, [roomId, channelId, ensureChannelMeeting, t]);

  // Hook phân trang phiên họp
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

  const formatDateTime = (dateVal?: string | Date) => {
    if (!dateVal) return "--:--";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "--:--";
    return d.toLocaleString(isVi ? "vi-VN" : "en-US", {
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
    return d.toLocaleTimeString(isVi ? "vi-VN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatDuration = (seconds?: number) => {
    if (seconds === undefined || seconds === null) return "--";
    const sec = Math.max(0, Math.floor(seconds));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;

    if (h > 0) {
      return m > 0
        ? t("room.session_duration_hours", { hours: h, minutes: m })
        : t("room.session_duration_hours_only", { hours: h });
    }
    if (m > 0) {
      return s > 0
        ? t("room.session_duration_minutes", { minutes: m, seconds: s })
        : t("room.session_duration_minutes_only", { minutes: m });
    }
    return t("room.session_duration_seconds", { seconds: s });
  };

  const handleJoinMeeting = (code: string) => {
    router.push(`/meeting/${code}`);
  };

  // Skeleton loading khi đang lấy mã phòng hoặc tải trang đầu
  if (isEnsuringMeeting || (isInitialLoading && sessions.length === 0)) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 p-6">
        <ActivityIndicator size="large" color="#0052FF" />
        <Text className="text-slate-500 text-xs mt-3">
          {t("room.session_loading")}
        </Text>
      </View>
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
        onJoinMeeting={handleJoinMeeting}
        t={t}
      />
    );
  }

  // ===================== MÀN HÌNH DANH SÁCH PHIÊN HỌP =====================
  return (
    <View className="flex-1 bg-slate-50">
      {/* Header Bar */}
      <View className="px-4 py-3 bg-white border-b border-slate-100 flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-bold text-slate-900">
              {t("room.sessions_title")}
            </Text>
          </View>
          {channelName ? (
            <Text className="text-xs text-slate-500 mt-0.5">
              #{channelName}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => refresh()}
          disabled={isFetching}
          className="p-2 bg-slate-100 rounded-lg active:bg-slate-200"
        >
          {isFetching ? (
            <ActivityIndicator size="small" color="#0052FF" />
          ) : (
            <Feather name="refresh-cw" size={16} color="#64748B" />
          )}
        </TouchableOpacity>
      </View>

      {/* FlatList danh sách Session Cards */}
      <FlatList
        data={sessions}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoadingMore}
            onRefresh={refresh}
            colors={["#0052FF"]}
          />
        }
        ListEmptyComponent={
          <View className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 items-center justify-center my-6">
            <View className="w-12 h-12 rounded-2xl bg-slate-100 justify-center items-center mb-3">
              <Feather name="video" size={24} color="#94A3B8" />
            </View>
            <Text className="text-sm font-bold text-slate-800 mb-1 text-center">
              {t("room.sessions_empty_title")}
            </Text>
            <Text className="text-xs text-slate-500 text-center leading-relaxed max-w-xs">
              {t("room.sessions_empty_desc")}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isOngoing = item.status === "ongoing";
          const sessionIndex = index + 1;

          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSelectedSession(item)}
              className={`
                w-full bg-white rounded-2xl border p-4 mb-3 shadow-xs
                ${isOngoing ? "border-emerald-300 bg-emerald-50/10" : "border-slate-200"}
              `}
            >
              {/* Header row of Card: Status icon, Title, Badges */}
              <View className="flex-row items-center justify-between mb-2.5">
                <View className="flex-row items-center gap-2.5 flex-1">
                  <View
                    className={`
                      w-9 h-9 rounded-xl justify-center items-center
                      ${isOngoing ? "bg-emerald-500" : "bg-slate-100 border border-slate-200"}
                    `}
                  >
                    <Feather
                      name={isOngoing ? "radio" : "video"}
                      size={16}
                      color={isOngoing ? "#ffffff" : "#64748B"}
                    />
                  </View>

                  <View className="flex-1">
                    <Text className="font-bold text-sm text-slate-900">
                      {t("room.session_item_title", { index: sessionIndex })}
                    </Text>
                    <Text className="text-[11px] text-slate-400 font-mono">
                      ID: {item._id.slice(-6).toUpperCase()}
                    </Text>
                  </View>
                </View>

                {/* Status Badge */}
                {isOngoing ? (
                  <View className="px-2 py-0.5 bg-emerald-100 rounded-full border border-emerald-300 flex-row items-center gap-1">
                    <View className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <Text className="text-[10px] font-bold text-emerald-800">
                      {t("room.session_live")}
                    </Text>
                  </View>
                ) : (
                  <View className="px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200 flex-row items-center gap-1">
                    <Feather name="check" size={10} color="#64748B" />
                    <Text className="text-[10px] font-semibold text-slate-600">
                      {t("room.session_ended")}
                    </Text>
                  </View>
                )}
              </View>

              {/* Timestamp and info details */}
              <View className="space-y-1.5 border-t border-slate-100 pt-2.5">
                {/* Start time */}
                <View className="flex-row items-center gap-1.5">
                  <Feather name="calendar" size={12} color="#94A3B8" />
                  <Text className="text-xs text-slate-600">
                    <Text className="font-medium text-slate-700">
                      {t("room.session_started")}
                    </Text>
                    {formatDateTime(item.startedAt || item.createdAt)}
                  </Text>
                </View>

                {/* End time */}
                {item.endedAt ? (
                  <View className="flex-row items-center gap-1.5">
                    <Feather name="clock" size={12} color="#94A3B8" />
                    <Text className="text-xs text-slate-600">
                      <Text className="font-medium text-slate-700">
                        {t("room.session_ended_label")}
                      </Text>
                      {formatDateTime(item.endedAt)}
                    </Text>
                  </View>
                ) : null}

                {/* Duration & Badges */}
                <View className="flex-row items-center justify-between pt-1">
                  <View className="flex-row items-center gap-1.5">
                    <Feather name="watch" size={12} color="#94A3B8" />
                    <Text className="text-xs text-slate-700">
                      {t("room.session_duration")}
                      <Text className="font-bold text-slate-900">
                        {formatDuration(item.durationSeconds)}
                      </Text>
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-1.5">
                    {item.recordings && item.recordings.length > 0 && (
                      <View className="flex-row items-center gap-1 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                        <Feather name="video" size={11} color="#E11D48" />
                        <Text className="text-[11px] font-bold text-rose-700">
                          {t("room.session_recordings_count", { count: item.recordings.length })}
                        </Text>
                      </View>
                    )}

                    {item.totalParticipants !== undefined && item.totalParticipants > 0 ? (
                      <View className="flex-row items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                        <Feather name="users" size={11} color="#64748B" />
                        <Text className="text-[11px] font-bold text-slate-700">
                          {item.totalParticipants}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Bottom Action for Ongoing */}
              {isOngoing && (
                <TouchableOpacity
                  onPress={() => handleJoinMeeting(item.meetingCode)}
                  className="mt-3 w-full bg-emerald-600 active:bg-emerald-700 py-3 rounded-full flex-row items-center justify-center gap-2 shadow-sm shadow-emerald-600/30 active:scale-98"
                >
                  <Feather name="play-circle" size={16} color="#ffffff" />
                  <Text className="text-white font-bold text-[13px]">
                    {t("room.session_join_meeting_now")}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          hasNext ? (
            <TouchableOpacity
              onPress={loadMore}
              disabled={isLoadingMore}
              className="py-3 bg-white border border-slate-200 rounded-xl items-center justify-center mb-6 active:bg-slate-50"
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color="#0052FF" />
              ) : (
                <Text className="text-xs font-bold text-blue-600">
                  {t("room.session_load_more")}
                </Text>
              )}
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

// ===================== SUB-COMPONENT: SESSION DETAIL VIEW =====================

interface SessionDetailViewProps {
  session: MeetingSessionResponse;
  onBack: () => void;
  formatDateTime: (d?: string | Date) => string;
  formatTimeOnly: (d?: string | Date) => string;
  formatDuration: (s?: number) => string;
  onJoinMeeting: (code: string) => void;
  t: any;
}

function SessionDetailView({
  session,
  onBack,
  formatDateTime,
  formatTimeOnly,
  formatDuration,
  onJoinMeeting,
  t,
}: SessionDetailViewProps) {
  const isOngoing = session.status === "ongoing";
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
      process.env.EXPO_PUBLIC_R2_PUBLIC_URL ||
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

  const {
    data: attendanceList = [],
    isLoading: isAttendanceLoading,
    refetch: refetchAttendance,
    isFetching: isAttendanceFetching,
  } = useGetSessionAttendanceQuery({
    meetingCode: session.meetingCode,
    sessionId: session._id,
  });

  return (
    <View className="flex-1 bg-slate-50">
      {/* Top Header */}
      <View className="px-4 py-3 bg-white border-b border-slate-100 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1">
          <TouchableOpacity
            onPress={onBack}
            className="p-1 -ml-1 active:bg-slate-100 rounded-lg"
          >
            <Feather name="arrow-left" size={22} color="#1E293B" />
          </TouchableOpacity>

          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-bold text-slate-900">
                {t("room.session_detail_title")}
              </Text>
              {isOngoing ? (
                <View className="px-2 py-0.5 bg-emerald-100 rounded-full border border-emerald-300">
                  <Text className="text-[10px] font-bold text-emerald-800">
                    {t("room.session_live")}
                  </Text>
                </View>
              ) : (
                <View className="px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200">
                  <Text className="text-[10px] font-semibold text-slate-600">
                    {t("room.session_ended")}
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-[11px] text-slate-400 font-mono mt-0.5">
              ID: {session._id.slice(-8).toUpperCase()} • {session.meetingCode}
            </Text>
          </View>
        </View>

        {isOngoing && (
          <TouchableOpacity
            onPress={() => onJoinMeeting(session.meetingCode)}
            className="px-4.5 py-2.5 bg-emerald-600 active:bg-emerald-700 rounded-full flex-row items-center gap-2 shadow-sm shadow-emerald-600/30 active:scale-95"
          >
            <Feather name="play-circle" size={15} color="#ffffff" />
            <Text className="text-white font-bold text-[13px]">
              {t("room.session_join_now")}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Metric Cards Grid */}
        <View className="flex-row flex-wrap gap-2.5 mb-4">
          <View className="flex-1 min-w-[45%] bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Feather name="calendar" size={13} color="#0052FF" />
              <Text className="text-[11px] text-slate-500 font-medium">
                {t("room.session_start_time")}
              </Text>
            </View>
            <Text className="text-xs font-bold text-slate-800">
              {formatDateTime(session.startedAt || session.createdAt)}
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Feather name="clock" size={13} color="#D97706" />
              <Text className="text-[11px] text-slate-500 font-medium">
                {t("room.session_end_time")}
              </Text>
            </View>
            <Text className="text-xs font-bold text-slate-800">
              {session.endedAt
                ? formatDateTime(session.endedAt)
                : t("room.session_in_progress")}
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Feather name="watch" size={13} color="#8B5CF6" />
              <Text className="text-[11px] text-slate-500 font-medium">
                {t("room.session_total_duration")}
              </Text>
            </View>
            <Text className="text-xs font-bold text-slate-800">
              {formatDuration(session.durationSeconds)}
            </Text>
          </View>

          <View className="flex-1 min-w-[45%] bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
            <View className="flex-row items-center gap-1.5 mb-1">
              <Feather name="users" size={13} color="#059669" />
              <Text className="text-[11px] text-slate-500 font-medium">
                {t("room.session_participants")}
              </Text>
            </View>
            <Text className="text-xs font-bold text-slate-800">
              {attendanceList.length > 0
                ? t("room.session_users_count", { count: attendanceList.length })
                : session.totalParticipants !== undefined
                ? t("room.session_users_count", { count: session.totalParticipants })
                : "0"}
            </Text>
          </View>
        </View>

        {/* Bản ghi cuộc họp (Recordings Section) */}
        <View className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-4">
          <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Feather name="video" size={16} color="#E11D48" />
              <Text className="text-xs font-bold text-slate-900">
                {t("room.session_recordings_title")}
              </Text>
            </View>
            <Text className="text-[11px] text-slate-500 font-semibold">
              {t("room.session_recordings_count", { count: recordings.length })}
            </Text>
          </View>

          {/* Active Video Player */}
          {activeRecording && (
            <View className="p-3 bg-slate-950 border-b border-slate-800">
              <HlsRecordingPlayer
                src={resolveRecordingUrl(activeRecording)}
                title={`${t("room.session_recording_item", {
                  index:
                    recordings.findIndex(
                      (r: SessionRecording) => r.recordingId === activeRecording.recordingId
                    ) + 1,
                })} • ${formatDateTime(activeRecording.createdAt)}`}
                durationSeconds={activeRecording.durationSeconds}
                onClose={() => setActiveRecording(null)}
                autoPlay={true}
              />
            </View>
          )}

          {/* Recording Items List */}
          <View className="p-3">
            {recordings.length === 0 ? (
              <View className="py-6 items-center justify-center">
                <Feather name="film" size={28} color="#CBD5E1" />
                <Text className="text-xs font-medium text-slate-400 mt-2 text-center">
                  {t("room.session_recordings_empty")}
                </Text>
              </View>
            ) : (
              <View className="space-y-2.5">
                {recordings.map((rec: SessionRecording, idx: number) => {
                  const isSelected = activeRecording?.recordingId === rec.recordingId;
                  return (
                    <View
                      key={rec.recordingId || idx}
                      className={`p-3 rounded-xl border ${
                        isSelected
                          ? "bg-rose-50/60 border-rose-300 shadow-xs"
                          : "bg-slate-50/80 border-slate-200"
                      }`}
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-2 flex-1 mr-2">
                          <View
                            className={`w-7 h-7 rounded-lg justify-center items-center ${
                              isSelected ? "bg-rose-500" : "bg-white border border-slate-200"
                            }`}
                          >
                            <Feather
                              name="video"
                              size={13}
                              color={isSelected ? "#ffffff" : "#E11D48"}
                            />
                          </View>
                          <View className="flex-1">
                            <Text className="text-xs font-bold text-slate-900" numberOfLines={1}>
                              {t("room.session_recording_item", { index: idx + 1 })}
                            </Text>
                            <Text className="text-[10px] text-slate-500 font-mono">
                              {formatDateTime(rec.createdAt)}
                            </Text>
                          </View>
                        </View>

                        <View className="px-1.5 py-0.5 bg-slate-200 rounded-md">
                          <Text className="text-[9px] font-bold text-slate-700 font-mono">
                            HLS
                          </Text>
                        </View>
                      </View>

                      {/* Meta Row: Duration & Size */}
                      <View className="flex-row items-center justify-between pt-1.5 border-t border-slate-200/60 mb-2">
                        <View className="flex-row items-center gap-1">
                          <Feather name="clock" size={11} color="#94A3B8" />
                          <Text className="text-[11px] text-slate-600 font-medium">
                            {formatDuration(rec.durationSeconds)}
                          </Text>
                        </View>

                        <View className="flex-row items-center gap-1">
                          <Feather name="hard-drive" size={11} color="#94A3B8" />
                          <Text className="text-[11px] text-slate-600 font-medium">
                            {formatBytes(rec.sizeBytes)}
                          </Text>
                        </View>
                      </View>

                      {/* Play Button */}
                      <TouchableOpacity
                        onPress={() => setActiveRecording(isSelected ? null : rec)}
                        className={`w-full py-2 rounded-lg flex-row items-center justify-center gap-1.5 shadow-2xs ${
                          isSelected
                            ? "bg-rose-600 active:bg-rose-700"
                            : "bg-white border border-slate-200 active:bg-rose-50"
                        }`}
                      >
                        <Feather
                          name="play-circle"
                          size={14}
                          color={isSelected ? "#ffffff" : "#E11D48"}
                        />
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? "text-white" : "text-slate-800"
                          }`}
                        >
                          {isSelected
                            ? t("room.session_recording_playing")
                            : t("room.session_recording_play")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* Danh sách người tham gia / Điểm danh */}
        <View className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-6">
          <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Feather name="check-circle" size={16} color="#0052FF" />
              <Text className="text-xs font-bold text-slate-900">
                {t("room.session_attendance_title")}
              </Text>
            </View>
            <View className="flex-row items-center gap-2.5">
              <Text className="text-[11px] text-slate-500 font-semibold">
                {t("room.session_records_count", { count: attendanceList.length })}
              </Text>
              <TouchableOpacity
                onPress={() => refetchAttendance()}
                disabled={isAttendanceFetching}
                className="p-1 rounded-lg bg-slate-100 active:bg-slate-200"
              >
                {isAttendanceFetching ? (
                  <ActivityIndicator size={12} color="#0052FF" />
                ) : (
                  <Feather name="rotate-cw" size={12} color="#475569" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {isAttendanceLoading ? (
            <View className="p-8 items-center justify-center">
              <ActivityIndicator size="small" color="#0052FF" />
              <Text className="text-xs text-slate-400 mt-2">
                {t("room.session_attendance_loading")}
              </Text>
            </View>
          ) : attendanceList.length === 0 ? (
            <View className="p-8 items-center justify-center">
              <Feather name="user-x" size={28} color="#CBD5E1" />
              <Text className="text-xs font-medium text-slate-400 mt-2 text-center">
                {t("room.session_attendance_empty")}
              </Text>
            </View>
          ) : (
            <View className="divide-y divide-slate-100">
              {attendanceList.map((att: SessionAttendanceItem, idx: number) => (
                <View key={att.userId || idx} className="p-4 flex-row items-start justify-between gap-3">
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="w-8 h-8 rounded-full bg-blue-100 justify-center items-center shrink-0">
                      <Text className="text-blue-700 font-bold text-xs">
                        {(att.displayName || "U").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="font-bold text-xs text-slate-800">
                        {att.displayName || t("room.session_user_default")}
                      </Text>
                      <Text className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {att.userId}
                      </Text>

                      {/* Timestamps */}
                      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        <Text className="text-[11px] text-slate-500">
                          {t("room.session_th_first_joined")}
                          <Text className="font-mono text-slate-700">
                            {formatTimeOnly(att.firstJoinedAt)}
                          </Text>
                        </Text>

                        <Text className="text-[11px] text-slate-500">
                          {t("room.session_th_last_left")}
                          <Text className="font-mono text-slate-700">
                            {att.lastLeftAt ? formatTimeOnly(att.lastLeftAt) : (isOngoing ? t("room.session_in_call") : "--")}
                          </Text>
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="items-end">
                    <Text className="text-xs font-bold text-slate-800">
                      {formatDuration(att.totalDurationSeconds)}
                    </Text>
                    <Text className="text-[10px] text-slate-400 mt-0.5">
                      {t("room.session_visits_count", { count: att.visitCount || 1 })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
