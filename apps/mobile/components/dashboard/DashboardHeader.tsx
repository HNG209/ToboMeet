import React from "react";
import { View, Text, TouchableOpacity, Image, Platform } from "react-native";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import { useDashboardDrawer } from "./DashboardDrawerContext";

interface DashboardHeaderProps {
  title: string;
  rightAction?: React.ReactNode;
}

export default function DashboardHeader({
  title,
  rightAction,
}: DashboardHeaderProps) {
  const { data: profile } = useGetMeQuery();
  const { openUserDrawer } = useDashboardDrawer();

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingTop: Platform.OS === "android" ? 12 : 8,
        paddingBottom: 12,
        backgroundColor: "#ffffff",
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
      }}
    >
      {/* Left: Avatar (Bấm vào để mở Drawer từ trái qua phải) + Tên mục tương ứng (giống Teams) */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity
          onPress={openUserDrawer}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ position: "relative" }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "#DBEAFE",
              justifyContent: "center",
              alignItems: "center",
              overflow: "hidden",
              borderWidth: 1.5,
              borderColor: "#BFDBFE",
            }}
          >
            {profile?.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <Text
                style={{
                  fontWeight: "bold",
                  color: "#0052FF",
                  fontSize: 15,
                }}
              >
                {(profile?.displayName || "U").charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Hiện tên mục tương ứng khi chuyển tab (tương tự teams: Nhóm / Trò chuyện / Agent / Lịch / Thông báo) */}
        <Text
          style={{
            fontSize: 19,
            fontWeight: "bold",
            color: "#0F172A",
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
      </View>

      {/* Right: Screen-specific actions */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {rightAction}
      </View>
    </View>
  );
}
