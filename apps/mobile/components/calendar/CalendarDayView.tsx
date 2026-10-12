import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  CalendarEvent,
  HOUR_HEIGHT,
  TIME_AXIS_WIDTH,
  getEventColors,
  getEventLayout,
} from "./types";

interface CalendarDayViewProps {
  selectedDate: Date;
  events: CalendarEvent[];
  onEventPress: (event: CalendarEvent) => void;
  refreshing: boolean;
  onRefresh: () => void;
  isCalendarFetching: boolean;
  detailPrefetching: string | null;
  panResponderHandlers: any;
  screenWidth: number;
}

export default function CalendarDayView({
  selectedDate,
  events,
  onEventPress,
  refreshing,
  onRefresh,
  isCalendarFetching,
  detailPrefetching,
  panResponderHandlers,
  screenWidth,
}: CalendarDayViewProps) {
  const { t, i18n } = useTranslation();
  const hours = Array.from({ length: 23 }, (_, i) => i + 1);
  const colWidth = screenWidth - TIME_AXIS_WIDTH - 24;
  const isVi = i18n.language === "vi";

  const dayEvents = events.filter((e) => {
    const eDate = new Date(e.startDate);
    return (
      eDate.getFullYear() === selectedDate.getFullYear() &&
      eDate.getMonth() === selectedDate.getMonth() &&
      eDate.getDate() === selectedDate.getDate()
    );
  });

  const layoutItems = React.useMemo(() => {
    const sorted = [...dayEvents].sort((a, b) => {
      const aStart = new Date(a.startDate).getTime();
      const bStart = new Date(b.startDate).getTime();
      return aStart - bStart;
    });

    const items = sorted.map((event) => {
      const { top, height } = getEventLayout(event);
      const s = new Date(event.startDate);
      const e = new Date(event.endDate || event.startDate);
      let startMinutes = s.getHours() * 60 + s.getMinutes();
      let endMinutes = e.getHours() * 60 + e.getMinutes();
      if (endMinutes <= startMinutes) {
        endMinutes = startMinutes + 30;
      }

      return {
        event,
        top,
        height,
        startMinutes,
        endMinutes,
        colIndex: 0,
        totalCols: 1,
      };
    });

    // Cụm các sự kiện trùng nhau
    const clusters: (typeof items)[] = [];
    let currentCluster: typeof items = [];
    let clusterEnd = 0;

    for (const item of items) {
      if (currentCluster.length === 0) {
        currentCluster.push(item);
        clusterEnd = item.endMinutes;
      } else {
        if (item.startMinutes < clusterEnd) {
          currentCluster.push(item);
          clusterEnd = Math.max(clusterEnd, item.endMinutes);
        } else {
          clusters.push(currentCluster);
          currentCluster = [item];
          clusterEnd = item.endMinutes;
        }
      }
    }
    if (currentCluster.length > 0) clusters.push(currentCluster);

    for (const cluster of clusters) {
      const columns: (typeof items)[] = [];
      for (const item of cluster) {
        let placedCol = -1;
        for (let i = 0; i < columns.length; i++) {
          const last = columns[i][columns[i].length - 1];
          if (last.endMinutes <= item.startMinutes) {
            placedCol = i;
            break;
          }
        }
        if (placedCol === -1) {
          placedCol = columns.length;
          columns.push([item]);
        } else {
          columns[placedCol].push(item);
        }
        item.colIndex = placedCol;
      }
      for (const item of cluster) {
        item.totalCols = columns.length;
      }
    }

    const maxCols =
      items.length > 0 ? Math.max(1, ...items.map((i) => i.totalCols)) : 1;
    return { items, maxCols };
  }, [dayEvents]);

  const MIN_MOBILE_COL_WIDTH = 150;
  const effectiveColWidth = Math.max(
    colWidth,
    layoutItems.maxCols * MIN_MOBILE_COL_WIDTH
  );

  const getDayHeaderText = (date: Date) => {
    const localeCode = isVi ? "vi-VN" : "en-US";
    return date.toLocaleDateString(localeCode, {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatEventTime = (startDate: string, endDate: string) => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(s.getHours())}:${pad(s.getMinutes())} - ${pad(
      e.getHours()
    )}:${pad(e.getMinutes())}`;
  };

  return (
    <View className="flex-1 bg-white" {...panResponderHandlers}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Day header */}
        <View className="p-4 bg-white border-b border-slate-200">
          <Text className="text-base font-bold text-slate-800 text-center">
            {getDayHeaderText(selectedDate)}
          </Text>
        </View>

        <View className="flex-row pr-3 bg-white">
          {/* Time axis */}
          <View style={{ width: TIME_AXIS_WIDTH }}>
            {hours.map((hour) => (
              <View
                key={hour}
                style={{ height: HOUR_HEIGHT }}
                className="justify-start items-center pt-1"
              >
                <Text className="text-xs text-slate-400 font-medium">
                  {`${hour.toString().padStart(2, "0")}:00`}
                </Text>
              </View>
            ))}
          </View>

          {/* Events & Grid Column - có thể cuộn ngang nếu nhiều lịch chèn nhau */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={layoutItems.maxCols > 1}
            className="flex-1"
          >
            <View
              className="relative"
              style={{
                width: effectiveColWidth,
                height: 23 * HOUR_HEIGHT,
              }}
            >
              {/* Horizontal Grid lines */}
              <View className="absolute inset-0">
                {hours.map((hour) => (
                  <View
                    key={hour}
                    style={{ height: HOUR_HEIGHT }}
                    className="border-b border-slate-100"
                  />
                ))}
              </View>

              {/* Day Events positioned side-by-side without squashing */}
              {layoutItems.items.map(
                ({ event, top, height, colIndex, totalCols }) => {
                  const colors = getEventColors(event);
                  const isAssignment = event.eventType === "assignment";
                  const isRecur = Boolean(
                    event.recurrenceRule || event.isRecurring
                  );
                  const width = effectiveColWidth / totalCols;
                  const left = colIndex * width;

                  return (
                    <TouchableOpacity
                      key={`${event._id}_${event.startDate}`}
                      disabled={detailPrefetching === event._id}
                      onPress={() => onEventPress(event)}
                      className="rounded-xl p-2 justify-between shadow-xs"
                      style={{
                        position: "absolute",
                        top,
                        height,
                        left: left + 2,
                        width: width - 4,
                        backgroundColor: colors.bg,
                        borderLeftWidth: 4,
                        borderLeftColor: colors.border,
                        opacity: isCalendarFetching ? 0.6 : 1,
                      }}
                    >
                      <View className="flex-row items-center gap-1.5">
                        {isAssignment ? (
                          <Feather
                            name="clipboard"
                            size={12}
                            color={colors.border}
                          />
                        ) : isRecur ? (
                          <Feather
                            name="repeat"
                            size={11}
                            color={colors.text}
                          />
                        ) : null}
                        <Text
                          className="font-bold flex-1 text-xs"
                          style={{ color: colors.text }}
                          numberOfLines={1}
                        >
                          {isAssignment
                            ? `[${
                                isVi ? "Nhiệm vụ" : "Assignment"
                              }] ${event.title}`
                            : event.title}
                        </Text>
                      </View>

                      {/* Hiển thị giờ sự kiện đầy đủ, rõ ràng */}
                      <Text
                        className="text-[10px] font-semibold mt-0.5"
                        style={{ color: colors.text }}
                        numberOfLines={1}
                      >
                        {formatEventTime(event.startDate, event.endDate)}
                      </Text>
                    </TouchableOpacity>
                  );
                }
              )}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}
