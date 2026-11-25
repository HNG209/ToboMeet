import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  CalendarEvent,
  CalendarEventSegment,
  getWeekDates,
  getEventColors,
  getLocalDateKey,
  isMidnightNextDay,
  splitCrossDayEvents,
} from "./types";

interface CalendarWeekViewProps {
  selectedDate: Date;
  onSelectDay: (day: Date) => void;
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
  onJoin: (meetingCode: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  isCalendarFetching: boolean;
  detailPrefetching: string | null;
  panResponderHandlers: any;
  translateXAnim: Animated.Value;
  opacityAnim: Animated.Value;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

export default function CalendarWeekView({
  selectedDate,
  onSelectDay,
  events,
  onEventPress,
  onJoin,
  refreshing,
  onRefresh,
  isCalendarFetching,
  detailPrefetching,
  panResponderHandlers,
  translateXAnim,
  opacityAnim,
  onPrevWeek,
  onNextWeek,
}: CalendarWeekViewProps) {
  const { t, i18n } = useTranslation();
  const weekDates = getWeekDates(selectedDate);
  const isVi = i18n.language === "vi";

  const weekdayHeaders = isVi
    ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const isToday = new Date().toDateString() === selectedDate.toDateString();

  const segmentsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarEventSegment[]>();
    for (const seg of splitCrossDayEvents(events)) {
      const key = getLocalDateKey(seg.segmentStart);
      const list = map.get(key);
      if (list) {
        list.push(seg);
      } else {
        map.set(key, [seg]);
      }
    }
    return map;
  }, [events]);

  const selectedDaySegments = React.useMemo(() => {
    const list = segmentsByDay.get(getLocalDateKey(selectedDate)) ?? [];
    return [...list].sort(
      (a, b) => a.anchorTime.getTime() - b.anchorTime.getTime()
    );
  }, [segmentsByDay, selectedDate]);

  const getDayHeaderText = (date: Date) => {
    const localeCode = isVi ? "vi-VN" : "en-US";
    return date.toLocaleDateString(localeCode, {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const renderWeekEventCard = (seg: CalendarEventSegment) => {
    const item = seg.originalEvent;
    const localeCode = isVi ? "vi-VN" : "en-US";
    const fmtTime = (d: Date) =>
      d.toLocaleTimeString(localeCode, {
        hour: "2-digit",
        minute: "2-digit",
      });

    const isChannelMeeting =
      item.roomType === "channel_meeting" && item.roomId && item.channelId;
    const isAssignment = item.eventType === "assignment";
    const isRecur = Boolean(item.recurrenceRule || item.isRecurring);
    const colors = getEventColors(item);

    const segmentBadge =
      seg.segmentRole === "start"
        ? t("calendar.segment_start", {
            defaultValue: isVi ? "Bắt đầu" : "Start",
          })
        : seg.segmentRole === "end"
        ? isAssignment
          ? t("calendar.assignment_due", {
              defaultValue: isVi ? "Hạn nộp" : "Due",
            })
          : t("calendar.segment_end", {
              defaultValue: isVi ? "Kết thúc" : "End",
            })
        : null;

    const timeLabel =
      seg.segmentRole === "start" || seg.segmentRole === "end"
        ? `${segmentBadge} • ${fmtTime(seg.anchorTime)}`
        : isMidnightNextDay(seg.rawStart, seg.rawEnd)
        ? `${fmtTime(seg.rawStart)} - 24:00`
        : seg.rawStart.getTime() === seg.rawEnd.getTime()
        ? fmtTime(seg.rawStart)
        : `${fmtTime(seg.rawStart)} - ${fmtTime(seg.rawEnd)}`;

    return (
      <TouchableOpacity
        key={seg.segmentKey}
        activeOpacity={0.7}
        disabled={detailPrefetching === item._id}
        onPress={() => onEventPress(item)}
        className="rounded-2xl bg-white border border-slate-200 p-3.5 mb-2.5"
        style={{
          borderLeftWidth: 4,
          borderLeftColor: colors.border,
        }}
      >
        <View className="flex-row items-center justify-between mb-1.5">
          <View className="flex-row items-center gap-1.5">
            <Feather name="clock" size={12} color="#64748B" />
            <Text className="text-xs font-semibold text-slate-600">
              {timeLabel}
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5">
            {segmentBadge && (
              <View
                className="px-2 py-0.5 rounded-md border"
                style={{
                  backgroundColor:
                    seg.segmentRole === "start" ? "#EEF2FF" : "#FFFBEB",
                  borderColor:
                    seg.segmentRole === "start" ? "#C7D2FE" : "#FDE68A",
                }}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{
                    color: seg.segmentRole === "start" ? "#4338CA" : "#B45309",
                  }}
                >
                  {segmentBadge}
                </Text>
              </View>
            )}

            {isRecur && (
              <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200">
                <Feather name="repeat" size={10} color="#4F46E5" />
                <Text className="text-[10px] font-bold text-indigo-700">
                  {t("calendar.recurrence_badge", { defaultValue: "Định kì" })}
                </Text>
              </View>
            )}

            {isAssignment ? (
              <View
                className="px-2 py-0.5 rounded-md border"
                style={{
                  backgroundColor: colors.bg,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: colors.text }}
                >
                  {item.assignmentStatus === "submitted"
                    ? isVi
                      ? "Đã nộp"
                      : "Submitted"
                    : item.assignmentStatus === "graded"
                    ? isVi
                      ? "Đã chấm"
                      : "Graded"
                    : item.assignmentStatus === "overdue"
                    ? isVi
                      ? "Quá hạn"
                      : "Overdue"
                    : item.assignmentStatus === "closed"
                    ? isVi
                      ? "Đã khóa"
                      : "Closed"
                    : isVi
                    ? "Đang làm"
                    : "In Progress"}
                </Text>
              </View>
            ) : isChannelMeeting ? (
              <View className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200">
                <Text className="text-[10px] font-bold text-emerald-700">
                  {t("calendar.channel_meeting", {
                    defaultValue: "Cuộc họp kênh",
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          {isAssignment && (
            <Feather name="clipboard" size={14} color={colors.border} />
          )}
          <Text
            className="text-sm font-bold text-slate-800 flex-1"
            numberOfLines={1}
          >
            {isAssignment
              ? `[${isVi ? "Nhiệm vụ" : "Assignment"}] ${item.title}`
              : item.title}
          </Text>
        </View>

        {item.description ? (
          <Text className="text-xs text-slate-500 mt-1 leading-4" numberOfLines={2}>
            {item.description.replace(/<[^>]*>/g, "")}
          </Text>
        ) : null}

        {!isAssignment && item.meetingCode && !isChannelMeeting && (
          <View className="flex-row justify-end mt-2 pt-2 border-t border-slate-100">
            <TouchableOpacity
              className="bg-blue-600 px-3 py-1.5 rounded-lg flex-row items-center gap-1.5 active:bg-blue-700"
              onPress={() => onJoin(item.meetingCode!)}
            >
              <Feather name="video" size={12} color="#FFFFFF" />
              <Text className="text-white text-xs font-bold">
                {t("calendar.join", { defaultValue: "Tham gia" })}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-slate-50" {...panResponderHandlers}>
      {/* Top Weekday Navigator Bar with Prev & Next Arrows */}
      <View className="bg-white border-b border-slate-200 px-1.5 py-2">
        <View className="flex-row items-center justify-between">
          {/* Left arrow: Previous week */}
          <TouchableOpacity
            onPress={onPrevWeek}
            activeOpacity={0.6}
            className="w-8 h-12 items-center justify-center rounded-lg active:bg-slate-100"
          >
            <Feather name="chevron-left" size={20} color="#475569" />
          </TouchableOpacity>

          {/* 7 Day Pills */}
          <View className="flex-1 flex-row justify-between items-center mx-1">
            {weekDates.map((dayDate, index) => {
              const dayIsToday =
                new Date().toDateString() === dayDate.toDateString();
              const isSelected =
                selectedDate.toDateString() === dayDate.toDateString();

              const dayEventsCount =
                segmentsByDay.get(getLocalDateKey(dayDate))?.length ?? 0;

              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.7}
                  className={`items-center justify-center py-2 px-1 rounded-xl flex-1 mx-0.5 ${
                    isSelected
                      ? "bg-blue-600"
                      : dayIsToday
                      ? "bg-blue-50 border border-blue-200"
                      : "bg-slate-50 border border-slate-100"
                  }`}
                  onPress={() => onSelectDay(dayDate)}
                >
                  <Text
                    className={`text-[11px] font-semibold ${
                      isSelected
                        ? "text-white"
                        : dayIsToday
                        ? "text-blue-600 font-bold"
                        : "text-slate-500"
                    }`}
                  >
                    {weekdayHeaders[index]}
                  </Text>
                  <Text
                    className={`text-sm font-bold mt-0.5 ${
                      isSelected
                        ? "text-white"
                        : dayIsToday
                        ? "text-blue-600 font-extrabold"
                        : "text-slate-800"
                    }`}
                  >
                    {dayDate.getDate()}
                  </Text>
                  {dayEventsCount > 0 && (
                    <View
                      className={`w-1.5 h-1.5 rounded-full mt-1 ${
                        isSelected ? "bg-white" : "bg-blue-600"
                      }`}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Right arrow: Next week */}
          <TouchableOpacity
            onPress={onNextWeek}
            activeOpacity={0.6}
            className="w-8 h-12 items-center justify-center rounded-lg active:bg-slate-100"
          >
            <Feather name="chevron-right" size={20} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Animated Content: Displays ONLY the events for selectedDate */}
      <Animated.View
        style={{
          flex: 1,
          transform: [{ translateX: translateXAnim }],
          opacity: opacityAnim,
        }}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Selected Day Info Header */}
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-bold text-slate-800">
                {getDayHeaderText(selectedDate)}
              </Text>
              {isToday && (
                <View className="bg-blue-600 px-2 py-0.5 rounded-full">
                  <Text className="text-[10px] font-bold text-white uppercase tracking-wider">
                    {t("calendar.today", { defaultValue: "Hôm nay" })}
                  </Text>
                </View>
              )}
            </View>

            {!isCalendarFetching && (
              <View className="px-2.5 py-0.5 rounded-full bg-slate-200">
                <Text className="text-xs font-semibold text-slate-600">
                  {t("calendar.meetings_count", {
                    count: selectedDaySegments.length,
                    defaultValue: `${selectedDaySegments.length} cuộc họp`,
                  })}
                </Text>
              </View>
            )}
          </View>

          {/* Loading State */}
          {isCalendarFetching ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="large" color="#0052FF" />
              <Text className="text-xs text-slate-400 font-medium mt-3">
                {t("calendar.loading_schedule", {
                  defaultValue: "Đang tải lịch trình...",
                })}
              </Text>
            </View>
          ) : selectedDaySegments.length === 0 ? (
            <View className="py-16 px-6 items-center justify-center bg-white rounded-2xl border border-slate-200 my-2">
              <View className="w-14 h-14 rounded-full bg-blue-50 items-center justify-center mb-3">
                <Feather name="calendar" size={26} color="#3B82F6" />
              </View>
              <Text className="text-base font-bold text-slate-700 text-center">
                {t("calendar.no_meetings_day", {
                  defaultValue: "Không có lịch họp nào cho ngày này",
                })}
              </Text>
              <Text className="text-xs text-slate-400 text-center mt-1.5">
                {t("calendar.no_meetings_day_desc", {
                  defaultValue: "Hãy chọn ngày khác hoặc tạo lịch họp mới",
                })}
              </Text>
            </View>
          ) : (
            <View className="gap-1">
              {selectedDaySegments.map((seg) => renderWeekEventCard(seg))}
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
