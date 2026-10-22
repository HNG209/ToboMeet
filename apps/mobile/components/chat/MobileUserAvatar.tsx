import React from "react";
import { View, Text, Image } from "react-native";

interface MobileUserAvatarProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: number;
  className?: string;
}

const BG_COLORS = [
  "#2563EB", // blue-600
  "#7C3AED", // violet-600
  "#DB2777", // pink-600
  "#D97706", // amber-600
  "#059669", // emerald-600
  "#0891B2", // cyan-600
  "#4F46E5", // indigo-600
];

function getBgColor(name?: string | null): string {
  if (!name) return BG_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % BG_COLORS.length;
  return BG_COLORS[index];
}

function getInitial(name?: string | null): string {
  if (!name || !name.trim()) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.trim().charAt(0).toUpperCase();
}

export default function MobileUserAvatar({
  avatarUrl,
  displayName,
  size = 40,
}: MobileUserAvatarProps) {
  const initial = getInitial(displayName);
  const bgColor = getBgColor(displayName);
  const fontSize = Math.max(11, Math.round(size * 0.38));

  if (avatarUrl && typeof avatarUrl === "string" && avatarUrl.trim().length > 0) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#E2E8F0",
        }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontSize,
          fontWeight: "700",
        }}
      >
        {initial}
      </Text>
    </View>
  );
}
