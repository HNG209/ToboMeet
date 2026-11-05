import React, { useState, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useLocalParticipant } from "@livekit/react-native";
import { toast } from "../../lib/toast";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import {
  useVotePollMutation,
  useClosePollMutation,
  useDeletePollMutation,
} from "../../lib/redux/api/pollsApi";
import { useMeetingPolls } from "../../hooks/useMeetingPolls";
import { PollResponse } from "@tobomeet/shared/types";
import MobileCreatePollModal from "./MobileCreatePollModal";
import MobilePollDetailsModal from "./MobilePollDetailsModal";

interface MobilePollsModalProps {
  visible: boolean;
  onClose: () => void;
  meetingCode: string;
  isHost?: boolean;
}

export default function MobilePollsModal({
  visible,
  onClose,
  meetingCode,
  isHost = false,
}: MobilePollsModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { localParticipant } = useLocalParticipant();
  const { data: userProfile } = useGetMeQuery();

  const currentUserId = userProfile?.supabaseId || localParticipant?.identity;

  const { polls, isLoading, refetch, isFetching } = useMeetingPolls(meetingCode);

  const [votePoll, { isLoading: isVoting }] = useVotePollMutation();
  const [closePoll, { isLoading: isClosing }] = useClosePollMutation();
  const [deletePoll, { isLoading: isDeleting }] = useDeletePollMutation();

  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDetailPoll, setSelectedDetailPoll] = useState<PollResponse | null>(null);

  // Lưu lựa chọn chưa submit: pollId -> optionIds[]
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<Record<string, string[]>>({});
  const [votingPollId, setVotingPollId] = useState<string | null>(null);

  const filteredPolls = useMemo(() => {
    if (filter === "active") return polls.filter((p) => p.status === "active");
    if (filter === "closed") return polls.filter((p) => p.status === "closed");
    return polls;
  }, [polls, filter]);

  // Lấy các options mà user đã vote trong poll
  const getUserVotedOptionIds = (poll: PollResponse): string[] => {
    if (!currentUserId) return [];
    return poll.options
      .filter((opt) => opt.voters?.some((v) => v.userId === currentUserId))
      .map((opt) => opt.id);
  };

  const handleToggleOption = (poll: PollResponse, optionId: string) => {
    if (poll.status === "closed") return;

    setSelectedOptionsMap((prev) => {
      const currentSelected =
        prev[poll._id] ?? getUserVotedOptionIds(poll);

      if (poll.allowMultiple) {
        const next = currentSelected.includes(optionId)
          ? currentSelected.filter((id) => id !== optionId)
          : [...currentSelected, optionId];
        return { ...prev, [poll._id]: next };
      } else {
        const next = currentSelected.includes(optionId) ? [] : [optionId];
        return { ...prev, [poll._id]: next };
      }
    });
  };

  const handleConfirmVote = async (poll: PollResponse) => {
    const selected = selectedOptionsMap[poll._id] ?? getUserVotedOptionIds(poll);
    if (!selected || selected.length === 0) {
      toast.error(
        t("meeting.poll.select_at_least_one", {
          defaultValue: "Vui lòng chọn ít nhất 1 phương án trước khi xác nhận",
        }),
      );
      return;
    }

    try {
      setVotingPollId(poll._id);
      await votePoll({
        meetingCode,
        pollId: poll._id,
        optionIds: selected,
      }).unwrap();

      toast.success(
        t("meeting.poll.vote_success", {
          defaultValue: "Đã ghi nhận bình chọn của bạn!",
        }),
      );
    } catch (err: any) {
      console.error("Vote poll failed:", err);
      toast.error(
        err?.data?.message ||
          t("meeting.poll.create_failed", {
            defaultValue: "Thao tác thất bại, vui lòng thử lại sau",
          }),
      );
    } finally {
      setVotingPollId(null);
    }
  };

  const handleClosePoll = (poll: PollResponse) => {
    Alert.alert(
      t("meeting.poll.close_poll", { defaultValue: "Đóng bình chọn" }),
      t("meeting.poll.poll_closed_notice", {
        defaultValue: "Cuộc bình chọn này sẽ dừng nhận phiếu bầu.",
      }),
      [
        { text: t("meeting.poll.cancel", { defaultValue: "Hủy" }), style: "cancel" },
        {
          text: t("meeting.poll.close_poll", { defaultValue: "Đóng" }),
          style: "destructive",
          onPress: async () => {
            try {
              await closePoll({ meetingCode, pollId: poll._id }).unwrap();
              toast.success(
                t("meeting.poll.close_poll_success", {
                  defaultValue: "Đã đóng cuộc bình chọn",
                }),
              );
            } catch (err: any) {
              toast.error(err?.data?.message || "Thao tác thất bại");
            }
          },
        },
      ],
    );
  };

  const handleDeletePoll = (poll: PollResponse) => {
    Alert.alert(
      t("meeting.poll.confirm_delete_title", {
        defaultValue: "Xác nhận xóa cuộc bình chọn?",
      }),
      t("meeting.poll.confirm_delete_desc", {
        defaultValue: "Thao tác này sẽ xóa vĩnh viễn cuộc bình chọn khỏi phòng họp.",
      }),
      [
        { text: t("meeting.poll.cancel", { defaultValue: "Hủy" }), style: "cancel" },
        {
          text: t("meeting.poll.delete_confirm_action", { defaultValue: "Xóa" }),
          style: "destructive",
          onPress: async () => {
            try {
              await deletePoll({ meetingCode, pollId: poll._id }).unwrap();
              toast.success(
                t("meeting.poll.delete_poll_success", {
                  defaultValue: "Đã xóa cuộc bình chọn",
                }),
              );
            } catch (err: any) {
              toast.error(err?.data?.message || "Thao tác thất bại");
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View
          className="flex-1 justify-end bg-black/70"
          style={{ paddingTop: Math.max(insets.top, 20) }}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={onClose}
            className="flex-1"
          />
          <View
            style={{
              height: "85%",
              paddingBottom: Math.max(insets.bottom, 16),
            }}
            className="bg-[#121215] rounded-t-3xl border-t border-[#232328] overflow-hidden flex-col"
          >
            {/* Drag Handle */}
            <View className="w-10 h-1 bg-[#3a3a42] rounded-full self-center mt-3 mb-1" />

            {/* Header */}
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-[#232328]">
              <View className="flex-row items-center gap-2.5">
                <View className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <Feather name="bar-chart-2" size={18} color="#60a5fa" />
                </View>
                <View>
                  <Text className="text-white text-base font-bold">
                    {t("meeting.poll.title", { defaultValue: "Bình chọn" })}
                  </Text>
                  <Text className="text-slate-400 text-xs mt-0.5">
                    {t("meeting.poll.votes_count", {
                      count: polls.length,
                      defaultValue: `${polls.length} bình chọn`,
                    })}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-2">
                {isHost && (
                  <TouchableOpacity
                    onPress={() => setShowCreateModal(true)}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 active:bg-blue-700"
                  >
                    <Feather name="plus" size={15} color="#ffffff" />
                    <Text className="text-white text-xs font-bold">
                      {t("meeting.poll.create_new", { defaultValue: "Tạo mới" })}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={onClose}
                  className="p-2 rounded-lg bg-[#232328] active:bg-[#2e2e34]"
                >
                  <Feather name="x" size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Filter Tabs */}
            <View className="flex-row items-center px-5 py-2.5 bg-[#161619] border-b border-[#232328] gap-2">
              <TouchableOpacity
                onPress={() => setFilter("all")}
                className={`px-3 py-1.5 rounded-xl ${
                  filter === "all" ? "bg-blue-600" : "bg-[#232328]"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    filter === "all" ? "text-white" : "text-slate-300"
                  }`}
                >
                  {t("meeting.poll.all", { defaultValue: "Tất cả" })} ({polls.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilter("active")}
                className={`px-3 py-1.5 rounded-xl ${
                  filter === "active" ? "bg-blue-600" : "bg-[#232328]"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    filter === "active" ? "text-white" : "text-slate-300"
                  }`}
                >
                  {t("meeting.poll.active", { defaultValue: "Đang mở" })} (
                  {polls.filter((p) => p.status === "active").length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilter("closed")}
                className={`px-3 py-1.5 rounded-xl ${
                  filter === "closed" ? "bg-blue-600" : "bg-[#232328]"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    filter === "closed" ? "text-white" : "text-slate-300"
                  }`}
                >
                  {t("meeting.poll.closed", { defaultValue: "Đã đóng" })} (
                  {polls.filter((p) => p.status === "closed").length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => refetch()}
                className="ml-auto p-1.5 rounded-lg active:bg-[#232328]"
              >
                <Feather
                  name="refresh-cw"
                  size={14}
                  color="#94a3b8"
                  className={isFetching ? "animate-spin" : ""}
                />
              </TouchableOpacity>
            </View>

            {/* List Polls */}
            <ScrollView
              className="flex-1 p-4"
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {isLoading ? (
                <View className="py-12 items-center justify-center">
                  <ActivityIndicator size="large" color="#60a5fa" />
                  <Text className="text-slate-400 text-xs mt-3">
                    {t("meeting.poll.loading_polls", {
                      defaultValue: "Đang tải danh sách bình chọn...",
                    })}
                  </Text>
                </View>
              ) : filteredPolls.length === 0 ? (
                <View className="py-16 items-center justify-center">
                  <View className="w-16 h-16 rounded-full bg-[#1e1e24] items-center justify-center mb-3">
                    <Feather name="bar-chart-2" size={28} color="#64748b" />
                  </View>
                  <Text className="text-slate-200 text-sm font-bold mb-1">
                    {t("meeting.poll.no_polls_title", { defaultValue: "Chưa có cuộc bình chọn nào" })}
                  </Text>
                  <Text className="text-slate-400 text-xs text-center max-w-[280px] mb-5">
                    {t("meeting.poll.no_polls_desc", {
                      defaultValue:
                        "Tất cả các cuộc bình chọn trong phiên họp sẽ hiển thị tại đây để bạn tham gia.",
                    })}
                  </Text>
                  {isHost && (
                    <TouchableOpacity
                      onPress={() => setShowCreateModal(true)}
                      className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 active:bg-blue-700"
                    >
                      <Feather name="plus" size={16} color="#ffffff" />
                      <Text className="text-white text-xs font-bold">
                        {t("meeting.poll.create_first_poll", {
                          defaultValue: "Tạo cuộc bình chọn đầu tiên",
                        })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View className="gap-4">
                  {filteredPolls.map((poll) => {
                    const totalVotes = poll.options.reduce(
                      (sum, opt) => sum + (opt.voters?.length || 0),
                      0,
                    );
                    const userVotedIds = getUserVotedOptionIds(poll);
                    const hasUserVoted = userVotedIds.length > 0;
                    const selectedIds =
                      selectedOptionsMap[poll._id] ?? userVotedIds;
                    const isSelectionChanged =
                      JSON.stringify([...selectedIds].sort()) !==
                      JSON.stringify([...userVotedIds].sort());

                    return (
                      <View
                        key={poll._id}
                        className="p-4 rounded-2xl bg-[#18181c] border border-[#232328]"
                      >
                        {/* Header của poll */}
                        <View className="flex-row items-start justify-between gap-2 mb-2">
                          <View className="flex-row items-center gap-1.5 flex-wrap flex-1">
                            <View className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                              <Text className="text-blue-400 text-[10px] font-semibold font-mono">
                                {poll.allowMultiple
                                  ? t("meeting.poll.multiple_choice", { defaultValue: "Chọn nhiều" })
                                  : t("meeting.poll.single_choice", { defaultValue: "Chọn 1" })}
                              </Text>
                            </View>

                            <View
                              className={`flex-row items-center gap-1 px-2 py-0.5 rounded-md border ${
                                poll.status === "active"
                                  ? "bg-emerald-500/10 border-emerald-500/20"
                                  : "bg-slate-500/10 border-slate-500/20"
                              }`}
                            >
                              <View
                                className={`w-1.5 h-1.5 rounded-full ${
                                  poll.status === "active"
                                    ? "bg-emerald-400"
                                    : "bg-slate-400"
                                }`}
                              />
                              <Text
                                className={`text-[10px] font-semibold ${
                                  poll.status === "active"
                                    ? "text-emerald-400"
                                    : "text-slate-400"
                                }`}
                              >
                                {poll.status === "active"
                                  ? t("meeting.poll.active", { defaultValue: "Đang mở" })
                                  : t("meeting.poll.closed", { defaultValue: "Đã đóng" })}
                              </Text>
                            </View>

                            {hasUserVoted && (
                              <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20">
                                <Feather name="check" size={10} color="#c084fc" />
                                <Text className="text-purple-300 text-[10px] font-semibold">
                                  {t("meeting.poll.voted_badge", { defaultValue: "Đã bình chọn" })}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Host actions */}
                          {isHost && (
                            <View className="flex-row items-center gap-1">
                              {poll.status === "active" && (
                                <TouchableOpacity
                                  onPress={() => handleClosePoll(poll)}
                                  className="p-1.5 rounded-lg active:bg-amber-500/10"

                                >
                                  <Feather name="lock" size={13} color="#f59e0b" />
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                onPress={() => handleDeletePoll(poll)}
                                className="p-1.5 rounded-lg active:bg-red-500/10"

                              >
                                <Feather name="trash-2" size={13} color="#ef4444" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>

                        {/* Câu hỏi */}
                        <Text className="text-white text-sm font-bold leading-5 mb-3">
                          {poll.question}
                        </Text>

                        {/* Danh sách các Options */}
                        <View className="gap-2 mb-3">
                          {poll.options.map((opt) => {
                            const isSelected = selectedIds.includes(opt.id);
                            const optVoteCount = opt.voters?.length || 0;
                            const percentage =
                              totalVotes > 0
                                ? Math.round((optVoteCount / totalVotes) * 100)
                                : 0;
                            const isUserVotedThis = userVotedIds.includes(opt.id);

                            return (
                              <TouchableOpacity
                                key={opt.id}
                                disabled={poll.status === "closed"}
                                onPress={() => handleToggleOption(poll, opt.id)}
                                activeOpacity={0.7}
                                className={`p-3 rounded-xl border relative overflow-hidden ${
                                  isSelected
                                    ? "bg-blue-600/10 border-blue-500/50"
                                    : "bg-[#1f1f24] border-[#2b2b32]"
                                }`}
                              >
                                {/* Thanh phần trăm nền mờ */}
                                <View
                                  className="absolute top-0 bottom-0 left-0 bg-blue-500/15"
                                  style={{ width: `${percentage}%` }}
                                />

                                <View className="flex-row items-center justify-between z-10">
                                  <View className="flex-row items-center gap-2.5 flex-1 pr-2">
                                    <View
                                      className={`w-4 h-4 rounded-${
                                        poll.allowMultiple ? "md" : "full"
                                      } border items-center justify-center ${
                                        isSelected
                                          ? "bg-blue-600 border-blue-600"
                                          : "border-slate-500 bg-transparent"
                                      }`}
                                    >
                                      {isSelected && (
                                        <Feather
                                          name="check"
                                          size={10}
                                          color="#ffffff"
                                        />
                                      )}
                                    </View>
                                    <Text
                                      className={`text-xs flex-1 ${
                                        isSelected
                                          ? "text-white font-semibold"
                                          : "text-slate-200"
                                      }`}
                                    >
                                      {opt.text}
                                    </Text>
                                  </View>

                                  <View className="flex-row items-center gap-1.5">
                                    {isUserVotedThis && (
                                      <View className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                    )}
                                    <Text className="text-blue-400 font-mono text-xs font-bold">
                                      {percentage}%
                                    </Text>
                                    <Text className="text-slate-500 font-mono text-[11px]">
                                      ({optVoteCount})
                                    </Text>
                                  </View>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* Nút xác nhận bình chọn (chỉ hiện khi active và có chọn/thay đổi) */}
                        {poll.status === "active" && isSelectionChanged && (
                          <TouchableOpacity
                            onPress={() => handleConfirmVote(poll)}
                            disabled={votingPollId === poll._id}
                            className="w-full py-2.5 mb-3 rounded-xl bg-blue-600 active:bg-blue-700 flex-row items-center justify-center gap-2"
                          >
                            {votingPollId === poll._id ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <Feather name="check-circle" size={15} color="#ffffff" />
                            )}
                            <Text className="text-white text-xs font-bold">
                              {hasUserVoted
                                ? t("meeting.poll.update_vote", { defaultValue: "Cập nhật bình chọn" })
                                : t("meeting.poll.confirm_vote", { defaultValue: "Xác nhận bình chọn" })}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Footer card */}
                        <View className="flex-row items-center justify-between pt-2.5 border-t border-[#232328]">
                          <View className="flex-row items-center gap-1.5 flex-1 pr-2">
                            <Text className="text-[11px] text-slate-400" numberOfLines={1}>
                              {t("meeting.poll.created_by", { defaultValue: "Tạo bởi" })}:{" "}
                              <Text className="text-slate-200 font-medium">{poll.creatorName}</Text>
                            </Text>
                          </View>

                          <TouchableOpacity
                            onPress={() => setSelectedDetailPoll(poll)}
                            className="flex-row items-center gap-1 px-2.5 py-1 rounded-lg bg-[#24242b] active:bg-[#2d2d36]"
                          >
                            <Feather name="eye" size={12} color="#60a5fa" />
                            <Text className="text-blue-400 text-xs font-semibold">
                              {t("meeting.poll.view_details", { defaultValue: "Xem chi tiết" })}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal tạo cuộc bình chọn */}
      <MobileCreatePollModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        meetingCode={meetingCode}
      />

      {/* Modal xem chi tiết */}
      <MobilePollDetailsModal
        visible={!!selectedDetailPoll}
        onClose={() => setSelectedDetailPoll(null)}
        poll={selectedDetailPoll}
      />
    </>
  );
}
