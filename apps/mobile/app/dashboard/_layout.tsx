import React from "react";
import { Tabs } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { View, Text, TouchableOpacity } from "react-native";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import { useNotificationCacheManager } from "../../hooks/useNotificationCacheManager";
import { useTranslation } from "react-i18next";
import {
  DashboardDrawerProvider,
  useDashboardDrawer,
} from "../../components/dashboard/DashboardDrawerContext";
import UserDrawerModal from "../../components/dashboard/UserDrawerModal";
import SettingsDrawerModal from "../../components/dashboard/SettingsDrawerModal";

function DrawerModals() {
  const {
    isUserDrawerOpen,
    closeUserDrawer,
    isSettingsDrawerOpen,
    closeSettingsDrawer,
    openSettingsFromUserDrawer,
  } = useDashboardDrawer();

  return (
    <>
      <UserDrawerModal
        isOpen={isUserDrawerOpen}
        onClose={closeUserDrawer}
        onOpenSettings={openSettingsFromUserDrawer}
      />
      <SettingsDrawerModal
        isOpen={isSettingsDrawerOpen}
        onClose={closeSettingsDrawer}
      />
    </>
  );
}

function DashboardTabs() {
  const { t } = useTranslation();
  const { data: myProfile } = useGetMeQuery();
  const { updateUnreadNotificationBadge } = useNotificationCacheManager();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#0052FF",
          tabBarInactiveTintColor: "#94A3B8",
          tabBarStyle: {
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: "#f1f5f9",
            backgroundColor: "#ffffff",
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
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
            title: t("dashboard.tab_rooms", "Nhóm"),
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

        {/* Tab 3: Agent (Nổi bật ở giữa, ép vào khung tròn và phóng to) */}
        <Tabs.Screen
          name="agent"
          options={{
            title: t("dashboard.tab_agent", "Agent"),
            tabBarButton: (props: any) => {
              const isFocused = props.accessibilityState?.selected;
              return (
                <TouchableOpacity
                  {...props}
                  activeOpacity={0.85}
                  style={{
                    top: -14,
                    justifyContent: "center",
                    alignItems: "center",
                    flex: 1,
                  }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: "#0052FF",
                      justifyContent: "center",
                      alignItems: "center",
                      shadowColor: "#0052FF",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.35,
                      shadowRadius: 8,
                      elevation: 6,
                      borderWidth: 3.5,
                      borderColor: "#ffffff",
                    }}
                  >
                    <MaterialCommunityIcons
                      name="robot"
                      size={26}
                      color="#ffffff"
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "bold",
                      color: isFocused ? "#0052FF" : "#64748B",
                      marginTop: 2,
                    }}
                  >
                    {t("dashboard.tab_agent", "Agent")}
                  </Text>
                </TouchableOpacity>
              );
            },
          }}
        />

        {/* Tab 4: Lịch */}
        <Tabs.Screen
          name="calendar"
          options={{
            title: t("dashboard.tab_calendar", "Lịch"),
            tabBarIcon: ({ color, size }) => (
              <Feather name="calendar" size={size} color={color} />
            ),
          }}
        />

        {/* Tab 5: Thông báo */}
        <Tabs.Screen
          name="notifications"
          listeners={{
            tabPress: () => {
              if (myProfile?.hasUnreadNotifications) {
                updateUnreadNotificationBadge(false);
              }
            },
          }}
          options={{
            title: t("dashboard.tab_notification", "Thông báo"),
            tabBarIcon: ({ color, size }) => (
              <View>
                <Feather name="bell" size={size} color={color} />
                {myProfile?.hasUnreadNotifications && (
                  <View className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-[1.5px] border-white" />
                )}
              </View>
            ),
          }}
        />

        {/* Ẩn hoàn toàn tab Cài đặt khỏi bottom tabs */}
        <Tabs.Screen
          name="settings"
          options={{
            href: null,
          }}
        />
      </Tabs>

      {/* Drawers: User info drawer & Settings bottom drawer */}
      <DrawerModals />
    </View>
  );
}

export default function DashboardLayout() {
  return (
    <DashboardDrawerProvider>
      <DashboardTabs />
    </DashboardDrawerProvider>
  );
}
