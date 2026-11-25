import React from "react";
import {
  Video,
  GraduationCap,
  Tv,
  Lock,
  Users2,
  ClipboardList,
} from "lucide-react";

export type CalendarViewType = "day" | "week" | "workweek" | "month" | "agenda";

export interface CalendarEvent {
  _id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  meetingCode?: string;
  hostId: string;
  roomType: "meeting" | "classroom" | "livestream" | "private" | "channel_meeting";
  location?: string;
  status?: "active" | "cancelled" | "completed";
  recurrenceRule?: string;
  isRecurring?: boolean;
  recurrenceEndDate?: string;
  recurrenceExceptions?: string[];
  isOccurrence?: boolean;
  occurrenceDate?: string;
  acceptedUserIds?: string[];
  pendingUserIds?: string[];
  declinedUserIds?: string[];
  notificationsEnabledUserIds?: string[];
  invitees?: { email: string; displayName?: string; status?: string }[];
  hostEmail?: string;
  hostDisplayName?: string;
  hostAvatarUrl?: string;
  roomId?: string;
  channelId?: string;
  channelIds?: string[];
  // Assignment specific fields:
  eventType?: "meeting" | "assignment";
  assignmentId?: string;
  assignmentStartDate?: string;
  assignmentDueDate?: string;
  assignmentStatus?: "in_progress" | "submitted" | "graded" | "overdue" | "closed";
}

export interface InviteeItem {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  supabaseId?: string;
  _id?: string;
  userId?: string;
}

export interface RsvpMember {
  userId?: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  status: "ACCEPTED" | "DECLINED" | "TENTATIVE" | "PENDING";
  isHost?: boolean;
}

export const getEventBgColor = (type: string, status?: string, eventType?: string, assignmentStatus?: string) => {
  if (eventType === "assignment") {
    switch (assignmentStatus) {
      case "submitted":
      case "graded":
        return "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 shadow-sm";
      case "overdue":
        return "bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100 shadow-sm";
      case "closed":
        return "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200 shadow-sm";
      default: // in_progress
        return "bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100 shadow-sm";
    }
  }

  if (status === "cancelled") {
    return "bg-gray-100 border-gray-300 text-gray-500 line-through";
  }
  switch (type) {
    case "classroom":
      return "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100 shadow-sm";
    case "livestream":
      return "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 shadow-sm";
    case "private":
      return "bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100 shadow-sm";
    case "channel_meeting":
      return "bg-indigo-50 border-indigo-300 text-indigo-800 hover:bg-indigo-100 shadow-sm";
    default: // meeting
      return "bg-indigo-50 border-indigo-300 text-indigo-800 hover:bg-indigo-100 shadow-sm";
  }
};

export const getEventIcon = (type: string, eventType?: string) => {
  if (eventType === "assignment") {
    return <ClipboardList className="w-3.5 h-3.5" />;
  }

  switch (type) {
    case "classroom":
      return <GraduationCap className="w-3.5 h-3.5" />;
    case "livestream":
      return <Tv className="w-3.5 h-3.5" />;
    case "private":
      return <Lock className="w-3.5 h-3.5" />;
    case "channel_meeting":
      return <Users2 className="w-3.5 h-3.5" />;
    default:
      return <Video className="w-3.5 h-3.5" />;
  }
};

export const formatDateTimeLocal = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const getCacheKey = (date: Date) => {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

export type EventSegmentRole = "single" | "start" | "end";

export interface CalendarEventSegment {
  segmentKey: string;
  originalEvent: CalendarEvent;
  segmentRole: EventSegmentRole;
  segmentStart: Date;
  segmentEnd: Date;
  anchorTime: Date;
  rawStart: Date;
  rawEnd: Date;
  isCrossDay: boolean;
}

export const isSameLocalDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const getLocalDateKey = (d: Date): string =>
  `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const isMidnightNextDay = (start: Date, end: Date): boolean => {
  const nextMidnight = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return end.getTime() === nextMidnight.getTime();
};

/**
 * Tách sự kiện kéo dài qua ngày khác thành đúng 2 lịch con dạng mốc ngắn (bắt đầu & kết thúc),
 * áp dụng cho cả sự kiện thông thường và nhiệm vụ (Assignment).
 */
export const splitCrossDayEvents = (
  events: CalendarEvent[],
  milestoneMinutes = 45,
): CalendarEventSegment[] => {
  const segments: CalendarEventSegment[] = [];
  const slotMs = milestoneMinutes * 60 * 1000;

  for (const ev of events) {
    const isAssignment = ev.eventType === "assignment";
    const rawStart = new Date(
      isAssignment ? ev.assignmentStartDate || ev.startDate : ev.startDate,
    );
    let rawEnd = new Date(
      isAssignment
        ? ev.assignmentDueDate || ev.endDate || ev.startDate
        : ev.endDate || ev.startDate,
    );

    if (Number.isNaN(rawStart.getTime())) continue;
    if (Number.isNaN(rawEnd.getTime()) || rawEnd.getTime() < rawStart.getTime()) {
      rawEnd = new Date(rawStart.getTime());
    }

    const baseKey = `${ev._id}_${ev.occurrenceDate || ev.startDate}`;

    if (isSameLocalDay(rawStart, rawEnd) || isMidnightNextDay(rawStart, rawEnd)) {
      segments.push({
        segmentKey: `${baseKey}_single`,
        originalEvent: ev,
        segmentRole: "single",
        segmentStart: rawStart,
        segmentEnd: rawEnd,
        anchorTime: rawStart,
        rawStart,
        rawEnd,
        isCrossDay: false,
      });
      continue;
    }

    const endOfStartDay = new Date(
      rawStart.getFullYear(),
      rawStart.getMonth(),
      rawStart.getDate(),
      23,
      59,
      59,
      999,
    );
    const startOfEndDay = new Date(
      rawEnd.getFullYear(),
      rawEnd.getMonth(),
      rawEnd.getDate(),
      0,
      0,
      0,
      0,
    );

    // 1. Lịch con Bắt đầu (mốc ngắn ở ngày bắt đầu)
    segments.push({
      segmentKey: `${baseKey}_start`,
      originalEvent: ev,
      segmentRole: "start",
      segmentStart: rawStart,
      segmentEnd: new Date(
        Math.min(endOfStartDay.getTime(), rawStart.getTime() + slotMs),
      ),
      anchorTime: rawStart,
      rawStart,
      rawEnd,
      isCrossDay: true,
    });

    // 2. Lịch con Kết thúc (mốc ngắn ở ngày kết thúc)
    segments.push({
      segmentKey: `${baseKey}_end`,
      originalEvent: ev,
      segmentRole: "end",
      segmentStart: new Date(
        Math.max(startOfEndDay.getTime(), rawEnd.getTime() - slotMs),
      ),
      segmentEnd: rawEnd,
      anchorTime: rawEnd,
      rawStart,
      rawEnd,
      isCrossDay: true,
    });
  }

  return segments;
};

export const getDaysOfWeek = (current: Date) => {
  const temp = new Date(current);
  const day = temp.getDay();
  const diff = temp.getDate() - day; // Tìm ngày CN
  const startOfWeek = new Date(temp.setDate(diff));

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(startOfWeek.getTime() + i * 24 * 60 * 60 * 1000));
  }
  return days;
};
