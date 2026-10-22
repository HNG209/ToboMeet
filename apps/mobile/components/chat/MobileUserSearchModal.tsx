import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useGlobalUserSearch } from "../../hooks/useGlobalUserSearch";
import MobileUserAvatar from "./MobileUserAvatar";
import { useTranslation } from "react-i18next";

interface MobileUserSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectUser: (user: any) => void;
  isLoading?: boolean;
}

export default function MobileUserSearchModal({
  visible,
  onClose,
  onSelectUser,
  isLoading: isCreatingConv,
}: MobileUserSearchModalProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");

  const { users, isSearching } = useGlobalUserSearch({
    q: searchTerm,
    limit: 25,
    skip: !visible,
  });

  const handleClose = () => {
    setSearchTerm("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end bg-black/50"
      >
        <View className="bg-white rounded-t-3xl max-h-[85%] flex-col overflow-hidden">
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-100">
            <View className="flex-row items-center gap-2">
              <View className="w-8 h-8 rounded-xl bg-blue-50 items-center justify-center">
                <Feather name="user-plus" size={16} color="#0052FF" />
              </View>
              <Text className="font-bold text-slate-800 text-base">
                {t("chat.new_chat", "Tin nhắn mới")}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} className="p-1.5 rounded-full">
              <Feather name="x" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Search Box */}
          <View className="p-4 border-b border-slate-100 bg-slate-50/50">
            <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-2">
              <Feather name="search" size={16} color="#94A3B8" className="mr-2" />
              <TextInput
                autoFocus
                placeholder={t("chat.search_placeholder", "Nhập tên hoặc email...")}
                placeholderTextColor="#94A3B8"
                value={searchTerm}
                onChangeText={setSearchTerm}
                className="flex-1 text-sm text-slate-800 p-0"
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity onPress={() => setSearchTerm("")}>
                  <Feather name="x-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* User List or Loading or Empty State */}
          <View className="flex-1 min-h-[250px] p-2">
            {isSearching || isCreatingConv ? (
              <View className="flex-1 items-center justify-center py-12">
                <ActivityIndicator size="small" color="#0052FF" />
                <Text className="text-xs text-slate-400 mt-2">
                  {t("chat.searching", "Đang tìm kiếm...")}
                </Text>
              </View>
            ) : searchTerm.trim().length === 0 ? (
              <View className="flex-1 items-center justify-center py-12 px-6">
                <Feather name="users" size={32} color="#CBD5E1" />
                <Text className="text-xs text-slate-400 text-center mt-2 leading-relaxed">
                  {t(
                    "chat.search_users_hint",
                    "Nhập tên hoặc email người bạn muốn trò chuyện để bắt đầu cuộc trò chuyện."
                  )}
                </Text>
              </View>
            ) : users.length === 0 ? (
              <View className="flex-1 items-center justify-center py-12 px-6">
                <Feather name="user-x" size={32} color="#CBD5E1" />
                <Text className="text-sm font-semibold text-slate-700 mt-2">
                  {t("chat.no_users_found", "Không tìm thấy người dùng")}
                </Text>
                <Text className="text-xs text-slate-400 text-center mt-1">
                  {t("chat.search_users_not_found_hint", "Thử tìm kiếm với email hoặc tên khác")}
                </Text>
              </View>
            ) : (
              <FlatList
                data={users}
                keyExtractor={(item) => item.supabaseId || item._id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => onSelectUser(item)}
                    activeOpacity={0.7}
                    className="flex-row items-center p-3 rounded-xl hover:bg-slate-50 border-b border-slate-50"
                  >
                    <MobileUserAvatar
                      avatarUrl={item.avatarUrl}
                      displayName={item.displayName}
                      size={44}
                    />
                    <View className="flex-1 ml-3">
                      <Text className="text-sm font-bold text-slate-800">
                        {item.displayName || t("chat.user_fallback", "Người dùng")}
                      </Text>
                      {Boolean(item.email) && (
                        <Text className="text-xs text-slate-400 mt-0.5" numberOfLines={1}>
                          {item.email}
                        </Text>
                      )}
                    </View>
                    <View className="w-8 h-8 rounded-full bg-blue-50 items-center justify-center">
                      <Feather name="message-circle" size={16} color="#0052FF" />
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
