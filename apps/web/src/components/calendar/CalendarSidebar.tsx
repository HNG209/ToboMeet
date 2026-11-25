"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  CalendarCheck,
} from "lucide-react";
import {
  CalendarEvent,
  CalendarEventSegment,
  getLocalDateKey,
  isMidnightNextDay,
  isSameLocalDay,
  splitCrossDayEvents,
} from "./types";

interface CalendarSidebarProps {
  locale: string;
  currentDate: Date;
  onSetCurrentDate: (date: Date) => void;
  events: CalendarEvent[];
  onToggleSidebar?: () => void;
}

export default function CalendarSidebar({
  locale,
  currentDate,
  onSetCurrentDate,
  events,
  onToggleSidebar,
}: CalendarSidebarProps) {
  const t = useTranslations("calendar");
  const shortDays = (t.raw("days.short") as string[]) || ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay(); // CN = 0, T2 = 1...

  // Tính toán lấp đầy 42 ô (6 hàng x 7 ngày)
  const cells: Date[] = [];
  const startDate = new Date(
    firstDay.getTime() - startDayOfWeek * 24 * 60 * 60 * 1000,
  );

  for (let i = 0; i < 42; i++) {
    cells.push(new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000));
  }

  const eventSegments = useMemo(() => splitCrossDayEvents(events), [events]);

  const eventDateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const seg of eventSegments) {
      keys.add(getLocalDateKey(seg.segmentStart));
    }
    return keys;
  }, [eventSegments]);

  const todaySegments = useMemo(() => {
    const today = new Date();
    return eventSegments
      .filter((seg) => isSameLocalDay(seg.segmentStart, today))
      .sort((a, b) => a.anchorTime.getTime() - b.anchorTime.getTime());
  }, [eventSegments]);

  const formatSegmentTime = (seg: CalendarEventSegment) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const isAssignment = seg.originalEvent.eventType === "assignment";

    if (seg.segmentRole === "start") {
      return `${t("event_item.segment_start")} ${fmt(seg.anchorTime)}`;
    }
    if (seg.segmentRole === "end") {
      const label = isAssignment
        ? t("event_item.assignment_due")
        : t("event_item.segment_end");
      return `${label} ${fmt(seg.anchorTime)}`;
    }
    if (isMidnightNextDay(seg.rawStart, seg.rawEnd)) {
      return `${fmt(seg.rawStart)} - 24:00`;
    }
    const sStr = fmt(seg.rawStart);
    const eStr = fmt(seg.rawEnd);
    return sStr === eStr ? sStr : `${sStr} - ${eStr}`;
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col gap-4 flex-shrink-0 animate-in slide-in-from-left duration-200 select-none">
      {/* Header bên thanh trái: Bê chữ Lịch xuống cạnh tab chứa lịch thu nhỏ */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shadow-xs">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <span className="text-base font-bold text-slate-800 tracking-tight">
            {t("title", { defaultValue: "Lịch" })}
          </span>
        </div>
      </div>

      {/* Mini Calendar */}
      <div className="border border-slate-200/80 rounded-2xl p-3 bg-slate-50/60 shadow-xs">
        <div className="flex items-center justify-between mb-3.5">
          <span className="text-xs font-bold text-slate-800">
            {currentDate
              .toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US", {
                month: "long",
                year: "numeric",
              })
              .replace(/\u200E/g, "")
              .replace(/^./, (c) => c.toUpperCase())}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const prevMonth = new Date(
                  currentDate.getFullYear(),
                  currentDate.getMonth() - 1,
                  1,
                );
                onSetCurrentDate(prevMonth);
              }}
              className="p-1 hover:bg-slate-200/60 rounded-md text-slate-600 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                const nextMonth = new Date(
                  currentDate.getFullYear(),
                  currentDate.getMonth() + 1,
                  1,
                );
                onSetCurrentDate(nextMonth);
              }}
              className="p-1 hover:bg-slate-200/60 rounded-md text-slate-600 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Grid 7 columns */}
        <div className="grid grid-cols-7 gap-y-1.5 text-center text-[10px] font-bold text-slate-400 mb-2">
          {shortDays.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((cellDate, idx) => {
            const isToday =
              cellDate.toDateString() === new Date().toDateString();
            const isSelected =
              cellDate.toDateString() === currentDate.toDateString();
            const isCurrentMonth = cellDate.getMonth() === currentDate.getMonth();

            // Check if date has events for showing event dot indicator
            const hasEvents = eventDateKeys.has(getLocalDateKey(cellDate));

            return (
              <button
                key={idx}
                onClick={() => onSetCurrentDate(cellDate)}
                className={`aspect-square flex flex-col items-center justify-center rounded-full text-[11px] font-semibold transition-all relative ${
                  isSelected
                    ? "bg-indigo-600 text-white font-bold"
                    : isToday
                      ? "border border-indigo-600 text-indigo-600 font-bold"
                      : isCurrentMonth
                        ? "text-slate-800 hover:bg-slate-200/50"
                        : "text-slate-300 hover:bg-slate-100"
                }`}
              >
                <span>{cellDate.getDate()}</span>
                {hasEvents && (
                  <span
                    className={`absolute bottom-1 w-1 h-1 rounded-full ${
                      isSelected ? "bg-white" : "bg-indigo-500"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Today's Schedule (Lịch hôm nay) ── */}
      <div className="flex-1 flex flex-col min-h-0 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <h3 className="text-xs font-bold text-slate-800 tracking-tight">
              {t("today_schedule.title", { defaultValue: "Lịch hôm nay" })}
            </h3>
          </div>
          {todaySegments.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-600">
              {todaySegments.length}
            </span>
          )}
        </div>

        {todaySegments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-5 px-3 rounded-2xl bg-slate-50/70 border border-dashed border-slate-200/90 text-center">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
              <CalendarCheck className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-xs font-semibold text-slate-600 leading-snug">
              {t("today_schedule.no_events", {
                defaultValue: "Không có sự kiện nào hôm nay",
              })}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {todaySegments.map((seg) => {
              const ev = seg.originalEvent;
              return (
                <div
                  key={seg.segmentKey}
                  onClick={() => onSetCurrentDate(new Date(seg.segmentStart))}
                  className="group p-2.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 hover:border-indigo-300 transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex items-start justify-between gap-1.5 mb-1">
                    <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">
                      {ev.title}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>{formatSegmentTime(seg)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
