import React from "react";
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

interface ToggleNotificationConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isCurrentlyEnabled: boolean;
  eventTitle: string;
  isLoading?: boolean;
}

export default function ToggleNotificationConfirmModal({
  visible,
  onClose,
  onConfirm,
  isCurrentlyEnabled,
  eventTitle,
  isLoading = false,
}: ToggleNotificationConfirmModalProps) {
  const { t, i18n } = useTranslation();

  if (!visible) return null;

  const isVi = i18n.language === "vi";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-slate-900/50 justify-center items-center p-5">
        <View className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-100">
          {/* Header Icon + Title */}
          <View className="flex-row items-center gap-3.5 mb-3">
            <View
              className={`w-11 h-11 rounded-2xl items-center justify-center border ${
                isCurrentlyEnabled
                  ? "bg-amber-50 border-amber-200"
                  : "bg-indigo-50 border-indigo-200"
              }`}
            >
              <Feather
                name={isCurrentlyEnabled ? "bell-off" : "bell"}
                size={22}
                color={isCurrentlyEnabled ? "#D97706" : "#4F46E5"}
              />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-slate-800 leading-tight">
                {isCurrentlyEnabled
                  ? t("calendar.notification_modal.turn_off_title", {
                      defaultValue: isVi
                        ? "Tắt thông báo lịch họp"
                        : "Turn Off Meeting Notifications",
                    })
                  : t("calendar.notification_modal.turn_on_title", {
                      defaultValue: isVi
                        ? "Bật thông báo lịch họp"
                        : "Turn On Meeting Notifications",
                    })}
              </Text>
              <Text className="text-xs text-slate-400 font-medium mt-0.5">
                {isCurrentlyEnabled
                  ? t("calendar.notification_modal.turn_off_subtitle", {
                      defaultValue: isVi
                        ? "Xác nhận tắt thông báo cho sự kiện này"
                        : "Confirm turning off notifications for this event",
                    })
                  : t("calendar.notification_modal.turn_on_subtitle", {
                      defaultValue: isVi
                        ? "Xác nhận bật thông báo cho sự kiện này"
                        : "Confirm turning on notifications for this event",
                    })}
              </Text>
            </View>
          </View>

          {/* Description */}
          <Text className="text-sm text-slate-600 my-4 leading-5">
            {isCurrentlyEnabled
              ? t("calendar.notification_modal.turn_off_prompt", {
                  title: eventTitle,
                  defaultValue: isVi
                    ? `Bạn có chắc chắn muốn tắt thông báo cho sự kiện "${eventTitle}"? Bạn sẽ không nhận được chuông hoặc thông báo nhắc nhở khi đến giờ cuộc họp.`
                    : `Are you sure you want to turn off notifications for event "${eventTitle}"? You will not receive reminder alerts when the meeting starts.`,
                })
              : t("calendar.notification_modal.turn_on_prompt", {
                  title: eventTitle,
                  defaultValue: isVi
                    ? `Bạn có muốn bật lại thông báo cho sự kiện "${eventTitle}"? Hệ thống sẽ tự động gửi thông báo nhắc nhở cho bạn ngay khi sự kiện bắt đầu.`
                    : `Do you want to enable notifications for event "${eventTitle}"? You will automatically receive reminder alerts when the event starts.`,
                })}
          </Text>

          {/* Action Buttons */}
          <View className="flex-row gap-3 pt-2">
            <TouchableOpacity
              onPress={onClose}
              disabled={isLoading}
              className="flex-1 py-3 border border-slate-200 rounded-xl items-center justify-center active:bg-slate-50"
            >
              <Text className="text-slate-700 font-semibold text-sm">
                {t("calendar.notification_modal.cancel", {
                  defaultValue: isVi ? "Hủy" : "Cancel",
                })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onConfirm}
              disabled={isLoading}
              className={`flex-1 py-3 rounded-xl items-center justify-center shadow-sm ${
                isCurrentlyEnabled
                  ? "bg-amber-600 active:bg-amber-700"
                  : "bg-indigo-600 active:bg-indigo-700"
              }`}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white font-bold text-sm">
                  {isCurrentlyEnabled
                    ? t("calendar.notification_modal.turn_off_confirm", {
                        defaultValue: isVi ? "Tắt thông báo" : "Turn Off",
                      })
                    : t("calendar.notification_modal.turn_on_confirm", {
                        defaultValue: isVi ? "Bật thông báo" : "Turn On",
                      })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
