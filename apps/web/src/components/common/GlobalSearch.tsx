"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Search,
  X,
  Users,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Loader2,
  Clock,
  Video,
  MessageCircle,
} from "lucide-react";
import { useGetMyRoomsQuery } from "@/lib/redux/api/roomsApi";
import { useSearchCalendarEventsQuery } from "@/lib/redux/api/calendarApi";
import { useSearchUsersQuery } from "@/lib/redux/api/usersApi";
import { useCreateOrGetConversationMutation } from "@/lib/redux/api/directChatApi";
import UserAvatar from "./UserAvatar";

const PAGE_SIZE = 4;

export default function GlobalSearch() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("dashboard");

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "rooms" | "calendar" | "users">("all");

  // Separate pagination state for each category
  const [roomsPage, setRoomsPage] = useState(1);
  const [calendarPage, setCalendarPage] = useState(1);
  const [usersCursor, setUsersCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset pagination when query changes
  useEffect(() => {
    setRoomsPage(1);
    setCalendarPage(1);
    setUsersCursor(undefined);
    setCursorHistory([]);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const trimmedQuery = query.trim().toLowerCase();

  // 1. Fetch & Filter Rooms
  const { data: allRooms = [], isLoading: isLoadingRooms } = useGetMyRoomsQuery();
  const matchingRooms: any[] = useMemo(() => {
    if (!trimmedQuery) return [];
    const roomList = Array.isArray(allRooms)
      ? allRooms
      : (allRooms as any)?.result || (allRooms as any)?.items || [];
    return roomList.filter(
      (r: any) =>
        r?.name?.toLowerCase().includes(trimmedQuery) ||
        (r?.code && r.code.toLowerCase().includes(trimmedQuery))
    );
  }, [allRooms, trimmedQuery]);

  // 2. Fetch Calendar Events
  const { data: searchEventsData, isFetching: isSearchingCalendar } = useSearchCalendarEventsQuery(
    trimmedQuery,
    { skip: !trimmedQuery }
  );
  const matchingEvents: any[] = useMemo(() => {
    if (!trimmedQuery || !searchEventsData) return [];
    if (Array.isArray(searchEventsData)) return searchEventsData;
    if (Array.isArray((searchEventsData as any)?.result)) return (searchEventsData as any).result;
    if (Array.isArray((searchEventsData as any)?.items)) return (searchEventsData as any).items;
    return [];
  }, [searchEventsData, trimmedQuery]);

  // 3. Fetch Users
  const { data: usersData, isFetching: isSearchingUsers } = useSearchUsersQuery(
    { q: trimmedQuery, cursor: usersCursor, limit: 10 },
    { skip: !trimmedQuery }
  );
  const matchingUsers: any[] = useMemo(() => {
    if (!trimmedQuery || !usersData?.items) return [];
    return Array.isArray(usersData.items) ? usersData.items : [];
  }, [usersData, trimmedQuery]);

  const [createOrGetConversation] = useCreateOrGetConversationMutation();

  // Paginated slices
  const paginatedRooms: any[] = useMemo(() => {
    if (!Array.isArray(matchingRooms)) return [];
    const start = (roomsPage - 1) * PAGE_SIZE;
    return matchingRooms.slice(start, start + PAGE_SIZE);
  }, [matchingRooms, roomsPage]);
  const totalRoomPages = Math.ceil(matchingRooms.length / PAGE_SIZE) || 1;

  const paginatedEvents: any[] = useMemo(() => {
    if (!Array.isArray(matchingEvents)) return [];
    const start = (calendarPage - 1) * PAGE_SIZE;
    return matchingEvents.slice(start, start + PAGE_SIZE);
  }, [matchingEvents, calendarPage]);
  const totalCalendarPages = Math.ceil(matchingEvents.length / PAGE_SIZE) || 1;

  const hasResults = matchingRooms.length > 0 || matchingEvents.length > 0 || matchingUsers.length > 0;

  const handleUsersNextPage = () => {
    if (usersData?.hasNext && usersData?.nextCursor) {
      setCursorHistory((prev) => [...prev, usersCursor]);
      setUsersCursor(usersData.nextCursor);
    }
  };

  const handleUsersPrevPage = () => {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, -1));
      setUsersCursor(prevCursor);
    }
  };

  // Navigation handlers
  const handleOpenRoom = (room: any) => {
    setIsOpen(false);
    if (room.code) {
      router.push(`/${locale}/room/join?code=${room.code}`);
    } else {
      router.push(`/${locale}/dashboard`);
    }
  };

  const handleOpenCalendarEvent = (event: any) => {
    setIsOpen(false);
    router.push(`/${locale}/calendar`);
  };

  const handleOpenUserChat = async (user: any) => {
    setIsOpen(false);
    const targetUserId = user.supabaseId || user._id || user.id;
    if (targetUserId) {
      try {
        const res = await createOrGetConversation({ recipientId: targetUserId }).unwrap();
        const convId = res.id || (res as any)._id;
        router.push(`/${locale}/chat?convId=${convId}`);
      } catch (err) {
        router.push(`/${locale}/chat`);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={t("search_placeholder", { defaultValue: "Tìm kiếm phòng, lịch, người dùng..." })}
          className="w-full h-9 pl-10 pr-16 bg-slate-100/80 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-brand-500/30 rounded-full text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all duration-150"
        />
        {query ? (
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 w-5 h-5 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="absolute right-3 text-[10px] font-semibold text-slate-400 bg-slate-200/70 px-1.5 py-0.5 rounded-md pointer-events-none">
            Ctrl K
          </span>
        )}
      </div>

      {/* Floating Results Popover */}
      {isOpen && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-slate-200/80 overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[520px]">
          {/* Header Tabs */}
          <div className="flex items-center px-3 pt-2.5 pb-2 border-b border-slate-100 gap-1 bg-slate-50/70 shrink-0">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "all"
                  ? "bg-white text-brand-600 shadow-xs font-bold"
                  : "text-slate-600 hover:bg-white/60"
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setActiveTab("rooms")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === "rooms"
                  ? "bg-white text-brand-600 shadow-xs font-bold"
                  : "text-slate-600 hover:bg-white/60"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Phòng ({matchingRooms.length})
            </button>
            <button
              onClick={() => setActiveTab("calendar")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === "calendar"
                  ? "bg-white text-brand-600 shadow-xs font-bold"
                  : "text-slate-600 hover:bg-white/60"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Lịch ({matchingEvents.length})
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === "users"
                  ? "bg-white text-brand-600 shadow-xs font-bold"
                  : "text-slate-600 hover:bg-white/60"
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Người dùng
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-100">
            {!hasResults && !isSearchingCalendar && !isSearchingUsers ? (
              <div className="py-12 text-center text-slate-400">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">Không tìm thấy kết quả phù hợp với &quot;{query}&quot;</p>
              </div>
            ) : null}

            {/* --- TAB ALL --- */}
            {activeTab === "all" && (
              <div className="space-y-4">
                {/* Rooms Section */}
                {matchingRooms.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between pb-1.5 px-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Users className="w-3 h-3 text-brand-500" /> Phòng ({matchingRooms.length})
                      </span>
                      {matchingRooms.length > 3 && (
                        <button
                          onClick={() => setActiveTab("rooms")}
                          className="text-[11px] font-semibold text-brand-600 hover:underline flex items-center gap-0.5"
                        >
                          Xem tất cả <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {matchingRooms.slice(0, 3).map((room) => (
                        <div
                          key={room._id}
                          onClick={() => handleOpenRoom(room)}
                          className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                              <Video className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{room.name}</p>
                              <p className="text-[11px] text-slate-400 truncate">Mã: {room.code || "---"}</p>
                            </div>
                          </div>
                          <span className="text-[11px] font-medium text-brand-600 bg-brand-50/80 px-2 py-0.5 rounded-full group-hover:bg-brand-500 group-hover:text-white transition-colors">
                            Vào phòng
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Calendar Section */}
                {matchingEvents.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between pb-1.5 px-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-indigo-500" /> Lịch & Sự kiện ({matchingEvents.length})
                      </span>
                      {matchingEvents.length > 3 && (
                        <button
                          onClick={() => setActiveTab("calendar")}
                          className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-0.5"
                        >
                          Xem tất cả <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {matchingEvents.slice(0, 3).map((ev) => (
                        <div
                          key={ev._id}
                          onClick={() => handleOpenCalendarEvent(ev)}
                          className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                              <Clock className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{ev.title}</p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {new Date(ev.startDate).toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                          <span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            Xem lịch
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Users Section */}
                {matchingUsers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between pb-1.5 px-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <User className="w-3 h-3 text-emerald-500" /> Người dùng
                      </span>
                      {matchingUsers.length > 3 && (
                        <button
                          onClick={() => setActiveTab("users")}
                          className="text-[11px] font-semibold text-emerald-600 hover:underline flex items-center gap-0.5"
                        >
                          Xem tất cả <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {matchingUsers.slice(0, 3).map((user) => (
                        <div
                          key={user._id}
                          onClick={() => handleOpenUserChat(user)}
                          className="group flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar
                              avatarUrl={user.avatarUrl}
                              displayName={user.displayName || user.email}
                              size="w-8 h-8"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">
                                {user.displayName || user.email?.split("@")[0]}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                            </div>
                          </div>
                          <button className="flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                            <MessageCircle className="w-3 h-3" /> Nhắn tin
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- TAB ROOMS (Phân trang riêng) --- */}
            {activeTab === "rooms" && (
              <div className="flex flex-col h-full">
                {isLoadingRooms ? (
                  <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
                ) : matchingRooms.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">Không có phòng nào phù hợp</p>
                ) : (
                  <div className="space-y-1.5">
                    {paginatedRooms.map((room) => (
                      <div
                        key={room._id}
                        onClick={() => handleOpenRoom(room)}
                        className="group flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-100 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                            <Video className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{room.name}</p>
                            <p className="text-[11px] text-slate-400">Mã phòng: {room.code || "---"}</p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-3 py-1 rounded-full group-hover:bg-brand-500 group-hover:text-white transition-all">
                          Vào phòng
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {totalRoomPages > 1 && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500">
                    <span>Trang {roomsPage} / {totalRoomPages}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setRoomsPage((p) => Math.max(1, p - 1))}
                        disabled={roomsPage === 1}
                        className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRoomsPage((p) => Math.min(totalRoomPages, p + 1))}
                        disabled={roomsPage === totalRoomPages}
                        className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- TAB CALENDAR (Phân trang riêng) --- */}
            {activeTab === "calendar" && (
              <div className="flex flex-col h-full">
                {isSearchingCalendar ? (
                  <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
                ) : matchingEvents.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">Không có lịch nào phù hợp</p>
                ) : (
                  <div className="space-y-1.5">
                    {paginatedEvents.map((ev) => (
                      <div
                        key={ev._id}
                        onClick={() => handleOpenCalendarEvent(ev)}
                        className="group flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-100 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{ev.title}</p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {new Date(ev.startDate).toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-all">
                          Xem chi tiết
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {totalCalendarPages > 1 && (
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500">
                    <span>Trang {calendarPage} / {totalCalendarPages}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCalendarPage((p) => Math.max(1, p - 1))}
                        disabled={calendarPage === 1}
                        className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCalendarPage((p) => Math.min(totalCalendarPages, p + 1))}
                        disabled={calendarPage === totalCalendarPages}
                        className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- TAB USERS (Phân trang riêng) --- */}
            {activeTab === "users" && (
              <div className="flex flex-col h-full">
                {isSearchingUsers ? (
                  <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
                ) : matchingUsers.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">Không tìm thấy người dùng</p>
                ) : (
                  <div className="space-y-1.5">
                    {matchingUsers.map((user) => (
                      <div
                        key={user._id}
                        onClick={() => handleOpenUserChat(user)}
                        className="group flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-100 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            avatarUrl={user.avatarUrl}
                            displayName={user.displayName || user.email}
                            size="w-9 h-9"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {user.displayName || user.email?.split("@")[0]}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                          </div>
                        </div>
                        <button className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full group-hover:bg-emerald-600 group-hover:text-white transition-all">
                          <MessageCircle className="w-3.5 h-3.5" /> Nhắn tin
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls */}
                {(cursorHistory.length > 0 || usersData?.hasNext) && (
                  <div className="flex items-center justify-end pt-3 mt-3 border-t border-slate-100 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleUsersPrevPage}
                        disabled={cursorHistory.length === 0}
                        className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                        title="Trang trước"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleUsersNextPage}
                        disabled={!usersData?.hasNext}
                        className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-40"
                        title="Trang sau"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
