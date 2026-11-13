import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import {
  PostDto,
  useDeletePostMutation,
  useTogglePostReactionMutation,
  newsFeedApi,
} from "../../lib/redux/features/newsFeed/newsFeedApi";
import { useUpdateCalendarRsvpMutation } from "../../lib/redux/api/calendarApi";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../../lib/redux/store";
import { REACTION_ICONS } from "./ReactionPicker";
import ReactionPicker from "./ReactionPicker";
import CommentSectionModal from "./CommentSectionModal";
import PostReactionsModal from "./PostReactionsModal";
import { renderFormattedText } from "../../utils/markdownParser";

interface PostItemProps {
  post: PostDto;
  currentUserId?: string;
  onEditPost: (post: PostDto) => void;
}

export default function PostItem({
  post,
  currentUserId,
  onEditPost,
}: PostItemProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [deletePost] = useDeletePostMutation();
  const [toggleReaction] = useTogglePostReactionMutation();
  const [updateCalendarRsvp, { isLoading: isUpdatingRsvp }] = useUpdateCalendarRsvpMutation();
  const dispatch = useDispatch<AppDispatch>();

  const [showReactions, setShowReactions] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showPostReactionsModal, setShowPostReactionsModal] = useState(false);

  const isAuthor = post.authorId === currentUserId;

  const targetEventId = post.calendarEvent?._id || post.eventId || post.meetingId;
  const [localJoined, setLocalJoined] = useState<boolean | null>(null);
  const isEventJoined = localJoined !== null ? localJoined : Boolean(post.calendarEvent?.isJoined);

  const handleJoinMeeting = async () => {
    if (isEventJoined || !targetEventId) return;
    try {
      await updateCalendarRsvp({
        eventId: targetEventId,
        status: "ACCEPTED",
      }).unwrap();
      setLocalJoined(true);
      dispatch(
        newsFeedApi.util.updateQueryData(
          "getPosts",
          { roomId: post.roomId, channelId: post.channelId },
          (draft) => {
            const target = draft.find((p) => p._id === post._id);
            if (target && target.calendarEvent) {
              target.calendarEvent.isJoined = true;
            }
          }
        )
      );
    } catch (err: any) {
      console.log("Join meeting error:", err);
      Alert.alert(
        t("room.error"),
        err?.data?.message ||
          (i18n.language === "vi"
            ? "Không thể cập nhật trạng thái tham gia"
            : "Failed to join event"),
      );
    }
  };

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMs < 0 || diffSec < 60) return t("news_feed.just_now");
    if (diffMin < 60) return t("news_feed.minutes_ago", { count: diffMin });
    if (diffHr < 24) return t("news_feed.hours_ago", { count: diffHr });

    // Quá 24h thì hiển thị ngày giờ đầy đủ
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateFormatted = date.toLocaleDateString();
    return `${time} ${dateFormatted}`;
  };

  const formatMeetingDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const isVi = i18n.language === "vi";
    const daysVi = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
    const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = isVi ? daysVi[date.getDay()] : daysEn[date.getDay()];
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    if (isVi) {
      return `${dayName}, ${date.getDate()} tháng ${date.getMonth() + 1}, ${date.getFullYear()} ${hours}:${minutes}`;
    }
    const monthsEn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${dayName}, ${monthsEn[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hours}:${minutes}`;
  };

  const handleDelete = () => {
    setShowMenuModal(false);
    Alert.alert(t("news_feed.confirm_delete_title"), t("news_feed.confirm_delete_post"), [
      { text: t("news_feed.cancel"), style: "cancel" },
      {
        text: t("news_feed.delete_post"),
        style: "destructive",
        onPress: async () => {
          try {
            await deletePost(post._id).unwrap();
          } catch (err) {
            console.log("Delete post error:", err);
            Alert.alert(t("room.error"), t("news_feed.delete_post_error"));
          }
        },
      },
    ]);
  };

  const handleSelectReaction = async (type: string) => {
    try {
      await toggleReaction({
        postId: post._id,
        type,
        roomId: post.roomId,
        channelId: post.channelId,
      }).unwrap();
    } catch (err) {
      console.log("Reaction error:", err);
    }
  };

  const totalReactionsCount = post.reactionStats?.reduce(
    (acc, curr) => acc + curr.count,
    0
  );

  return (
    <View className="bg-white rounded-2xl border border-slate-100 p-4 mb-4 shadow-sm">
      {/* Post Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-full bg-blue-100 justify-center items-center">
            <Text className="font-bold text-blue-600 text-sm">
              {post.author?.displayName
                ? post.author.displayName.charAt(0).toUpperCase()
                : "U"}
            </Text>
          </View>
          <View>
            <View className="flex-row items-center gap-1.5">
              <Text className="font-bold text-slate-800 text-base">
                {post.author?.displayName || "Người dùng"}
              </Text>
              {post.author?.role === "owner" && (
                <View className="bg-amber-100 px-2 py-0.5 rounded-full">
                  <Text className="text-[10px] font-bold text-amber-700">{t("news_feed.owner")}</Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-slate-400 mt-0.5">
              {formatTimeAgo(post.createdAt)}
            </Text>
          </View>
        </View>

        {isAuthor && !post.isMeeting && !post.isAssignment && (
          <TouchableOpacity
            onPress={() => setShowMenuModal(true)}
            className="p-1"
          >
            <Feather name="more-horizontal" size={20} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      {/* Content hoặc Meeting Card hoặc Assignment Card */}
      {post.isMeeting ? (
        <View className="mb-3">
          {/* Meeting card */}
          <View className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex-row items-center justify-between gap-3 mb-2">
            <View className="flex-row items-center gap-3 flex-1 min-w-0">
              {/* Calendar icon */}
              <View className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl items-center justify-center shrink-0">
                <Feather name="calendar" size={20} color="#0052FF" />
              </View>
              {/* Info */}
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-bold text-slate-800" numberOfLines={1}>
                  {post.calendarEvent?.title || post.meetingTitle || (i18n.language === "vi" ? "Cuộc họp" : "Meeting")}
                </Text>
                <Text className="text-xs text-slate-400 font-semibold mt-0.5" numberOfLines={1}>
                  {formatMeetingDate(post.calendarEvent?.startDate || post.meetingStartDate || "")}
                </Text>
              </View>
            </View>
            {/* Tham gia button */}
            {isEventJoined ? (
              <View className="bg-blue-50 border border-blue-200 px-3.5 py-2 rounded-xl flex-row items-center gap-1.5 shrink-0">
                <Feather name="check-circle" size={14} color="#0052FF" />
                <Text className="text-blue-700 text-xs font-bold">
                  {i18n.language === "vi" ? "Đã tham gia" : "Joined"}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleJoinMeeting}
                disabled={isUpdatingRsvp}
                className="bg-blue-600 px-4 py-2 rounded-xl shrink-0 flex-row items-center gap-1"
                activeOpacity={0.8}
              >
                {isUpdatingRsvp && <ActivityIndicator size="small" color="#FFFFFF" />}
                <Text className="text-white text-xs font-bold">
                  {i18n.language === "vi" ? "Tham gia" : "Join"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Label */}
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">
            {i18n.language === "vi" ? "Đã lên lịch cuộc họp" : "Scheduled a meeting"}
          </Text>
        </View>
      ) : post.isAssignment ? (
        <View className="mb-3">
          {/* Assignment card */}
          <View className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex-row items-center justify-between gap-3 mb-2">
            <View className="flex-row items-center gap-3 flex-1 min-w-0">
              {/* Clipboard icon */}
              <View className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl items-center justify-center shrink-0">
                <Feather name="clipboard" size={20} color="#2563EB" />
              </View>
              {/* Info */}
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-bold text-slate-800" numberOfLines={1}>
                  {post.assignmentTitle || ""}
                </Text>
                <Text className="text-xs text-slate-400 font-semibold mt-0.5" numberOfLines={1}>
                  {formatMeetingDate(post.assignmentDeadline || "") || (i18n.language === "vi" ? "Không có hạn chót" : "No deadline")}
                </Text>
              </View>
            </View>
            {/* Xem button */}
            <TouchableOpacity
              onPress={() => router.push(`/assignment/${post.assignmentId}?roomId=${post.roomId}`)}
              className="bg-blue-600 px-4 py-2 rounded-xl shrink-0"
              activeOpacity={0.8}
            >
              <Text className="text-white text-xs font-bold">
                {i18n.language === "vi" ? "Xem" : "View"}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Label */}
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-1">
            {i18n.language === "vi" ? "Đã giao nhiệm vụ" : "Assigned a task"}
          </Text>
        </View>
      ) : (
        <>
          {/* Content */}
          <Text className="text-base text-slate-700 leading-relaxed mb-3">
            {renderFormattedText(post.content)}
          </Text>

          {/* Attachments */}
          {post.attachments && post.attachments.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mb-3">
              {post.attachments.map((att, idx) => (
                <View
                  key={idx}
                  className="w-full h-56 rounded-2xl overflow-hidden bg-slate-100 border border-slate-100"
                >
                  {att.fileType === "image" ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setPreviewImageUrl(att.url)}
                      className="w-full h-full"
                    >
                      <Image
                        source={{ uri: att.url }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ) : (
                    <View className="flex-1 justify-center items-center p-4">
                      <Feather name="file-text" size={32} color="#0052FF" />
                      <Text className="text-sm font-semibold text-slate-700 mt-2">
                        {att.fileName}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Stats Bar */}
      {totalReactionsCount > 0 && (
        <View className="flex-row items-center justify-between py-2 border-t border-b border-slate-100 my-2">
          {/* Reaction stats */}
          <TouchableOpacity
            onPress={() => setShowPostReactionsModal(true)}
            className="flex-row items-center gap-1 py-0.5"
          >
            {post.reactionStats?.map((stat) => (
              <Text key={stat.reaction} className="text-xs">
                {REACTION_ICONS[stat.reaction]?.emoji}
              </Text>
            ))}
            <Text className="text-xs text-slate-500 font-medium ml-1">
              {totalReactionsCount}
            </Text>
          </TouchableOpacity>
          
        </View>
      )}

      {/* Actions Bar */}
      <View className="flex-row items-center justify-around pt-1">
        {/* Reaction Button */}
        <TouchableOpacity
          onPress={() =>
            handleSelectReaction(
              post.userReaction ? post.userReaction : "👍"
            )
          }
          onLongPress={() => setShowReactions(true)}
          className="flex-row items-center gap-1.5 py-1 px-3 rounded-lg"
        >
          {post.userReaction ? (
            <Text className="text-base">
              {post.userReaction}
            </Text>
          ) : (
            <Feather name="thumbs-up" size={18} color="#64748B" />
          )}
          <Text
            className={`text-sm font-semibold ${
              post.userReaction ? "text-[#0052FF]" : "text-slate-600"
            }`}
          >
            {post.userReaction
              ? REACTION_ICONS[post.userReaction]?.label || t("news_feed.liked")
              : t("news_feed.like")}
          </Text>
        </TouchableOpacity>

        {/* Comment Button */}
        <TouchableOpacity
          onPress={() => setShowCommentsModal(!showCommentsModal)}
          className="flex-row items-center gap-1.5 py-1 px-3 rounded-lg"
        >
          <Feather name="message-square" size={18} color="#64748B" />
          <Text className="text-sm font-semibold text-slate-600">
            {post.commentsCount && post.commentsCount > 0
              ? t("news_feed.add_comment_with_count", { count: post.commentsCount })
              : t("news_feed.add_comment")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Reaction Picker Popover */}
      <ReactionPicker
        visible={showReactions}
        onClose={() => setShowReactions(false)}
        onSelectReaction={handleSelectReaction}
      />

      {/* Inline Comments Section */}
      {showCommentsModal && (
        <CommentSectionModal
          visible={showCommentsModal}
          postId={post._id}
          currentUserId={currentUserId}
          onClose={() => setShowCommentsModal(false)}
        />
      )}

      {/* Author Options Modal */}
      <Modal
        visible={showMenuModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowMenuModal(false)}
          className="flex-1 bg-black/30 justify-end"
        >
          <View className="bg-white rounded-t-3xl p-4">
            <TouchableOpacity
              onPress={() => {
                setShowMenuModal(false);
                onEditPost(post);
              }}
              className="flex-row items-center gap-3 py-3 border-b border-slate-100"
            >
              <Feather name="edit-2" size={18} color="#475569" />
              <Text className="text-base text-slate-800 font-semibold">
                {t("news_feed.edit_post")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDelete}
              className="flex-row items-center gap-3 py-3"
            >
              <Feather name="trash-2" size={18} color="#EF4444" />
              <Text className="text-base text-red-600 font-semibold">
                {t("news_feed.delete_post")}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Full-Screen Image Preview Modal */}
      <Modal
        visible={!!previewImageUrl}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <View className="flex-1 bg-black justify-center items-center relative">
          <TouchableOpacity
            onPress={() => setPreviewImageUrl(null)}
            className="absolute top-12 right-6 z-50 w-10 h-10 rounded-full bg-white/20 justify-center items-center"
          >
            <Feather name="x" size={24} color="#ffffff" />
          </TouchableOpacity>

          {previewImageUrl && (
            <Image
              source={{ uri: previewImageUrl }}
              className="w-full h-full"
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Post Reactions List Modal */}
      <PostReactionsModal
        visible={showPostReactionsModal}
        postId={post._id}
        onClose={() => setShowPostReactionsModal(false)}
      />
    </View>
  );
}
