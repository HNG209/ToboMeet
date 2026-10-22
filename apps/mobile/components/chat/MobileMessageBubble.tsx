import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { DirectMessageResponse, ChatAttachment } from "../../types/chat";
import MobileUserAvatar from "./MobileUserAvatar";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { isPdfAttachment } from "./MobileAttachmentViewerModal";

interface MobileMessageBubbleProps {
  message: DirectMessageResponse;
  currentUserId?: string;
  isHighlighted?: boolean;
  onLongPress: (message: DirectMessageResponse) => void;
  onOpenReactions: (messageId: string, emoji?: string) => void;
  onJumpToReply?: (replyMessageId: string) => void;
  onPreviewAttachment?: (attachment: ChatAttachment) => void;
  onDownloadAttachment?: (attachment: ChatAttachment) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatMessageTime(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function MobileMessageBubble({
  message,
  currentUserId,
  isHighlighted,
  onLongPress,
  onOpenReactions,
  onJumpToReply,
  onPreviewAttachment,
  onDownloadAttachment,
}: MobileMessageBubbleProps) {
  const { t } = useTranslation();
  const isMe = currentUserId ? message.senderId === currentUserId : false;
  const isDeleted = Boolean(message.deletedAt);
  const timeFormatted = formatMessageTime(message.createdAt);

  const activeReactions = (message.reactions || []).filter(
    (r) => r.userIds && r.userIds.length > 0
  );

  return (
    <View
      className={`my-1.5 px-3 flex-row ${isMe ? "justify-end" : "justify-start"} ${
        isHighlighted ? "bg-amber-100/70 p-2 rounded-2xl" : ""
      }`}
    >
      {/* Avatar for other user */}
      {!isMe && (
        <View className="mr-2 self-end mb-1">
          <MobileUserAvatar
            avatarUrl={message.sender?.avatarUrl}
            displayName={message.sender?.displayName}
            size={32}
          />
        </View>
      )}

      {/* Bubble Container */}
      <View className="max-w-[78%]">
        {/* Sender name for other user */}
        {!isMe && Boolean(message.sender?.displayName) && (
          <Text className="text-[11px] font-semibold text-slate-500 mb-1 ml-1">
            {message.sender?.displayName}
          </Text>
        )}

        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => !isDeleted && onLongPress(message)}
          className={`p-3 rounded-2xl ${
            isDeleted
              ? "bg-slate-100 border border-slate-200"
              : isMe
              ? "bg-blue-600 rounded-br-xs"
              : "bg-slate-100 rounded-bl-xs"
          }`}
        >
          {/* Pinned pill tag */}
          {message.isPinned && !isDeleted && (
            <View
              className={`flex-row items-center gap-1 mb-1.5 self-start px-2 py-0.5 rounded-full ${
                isMe ? "bg-blue-700/60" : "bg-amber-100"
              }`}
            >
              <Feather
                name="bookmark"
                size={10}
                color={isMe ? "#FFFFFF" : "#D97706"}
              />
              <Text
                className={`text-[9px] font-bold ${
                  isMe ? "text-white" : "text-amber-700"
                }`}
              >
                {t("chat.pinned", "Đã ghim")}
              </Text>
            </View>
          )}

          {/* Reply Quote Banner */}
          {message.replyToId && !isDeleted && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                message.replyToId?._id && onJumpToReply?.(message.replyToId._id)
              }
              className={`border-l-2 pl-2.5 py-1 mb-2 rounded-r-md ${
                isMe
                  ? "border-blue-300 bg-blue-700/40"
                  : "border-blue-500 bg-white/70"
              }`}
            >
              <Text
                className={`text-[10px] font-bold ${
                  isMe ? "text-blue-100" : "text-blue-600"
                }`}
              >
                {message.replyToId.senderId === currentUserId
                  ? t("chat.you", "Bạn")
                  : t("chat.replying_to", "Đang trả lời")}
              </Text>
              <Text
                numberOfLines={2}
                className={`text-xs italic ${
                  isMe ? "text-blue-50" : "text-slate-600"
                }`}
              >
                {message.replyToId.deletedAt
                  ? t("chat.replied_message_deleted", "Tin nhắn đã bị thu hồi")
                  : message.replyToId.content || t("chat.attachment", "[Tệp đính kèm]")}
              </Text>
            </TouchableOpacity>
          )}

          {/* Deleted state */}
          {isDeleted ? (
            <Text className="text-xs italic text-slate-400">
              {t("chat.message_deleted", "Tin nhắn đã bị thu hồi")}
            </Text>
          ) : (
            <>
              {/* Text content */}
              {Boolean(message.content) && (
                <Text
                  className={`text-sm leading-relaxed ${
                    isMe ? "text-white" : "text-slate-800"
                  }`}
                >
                  {message.content}
                </Text>
              )}

              {/* Attachments */}
              {message.attachments && message.attachments.length > 0 && (
                <View className="mt-2 space-y-1.5">
                  {message.attachments.map((att: ChatAttachment, idx: number) => {
                    const isPdf = isPdfAttachment(att);

                    // 1. Ảnh: Mở trực tiếp trong app bằng Modal viewer
                    if (att.fileType === "image") {
                      return (
                        <TouchableOpacity
                          key={idx}
                          activeOpacity={0.9}
                          onPress={() => onPreviewAttachment?.(att)}
                          className="rounded-xl overflow-hidden my-1 bg-black/5"
                        >
                          <Image
                            source={{ uri: att.url, cache: "force-cache" }}
                            style={{ width: 220, height: 160, borderRadius: 12 }}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      );
                    }

                    // 2. Video: Mở trong viewer
                    if (att.fileType === "video") {
                      return (
                        <TouchableOpacity
                          key={idx}
                          activeOpacity={0.9}
                          onPress={() => onPreviewAttachment?.(att)}
                          className="p-3 rounded-xl bg-black/10 flex-row items-center gap-2.5 my-1"
                        >
                          <View className="w-9 h-9 rounded-full bg-purple-600 items-center justify-center">
                            <Feather name="play" size={16} color="#FFFFFF" />
                          </View>
                          <View className="flex-1">
                            <Text
                              className={`text-xs font-bold ${
                                isMe ? "text-white" : "text-slate-800"
                              }`}
                              numberOfLines={1}
                            >
                              {att.fileName || "Video"}
                            </Text>
                            <Text
                              className={`text-[10px] ${
                                isMe ? "text-blue-100" : "text-slate-500"
                              }`}
                            >
                              {formatBytes(att.fileSize)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              onDownloadAttachment?.(att);
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            className="p-1.5 rounded-lg active:bg-black/10"
                          >
                            <Feather
                              name="download"
                              size={15}
                              color={isMe ? "#FFFFFF" : "#64748B"}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    }

                    // 3. Tài liệu PDF: Mở trực tiếp bằng In-App Browser siêu tốc, nút Download tách riêng
                    if (isPdf) {
                      return (
                        <TouchableOpacity
                          key={idx}
                          activeOpacity={0.85}
                          onPress={async () => {
                            try {
                              await WebBrowser.openBrowserAsync(att.url, {
                                presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
                                toolbarColor: "#0F172A",
                                controlsColor: "#FFFFFF",
                              });
                            } catch {
                              onPreviewAttachment?.(att);
                            }
                          }}
                          className={`flex-row items-center p-2.5 rounded-xl my-1 border ${
                            isMe
                              ? "bg-blue-700/50 border-blue-500/50"
                              : "bg-white border-slate-200"
                          }`}
                        >
                          <View className="w-9 h-9 rounded-lg bg-red-50 items-center justify-center mr-2.5">
                            <Feather name="file-text" size={18} color="#EF4444" />
                          </View>
                          <View className="flex-1 mr-2">
                            <View className="flex-row items-center gap-1.5">
                              <Text
                                className={`text-xs font-bold flex-1 ${
                                  isMe ? "text-white" : "text-slate-800"
                                }`}
                                numberOfLines={1}
                              >
                                {att.fileName || "Tài liệu PDF"}
                              </Text>
                              <View className="px-1.5 py-0.5 rounded bg-red-500/20">
                                <Text className="text-[9px] font-bold text-red-500">PDF</Text>
                              </View>
                            </View>
                            <Text
                              className={`text-[10px] ${
                                isMe ? "text-blue-100" : "text-slate-400"
                              }`}
                            >
                              {formatBytes(att.fileSize)}
                            </Text>
                          </View>
                          {/* Nút Download riêng biệt */}
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              onDownloadAttachment?.(att);
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            className="p-1.5 rounded-lg active:opacity-60"
                          >
                            <Feather
                              name="download"
                              size={16}
                              color={isMe ? "#FFFFFF" : "#64748B"}
                            />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    }

                    // 4. Các định dạng file khác
                    return (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.8}
                        onPress={() => onPreviewAttachment?.(att)}
                        className={`flex-row items-center p-2.5 rounded-xl my-1 border ${
                          isMe
                            ? "bg-blue-700/50 border-blue-500/50"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <View className="w-8 h-8 rounded-lg bg-blue-50 items-center justify-center mr-2.5">
                          <Feather name="file-text" size={16} color="#0052FF" />
                        </View>
                        <View className="flex-1 mr-2">
                          <Text
                            className={`text-xs font-bold ${
                              isMe ? "text-white" : "text-slate-800"
                            }`}
                            numberOfLines={1}
                          >
                            {att.fileName}
                          </Text>
                          <Text
                            className={`text-[10px] ${
                              isMe ? "text-blue-100" : "text-slate-400"
                            }`}
                          >
                            {formatBytes(att.fileSize)}
                          </Text>
                        </View>
                        {/* Nút Download riêng biệt */}
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation();
                            onDownloadAttachment?.(att);
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          className="p-1.5 rounded-lg active:opacity-60"
                        >
                          <Feather
                            name="download"
                            size={15}
                            color={isMe ? "#FFFFFF" : "#64748B"}
                          />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* Timestamp inside bubble */}
          <View className="flex-row justify-end mt-1">
            <Text
              className={`text-[10px] ${
                isMe ? "text-blue-200" : "text-slate-400"
              }`}
            >
              {timeFormatted}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Reaction Bar */}
        {!isDeleted && activeReactions.length > 0 && (
          <View
            className={`flex-row flex-wrap items-center gap-1 mt-1 ${
              isMe ? "justify-end" : "justify-start"
            }`}
          >
            {activeReactions.map((r) => {
              const hasReacted = currentUserId ? r.userIds.includes(currentUserId) : false;
              return (
                <TouchableOpacity
                  key={r.emoji}
                  activeOpacity={0.7}
                  onPress={() => onOpenReactions(message.id, r.emoji)}
                  className={`flex-row items-center px-2 py-0.5 rounded-full border ${
                    hasReacted
                      ? "bg-blue-50 border-blue-300"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <Text className="text-xs mr-1">{r.emoji}</Text>
                  <Text
                    className={`text-[11px] font-semibold ${
                      hasReacted ? "text-blue-700 font-bold" : "text-slate-600"
                    }`}
                  >
                    {r.userIds.length}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
