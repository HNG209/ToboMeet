import React, { useState, useEffect, lazy, Suspense } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoomContext } from "@livekit/react-native";
import { Participant, RoomEvent } from "livekit-client";
import { Feather } from "@expo/vector-icons";
import { toast } from "../../lib/toast";

import MobileToolbar from "../../components/meeting/MobileToolbar";
import MobileVideoGrid from "../../components/meeting/MobileVideoGrid";
import MembersModal from "../../components/meeting/MembersModal";
import MobileChatModal from "../../components/meeting/MobileChatModal";
// Lazy load để tránh crash native module 'RNCWebViewModule' khi APK chưa có react-native-webview
const MobileWhiteboardModal = lazy(
  () => import("../../components/meeting/MobileWhiteboardModal"),
);
import MobileLiveCaptionOverlay from "../../components/meeting/MobileLiveCaptionOverlay";
import { useParticipantManager } from "../../hooks/useParticipantManager";
import { useTranslation } from "react-i18next";
import { useBreakoutSync } from "../../hooks/useBreakoutSync";
import { useRoomSettings } from "../../hooks/useRoomSettings";
import { useBreakoutTimer } from "../../hooks/useBreakoutTimer";
import { axiosInstance } from "../../lib/axios";

export default function MeetingRoomContent({
  meetingData,
  meetingCode,
  handleDisconnect,
}: any) {
  const { t } = useTranslation();
  const room = useRoomContext();

  // Lắng nghe các sự kiện đồng bộ breakout
  useBreakoutSync();

  const { roomName, roomType, breakoutStartedAt, breakoutDuration } =
    useRoomSettings({
      meetingCode,
    });

  const isBreakoutRoom = roomType === "breakout";

  const timeDisplay = useBreakoutTimer({
    startedAt: breakoutStartedAt,
    durationMinutes: breakoutDuration,
    meetingCode,
  });

  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [showWhiteboardModal, setShowWhiteboardModal] = useState(false);
  const [isLiveCaptionEnabled, setIsLiveCaptionEnabled] = useState(false);

  const handleToggleLiveCaption = () => {
    setIsLiveCaptionEnabled((prev) => {
      const nextState = !prev;
      if (nextState && meetingCode) {
        axiosInstance
          .post(`/meetings/${meetingCode}/captions/ensure`)
          .catch(() => {});
      }
      return nextState;
    });
  };

  const { displayParticipants } = useParticipantManager({
    meetingCode: meetingCode,
  });

  const [participantStatus, setParticipantStatus] = useState(() => {
    try {
      const base64Url = meetingData.token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      let jsonPayload = "";
      if (typeof window !== "undefined" && window.atob) {
        jsonPayload = decodeURIComponent(
          window
            .atob(base64)
            .split("")
            .map(function (c) {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join(""),
        );
      } else {
        const Buffer = require("buffer").Buffer;
        jsonPayload = Buffer.from(base64, "base64").toString("utf8");
      }
      const payload = JSON.parse(jsonPayload);

      if (payload.metadata) {
        const meta = JSON.parse(payload.metadata);
        return meta.status || "joined";
      }
    } catch (e) {
      console.error("Lỗi parse JWT:", e);
    }
    return "joined";
  });

  useEffect(() => {
    const handleMetadataChanged = (
      prevMetadata: string | undefined,
      participant: Participant,
    ) => {
      if (participant.identity === room.localParticipant?.identity) {
        try {
          if (participant.metadata) {
            const meta = JSON.parse(participant.metadata);
            const prevMeta = prevMetadata ? JSON.parse(prevMetadata) : null;

            if (
              meta.status &&
              meta.status === "joined" &&
              prevMeta?.status !== "joined" // Chỉ thông báo khi trạng thái thay đổi từ "waiting" sang "joined"
            ) {
              toast.success(t("meeting.meeting_page.toast_approved"));
            }

            if (meta.status) {
              setParticipantStatus(meta.status);
            }
          }
        } catch (e) {
          console.error("Lỗi parse metadata:", e);
        }
      }
    };

    room.on(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);

    return () => {
      room.off(RoomEvent.ParticipantMetadataChanged, handleMetadataChanged);
    };
  }, [room]);

  // GIAO DIỆN KHI ĐANG Ở PHÒNG CHỜ
  if (participantStatus === "waiting") {
    return (
      <SafeAreaView className="flex-1 bg-[#09090b]" edges={["top", "bottom"]}>
        {/* Ambient Glows */}
        <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
          <View
            className="absolute -top-32 -left-20 w-80 h-80 rounded-full"
            style={{ backgroundColor: "rgba(0, 85, 255, 0.15)" }}
          />
          <View
            className="absolute top-1/3 -right-24 w-72 h-72 rounded-full"
            style={{ backgroundColor: "rgba(99, 102, 241, 0.12)" }}
          />
          <View
            className="absolute -bottom-28 left-10 w-72 h-72 rounded-full"
            style={{ backgroundColor: "rgba(14, 165, 233, 0.08)" }}
          />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 16,
            paddingVertical: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            className="w-full max-w-[400px] self-center rounded-3xl border border-white/10 overflow-hidden p-6 items-center"
            style={{
              backgroundColor: "rgba(18, 18, 22, 0.96)",
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 16 },
                  shadowOpacity: 0.5,
                  shadowRadius: 28,
                },
                android: { elevation: 14 },
              }),
            }}
          >
            {/* Title */}
            <View className="flex-row items-center gap-2 mb-1.5">
              <Text className="text-xl font-bold text-white tracking-tight text-center">
                {t("meeting.meeting_page.waiting_title")}
              </Text>
              <ActivityIndicator size="small" color="#60a5fa" />
            </View>

            {/* Subtitle */}
            <Text className="text-slate-400 text-center text-xs leading-5 mb-5 px-2">
              {t("meeting.meeting_page.waiting_desc")}
            </Text>

            {/* In-meeting participants container */}
            <View
              className="w-full rounded-2xl border border-white/5 p-4 mb-6"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.03)" }}
            >
              <View className="flex-row items-center justify-between mb-3 px-1">
                <View className="flex-row items-center gap-1.5">
                  <Feather name="users" size={13} color="#60a5fa" />
                  <Text className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    {t("meeting.meeting_page.in_meeting_header")}
                  </Text>
                </View>
                {displayParticipants.length > 0 && (
                  <View className="bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                    <Text className="text-[10px] font-medium text-slate-400">
                      {displayParticipants.length}
                    </Text>
                  </View>
                )}
              </View>

              {displayParticipants.length > 0 ? (
                <View className="flex-row flex-wrap justify-center gap-3 py-1">
                  {displayParticipants.slice(0, 5).map((p) => {
                    let avatarUrl = "";
                    try {
                      if (p.metadata) {
                        const meta = JSON.parse(p.metadata);
                        avatarUrl = meta.avatarUrl || meta.avatar || "";
                      }
                    } catch (e) { }

                    return (
                      <View key={p.identity} className="items-center w-12">
                        <View className="relative mb-1.5">
                          {avatarUrl ? (
                            <Image
                              source={{ uri: avatarUrl }}
                              className="w-10 h-10 rounded-full border-2 border-white/10"
                            />
                          ) : (
                            <View className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center border-2 border-white/10">
                              <Text className="text-slate-300 font-bold text-xs uppercase">
                                {p.name?.charAt(0) || "?"}
                              </Text>
                            </View>
                          )}
                          <View className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border border-[#121216] rounded-full" />
                        </View>
                        <Text
                          className="text-[9px] text-slate-400 text-center w-full"
                          numberOfLines={1}
                        >
                          {p.name || "Ẩn danh"}
                        </Text>
                      </View>
                    );
                  })}

                  {displayParticipants.length > 5 && (
                    <Text className="w-full text-center text-[11px] font-medium text-slate-500 pt-1">
                      {t("meeting.meeting_page.other_participants_count", {
                        count: displayParticipants.length - 5,
                      })}
                    </Text>
                  )}
                </View>
              ) : (
                <Text className="text-xs text-slate-500 text-center py-2">
                  {t("meeting.meeting_page.no_one_in_meeting")}
                </Text>
              )}
            </View>

            {/* Leave Waiting Room Button */}
            <TouchableOpacity
              onPress={handleDisconnect}
              activeOpacity={0.7}
              className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 active:bg-rose-500/20 active:border-rose-500/30"
            >
              <Feather name="log-out" size={15} color="#f43f5e" />
              <Text className="text-slate-300 font-semibold text-xs">
                {t("meeting.meeting_page.leave_waiting_room")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // GIAO DIỆN KHI ĐÃ ĐƯỢC DUYỆT VÀO PHÒNG
  return (
    <View className="flex-1 bg-[#0d0d10]">
      {/* Header bar */}
      <View className="h-[70px] justify-center items-center bg-[#111113] border-b border-[#232328] px-4">
        {isBreakoutRoom ? (
          <View className="items-center">
            <View className="flex-row items-center gap-1.5 mb-2">
              <Feather name="grid" size={12} color="#60a5fa" />
              <Text className="text-blue-400 text-[11px] font-bold uppercase tracking-wider">
                {roomName || "Breakout Room"}
              </Text>
            </View>
            {timeDisplay && (
              <View className="flex-row items-center gap-1 bg-[#18181d] px-2.5 py-0.5 rounded-full border border-[#232328]">
                <Feather name="clock" size={11} color="#f59e0b" />
                <Text className="text-amber-400 font-mono font-bold text-xs">
                  {timeDisplay}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <>
            <Text className="text-slate-400 text-xs uppercase font-bold">
              {t("meeting.meeting_page.room_header")}
            </Text>
            <Text className="text-slate-100 font-bold text-base">{meetingCode}</Text>
          </>
        )}
      </View>

      {/* Khung chứa các ô video / participant tiles */}
      <View className="flex-1 bg-[#0a0a0c]">
        <MobileVideoGrid />
      </View>

      {/* Khung Phụ đề trực tiếp: Nằm kẹp giữa khung participant tile và toolbar */}
      {isLiveCaptionEnabled && (
        <MobileLiveCaptionOverlay
          room={room}
          enabled={isLiveCaptionEnabled}
          onClose={() => setIsLiveCaptionEnabled(false)}
        />
      )}

      {/* Thanh điều khiển (Toolbar) */}
      <MobileToolbar
        meetingCode={meetingCode}
        initialFacingMode={
          meetingData.cameraFacing === "back" ? "environment" : "user"
        }
        onOpenMembers={() => setShowMembersModal(true)}
        onOpenChat={() => setShowChatModal(true)}
        onOpenWhiteboard={() => setShowWhiteboardModal(true)}
        isLiveCaptionEnabled={isLiveCaptionEnabled}
        onToggleLiveCaption={handleToggleLiveCaption}
      />

      <MembersModal
        visible={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        meetingCode={meetingCode}
      />

      <MobileChatModal
        meetingCode={meetingCode}
        visible={showChatModal}
        onClose={() => setShowChatModal(false)}
      />

      {showWhiteboardModal && (
        <Suspense fallback={null}>
          <MobileWhiteboardModal
            visible={showWhiteboardModal}
            onClose={() => setShowWhiteboardModal(false)}
            meetingCode={meetingCode}
          />
        </Suspense>
      )}
    </View>
  );
}
