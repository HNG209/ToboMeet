import React from "react";
import { Modal, View, Text, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { DirectMessageResponse } from "../../types/chat";
import { useTranslation } from "react-i18next";

const COMMON_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

interface MobileMessageActionSheetProps {
  visible: boolean;
  message: DirectMessageResponse | null;
  currentUserId?: string;
  onClose: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: DirectMessageResponse) => void;
  onTogglePin: (message: DirectMessageResponse) => void;
  onDelete: (messageId: string) => void;
}

export default function MobileMessageActionSheet({
  visible,
  message,
  currentUserId,
  onClose,
  onReact,
  onReply,
  onTogglePin,
  onDelete,
}: MobileMessageActionSheetProps) {
  const { t } = useTranslation();

  if (!message) return null;

  const isMe = currentUserId ? message.senderId === currentUserId : false;
  const isPinned = Boolean(message.isPinned);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="flex-1 justify-end bg-black/40"
      >
        <TouchableOpacity
          activeOpacity={1}
          className="bg-white rounded-t-3xl p-5 pb-8 shadow-2xl"
        >
          {/* Reaction Bar */}
          <View className="flex-row items-center justify-around bg-slate-50 p-2.5 rounded-2xl mb-4 border border-slate-100">
            {COMMON_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                activeOpacity={0.6}
                onPress={() => {
                  onReact(message.id, emoji);
                  onClose();
                }}
                className="p-1.5"
              >
                <Text className="text-2xl">{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action List */}
          <View className="space-y-1">
            {/* Reply */}
            <TouchableOpacity
              onPress={() => {
                onClose();
                onReply(message);
              }}
              className="flex-row items-center py-3.5 px-3 rounded-xl active:bg-slate-50"
            >
              <Feather name="corner-up-left" size={18} color="#0052FF" className="mr-3.5" />
              <Text className="text-sm font-semibold text-slate-800">
                {t("chat.reply", "Trả lời")}
              </Text>
            </TouchableOpacity>

            {/* Pin / Unpin */}
            <TouchableOpacity
              onPress={() => {
                onClose();
                onTogglePin(message);
              }}
              className="flex-row items-center py-3.5 px-3 rounded-xl active:bg-slate-50"
            >
              <Feather
                name={isPinned ? "bookmark" : "bookmark"}
                size={18}
                color="#D97706"
                className="mr-3.5"
              />
              <Text className="text-sm font-semibold text-slate-800">
                {isPinned
                  ? t("chat.unpin_message", "Bỏ ghim tin nhắn")
                  : t("chat.pin_message", "Ghim tin nhắn")}
              </Text>
            </TouchableOpacity>

            {/* Delete / Recall (Only for sender) */}
            {isMe && (
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onDelete(message.id);
                }}
                className="flex-row items-center py-3.5 px-3 rounded-xl active:bg-red-50"
              >
                <Feather name="trash-2" size={18} color="#EF4444" className="mr-3.5" />
                <Text className="text-sm font-semibold text-red-600">
                  {t("chat.delete_message", "Thu hồi tin nhắn")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
