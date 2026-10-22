import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useGetMessageReactionsQuery } from "../../lib/redux/api/directChatApi";
import MobileUserAvatar from "./MobileUserAvatar";
import { useTranslation } from "react-i18next";

interface MobileMessageReactionsModalProps {
  visible: boolean;
  onClose: () => void;
  messageId: string;
  initialTab?: string;
}

export default function MobileMessageReactionsModal({
  visible,
  onClose,
  messageId,
  initialTab = "all",
}: MobileMessageReactionsModalProps) {
  const { t } = useTranslation();
  const { data: reactions = [], isLoading } = useGetMessageReactionsQuery(messageId, {
    skip: !visible || !messageId,
  });

  const [activeTab, setActiveTab] = useState<string>("all");

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab || "all");
    }
  }, [visible, initialTab]);

  const totalCount = reactions.length;
  const emojiCounts: Record<string, number> = {};
  reactions.forEach((r) => {
    emojiCounts[r.reaction] = (emojiCounts[r.reaction] || 0) + 1;
  });

  const activeEmojis = Object.keys(emojiCounts);
  const filteredReactions =
    activeTab === "all"
      ? reactions
      : reactions.filter((r) => r.reaction === activeTab);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-center items-center bg-black/50 p-4">
        <View className="w-full max-w-sm bg-white rounded-2xl max-h-[460px] flex-col overflow-hidden shadow-xl">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-slate-100">
            <Text className="text-base font-bold text-slate-800">
              {t("chat.reactions_modal_title", "Biểu cảm")} ({totalCount})
            </Text>
            <TouchableOpacity onPress={onClose} className="p-1.5 rounded-full">
              <Feather name="x" size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View className="py-16 items-center justify-center">
              <ActivityIndicator size="small" color="#0052FF" />
              <Text className="text-xs text-slate-400 mt-2">
                {t("chat.loading_reactions", "Đang tải danh sách...")}
              </Text>
            </View>
          ) : (
            <>
              {/* Tabs */}
              <View className="border-b border-slate-100 bg-slate-50/70">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 6 }}
                >
                  <TouchableOpacity
                    onPress={() => setActiveTab("all")}
                    className={`px-3 py-1.5 rounded-full border ${
                      activeTab === "all"
                        ? "bg-blue-600 border-blue-600"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        activeTab === "all" ? "text-white" : "text-slate-600"
                      }`}
                    >
                      {t("chat.reactions_tab_all", "Tất cả")} ({totalCount})
                    </Text>
                  </TouchableOpacity>

                  {activeEmojis.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => setActiveTab(emoji)}
                      className={`flex-row items-center px-3 py-1.5 rounded-full border gap-1 ${
                        activeTab === emoji
                          ? "bg-blue-600 border-blue-600"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <Text className="text-xs">{emoji}</Text>
                      <Text
                        className={`text-xs font-semibold ${
                          activeTab === emoji ? "text-white" : "text-slate-600"
                        }`}
                      >
                        {emojiCounts[emoji]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Users List */}
              <View className="flex-1 p-3">
                {filteredReactions.length === 0 ? (
                  <View className="py-10 items-center justify-center">
                    <Text className="text-xs text-slate-400">
                      {t("chat.no_reactions_found", "Chưa có biểu cảm nào.")}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={filteredReactions}
                    keyExtractor={(item, idx) => `${item.userId}-${idx}`}
                    renderItem={({ item }) => (
                      <View className="flex-row items-center justify-between p-2 rounded-xl mb-1">
                        <View className="flex-row items-center flex-1 mr-2">
                          <MobileUserAvatar
                            avatarUrl={item.user?.avatarUrl}
                            displayName={item.user?.displayName}
                            size={38}
                          />
                          <Text
                            className="text-sm font-semibold text-slate-800 ml-3 flex-1"
                            numberOfLines={1}
                          >
                            {item.user?.displayName || t("chat.user_fallback", "Người dùng")}
                          </Text>
                        </View>
                        <Text className="text-xl">{item.reaction}</Text>
                      </View>
                    )}
                  />
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
