"use client";

import { useState, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import SettingsDialog from "@/components/dashboard/SettingsDialog";
import StoreProvider from "@/lib/redux/StoreProvider";
import { useSocket } from "@/hooks/useSocket";
import { useCalendarSocketEvents } from "@/hooks/socket/useCalendarSocketEvents";
import { useGetMeQuery } from "@/lib/redux/api/usersApi";

// Modularized Calendar Components
import {
  CalendarEvent,
  CalendarViewType,
  RsvpMember,
  getCacheKey,
  formatDateTimeLocal,
} from "@/components/calendar/types";
import CalendarHeader from "@/components/calendar/CalendarHeader";
import CalendarSidebar from "@/components/calendar/CalendarSidebar";
import TimeGridView from "@/components/calendar/TimeGridView";
import MonthView from "@/components/calendar/MonthView";
import YearView from "@/components/calendar/YearView";
import CreateEventModal from "@/components/calendar/CreateEventModal";
import EventDetailModal from "@/components/calendar/EventDetailModal";
import DeleteEventConfirmModal from "@/components/calendar/DeleteEventConfirmModal";
import ChannelMeetingModal from "@/components/calendar/ChannelMeetingModal";

import {
  useGetCalendarEventsQuery,
  useLazyGetCalendarRsvpQuery,
  useSearchCalendarEventsQuery,
  useUpdateCalendarEventMutation,
  useDeleteCalendarEventMutation,
} from "@/lib/redux/api/calendarApi";
import { toast } from "sonner";

export default function CalendarPage() {
  return (
    <StoreProvider>
      <CalendarContent />
    </StoreProvider>
  );
}

function CalendarContent() {
  const socket = useSocket();
  const locale = useLocale();
  const t = useTranslations("calendar");
  const router = useRouter();
  const { data: meData } = useGetMeQuery();
  const currentUserId = meData?._id;
  const currentSupabaseId = meData?.supabaseId;

  // View & Date States
  const [view, setView] = useState<CalendarViewType>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  const calendarGridRef = useRef<HTMLDivElement>(null);

  // Modals & Popups
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [initialModalStartDate, setInitialModalStartDate] = useState<string | undefined>();
  const [initialModalEndDate, setInitialModalEndDate] = useState<string | undefined>();
  const [showDetailPopup, setShowDetailPopup] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showChannelMeetingModal, setShowChannelMeetingModal] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

  // RSVP Management & Mutations
  const [triggerRsvpQuery, { data: rsvpData }] = useLazyGetCalendarRsvpQuery();
  const [updateCalendarEvent] = useUpdateCalendarEventMutation();
  const [deleteCalendarEvent, { isLoading: isDeletingEvent }] = useDeleteCalendarEventMutation();

  const selectedEventRef = useRef<CalendarEvent | null>(null);

  // Calculate month boundaries for current selected date
  // startOfMonth: ngày 1 của tháng lúc 00:00 giờ local (ví dụ: Sep 1 00:00 UTC+7 = Aug 31 17:00 UTC)
  // endOfMonth: ngày 1 của tháng SAU lúc 23:59:59 (exclusive end) — đảm bảo bao gồm toàn bộ ngày cuối tháng
  // Không dùng new Date(year, month+1, 0) vì ngày 0 = ngày cuối tháng lúc 00:00 giờ local,
  // bỏ sót các sự kiện vào buổi chiều/tối của ngày cuối tháng
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1, 23, 59, 59, 999).toISOString();

  // RTK Query fetches
  const { data: rawEvents, isLoading: loading, refetch: refetchEvents } = useGetCalendarEventsQuery({
    start: startOfMonth,
    end: endOfMonth,
  });

  const events = rawEvents ?? [];

  // RSVP data mapping
  const rsvpList = rsvpData ?? [];

  // Search RTK Query
  const { data: searchResultsData, isFetching: searchLoading } = useSearchCalendarEventsQuery(searchQuery.trim(), {
    skip: !searchQuery.trim(),
  });
  const searchResults = searchResultsData ?? [];

  useEffect(() => {
    selectedEventRef.current = selectedEvent;
    if (selectedEvent) {
      triggerRsvpQuery(selectedEvent._id);
    }
  }, [selectedEvent, triggerRsvpQuery]);

  // Mount and Socket Effects
  // Sử dụng hook quản lý socket và cache cho Calendar
  useCalendarSocketEvents();

  // Mount and RSVP Socket Effects
  useEffect(() => {
    setMounted(true);

    if (socket) {
      if (!socket.connected) {
        socket.connect();
      }
      const handleRsvp = (data: any) => {
        if (
          selectedEventRef.current &&
          selectedEventRef.current._id === data.eventId
        ) {
          triggerRsvpQuery(data.eventId);
        }
      };
      socket.on("rsvp_updated", handleRsvp);

      return () => {
        socket.off("rsvp_updated", handleRsvp);
      };
    }
  }, [socket, triggerRsvpQuery]);

  // Điều hướng và highlight sự kiện được chọn từ Search
  const handleSelectSearchEvent = (event: CalendarEvent) => {
    setHighlightedEventId(event._id);
    setTimeout(() => {
      setHighlightedEventId(null);
    }, 4000);

    if (view === "agenda" || view === "month") {
      setView("week");
    }

    const eventDate = new Date(event.startDate);
    setCurrentDate(eventDate);
    setSearchQuery("");

    setTimeout(() => {
      if (calendarGridRef.current) {
        const startHour = eventDate.getHours() + eventDate.getMinutes() / 60;
        const topOffset = Math.max(0, (startHour - 1) * 64);
        calendarGridRef.current.scrollTo({
          top: topOffset,
          behavior: "smooth",
        });
      }
    }, 200);
  };

  const handleCellClick = (date: Date, hour: number) => {
    setEditingEvent(null);
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    setInitialModalStartDate(formatDateTimeLocal(start));
    setInitialModalEndDate(formatDateTimeLocal(end));
    setShowCreateModal(true);
  };

  const handleDropEvent = async (
    eventId: string,
    date: Date,
    hour: number,
  ) => {
    const draggedEvent = events.find((ev) => ev._id === eventId);
    if (!draggedEvent) return;

    const duration =
      new Date(draggedEvent.endDate).getTime() -
      new Date(draggedEvent.startDate).getTime();

    const newStart = new Date(date);
    newStart.setHours(hour, 0, 0, 0);
    const newEnd = new Date(newStart.getTime() + duration);

    try {
      await updateCalendarEvent({
        id: eventId,
        body: {
          startDate: newStart.toISOString(),
          endDate: newEnd.toISOString(),
        },
      }).unwrap();
    } catch (err) {
      console.error("Lỗi cập nhật kéo thả:", err);
    }
  };

  const handleEditClick = (event: CalendarEvent) => {
    const guests = rsvpList
      .filter((r) => !r.isHost && r.userId !== event.hostId)
      .map((r) => ({
        email: r.email,
        displayName: r.displayName,
        status: r.status,
      }));

    setEditingEvent({
      ...event,
      invitees: guests.length > 0 ? guests : event.invitees,
    });
    setShowDetailPopup(false);
    setShowCreateModal(true);
  };

  const handleDeleteEvent = async (
    event: CalendarEvent,
    deleteType: "single" | "all" = "all",
  ) => {
    try {
      const occurrenceDate =
        event.occurrenceDate ||
        (event.startDate ? event.startDate.substring(0, 10) : undefined);

      await deleteCalendarEvent({
        id: event._id,
        type: deleteType,
        occurrenceDate: deleteType === "single" ? occurrenceDate : undefined,
      }).unwrap();

      toast.success(
        deleteType === "single"
          ? t("toasts.delete_single_success")
          : t("toasts.delete_all_success")
      );

      setShowDeleteConfirmModal(false);
      setShowDetailPopup(false);
      refetchEvents();
    } catch (err) {
      console.error("Lỗi xóa sự kiện:", err);
      toast.error(t("toasts.delete_error"));
    }
  };

  const handleRestoreOccurrenceSuccess = (eventId: string, dateStr: string) => {
    setSelectedEvent((prev) => {
      if (!prev || prev._id !== eventId) return prev;
      return {
        ...prev,
        recurrenceExceptions: (prev.recurrenceExceptions || []).filter(
          (d) => d !== dateStr,
        ),
      };
    });
    refetchEvents();
  };

  const handleJoinMeeting = (meetingCode: string) => {
    window.location.href = `/meeting/${meetingCode}`;
  };

  // Filtered Events
  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ev.description &&
        ev.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === "all" || ev.roomType === typeFilter;
    return matchesSearch && matchesType;
  });

  if (!mounted) {
    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#f5f5f5] font-sans flex flex-col overflow-hidden text-slate-800">
      {/* ── Header ── */}
      <CalendarHeader
        locale={locale}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        currentDate={currentDate}
        onSetCurrentDate={setCurrentDate}
        view={view}
        onSetView={setView}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchResults={searchResults}
        searchLoading={searchLoading}
        onSelectSearchEvent={handleSelectSearchEvent}
        onOpenCreateEventModal={() => {
          setEditingEvent(null);
          setInitialModalStartDate(undefined);
          setInitialModalEndDate(undefined);
          setShowCreateModal(true);
        }}
        onOpenChannelMeetingModal={() => setShowChannelMeetingModal(true)}
      />

      {/* ── Main Calendar Workspace ── */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative bg-white">
        {/* Left Sidebar */}
        {sidebarOpen && (
          <CalendarSidebar
            locale={locale}
            currentDate={currentDate}
            onSetCurrentDate={setCurrentDate}
            events={events}
          />
        )}

        {/* Calendar View Area */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">
          <div
            ref={calendarGridRef}
            className="flex-1 overflow-hidden relative flex flex-col"
          >
            {view === "agenda" ? (
              <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
                <YearView
                  locale={locale}
                  currentDate={currentDate}
                  events={events}
                  onSelectDate={(cellDate) => {
                    setCurrentDate(cellDate);
                    setView("day");
                  }}
                />
              </div>
            ) : view === "month" ? (
              <div className="flex-1 overflow-hidden h-full flex flex-col">
                <MonthView
                  locale={locale}
                  currentDate={currentDate}
                  filteredEvents={filteredEvents}
                  onSelectDate={(cellDate) => {
                    setCurrentDate(cellDate);
                    setView("day");
                  }}
                  onSelectEvent={(ev) => {
                    setSelectedEvent(ev);
                    setShowDetailPopup(true);
                  }}
                />
              </div>
            ) : (
              <TimeGridView
                locale={locale}
                currentDate={currentDate}
                view={view}
                filteredEvents={filteredEvents}
                highlightedEventId={highlightedEventId}
                onSelectEvent={(ev) => {
                  setSelectedEvent(ev);
                  setShowDetailPopup(true);
                }}
                onCellClick={handleCellClick}
                onDropEvent={handleDropEvent}
              />
            )}
          </div>
        </main>
      </div>

      {/* ── Modals & Popups ── */}
      <CreateEventModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => refetchEvents()}
        locale={locale}
        editingEvent={editingEvent}
        initialStartDate={initialModalStartDate}
        initialEndDate={initialModalEndDate}
      />

      <ChannelMeetingModal
        isOpen={showChannelMeetingModal}
        onClose={() => setShowChannelMeetingModal(false)}
        onSuccess={() => refetchEvents()}
      />

      <EventDetailModal
        isOpen={showDetailPopup}
        onClose={() => setShowDetailPopup(false)}
        locale={locale}
        event={selectedEvent}
        rsvpList={rsvpList}
        currentUserId={currentUserId}
        currentSupabaseId={currentSupabaseId}
        onEdit={handleEditClick}
        onDelete={() => setShowDeleteConfirmModal(true)}
        onJoinMeeting={handleJoinMeeting}
        onRestoreOccurrence={handleRestoreOccurrenceSuccess}
      />

      <DeleteEventConfirmModal
        isOpen={showDeleteConfirmModal}
        onClose={() => setShowDeleteConfirmModal(false)}
        onConfirm={(deleteType) => {
          if (selectedEvent) {
            handleDeleteEvent(selectedEvent, deleteType);
          }
        }}
        isRecurring={Boolean(
          selectedEvent?.recurrenceRule || selectedEvent?.isRecurring,
        )}
        occurrenceDate={
          selectedEvent?.occurrenceDate ||
          (selectedEvent?.startDate
            ? selectedEvent.startDate.substring(0, 10)
            : undefined)
        }
        locale={locale}
        isLoading={isDeletingEvent}
      />

      {showSettingsDialog && (
        <SettingsDialog onClose={() => setShowSettingsDialog(false)} />
      )}
    </div>
  );
}
