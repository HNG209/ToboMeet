"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Video,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  ChevronDown,
  StickyNote,
  Clock,
  ArrowLeft,
  X,
} from "lucide-react";
import { useEnsurePersonalMeetingMutation } from "@/lib/redux/api/meetingsApi";
import { useGetMeQuery } from "@/lib/redux/api/usersApi";
import ChannelSessionsTab from "@/components/room/ChannelSessionsTab";

interface PersonalMeetingSettingsProps {
  onClose?: () => void;
  isViewingHistory?: boolean;
  onToggleHistory?: (isHistory: boolean) => void;
}

export function PersonalMeetingSettings({
  onClose,
  isViewingHistory: externalIsViewingHistory,
  onToggleHistory: externalOnToggleHistory,
}: PersonalMeetingSettingsProps) {
  const t = useTranslations("settings.personal_meeting");
  const router = useRouter();
  const { data: myProfile } = useGetMeQuery();

  const [internalHistory, setInternalHistory] = useState(false);
  const isViewingHistory = externalIsViewingHistory ?? internalHistory;
  const handleToggleHistory = (val: boolean) => {
    setInternalHistory(val);
    externalOnToggleHistory?.(val);
  };

  const [ensurePersonalMeeting, { isLoading }] =
    useEnsurePersonalMeetingMutation();
  const [meetingCode, setMeetingCode] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsDesktop(
      typeof window !== "undefined" &&
        Boolean((window as any).electronAPI?.isDesktop)
    );
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchCode = async () => {
      try {
        const res = await ensurePersonalMeeting().unwrap();
        if (mounted && res?.meetingCode) {
          setMeetingCode(res.meetingCode);
        }
      } catch (err: any) {
        toast.error(
          err?.data?.message ||
            err?.message ||
            t("error_fetch", {
              defaultValue: "Không thể lấy thông tin cuộc họp cá nhân",
            })
        );
      }
    };
    fetchCode();
    return () => {
      mounted = false;
    };
  }, [ensurePersonalMeeting, t]);

  const meetingUrl =
    typeof window !== "undefined" && meetingCode
      ? `${window.location.origin}/meeting/${meetingCode}`
      : "";

  const handleCopyCode = async () => {
    if (!meetingCode) return;
    try {
      await navigator.clipboard.writeText(meetingCode);
      setCopiedCode(true);
      toast.success(
        t("copied_code", { defaultValue: "Đã sao chép mã cuộc họp" })
      );
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("Không thể sao chép");
    }
  };

  const handleCopyLink = async () => {
    if (!meetingUrl) return;
    try {
      await navigator.clipboard.writeText(meetingUrl);
      setCopiedLink(true);
      toast.success(
        t("copied_link", { defaultValue: "Đã sao chép liên kết cuộc họp" })
      );
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Không thể sao chép");
    }
  };

  const handleStartMeeting = (target: "current" | "new") => {
    if (!meetingCode) return;
    setIsStarting(true);
    setIsDropdownOpen(false);

    if (onClose) onClose();

    if (isDesktop) {
      window.open(`/meeting/${meetingCode}`, "_blank");
    } else {
      if (target === "new") {
        window.open(`/meeting/${meetingCode}`, "_blank");
      } else {
        router.push(`/meeting/${meetingCode}`);
      }
    }
  };

  if (isViewingHistory) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden animate-fade-in bg-slate-50/50">
        {/* Header bar với nút Quay về */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleToggleHistory(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600" />
              <span>{t("back_to_settings", { defaultValue: "Quay về" })}</span>
            </button>
            <div className="h-4 w-[1px] bg-slate-200" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {t("history_modal_title", {
                  defaultValue: "Lịch sử cuộc họp cá nhân",
                })}
              </h3>
              {meetingCode && (
                <p className="text-[11px] text-slate-400 font-mono">
                  Mã: {meetingCode}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Nhúng ChannelSessionsTab trực tiếp trong Modal Settings */}
        <div className="flex-1 overflow-hidden min-h-0">
          <ChannelSessionsTab
            initialMeetingCode={meetingCode}
            userId={myProfile?.supabaseId || ""}
            title="Lịch sử phiên họp cá nhân"
            isPersonalMeeting={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto flex flex-col gap-6 animate-fade-in">
      {/* Header (đã bỏ icon camera) */}
      <div className="border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 tracking-tight">
            {t("header", { defaultValue: "Cuộc họp cá nhân" })}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("desc", {
              defaultValue:
                "Phòng họp riêng cố định dành riêng cho bạn. Sử dụng liên kết hoặc mã cuộc họp này để mời mọi người tham gia bất kỳ lúc nào.",
            })}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-brand-500" />
          <span className="text-xs font-medium">
            {t("loading", { defaultValue: "Đang tải thông tin phòng họp..." })}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Card Thông tin phòng họp */}
          <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 shadow-xs flex flex-col gap-4">
            {/* Mã cuộc họp */}
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                {t("meeting_code_label", { defaultValue: "Mã cuộc họp cá nhân" })}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={meetingCode}
                  className="flex-1 px-4 py-2.5 text-sm font-mono font-semibold bg-white border border-slate-200 rounded-xl text-slate-800 select-all focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-brand-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                  title={t("copy_code", { defaultValue: "Sao chép mã" })}
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 font-bold">
                        {t("copied", { defaultValue: "Đã sao chép" })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t("copy", { defaultValue: "Sao chép" })}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Liên kết cuộc họp */}
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                {t("meeting_link_label", {
                  defaultValue: "Liên kết cuộc họp cá nhân",
                })}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={meetingUrl}
                  className="flex-1 px-4 py-2.5 text-xs font-medium bg-white border border-slate-200 rounded-xl text-slate-600 truncate select-all focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-brand-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                  title={t("copy_link", { defaultValue: "Sao chép liên kết" })}
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 font-bold">
                        {t("copied", { defaultValue: "Đã sao chép" })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t("copy_link_btn", { defaultValue: "Sao chép link" })}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Action Button: Bắt đầu cuộc họp & Lịch sử cuộc họp */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            {isDesktop ? (
              // DESKTOP: Bắt đầu trực tiếp trong cửa sổ mới
              <button
                type="button"
                disabled={!meetingCode || isStarting}
                onClick={() => handleStartMeeting("new")}
                className="flex-1 w-full px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group shadow-xs"
              >
                {isStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Video className="w-4 h-4" />
                )}
                <span>
                  {t("start_meeting_btn", {
                    defaultValue: "Bắt đầu cuộc họp",
                  })}
                </span>
                <ExternalLink className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
              </button>
            ) : (
              // WEB: Dropdown lựa chọn tab này hoặc tab mới
              <div className="relative flex-1 w-full">
                <button
                  type="button"
                  disabled={!meetingCode || isStarting}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs group"
                >
                  <div className="flex items-center gap-2">
                    {isStarting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Video className="w-4 h-4" />
                    )}
                    <span>
                      {t("start_meeting_btn", {
                        defaultValue: "Bắt đầu cuộc họp",
                      })}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsDropdownOpen(false)}
                    />
                    <div className="absolute left-0 bottom-full mb-2 sm:bottom-auto sm:top-full sm:mt-2 z-50 w-72 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150 ring-1 ring-black/5">
                      <div className="px-3.5 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {t("select_start_target", {
                          defaultValue: "Chọn cách mở cuộc họp",
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartMeeting("current")}
                        className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                          <Video className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 text-xs">
                            {t("start_current_tab", {
                              defaultValue: "Bắt đầu trên tab này",
                            })}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {t("start_current_tab_desc", {
                              defaultValue: "Chuyển tiếp trang hiện tại vào phòng họp",
                            })}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartMeeting("new")}
                        className="w-full text-left px-3.5 py-2.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 rounded-xl flex items-center gap-2.5 cursor-pointer transition-colors mt-0.5"
                      >
                        <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                          <ExternalLink className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 text-xs">
                            {t("start_new_tab", {
                              defaultValue: "Bắt đầu trên tab mới",
                            })}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {t("start_new_tab_desc", {
                              defaultValue: "Mở cuộc họp trong tab trình duyệt mới",
                            })}
                          </span>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Action Button: Lịch sử cuộc họp */}
            <button
              type="button"
              disabled={!meetingCode}
              onClick={() => handleToggleHistory(true)}
              className="flex-1 w-full px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 hover:text-brand-600 border border-slate-200 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
            >
              <Clock className="w-4 h-4 text-brand-600" />
              <span>
                {t("history_btn", {
                  defaultValue: "Lịch sử cuộc họp",
                })}
              </span>
            </button>
          </div>

          {/* Feature Highlights with Note icon */}
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/70 flex items-start gap-3 mt-2">
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 mt-0.5 border border-amber-100/80 shrink-0">
              <StickyNote className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-500 leading-relaxed">
              <p className="font-bold text-slate-700 mb-0.5">
                {t("tip_title", { defaultValue: "Ghi chú về cuộc họp cá nhân" })}
              </p>
              {t("tip_desc", {
                defaultValue:
                  "Mã phòng họp này được chỉ định duy nhất cho tài khoản của bạn và không đổi. Người khác có thể tham gia bất kỳ lúc nào bạn bắt đầu cuộc họp.",
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
