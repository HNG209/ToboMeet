import { NotificationResponse } from "@tobomeet/shared/types";
import {
  Bell,
  UserMinus,
  Trash2,
  Video,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Calendar,
  Check,
  X as XIcon,
  XCircle,
  Clock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLazyExchangeSessionQuery } from "@/lib/redux/api/meetingsApi";
import { useUpdateCalendarRsvpMutation } from "@/lib/redux/api/calendarApi";
import { toast } from "sonner";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";

interface NotificationCardProps {
  notification: NotificationResponse;
  onCloseDrawer: () => void;
}

export default function NotificationCard({
  notification,
  onCloseDrawer,
}: NotificationCardProps) {
  const t = useTranslations("notification");
  const locale = useLocale();
  const router = useRouter();
  const [exchangeSession] = useLazyExchangeSessionQuery();
  const [updateCalendarRsvp] = useUpdateCalendarRsvpMutation();
  const [isLoading, setIsLoading] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState<"ACCEPTED" | "DECLINED" | null>(
    null,
  );
  const [rsvpStatus, setRsvpStatus] = useState<string | null>(
    notification.metadata?.rsvpStatus || null,
  );

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

    if (diffInSeconds < 60) return t("time.just_now");

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60)
      return t("time.minutes_ago", { count: diffInMinutes });

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return t("time.hours_ago", { count: diffInHours });

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays <= 30) return t("time.days_ago", { count: diffInDays });

    // Quá 30 ngày thì hiển thị đầy đủ ngày giờ
    return past.toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getNotificationDetails = (
    type: string,
    metadata: Record<string, any>,
  ) => {
    switch (type) {
      case "KICKED":
        return {
          title: t("types.kicked.title", {
            roomName: metadata?.roomName || "",
          }),
          content: t("types.kicked.content", {
            roomName: metadata?.roomName || "",
          }),
          icon: UserMinus,
          colorClass: "text-red-600 bg-red-100",
        };
      case "ROOM_DISBANDED":
        return {
          title: t("types.room_disbanded.title"),
          content: t("types.room_disbanded.content", {
            roomName: metadata?.roomName || t("common.room"),
          }),
          icon: Trash2,
          colorClass: "text-orange-600 bg-orange-100",
        };
      case "MEETING_INVITE":
        return {
          title: t("types.meeting_invite.title"),
          content: t("types.meeting_invite.content", {
            inviterName: metadata?.inviterName || t("common.someone"),
            roomName: metadata?.roomName || "",
          }),
          icon: Video,
          colorClass: "text-brand-600 bg-brand-100",
          sessionId: metadata?.sessionId,
          isActionable: true,
        };
      case "CALENDAR_INVITE":
        return {
          title: t("types.calendar_invite.title"),
          content: t("types.calendar_invite.content", {
            inviterName: metadata?.inviterName || t("common.someone"),
            title: metadata?.title || metadata?.eventTitle || "",
          }),
          icon: Calendar,
          colorClass: "text-indigo-600 bg-indigo-100",
          eventId: metadata?.eventId || notification.referenceId,
          isCalendarInvite: true,
          startDate: metadata?.startDate,
          endDate: metadata?.endDate,
        };
      case "CALENDAR_START":
        return {
          title: t("types.calendar_start.title"),
          content: t("types.calendar_start.content", {
            title: metadata?.title || metadata?.eventTitle || "",
          }),
          icon: Video,
          colorClass: "text-brand-600 bg-brand-100",
          meetingCode: metadata?.meetingCode,
          isActionable: true,
        };
      case "ROOM_REPORTED":
        return {
          title: t("types.room_reported.title"),
          content: t("types.room_reported.content"),
          icon: AlertTriangle,
          colorClass: "text-amber-600 bg-amber-100",
        };
      case "REPORT_RESOLVED":
        return {
          title: t("types.report_resolved.title"),
          content: t("types.report_resolved.content"),
          icon: CheckCircle2,
          colorClass: "text-emerald-600 bg-emerald-100",
        };
      case "ROOM_BLOCKED":
        return {
          title: t("types.room_blocked.title"),
          content: t("types.room_blocked.content"),
          icon: AlertTriangle,
          colorClass: "text-rose-600 bg-rose-100",
        };
      case "PARTICIPANT_REMOVED":
        return {
          title: t("types.participant_removed.title"),
          content: t("types.participant_removed.content", {
            meetingCode: metadata?.meetingCode || "",
          }),
          icon: UserMinus,
          colorClass: "text-red-600 bg-red-100",
        };
      default:
        return {
          title: t("types.system.title"),
          content: t("types.system.content", { type }),
          icon: Bell,
          colorClass: "text-slate-500 bg-slate-100",
        };
    }
  };

  const {
    title,
    content,
    icon: Icon,
    colorClass,
    isActionable,
    sessionId,
    meetingCode,
    isCalendarInvite,
    eventId,
    startDate,
  } = getNotificationDetails(notification.type, notification.metadata || {});

  const handleActionClick = async () => {
    if (meetingCode) {
      onCloseDrawer();
      router.push(`/meeting/${meetingCode}`);
      return;
    }

    if (!sessionId) return;

    setIsLoading(true);
    try {
      const response = await exchangeSession(sessionId).unwrap();

      if (response && response.meetingCode) {
        onCloseDrawer();
        router.push(`/meeting/${response.meetingCode}`);
      }
    } catch (error: any) {
      toast.error(error?.message || t("errors.session_ended"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRsvp = async (status: "ACCEPTED" | "DECLINED") => {
    if (!eventId) return;

    setRsvpLoading(status);
    try {
      await updateCalendarRsvp({ eventId, status }).unwrap();
      setRsvpStatus(status);
      if (status === "ACCEPTED") {
        toast.success(t("rsvp.accept_success"));
      } else {
        toast.info(t("rsvp.decline_success"));
      }
    } catch (error: any) {
      toast.error(
        error?.data?.message ||
        error?.message ||
        (status === "ACCEPTED"
          ? t("rsvp.accept_error")
          : t("rsvp.decline_error")),
      );
    } finally {
      setRsvpLoading(null);
    }
  };

  return (
    <div
      className={`relative p-4 rounded-2xl border transition-all duration-200 ${notification.isRead
        ? "bg-white border-slate-100"
        : "bg-brand-50/40 border-brand-100/60"
        }`}
    >
      {!notification.isRead && (
        <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(0,85,255,0.4)]" />
      )}

      <div className="flex gap-3.5">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 pt-0.5">
          <h4 className="text-[13px] font-bold text-slate-800 leading-tight">
            {title}
          </h4>
          {content ? (
            <p className="text-[12px] text-slate-600 mt-1 leading-snug">
              {content}
            </p>
          ) : null}
          <p className="text-[10px] text-slate-400 font-medium mt-2 flex items-center gap-1">
            {formatTimeAgo(notification.createdAt.toString())}
          </p>

          {isActionable && (
            <div className="mt-3">
              <button
                onClick={handleActionClick}
                disabled={isLoading}
                className="w-full flex items-center justify-center py-2 px-4 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-400 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t("actions.join")
                )}
              </button>
            </div>
          )}

          {isCalendarInvite && eventId && (
            <div className="mt-3">
              {startDate && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    {new Date(startDate).toLocaleDateString(
                      locale === "vi" ? "vi-VN" : "en-US",
                      {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </span>
                </div>
              )}

              {rsvpStatus === "ACCEPTED" ? (
                <div className="flex items-center gap-1.5 py-1.5 px-3 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-lg text-xs font-semibold w-fit">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{t("actions.accepted")}</span>
                </div>
              ) : rsvpStatus === "DECLINED" ? (
                <div className="flex items-center gap-1.5 py-1.5 px-3 bg-rose-50 text-rose-700 border border-rose-200/80 rounded-lg text-xs font-semibold w-fit">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>{t("actions.declined")}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRsvp("ACCEPTED")}
                    disabled={rsvpLoading !== null}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                  >
                    {rsvpLoading === "ACCEPTED" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{t("actions.accept")}</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleRsvp("DECLINED")}
                    disabled={rsvpLoading !== null}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 border border-slate-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                  >
                    {rsvpLoading === "DECLINED" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <XIcon className="w-3.5 h-3.5" />
                        <span>{t("actions.decline")}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
