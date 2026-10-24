"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  Video,
  Clock,
  Paperclip,
  Pencil,
  Trash2,
  ClipboardList,
  ArrowRight,
  RotateCcw,
  CalendarX,
  Repeat,
  UserPlus,
  LogOut,
  RefreshCw,
  Bell,
  BellOff,
} from "lucide-react";
import { CalendarEvent, RsvpMember } from "./types";
import {
  useRestoreCalendarOccurrenceMutation,
  useLeaveCalendarEventMutation,
  useToggleCalendarNotificationMutation,
} from "@/lib/redux/api/calendarApi";
import InviteMembersModal from "./InviteMembersModal";
import ToggleNotificationConfirmModal from "./ToggleNotificationConfirmModal";
import { toast } from "sonner";

interface EventDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: string;
  event: CalendarEvent | null;
  rsvpList: RsvpMember[];
  currentUserId?: string;
  currentSupabaseId?: string;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onJoinMeeting: (meetingCode: string) => void;
  onRestoreOccurrence?: (eventId: string, occurrenceDate: string) => void;
}

export default function EventDetailModal({
  isOpen,
  onClose,
  locale,
  event,
  rsvpList,
  currentUserId,
  currentSupabaseId,
  onEdit,
  onDelete,
  onJoinMeeting,
  onRestoreOccurrence,
}: EventDetailModalProps) {
  const t = useTranslations("calendar");
  const [restoreCalendarOccurrence] = useRestoreCalendarOccurrenceMutation();
  const [leaveCalendarEvent, { isLoading: isLeaving }] =
    useLeaveCalendarEventMutation();
  const [toggleCalendarNotification, { isLoading: isTogglingNotification }] =
    useToggleCalendarNotificationMutation();
  const [restoringDate, setRestoringDate] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showNotificationConfirmModal, setShowNotificationConfirmModal] =
    useState(false);
  const [exceptions, setExceptions] = useState<string[]>(
    event?.recurrenceExceptions || [],
  );
  const [notificationsEnabledUsers, setNotificationsEnabledUsers] = useState<
    string[] | undefined
  >(event?.notificationsEnabledUserIds);

  useEffect(() => {
    setNotificationsEnabledUsers(event?.notificationsEnabledUserIds);
  }, [event?.notificationsEnabledUserIds]);

  useEffect(() => {
    setExceptions(event?.recurrenceExceptions || []);
  }, [event?.recurrenceExceptions]);

  useEffect(() => {
    if (!isOpen) {
      setIsInviteModalOpen(false);
      setShowLeaveConfirm(false);
      setShowNotificationConfirmModal(false);
    }
  }, [isOpen]);

  if (!isOpen || !event) return null;

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  };

  // Trường hợp là Nhiệm vụ (Assignment)
  if (event.eventType === "assignment") {
    const statusMap: Record<string, { label: string; color: string }> = {
      submitted: {
        label: t("detail_modal.assignment.statuses.submitted"),
        color: "bg-emerald-100 text-emerald-700 border-emerald-200",
      },
      graded: {
        label: t("detail_modal.assignment.statuses.graded"),
        color: "bg-emerald-100 text-emerald-700 border-emerald-200",
      },
      overdue: {
        label: t("detail_modal.assignment.statuses.overdue"),
        color: "bg-rose-100 text-rose-700 border-rose-200",
      },
      closed: {
        label: t("detail_modal.assignment.statuses.closed"),
        color: "bg-slate-100 text-slate-700 border-slate-200",
      },
      in_progress: {
        label: t("detail_modal.assignment.statuses.in_progress"),
        color: "bg-blue-100 text-blue-700 border-blue-200",
      },
    };
    const currentStatus = statusMap[event.assignmentStatus || "in_progress"] || statusMap.in_progress;

    const handleOpenAssignment = () => {
      onClose();
      window.location.href = `/${locale}/room/${event.roomId}?channel=__assignments__&assignmentId=${event.assignmentId}`;
    };

    return (
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-800 text-[17px]">
                {t("detail_modal.assignment.title")}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4 text-left">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${currentStatus.color}`}>
                  {currentStatus.label}
                </span>
              </div>
              <h4 className="text-lg font-bold text-slate-900 tracking-tight">
                {event.title}
              </h4>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">
                  {t("detail_modal.assignment.start_time")}
                </span>
                <span className="font-semibold text-slate-700">
                  {formatDateTime(event.assignmentStartDate || event.startDate)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">
                  {t("detail_modal.assignment.end_time")}
                </span>
                <span
                  className={
                    event.assignmentStatus === "overdue"
                      ? "font-bold text-rose-600"
                      : "font-semibold text-slate-700"
                  }
                >
                  {formatDateTime(event.assignmentDueDate || event.startDate)}
                </span>
              </div>
              {event.hostDisplayName && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                  <span className="text-slate-400 font-medium">
                    {t("detail_modal.assignment.assigned_by")}
                  </span>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                    {event.hostAvatarUrl ? (
                      <img src={event.hostAvatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
                    ) : null}
                    <span>{event.hostDisplayName}</span>
                  </div>
                </div>
              )}
            </div>

            {event.description && (
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  {t("detail_modal.assignment.description")}
                </p>
                <div className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200 leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {event.description}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                {t("detail_modal.assignment.close")}
              </button>
              <button
                type="button"
                onClick={handleOpenAssignment}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <span>{t("detail_modal.assignment.view_assignment")}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isChannelMeeting =
    event.roomType === "channel_meeting" &&
    event.roomId &&
    event.channelId;
  const hasRsvp = rsvpList && rsvpList.length > 0;

  const isHost =
    (currentUserId && currentUserId === event.hostId) ||
    (currentSupabaseId && currentSupabaseId === event.hostId);

  const hostMember = rsvpList?.find(
    (m) => m.isHost || m.userId === event.hostId,
  );
  const guestList = (rsvpList || []).filter(
    (inv) => !inv.isHost && inv.userId !== event.hostId,
  );

  const isRecurring = Boolean(event.recurrenceRule || event.isRecurring);

  const formatCancelledDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      if (isNaN(date.getTime())) return dateStr;
      const daysFull = (t.raw("days.full") as string[]) || [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const dayOfWeek = daysFull[date.getDay()];
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${dayOfWeek}, ${pad(day)}/${pad(month)}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const handleRestoreDate = async (dateStr: string) => {
    if (!event?._id) return;
    try {
      setRestoringDate(dateStr);
      await restoreCalendarOccurrence({
        id: event._id,
        occurrenceDate: dateStr,
      }).unwrap();

      setExceptions((prev) => prev.filter((d) => d !== dateStr));
      onRestoreOccurrence?.(event._id, dateStr);

      toast.success(
        t("detail_modal.toast_restore_success", {
          date: formatCancelledDate(dateStr),
        }),
      );
    } catch (err) {
      console.error("Lỗi khi khôi phục buổi họp:", err);
      toast.error(t("detail_modal.toast_restore_error"));
    } finally {
      setRestoringDate(null);
    }
  };

  const handleConfirmLeave = async () => {
    if (!event?._id) return;
    try {
      await leaveCalendarEvent(event._id).unwrap();
      toast.success(t("detail_modal.leave_success"));
      setShowLeaveConfirm(false);
      onClose();
    } catch (err) {
      console.error("Lỗi khi hủy tham gia lịch họp:", err);
      toast.error(t("detail_modal.leave_error"));
    }
  };

  const myId = currentSupabaseId || currentUserId;
  const isNotificationEnabled =
    notificationsEnabledUsers !== undefined
      ? Boolean(myId && notificationsEnabledUsers.includes(myId))
      : Boolean(
          isHost ||
            (rsvpList && rsvpList.some((r) => r.userId === myId)) ||
            (event.acceptedUserIds && myId && event.acceptedUserIds.includes(myId)) ||
            (event.pendingUserIds && myId && event.pendingUserIds.includes(myId)),
        );

  const handleConfirmToggleNotification = async () => {
    if (!event?._id) return;
    try {
      const targetState = !isNotificationEnabled;
      const res = await toggleCalendarNotification({
        id: event._id,
        enabled: targetState,
      }).unwrap();

      if (res?.event?.notificationsEnabledUserIds) {
        setNotificationsEnabledUsers(res.event.notificationsEnabledUserIds);
      } else {
        setNotificationsEnabledUsers((prev) => {
          const currentArr =
            prev ??
            (myId
              ? [
                  ...(isHost ? [event.hostId] : []),
                  ...(event.acceptedUserIds || []),
                ]
              : []);
          return targetState
            ? Array.from(new Set([...currentArr, myId!]))
            : currentArr.filter((id) => id !== myId);
        });
      }

      toast.success(
        targetState
          ? t("toasts.notification_enabled_success")
          : t("toasts.notification_disabled_success"),
      );
      setShowNotificationConfirmModal(false);
    } catch (err) {
      console.error("Lỗi cập nhật thông báo:", err);
      toast.error(t("toasts.notification_toggle_error"));
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-[17px]">
            {t("detail_modal.title")}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h4 className="text-lg font-bold text-slate-900 tracking-tight">
                {event.title}
              </h4>
              {isRecurring && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                  <Repeat className="w-3 h-3 text-indigo-500" />
                  <span>{t("detail_modal.recurring_badge")}</span>
                </span>
              )}
            </div>

            {/* Microsoft Teams style Action Buttons */}
            {(isChannelMeeting || Boolean(event.meetingCode) || hasRsvp || isHost) && (
              <div className="flex items-center justify-between gap-2 mt-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!isChannelMeeting) {
                        onJoinMeeting(event.meetingCode || "");
                      } else {
                        window.location.href = `/${locale}/room/${event.roomId}?channel=${event.channelId}`;
                      }
                    }}
                    className="bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    <span>{t("detail_modal.join")}</span>
                  </button>
                </div>

                {/* Biểu tượng thông báo (đang bật hoặc đang tắt) ở bên còn lại của cụm nút */}
                <button
                  type="button"
                  onClick={() => setShowNotificationConfirmModal(true)}
                  title={
                    isNotificationEnabled
                      ? t("detail_modal.notification_enabled_tooltip")
                      : t("detail_modal.notification_disabled_tooltip")
                  }
                  className={`p-2 rounded-xl border transition-all flex items-center justify-center cursor-pointer shadow-xs ${
                    isNotificationEnabled
                      ? "border-indigo-200 bg-indigo-50/80 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700"
                      : "border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {isNotificationEnabled ? (
                    <Bell className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <BellOff className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>
                {formatDateTime(event.startDate)} - {formatDateTime(event.endDate)}
              </span>
            </div>

            {event.description &&
              (() => {
                const match = event.description.match(
                  /<div[^>]*data-attachments="([^"]*)"[^>]*><\/div>/,
                );
                let cleanHtml = event.description;
                let files: any[] = [];
                if (match) {
                  cleanHtml = event.description.replace(match[0], "");
                  try {
                    files = JSON.parse(decodeURIComponent(match[1]));
                  } catch (e) { }
                }
                const cleanText = cleanHtml
                  .replace(/<[^>]*>/g, "")
                  .replace(/&nbsp;/g, " ")
                  .trim();

                return (
                  <div className="mt-2 space-y-3">
                    {cleanText.length > 0 && (
                      <div className="text-sm bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-600 whitespace-pre-wrap leading-relaxed">
                        {cleanText}
                      </div>
                    )}
                    {files.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {t("detail_modal.attachments")}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {files.map((f: any, idx: number) => (
                            <a
                              key={idx}
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg text-[11px] font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                            >
                              <Paperclip className="w-3 h-3 text-slate-400" />
                              <span>{f.name}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>

          {/* Danh sách các buổi đã hủy trong chuỗi (Dành cho lịch định kỳ) */}
          {isRecurring && exceptions.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <CalendarX className="w-4 h-4 text-rose-500" />
                  <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    {t("detail_modal.cancelled_dates_title")}
                  </h5>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100">
                  {t("detail_modal.dates_count", { count: exceptions.length })}
                </span>
              </div>

              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {exceptions.map((dateStr) => {
                  const isRestoringThis = restoringDate === dateStr;
                  return (
                    <div
                      key={dateStr}
                      className="flex items-center justify-between p-2.5 bg-rose-50/40 border border-rose-100/80 rounded-xl text-xs transition-colors hover:bg-rose-50/70"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-slate-800 truncate">
                            {formatCancelledDate(dateStr)}
                          </span>
                          <span className="text-[10px] text-rose-600 font-medium">
                            {t("detail_modal.cancelled_status")}
                          </span>
                        </div>
                      </div>

                      {isHost && (
                        <button
                          type="button"
                          disabled={isRestoringThis}
                          onClick={() => handleRestoreDate(dateStr)}
                          className="px-2.5 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-600 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer disabled:opacity-50"
                          title={t("detail_modal.restore_tooltip")}
                        >
                          <RotateCcw
                            className={`w-3.5 h-3.5 ${isRestoringThis
                                ? "animate-spin text-indigo-600"
                                : "text-indigo-500"
                              }`}
                          />
                          <span>
                            {isRestoringThis
                              ? t("detail_modal.restoring_button")
                              : t("detail_modal.restore_button")}
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Danh sách người tham gia (người tổ chức và khách mời) */}
          {(Boolean(event.hostId) || hasRsvp) && (
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {t("detail_modal.participants")}
                </h5>
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors cursor-pointer"
                  title={t("detail_modal.invite_button")}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{t("detail_modal.invite_button")}</span>
                </button>
              </div>
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {/* Người tổ chức (Host) */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    {hostMember?.avatarUrl || event.hostAvatarUrl ? (
                      <img
                        src={hostMember?.avatarUrl || event.hostAvatarUrl}
                        className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                        alt=""
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200 uppercase shrink-0">
                        {(
                          hostMember?.displayName ||
                          event.hostDisplayName ||
                          hostMember?.email ||
                          event.hostEmail ||
                          "?"
                        ).substring(0, 1)}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-slate-800 truncate">
                        {hostMember?.displayName ||
                          event.hostDisplayName ||
                          hostMember?.email?.split("@")[0] ||
                          event.hostEmail?.split("@")[0] ||
                          t("detail_modal.organizer")}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {hostMember?.email || event.hostEmail}
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 bg-brand-50 text-brand-600 rounded-md font-bold uppercase shrink-0">
                    {t("detail_modal.organizer")}
                  </span>
                </div>

                {/* Khách mời */}
                {guestList.map((inv, idx) => {
                  const isResponded = inv.status !== "PENDING";
                  const statusText = isResponded
                    ? t("detail_modal.responded")
                    : t("detail_modal.no_response");

                  let dotColor = "bg-slate-400";
                  if (inv.status === "ACCEPTED") dotColor = "bg-emerald-500";
                  else if (inv.status === "DECLINED") dotColor = "bg-rose-500";
                  else if (inv.status === "TENTATIVE") dotColor = "bg-amber-500";

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {inv.avatarUrl ? (
                          <img
                            src={inv.avatarUrl}
                            className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                            alt=""
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200 uppercase shrink-0">
                            {inv.displayName
                              ? inv.displayName.substring(0, 1)
                              : "?"}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-slate-800 truncate">
                            {inv.displayName || inv.email.split("@")[0]}
                          </span>
                          <span className="text-[10px] text-slate-400 truncate">
                            {inv.email}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${isResponded ? "text-slate-600" : "text-slate-400"
                            }`}
                        >
                          {statusText}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons ở Footer */}
          <div className="flex gap-2 pt-4 w-full border-t border-slate-50 justify-between items-center">
            <div className="flex gap-2">
              {isHost && (
                <button
                  type="button"
                  onClick={() => onEdit(event)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer"
                  title={t("detail_modal.edit")}
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-600" />
                  <span>{t("detail_modal.edit")}</span>
                </button>
              )}
              {isHost && (
                <button
                  type="button"
                  onClick={() => onDelete(event)}
                  className="px-4 py-2 border border-red-100 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold text-red-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>{t("detail_modal.delete")}</span>
                </button>
              )}
            </div>

            {!isHost && (
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(true)}
                className="px-4 py-2 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                title={t("detail_modal.leave_event")}
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span>{t("detail_modal.leave_event")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal xác nhận hủy tham gia */}
      {showLeaveConfirm && (
        <div
          onClick={() => !isLeaving && setShowLeaveConfirm(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[110] flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95 duration-150 border border-slate-100"
          >
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <LogOut className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-800 mb-1.5">
              {t("detail_modal.leave_confirm_title")}
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              {t("detail_modal.leave_confirm_desc")}
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                disabled={isLeaving}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {t("detail_modal.leave_cancel_btn")}
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                disabled={isLeaving}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isLeaving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogOut className="w-3.5 h-3.5" />
                )}
                <span>{t("detail_modal.leave_confirm_btn")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isInviteModalOpen && event && (
        <InviteMembersModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          eventId={event._id}
          existingMemberIds={[
            ...(event.hostId ? [event.hostId] : []),
            ...(event.acceptedUserIds || []),
            ...(event.pendingUserIds || []),
            ...((rsvpList || [])
              .filter((m) => m.status === "ACCEPTED" || m.status === "PENDING")
              .map((m) => m.userId)
              .filter(Boolean) as string[]),
          ]}
          existingEmails={[
            ...(event.hostEmail ? [event.hostEmail] : []),
            ...((event.invitees || []).map((i) => i.email).filter(Boolean) as string[]),
            ...((rsvpList || [])
              .filter((m) => m.status === "ACCEPTED" || m.status === "PENDING")
              .map((m) => m.email)
              .filter(Boolean) as string[]),
          ]}
        />
      )}

      {showNotificationConfirmModal && event && (
        <ToggleNotificationConfirmModal
          isOpen={showNotificationConfirmModal}
          onClose={() => setShowNotificationConfirmModal(false)}
          onConfirm={handleConfirmToggleNotification}
          isCurrentlyEnabled={isNotificationEnabled}
          eventTitle={event.title}
          isLoading={isTogglingNotification}
        />
      )}
    </div>
  );
}
