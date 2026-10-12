"use client";

import { useTranslations } from "next-intl";
import { Bell, BellOff } from "lucide-react";

interface ToggleNotificationConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isCurrentlyEnabled: boolean;
  eventTitle: string;
  isLoading?: boolean;
}

export default function ToggleNotificationConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isCurrentlyEnabled,
  eventTitle,
  isLoading = false,
}: ToggleNotificationConfirmModalProps) {
  const t = useTranslations("calendar");

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header Icon + Title */}
        <div className="flex items-center gap-3.5 mb-3">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
              isCurrentlyEnabled
                ? "bg-amber-50 text-amber-600 border-amber-100"
                : "bg-indigo-50 text-indigo-600 border-indigo-100"
            }`}
          >
            {isCurrentlyEnabled ? (
              <BellOff className="w-5 h-5 text-amber-600" />
            ) : (
              <Bell className="w-5 h-5 text-indigo-600" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg leading-tight">
              {isCurrentlyEnabled
                ? t("notification_modal.turn_off_title")
                : t("notification_modal.turn_on_title")}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {isCurrentlyEnabled
                ? t("notification_modal.turn_off_subtitle")
                : t("notification_modal.turn_on_subtitle")}
            </p>
          </div>
        </div>

        {/* Prompt content */}
        <p className="text-sm text-slate-500 my-6 leading-relaxed">
          {isCurrentlyEnabled
            ? t("notification_modal.turn_off_prompt", { title: eventTitle })
            : t("notification_modal.turn_on_prompt", { title: eventTitle })}
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
          >
            {t("notification_modal.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer ${
              isCurrentlyEnabled
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>
                {isCurrentlyEnabled
                  ? t("notification_modal.turn_off_confirm")
                  : t("notification_modal.turn_on_confirm")}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
