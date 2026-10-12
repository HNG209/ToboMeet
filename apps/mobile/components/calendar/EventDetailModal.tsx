import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  useGetCalendarRsvpQuery,
  useLeaveCalendarEventMutation,
  useToggleCalendarNotificationMutation,
} from "../../lib/redux/api/calendarApi";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import InviteCalendarModal from "./InviteCalendarModal";
import DeleteEventConfirmModal from "./DeleteEventConfirmModal";
import ToggleNotificationConfirmModal from "./ToggleNotificationConfirmModal";
import { CalendarEvent } from "./types";

interface Props {
  visible: boolean;
  onClose: () => void;
  event: CalendarEvent | null;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent, deleteType: "single" | "all") => Promise<void>;
  onJoin: (meetingCode: string) => void;
  onRefresh?: () => void;
}

export default function EventDetailModal({
  visible,
  onClose,
  event,
  onEdit,
  onDelete,
  onJoin,
  onRefresh,
}: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: currentUser } = useGetMeQuery();
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] =
    useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [leaveCalendarEvent, { isLoading: isLeaving }] =
    useLeaveCalendarEventMutation();
  const [toggleCalendarNotification, { isLoading: isTogglingNotification }] =
    useToggleCalendarNotificationMutation();
  const [notificationsEnabledUsers, setNotificationsEnabledUsers] = useState<
    string[] | undefined
  >(event?.notificationsEnabledUserIds);

  useEffect(() => {
    setNotificationsEnabledUsers(event?.notificationsEnabledUserIds);
  }, [event?.notificationsEnabledUserIds]);

  useEffect(() => {
    if (!visible) {
      setInviteModalVisible(false);
      setDeleteModalVisible(false);
      setNotificationModalVisible(false);
    }
  }, [visible]);

  const { data: rsvpData } = useGetCalendarRsvpQuery(event?._id ?? "", {
    skip: !visible || !event?._id || event?.eventType === "assignment",
  });

  if (!event) return null;

  const isVi = i18n.language === "vi";

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(
      date.getDate()
    )}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  };

  const cleanDesc = event.description
    ? event.description.replace(/<[^>]*>/g, "").trim()
    : "";
  const hasDescription = cleanDesc.length > 0;

  const isRecurring = Boolean(event.recurrenceRule || event.isRecurring);

  const getRecurrenceDescription = (rule?: string) => {
    if (!rule) return isVi ? "Sự kiện lặp lại định kỳ" : "Recurring event series";
    if (rule.includes("MO,TU,WE,TH,FR")) {
      return isVi
        ? "Mọi ngày trong tuần (thứ Hai đến thứ Sáu)"
        : "Every weekday (Monday to Friday)";
    }
    if (rule.includes("DAILY")) return isVi ? "Lặp lại hàng ngày" : "Repeats daily";
    if (rule.includes("WEEKLY")) return isVi ? "Lặp lại hàng tuần" : "Repeats weekly";
    if (rule.includes("MONTHLY")) return isVi ? "Lặp lại hàng tháng" : "Repeats monthly";
    if (rule.includes("YEARLY")) return isVi ? "Lặp lại hàng năm" : "Repeats annually";
    return isVi ? "Sự kiện lặp lại định kỳ" : "Recurring event series";
  };

  // Render chuyên biệt cho Nhiệm vụ (Assignment)
  if (event.eventType === "assignment") {
    const statusMap: Record<
      string,
      { label: string; bg: string; text: string; border: string }
    > = {
      submitted: {
        label: t("calendar.assignment.statuses.submitted", {
          defaultValue: isVi ? "Đã nộp" : "Submitted",
        }),
        bg: "bg-emerald-50",
        text: "text-emerald-800",
        border: "border-emerald-200",
      },
      graded: {
        label: t("calendar.assignment.statuses.graded", {
          defaultValue: isVi ? "Đã chấm điểm" : "Graded",
        }),
        bg: "bg-emerald-50",
        text: "text-emerald-800",
        border: "border-emerald-200",
      },
      overdue: {
        label: t("calendar.assignment.statuses.overdue", {
          defaultValue: isVi ? "Đã quá hạn" : "Overdue",
        }),
        bg: "bg-rose-50",
        text: "text-rose-800",
        border: "border-rose-200",
      },
      closed: {
        label: t("calendar.assignment.statuses.closed", {
          defaultValue: isVi ? "Đã khóa/đóng" : "Closed",
        }),
        bg: "bg-slate-50",
        text: "text-slate-700",
        border: "border-slate-200",
      },
      in_progress: {
        label: t("calendar.assignment.statuses.in_progress", {
          defaultValue: isVi ? "Đang thực hiện" : "In Progress",
        }),
        bg: "bg-blue-50",
        text: "text-blue-800",
        border: "border-blue-200",
      },
    };

    const currentStatus =
      statusMap[event.assignmentStatus || "in_progress"] ||
      statusMap.in_progress;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={onClose}
      >
        <View className="flex-1 bg-slate-900/50 justify-end">
          <View
            className="bg-white rounded-t-3xl max-h-[85%] border-t border-slate-100"
            style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          >
            {/* Header */}
            <View className="flex-row justify-between items-center px-5 py-4 border-b border-slate-100">
              <View className="flex-row items-center gap-2">
                <View className="w-8 h-8 rounded-full bg-emerald-50 items-center justify-center">
                  <Feather name="clipboard" size={16} color="#059669" />
                </View>
                <Text className="text-base font-bold text-slate-800">
                  {t("calendar.assignment.title", {
                    defaultValue: "Chi tiết nhiệm vụ",
                  })}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} className="p-1">
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView className="px-5 py-4">
              <Text className="text-xl font-bold text-slate-900 mb-3">
                {event.title}
              </Text>

              <View
                className={`self-start px-2.5 py-1 rounded-full border mb-4 flex-row items-center gap-1.5 ${currentStatus.bg} ${currentStatus.border}`}
              >
                <Feather name="info" size={12} color="#065F46" />
                <Text
                  className={`text-xs font-semibold ${currentStatus.text}`}
                >
                  {currentStatus.label}
                </Text>
              </View>

              <View className="gap-3.5 mb-5">
                {event.assignmentStartDate && (
                  <View className="flex-row items-center gap-3">
                    <Feather name="calendar" size={16} color="#0052FF" />
                    <View className="flex-1">
                      <Text className="text-xs text-slate-400 font-medium">
                        {t("calendar.assignment.start_time", {
                          defaultValue: "Bắt đầu:",
                        })}
                      </Text>
                      <Text className="text-sm font-semibold text-slate-800">
                        {formatDateTime(event.assignmentStartDate)}
                      </Text>
                    </View>
                  </View>
                )}

                {event.assignmentDueDate && (
                  <View className="flex-row items-center gap-3">
                    <Feather name="clock" size={16} color="#E11D48" />
                    <View className="flex-1">
                      <Text className="text-xs text-slate-400 font-medium">
                        {t("calendar.assignment.end_time", {
                          defaultValue: "Hạn chót:",
                        })}
                      </Text>
                      <Text className="text-sm font-semibold text-rose-700">
                        {formatDateTime(event.assignmentDueDate)}
                      </Text>
                    </View>
                  </View>
                )}

                {hasDescription && (
                  <View className="flex-row items-start gap-3 mt-1">
                    <Feather
                      name="align-left"
                      size={16}
                      color="#0052FF"
                      style={{ marginTop: 2 }}
                    />
                    <View className="flex-1">
                      <Text className="text-xs text-slate-400 font-medium">
                        {t("calendar.description", { defaultValue: "Mô tả" })}
                      </Text>
                      <Text className="text-sm text-slate-700 mt-1 leading-5">
                        {cleanDesc}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            <View className="px-5 pt-3 border-t border-slate-100">
              <TouchableOpacity
                className="bg-emerald-600 py-3.5 rounded-xl items-center flex-row justify-center gap-2 active:bg-emerald-700"
                onPress={() => {
                  onClose();
                  router.push(
                    `/assignment/${event.assignmentId}?roomId=${event.roomId}`
                  );
                }}
              >
                <Text className="text-white font-bold text-sm">
                  {t("calendar.assignment.view_assignment", {
                    defaultValue: "Xem chi tiết nhiệm vụ",
                  })}
                </Text>
                <Feather name="arrow-right" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  const activeInvitees: {
    email: string;
    displayName?: string;
    userId?: string;
    status?: string;
    isHost?: boolean;
    avatarUrl?: string;
  }[] =
    rsvpData && rsvpData.length > 0
      ? rsvpData
      : event._prefetchedInvitees || event.invitees || [];

  const currentUserId =
    currentUser?.supabaseId ||
    (currentUser as any)?.id ||
    (currentUser as any)?._id ||
    event._currentUserId ||
    null;

  const isHost = Boolean(
    (currentUserId &&
      event.hostId &&
      (currentUserId === event.hostId ||
        currentUser?.supabaseId === event.hostId ||
        (currentUser as any)?.id === event.hostId ||
        (currentUser as any)?._id === event.hostId)) ||
      (event._currentUserId &&
        event.hostId &&
        event._currentUserId === event.hostId)
  );

  const isChannelMeeting = event.roomType === "channel_meeting";
  const hasInvitees = activeInvitees && activeInvitees.length > 0;
  const showJoin =
    event.meetingCode && (isChannelMeeting || hasInvitees || isHost);

  const hostMember = activeInvitees.find(
    (m: any) => m.isHost || m.userId === event.hostId
  );
  const guestList = activeInvitees.filter(
    (inv: any) => !inv.isHost && inv.userId !== event.hostId
  );

  const existingMemberIds = [
    ...(event.hostId ? [event.hostId] : []),
    ...(event.acceptedUserIds || []),
    ...(event.pendingUserIds || []),
    ...activeInvitees
      .filter(
        (m: any) =>
          m.status === "ACCEPTED" || m.status === "PENDING" || m.isHost
      )
      .map((m: any) => m.userId)
      .filter(Boolean),
  ];

  const existingEmails = [
    ...(event.hostEmail ? [event.hostEmail] : []),
    ...(event.invitees || []).map((i: any) => i.email).filter(Boolean),
    ...activeInvitees
      .filter(
        (m: any) =>
          m.status === "ACCEPTED" || m.status === "PENDING" || m.isHost
      )
      .map((m: any) => m.email)
      .filter(Boolean),
  ];

  const handleLeaveConfirm = () => {
    Alert.alert(
      t("calendar.leave_confirm_title", {
        defaultValue: "Xác nhận hủy tham gia",
      }),
      t("calendar.leave_confirm_desc", {
        defaultValue:
          "Bạn có chắc chắn muốn hủy tham gia lịch họp này không? Sự kiện sẽ được xóa khỏi lịch của bạn.",
      }),
      [
        {
          text: t("calendar.cancel", { defaultValue: "Hủy" }),
          style: "cancel",
        },
        {
          text: t("calendar.leave_event", { defaultValue: "Hủy tham gia" }),
          style: "destructive",
          onPress: async () => {
            try {
              await leaveCalendarEvent(event._id).unwrap();
              Alert.alert(
                isVi ? "Thành công" : "Success",
                t("calendar.alert_leave_success", {
                  defaultValue: "Đã hủy tham gia lịch họp thành công",
                })
              );
              onRefresh?.();
              onClose();
            } catch (err: any) {
              Alert.alert(
                isVi ? "Lỗi" : "Error",
                err?.data?.message ||
                  err?.message ||
                  t("calendar.alert_leave_error", {
                    defaultValue:
                      "Không thể hủy tham gia lịch họp. Vui lòng thử lại",
                  })
              );
            }
          },
        },
      ]
    );
  };

  const handleConfirmDeleteScope = async (deleteType: "single" | "all") => {
    setIsDeleting(true);
    try {
      await onDelete(event, deleteType);
      setDeleteModalVisible(false);
      onClose();
    } catch {
      // Handled in parent onDelete
    } finally {
      setIsDeleting(false);
    }
  };

  const isNotificationEnabled =
    notificationsEnabledUsers !== undefined
      ? Boolean(
          currentUserId && notificationsEnabledUsers.includes(currentUserId)
        )
      : Boolean(
          isHost ||
            (activeInvitees &&
              activeInvitees.some((r: any) => r.userId === currentUserId)) ||
            (event.acceptedUserIds &&
              currentUserId &&
              event.acceptedUserIds.includes(currentUserId)) ||
            (event.pendingUserIds &&
              currentUserId &&
              event.pendingUserIds.includes(currentUserId))
        );

  const handleConfirmToggleNotification = async () => {
    if (!event?._id) return;
    try {
      const targetState = !isNotificationEnabled;
      const res = await toggleCalendarNotification({
        id: event._id,
        enabled: targetState,
      }).unwrap();

      if (res?.event?.notificationsEnabledUserIds) {
        setNotificationsEnabledUsers(res.event.notificationsEnabledUserIds);
      } else {
        setNotificationsEnabledUsers((prev) => {
          const currentArr =
            prev ??
            (currentUserId
              ? [
                  ...(isHost && event.hostId ? [event.hostId] : []),
                  ...(event.acceptedUserIds || []),
                ]
              : []);
          return targetState
            ? Array.from(new Set([...currentArr, currentUserId!]))
            : currentArr.filter((id) => id !== currentUserId);
        });
      }

      Alert.alert(
        isVi ? "Thành công" : "Success",
        targetState
          ? (isVi
              ? "Đã bật thông báo cho sự kiện này"
              : "Notifications enabled for this event")
          : (isVi
              ? "Đã tắt thông báo cho sự kiện này"
              : "Notifications disabled for this event")
      );
      setNotificationModalVisible(false);
      onRefresh?.();
    } catch (err: any) {
      Alert.alert(
        isVi ? "Lỗi" : "Error",
        err?.data?.message ||
          err?.message ||
          (isVi
            ? "Không thể cập nhật thông báo"
            : "Failed to update notification settings")
      );
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={onClose}
      >
        <View className="flex-1 bg-slate-900/50 justify-end">
          <View
            className="bg-white rounded-t-3xl max-h-[85%] border-t border-slate-100"
            style={{ paddingBottom: Math.max(insets.bottom + 16, 28) }}
          >
            {/* Header */}
            <View className="flex-row justify-between items-center px-5 py-4 border-b border-slate-100">
              <Text className="text-base font-bold text-slate-800">
                {t("calendar.detail_modal.title", {
                  defaultValue: "Chi tiết sự kiện",
                })}
              </Text>
              <TouchableOpacity onPress={onClose} className="p-1">
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView className="px-5 py-4">
              {/* Event Title */}
              <Text className="text-xl font-bold text-slate-900 mb-2">
                {event.title}
              </Text>

              {/* Recurring Note / Badge */}
              {isRecurring && (
                <View className="flex-row items-center gap-2.5 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl mb-3">
                  <View className="w-7 h-7 rounded-lg bg-indigo-100 items-center justify-center">
                    <Feather name="repeat" size={14} color="#4F46E5" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-indigo-900">
                      {t("calendar.detail_modal.recurring_badge", {
                        defaultValue: "Sự kiện định kỳ",
                      })}
                    </Text>
                    <Text className="text-[11px] text-indigo-700 mt-0.5">
                      {getRecurrenceDescription(event.recurrenceRule)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Room / Channel indicator */}
              {isChannelMeeting && (
                <View className="mb-3 self-start">
                  <View className="bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    <Text className="text-xs font-bold text-emerald-700">
                      {t("calendar.channel_meeting", {
                        defaultValue: "Cuộc họp kênh",
                      })}
                    </Text>
                  </View>
                </View>
              )}

              {/* Join & Notification Actions under Title */}
              {(showJoin || hasInvitees || isHost) && (
                <View className="flex-row items-center gap-3 my-2">
                  {showJoin ? (
                    <TouchableOpacity
                      onPress={() => {
                        onClose();
                        onJoin(event.meetingCode!);
                      }}
                      className="flex-1 bg-blue-600 py-3 px-4 rounded-xl flex-row items-center justify-center gap-2 active:bg-blue-700 shadow-sm"
                    >
                      <Feather name="video" size={16} color="#FFFFFF" />
                      <Text className="text-white font-bold text-sm">
                        {t("calendar.join", { defaultValue: "Tham gia" })}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View className="flex-1" />
                  )}

                  {/* Nút bật/tắt thông báo */}
                  <TouchableOpacity
                    onPress={() => setNotificationModalVisible(true)}
                    className={`py-3 px-3.5 rounded-xl border flex-row items-center justify-center ${
                      isNotificationEnabled
                        ? "bg-indigo-50 border-indigo-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <Feather
                      name={isNotificationEnabled ? "bell" : "bell-off"}
                      size={18}
                      color={isNotificationEnabled ? "#4F46E5" : "#94A3B8"}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {/* Info Items */}
              <View className="gap-4 my-3">
                {/* Time */}
                <View className="flex-row items-start gap-3">
                  <Feather
                    name="clock"
                    size={18}
                    color="#0052FF"
                    style={{ marginTop: 2 }}
                  />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-800">
                      {formatDateTime(event.startDate)}
                    </Text>
                    <Text className="text-xs text-slate-500 mt-0.5">
                      {isVi ? "đến" : "to"} {formatDateTime(event.endDate)}
                    </Text>
                  </View>
                </View>

                {/* Description */}
                {hasDescription && (
                  <View className="flex-row items-start gap-3">
                    <Feather
                      name="align-left"
                      size={18}
                      color="#0052FF"
                      style={{ marginTop: 2 }}
                    />
                    <View className="flex-1">
                      <Text className="text-xs text-slate-400 font-medium">
                        {t("calendar.description", { defaultValue: "Mô tả" })}
                      </Text>
                      <Text className="text-sm text-slate-700 mt-1 leading-5">
                        {cleanDesc}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Participants */}
                {(hasInvitees || isHost) && (
                  <View className="mt-2 pt-3 border-t border-slate-100">
                    <View className="flex-row items-center justify-between mb-3">
                      <View className="flex-row items-center gap-2">
                        <Feather name="users" size={18} color="#0052FF" />
                        <Text className="text-sm font-bold text-slate-800">
                          {t("calendar.participants", {
                            defaultValue: "Người tham gia",
                          })}
                        </Text>
                      </View>
                      {isHost && (
                        <TouchableOpacity
                          onPress={() => setInviteModalVisible(true)}
                          className="flex-row items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg active:bg-blue-100"
                        >
                          <Feather name="user-plus" size={13} color="#0052FF" />
                          <Text className="text-xs font-bold text-blue-600">
                            {t("calendar.invite_btn", { defaultValue: "Mời" })}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <View className="gap-2">
                      {/* Host row */}
                      <View className="flex-row items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                        <View className="flex-row items-center gap-2.5 flex-1 mr-2">
                          <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center">
                            <Text className="text-xs font-bold text-blue-700">
                              {(
                                hostMember?.displayName ||
                                event.hostDisplayName ||
                                hostMember?.email ||
                                event.hostEmail ||
                                "?"
                              )
                                .substring(0, 1)
                                .toUpperCase()}
                            </Text>
                          </View>
                          <View className="flex-1">
                            <Text
                              className="text-xs font-bold text-slate-800"
                              numberOfLines={1}
                            >
                              {hostMember?.displayName ||
                                event.hostDisplayName ||
                                hostMember?.email?.split("@")[0] ||
                                event.hostEmail?.split("@")[0] ||
                                ""}
                            </Text>
                            {(hostMember?.email || event.hostEmail) && (
                              <Text
                                className="text-[10px] text-slate-400"
                                numberOfLines={1}
                              >
                                {hostMember?.email || event.hostEmail}
                              </Text>
                            )}
                          </View>
                        </View>
                        <View className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded-md">
                          <Text className="text-[10px] font-bold text-indigo-700">
                            {t("calendar.organizer", {
                              defaultValue: "Người tổ chức",
                            })}
                          </Text>
                        </View>
                      </View>

                      {/* Guest rows */}
                      {guestList.map((inv: any, idx: number) => {
                        const status: string = inv.status || "PENDING";
                        let dotColor = "#94A3B8";
                        if (status === "ACCEPTED") dotColor = "#10B981";
                        else if (status === "DECLINED") dotColor = "#F43F5E";
                        else if (status === "TENTATIVE") dotColor = "#F59E0B";

                        const statusLabel =
                          status === "ACCEPTED"
                            ? t("calendar.responded", {
                                defaultValue: "Đã chấp nhận",
                              })
                            : status === "DECLINED"
                            ? t("calendar.declined", {
                                defaultValue: "Đã từ chối",
                              })
                            : t("calendar.no_response", {
                                defaultValue: "Chưa phản hồi",
                              });

                        return (
                          <View
                            key={idx}
                            className="flex-row items-center justify-between p-2.5 bg-white rounded-xl border border-slate-100"
                          >
                            <View className="flex-row items-center gap-2.5 flex-1 mr-2">
                              <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center">
                                <Text className="text-xs font-bold text-slate-600">
                                  {(inv.displayName || inv.email || "?")
                                    .substring(0, 1)
                                    .toUpperCase()}
                                </Text>
                              </View>
                              <View className="flex-1">
                                <Text
                                  className="text-xs font-semibold text-slate-800"
                                  numberOfLines={1}
                                >
                                  {inv.displayName ||
                                    inv.email?.split("@")[0]}
                                </Text>
                                {inv.email && (
                                  <Text
                                    className="text-[10px] text-slate-400"
                                    numberOfLines={1}
                                  >
                                    {inv.email}
                                  </Text>
                                )}
                              </View>
                            </View>
                            <View className="flex-row items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
                              <View
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: dotColor }}
                              />
                              <Text className="text-[10px] font-medium text-slate-600">
                                {statusLabel}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Footer */}
            <View className="flex-row gap-3 px-5 pt-3 border-t border-slate-100">
              {isHost ? (
                <>
                  <TouchableOpacity
                    onPress={() =>
                      onEdit({ ...event, invitees: activeInvitees })
                    }
                    className="flex-1 py-3 border border-slate-200 rounded-xl flex-row items-center justify-center gap-2 active:bg-slate-50"
                  >
                    <Feather name="edit-2" size={16} color="#475569" />
                    <Text className="text-slate-700 font-semibold text-sm">
                      {t("calendar.edit", { defaultValue: "Chỉnh sửa" })}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setDeleteModalVisible(true)}
                    className="flex-1 py-3 bg-rose-50 border border-rose-200 rounded-xl flex-row items-center justify-center gap-2 active:bg-rose-100"
                  >
                    <Feather name="trash-2" size={16} color="#E11D48" />
                    <Text className="text-rose-600 font-bold text-sm">
                      {t("calendar.delete", { defaultValue: "Xóa" })}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={handleLeaveConfirm}
                  disabled={isLeaving}
                  className="flex-1 py-3 bg-rose-50 border border-rose-200 rounded-xl flex-row items-center justify-center gap-2 active:bg-rose-100"
                >
                  {isLeaving ? (
                    <ActivityIndicator size="small" color="#E11D48" />
                  ) : (
                    <>
                      <Feather name="log-out" size={16} color="#E11D48" />
                      <Text className="text-rose-600 font-bold text-sm">
                        {t("calendar.leave_event", {
                          defaultValue: "Hủy tham gia",
                        })}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Scope Confirmation Modal */}
      {deleteModalVisible && (
        <DeleteEventConfirmModal
          visible={deleteModalVisible}
          onClose={() => setDeleteModalVisible(false)}
          onConfirm={handleConfirmDeleteScope}
          isRecurring={isRecurring}
          occurrenceDate={
            event.occurrenceDate ||
            (event.startDate ? event.startDate.substring(0, 10) : undefined)
          }
          isLoading={isDeleting}
        />
      )}

      {/* Invite Member Modal */}
      {inviteModalVisible && (
        <InviteCalendarModal
          visible={inviteModalVisible}
          onClose={() => setInviteModalVisible(false)}
          eventId={event._id}
          existingMemberIds={existingMemberIds}
          existingEmails={existingEmails}
          onSuccess={() => {
            onRefresh?.();
          }}
        />
      )}

      {/* Notification Toggle Confirm Modal */}
      {notificationModalVisible && (
        <ToggleNotificationConfirmModal
          visible={notificationModalVisible}
          onClose={() =>
            !isTogglingNotification && setNotificationModalVisible(false)
          }
          onConfirm={handleConfirmToggleNotification}
          isCurrentlyEnabled={isNotificationEnabled}
          eventTitle={event.title}
          isLoading={isTogglingNotification}
        />
      )}
    </>
  );
}
