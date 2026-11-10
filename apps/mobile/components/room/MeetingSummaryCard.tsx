import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  MeetingSessionResponse,
  MeetingSummaryData,
  MeetingActionItem,
} from "@tobomeet/shared/types";
import { toast } from "../../lib/toast";

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
  const summary = session.summary as MeetingSummaryData | undefined;
  const status = session.summaryStatus || (summary ? "completed" : "none");
  const isOngoing = session.status === "ongoing";

  const handleShareOrCopy = async () => {
    if (!summary) return;

    const sections: string[] = [];

    if (summary.title) {
      sections.push(`# ${summary.title}`);
    }

    if (summary.overview) {
      sections.push(`## ${t("room.session_summary_overview")}\n${summary.overview}`);
    }

    if (summary.keyPoints && summary.keyPoints.length > 0) {
      sections.push(
        `## ${t("room.session_summary_key_points")}\n` +
          summary.keyPoints.map((kp) => `- ${kp}`).join("\n")
      );
    }

    if (summary.actionItems && summary.actionItems.length > 0) {
      sections.push(
        `## ${t("room.session_summary_action_items")}\n` +
          summary.actionItems
            .map((item) => {
              const meta: string[] = [];
              if (item.assignee) meta.push(`@${item.assignee}`);
              if (item.dueDate) meta.push(`[${item.dueDate}]`);
              const metaStr = meta.length > 0 ? ` (${meta.join(", ")})` : "";
              return `- [ ] ${item.task}${metaStr}`;
            })
            .join("\n")
      );
    }

    try {
      await Share.share({
        message: sections.join("\n\n"),
        title: summary.title || t("room.session_summary_title"),
      });
    } catch {
      toast.error("Không thể chia sẻ tóm tắt");
    }
  };

  return (
    <View className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-4">
      {/* Header bar */}
      <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          <View className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 items-center justify-center">
            <Feather name="zap" size={14} color="#4F46E5" />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5 flex-wrap">
              <Text className="text-xs font-bold text-slate-900">
                {t("room.session_summary_title")}
              </Text>
              {status === "completed" && (
                <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/60">
                  <Feather name="check" size={10} color="#059669" />
                  <Text className="text-[10px] font-medium text-emerald-700">
                    {t("room.session_summary_completed_badge")}
                  </Text>
                </View>
              )}
              {status === "processing" && (
                <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/60">
                  <ActivityIndicator size={10} color="#D97706" />
                  <Text className="text-[10px] font-medium text-amber-700">
                    {t("room.session_summary_processing")}
                  </Text>
                </View>
              )}
            </View>
            {summary?.title ? (
              <Text className="text-[11px] text-slate-500 font-medium mt-0.5" numberOfLines={1}>
                {summary.title}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-1.5">
          {summary && (
            <TouchableOpacity
              onPress={handleShareOrCopy}
              className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 active:bg-slate-100"
              activeOpacity={0.7}
            >
              <Feather name="share-2" size={13} color="#475569" />
            </TouchableOpacity>
          )}

          {onRefresh && (
            <TouchableOpacity
              onPress={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg active:bg-slate-100"
              activeOpacity={0.7}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#0052FF" />
              ) : (
                <Feather name="refresh-cw" size={13} color="#94A3B8" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body Content */}
      <View className="p-4">
        {/* Case 1: Session is still ongoing */}
        {isOngoing && !summary && (
          <View className="py-4 px-3 bg-slate-50/70 rounded-xl border border-dashed border-slate-200 flex-row items-center gap-2.5">
            <Feather name="clock" size={15} color="#94A3B8" />
            <Text className="text-xs text-slate-600 flex-1 leading-relaxed">
              <Text className="font-semibold text-slate-700">
                {t("room.session_summary_ongoing")}:
              </Text>{" "}
              {t("room.session_summary_ongoing_desc")}
            </Text>
          </View>
        )}

        {/* Case 2: Generating summary in progress */}
        {!isOngoing && status === "processing" && (
          <View className="py-6 items-center justify-center">
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text className="text-xs font-bold text-slate-800 mt-2">
              {t("room.session_summary_processing")}
            </Text>
            <Text className="text-[11px] text-slate-500 mt-0.5 text-center px-4">
              {t("room.session_summary_processing_desc")}
            </Text>
          </View>
        )}

        {/* Case 3: Summary skipped (too short or few spoken words) */}
        {!isOngoing && status === "skipped" && (
          <View className="py-3 px-3.5 bg-slate-50 rounded-xl border border-slate-200 flex-row items-start gap-2.5">
            <Feather name="info" size={15} color="#94A3B8" style={{ marginTop: 2 }} />
            <View className="flex-1">
              <Text className="text-xs font-semibold text-slate-700">
                {t("room.session_summary_skipped")}
              </Text>
              <Text className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                {session.summaryReason || t("room.session_summary_skipped_desc")}
              </Text>
            </View>
          </View>
        )}

        {/* Case 4: Summary completed and available */}
        {summary && (
          <View className="space-y-4">
            {/* 1. Overview */}
            {summary.overview ? (
              <View>
                <View className="flex-row items-center gap-1.5 mb-1.5">
                  <Feather name="file-text" size={12} color="#64748B" />
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {t("room.session_summary_overview")}
                  </Text>
                </View>
                <View className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
                  <Text className="text-xs leading-relaxed text-slate-700">
                    {summary.overview}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* 2. Key Points */}
            {summary.keyPoints && summary.keyPoints.length > 0 ? (
              <View className="mt-3">
                <View className="flex-row items-center gap-1.5 mb-1.5">
                  <Feather name="list" size={12} color="#64748B" />
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {t("room.session_summary_key_points")}
                  </Text>
                </View>
                <View className="space-y-1.5">
                  {summary.keyPoints.map((point, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-start gap-2 p-2 rounded-lg bg-white border border-slate-100"
                    >
                      <View className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                      <Text className="text-xs text-slate-700 flex-1 leading-snug">
                        {point}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* 3. Action Items */}
            {summary.actionItems && summary.actionItems.length > 0 ? (
              <View className="mt-3">
                <View className="flex-row items-center gap-1.5 mb-1.5">
                  <Feather name="check-circle" size={12} color="#059669" />
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {t("room.session_summary_action_items")}
                  </Text>
                  <Text className="text-[10px] font-semibold text-slate-400 font-mono">
                    ({summary.actionItems.length})
                  </Text>
                </View>

                <View className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 bg-white">
                  {summary.actionItems.map((item: MeetingActionItem, idx: number) => (
                    <View
                      key={idx}
                      className="p-3 flex-col gap-1.5"
                    >
                      <View className="flex-row items-start gap-2">
                        <View className="w-3.5 h-3.5 mt-0.5 rounded border border-slate-300 items-center justify-center">
                          {item.status === "completed" && (
                            <Feather name="check" size={10} color="#059669" />
                          )}
                        </View>
                        <Text className="text-xs font-medium text-slate-800 flex-1 leading-snug">
                          {item.task}
                        </Text>
                      </View>

                      <View className="flex-row items-center gap-2 pl-5 flex-wrap">
                        {item.assignee ? (
                          <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                            <Feather name="user" size={9} color="#64748B" />
                            <Text className="text-[10px] font-medium text-slate-700">
                              {item.assignee}
                            </Text>
                          </View>
                        ) : (
                          <Text className="text-[10px] text-slate-400 italic">
                            {t("room.session_summary_unassigned")}
                          </Text>
                        )}

                        {item.dueDate ? (
                          <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200">
                            <Feather name="calendar" size={9} color="#64748B" />
                            <Text className="text-[10px] font-medium text-slate-600 font-mono">
                              {item.dueDate}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}

        {/* Case 5: Ended session without summary and not skipped/processing */}
        {!isOngoing && !summary && status !== "processing" && status !== "skipped" && (
          <View className="py-4 items-center justify-center">
            <Feather name="file-text" size={24} color="#CBD5E1" />
            <Text className="text-xs font-medium text-slate-400 mt-1">
              {t("room.session_summary_empty")}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

