import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing,
  BackHandler,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import MobileUserAvatar from "./MobileUserAvatar";
import {
  DirectConversationResponse,
  DirectMessageResponse,
  ChatAttachment,
} from "../../types/chat";

interface MobileConversationDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  conversation?: DirectConversationResponse | null;
  messages: DirectMessageResponse[];
  onPreviewAttachment: (attachment: ChatAttachment) => void;
  onDownloadAttachment: (attachment: ChatAttachment) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function MobileConversationDetailsModal({
  visible,
  onClose,
  conversation,
  messages,
  onPreviewAttachment,
  onDownloadAttachment,
}: MobileConversationDetailsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"media" | "files">("media");
  const [mounted, setMounted] = useState(visible);

  const screenWidth = Dimensions.get("window").width;
  const translateX = useRef(new Animated.Value(screenWidth)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateX.setValue(screenWidth);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(translateX, {
        toValue: screenWidth,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setMounted(false);
      });
    }
  }, [visible, screenWidth]);

  const handleClose = () => {
    Animated.timing(translateX, {
      toValue: screenWidth,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setMounted(false);
      onClose();
    });
  };

  useEffect(() => {
    if (!mounted) return;
    const backAction = () => {
      handleClose();
      return true;
    };
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );
    return () => backHandler.remove();
  }, [mounted]);

  // 1. Trích xuất toàn bộ media và file từ danh sách tin nhắn hiện tại (dùng useMemo tránh tính toán lại)
  const allAttachments = useMemo(() => {
    if (!conversation) return [];
    const list: { attachment: ChatAttachment; createdAt: string }[] = [];
    messages.forEach((msg) => {
      if (msg.attachments && !msg.deletedAt) {
        msg.attachments.forEach((att) => {
          list.push({ attachment: att, createdAt: msg.createdAt });
        });
      }
    });
    return list;
  }, [messages, conversation]);

  const mediaList = useMemo(
    () =>
      allAttachments.filter((item) =>
        ["image", "video"].includes(item.attachment.fileType)
      ),
    [allAttachments]
  );

  const fileList = useMemo(
    () => allAttachments.filter((item) => item.attachment.fileType === "file"),
    [allAttachments]
  );

  // 2. Smart Prefetch: Tự động nạp trước ngầm tối đa 15 ảnh đầu tiên khi mở modal
  useEffect(() => {
    if (visible && mediaList.length > 0) {
      mediaList.slice(0, 15).forEach((item) => {
        if (item.attachment.fileType === "image" && item.attachment.url) {
          Image.prefetch(item.attachment.url).catch(() => {});
        }
      });
    }
  }, [visible, mediaList]);

  if (!mounted || !conversation) return null;

  const recipient = conversation.recipient;
  const isOnline = recipient?.status === "ACTIVE";

  const numColumns = 3;
  const totalHorizontalPadding = 32; // px-4 = 16 each side
  const totalGap = 8 * (numColumns - 1);
  const mediaItemSize = Math.floor(
    (screenWidth - totalHorizontalPadding - totalGap) / numColumns
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: "transparent" }}>
        <Animated.View
          style={{
            flex: 1,
            transform: [{ translateX }],
            backgroundColor: "#ffffff",
          }}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: "#ffffff" }}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

            {/* 1. Header */}
            <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-white">
              <TouchableOpacity
                onPress={handleClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="p-1 rounded-full"
              >
            <Feather name="arrow-left" size={22} color="#1E293B" />
          </TouchableOpacity>

          <Text className="text-base font-bold text-slate-800">
            {t("chat.details", "Thông tin cuộc trò chuyện")}
          </Text>

          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 2. Recipient Profile Section */}
          <View className="items-center px-6 pt-6 pb-5 border-b border-slate-100 bg-white">
            <View className="relative mb-3">
              <MobileUserAvatar
                avatarUrl={recipient?.avatarUrl}
                displayName={recipient?.displayName}
                size={76}
              />
              <View
                className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${
                  isOnline ? "bg-emerald-500" : "bg-slate-300"
                }`}
              />
            </View>

            <Text className="text-lg font-bold text-slate-900 text-center mb-1">
              {recipient?.displayName || t("chat.user_fallback", "Người dùng")}
            </Text>

            {Boolean(recipient?.email) && (
              <Text className="text-xs text-slate-400 text-center mb-2">
                {recipient?.email}
              </Text>
            )}

            <View className="flex-row items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-100 mt-1">
              <View
                className={`w-2 h-2 rounded-full ${
                  isOnline ? "bg-emerald-500" : "bg-slate-300"
                }`}
              />
              <Text
                className={`text-xs font-medium ${
                  isOnline ? "text-emerald-600" : "text-slate-400"
                }`}
              >
                {isOnline
                  ? t("chat.online", "Đang hoạt động")
                  : t("chat.offline", "Ngoại tuyến")}
              </Text>
            </View>
          </View>

          {/* 3. Horizontal Tabs */}
          <View className="flex-row border-b border-slate-100 bg-white">
            <TouchableOpacity
              onPress={() => setActiveTab("media")}
              activeOpacity={0.8}
              className={`flex-1 py-3.5 flex-row items-center justify-center gap-2 border-b-2 ${
                activeTab === "media"
                  ? "border-blue-600"
                  : "border-transparent"
              }`}
            >
              <Feather
                name="image"
                size={16}
                color={activeTab === "media" ? "#0052FF" : "#64748B"}
              />
              <Text
                className={`text-xs font-bold ${
                  activeTab === "media" ? "text-blue-600" : "text-slate-500"
                }`}
              >
                {t("chat.photos_shared", "Hình ảnh & Video")}
                {mediaList.length > 0 && ` (${mediaList.length})`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab("files")}
              activeOpacity={0.8}
              className={`flex-1 py-3.5 flex-row items-center justify-center gap-2 border-b-2 ${
                activeTab === "files"
                  ? "border-blue-600"
                  : "border-transparent"
              }`}
            >
              <Feather
                name="file-text"
                size={16}
                color={activeTab === "files" ? "#0052FF" : "#64748B"}
              />
              <Text
                className={`text-xs font-bold ${
                  activeTab === "files" ? "text-blue-600" : "text-slate-500"
                }`}
              >
                {t("chat.files_shared", "Tệp đã gửi")}
                {fileList.length > 0 && ` (${fileList.length})`}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 4. Tab Content */}
          <View className="p-4">
            {activeTab === "media" ? (
              mediaList.length === 0 ? (
                <View className="items-center justify-center py-16 px-4">
                  <View className="w-14 h-14 rounded-full bg-slate-50 items-center justify-center mb-3">
                    <Feather name="image" size={26} color="#CBD5E1" />
                  </View>
                  <Text className="text-xs text-slate-400 text-center">
                    {t("chat.no_media_shared", "Chưa có hình ảnh hoặc video nào")}
                  </Text>
                </View>
              ) : (
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {mediaList.map((item, idx) => {
                    const isVideo = item.attachment.fileType === "video";
                    return (
                      <TouchableOpacity
                        key={`${item.attachment.url}_${idx}`}
                        onPress={() => onPreviewAttachment(item.attachment)}
                        activeOpacity={0.8}
                        style={{
                          width: mediaItemSize,
                          height: mediaItemSize,
                          borderRadius: 10,
                          overflow: "hidden",
                          backgroundColor: "#F1F5F9",
                        }}
                      >
                        {isVideo ? (
                          <View className="w-full h-full bg-slate-900 items-center justify-center">
                            <View className="w-9 h-9 rounded-full bg-white/25 items-center justify-center">
                              <Feather name="play" size={18} color="#FFFFFF" />
                            </View>
                            <Text
                              className="text-[9px] text-white/80 font-medium mt-1 truncate px-1"
                              numberOfLines={1}
                            >
                              {item.attachment.fileName}
                            </Text>
                          </View>
                        ) : (
                          <Image
                            source={{ uri: item.attachment.url, cache: "force-cache" }}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )
            ) : fileList.length === 0 ? (
              <View className="items-center justify-center py-16 px-4">
                <View className="w-14 h-14 rounded-full bg-slate-50 items-center justify-center mb-3">
                  <Feather name="file-text" size={26} color="#CBD5E1" />
                </View>
                <Text className="text-xs text-slate-400 text-center">
                  {t("chat.no_files_shared", "Chưa có tệp tài liệu nào")}
                </Text>
              </View>
            ) : (
              <View className="space-y-2">
                {fileList.map((item, idx) => {
                  const isPdf =
                    item.attachment.fileName?.toLowerCase().endsWith(".pdf") ||
                    item.attachment.mimeType === "application/pdf";

                  return (
                    <TouchableOpacity
                      key={`${item.attachment.url}_${idx}`}
                      onPress={async () => {
                        if (isPdf) {
                          try {
                            await WebBrowser.openBrowserAsync(item.attachment.url, {
                              presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
                              toolbarColor: "#0F172A",
                              controlsColor: "#FFFFFF",
                            });
                          } catch {
                            onPreviewAttachment(item.attachment);
                          }
                        }
                      }}
                      activeOpacity={0.7}
                      className="flex-row items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 mb-2"
                    >
                      <View className="flex-row items-center flex-1 mr-2">
                        <View
                          className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                            isPdf ? "bg-red-50" : "bg-blue-50"
                          }`}
                        >
                          <Feather
                            name="file-text"
                            size={20}
                            color={isPdf ? "#EF4444" : "#0052FF"}
                          />
                        </View>
                        <View className="flex-1">
                          <Text
                            className="text-xs font-bold text-slate-800"
                            numberOfLines={1}
                          >
                            {item.attachment.fileName}
                          </Text>
                          <View className="flex-row items-center gap-2 mt-0.5">
                            <Text className="text-[11px] text-slate-400">
                              {formatBytes(item.attachment.fileSize)}
                            </Text>
                            {isPdf && (
                              <Text className="text-[11px] text-blue-600 font-semibold">
                                • {t("chat.preview", { defaultValue: "Xem trước" })}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Nút Download riêng biệt */}
                      <TouchableOpacity
                        onPress={() => onDownloadAttachment(item.attachment)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        className="w-8 h-8 rounded-full bg-white border border-slate-200 items-center justify-center"
                      >
                        <Feather name="download" size={14} color="#64748B" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}
