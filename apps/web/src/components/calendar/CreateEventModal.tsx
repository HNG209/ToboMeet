"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X, ChevronDown, RefreshCw } from "lucide-react";
import { useGlobalUserSearch } from "@/hooks/useGlobalUserSearch";
import { CalendarEvent, InviteeItem, formatDateTimeLocal } from "./types";

import { useCreateCalendarEventMutation, useUpdateCalendarEventMutation } from "@/lib/redux/api/calendarApi";

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  locale: string;
  editingEvent?: CalendarEvent | null;
  initialStartDate?: string;
  initialEndDate?: string;
}

export default function CreateEventModal({
  isOpen,
  onClose,
  onSuccess,
  locale,
  editingEvent,
  initialStartDate,
  initialEndDate,
}: CreateEventModalProps) {
  const t = useTranslations("calendar");
  const [createCalendarEvent, { isLoading: isCreating }] =
    useCreateCalendarEventMutation();
  const [updateCalendarEvent, { isLoading: isUpdating }] =
    useUpdateCalendarEventMutation();
  const isSubmitting = isCreating || isUpdating;

  const isEditMode = Boolean(editingEvent);

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [roomType, setRoomType] = useState<
    "meeting" | "classroom" | "livestream" | "private" | "channel_meeting"
  >("meeting");
  const [recurrence, setRecurrence] = useState("NONE");
  const [errorMsg, setErrorMsg] = useState("");

  const [description, setDescription] = useState("");
  const [editorResetKey, setEditorResetKey] = useState(0);

  // Invitees & user search
  const [selectedInvitees, setSelectedInvitees] = useState<InviteeItem[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  const {
    users: suggestedUsers = [],
    isSearching: isSearchingMembers,
    isLoadingMore: isLoadingMoreMembers,
    hasNext: hasNextSuggestedUsers,
    debouncedQuery: debouncedMemberQuery,
    loadMore: loadMoreSuggestedUsers,
  } = useGlobalUserSearch({
    q: memberSearchQuery,
    skip: !isOpen || !memberSearchQuery.trim() || isEditMode,
    debounceMs: 300,
  });

  // Khởi tạo hoặc reset form khi modal mở/đổi editingEvent
  useEffect(() => {
    if (isOpen) {
      setErrorMsg("");
      setMemberSearchQuery("");

      if (editingEvent) {
        setTitle(editingEvent.title || "");
        setStartDate(
          editingEvent.startDate
            ? formatDateTimeLocal(editingEvent.startDate)
            : "",
        );
        setEndDate(
          editingEvent.endDate ? formatDateTimeLocal(editingEvent.endDate) : "",
        );
        setRoomType(editingEvent.roomType || "meeting");
        setDescription(editingEvent.description || "");

        // Chuẩn hóa chuỗi lặp: loại bỏ prefix "FREQ=" để match với value của các option
        let initialRecurrence = "NONE";
        if (editingEvent.recurrenceRule) {
          initialRecurrence = editingEvent.recurrenceRule.replace(/^FREQ=/, "");
        }
        setRecurrence(initialRecurrence);

        if (editingEvent.invitees) {
          setSelectedInvitees(
            editingEvent.invitees.map((inv) => ({
              email: inv.email,
              displayName: inv.displayName || inv.email,
            })),
          );
        } else {
          setSelectedInvitees([]);
        }
      } else {
        setTitle("");
        setDescription("");
        setSelectedInvitees([]);
        setRoomType("meeting");
        setRecurrence("NONE");

        if (initialStartDate && initialEndDate) {
          setStartDate(initialStartDate);
          setEndDate(initialEndDate);
        } else {
          const now = new Date();
          const start = new Date(now);
          start.setHours(now.getHours() + 1, 0, 0, 0);
          const end = new Date(start);
          end.setHours(start.getHours() + 1, 0, 0, 0);
          setStartDate(formatDateTimeLocal(start));
          setEndDate(formatDateTimeLocal(end));
        }
      }
    } else {
      setEditorResetKey((prev) => prev + 1);
    }
  }, [isOpen, editingEvent, initialStartDate, initialEndDate]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!isEditMode) {
      const now = new Date();
      if (new Date(startDate) <= now) {
        setErrorMsg(t("create_modal.start_time_future_error"));
        return;
      }
    }

    try {
      if (isEditMode && editingEvent) {
        const payload: any = {
          title,
          description,
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

        await updateCalendarEvent({ id: editingEvent._id, body: payload }).unwrap();
      } else {
        const inviteeList = selectedInvitees.map((usr) => ({
          email: usr.email,
          userId: usr.supabaseId || usr.userId || usr._id,
          displayName: usr.displayName || usr.email,
        }));

        const payload: any = {
          title,
          description,
          startDate,
          endDate,
          roomType,
          invitees: inviteeList,
        };

        if (recurrence !== "NONE") {
          if (recurrence.includes(";")) {
            const parts = recurrence.split(";");
            const freqPart = parts[0];
            const byDayPart = parts[1] || "";
            payload.recurrenceRule = `FREQ=${freqPart};${byDayPart}`;
          } else {
            payload.recurrenceRule = `FREQ=${recurrence}`;
          }
        }

        await createCalendarEvent(payload).unwrap();
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err.data?.message ||
          err.message ||
          (isEditMode
            ? t("create_modal.error_update")
            : t("create_modal.error_create")),
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-lg">
            {isEditMode
              ? (t("create_modal.edit_title") || t("create_modal.title"))
              : t("create_modal.title")}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreateEvent}>
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {errorMsg && (
              <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-xs font-medium">
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">
                {t("create_modal.title_label")}
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("create_modal.title_placeholder")}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
              />
            </div>

            {!isEditMode && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">
                      {t("create_modal.start")}
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">
                      {t("create_modal.end")}
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                    />
                  </div>
                </div>

                {startDate && new Date(startDate) <= new Date() && (
                  <p className="text-red-500 text-[11px] font-semibold mt-1">
                    {t("create_modal.start_time_future_error")}
                  </p>
                )}
              </>
            )}

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">
                  {t("create_modal.recurrence.label")}
                </label>
                <div className="relative">
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value)}
                    className="w-full px-4 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white appearance-none transition-all"
                  >
                    <option value="NONE">
                      {t("create_modal.recurrence.none")}
                    </option>
                    <option value="DAILY">
                      {t("create_modal.recurrence.daily")}
                    </option>
                    {(() => {
                      if (!startDate) return null;
                      const dateObj = new Date(startDate);
                      if (isNaN(dateObj.getTime())) return null;

                      const daysFull = (t.raw("days.full") as string[]) || [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ];
                      const dayName = daysFull[dateObj.getDay()];
                      const dayNum = dateObj.getDate();
                      const weekIndex = Math.ceil(dayNum / 7);
                      const weeksOrder = (t.raw("weeks_order") as string[]) || [
                        "first",
                        "second",
                        "third",
                        "fourth",
                        "fifth",
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

                      const weeklyLabel = t(
                        "create_modal.recurrence.weekly_on",
                        { day: dayName },
                      );
                      const monthlyLabel = t(
                        "create_modal.recurrence.monthly_on",
                        { day: dayName, week: weekName },
                      );
                      const yearlyLabel =
                        locale === "vi"
                          ? t("create_modal.recurrence.yearly_on", {
                              date: `${dayNum} tháng ${dateObj.getMonth() + 1}`,
                              day: String(dayNum),
                              month: String(dateObj.getMonth() + 1),
                            })
                          : t("create_modal.recurrence.yearly_on", {
                              date: `${dayName}, ${dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
                              day: dayName,
                              month: dateObj.toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                              }),
                            });
                      const weekdayLabel = t(
                        "create_modal.recurrence.weekdays",
                      );

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
                          {!isKnownOption && recurrence && recurrence !== "NONE" && (
                            <option value={recurrence}>{recurrence}</option>
                          )}
                        </>
                      );
                    })()}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
            </div>

            {!isEditMode && (
              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1.5">
                  {t("create_modal.guests.label")}
                </label>

                {/* Input Search Box */}
                <div className="relative mb-2">
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder={t("create_modal.guests.search_placeholder")}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  />
                  {isSearchingMembers && (
                    <div className="absolute right-3.5 top-3">
                      <RefreshCw className="w-4 h-4 text-brand-500 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Autocomplete Dropdown List */}
                {memberSearchQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-xl shadow-lg z-[110] max-h-56 overflow-y-auto divide-y divide-slate-50">
                    {isSearchingMembers ? (
                      <div className="px-4 py-3 text-xs text-slate-400 flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-500" />
                        <span>{t("create_modal.guests.searching")}</span>
                      </div>
                    ) : (
                      <>
                        {suggestedUsers.map((usr) => {
                          const isAlreadySelected = selectedInvitees.some(
                            (sel) =>
                              sel.email === usr.email ||
                              (sel.supabaseId &&
                                sel.supabaseId === usr.supabaseId) ||
                              (sel.userId &&
                                sel.userId === usr.supabaseId),
                          );
                          return (
                            <div
                              key={usr.supabaseId || usr._id || usr.email}
                              onClick={() => {
                                if (isAlreadySelected) return;
                                setSelectedInvitees([
                                  ...selectedInvitees,
                                  usr,
                                ]);
                                setMemberSearchQuery("");
                              }}
                              className={`px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between ${
                                isAlreadySelected
                                  ? "opacity-50 cursor-default"
                                  : "cursor-pointer"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {usr.avatarUrl ? (
                                  <img
                                    src={usr.avatarUrl}
                                    alt="avatar"
                                    className="w-7 h-7 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center">
                                    {(
                                      usr.displayName ||
                                      usr.email ||
                                      "?"
                                    )
                                      .substring(0, 1)
                                      .toUpperCase()}
                                  </div>
                                )}
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-slate-800">
                                    {usr.displayName || usr.email}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {usr.email}
                                  </span>
                                </div>
                              </div>
                              {isAlreadySelected && (
                                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-bold">
                                  {t("create_modal.guests.selected")}
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {/* Email hợp lệ chưa có trong hệ thống (Khách ngoài hệ thống) */}
                        {new RegExp(
                          "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
                        ).test(debouncedMemberQuery.trim()) &&
                          !suggestedUsers.some(
                            (u) =>
                              u.email?.toLowerCase() ===
                              debouncedMemberQuery.trim().toLowerCase(),
                          ) && (
                            <div
                              onClick={() => {
                                const newExternalUser = {
                                  email: debouncedMemberQuery.trim(),
                                  displayName: debouncedMemberQuery.trim(),
                                };
                                setSelectedInvitees([
                                  ...selectedInvitees,
                                  newExternalUser,
                                ]);
                                setMemberSearchQuery("");
                              }}
                              className="px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-3"
                            >
                              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
                                @
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-800">
                                  {debouncedMemberQuery.trim()}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {t("create_modal.guests.invite_external")}
                                </span>
                              </div>
                            </div>
                          )}

                        {hasNextSuggestedUsers && (
                          <div className="p-2 text-center border-t border-slate-100">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                loadMoreSuggestedUsers();
                              }}
                              disabled={isLoadingMoreMembers}
                              className="w-full py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 rounded-lg transition-colors flex items-center justify-center gap-1"
                            >
                              {isLoadingMoreMembers ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : null}
                              <span>
                                {t("create_modal.guests.load_more")}
                              </span>
                            </button>
                          </div>
                        )}

                        {!isSearchingMembers &&
                          suggestedUsers.length === 0 &&
                          !new RegExp(
                            "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
                          ).test(debouncedMemberQuery.trim()) && (
                            <div className="px-4 py-3 text-xs text-slate-400 text-center">
                              {t("create_modal.guests.no_users")}
                            </div>
                          )}
                      </>
                    )}
                  </div>
                )}

                {/* Selected Invitees List */}
                {selectedInvitees.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-36 overflow-y-auto pr-1">
                    {selectedInvitees.map((usr) => (
                      <div
                        key={usr._id || usr.email}
                        className="flex items-center justify-between p-2 hover:bg-slate-50/50 rounded-xl border border-slate-100 transition-all"
                      >
                        <div className="flex items-center gap-2.5">
                          {usr.avatarUrl ? (
                            <img
                              src={usr.avatarUrl}
                              alt="avatar"
                              className="w-7 h-7 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center">
                              {(usr.displayName || usr.email || "?")
                                .substring(0, 1)
                                .toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800">
                              {usr.displayName || usr.email}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {usr.email}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedInvitees(
                              selectedInvitees.filter(
                                (sel) => sel.email !== usr.email,
                              ),
                            )
                          }
                          className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-2.5">
                {t("create_modal.description")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("create_modal.description_placeholder")}
                rows={4}
                className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none"
              />
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-colors"
            >
              {t("create_modal.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 text-white rounded-xl text-sm font-bold shadow-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting && (
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
              )}
              <span>
                {isSubmitting
                  ? (isEditMode
                      ? t("create_modal.updating")
                      : t("create_modal.saving"))
                  : t("create_modal.save")}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
