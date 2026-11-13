import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Clipboard,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { toast } from "../../lib/toast";
import { useEnsurePersonalMeetingMutation } from "../../lib/redux/features/meetings/meetingsApi";

export default function PersonalMeetingScreen() {
  const { t } = useTranslation();
  const [ensurePersonalMeeting, { isLoading }] =
    useEnsurePersonalMeetingMutation();

  const [meetingCode, setMeetingCode] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchCode = async () => {
      try {
        const res = await ensurePersonalMeeting().unwrap();
        if (mounted && res?.meetingCode) {
          setMeetingCode(res.meetingCode);
        }
      } catch (err: any) {
        toast.error(
          err?.data?.message ||
            err?.message ||
            t("settings.personal_meeting.error_fetch", "Không thể lấy thông tin cuộc họp cá nhân")
        );
      }
    };
    fetchCode();
    return () => {
      mounted = false;
    };
  }, [ensurePersonalMeeting, t]);

  const meetingUrl = meetingCode
    ? `https://tobomeet.com/meeting/${meetingCode}`
    : "";

  const handleCopyCode = () => {
    if (!meetingCode) return;
    Clipboard.setString(meetingCode);
    setCopiedCode(true);
    toast.success(
      t("settings.personal_meeting.copied_code", "Đã sao chép mã cuộc họp")
    );
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!meetingUrl) return;
    Clipboard.setString(meetingUrl);
    setCopiedLink(true);
    toast.success(
      t("settings.personal_meeting.copied_link", "Đã sao chép liên kết cuộc họp")
    );
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleStartMeeting = () => {
    if (!meetingCode) return;
    router.push(`/meeting/${meetingCode}`);
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header with Back button */}
      <View className="px-5 py-4 bg-white border-b border-slate-100 flex-row items-center gap-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1 -ml-1 rounded-full active:bg-slate-100"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900">
          {t("settings.personal_meeting.title", "Cuộc họp cá nhân")}
        </Text>
      </View>

      <ScrollView className="flex-1 p-5">
        {isLoading && !meetingCode ? (
          <View className="py-20 items-center justify-center">
            <ActivityIndicator size="large" color="#0052FF" />
            <Text className="text-xs text-slate-400 mt-3 font-medium">
              {t("common.loading", "Đang tải dữ liệu...")}
            </Text>
          </View>
        ) : (
          <View className="gap-5 pb-10">
            {/* Banner card */}
            <View className="bg-blue-50/70 border border-blue-100 p-4 rounded-2xl flex-row items-center gap-3.5">
              <View className="w-11 h-11 rounded-xl bg-[#0052FF] items-center justify-center">
                <Feather name="video" size={22} color="#ffffff" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-slate-800">
                  {t("settings.personal_meeting.card_title", "Phòng họp cố định")}
                </Text>
                <Text className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {t(
                    "settings.personal_meeting.card_desc",
                    "Phòng họp cá nhân luôn mở và sẵn sàng bất cứ lúc nào."
                  )}
                </Text>
              </View>
            </View>

            {/* Meeting Code Block */}
            <View className="bg-white border border-slate-200/80 rounded-2xl p-4 gap-2">
              <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t("settings.personal_meeting.meeting_code_label", "Mã cuộc họp cá nhân")}
              </Text>
              <View className="flex-row items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5">
                <Text className="text-base font-bold text-slate-900 tracking-wide font-mono">
                  {meetingCode || "---"}
                </Text>
                <TouchableOpacity
                  onPress={handleCopyCode}
                  activeOpacity={0.7}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm"
                >
                  <Feather
                    name={copiedCode ? "check" : "copy"}
                    size={14}
                    color={copiedCode ? "#10B981" : "#0052FF"}
                  />
                  <Text
                    className={`text-xs font-semibold ${
                      copiedCode ? "text-emerald-600" : "text-[#0052FF]"
                    }`}
                  >
                    {copiedCode
                      ? t("common.copied", "Đã sao chép")
                      : t("common.copy", "Sao chép")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Meeting Link Block */}
            <View className="bg-white border border-slate-200/80 rounded-2xl p-4 gap-2">
              <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t("settings.personal_meeting.meeting_link_label", "Liên kết cuộc họp")}
              </Text>
              <View className="flex-row items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5">
                <Text
                  numberOfLines={1}
                  ellipsizeMode="middle"
                  className="text-xs font-medium text-slate-600 flex-1 mr-2"
                >
                  {meetingUrl || "---"}
                </Text>
                <TouchableOpacity
                  onPress={handleCopyLink}
                  activeOpacity={0.7}
                  className="flex-row items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm"
                >
                  <Feather
                    name={copiedLink ? "check" : "copy"}
                    size={14}
                    color={copiedLink ? "#10B981" : "#0052FF"}
                  />
                  <Text
                    className={`text-xs font-semibold ${
                      copiedLink ? "text-emerald-600" : "text-[#0052FF]"
                    }`}
                  >
                    {copiedLink
                      ? t("common.copied", "Đã sao chép")
                      : t("common.copy", "Sao chép")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Start Meeting Button */}
            <TouchableOpacity
              onPress={handleStartMeeting}
              activeOpacity={0.85}
              disabled={!meetingCode}
              className="w-full bg-[#0052FF] py-3.5 rounded-2xl flex-row items-center justify-center gap-2.5 shadow-md shadow-blue-500/20 active:bg-blue-700"
            >
              <Feather name="video" size={18} color="#ffffff" />
              <Text className="text-sm font-bold text-white">
                {t("settings.personal_meeting.start_meeting_btn", "Bắt đầu cuộc họp")}
              </Text>
            </TouchableOpacity>

            {/* View History Button */}
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/settings/personal-meeting-history",
                  params: { meetingCode },
                })
              }
              activeOpacity={0.85}
              disabled={!meetingCode}
              className="w-full bg-white border border-slate-200/90 py-3.5 rounded-2xl flex-row items-center justify-center gap-2.5 shadow-xs active:bg-slate-50"
            >
              <Feather name="clock" size={18} color="#0052FF" />
              <Text className="text-sm font-bold text-slate-800">
                {t("settings.personal_meeting.history_btn", "Lịch sử cuộc họp")}
              </Text>
            </TouchableOpacity>

            {/* Tip note */}
            <View className="bg-slate-100/70 border border-slate-200/60 rounded-2xl p-4 flex-row gap-3">
              <MaterialCommunityIcons
                name="lightbulb-outline"
                size={20}
                color="#64748B"
              />
              <View className="flex-1">
                <Text className="text-xs font-bold text-slate-700">
                  {t("settings.personal_meeting.tip_title", "Ghi chú về cuộc họp cá nhân")}
                </Text>
                <Text className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t(
                    "settings.personal_meeting.tip_desc",
                    "Liên kết và mã cuộc họp cá nhân được giữ nguyên cố định. Bạn có thể gửi liên kết này trước cho đối tác hoặc bạn bè để cùng tham gia."
                  )}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

