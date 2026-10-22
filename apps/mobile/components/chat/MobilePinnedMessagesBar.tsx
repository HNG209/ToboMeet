import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { PinnedMessageDetail } from "../../types/chat";
import MobileUserAvatar from "./MobileUserAvatar";
import { useTranslation } from "react-i18next";

interface MobilePinnedMessagesBarProps {
  pinnedMessages?: PinnedMessageDetail[];
  currentUserId?: string;
  onJumpToMessage: (messageId: string) => void;
  onUnpinMessage: (messageId: string) => Promise<void>;
}

export default function MobilePinnedMessagesBar({
  pinnedMessages = [],
  currentUserId,
  onJumpToMessage,
  onUnpinMessage,
}: MobilePinnedMessagesBarProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [unpinningId, setUnpinningId] = useState<string | null>(null);

  if (!pinnedMessages || pinnedMessages.length === 0) return null;

  const count = pinnedMessages.length;
  const latestPinned = pinnedMessages[0];

  const handleUnpin = async (messageId: string) => {
    try {
      setUnpinningId(messageId);
      await onUnpinMessage(messageId);
    } finally {
      setUnpinningId(null);
    }
  };

  const renderSnippet = (msg: PinnedMessageDetail) => {
    if (msg.content) {
      return msg.content;
    }
    if (msg.attachments && msg.attachments.length > 0) {
      const first = msg.attachments[0];
      if (first.fileType === "image") return t("chat.photo_snippet", "[Hình ảnh]");
      if (first.fileType === "video") return t("chat.video_snippet", "[Video]");
      return `[${first.fileName || t("chat.file_snippet", "Tệp tin")}]`;
    }
    return t("chat.message", "Tin nhắn");
  };

  return (
    <View className="z-20 border-b border-amber-200/80 bg-amber-50">
      {/* Header bar */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setIsExpanded(!isExpanded)}
        className="flex-row items-center justify-between px-3.5 py-2"
      >
        <View className="flex-row items-center flex-1 mr-2">
          <View className="w-5 h-5 rounded-full bg-amber-500/20 items-center justify-center mr-2">
            <Feather name="bookmark" size={11} color="#D97706" />
          </View>
          <View className="flex-row items-center flex-1">
            <Text className="text-xs font-bold text-amber-900 mr-1.5">
              {t("chat.pinned", "Đã ghim")} ({count}/3):
            </Text>
            <Text numberOfLines={1} className="text-xs text-slate-700 flex-1">
              <Text className="font-semibold text-slate-800">
                {latestPinned.sender?.displayName || t("chat.user_fallback", "Người dùng")}:{" "}
              </Text>
              {renderSnippet(latestPinned)}
            </Text>
          </View>
        </View>

        <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#B45309" />
      </TouchableOpacity>

      {/* Expanded list */}
      {isExpanded && (
        <View className="bg-white border-t border-amber-100 p-2.5 max-h-60">
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
            {pinnedMessages.map((msg, index) => {
              const isUnpinning = unpinningId === msg.id;
              const pinnerName =
                msg.pinner?.displayName ||
                (msg.pinnedBy === currentUserId
                  ? t("chat.you", "Bạn")
                  : t("chat.user_fallback", "Người dùng"));

              return (
                <TouchableOpacity
                  key={msg.id || index}
                  activeOpacity={0.8}
                  onPress={() => {
                    onJumpToMessage(msg.id);
                    setIsExpanded(false);
                  }}
                  className="flex-row items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/80 mb-2"
                >
                  <MobileUserAvatar
                    avatarUrl={msg.sender?.avatarUrl}
                    displayName={msg.sender?.displayName}
                    size={36}
                  />

                  <View className="flex-1 mx-2.5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-bold text-slate-800" numberOfLines={1}>
                        {msg.sender?.displayName || t("chat.user_fallback", "Người dùng")}
                      </Text>
                    </View>
                    <Text className="text-xs text-slate-600 mt-0.5" numberOfLines={2}>
                      {renderSnippet(msg)}
                    </Text>
                    <Text className="text-[10px] text-amber-700 font-medium mt-1">
                      {t("chat.pinned_by", "Ghim bởi")} {pinnerName}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleUnpin(msg.id)}
                    disabled={isUnpinning}
                    className="p-2 rounded-lg bg-white border border-slate-200"
                  >
                    {isUnpinning ? (
                      <ActivityIndicator size="small" color="#EF4444" />
                    ) : (
                      <Feather name="minus-circle" size={15} color="#EF4444" />
                    )}
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
