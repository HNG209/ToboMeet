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
