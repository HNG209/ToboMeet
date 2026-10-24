"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { CalendarEvent } from "./types";

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
            const hasEvents = events.some(
              (ev) =>
                new Date(ev.startDate).toDateString() === cellDate.toDateString(),
            );

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
    </aside>
  );
}
