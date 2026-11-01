"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  X,
  RefreshCw,
  Calendar,
  Clock,
  ChevronDown,
  AlignLeft,
} from "lucide-react";
import { useUpdateCalendarEventMutation } from "@/lib/redux/api/calendarApi";
import { CalendarEvent } from "./types";
import { toast } from "sonner";

interface EventEditViewProps {
  event: CalendarEvent;
  locale: string;
  onBack: () => void;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EventEditView({
  event,
  locale,
  onBack,
  onClose,
  onSuccess,
}: EventEditViewProps) {
  const t = useTranslations("calendar");
  const [updateCalendarEvent, { isLoading: isUpdating }] =
    useUpdateCalendarEventMutation();

  const [title, setTitle] = useState(event.title || "");
  const [description, setDescription] = useState(event.description || "");
  const [recurrence, setRecurrence] = useState("NONE");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setTitle(event.title || "");
    setDescription(event.description || "");

    let initialRecurrence = "NONE";
    if (event.recurrenceRule) {
      initialRecurrence = event.recurrenceRule.replace(/^FREQ=/, "");
    }
    setRecurrence(initialRecurrence);
  }, [event]);

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(
      date.getDate(),
    )}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg(
        t("detail_modal.title_required", {
          defaultValue: "Vui lòng nhập tiêu đề sự kiện",
        }),
      );
      return;
    }

    try {
      setErrorMsg("");
      const payload: any = {
        title: title.trim(),
        description: description.trim(),
      };

      if (recurrence && recurrence !== "NONE") {
        if (recurrence.includes(";")) {
          const parts = recurrence.split(";");
          const freqPart = parts[0];
          const byDayPart = parts[1] || "";
          payload.recurrenceRule = `FREQ=${freqPart};${byDayPart}`;
        } else {
          payload.recurrenceRule = `FREQ=${recurrence}`;
        }
      } else {
        payload.recurrenceRule = "";
      }

      await updateCalendarEvent({ id: event._id, body: payload }).unwrap();
      toast.success(
        t("toasts.update_success", {
          defaultValue: "Cập nhật sự kiện thành công!",
        }),
      );
      onSuccess?.();
      onBack();
    } catch (err: any) {
      const msg =
        err?.data?.message ||
        err?.message ||
        t("create_modal.error_update", {
          defaultValue: "Không thể cập nhật sự kiện",
        });
      setErrorMsg(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-200">
      {/* Header with Back button and Close button */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-xl hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            title={t("detail_modal.back", {
              defaultValue: "Quay lại",
            })}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="font-bold text-slate-800 text-base leading-tight">
              {t("detail_modal.edit_modal_title", {
                defaultValue: "Chỉnh sửa sự kiện",
              })}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              {t("detail_modal.edit_modal_subtitle", {
                defaultValue: "Cập nhật tiêu đề, chu kỳ lặp lại và mô tả sự kiện",
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Form Body */}
      <form onSubmit={handleUpdate} className="flex-1 flex flex-col min-h-0">
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-xs font-medium border border-red-100">
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Event Time Summary Card */}
          <div className="bg-slate-50/90 border border-slate-200/70 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Calendar className="w-4 h-4 text-brand-600 shrink-0" />
              <span>
                {event.startDate
                  ? new Date(event.startDate).toLocaleDateString(
                      locale === "vi" ? "vi-VN" : "en-US",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      },
                    )
                  : ""}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 pl-6">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {formatDateTime(event.startDate)} - {formatDateTime(event.endDate)}
              </span>
            </div>
          </div>

          {/* Event Title Input */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t("create_modal.title_label", {
                defaultValue: "Tiêu đề sự kiện",
              })}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("create_modal.title_placeholder", {
                defaultValue: "Nhập tiêu đề...",
              })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all font-medium text-slate-800"
            />
          </div>

          {/* Recurrence Rule Dropdown */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t("create_modal.recurrence.label", {
                defaultValue: "Lặp lại",
              })}
            </label>
            <div className="relative">
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white appearance-none transition-all text-slate-700 font-medium"
              >
                <option value="NONE">
                  {t("create_modal.recurrence.none", {
                    defaultValue: "Không lặp lại",
                  })}
                </option>
                <option value="DAILY">
                  {t("create_modal.recurrence.daily", {
                    defaultValue: "Hàng ngày",
                  })}
                </option>
                {(() => {
                  const startStr = event.startDate;
                  if (!startStr) return null;
                  const dateObj = new Date(startStr);
                  if (isNaN(dateObj.getTime())) return null;

                  const daysFull = (t.raw("days.full") as string[]) || [
                    "Chủ nhật",
                    "Thứ hai",
                    "Thứ ba",
                    "Thứ tư",
                    "Thứ năm",
                    "Thứ sáu",
                    "Thứ bảy",
                  ];
                  const dayName = daysFull[dateObj.getDay()];
                  const dayNum = dateObj.getDate();
                  const weekIndex = Math.ceil(dayNum / 7);
                  const weeksOrder = (t.raw("weeks_order") as string[]) || [
                    "đầu tiên",
                    "thứ hai",
                    "thứ ba",
                    "thứ tư",
                    "thứ năm",
                  ];
                  const weekName = weeksOrder[weekIndex - 1] || weeksOrder[0];

                  const rruleDays = [
                    "SU",
                    "MO",
                    "TU",
                    "WE",
                    "TH",
                    "FR",
                    "SA",
                  ];
                  const rruleDay = rruleDays[dateObj.getDay()];

                  const weeklyLabel = t("create_modal.recurrence.weekly_on", {
                    day: dayName,
                    defaultValue: `Hàng tuần vào ${dayName}`,
                  });
                  const monthlyLabel = t(
                    "create_modal.recurrence.monthly_on",
                    {
                      day: dayName,
                      week: weekName,
                      defaultValue: `Hàng tháng vào ${weekName} ${dayName}`,
                    },
                  );
                  const yearlyLabel =
                    locale === "vi"
                      ? t("create_modal.recurrence.yearly_on", {
                          date: `${dayNum} tháng ${dateObj.getMonth() + 1}`,
                          day: String(dayNum),
                          month: String(dateObj.getMonth() + 1),
                          defaultValue: `Hàng năm vào ${dayNum} tháng ${dateObj.getMonth() + 1}`,
                        })
                      : t("create_modal.recurrence.yearly_on", {
                          date: `${dayName}, ${dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
                          day: dayName,
                          month: dateObj.toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                          }),
                          defaultValue: `Annually on ${dayName}`,
                        });
                  const weekdayLabel = t("create_modal.recurrence.weekdays", {
                    defaultValue: "Mọi ngày trong tuần (Thứ 2 - Thứ 6)",
                  });

                  const weeklyVal = `WEEKLY;BYDAY=${rruleDay}`;
                  const monthlyVal = `MONTHLY;BYDAY=${weekIndex}${rruleDay}`;
                  const yearlyVal = `YEARLY`;
                  const weekdayVal = "WEEKLY;BYDAY=MO,TU,WE,TH,FR";

                  const isKnownOption = [
                    "NONE",
                    "DAILY",
                    weeklyVal,
                    monthlyVal,
                    yearlyVal,
                    weekdayVal,
                  ].includes(recurrence);

                  return (
                    <>
                      <option value={weeklyVal}>{weeklyLabel}</option>
                      <option value={monthlyVal}>{monthlyLabel}</option>
                      <option value={yearlyVal}>{yearlyLabel}</option>
                      <option value={weekdayVal}>{weekdayLabel}</option>
                      {!isKnownOption &&
                        recurrence &&
                        recurrence !== "NONE" && (
                          <option value={recurrence}>{recurrence}</option>
                        )}
                    </>
                  );
                })()}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Description Textarea */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <AlignLeft size={13} className="text-slate-400" />
              <span>
                {t("create_modal.description", {
                  defaultValue: "Mô tả sự kiện",
                })}
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("create_modal.description_placeholder", {
                defaultValue: "Thêm ghi chú tóm tắt...",
              })}
              rows={4}
              className="w-full px-3.5 py-2.5 bg-slate-50/60 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-brand-500 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all resize-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onBack}
            disabled={isUpdating}
            className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
          >
            {t("detail_modal.cancel", { defaultValue: "Hủy" })}
          </button>
          <button
            type="submit"
            disabled={isUpdating}
            className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isUpdating && (
              <RefreshCw className="w-4 h-4 animate-spin text-white" />
            )}
            <span>
              {isUpdating
                ? t("detail_modal.saving_changes", {
                    defaultValue: "Đang lưu...",
                  })
                : t("detail_modal.save_changes", {
                    defaultValue: "Lưu thay đổi",
                  })}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
