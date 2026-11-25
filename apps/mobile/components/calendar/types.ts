export interface CalendarEvent {
  _id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  meetingCode?: string;
  roomId?: string;
  channelId?: string;
  channelIds?: string[];
  roomType?: string;
  invitees?: { email: string; displayName?: string; userId?: string; status?: string; isHost?: boolean; avatarUrl?: string }[];
  recurrenceRule?: string;
  isRecurring?: boolean;
  occurrenceDate?: string;
  isOccurrence?: boolean;
  recurrenceExceptions?: string[];
  hostId?: string;
  hostDisplayName?: string;
  hostEmail?: string;
  hostAvatarUrl?: string;
  acceptedUserIds?: string[];
  pendingUserIds?: string[];
  declinedUserIds?: string[];
  notificationsEnabledUserIds?: string[];
  // Assignment specific fields
  eventType?: "meeting" | "assignment";
  assignmentId?: string;
  assignmentStartDate?: string;
  assignmentDueDate?: string;
  assignmentStatus?: "in_progress" | "submitted" | "graded" | "overdue" | "closed";
  // Pre-fetched fields — populated before opening detail modal
  _prefetchedInvitees?: { email: string; displayName?: string; userId?: string; status?: string; isHost?: boolean; avatarUrl?: string }[];
  _currentUserId?: string | null;
}

export const HOUR_HEIGHT = 60;
export const TIME_AXIS_WIDTH = 50;

export const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
};

export const getWeekDates = (d: Date) => {
  const monday = getMonday(d);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return day;
  });
};

export const generateMonthDays = (d: Date) => {
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - startOffset);

  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(startDate));
    startDate.setDate(startDate.getDate() + 1);
  }
  return days;
};

export const getDateBounds = (mode: "DAY" | "WEEK" | "MONTH", date: Date) => {
  let start: string;
  let end: string;
  if (mode === "DAY") {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    start = d.toISOString();
    const e = new Date(d);
    e.setDate(d.getDate() + 1);
    e.setHours(23, 59, 59, 999);
    end = e.toISOString();
  } else if (mode === "WEEK") {
    const monday = getMonday(date);
    monday.setHours(0, 0, 0, 0);
    start = monday.toISOString();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7);
    sunday.setHours(23, 59, 59, 999);
    end = sunday.toISOString();
  } else {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    firstDay.setHours(0, 0, 0, 0);
    start = firstDay.toISOString();
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 59, 999);
    end = lastDay.toISOString();
  }
  return { start, end };
};

export const getEventColors = (event: CalendarEvent) => {
  if (event.eventType === "assignment") {
    switch (event.assignmentStatus) {
      case "submitted":
      case "graded":
        return { bg: "#ECFDF5", border: "#10B981", text: "#065F46" };
      case "overdue":
        return { bg: "#FFF1F2", border: "#F43F5E", text: "#9F1239" };
      case "closed":
        return { bg: "#F8FAFC", border: "#64748B", text: "#334155" };
      default: // in_progress
        return { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8" };
    }
  }
  return {
    bg: event.roomType === "channel_meeting" ? "#F0FDF4" : "#EFF6FF",
    border: event.roomType === "channel_meeting" ? "#10B981" : "#0052FF",
    text: event.roomType === "channel_meeting" ? "#065F46" : "#1E40AF",
  };
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

    // 1. Lịch con Bắt đầu
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

    // 2. Lịch con Kết thúc
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

export const getSegmentLayout = (segment: CalendarEventSegment) => {
  let startMinutes =
    segment.segmentStart.getHours() * 60 + segment.segmentStart.getMinutes();
  let endMinutes = isSameLocalDay(segment.segmentStart, segment.segmentEnd)
    ? segment.segmentEnd.getHours() * 60 + segment.segmentEnd.getMinutes()
    : 24 * 60;

  if (endMinutes <= startMinutes) {
    if (segment.segmentRole === "end" && startMinutes >= 24 * 60 - 30) {
      endMinutes = 24 * 60;
      startMinutes = 24 * 60 - 30;
    } else {
      endMinutes = Math.min(24 * 60, startMinutes + 35);
      if (endMinutes - startMinutes < 35) {
        startMinutes = Math.max(0, endMinutes - 35);
      }
    }
  } else if (endMinutes - startMinutes < 35) {
    if (segment.segmentRole === "end") {
      if (endMinutes < 35) {
        startMinutes = 0;
        endMinutes = 35;
      } else {
        startMinutes = Math.max(0, endMinutes - 35);
      }
    } else {
      endMinutes = Math.min(24 * 60, startMinutes + 35);
      if (endMinutes - startMinutes < 35) {
        startMinutes = Math.max(0, endMinutes - 35);
      }
    }
  }

  const top = (startMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max(36, ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT);

  return { top, height, startMinutes, endMinutes };
};

export const getEventLayout = (event: CalendarEvent) => {
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);

  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;

  const clampedStart = Math.max(1, Math.min(23, startHour));

  if (event.eventType === "assignment") {
    const top = (clampedStart - 1) * HOUR_HEIGHT;
    const height = 36;
    return { top, height };
  }

  const clampedEnd = Math.max(1, Math.min(23.99, endHour));
  const top = (clampedStart - 1) * HOUR_HEIGHT;
  const height = Math.max(30, (clampedEnd - clampedStart) * HOUR_HEIGHT);

  return { top, height };
};
