"use client";

import { useTranslations } from "next-intl";
import { CalendarEvent, getEventBgColor } from "./types";

interface MonthViewProps {
  locale: string;
  currentDate: Date;
  filteredEvents: CalendarEvent[];
  onSelectDate: (date: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}

export default function MonthView({
  locale,
  currentDate,
  filteredEvents,
  onSelectDate,
  onSelectEvent,
}: MonthViewProps) {
  const t = useTranslations("calendar");
  const monthGridDays = (t.raw("days.month_grid") as string[]) || [
    "SUN",
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
  ];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay();
  const monthDays: Date[] = [];
  const startOfGrid = new Date(
    firstDayOfMonth.getTime() - startDayOfWeek * 24 * 60 * 60 * 1000,
  );

  for (let i = 0; i < 42; i++) {
    monthDays.push(new Date(startOfGrid.getTime() + i * 24 * 60 * 60 * 1000));
  }

  return (
    <div className="bg-white border-t border-slate-200 flex flex-col h-full flex-1">
      {/* Month Grid Header — Cố định khi cuộn xuống */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/95 backdrop-blur-xs h-10 items-center text-center text-xs font-bold text-slate-500 sticky top-0 z-30 shadow-xs">
        {monthGridDays.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Month Grid Cells */}
      <div className="grid grid-cols-7 grid-rows-6 flex-1 divide-x divide-y divide-slate-100">
        {monthDays.map((cellDate, idx) => {
          const isToday =
            cellDate.toDateString() === new Date().toDateString();
          const isSelected =
            cellDate.toDateString() === currentDate.toDateString();
          const isCurrentMonth = cellDate.getMonth() === currentDate.getMonth();

          const dayEvents = filteredEvents.filter(
            (ev) =>
              new Date(ev.startDate).toDateString() === cellDate.toDateString(),
          );

          return (
            <div
              key={idx}
              onClick={() => onSelectDate(cellDate)}
              className={`p-2 flex flex-col justify-between hover:bg-slate-50/50 transition-colors cursor-pointer min-h-[90px] ${
                isCurrentMonth
                  ? "bg-white"
                  : "bg-slate-50/20 text-slate-400"
              } ${isSelected ? "ring-2 ring-indigo-500/20" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday
                      ? "bg-indigo-600 text-white font-extrabold"
                      : isCurrentMonth
                        ? "text-slate-800"
                        : "text-slate-300"
                  }`}
                >
                  {cellDate.getDate() === 1
                    ? cellDate.toLocaleDateString(
                        locale === "vi" ? "vi-VN" : "en-US",
                        { month: "short", day: "numeric" },
                      )
                    : cellDate.getDate()}
                </span>
              </div>

              {/* Mini events list inside Month Cell */}
              <div className="flex-1 mt-1 overflow-y-auto space-y-1 max-h-[85px] pr-0.5">
                {dayEvents.map((ev) => (
                  <div
                    key={`${ev._id}_${ev.occurrenceDate || ev.startDate}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(ev);
                    }}
                    className={`px-1.5 py-0.5 text-[9px] font-semibold border-l-2 rounded-sm truncate ${getEventBgColor(
                      ev.roomType,
                      ev.status,
                      ev.eventType,
                      ev.assignmentStatus,
                    )} transition-transform hover:scale-[1.02] cursor-pointer`}
                  >
                    {ev.eventType === "assignment"
                      ? `${t("event_item.assignment_tag")} ${ev.title}`
                      : ev.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
