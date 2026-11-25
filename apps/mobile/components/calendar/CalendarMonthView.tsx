import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  CalendarEvent,
  CalendarEventSegment,
  generateMonthDays,
  getEventColors,
  getLocalDateKey,
  splitCrossDayEvents,
} from "./types";

interface CalendarMonthViewProps {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
  onJoin: (meetingCode: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  detailPrefetching: string | null;
  panResponderHandlers: any;
}

export default function CalendarMonthView({
  selectedDate,
  setSelectedDate,
  events,
  onEventPress,
  onJoin,
  refreshing,
  onRefresh,
  detailPrefetching,
  panResponderHandlers,
}: CalendarMonthViewProps) {
  const { t, i18n } = useTranslation();
  const days = generateMonthDays(selectedDate);
  const currentMonth = selectedDate.getMonth();
  const isVi = i18n.language === "vi";

  const weekDaysHeader = isVi
    ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const renderItem = ({ item: seg }: { item: CalendarEventSegment }) => {
    const item = seg.originalEvent;
    const anchorDate = seg.anchorTime;
    const localeCode = isVi ? "vi-VN" : "en-US";
    const dateStr = anchorDate.toLocaleDateString(localeCode, {
      day: "2-digit",
      month: "2-digit",
    });
    const timeStr = anchorDate.toLocaleTimeString(localeCode, {
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

    return (
      <TouchableOpacity
        className="bg-white rounded-2xl p-4 mb-2.5 flex-row items-center border border-slate-100"
        style={{ borderLeftColor: colors.border, borderLeftWidth: 4 }}
        activeOpacity={0.7}
        disabled={detailPrefetching === item._id}
        onPress={() => onEventPress(item)}
      >
        <View className="items-center mr-3.5 pr-3.5 border-r border-slate-200">
          <Text className="text-sm font-bold text-slate-800">{dateStr}</Text>
          <Text className="text-xs text-slate-500 mt-1">{timeStr}</Text>
          {segmentBadge && (
            <Text
              className="text-[9px] font-bold mt-0.5"
              style={{
                color: seg.segmentRole === "start" ? "#4338CA" : "#B45309",
              }}
            >
              {segmentBadge}
            </Text>
          )}
        </View>

        <View className="flex-1 mr-2">
          <View className="flex-row items-center gap-1.5">
            {isAssignment ? (
              <Feather name="clipboard" size={13} color={colors.border} />
            ) : isRecur ? (
              <Feather name="repeat" size={11} color="#4F46E5" />
            ) : null}
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
            <Text className="text-xs text-slate-500 mt-1" numberOfLines={2}>
              {item.description.replace(/<[^>]*>/g, "")}
            </Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-1.5">
          {isAssignment ? (
            <View
              className="px-2 py-1 rounded-lg border"
              style={{
                backgroundColor: colors.bg,
                borderColor: colors.border,
              }}
            >
              <Text
                className="text-[11px] font-bold"
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
          ) : (
            <>
              {isChannelMeeting && (
                <View className="w-8 h-8 rounded-lg border border-slate-200 justify-center items-center bg-slate-50">
                  <Feather name="message-square" size={14} color="#475569" />
                </View>
              )}
              {item.meetingCode && !isChannelMeeting && (
                <TouchableOpacity
                  className="bg-blue-600 px-3.5 py-1.5 rounded-xl justify-center items-center active:bg-blue-700"
                  onPress={() => onJoin(item.meetingCode!)}
                >
                  <Text className="text-white font-bold text-xs">
                    {t("calendar.join", { defaultValue: "Tham gia" })}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-white" {...panResponderHandlers}>
      {/* Month Weekdays Header */}
      <View className="flex-row border-b border-slate-200 py-2.5 bg-slate-50">
        {weekDaysHeader.map((d, index) => (
          <View key={index} className="flex-1 items-center">
            <Text className="text-xs font-semibold text-slate-500">{d}</Text>
          </View>
        ))}
      </View>

      {/* Days Grid */}
      <View className="flex-row flex-wrap border-b border-slate-200">
        {days.map((dayDate, index) => {
          const isCurrentMonth = dayDate.getMonth() === currentMonth;
          const isToday =
            new Date().toDateString() === dayDate.toDateString();
          const isSelected =
            selectedDate.toDateString() === dayDate.toDateString();

          const daySegments =
            segmentsByDay.get(getLocalDateKey(dayDate)) ?? [];

          return (
            <TouchableOpacity
              key={index}
              className={`w-[14.28%] h-14 border-b border-r border-slate-100 p-1 justify-between ${
                isSelected
                  ? "bg-blue-50/80"
                  : isToday
                  ? "bg-blue-50/40"
                  : !isCurrentMonth
                  ? "bg-slate-50/60"
                  : "bg-white"
              }`}
              onPress={() => setSelectedDate(dayDate)}
            >
              <View className="flex-row justify-between items-center">
                <View
                  className={`w-5 h-5 rounded-full items-center justify-center ${
                    isSelected
                      ? "bg-blue-600"
                      : isToday
                      ? "bg-blue-100"
                      : ""
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      isSelected
                        ? "text-white font-bold"
                        : isToday
                        ? "text-blue-600 font-bold"
                        : !isCurrentMonth
                        ? "text-slate-300"
                        : "text-slate-700"
                    }`}
                  >
                    {dayDate.getDate()}
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-0.5 flex-wrap">
                {daySegments.slice(0, 3).map((seg) => {
                  const colors = getEventColors(seg.originalEvent);
                  return (
                    <View
                      key={seg.segmentKey}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: colors.border }}
                    />
                  );
                })}
                {daySegments.length > 3 && (
                  <Text className="text-[8px] text-slate-500 font-bold">
                    +{daySegments.length - 3}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected date's events list */}
      <View className="flex-1 bg-slate-50 p-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm font-bold text-slate-700">
            {selectedDate.toLocaleDateString(isVi ? "vi-VN" : "en-US", {
              weekday: "long",
              day: "numeric",
              month: "numeric",
            })}
          </Text>
          <View className="px-2 py-0.5 rounded-full bg-slate-200">
            <Text className="text-[11px] font-medium text-slate-600">
              {t("calendar.events_count", {
                count: selectedDaySegments.length,
                defaultValue: `${selectedDaySegments.length} sự kiện`,
              })}
            </Text>
          </View>
        </View>

        <FlatList
          data={selectedDaySegments}
          keyExtractor={(item) => item.segmentKey}
          renderItem={renderItem}
          ListEmptyComponent={
            <View className="py-8 items-center justify-center">
              <Feather name="calendar" size={32} color="#CBD5E1" />
              <Text className="text-sm text-slate-400 mt-2">
                {t("calendar.empty_state", { defaultValue: "Không có sự kiện" })}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      </View>
    </View>
  );
}
