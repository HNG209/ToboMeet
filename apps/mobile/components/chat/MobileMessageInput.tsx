import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { DirectMessageResponse, ChatAttachment } from "../../types/chat";
import { useGetChatUploadUrlMutation } from "../../lib/redux/api/directChatApi";
import { useTranslation } from "react-i18next";

interface MobileMessageInputProps {
  conversationId: string;
  replyTo?: DirectMessageResponse | null;
  onCancelReply: () => void;
  onSendMessage: (payload: {
    content?: string;
    type?: "text" | "file" | "video" | "image";
    attachments?: ChatAttachment[];
    replyToId?: string;
  }) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  onFocus?: () => void;
}

interface StagedAttachment extends ChatAttachment {
  id: string;
  uri?: string;
  isUploading: boolean;
  progress?: number;
}

const uploadFileWithProgress = async (
  signedUrl: string,
  fileUri: string,
  mimeType: string,
  onProgress: (percent: number) => void
): Promise<void> => {
  try {
    const fileRes = await fetch(fileUri);
    const blob = await fileRes.blob();

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", signedUrl);
      xhr.setRequestHeader("Content-Type", mimeType || "application/octet-stream");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));
      xhr.timeout = 60000;
      xhr.send(blob);
    });
  } catch {
    const uploadResult = await FileSystem.uploadAsync(signedUrl, fileUri, {
      httpMethod: "PUT",
      headers: { "Content-Type": mimeType || "application/octet-stream" },
    });
    if (uploadResult.status < 200 || uploadResult.status >= 300) {
      throw new Error(`Upload failed with status ${uploadResult.status}`);
    }
    onProgress(100);
  }
};

export default function MobileMessageInput({
  conversationId,
  replyTo,
  onCancelReply,
  onSendMessage,
  onTyping,
  onFocus,
}: MobileMessageInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);

  const [getUploadUrl] = useGetChatUploadUrlMutation();

  const handleTextChange = (val: string) => {
    setText(val);
    onTyping(val.trim().length > 0);
  };

  // Pick Image / Video
  const handlePickMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        for (const asset of result.assets) {
          const isVideo = asset.type === "video";
          const tempId = Math.random().toString();
          const fileName = asset.fileName || (isVideo ? `video_${Date.now()}.mp4` : `image_${Date.now()}.jpg`);
          const fileSize = asset.fileSize || 1024 * 100;
          const mimeType = asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg");

          // 50MB for video, 10MB for image
          const limit = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
          if (fileSize > limit) {
            Alert.alert(
              t("chat.error", "Lỗi"),
              isVideo
                ? t("chat.file_too_large_video", "Dung lượng video vượt quá 50MB")
                : t("chat.file_too_large_image", "Dung lượng tệp vượt quá 10MB")
            );
            continue;
          }

          const staged: StagedAttachment = {
            id: tempId,
            uri: asset.uri,
            fileName,
            fileSize,
            fileType: isVideo ? "video" : "image",
            mimeType,
            url: "",
            isUploading: true,
            progress: 0,
          };

          setAttachments((prev) => [...prev, staged]);

          try {
            const uploadRes = await getUploadUrl({
              conversationId,
              fileName,
              fileSize,
              mimeType,
            }).unwrap();

            await uploadFileWithProgress(
              uploadRes.signedUrl,
              asset.uri,
              mimeType,
              (prog) => {
                setAttachments((prev) =>
                  prev.map((a) => (a.id === tempId ? { ...a, progress: prog } : a))
                );
              }
            );

            setAttachments((prev) =>
              prev.map((a) =>
                a.id === tempId
                  ? { ...a, url: uploadRes.url, isUploading: false, progress: 100 }
                  : a
              )
            );
          } catch {
            Alert.alert(t("chat.error", "Lỗi"), t("chat.upload_failed", "Tải tệp lên thất bại"));
            setAttachments((prev) => prev.filter((a) => a.id !== tempId));
          }
        }
      }
    } catch (err) {
      console.error("[MobileMessageInput] Pick media error:", err);
    }
  };

  // Pick Document
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const tempId = Math.random().toString();
        const fileName = file.name;
        const fileSize = file.size || 1024 * 50;
        const mimeType = file.mimeType || "application/octet-stream";

        if (fileSize > 25 * 1024 * 1024) {
          Alert.alert(t("chat.error", "Lỗi"), t("chat.file_too_large", "Dung lượng tệp vượt quá 25MB"));
          return;
        }

        const staged: StagedAttachment = {
          id: tempId,
          uri: file.uri,
          fileName,
          fileSize,
          fileType: "file",
          mimeType,
          url: "",
          isUploading: true,
          progress: 0,
        };

        setAttachments((prev) => [...prev, staged]);

        try {
          const uploadRes = await getUploadUrl({
            conversationId,
            fileName,
            fileSize,
            mimeType,
          }).unwrap();

          await uploadFileWithProgress(
            uploadRes.signedUrl,
            file.uri,
            mimeType,
            (prog) => {
              setAttachments((prev) =>
                prev.map((a) => (a.id === tempId ? { ...a, progress: prog } : a))
              );
            }
          );

          setAttachments((prev) =>
            prev.map((a) =>
              a.id === tempId
                ? { ...a, url: uploadRes.url, isUploading: false, progress: 100 }
                : a
            )
          );
        } catch {
          Alert.alert(t("chat.error", "Lỗi"), t("chat.upload_failed", "Tải tệp lên thất bại"));
          setAttachments((prev) => prev.filter((a) => a.id !== tempId));
        }
      }
    } catch (err) {
      console.error("[MobileMessageInput] Pick document error:", err);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    const readyAttachments: ChatAttachment[] = attachments
      .filter((a) => !a.isUploading && a.url)
      .map(({ fileName, fileSize, fileType, mimeType, url }) => ({
        fileName,
        fileSize,
        fileType,
        mimeType,
        url,
      }));

    if (!trimmed && readyAttachments.length === 0) return;

    const currentText = trimmed;
    const currentAttachments = [...readyAttachments];
    const previousStaged = [...attachments];
    const currentReplyToId = replyTo?.id;

    // Reset giao diện NGAY LẬP TỨC (0ms) để trải nghiệm mượt mà không bị khựng
    setText("");
    setAttachments([]);
    onCancelReply();
    onTyping(false);

    try {
      let primaryType: "text" | "file" | "video" | "image" = "text";
      if (currentAttachments.length > 0) {
        primaryType = currentAttachments[0].fileType;
      }

      await onSendMessage({
        content: currentText || undefined,
        type: primaryType,
        attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
        replyToId: currentReplyToId,
      });
    } catch (err) {
      // Khôi phục nếu lỗi
      setText(currentText);
      setAttachments(previousStaged);
      console.error("[MobileMessageInput] Send error:", err);
      Alert.alert(t("chat.error", "Lỗi"), t("chat.send_failed", "Không thể gửi tin nhắn."));
    }
  };

  const anyUploading = attachments.some((a) => a.isUploading);
  const canSend = (text.trim().length > 0 || attachments.some((a) => !a.isUploading)) && !anyUploading && !isSending;

  return (
    <View className="bg-white border-t border-slate-100 pb-2">
      {/* Reply Banner */}
      {replyTo && (
        <View className="flex-row items-center justify-between px-4 py-2 bg-blue-50/80 border-b border-blue-100">
          <View className="flex-1 mr-2">
            <Text className="text-xs font-bold text-blue-700">
              {t("chat.replying_to", "Đang trả lời")}{" "}
              {replyTo.sender?.displayName || t("chat.user_fallback", "Người dùng")}
            </Text>
            <Text numberOfLines={1} className="text-xs text-slate-600 italic">
              {replyTo.content || t("chat.attachment", "[Tệp đính kèm]")}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} className="p-1 rounded-full">
            <Feather name="x" size={16} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-3 py-2 border-b border-slate-50"
        >
          {attachments.map((att) => (
            <View
              key={att.id}
              className="relative mr-2.5 rounded-xl border border-slate-200 bg-slate-50 p-1.5 flex-row items-center"
            >
              {att.fileType === "image" ? (
                <Image
                  source={{ uri: att.uri }}
                  style={{ width: 44, height: 44, borderRadius: 8 }}
                />
              ) : (
                <View className="w-11 h-11 rounded-lg bg-blue-100 items-center justify-center">
                  <Feather
                    name={att.fileType === "video" ? "video" : "file-text"}
                    size={20}
                    color="#0052FF"
                  />
                </View>
              )}

              {att.isUploading && (
                <View className="absolute inset-0 bg-black/40 rounded-xl items-center justify-center">
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              )}

              <TouchableOpacity
                onPress={() => removeAttachment(att.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 items-center justify-center"
              >
                <Feather name="x" size={12} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Input Row */}
      <View className="flex-row items-end px-3 pt-2">
        {/* Attach Media */}
        <TouchableOpacity
          onPress={handlePickMedia}
          className="p-2.5 rounded-full mr-1"
          activeOpacity={0.7}
        >
          <Feather name="image" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Attach Document */}
        <TouchableOpacity
          onPress={handlePickDocument}
          className="p-2.5 rounded-full mr-1.5"
          activeOpacity={0.7}
        >
          <Feather name="paperclip" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Text Input */}
        <View className="flex-1 bg-slate-100 rounded-2xl px-3.5 py-2 max-h-28 justify-center">
          <TextInput
            multiline
            placeholder={t("chat.type_message", "Nhập tin nhắn...")}
            placeholderTextColor="#94A3B8"
            value={text}
            onChangeText={handleTextChange}
            onFocus={onFocus}
            className="text-sm text-slate-800 p-0"
          />
        </View>

        {/* Send Button */}
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.8}
          className={`w-10 h-10 rounded-full items-center justify-center ml-2 ${
            canSend ? "bg-blue-600" : "bg-slate-200"
          }`}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather
              name="send"
              size={18}
              color={canSend ? "#FFFFFF" : "#94A3B8"}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
