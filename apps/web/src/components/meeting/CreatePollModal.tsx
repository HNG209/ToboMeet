"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, Loader2, BarChart2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useCreatePollMutation } from "@/lib/redux/api/pollsApi";

interface CreatePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingCode: string;
}

export default function CreatePollModal({
  isOpen,
  onClose,
  meetingCode,
}: CreatePollModalProps) {
  const t = useTranslations("meeting.poll");
  const [createPoll, { isLoading }] = useCreatePollMutation();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuestion("");
      setOptions(["", ""]);
      setAllowMultiple(false);
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleAddOption = () => {
    if (options.length >= 50) {
      toast.error(t("max_options_reached"));
      return;
    }
    setOptions((prev) => [...prev, ""]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) {
      toast.error(t("min_options_required"));
      return;
    }
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      toast.error(t("question_required"));
      return;
    }

    const cleanedOptions = options
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0);

    if (cleanedOptions.length < 2) {
      toast.error(t("min_options_required"));
      return;
    }

    if (cleanedOptions.length > 50) {
      toast.error(t("max_options_reached"));
      return;
    }

    try {
      await createPoll({
        meetingCode,
        question: trimmedQuestion,
        options: cleanedOptions,
        allowMultiple,
      }).unwrap();

      toast.success(t("create_success"));
      onClose();
    } catch (err: any) {
      console.error("Create poll failed:", err);
      toast.error(err?.data?.message || t("create_failed"));
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-[#161619] border border-[#232328] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232328] bg-[#161619]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <BarChart2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {t("create_modal_title")}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t("create_modal_subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#232328] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Question */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              {t("question_label")} <span className="text-red-400">*</span>
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t("question_placeholder")}
              rows={3}
              className="w-full px-4 py-3 bg-[#1f1f23] border border-[#2e2e35] rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none leading-relaxed"
              autoFocus
            />
          </div>

          {/* Options List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {t("options_label")} ({options.length}/50) <span className="text-red-400">*</span>
              </label>
              {options.length < 50 && (
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>{t("add_option")}</span>
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500 w-5 text-right shrink-0">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`${t("option_placeholder")} ${idx + 1}`}
                    maxLength={150}
                    className="flex-1 px-3.5 py-2 bg-[#1f1f23] border border-[#2e2e35] rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/50 transition-all"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                      title={t("remove_option")}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Allow multiple selections */}
          <div className="pt-2 border-t border-[#232328]">
            <label className="flex items-center justify-between p-3 rounded-xl bg-[#1f1f23]/60 border border-[#2e2e35]/60 cursor-pointer hover:bg-[#1f1f23] transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-200">
                  {t("allow_multiple_label")}
                </span>
                <span className="text-xs text-slate-400">
                  {t("allow_multiple_desc")}
                </span>
              </div>
              <input
                type="checkbox"
                checked={allowMultiple}
                onChange={(e) => setAllowMultiple(e.target.checked)}
                className="w-4 h-4 rounded text-blue-500 border-[#3a3a44] bg-[#2a2a32] focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
              />
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#232328]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-[#232328] hover:text-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              <span>{t("create_submit")}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

