"use client";

import { useState } from "react";
import {
  FileText,
  CheckCircle2,
  ListChecks,
  Copy,
  Check,
  Loader2,
  Clock,
  User,
  Calendar,
  Sparkles,
  Info,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { MeetingSessionResponse, MeetingSummaryData } from "@tobomeet/shared/types";

interface MeetingSummaryCardProps {
  session: MeetingSessionResponse;
  t: (key: string, values?: Record<string, any>) => string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function MeetingSummaryCard({
  session,
  t,
  onRefresh,
  isRefreshing = false,
}: MeetingSummaryCardProps) {
  const [copied, setCopied] = useState(false);

  const summary = session.summary as MeetingSummaryData | undefined;
  const status = session.summaryStatus || (summary ? "completed" : "none");
  const isOngoing = session.status === "ongoing";

  const handleCopy = async () => {
    if (!summary) return;

    const sections: string[] = [];

    if (summary.title) {
      sections.push(`# ${summary.title}`);
    }

    if (summary.overview) {
      sections.push(`## ${t("session_summary_overview")}\n${summary.overview}`);
    }

    if (summary.keyPoints && summary.keyPoints.length > 0) {
      sections.push(
        `## ${t("session_summary_key_points")}\n` +
          summary.keyPoints.map((kp) => `- ${kp}`).join("\n"),
      );
    }

    if (summary.actionItems && summary.actionItems.length > 0) {
      sections.push(
        `## ${t("session_summary_action_items")}\n` +
          summary.actionItems
            .map((item) => {
              const meta: string[] = [];
              if (item.assignee) meta.push(`@${item.assignee}`);
              if (item.dueDate) meta.push(`[${item.dueDate}]`);
              const metaStr = meta.length > 0 ? ` (${meta.join(", ")})` : "";
              return `- [ ] ${item.task}${metaStr}`;
            })
            .join("\n"),
      );
    }

    try {
      await navigator.clipboard.writeText(sections.join("\n\n"));
      setCopied(true);
      toast.success(t("session_summary_copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Không thể sao chép tóm tắt");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {t("session_summary_title")}
              </h3>
              {status === "completed" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <CheckCircle2 size={12} />
                  <span>{t("session_summary_completed_badge")}</span>
                </span>
              )}
              {status === "processing" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                  <Loader2 size={12} className="animate-spin" />
                  <span>{t("session_summary_processing")}</span>
                </span>
              )}
            </div>
            {summary?.title && (
              <p className="text-xs text-slate-500 font-medium mt-0.5 truncate max-w-xl">
                {summary.title}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {summary && (
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
              title={t("session_summary_copy")}
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              <span>{copied ? t("session_summary_copied") : t("session_summary_copy")}</span>
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              title="Làm mới tóm tắt"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin text-brand-600" : ""} />
            </button>
          )}
        </div>
      </div>

      {/* Body Content */}
      <div className="p-6">
        {/* Case 1: Session is still ongoing */}
        {isOngoing && !summary && (
          <div className="py-6 px-4 bg-slate-50/60 rounded-xl border border-dashed border-slate-200 flex items-center gap-3">
            <Clock size={18} className="text-slate-400 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-slate-700">
                {t("session_summary_ongoing")}:
              </span>{" "}
              <span className="text-slate-500">
                {t("session_summary_ongoing_desc")}
              </span>
            </div>
          </div>
        )}

        {/* Case 2: Generating summary in progress */}
        {!isOngoing && status === "processing" && (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <Loader2 size={24} className="animate-spin text-indigo-600 mb-2.5" />
            <h4 className="text-xs font-bold text-slate-800">
              {t("session_summary_processing")}
            </h4>
            <p className="text-[11px] text-slate-500 mt-1 max-w-md">
              {t("session_summary_processing_desc")}
            </p>
          </div>
        )}

        {/* Case 3: Summary skipped (too short or few spoken words) */}
        {!isOngoing && status === "skipped" && (
          <div className="py-6 px-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-3">
            <Info size={17} className="text-slate-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <h4 className="font-semibold text-slate-700">
                {t("session_summary_skipped")}
              </h4>
              <p className="text-slate-500 mt-0.5">
                {session.summaryReason || t("session_summary_skipped_desc")}
              </p>
            </div>
          </div>
        )}

        {/* Case 4: Summary completed and available */}
        {summary && (
          <div className="space-y-5">
            {/* 1. Overview */}
            {summary.overview && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <FileText size={14} className="text-slate-400" />
                  <span>{t("session_summary_overview")}</span>
                </h4>
                <div className="text-xs leading-relaxed text-slate-700 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
                  {summary.overview}
                </div>
              </div>
            )}

            {/* 2. Key Points */}
            {summary.keyPoints && summary.keyPoints.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <ListChecks size={14} className="text-slate-400" />
                  <span>{t("session_summary_key_points")}</span>
                </h4>
                <ul className="space-y-2 text-xs text-slate-700">
                  {summary.keyPoints.map((point, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 p-2 rounded-lg bg-white border border-slate-100 hover:border-slate-200 transition-colors"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                      <span className="leading-snug">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 3. Action Items */}
            {summary.actionItems && summary.actionItems.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span>{t("session_summary_action_items")}</span>
                  <span className="text-[11px] font-semibold text-slate-400 font-mono">
                    ({summary.actionItems.length})
                  </span>
                </h4>

                <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 bg-white">
                  {summary.actionItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className="w-4 h-4 mt-0.5 rounded border border-slate-300 text-transparent flex items-center justify-center shrink-0">
                          {item.status === "completed" && (
                            <Check size={12} className="text-emerald-600 stroke-[3]" />
                          )}
                        </span>
                        <p className="text-xs font-medium text-slate-800 leading-snug break-words">
                          {item.task}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {item.assignee ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            <User size={11} className="text-slate-400" />
                            <span>{item.assignee}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            {t("session_summary_unassigned")}
                          </span>
                        )}

                        {item.dueDate && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 text-slate-600 border border-slate-200 font-mono">
                            <Calendar size={11} className="text-slate-400" />
                            <span>{item.dueDate}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Case 5: Ended session without summary and not skipped/processing */}
        {!isOngoing && !summary && status !== "processing" && status !== "skipped" && (
          <div className="py-6 text-center text-slate-400">
            <FileText size={28} className="mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-medium">
              {t("session_summary_empty")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

