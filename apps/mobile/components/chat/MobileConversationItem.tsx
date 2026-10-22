import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { DirectConversationResponse } from "../../types/chat";
import MobileUserAvatar from "./MobileUserAvatar";
import { useTranslation } from "react-i18next";

interface MobileConversationItemProps {
  conversation: DirectConversationResponse;
  onPress: () => void;
}

function formatRelativeTime(dateStr?: string | null, yesterdayLabel = "Hôm qua") {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return yesterdayLabel;
    }

    return `${date.getDate()}/${date.getMonth() + 1}`;
  } catch {
    return "";
  }
}

export default function MobileConversationItem({
  conversation,
  onPress,
}: MobileConversationItemProps) {
  const { t } = useTranslation();
  const { recipient, lastMessagePreview, lastMessageAt, unreadCount } = conversation;
  const timeFormatted = formatRelativeTime(lastMessageAt, t("chat.yesterday", "Hôm qua"));
  const isOnline = recipient?.status === "ACTIVE";

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      className="flex-row items-center px-4 py-3 bg-white border-b border-slate-100"
    >
      {/* Avatar with online badge */}
      <View className="relative mr-3">
        <MobileUserAvatar
          avatarUrl={recipient?.avatarUrl}
          displayName={recipient?.displayName}
          size={50}
        />
        {isOnline && (
          <View className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
        )}
      </View>

      {/* Info */}
      <View className="flex-1 justify-center">
        <View className="flex-row items-center justify-between mb-1">
          <Text
            numberOfLines={1}
            className={`text-sm flex-1 mr-2 ${
              unreadCount > 0 ? "font-bold text-slate-900" : "font-semibold text-slate-800"
            }`}
          >
            {recipient?.displayName || t("chat.user_fallback", "Người dùng")}
          </Text>
          {Boolean(timeFormatted) && (
            <Text
              className={`text-[11px] ${
                unreadCount > 0 ? "text-blue-600 font-bold" : "text-slate-400 font-normal"
              }`}
            >
              {timeFormatted}
            </Text>
          )}
        </View>

        <View className="flex-row items-center justify-between">
          <Text
            numberOfLines={1}
            className={`text-xs flex-1 mr-2 ${
              unreadCount > 0 ? "font-semibold text-slate-800" : "text-slate-500"
            }`}
          >
            {(!lastMessagePreview ||
            lastMessagePreview === "Cuộc trò chuyện mới" ||
            lastMessagePreview === "New conversation")
              ? t("chat.new_conversation", "Cuộc trò chuyện mới")
              : lastMessagePreview === "📷 [Hình ảnh]" || lastMessagePreview === "📷 [Photo]"
              ? `📷 ${t("chat.photo_snippet", "[Hình ảnh]")}`
              : lastMessagePreview === "🎥 [Video]"
              ? `🎥 ${t("chat.video_snippet", "[Video]")}`
              : lastMessagePreview}
          </Text>

          {unreadCount > 0 && (
            <View className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-blue-600 items-center justify-center">
              <Text className="text-white text-[10px] font-bold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
