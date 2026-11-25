import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import {
  useCreatePostMutation,
  useUpdatePostMutation,
  useGetSignedUploadUrlMutation,
  AttachmentDto,
  PostDto,
} from "../../lib/redux/features/newsFeed/newsFeedApi";

interface CreatePostModalProps {
  visible: boolean;
  roomId: string;
  channelId: string;
  editPost?: PostDto | null;
  onClose: () => void;
}

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏", "🎉", "🔥", "🚀", "💡", "💯"];

export default function CreatePostModal({
  visible,
  roomId,
  channelId,
  editPost,
  onClose,
}: CreatePostModalProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState(editPost ? editPost.content : "");
  const [attachments, setAttachments] = useState<AttachmentDto[]>(
    editPost?.attachments || []
  );
  const [isUploading, setIsUploading] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [createPost, { isLoading: isCreating }] = useCreatePostMutation();
  const [updatePost, { isLoading: isUpdating }] = useUpdatePostMutation();
  const [getSignedUrl] = useGetSignedUploadUrlMutation();

  React.useEffect(() => {
    if (editPost) {
      setContent(editPost.content);
      setAttachments(editPost.attachments || []);
    } else {
      setContent("");
      setAttachments([]);
    }
    setShowEmojiPicker(false);
    setSelection({ start: 0, end: 0 });
  }, [editPost, visible]);

  const insertFormatting = (before: string, after: string = "") => {
    const { start, end } = selection;
    const textBefore = content.substring(0, start);
    const selectedText = content.substring(start, end);
    const textAfter = content.substring(end);

    const newContent = textBefore + before + selectedText + after + textAfter;
    setContent(newContent);
    setShowEmojiPicker(false);
  };

  const insertEmoji = (emoji: string) => {
    const { start, end } = selection;
    const textBefore = content.substring(0, start);
    const textAfter = content.substring(end);

    const newContent = textBefore + emoji + textAfter;
    setContent(newContent);
    const newPos = start + emoji.length;
    setSelection({ start: newPos, end: newPos });
  };

  const insertNumberedList = () => {
    const { start } = selection;
    const textBefore = content.substring(0, start);
    const lines = textBefore.split("\n");
    let lastNum = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].match(/^\s*(\d+)\.\s/);
      if (match) {
        lastNum = parseInt(match[1], 10);
        break;
      }
    }

    const nextNum = lastNum + 1;
    const prefix = textBefore.endsWith("\n") || textBefore.length === 0 ? "" : "\n";
    insertFormatting(`${prefix}${nextNum}. `);
  };

  const handlePickImage = async () => {
    try {
      let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      if (!permission.granted) {
        Alert.alert("Thông báo", "Quyền truy cập thư viện ảnh bị từ chối.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setIsUploading(true);

        const fileName = asset.fileName || `image_${Date.now()}.jpg`;
        const { signedUrl, url } = await getSignedUrl({ fileName }).unwrap();

        // Upload using fetch PUT
        const fileRes = await fetch(asset.uri);
        const blob = await fileRes.blob();

        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          body: blob,
          headers: {
            "Content-Type": asset.mimeType || "image/jpeg",
          },
        });

        if (uploadRes.ok) {
          setAttachments((prev) => [
            ...prev,
            {
              url,
              fileName,
              fileType: "image",
              fileSize: asset.fileSize || 0,
            },
          ]);
        } else {
          Alert.alert("Lỗi", "Không thể tải ảnh lên. Vui lòng thử lại.");
        }
      }
    } catch (err) {
      console.log("Upload error:", err);
      Alert.alert("Lỗi", "Tải tệp thất bại.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!content.trim() && attachments.length === 0) {
      Alert.alert("Thông báo", "Vui lòng nhập nội dung bài viết.");
      return;
    }

    try {
      if (editPost) {
        await updatePost({
          postId: editPost._id,
          content: content.trim(),
          attachments,
        }).unwrap();
      } else {
        await createPost({
          roomId,
          channelId,
          content: content.trim(),
          attachments,
        }).unwrap();
      }
      onClose();
    } catch (err) {
      console.log("Submit post error:", err);
      Alert.alert(t("room.error"), t("news_feed.submit_post_error"));
    }
  };

  if (!visible) return null;

  const isLoading = isCreating || isUpdating || isUploading;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/60 justify-center items-center p-4">
        {/* Backdrop */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => !isLoading && onClose()}
          className="absolute inset-0"
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="w-full max-w-lg max-h-[85%] bg-white rounded-3xl overflow-hidden shadow-2xl z-10 border border-slate-100"
        >
          {/* Header */}
          <View className="px-6 py-4 border-b border-slate-100 flex-row justify-between items-center bg-white">
            <Text className="font-bold text-slate-900 text-lg">
              {editPost ? t("news_feed.edit_post_title") : t("news_feed.new_post_title")}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={isLoading}
              className="p-1.5 rounded-full hover:bg-slate-100"
            >
              <Feather name="x" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Body Content */}
          <ScrollView
            className="flex-shrink"
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ padding: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              value={content}
              onChangeText={setContent}
              onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
              placeholder={t("news_feed.post_placeholder")}
              placeholderTextColor="#94A3B8"
              multiline
              className="text-base text-slate-800 min-h-[140px] text-left"
              style={{ textAlignVertical: "top" }}
            />

            {/* Attachments Preview */}
            {attachments.length > 0 && (
              <View className="flex-row flex-wrap gap-2.5 mt-4 pt-4 border-t border-slate-100">
                {attachments.map((att, idx) => (
                  <View
                    key={idx}
                    className="relative w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200"
                  >
                    {att.fileType === "image" ? (
                      <Image
                        source={{ uri: att.url }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="flex-1 justify-center items-center p-2">
                        <Feather name="file" size={22} color="#64748B" />
                        <Text
                          className="text-[10px] text-slate-500 mt-1 font-medium"
                          numberOfLines={1}
                        >
                          {att.fileName}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => handleRemoveAttachment(idx)}
                      className="absolute top-1 right-1 bg-black/60 w-5 h-5 rounded-full justify-center items-center"
                    >
                      <Feather name="x" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Emoji Popover Tray */}
          {showEmojiPicker && (
            <View className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex-row flex-wrap gap-2 justify-center">
              {EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => insertEmoji(emoji)}
                  className="p-1.5 active:bg-slate-200 rounded-lg"
                >
                  <Text className="text-xl">{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Footer Toolbar - Matched with Web layout */}
          <View className="p-4 border-t border-slate-100 bg-white flex-row items-center justify-between flex-wrap gap-2">
            {/* Formatting Toolbar */}
            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl p-1 gap-1">
              <TouchableOpacity
                onPress={() => insertFormatting("**", "**")}
                className="w-8 h-8 rounded-lg justify-center items-center active:bg-slate-200"
              >
                <Feather name="bold" size={15} color="#475569" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => insertFormatting("*", "*")}
                className="w-8 h-8 rounded-lg justify-center items-center active:bg-slate-200"
              >
                <Feather name="italic" size={15} color="#475569" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => insertFormatting("__", "__")}
                className="w-8 h-8 rounded-lg justify-center items-center active:bg-slate-200"
              >
                <Feather name="underline" size={15} color="#475569" />
              </TouchableOpacity>
              <View className="w-[1px] h-4 bg-slate-200 mx-0.5" />
              <TouchableOpacity
                onPress={() => insertFormatting("\n- ")}
                className="w-8 h-8 rounded-lg justify-center items-center active:bg-slate-200"
              >
                <Feather name="list" size={16} color="#475569" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={insertNumberedList}
                className="w-8 h-8 rounded-lg justify-center items-center active:bg-slate-200"
              >
                <MaterialIcons name="format-list-numbered" size={18} color="#475569" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`w-8 h-8 rounded-lg justify-center items-center active:bg-slate-200 ${
                  showEmojiPicker ? "bg-blue-100" : ""
                }`}
              >
                <Feather
                  name="smile"
                  size={16}
                  color={showEmojiPicker ? "#0052FF" : "#475569"}
                />
              </TouchableOpacity>
            </View>

            {/* Right Action Group (Đính kèm & Đăng bài) */}
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={handlePickImage}
                disabled={isUploading}
                className="flex-row items-center gap-1.5 border border-slate-200 bg-white px-3.5 py-2 rounded-xl active:bg-slate-50"
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color="#0052FF" />
                ) : (
                  <Feather name="paperclip" size={15} color="#475569" />
                )}
                <Text className="text-slate-700 text-xs font-semibold">
                  {t("news_feed.attach_file")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isLoading || (!content.trim() && attachments.length === 0)}
                className="bg-[#0052FF] px-5 py-2 rounded-xl active:bg-blue-700 flex-row items-center justify-center min-w-[90px]"
                style={{
                  opacity:
                    content.trim() || attachments.length > 0 ? 1 : 0.5,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-xs">
                    {editPost ? t("news_feed.save_button") : t("news_feed.post_button")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
