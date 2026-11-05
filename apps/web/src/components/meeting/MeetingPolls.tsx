"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart2,
  Plus,
  Check,
  Lock,
  Trash2,
  Loader2,
  User,
  Eye,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useMeetingPolls } from "@/hooks/useMeetingPolls";
import {
  useVotePollMutation,
  useClosePollMutation,
  useDeletePollMutation,
} from "@/lib/redux/api/pollsApi";
import { usersApi } from "@/lib/redux/api/usersApi";
import { useLocalParticipant } from "@livekit/components-react";
import { PollResponse } from "@tobomeet/shared/types";
import PollDetailsModal from "./PollDetailsModal";

interface MeetingPollsProps {
  meetingCode: string;
  isHost?: boolean;
  onCreatePoll?: () => void;
}

export default function MeetingPolls({
  meetingCode,
  isHost = false,
  onCreatePoll,
}: MeetingPollsProps) {
  const t = useTranslations("meeting.poll");

  const { polls, isLoading } = useMeetingPolls(meetingCode);
  const { data: userProfile } = usersApi.useGetMeQuery();
  const { localParticipant } = useLocalParticipant();

  const currentUserId = userProfile?.supabaseId || localParticipant?.identity;

  const [votePoll, { isLoading: isVoting }] = useVotePollMutation();
  const [closePoll, { isLoading: isClosing }] = useClosePollMutation();
  const [deletePoll, { isLoading: isDeleting }] = useDeletePollMutation();

  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");

  // Local selection state for pending votes: pollId -> optionIds[]
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<
    Record<string, string[]>
  >({});
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const [closingPollId, setClosingPollId] = useState<string | null>(null);
  const [deletingPollId, setDeletingPollId] = useState<string | null>(null);

  // State modal xem chi tiết bình chọn
  const [selectedDetailPollId, setSelectedDetailPollId] = useState<string | null>(null);

  const filteredPolls = useMemo(() => {
    if (filter === "active") return polls.filter((p) => p.status === "active");
    if (filter === "closed") return polls.filter((p) => p.status === "closed");
    return polls;
  }, [polls, filter]);

  // Giữ dữ liệu modal chi tiết cập nhật real-time theo danh sách polls
  const currentDetailPoll = useMemo(() => {
    if (!selectedDetailPollId) return null;
    return polls.find((p) => p._id === selectedDetailPollId) || null;
  }, [polls, selectedDetailPollId]);

  // Handle option selection
  const handleSelectOption = (poll: PollResponse, optionId: string) => {
    if (poll.status === "closed") return;

    const currentSelection =
      selectedOptionsMap[poll._id] ??
      poll.options
        .filter((o) => o.voters.some((v) => v.userId === currentUserId))
        .map((o) => o.id);

    let nextSelection: string[];

    if (poll.allowMultiple) {
      if (currentSelection.includes(optionId)) {
        nextSelection = currentSelection.filter((id) => id !== optionId);
      } else {
        nextSelection = [...currentSelection, optionId];
      }
    } else {
      nextSelection = [optionId];
    }

    setSelectedOptionsMap((prev) => ({
      ...prev,
      [poll._id]: nextSelection,
    }));
  };

  // Submit confirmation vote
  const handleConfirmVote = async (poll: PollResponse) => {
    const selected =
      selectedOptionsMap[poll._id] ??
      poll.options
        .filter((o) => o.voters.some((v) => v.userId === currentUserId))
        .map((o) => o.id);

    if (selected.length === 0) {
      toast.error(t("select_at_least_one"));
      return;
    }

    try {
      setVotingPollId(poll._id);
      await votePoll({
        meetingCode,
        pollId: poll._id,
        optionIds: selected,
      }).unwrap();
      toast.success(t("vote_success"));
    } catch (err: any) {
      console.error("Vote failed:", err);
      toast.error(err?.data?.message || t("create_failed"));
    } finally {
      setVotingPollId(null);
    }
  };

  const handleClosePoll = async (pollId: string) => {
    try {
      setClosingPollId(pollId);
      await closePoll({ meetingCode, pollId }).unwrap();
      toast.success(t("close_poll_success"));
    } catch (err: any) {
      console.error("Close poll failed:", err);
      toast.error(err?.data?.message || t("create_failed"));
    } finally {
      setClosingPollId(null);
    }
  };

  // Hiện toast xác nhận ngắn gọn khi xóa
  const handleRequestDelete = (poll: PollResponse) => {
    toast(t("confirm_delete_title"), {
      description: t("confirm_delete_desc"),
      action: {
        label: t("delete_confirm_action"),
        onClick: () => executeDeletePoll(poll._id),
      },
      cancel: {
        label: t("cancel"),
        onClick: () => {},
      },
      duration: 6000,
    });
  };

  const executeDeletePoll = async (pollId: string) => {
    try {
      setDeletingPollId(pollId);
      await deletePoll({ meetingCode, pollId }).unwrap();
      toast.success(t("delete_poll_success"));
      if (selectedDetailPollId === pollId) {
        setSelectedDetailPollId(null);
      }
    } catch (err: any) {
      console.error("Delete poll failed:", err);
      toast.error(err?.data?.message || t("create_failed"));
    } finally {
      setDeletingPollId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400 gap-2">
        <Loader2 size={24} className="animate-spin text-blue-400" />
        <span className="text-xs">{t("loading_polls")}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 text-slate-200">
      {/* Top Action Bar */}
      <div className="shrink-0 pb-3 flex items-center justify-between gap-2 border-b border-[#232328]">
        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-[#161619] p-0.5 rounded-lg border border-[#232328]">
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              filter === "all"
                ? "bg-[#232328] text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t("all")} ({polls.length})
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              filter === "active"
                ? "bg-[#232328] text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t("active")} ({polls.filter((p) => p.status === "active").length})
          </button>
          <button
            onClick={() => setFilter("closed")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              filter === "closed"
                ? "bg-[#232328] text-slate-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t("closed")} ({polls.filter((p) => p.status === "closed").length})
          </button>
        </div>

        {/* Create button for host (No shadow) */}
        {isHost && (
          <button
            onClick={onCreatePoll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all cursor-pointer shrink-0"
            title={t("create_new")}
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t("create_new")}</span>
          </button>
        )}
      </div>

      {/* Polls List */}
      <div className="flex-1 overflow-y-auto pt-3 space-y-4 custom-scrollbar pr-1">
        {filteredPolls.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="p-3.5 rounded-2xl bg-[#1c1c20] border border-[#2e2e36] text-slate-500">
              <BarChart2 size={32} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-300">
                {t("no_polls_title")}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
                {t("no_polls_desc")}
              </p>
            </div>
            {isHost && (
              <button
                onClick={onCreatePoll}
                className="mt-2 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>{t("create_first_poll")}</span>
              </button>
            )}
          </div>
        ) : (
          filteredPolls.map((poll) => {
            const totalVotes = poll.options.reduce(
              (sum, opt) => sum + opt.voters.length,
              0,
            );

            const userVotedOptions = poll.options
              .filter((o) => o.voters.some((v) => v.userId === currentUserId))
              .map((o) => o.id);

            const hasUserVoted = userVotedOptions.length > 0;

            const selectedForThisPoll =
              selectedOptionsMap[poll._id] ?? userVotedOptions;

            const isSelectionChanged =
              selectedForThisPoll.length !== userVotedOptions.length ||
              selectedForThisPoll.some((id) => !userVotedOptions.includes(id));

            const canManagePoll =
              isHost || (currentUserId && poll.creatorId === currentUserId);

            const isActive = poll.status === "active";

            return (
              <div
                key={poll._id}
                className="bg-[#161619] border border-[#232328] rounded-2xl p-4 space-y-3.5 transition-all hover:border-[#2e2e35]"
              >
                {/* Header of Poll Card */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          isActive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-500/10 text-slate-400 border-slate-500/30"
                        }`}
                      >
                        {isActive ? t("active") : t("closed")}
                      </span>

                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#1f1f23] text-slate-400 border border-[#2e2e35]">
                        {poll.allowMultiple
                          ? t("multiple_choice")
                          : t("single_choice")}
                      </span>

                      {hasUserVoted && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <Check size={10} />
                          <span>{t("voted_badge")}</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-slate-100 leading-snug break-words pt-1">
                      {poll.question}
                    </h3>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-0.5">
                      <div className="flex items-center gap-1">
                        {poll.creatorAvatar ? (
                          <img
                            src={poll.creatorAvatar}
                            alt=""
                            className="w-3.5 h-3.5 rounded-full object-cover"
                          />
                        ) : (
                          <User size={12} className="text-slate-500" />
                        )}
                        <span className="truncate max-w-[120px]">
                          {poll.creatorName}
                        </span>
                      </div>
                      <span>•</span>
                      <span>
                        {t("votes_count", { count: totalVotes })}
                      </span>
                    </div>
                  </div>

                  {/* Actions: View Details + Host actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Nút Xem chi tiết */}
                    <button
                      onClick={() => setSelectedDetailPollId(poll._id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                      title={t("view_details")}
                    >
                      <Eye size={15} />
                    </button>

                    {canManagePoll && (
                      <>
                        {isActive && (
                          <button
                            onClick={() => handleClosePoll(poll._id)}
                            disabled={closingPollId === poll._id}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer disabled:opacity-50"
                            title={t("close_poll")}
                          >
                            {closingPollId === poll._id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Lock size={14} />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleRequestDelete(poll)}
                          disabled={deletingPollId === poll._id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                          title={t("delete_poll")}
                        >
                          {deletingPollId === poll._id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Options List with Live Progress Bars */}
                <div className="space-y-2 pt-1">
                  {poll.options.map((option) => {
                    const voteCount = option.voters.length;
                    const percentage =
                      totalVotes > 0
                        ? Math.round((voteCount / totalVotes) * 100)
                        : 0;

                    const isChecked = selectedForThisPoll.includes(option.id);
                    const isUserVotedThis = option.voters.some(
                      (v) => v.userId === currentUserId,
                    );

                    return (
                      <div
                        key={option.id}
                        onClick={() =>
                          isActive && handleSelectOption(poll, option.id)
                        }
                        className={`relative overflow-hidden rounded-xl border transition-all ${
                          isActive
                            ? "cursor-pointer hover:border-blue-500/50"
                            : "cursor-default"
                        } ${
                          isChecked
                            ? "border-blue-500/80 bg-blue-500/5 ring-1 ring-blue-500/40"
                            : "border-[#232328] bg-[#1a1a1e]/80"
                        }`}
                      >
                        {/* Live Animated Background Fill Bar */}
                        <div
                          className={`absolute inset-y-0 left-0 transition-all duration-500 ease-out ${
                            isUserVotedThis
                              ? "bg-blue-600/20"
                              : "bg-slate-700/20"
                          }`}
                          style={{ width: `${percentage}%` }}
                        />

                        {/* Option Content */}
                        <div className="relative px-3.5 py-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {/* Radio / Checkbox Indicator */}
                            <div
                              className={`w-4 h-4 rounded-${
                                poll.allowMultiple ? "md" : "full"
                              } border flex items-center justify-center shrink-0 transition-colors ${
                                isChecked
                                  ? "border-blue-500 bg-blue-500 text-white"
                                  : "border-slate-500 bg-transparent"
                              }`}
                            >
                              {isChecked && (
                                <Check
                                  size={11}
                                  strokeWidth={3}
                                  className="text-white"
                                />
                              )}
                            </div>

                            <span
                              className={`text-xs font-medium leading-relaxed break-words ${
                                isChecked ? "text-blue-100" : "text-slate-300"
                              }`}
                            >
                              {option.text}
                            </span>
                          </div>

                          {/* Vote count and percentage */}
                          <div className="flex items-center gap-1.5 shrink-0 text-right">
                            {isUserVotedThis && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-blue-400"
                                title={t("voted_badge")}
                              />
                            )}
                            <span className="text-[11px] font-semibold text-slate-300">
                              {percentage}%
                            </span>
                            <span className="text-[10px] text-slate-400">
                              ({voteCount})
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer of Poll Card: Details link & Confirm Vote button (No shadow) */}
                <div className="pt-1 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDetailPollId(poll._id)}
                    className="text-[11px] font-medium text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Eye size={12} />
                    <span>{t("view_details")}</span>
                  </button>

                  {isActive ? (
                    <button
                      type="button"
                      onClick={() => handleConfirmVote(poll)}
                      disabled={
                        selectedForThisPoll.length === 0 ||
                        (!isSelectionChanged && hasUserVoted) ||
                        votingPollId === poll._id
                      }
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-[#232328] disabled:text-slate-500 disabled:border-transparent text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                      {votingPollId === poll._id ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>{t("voting")}</span>
                        </>
                      ) : (
                        <>
                          <Check size={13} />
                          <span>
                            {hasUserVoted
                              ? t("update_vote")
                              : t("confirm_vote")}
                          </span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Lock size={12} className="text-slate-500" />
                      <span>{t("poll_closed_notice")}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Xem chi tiết bình chọn */}
      <PollDetailsModal
        isOpen={!!currentDetailPoll}
        onClose={() => setSelectedDetailPollId(null)}
        poll={currentDetailPoll}
      />
    </div>
  );
}
