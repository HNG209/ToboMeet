"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Users2,
  PanelLeftClose,
  PanelLeft,
  Check,
} from "lucide-react";
import { CalendarViewType } from "./types";

interface CalendarToolbarProps {
  locale: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentDate: Date;
  onSetCurrentDate: (date: Date) => void;
  view: CalendarViewType;
  onSetView: (view: CalendarViewType) => void;
  onOpenCreateEventModal: () => void;
  onOpenChannelMeetingModal: () => void;
}

export default function CalendarToolbar({
  locale,
  sidebarOpen,
  onToggleSidebar,
  currentDate,
  onSetCurrentDate,
  view,
  onSetView,
  onOpenCreateEventModal,
  onOpenChannelMeetingModal,
}: CalendarToolbarProps) {
  const t = useTranslations("calendar");
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);
  const [showViewDropdown, setShowViewDropdown] = useState(false);

  const viewOptions: { value: CalendarViewType; label: string }[] = [
    { value: "day", label: t("views.day", { defaultValue: "Ngày" }) },
    { value: "week", label: t("views.week", { defaultValue: "Tuần" }) },
    { value: "month", label: t("views.month", { defaultValue: "Tháng" }) },
    { value: "agenda", label: t("views.year", { defaultValue: "Năm" }) },
  ];

  const currentViewLabel =
    viewOptions.find((opt) => opt.value === view)?.label ||
    t("views.week", { defaultValue: "Tuần" });

  const monthYearDisplay = currentDate
    .toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US", {
      month: "long",
      year: "numeric",
    })
    .replace(/\u200E/g, "")
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="h-14 bg-white border-b border-slate-200/80 px-4 flex items-center justify-between shrink-0 select-none z-40 relative">
      {/* LEFT: Toggle Sidebar button (luôn hiển thị đồng bộ) + Cụm điều hướng Hôm nay / Prev / Next + Tháng Năm */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
          title={sidebarOpen ? "Thu gọn thanh bên" : "Mở thanh bên lịch"}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-5 h-5" />
          ) : (
            <PanelLeft className="w-5 h-5" />
          )}
        </button>

        {/* Cụm điều hướng */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-xl border border-slate-200/60">
          <button
            onClick={() => onSetCurrentDate(new Date())}
            className="px-2.5 sm:px-3 py-1 bg-white hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-bold transition-all shadow-xs"
          >
            {t("today", { defaultValue: "Hôm nay" })}
          </button>
          <div className="w-[1px] h-3.5 bg-slate-300 mx-0.5" />
          <button
            onClick={() => {
              const temp = new Date(currentDate);
              if (view === "month") temp.setMonth(temp.getMonth() - 1);
              else if (view === "agenda") temp.setFullYear(temp.getFullYear() - 1);
              else temp.setDate(temp.getDate() - 7);
              onSetCurrentDate(temp);
            }}
            className="p-1 hover:bg-white rounded-lg text-slate-600 transition-all"
            title="Trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const temp = new Date(currentDate);
              if (view === "month") temp.setMonth(temp.getMonth() + 1);
              else if (view === "agenda") temp.setFullYear(temp.getFullYear() + 1);
              else temp.setDate(temp.getDate() + 7);
              onSetCurrentDate(temp);
            }}
            className="p-1 hover:bg-white rounded-lg text-slate-600 transition-all"
            title="Sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Tiêu đề Tháng / Năm */}
        <h2 className="text-sm md:text-base font-bold text-slate-900 tracking-tight whitespace-nowrap">
          {monthYearDisplay}
        </h2>
      </div>

      {/* RIGHT: Input Select Chọn View (Ngày, Tuần, Tháng, Năm) + Cụm nút Tạo Lịch dropdown */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowViewDropdown(!showViewDropdown)}
            className="inline-flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 hover:border-slate-300 rounded-xl px-3 sm:px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 cursor-pointer transition-all active:scale-[0.98]"
            aria-label="Chọn chế độ xem lịch"
          >
            <span>{currentViewLabel}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                showViewDropdown ? "rotate-180 text-brand-500" : ""
              }`}
            />
          </button>

          {showViewDropdown && (
            <>
              <div
                className="fixed inset-0 z-[60]"
                onClick={() => setShowViewDropdown(false)}
              />
              <div className="absolute right-0 sm:left-0 sm:right-auto top-full mt-2 w-36 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-slate-100 p-1.5 z-[70] animate-in fade-in zoom-in-95 duration-150">
                {viewOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onSetView(opt.value);
                      setShowViewDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-all ${
                      view === opt.value
                        ? "bg-brand-50 text-brand-600 font-bold"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {view === opt.value && (
                      <Check className="w-3.5 h-3.5 text-brand-600" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowCreateDropdown(!showCreateDropdown)}
            className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-sm shadow-brand-500/20 active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">{t("create.button", { defaultValue: "Tạo lịch" })}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
          </button>

        {showCreateDropdown && (
          <>
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setShowCreateDropdown(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-slate-100 py-1.5 z-[70] animate-in fade-in zoom-in-95 duration-150">
              {/* Option 1: Sự kiện */}
              <button
                onClick={() => {
                  setShowCreateDropdown(false);
                  onOpenCreateEventModal();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-xl text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <CalendarDays className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">{t("create.event", { defaultValue: "Sự kiện mới" })}</p>
                  <p className="text-[10px] text-slate-400 font-normal">
                    {t("create.event_desc", { defaultValue: "Tạo sự kiện hoặc cuộc hẹn cá nhân" })}
                  </p>
                </div>
              </button>

              <div className="h-px bg-slate-100 my-1 mx-3" />

              {/* Option 2: Cuộc họp kênh */}
              <button
                onClick={() => {
                  setShowCreateDropdown(false);
                  onOpenChannelMeetingModal();
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors rounded-xl text-left"
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <Users2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">{t("create.channel_meeting", { defaultValue: "Cuộc họp kênh" })}</p>
                  <p className="text-[10px] text-slate-400 font-normal">
                    {t("create.channel_meeting_desc", { defaultValue: "Lên lịch họp cho nhóm hoặc kênh" })}
                  </p>
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  </div>
  );
}
