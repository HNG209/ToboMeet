import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Router, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";
import { useNotifications } from "../../hooks/useNotifications";
import { useLazyExchangeSessionQuery } from "../../lib/redux/features/meetings/meetingsApi";
import { useUpdateCalendarRsvpMutation } from "../../lib/redux/api/calendarApi";
import { NotificationResponse } from "@tobomeet/shared/types";
import DashboardHeader from "../../components/dashboard/DashboardHeader";

// Hàm xử lý thời gian linh hoạt
const formatTimeAgo = (dateString: string, t: any, i18n: any) => {
  const now = new Date();
  const past = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return t("notification.time.just_now");

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60)
    return t("notification.time.minutes_ago", { count: diffInMinutes });

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24)
    return t("notification.time.hours_ago", { count: diffInHours });

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays <= 30)
    return t("notification.time.days_ago", { count: diffInDays });

  // Quá 30 ngày hiển thị ngày giờ đầy đủ dựa trên ngôn ngữ hiện tại
  return past.toLocaleString(i18n.language === "vi" ? "vi-VN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export default function NotificationsScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { t } = useTranslation();

  const { notifications, isLoading, isFetching, hasNext, loadMore, refresh } =
    useNotifications({ limit: 15, skip: !isFocused });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  const renderItem = ({ item }: { item: NotificationResponse }) => {
    return <NotificationCard notification={item} router={router} />;
  };

  return (
    <View className="flex-1 bg-[#f5f5f5]">
      {/* Header đồng bộ (Teams style) */}
      <DashboardHeader title={t("dashboard.tab_notification", "Thông báo")} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0052FF" />
          <Text className="text-slate-400 mt-2">{t("screen.loading")}</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View className="flex-1 items-center justify-center opacity-70">
          <View className="w-16 h-16 rounded-full bg-slate-200 items-center justify-center mb-4">
            <Feather name="bell" size={32} color="#94A3B8" />
          </View>
          <Text className="text-slate-500 font-medium">
            {t("notification.screen.empty")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (hasNext && !isFetching) {
              loadMore();
            }
          }}
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          ListFooterComponent={
            isFetching && !isLoading ? (
              <View className="py-4 items-center">
                <ActivityIndicator size="small" color="#0052FF" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

// Component thẻ thông báo
function NotificationCard({
  notification,
  router,
}: {
  notification: NotificationResponse;
  router: Router;
}) {
  const { t, i18n } = useTranslation();
  const [exchangeSession] = useLazyExchangeSessionQuery();
  const [updateCalendarRsvp] = useUpdateCalendarRsvpMutation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState<"ACCEPTED" | "DECLINED" | null>(
    null,
  );
  const [rsvpStatus, setRsvpStatus] = useState<string | null>(
    notification.metadata?.rsvpStatus || null,
  );

  const getNotificationDetails = (type: string, metadata: any) => {
    switch (type) {
      case "KICKED":
        return {
          title: t("notification.types.kicked.title"),
          content: t("notification.types.kicked.content", {
            roomName: metadata?.roomName || "",
          }),
          icon: "user-minus",
          colorClass: "bg-red-100",
          iconColor: "#dc2626",
        };
      case "ROOM_DISBANDED":
        return {
          title: t("notification.types.room_disbanded.title"),
          content: t("notification.types.room_disbanded.content", {
            roomName:
              metadata?.roomName ||
              t("notification.common.room", { defaultValue: t("common.room") }),
          }),
          icon: "trash-2",
          colorClass: "bg-orange-100",
          iconColor: "#ea580c",
        };
      case "MEETING_INVITE":
        return {
          title: t("notification.types.meeting_invite.title"),
          content: t("notification.types.meeting_invite.content", {
            inviterName:
              metadata?.inviterName ||
              t("notification.common.someone", {
                defaultValue: t("common.someone"),
              }),
            roomName: metadata?.roomName || "",
          }),
          icon: "video",
          colorClass: "bg-blue-100",
          iconColor: "#0052FF",
          sessionId: metadata?.sessionId,
          isActionable: true,
          actionTitle: t("notification.actions.join"),
        };
      case "CALENDAR_INVITE":
        return {
          title: t("notification.types.calendar_invite.title"),
          content: t("notification.types.calendar_invite.content", {
            inviterName:
              metadata?.inviterName ||
              t("notification.common.someone", {
                defaultValue: t("common.someone"),
              }),
            title: metadata?.title || metadata?.eventTitle || "",
          }),
          icon: "calendar",
          colorClass: "bg-indigo-100",
          iconColor: "#4f46e5",
          eventId: metadata?.eventId || notification.referenceId,
          isCalendarInvite: true,
          startDate: metadata?.startDate,
          endDate: metadata?.endDate,
        };
      case "CALENDAR_START":
        return {
          title: t("notification.types.calendar_start.title"),
          content: t("notification.types.calendar_start.content", {
            title: metadata?.title || metadata?.eventTitle || "",
          }),
          icon: "video",
          colorClass: "bg-blue-100",
          iconColor: "#0052FF",
          meetingCode: metadata?.meetingCode,
          isActionable: Boolean(metadata?.meetingCode),
          actionTitle: t("notification.actions.join"),
        };
      case "ROOM_REPORTED":
        return {
          title: t("notification.types.room_reported.title"),
          content: t("notification.types.room_reported.content"),
          icon: "alert-triangle",
          colorClass: "bg-amber-100",
          iconColor: "#d97706",
        };
      case "REPORT_RESOLVED":
        return {
          title: t("notification.types.report_resolved.title"),
          content: t("notification.types.report_resolved.content"),
          icon: "check-circle",
          colorClass: "bg-emerald-100",
          iconColor: "#059669",
        };
      default:
        return {
          title: t("notification.types.system.title"),
          content: t("notification.types.system.content", { type }),
          icon: "bell",
          colorClass: "bg-slate-100",
          iconColor: "#64748b",
        };
    }
  };

  const {
    title,
    content,
    icon,
    colorClass,
    iconColor,
    isActionable,
    actionTitle,
    sessionId,
    meetingCode,
    isCalendarInvite,
    eventId,
    startDate,
  } = getNotificationDetails(notification.type, notification.metadata || {});

  const handleActionClick = async () => {
    if (meetingCode) {
      router.push(`/meeting/${meetingCode}`);
      return;
    }

    if (!sessionId) return;
    setIsProcessing(true);
    try {
      const response = await exchangeSession(sessionId).unwrap();
      if (response && response.meetingCode) {
        router.push(`/meeting/${response.meetingCode}`);
      }
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: t("errors.title"),
        text2:
          error?.message ||
          t("notification.errors.session_ended", {
            defaultValue: t("errors.session_ended"),
          }),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRsvp = async (status: "ACCEPTED" | "DECLINED") => {
    if (!eventId) return;

    setRsvpLoading(status);
    try {
      await updateCalendarRsvp({ eventId, status }).unwrap();
      setRsvpStatus(status);
      Toast.show({
        type: "success",
        text1: i18n.language === "vi" ? "Thành công" : "Success",
        text2:
          status === "ACCEPTED"
            ? t("notification.rsvp.accept_success")
            : t("notification.rsvp.decline_success"),
      });
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: t("errors.title"),
        text2:
          error?.data?.message ||
          error?.message ||
          (status === "ACCEPTED"
            ? t("notification.rsvp.accept_error")
            : t("notification.rsvp.decline_error")),
      });
    } finally {
      setRsvpLoading(null);
    }
  };

  return (
    <View
      className={`p-4 rounded-2xl border ${
        notification.isRead
          ? "bg-white border-slate-100"
          : "bg-blue-50 border-blue-100"
      }`}
    >
      {!notification.isRead && (
        <View className="absolute top-4 right-4 w-2 h-2 rounded-full bg-blue-500" />
      )}

      <View className="flex-row gap-3">
        <View
          className={`w-10 h-10 rounded-full items-center justify-center ${colorClass}`}
        >
          <Feather name={icon as any} size={20} color={iconColor} />
        </View>

        <View className="flex-1 pt-0.5">
          <Text className="text-[14px] font-bold text-slate-800">{title}</Text>
          <Text className="text-[12px] text-slate-600 mt-1 leading-5">
            {content}
          </Text>
          <Text className="text-[10px] text-slate-400 font-medium mt-2">
            {formatTimeAgo(
              (notification.createdAt || notification.updatedAt).toString(),
              t,
              i18n,
            )}
          </Text>

          {isActionable && (
            <TouchableOpacity
              onPress={handleActionClick}
              disabled={isProcessing}
              className="mt-3.5 w-full items-center justify-center py-3 px-4 bg-[#0052FF] rounded-xl active:bg-blue-700"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-white text-[13px] font-bold">
                  {actionTitle}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {isCalendarInvite && eventId && (
            <View className="mt-3">
              {startDate && (
                <View className="flex-row items-center gap-1.5 mb-2.5">
                  <Feather name="clock" size={13} color="#94a3b8" />
                  <Text className="text-[11px] text-slate-500 font-medium">
                    {new Date(startDate).toLocaleDateString(
                      i18n.language === "vi" ? "vi-VN" : "en-US",
                      {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </Text>
                </View>
              )}

              {rsvpStatus === "ACCEPTED" ? (
                <View className="flex-row items-center gap-1.5 py-1.5 px-3 bg-emerald-50 border border-emerald-200 rounded-lg self-start">
                  <Feather name="check-circle" size={14} color="#059669" />
                  <Text className="text-xs font-semibold text-emerald-700">
                    {t("notification.actions.accepted")}
                  </Text>
                </View>
              ) : rsvpStatus === "DECLINED" ? (
                <View className="flex-row items-center gap-1.5 py-1.5 px-3 bg-rose-50 border border-rose-200 rounded-lg self-start">
                  <Feather name="x-circle" size={14} color="#e11d48" />
                  <Text className="text-xs font-semibold text-rose-700">
                    {t("notification.actions.declined")}
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center gap-2 mt-1">
                  <TouchableOpacity
                    onPress={() => handleRsvp("ACCEPTED")}
                    disabled={rsvpLoading !== null}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 px-3 bg-indigo-600 rounded-xl active:bg-indigo-700"
                  >
                    {rsvpLoading === "ACCEPTED" ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Feather name="check" size={14} color="#ffffff" />
                        <Text className="text-white text-xs font-bold">
                          {t("notification.actions.accept")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleRsvp("DECLINED")}
                    disabled={rsvpLoading !== null}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 px-3 bg-white border border-slate-200 rounded-xl active:bg-slate-100"
                  >
                    {rsvpLoading === "DECLINED" ? (
                      <ActivityIndicator size="small" color="#475569" />
                    ) : (
                      <>
                        <Feather name="x" size={14} color="#475569" />
                        <Text className="text-slate-700 text-xs font-bold">
                          {t("notification.actions.decline")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
