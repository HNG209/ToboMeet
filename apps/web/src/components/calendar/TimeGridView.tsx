"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Repeat, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import {
  CalendarEvent,
  getDaysOfWeek,
  getEventBgColor,
  getEventIcon,
} from "./types";

interface TimeGridViewProps {
  locale: string;
  currentDate: Date;
  view: "day" | "week" | "workweek";
  filteredEvents: CalendarEvent[];
  highlightedEventId: string | null;
  onSelectEvent: (event: CalendarEvent) => void;
  onCellClick: (date: Date, hour: number) => void;
  onDropEvent: (eventId: string, date: Date, hour: number) => void;
}

interface PositionedCalendarEvent {
  event: CalendarEvent;
  key: string;
  top: number;
  height: number;
  leftPercent: number;
  widthPercent: number;
  startMinutes: number;
  endMinutes: number;
  colIndex: number;
  totalCols: number;
}

const HOUR_HEIGHT = 64; // Độ cao mỗi khung giờ (px) — chuẩn tỉ lệ như Microsoft Teams

/**
 * Thuật toán sắp xếp sự kiện nằm cạnh nhau (Side-by-side Greedy Interval Packing)
 * Tự động gom các lịch trùng/chồng thời gian thành nhóm và chia đều chiều ngang để không đè lên nhau
 */
function computeDayEventLayout(
  events: CalendarEvent[],
  dayDate: Date,
  hourHeight: number,
): { positionedEvents: PositionedCalendarEvent[]; maxCols: number } {
  const startOfDay = new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate(),
    0,
    0,
    0,
    0,
  );
  const endOfDay = new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate(),
    23,
    59,
    59,
    999,
  );

  // 1. Lọc các sự kiện diễn ra trong ngày này và tính số phút bắt đầu/kết thúc
  const items = events
    .map((ev) => {
      const isAssignment = ev.eventType === "assignment";
      const rawStart = new Date(
        isAssignment ? ev.assignmentStartDate || ev.startDate : ev.startDate,
      );
      const rawEnd = new Date(
        isAssignment
          ? ev.assignmentDueDate || ev.endDate || ev.startDate
          : ev.endDate,
      );

      // Kiểm tra sự kiện có giao với ngày đang xét không
      if (rawEnd < startOfDay || rawStart > endOfDay) return null;

      let startMinutes = 0;
      if (rawStart >= startOfDay) {
        startMinutes = rawStart.getHours() * 60 + rawStart.getMinutes();
      }

      let endMinutes = 24 * 60;
      if (rawEnd <= endOfDay) {
        endMinutes = rawEnd.getHours() * 60 + rawEnd.getMinutes();
      }

      // Đảm bảo độ dài tối thiểu 28 phút để hiển thị rõ tiêu đề và nhãn
      if (endMinutes <= startMinutes) {
        endMinutes = Math.min(24 * 60, startMinutes + 30);
      } else if (endMinutes - startMinutes < 25) {
        endMinutes = Math.min(24 * 60, startMinutes + 28);
      }

      return {
        event: ev,
        key: `${ev._id}_${ev.occurrenceDate || ev.startDate}`,
        startMinutes,
        endMinutes,
        colIndex: 0,
        totalCols: 1,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (items.length === 0) return { positionedEvents: [], maxCols: 1 };

  // 2. Sắp xếp: thời gian bắt đầu tăng dần, nếu bằng nhau thì sự kiện dài hơn xếp trước
  items.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) {
      return a.startMinutes - b.startMinutes;
    }
    return b.endMinutes - a.endMinutes;
  });

  // 3. Phân cụm các sự kiện có khoảng thời gian trùng nhau (Overlapping Clusters)
  const clusters: (typeof items)[] = [];
  let currentCluster: typeof items = [];
  let currentClusterMaxEnd = 0;

  for (const item of items) {
    if (currentCluster.length === 0) {
      currentCluster.push(item);
      currentClusterMaxEnd = item.endMinutes;
    } else {
      if (item.startMinutes < currentClusterMaxEnd) {
        // Trùng thời gian với cụm hiện tại
        currentCluster.push(item);
        currentClusterMaxEnd = Math.max(currentClusterMaxEnd, item.endMinutes);
      } else {
        // Cụm mới
        clusters.push(currentCluster);
        currentCluster = [item];
        currentClusterMaxEnd = item.endMinutes;
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // 4. Chia cột trong từng cụm để các lịch nằm cạnh nhau (Side-by-side)
  const result: PositionedCalendarEvent[] = [];

  for (const cluster of clusters) {
    const columns: (typeof items)[] = [];

    for (const item of cluster) {
      let placedCol = -1;
      for (let i = 0; i < columns.length; i++) {
        const lastInCol = columns[i][columns[i].length - 1];
        if (lastInCol.endMinutes <= item.startMinutes) {
          placedCol = i;
          break;
        }
      }

      if (placedCol === -1) {
        placedCol = columns.length;
        columns.push([item]);
      } else {
        columns[placedCol].push(item);
      }

      item.colIndex = placedCol;
    }

    const totalCols = columns.length;
    for (const item of cluster) {
      item.totalCols = totalCols;
      const top = (item.startMinutes / 60) * hourHeight;
      const height = Math.max(
        26,
        ((item.endMinutes - item.startMinutes) / 60) * hourHeight,
      );
      const widthPercent = 100 / totalCols;
      const leftPercent = item.colIndex * widthPercent;

      result.push({
        event: item.event,
        key: item.key,
        top,
        height,
        leftPercent,
        widthPercent,
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        colIndex: item.colIndex,
        totalCols: item.totalCols,
      });
    }
  }

  const maxCols =
    result.length > 0 ? Math.max(1, ...result.map((r) => r.totalCols)) : 1;

  return { positionedEvents: result, maxCols };
}

export default function TimeGridView({
  locale,
  currentDate,
  view,
  filteredEvents,
  highlightedEventId,
  onSelectEvent,
  onCellClick,
  onDropEvent,
}: TimeGridViewProps) {
  const t = useTranslations("calendar");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [scrollLeft, setScrollLeft] = useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = useState(0);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  const daysOfWeek = getDaysOfWeek(currentDate);

  // Lọc theo chế độ làm việc (Work Week ẩn thứ 7 và CN)
  const displayedDays = daysOfWeek.filter((d) => {
    if (view === "workweek") {
      return d.getDay() !== 0 && d.getDay() !== 6;
    }
    if (view === "day") {
      return d.toDateString() === currentDate.toDateString();
    }
    return true;
  });

  // Hỗ trợ đầy đủ 24 khung giờ từ 0 đến 23
  const hoursRange = Array.from({ length: 24 }, (_, i) => i);

  // Tính toán layout trước cho từng ngày để xác định độ rộng cột thoải mái
  const dayLayouts = useMemo(() => {
    return displayedDays.map((dayDate) =>
      computeDayEventLayout(filteredEvents, dayDate, HOUR_HEIGHT),
    );
  }, [displayedDays, filteredEvents]);

  // Chiều rộng tối thiểu mỗi cột sự kiện để hiển thị trọn vẹn giờ và tiêu đề thoải mái
  const MIN_COL_WIDTH = 175;
  const BASE_DAY_WIDTH = view === "day" ? 500 : 160;

  const dayColWidths = useMemo(() => {
    return dayLayouts.map(({ maxCols }) => {
      return Math.max(BASE_DAY_WIDTH, maxCols * MIN_COL_WIDTH);
    });
  }, [dayLayouts, view, BASE_DAY_WIDTH]);

  const TIME_AXIS_WIDTH = 76; // px
  const totalGridMinWidth = useMemo(() => {
    return (
      TIME_AXIS_WIDTH +
      dayColWidths.reduce((sum, w) => sum + w, 0)
    );
  }, [dayColWidths]);

  // Cập nhật mốc giờ hiện tại mỗi phút một lần
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Đo lường độ tràn ngang và thiết lập trạng thái cho thanh slider
  const updateScrollMetrics = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft: sLeft, scrollWidth, clientWidth } =
      scrollContainerRef.current;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    setScrollLeft(sLeft);
    setMaxScrollLeft(maxScroll);
    setHasHorizontalOverflow(maxScroll > 10);
  };

  useEffect(() => {
    updateScrollMetrics();
    const el = scrollContainerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(() => {
      updateScrollMetrics();
    });
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [displayedDays, filteredEvents, view, totalGridMinWidth]);

  // Tự động cuộn đến khung giờ hiện tại (hoặc 8:00 AM) khi mở/đổi view như Teams
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const nowHour = new Date().getHours();
    const targetHour = Math.max(0, Math.min(23, nowHour - 1));
    scrollContainerRef.current.scrollTo({
      top: targetHour * HOUR_HEIGHT,
      behavior: "smooth",
    });
  }, [view, currentDate]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const sLeft = scrollContainerRef.current.scrollLeft;
    const maxScroll = Math.max(
      0,
      scrollContainerRef.current.scrollWidth -
      scrollContainerRef.current.clientWidth,
    );
    setScrollLeft(sLeft);
    setMaxScrollLeft(maxScroll);
    setHasHorizontalOverflow(maxScroll > 10);
  };

  const handleSliderChange = (newVal: number) => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollLeft = newVal;
    setScrollLeft(newVal);
  };

  const handleScrollStep = (delta: number) => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

  const formatHourLabel = (hour: number) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (locale === "vi") {
      return `${pad(hour)}:00`;
    }
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  const formatEventTime = (startDate: string, endDate: string) => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(s.getHours())}:${pad(s.getMinutes())} - ${pad(e.getHours())}:${pad(e.getMinutes())}`;
  };

  const handleDragStart = (e: React.DragEvent, eventId: string) => {
    e.dataTransfer.setData("text/plain", eventId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnCell = (
    e: React.DragEvent,
    dayDate: Date,
    hour: number,
  ) => {
    e.preventDefault();
    const eventId = e.dataTransfer.getData("text/plain");
    if (eventId) {
      onDropEvent(eventId, dayDate, hour);
    }
  };

  const currentMinutesTop =
    ((currentTime.getHours() * 60 + currentTime.getMinutes()) / 60) *
    HOUR_HEIGHT;

  return (
    <div className="w-full h-full flex flex-col bg-white overflow-hidden border-t border-slate-200 select-none">
      {/* ── Scrollable Time Grid Container ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-auto relative custom-horizontal-scrollbar"
      >
        <div
          style={{ minWidth: `${Math.max(800, totalGridMinWidth)}px` }}
          className="flex flex-col relative w-full"
        >
          {/* ── Grid Header: Hàng tiêu đề ngày cố định ở trên cùng khi cuộn xuống ── */}
          <div className="flex border-b border-slate-200 h-14 bg-white sticky top-0 z-30 shadow-xs shrink-0">
            {/* Hộp múi giờ góc trên bên trái cố định khi cuộn ngang và dọc */}
            <div className="w-16 sm:w-20 text-center text-[11px] font-bold text-slate-400 border-r border-slate-200 bg-white sticky left-0 top-0 z-40 h-full flex items-center justify-center shrink-0">
              GMT+07
            </div>

            {/* Các cột ngày trên thanh tiêu đề đồng bộ độ rộng và khả năng giãn nở */}
            <div className="flex-1 flex min-w-0">
              {displayedDays.map((date, idx) => {
                const isToday =
                  date.toDateString() === new Date().toDateString();
                const maxCols = dayLayouts[idx]?.maxCols || 1;
                const minColWidth = dayColWidths[idx];

                return (
                  <div
                    key={idx}
                    style={{
                      flex: `${maxCols} 0 auto`,
                      minWidth: `${minColWidth}px`,
                    }}
                    className="text-center flex flex-col justify-center items-center h-full border-r border-slate-100 last:border-0 bg-white"
                  >
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {date.toLocaleDateString(
                        locale === "vi" ? "vi-VN" : "en-US",
                        {
                          weekday: "short",
                        },
                      )}
                    </span>
                    <span
                      className={`text-sm font-extrabold mt-0.5 w-6 h-6 flex items-center justify-center rounded-full transition-transform ${isToday
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-800"
                        }`}
                    >
                      {date.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Grid Body: Trục thời gian 24 giờ trượt dài xuống như Teams ── */}
          <div
            className="flex relative"
            style={{ height: `${24 * HOUR_HEIGHT}px` }}
          >
            {/* Cột nhãn thời gian bên trái (Sticky bên trái khi cuộn ngang) */}
            <div className="w-16 sm:w-20 shrink-0 border-r border-slate-200 bg-white sticky left-0 z-20 select-none">
              {hoursRange.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="relative flex items-start justify-end pr-2.5 pt-1 text-[11px] font-bold text-slate-400"
                >
                  <span className="-translate-y-2.5">
                    {hour === 0 ? "" : formatHourLabel(hour)}
                  </span>
                </div>
              ))}
            </div>

            {/* Các cột ngày chứa các ô giờ và sự kiện */}
            <div className="flex-1 flex min-w-0 relative">
              {displayedDays.map((dayDate, colIdx) => {
                const isToday =
                  dayDate.toDateString() === new Date().toDateString();
                const { positionedEvents, maxCols } = dayLayouts[colIdx];
                const minColWidth = dayColWidths[colIdx];

                return (
                  <div
                    key={colIdx}
                    style={{
                      flex: `${maxCols} 0 auto`,
                      minWidth: `${minColWidth}px`,
                    }}
                    className="border-r border-slate-100 last:border-0 relative"
                  >
                    {/* Các ô giờ nền: nhấp chuột tạo lịch hoặc kéo thả */}
                    {hoursRange.map((hour) => (
                      <div
                        key={hour}
                        style={{ height: `${HOUR_HEIGHT}px` }}
                        onClick={() => onCellClick(dayDate, hour)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnCell(e, dayDate, hour)}
                        className="border-b border-slate-100/80 hover:bg-indigo-50/25 transition-colors cursor-pointer group relative"
                      >
                        {/* Đường kẻ mờ chia nửa giờ (30 phút) như Teams */}
                        <div className="absolute top-1/2 left-0 right-0 border-b border-slate-50 border-dashed pointer-events-none" />
                      </div>
                    ))}

                    {/* Vạch đỏ/hồng biểu thị thời gian hiện tại nếu là hôm nay */}
                    {isToday && (
                      <div
                        className="absolute left-0 right-0 z-25 pointer-events-none flex items-center"
                        style={{ top: `${currentMinutesTop}px` }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 -ml-1.5 ring-2 ring-white shadow-xs shrink-0" />
                        <div className="flex-1 h-[2px] bg-rose-500 shadow-xs" />
                      </div>
                    )}

                    {/* Lớp chứa các sự kiện được xếp nằm cạnh nhau (Side-by-side, giãn cách thoải mái không chèn nhau) */}
                    <div className="absolute inset-0 pointer-events-none">
                      {positionedEvents.map((item) => {
                        const {
                          event,
                          top,
                          height,
                          leftPercent,
                          widthPercent,
                          key,
                        } = item;
                        const isHighlighted =
                          highlightedEventId === event._id;
                        const isAssignment = event.eventType === "assignment";

                        return (
                          <div
                            key={key}
                            style={{
                              position: "absolute",
                              top: `${top}px`,
                              height: `${height}px`,
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                            }}
                            className="pointer-events-auto px-1 py-0.5 select-none"
                          >
                            <div
                              draggable
                              onDragStart={(e) =>
                                handleDragStart(e, event._id)
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectEvent(event);
                              }}
                              title={`${event.title} (${formatEventTime(event.startDate, event.endDate)})`}
                              className={`w-full h-full px-2.5 py-1.5 rounded-xl border border-l-4 ${getEventBgColor(
                                event.roomType,
                                event.status,
                                event.eventType,
                                event.assignmentStatus,
                              )} transition-all cursor-pointer overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md hover:scale-[1.01] ${isHighlighted
                                ? "ring-2 ring-indigo-500 ring-offset-1 scale-[1.02] z-20 shadow-lg animate-pulse"
                                : ""
                                }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="shrink-0 text-slate-600">
                                  {getEventIcon(
                                    event.roomType,
                                    event.eventType,
                                  )}
                                </div>
                                <h4 className="font-bold text-xs leading-tight truncate text-left flex-1 min-w-0 text-slate-800">
                                  {isAssignment
                                    ? `${t("event_item.assignment_tag")} ${event.title}`
                                    : event.title}
                                </h4>
                                {isAssignment && event.assignmentStatus && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/80 shrink-0">
                                    {t(
                                      `event_item.assignment_status.${event.assignmentStatus}`,
                                    )}
                                  </span>
                                )}
                              </div>

                              {/* Hiển thị thời gian và biểu tượng lặp đầy đủ, rõ ràng */}
                              {height < 34 ? (
                                <div className="flex items-center justify-between text-[10px] text-slate-600 font-semibold min-w-0 mt-0.5">
                                  <span className="truncate">
                                    {formatEventTime(
                                      event.startDate,
                                      event.endDate,
                                    )}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium mt-0.5 min-w-0">
                                  <span className="truncate font-semibold text-slate-600">
                                    {formatEventTime(
                                      event.startDate,
                                      event.endDate,
                                    )}
                                  </span>
                                  {(event.recurrenceRule ||
                                    event.isRecurring) && (
                                      <span className="flex items-center gap-0.5 text-indigo-600 font-semibold text-[9px] shrink-0 ml-1">
                                        <Repeat className="w-2.5 h-2.5" />
                                        <span>
                                          {t("event_item.recur_badge")}
                                        </span>
                                      </span>
                                    )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Horizontal Scroll Slider Bar (Hiện thanh trượt khi có quá nhiều lịch chèn nhau gây tràn ngang) ── */}
      {hasHorizontalOverflow && (
        <div className="border-t border-slate-200 bg-slate-50/95 backdrop-blur-xs px-4 py-2 flex items-center justify-between gap-4 z-40 shrink-0 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
          </div>

          <div className="flex-1 flex items-center gap-2 max-w-md mx-auto">
            <button
              type="button"
              onClick={() => handleScrollStep(-250)}
              className="p-1 rounded-lg hover:bg-slate-200/70 text-slate-600 transition-colors cursor-pointer"
              title={locale === "vi" ? "Cuộn sang trái" : "Scroll left"}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <input
              type="range"
              min={0}
              max={maxScrollLeft}
              value={scrollLeft}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />

            <button
              type="button"
              onClick={() => handleScrollStep(250)}
              className="p-1 rounded-lg hover:bg-slate-200/70 text-slate-600 transition-colors cursor-pointer"
              title={locale === "vi" ? "Cuộn sang phải" : "Scroll right"}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="text-[11px] text-slate-400 font-medium shrink-0 hidden sm:block">
            {locale === "vi"
              ? "Kéo thanh trượt để xem toàn bộ lịch"
              : "Drag slider to view all schedules"}
          </div>
        </div>
      )}
    </div>
  );
}
