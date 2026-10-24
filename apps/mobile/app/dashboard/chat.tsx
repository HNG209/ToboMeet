import React, { useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetConversationsQuery,
  useCreateOrGetConversationMutation,
} from "../../lib/redux/api/directChatApi";
import MobileConversationItem from "../../components/chat/MobileConversationItem";
import MobileUserAvatar from "../../components/chat/MobileUserAvatar";
import { useGlobalUserSearch } from "../../hooks/useGlobalUserSearch";
import { useTranslation } from "react-i18next";
import { DirectConversationResponse } from "../../types/chat";
import DashboardHeader from "../../components/dashboard/DashboardHeader";

export default function ChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchInputRef = useRef<TextInput | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const {
    data: conversations = [],
    isLoading,
    refetch,
    isFetching,
  } = useGetConversationsQuery();

  const [createOrGetConversation, { isLoading: isCreating }] =
    useCreateOrGetConversationMutation();

  const trimmedQuery = searchQuery.trim();

  // Tìm kiếm người dùng toàn hệ thống qua API debounced
  const { users: globalUsers, isSearching: isSearchingGlobal } = useGlobalUserSearch({
    q: trimmedQuery,
    limit: 15,
    skip: !trimmedQuery,
  });

  const handleSelectConversation = (conv: DirectConversationResponse) => {
    const targetId = conv.id || (conv as any)._id;
    if (targetId) {
      router.push(`/chat/${targetId}`);
    }
  };

  const handleSelectUser = async (user: any) => {
    const targetUserId = user.supabaseId || user.id || user._id;
    if (!targetUserId) return;

    try {
      const conv = await createOrGetConversation({
        recipientId: targetUserId,
      }).unwrap();

      const targetId = conv.id || (conv as any)._id;
      setSearchQuery("");
      if (targetId) {
        router.push(`/chat/${targetId}`);
      }
    } catch (err) {
      console.error("[ChatScreen] Create conversation error:", err);
    }
  };

  // --- 1. Lọc danh sách hội thoại có sẵn theo từ khóa ---
  const filteredConversations: DirectConversationResponse[] = useMemo(() => {
    if (!trimmedQuery) return conversations;
    const q = trimmedQuery.toLowerCase();
    return conversations.filter((conv) => {
      const name = conv.recipient?.displayName?.toLowerCase() ?? "";
      const email = conv.recipient?.email?.toLowerCase() ?? "";
      return name.includes(q) || email.includes(q);
    });
  }, [conversations, trimmedQuery]);

  // --- 2. Lọc danh sách người dùng trong hệ thống (chưa có trong danh sách hội thoại khớp) ---
  const newSystemUsers = useMemo(() => {
    if (!trimmedQuery) return [];
    const existingRecipientIds = new Set(
      filteredConversations.map((c) => c.recipient?.supabaseId).filter(Boolean)
    );
    return globalUsers.filter((u: any) => {
      const uid = u.supabaseId || u._id || u.id;
      return !existingRecipientIds.has(uid);
    });
  }, [globalUsers, filteredConversations, trimmedQuery]);

  const hasNoResults =
    Boolean(trimmedQuery) &&
    !isSearchingGlobal &&
    filteredConversations.length === 0 &&
    newSystemUsers.length === 0;

  return (
    <View className="flex-1 bg-white">
      {/* Header đồng bộ (Teams style) */}
      <DashboardHeader title={t("dashboard.tab_chat", "Trò chuyện")} />

      {/* Ô tìm kiếm người dùng */}
      <View className="px-4 py-2.5 border-b border-slate-100 bg-white">

        {/* Ô tìm kiếm: Dùng style tĩnh, không thay đổi elevation khi focus để tránh mất focus trên Android */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 20,
            paddingHorizontal: 12,
            height: 38,
            borderWidth: 1.5,
            borderColor: isSearchFocused ? "#3b82f6" : "#f1f5f9",
            backgroundColor: isSearchFocused ? "#ffffff" : "#f1f5f9",
          }}
        >
          <Feather
            name="search"
            size={15}
            color={isSearchFocused ? "#0052FF" : "#94a3b8"}
            style={{ marginRight: 8 }}
          />
          <TextInput
            ref={searchInputRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder={t(
              "chat.search_placeholder",
              "Tìm người dùng...",
            )}
            placeholderTextColor="#94a3b8"
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
            style={{
              flex: 1,
              fontSize: 14,
              color: "#1e293b",
              paddingVertical: 0,
            }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={14} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color="#0052FF" />
          <Text className="text-xs text-slate-400 mt-2">
            {t("chat.loading_conversations", "Đang tải danh sách...")}
          </Text>
        </View>
      ) : conversations.length === 0 && !trimmedQuery ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-16 h-16 rounded-full bg-blue-50 items-center justify-center mb-4">
            <Feather name="message-square" size={28} color="#0052FF" />
          </View>
          <Text className="text-base font-bold text-slate-800 mb-1">
            {t("chat.no_conversations", "Chưa có cuộc trò chuyện nào")}
          </Text>
          <Text className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
            {t(
              "chat.no_conversations_desc",
              "Bắt đầu trò chuyện với bạn bè hoặc đồng nghiệp trong hệ thống.",
            )}
          </Text>
          <TouchableOpacity
            onPress={() => searchInputRef.current?.focus()}
            activeOpacity={0.8}
            className="flex-row items-center bg-blue-600 px-5 py-2.5 rounded-xl"
          >
            <Feather
              name="user-plus"
              size={16}
              color="#FFFFFF"
              style={{ marginRight: 6 }}
            />
            <Text className="text-xs font-bold text-white">
              {t("chat.start_conversation", "Bắt đầu cuộc trò chuyện")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor="#0052FF"
            />
          }
          ListHeaderComponent={
            trimmedQuery && filteredConversations.length > 0 ? (
              <View className="px-4 pt-3 pb-1.5 bg-slate-50 border-b border-slate-100">
                <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("chat.section_conversations", "Cuộc trò chuyện")} ({filteredConversations.length})
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <MobileConversationItem
              conversation={item}
              onPress={() => handleSelectConversation(item)}
            />
          )}
          ListEmptyComponent={
            hasNoResults ? (
              <View className="items-center justify-center py-16 px-6">
                <Feather name="search" size={32} color="#cbd5e1" />
                <Text className="text-sm font-semibold text-slate-600 mt-3 text-center">
                  {t(
                    "chat.search_no_results",
                    "Không tìm thấy kết quả phù hợp",
                  )}
                </Text>
                <Text className="text-xs text-slate-400 mt-1 text-center">
                  {t("chat.search_try_other", "Thử tìm với tên hoặc email khác")}
                </Text>
              </View>
            ) : isSearchingGlobal && filteredConversations.length === 0 ? (
              <View className="items-center justify-center py-12">
                <ActivityIndicator size="small" color="#0052FF" />
                <Text className="text-xs text-slate-400 mt-2">
                  {t("chat.searching", "Đang tìm kiếm...")}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            trimmedQuery ? (
              <View className="pb-8">
                {/* Đang tìm kiếm thêm từ server */}
                {isSearchingGlobal && filteredConversations.length > 0 && (
                  <View className="flex-row items-center justify-center py-3">
                    <ActivityIndicator size="small" color="#0052FF" />
                    <Text className="text-xs text-slate-400 ml-2">
                      {t("chat.searching", "Đang tìm kiếm...")}
                    </Text>
                  </View>
                )}

                {/* Danh sách người dùng trong hệ thống */}
                {newSystemUsers.length > 0 && (
                  <View className="mt-2">
                    <View className="px-4 py-2 bg-slate-50 border-y border-slate-100">
                      <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {t("chat.section_system_users", "Người dùng trong hệ thống")} ({newSystemUsers.length})
                      </Text>
                    </View>
                    {newSystemUsers.map((user: any) => {
                      const uid = user.supabaseId || user._id || user.id;
                      return (
                        <TouchableOpacity
                          key={uid}
                          onPress={() => handleSelectUser(user)}
                          activeOpacity={0.7}
                          className="flex-row items-center px-4 py-3 bg-white border-b border-slate-100"
                        >
                          <MobileUserAvatar
                            avatarUrl={user.avatarUrl}
                            displayName={user.displayName}
                            size={44}
                          />
                          <View className="flex-1 ml-3 justify-center">
                            <Text className="text-sm font-bold text-slate-800" numberOfLines={1}>
                              {user.displayName || t("chat.user_fallback", "Người dùng")}
                            </Text>
                            {Boolean(user.email) && (
                              <Text className="text-xs text-slate-400 mt-0.5" numberOfLines={1}>
                                {user.email}
                              </Text>
                            )}
                          </View>
                          <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center">
                            {isCreating ? (
                              <ActivityIndicator size="small" color="#0052FF" />
                            ) : (
                              <Feather name="message-circle" size={16} color="#0052FF" />
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

