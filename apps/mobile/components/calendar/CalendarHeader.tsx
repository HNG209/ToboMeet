import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import DashboardHeader from "../dashboard/DashboardHeader";

interface CalendarHeaderProps {
  searchActive: boolean;
  setSearchActive: (active: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedDate: Date;
  viewMode: "DAY" | "WEEK" | "MONTH";
  setViewMode: (mode: "DAY" | "WEEK" | "MONTH") => void;
  viewDropdownVisible: boolean;
  setViewDropdownVisible: (visible: boolean) => void;
  headerTitle: string;
  isCalendarFetching: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export default function CalendarHeader({
  searchActive,
  setSearchActive,
  searchQuery,
  setSearchQuery,
  viewMode,
  setViewMode,
  viewDropdownVisible,
  setViewDropdownVisible,
  headerTitle,
  isCalendarFetching,
  onPrev,
  onNext,
}: CalendarHeaderProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Top Header / Search Header */}
      {searchActive ? (
        <View className="px-5 py-3.5 border-b border-slate-200 bg-white flex-row items-center justify-between">
          <View className="flex-row items-center flex-1 gap-3">
            <TouchableOpacity
              onPress={() => {
                setSearchActive(false);
                setSearchQuery("");
              }}
              className="p-1"
            >
              <Feather name="arrow-left" size={20} color="#475569" />
            </TouchableOpacity>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("calendar.search_placeholder", {
                defaultValue: "Tìm kiếm...",
              })}
              placeholderTextColor="#94A3B8"
              autoFocus
              returnKeyType="search"
              className="flex-1 text-base text-slate-800 py-1"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                className="p-1"
              >
                <Feather name="x" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <DashboardHeader
          title={t("dashboard.tab_calendar", "Lịch")}
          rightAction={
            <TouchableOpacity
              onPress={() => setSearchActive(true)}
              className="w-9 h-9 rounded-full bg-slate-100 justify-center items-center active:bg-slate-200"
            >
              <Feather name="search" size={18} color="#475569" />
            </TouchableOpacity>
          }
        />
      )}

      {/* Toolbar: Navigation title & View mode switcher */}
      {!searchActive && (
        <View className="px-4 py-3 flex-row justify-between items-center bg-white border-b border-slate-100 z-30">
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={onPrev}
              className="p-1.5 rounded-full active:bg-slate-100"
            >
              <Feather name="chevron-left" size={20} color="#475569" />
            </TouchableOpacity>
            <Text className="text-base font-bold text-slate-800">
              {headerTitle}
            </Text>
            <TouchableOpacity
              onPress={onNext}
              className="p-1.5 rounded-full active:bg-slate-100"
            >
              <Feather name="chevron-right" size={20} color="#475569" />
            </TouchableOpacity>
            {isCalendarFetching && (
              <ActivityIndicator
                size="small"
                color="#0052FF"
                className="ml-1"
              />
            )}
          </View>

          <View className="relative z-30">
            <TouchableOpacity
              onPress={() => setViewDropdownVisible(!viewDropdownVisible)}
              className="flex-row items-center bg-blue-50 border border-blue-200 px-3.5 py-1.5 rounded-full gap-1.5"
            >
              <Text className="text-xs font-bold text-blue-600">
                {viewMode === "DAY" &&
                  t("calendar.view_day", { defaultValue: "Ngày" })}
                {viewMode === "WEEK" &&
                  t("calendar.view_week", { defaultValue: "Tuần" })}
                {viewMode === "MONTH" &&
                  t("calendar.view_month", { defaultValue: "Tháng" })}
              </Text>
              <Feather name="chevron-down" size={14} color="#0052FF" />
            </TouchableOpacity>

            {viewDropdownVisible && (
              <View className="absolute top-10 right-0 bg-white rounded-xl p-1.5 w-32 border border-slate-200 z-50">
                {(["DAY", "WEEK", "MONTH"] as const).map((mode) => {
                  const isActive = viewMode === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => {
                        setViewMode(mode);
                        setViewDropdownVisible(false);
                      }}
                      className={`py-2 px-3 rounded-lg ${
                        isActive ? "bg-blue-50" : ""
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          isActive
                            ? "font-bold text-blue-600"
                            : "text-slate-600"
                        }`}
                      >
                        {mode === "DAY" &&
                          t("calendar.view_day", { defaultValue: "Ngày" })}
                        {mode === "WEEK" &&
                          t("calendar.view_week", { defaultValue: "Tuần" })}
                        {mode === "MONTH" &&
                          t("calendar.view_month", { defaultValue: "Tháng" })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Overlay to close view dropdown */}
      {viewDropdownVisible && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setViewDropdownVisible(false)}
          className="absolute inset-0 z-20"
        />
      )}
    </>
  );
}
