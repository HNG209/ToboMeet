import React from "react";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import { useNotificationCacheManager } from "../../hooks/useNotificationCacheManager";
import { useTranslation } from "react-i18next";

export default function DashboardLayout() {
  const { t } = useTranslation();
  const { data: myProfile } = useGetMeQuery();
  const { updateUnreadNotificationBadge } = useNotificationCacheManager();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0052FF",
        tabBarInactiveTintColor: "#94A3B8",
        tabBarStyle: {
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: "#f1f5f9",
          backgroundColor: "#ffffff",
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "bold",
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      {/* Tab 1: Nhóm */}
      <Tabs.Screen
        name="index"
        options={{
          title: t("dashboard.tab_rooms"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="video" size={size} color={color} />
          ),
        }}
      />

      {/* Tab 2: Trò chuyện */}
      <Tabs.Screen
        name="chat"
        options={{
          title: t("dashboard.tab_chat", "Trò chuyện"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="message-square" size={size} color={color} />
          ),
        }}
      />

      {/* Tab 3: Lịch */}
      <Tabs.Screen
        name="calendar"
        options={{
          title: t("dashboard.tab_calendar"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />

      {/* Tab 3: Thông báo (MỚI) */}
      <Tabs.Screen
        name="notifications"
        listeners={{
          tabPress: () => {
            // Tắt chấm đỏ ngay lập tức khi bấm vào tab giống như web
            if (myProfile?.hasUnreadNotifications) {
              updateUnreadNotificationBadge(false);
            }
          },
        }}
        options={{
          title: t("dashboard.tab_notification"),
          tabBarIcon: ({ color, size }) => (
            <View>
              <Feather name="bell" size={size} color={color} />
              {/* Hiển thị chấm đỏ nếu có thông báo chưa đọc */}
              {myProfile?.hasUnreadNotifications && (
                <View className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-[1.5px] border-white" />
              )}
            </View>
          ),
        }}
      />

      {/* Tab 4: Cài đặt */}
      <Tabs.Screen
        name="settings"
        options={{
          title: t("dashboard.tab_settings"),
          tabBarIcon: ({ color, size }) => (
            <Feather name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
