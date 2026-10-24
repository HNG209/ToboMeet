"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarX, CalendarRange, Check } from "lucide-react";

interface DeleteEventConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (deleteType: "single" | "all") => void;
  isRecurring?: boolean;
  occurrenceDate?: string;
  locale: string;
  isLoading?: boolean;
}

export default function DeleteEventConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isRecurring = false,
  occurrenceDate,
  locale,
  isLoading = false,
}: DeleteEventConfirmModalProps) {
  const t = useTranslations("calendar");
  const [selectedOption, setSelectedOption] = useState<"single" | "all">("single");

  useEffect(() => {
    if (isOpen) {
      setSelectedOption("single");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatOccurrenceDate = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      if (isNaN(date.getTime())) return dateStr;
      const daysFull = (t.raw("days.full") as string[]) || [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ];
      const dayOfWeek = daysFull[date.getDay()];
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${dayOfWeek}, ${pad(day)}/${pad(month)}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const formattedDate = formatOccurrenceDate(occurrenceDate);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header Icon + Title */}
        <div className="flex items-center gap-3.5 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            {isRecurring ? (
              <CalendarX className="w-5 h-5 text-rose-600" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg leading-tight">
              {isRecurring
                ? t("delete_modal.recurring_title")
                : t("delete_modal.single_title")}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {isRecurring
                ? t("delete_modal.recurring_subtitle")
                : t("delete_modal.single_subtitle")}
            </p>
          </div>
        </div>

        {isRecurring ? (
          <div className="space-y-3 my-5">
            <p className="text-xs text-slate-600 leading-relaxed">
              {t("delete_modal.recurring_prompt")}
            </p>

            {/* Radio Options */}
            <div className="space-y-2.5 pt-1">
              {/* Option 1: Single */}
              <label
                onClick={() => setSelectedOption("single")}
                className={`flex items-start gap-3.5 p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${selectedOption === "single"
                  ? "border-rose-500 bg-rose-50/40 text-slate-900 shadow-sm"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 text-slate-700"
                  }`}
              >
                <div className="pt-0.5 shrink-0">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${selectedOption === "single"
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-slate-300 bg-white"
                      }`}
                  >
                    {selectedOption === "single" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-800">
                      {t("delete_modal.single_option_title")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {formattedDate
                      ? t("delete_modal.single_option_desc_with_date", {
                        date: formattedDate,
                      })
                      : t("delete_modal.single_option_desc")}
                  </p>
                </div>
              </label>

              {/* Option 2: All */}
              <label
                onClick={() => setSelectedOption("all")}
                className={`flex items-start gap-3.5 p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${selectedOption === "all"
                  ? "border-rose-500 bg-rose-50/40 text-slate-900 shadow-sm"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 text-slate-700"
                  }`}
              >
                <div className="pt-0.5 shrink-0">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${selectedOption === "all"
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-slate-300 bg-white"
                      }`}
                  >
                    {selectedOption === "all" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-800">
                      {t("delete_modal.all_option_title")}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {t("delete_modal.all_option_desc")}
                  </p>
                </div>
              </label>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 my-6 leading-relaxed">
            {t("delete_modal.single_prompt")}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {t("delete_modal.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(isRecurring ? selectedOption : "all")}
            disabled={isLoading}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>{t("delete_modal.confirm")}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
