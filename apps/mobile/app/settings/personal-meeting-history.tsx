import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import { useEnsurePersonalMeetingMutation } from "../../lib/redux/features/meetings/meetingsApi";
import ChannelSessionsTab from "../../components/room/ChannelSessionsTab";
import { toast } from "../../lib/toast";

export default function PersonalMeetingHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ meetingCode?: string }>();
  const { data: profile } = useGetMeQuery();

  const [ensurePersonalMeeting, { isLoading }] =
    useEnsurePersonalMeetingMutation();
  const [meetingCode, setMeetingCode] = useState<string>(
    params.meetingCode || "",
  );

  useEffect(() => {
    let mounted = true;
    if (meetingCode) return;

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
            t(
              "settings.personal_meeting.error_fetch",
              "Không thể lấy thông tin cuộc họp cá nhân",
            ),
        );
      }
    };

    fetchCode();
    return () => {
      mounted = false;
    };
  }, [ensurePersonalMeeting, meetingCode, t]);

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/settings/personal-meeting");
    }
  };

  if (isLoading && !meetingCode) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#0052FF" />
        <Text className="text-xs text-slate-400 mt-3 font-medium">
          {t("common.loading", "Đang tải dữ liệu...")}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <ChannelSessionsTab
        initialMeetingCode={meetingCode}
        userId={profile?.supabaseId || ""}
        title={t(
          "settings.personal_meeting.history_title",
          "Lịch sử cuộc họp cá nhân",
        )}
        isPersonalMeeting={true}
        onBack={handleGoBack}
      />
    </View>
  );
}
