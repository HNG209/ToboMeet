"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  BarChart2,
  User,
  Clock,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { PollResponse } from "@tobomeet/shared/types";

interface PollDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  poll: PollResponse | null;
  theme?: "dark" | "light";
}

export default function PollDetailsModal({
  isOpen,
  onClose,
  poll,
  theme = "dark",
}: PollDetailsModalProps) {
  const t = useTranslations("meeting.poll");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || !poll) return null;

  const isLight = theme === "light";

  const totalVotes = poll.options.reduce(
    (sum, opt) => sum + opt.voters.length,
    0,
  );

  const formattedDate = poll.createdAt
    ? new Date(poll.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      })
    : "";

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 ${
          isLight
            ? "bg-white border border-slate-200 text-slate-900"
            : "bg-[#161619] border border-[#232328] text-slate-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isLight
              ? "bg-white border-slate-200"
              : "bg-[#161619] border-[#232328]"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <BarChart2
              size={20}
              className={`${isLight ? "text-blue-600" : "text-blue-500"} shrink-0`}
            />
            <div>
              <h2
                className={`text-base font-bold ${
                  isLight ? "text-slate-900" : "text-slate-100"
                }`}
              >
                {t("poll_details_title")}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className={isLight ? "text-slate-600 font-medium" : ""}>
                  {poll.allowMultiple
                    ? t("multiple_choice")
                    : t("single_choice")}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLight
                ? "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#232328]"
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Question & Meta */}
          <div
            className={`p-4 rounded-xl border space-y-2.5 ${
              isLight
                ? "bg-slate-50 border-slate-200"
                : "bg-[#1f1f23] border-[#2e2e35]"
            }`}
          >
            <h3
              className={`text-sm font-bold leading-relaxed break-words ${
                isLight ? "text-slate-900" : "text-slate-100"
              }`}
            >
              {poll.question}
            </h3>

            <div
              className={`flex items-center justify-between gap-3 text-xs pt-1 border-t flex-wrap ${
                isLight
                  ? "border-slate-200 text-slate-500"
                  : "border-[#2a2a32] text-slate-400"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {poll.creatorAvatar ? (
                  <img
                    src={poll.creatorAvatar}
                    alt=""
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <User size={13} className="text-slate-400" />
                )}
                <span>
                  {t("created_by")}:{" "}
                  <strong
                    className={
                      isLight
                        ? "text-slate-800 font-semibold"
                        : "text-slate-300 font-medium"
                    }
                  >
                    {poll.creatorName}
                  </strong>
                </span>
              </div>

              {formattedDate && (
                <div className="flex items-center gap-1">
                  <Clock size={12} />
                  <span>{formattedDate}</span>
                </div>
              )}
            </div>
          </div>

          {/* Options & Voters Breakdown */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isLight ? "text-slate-600" : "text-slate-300"
                }`}
              >
                {t("results_breakdown")}
              </h4>
              <span
                className={`text-xs font-medium ${
                  isLight ? "text-slate-600" : "text-slate-400"
                }`}
              >
                {t("votes_count", { count: totalVotes })}
              </span>
            </div>

            <div className="space-y-4">
              {poll.options.map((option, idx) => {
                const voteCount = option.voters.length;
                const percentage =
                  totalVotes > 0
                    ? Math.round((voteCount / totalVotes) * 100)
                    : 0;

                return (
                  <div
                    key={option.id}
                    className={`p-4 rounded-xl border space-y-3 ${
                      isLight
                        ? "bg-slate-50/70 border-slate-200"
                        : "bg-[#1b1b1f] border-[#2a2a32]"
                    }`}
                  >
                    {/* Option Header */}
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={`text-sm font-semibold leading-snug break-words ${
                            isLight ? "text-slate-800" : "text-slate-200"
                          }`}
                        >
                          {idx + 1}. {option.text}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 text-right">
                          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                            {percentage}%
                          </span>
                          <span
                            className={`text-xs ${
                              isLight ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            ({voteCount})
                          </span>
                        </div>
                      </div>

                      {/* Percentage Bar */}
                      <div
                        className={`w-full h-2 rounded-full overflow-hidden ${
                          isLight ? "bg-slate-200" : "bg-[#282830]"
                        }`}
                      >
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Voters List */}
                    <div
                      className={`pt-2 border-t ${
                        isLight ? "border-slate-200/80" : "border-[#26262e]"
                      }`}
                    >
                      <div
                        className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${
                          isLight ? "text-slate-500" : "text-slate-400"
                        }`}
                      >
                        {t("voters_list")} ({voteCount}):
                      </div>

                      {option.voters.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">
                          {t("no_voters_for_option")}
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                          {option.voters.map((voter) => (
                            <div
                              key={voter.userId}
                              className={`flex items-center justify-between gap-2 p-1.5 rounded-lg text-xs ${
                                isLight
                                  ? "bg-white border border-slate-200 text-slate-800 shadow-2xs"
                                  : "bg-[#222228] text-slate-200"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {voter.avatar ? (
                                  <img
                                    src={voter.avatar}
                                    alt=""
                                    className="w-5 h-5 rounded-full object-cover shrink-0"
                                  />
                                ) : (
                                  <div
                                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                      isLight
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-blue-600/30 text-blue-300"
                                    }`}
                                  >
                                    {(voter.name || "U")
                                      .charAt(0)
                                      .toUpperCase()}
                                  </div>
                                )}
                                <span className="font-medium truncate">
                                  {voter.name}
                                </span>
                              </div>

                              {voter.votedAt && (
                                <span
                                  className={`text-[10px] shrink-0 font-mono ${
                                    isLight ? "text-slate-400" : "text-slate-400"
                                  }`}
                                >
                                  {new Date(voter.votedAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`px-6 py-3.5 border-t flex justify-end shrink-0 ${
            isLight
              ? "border-slate-200 bg-white"
              : "border-[#232328] bg-[#161619]"
          }`}
        >
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              isLight
                ? "bg-slate-100 hover:bg-slate-200 text-slate-800"
                : "bg-[#232328] hover:bg-[#2e2e34] text-slate-200"
            }`}
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
