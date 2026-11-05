"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Loader2,
  Video,
  ChevronDown,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { useEnsureChannelMeetingMutation } from "@/lib/redux/api/meetingsApi";

interface ChannelMeetingButtonProps {
  roomId: string;
  channelId: string;
  isOngoing?: boolean;
  onScheduleMeeting: () => void;
}

export default function ChannelMeetingButton({
  roomId,
  channelId,
  isOngoing = false,
  onScheduleMeeting,
}: ChannelMeetingButtonProps) {
  const t = useTranslations("room");
  const router = useRouter();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(
      typeof window !== "undefined" &&
        Boolean((window as any).electronAPI?.isDesktop)
    );
  }, []);

  const [isMeetingMenuOpen, setIsMeetingMenuOpen] = useState(false);
  const [isJoinTooltipOpen, setIsJoinTooltipOpen] = useState(false);
  const [ensuringTarget, setEnsuringTarget] = useState<"current" | "new" | null>(
    null,
  );

  const [ensureChannelMeeting] = useEnsureChannelMeetingMutation();

  const handleStartOrJoinMeeting = async (
    target: "current" | "new" = "current",
  ) => {
    if (!roomId || !channelId) return;
    try {
      setEnsuringTarget(target);
      const res = await ensureChannelMeeting({
        roomId,
        channelId,
      }).unwrap();
      if (res?.meetingCode) {
        setIsJoinTooltipOpen(false);
        setIsMeetingMenuOpen(false);
        if (target === "new") {
          window.open(`/meeting/${res.meetingCode}`, "_blank");
        } else {
          router.push(`/meeting/${res.meetingCode}`);
        }
      }
    } catch (err: any) {
      toast.error(
        err?.data?.message || err?.message || "Không thể khởi tạo cuộc họp",
      );
    } finally {
      setEnsuringTarget(null);
    }
  };

  // ==========================================
  // GIAO DIỆN TRÊN DESKTOP APP (ELECTRON)
  // 1 nút có dropdown kết hợp: Bắt đầu/Tham gia + Lên lịch cuộc họp
  // (Không chia 2 nút tab này/tab mới, mở trực tiếp cửa sổ cuộc họp)
  // ==========================================
  if (isDesktop) {
    if (isOngoing) {
      return (
        <div className="relative">
          <button
            disabled={!!ensuringTarget}
            onClick={() => setIsJoinTooltipOpen(!isJoinTooltipOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-700 hover:to-blue-700 text-white rounded-full text-sm font-semibold transition-all duration-200 shadow-md shadow-brand-500/25 hover:shadow-lg hover:shadow-brand-500/30 active:scale-95 disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed group"
          >
            {ensuringTarget ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Video size={16} className="transition-transform group-hover:scale-110" />
            )}
            <span>{t("btn_join")}</span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-200 ${isJoinTooltipOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isJoinTooltipOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsJoinTooltipOpen(false)}
              />
              <div className="absolute right-0 top-12 z-50 w-64 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/5">
                <div className="px-3.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("join_tooltip_title")}
                </div>
                <button
                  disabled={!!ensuringTarget}
                  onClick={() => handleStartOrJoinMeeting("new")}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 rounded-xl flex items-center justify-between gap-2 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                      <Video size={16} />
                    </div>
                    <span className="font-medium text-slate-800">
                      {t("join_tooltip_title")}
                    </span>
                  </div>
                  {ensuringTarget === "new" && (
                    <Loader2
                      size={14}
                      className="animate-spin text-brand-600 shrink-0"
                    />
                  )}
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => {
                    setIsJoinTooltipOpen(false);
                    onScheduleMeeting();
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                    <Calendar size={16} />
                  </div>
                  <span className="font-medium text-slate-800">
                    {t("schedule_meeting")}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="relative">
        <button
          disabled={!!ensuringTarget}
          onClick={() => setIsMeetingMenuOpen(!isMeetingMenuOpen)}
          className="flex items-center gap-2 px-4 py-2 border-2 border-brand-500 hover:border-brand-600 bg-transparent hover:bg-brand-50/70 text-brand-600 dark:border-brand-500/80 dark:text-brand-400 dark:hover:bg-brand-500/10 rounded-full text-sm font-semibold transition-all duration-200 active:scale-95 disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed group shadow-xs"
        >
          {ensuringTarget ? (
            <Loader2
              size={16}
              className="animate-spin text-brand-600 dark:text-brand-400"
            />
          ) : (
            <Video
              size={16}
              className="transition-transform group-hover:scale-110 text-brand-600 dark:text-brand-400"
            />
          )}
          <span>{t("btn_meeting")}</span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 text-brand-600 dark:text-brand-400 ${
              isMeetingMenuOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isMeetingMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsMeetingMenuOpen(false)}
            />
            <div className="absolute right-0 top-12 z-50 w-64 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/5">
              <div className="px-3.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {t("start_tooltip_title")}
              </div>
              <button
                disabled={!!ensuringTarget}
                onClick={() => handleStartOrJoinMeeting("new")}
                className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 rounded-xl flex items-center justify-between gap-2 disabled:opacity-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                    <Video size={16} />
                  </div>
                  <span className="font-medium text-slate-800">
                    {t("start_tooltip_title")}
                  </span>
                </div>
                {ensuringTarget === "new" && (
                  <Loader2
                    size={14}
                    className="animate-spin text-brand-600 shrink-0"
                  />
                )}
              </button>
              <div className="my-1 border-t border-slate-100" />
              <button
                onClick={() => {
                  setIsMeetingMenuOpen(false);
                  onScheduleMeeting();
                }}
                className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                  <Calendar size={16} />
                </div>
                <span className="font-medium text-slate-800">
                  {t("schedule_meeting")}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ==========================================
  // GIAO DIỆN TRÊN WEB (TRÌNH DUYỆT) - GIỮ NGUYÊN
  // ==========================================
  return (
    <div className="relative">
      {isOngoing ? (
        // TRẠNG THÁI 1: ĐANG HỌP (THAM GIA CUỘC HỌP - NỀN ĐẦY MÀU XANH DƯƠNG)
        <>
          <button
            disabled={!!ensuringTarget}
            onClick={() => setIsJoinTooltipOpen(!isJoinTooltipOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-700 hover:to-blue-700 text-white rounded-full text-sm font-semibold transition-all duration-200 shadow-md shadow-brand-500/25 hover:shadow-lg hover:shadow-brand-500/30 active:scale-95 disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed group"
          >
            {ensuringTarget ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Video size={16} className="transition-transform group-hover:scale-110" />
            )}
            <span>{t("btn_join")}</span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${isJoinTooltipOpen ? "rotate-180" : ""}`} />
          </button>

          {isJoinTooltipOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsJoinTooltipOpen(false)}
              />
              <div className="absolute right-0 top-12 z-50 w-64 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/5">
                <div className="px-3.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("join_tooltip_title")}
                </div>
                <button
                  disabled={!!ensuringTarget}
                  onClick={() => handleStartOrJoinMeeting("current")}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 rounded-xl flex items-center justify-between gap-2 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                      <Video size={16} />
                    </div>
                    <span className="font-medium text-slate-800">
                      {t("join_current_tab")}
                    </span>
                  </div>
                  {ensuringTarget === "current" && (
                    <Loader2
                      size={14}
                      className="animate-spin text-brand-600 shrink-0"
                    />
                  )}
                </button>
                <button
                  disabled={!!ensuringTarget}
                  onClick={() => handleStartOrJoinMeeting("new")}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 rounded-xl flex items-center justify-between gap-2 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                      <ExternalLink size={16} />
                    </div>
                    <span className="font-medium text-slate-800">
                      {t("join_new_tab")}
                    </span>
                  </div>
                  {ensuringTarget === "new" && (
                    <Loader2
                      size={14}
                      className="animate-spin text-brand-600 shrink-0"
                    />
                  )}
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => {
                    setIsJoinTooltipOpen(false);
                    onScheduleMeeting();
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                    <Calendar size={16} />
                  </div>
                  <span className="font-medium text-slate-800">
                    {t("schedule_meeting")}
                  </span>
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        // TRẠNG THÁI 2: CHƯA CÓ CUỘC HỌP (CẤU TRÚC RỖNG VỚI VIỀN XANH DƯƠNG)
        <>
          <button
            disabled={!!ensuringTarget}
            onClick={() => setIsMeetingMenuOpen(!isMeetingMenuOpen)}
            className="flex items-center gap-2 px-4 py-2 border-2 border-brand-500 hover:border-brand-600 bg-transparent hover:bg-brand-50/70 text-brand-600 dark:border-brand-500/80 dark:text-brand-400 dark:hover:bg-brand-500/10 rounded-full text-sm font-semibold transition-all duration-200 active:scale-95 disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed group shadow-xs"
          >
            {ensuringTarget ? (
              <Loader2 size={16} className="animate-spin text-brand-600 dark:text-brand-400" />
            ) : (
              <Video size={16} className="transition-transform group-hover:scale-110 text-brand-600 dark:text-brand-400" />
            )}
            <span>{t("btn_meeting")}</span>
            <ChevronDown size={14} className={`transition-transform duration-200 text-brand-600 dark:text-brand-400 ${isMeetingMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {isMeetingMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMeetingMenuOpen(false)}
              />
              <div className="absolute right-0 top-12 z-50 w-64 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/5">
                <div className="px-3.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("start_tooltip_title")}
                </div>
                <button
                  disabled={!!ensuringTarget}
                  onClick={() => handleStartOrJoinMeeting("current")}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 rounded-xl flex items-center justify-between gap-2 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                      <Video size={16} />
                    </div>
                    <span className="font-medium text-slate-800">
                      {t("start_current_tab")}
                    </span>
                  </div>
                  {ensuringTarget === "current" && (
                    <Loader2
                      size={14}
                      className="animate-spin text-brand-600 shrink-0"
                    />
                  )}
                </button>
                <button
                  disabled={!!ensuringTarget}
                  onClick={() => handleStartOrJoinMeeting("new")}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 rounded-xl flex items-center justify-between gap-2 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                      <ExternalLink size={16} />
                    </div>
                    <span className="font-medium text-slate-800">
                      {t("start_new_tab")}
                    </span>
                  </div>
                  {ensuringTarget === "new" && (
                    <Loader2
                      size={14}
                      className="animate-spin text-brand-600 shrink-0"
                    />
                  )}
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => {
                    setIsMeetingMenuOpen(false);
                    onScheduleMeeting();
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                    <Calendar size={16} />
                  </div>
                  <span className="font-medium text-slate-800">
                    {t("schedule_meeting")}
                  </span>
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
