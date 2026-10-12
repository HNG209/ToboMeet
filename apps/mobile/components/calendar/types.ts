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
