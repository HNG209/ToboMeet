import React from "react";
import { View, StyleProp, ViewStyle } from "react-native";

interface BotIconProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function BotIcon({ size = 24, color = "#ffffff", style }: BotIconProps) {
  const scale = size / 24;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          transform: [{ scale }],
          position: "relative",
        }}
      >
        {/* Anten: Path M12 8V4H8 */}
        <View
          style={{
            position: "absolute",
            left: 7.5,
            top: 4,
            width: 4.5,
            height: 4.5,
            borderTopWidth: 2,
            borderRightWidth: 2,
            borderColor: color,
            borderTopRightRadius: 2,
            borderTopLeftRadius: 1,
          }}
        />

        {/* Đầu robot: Rect x=4 y=8 w=16 h=12 rx=2 */}
        <View
          style={{
            position: "absolute",
            left: 4,
            top: 8,
            width: 16,
            height: 12,
            borderWidth: 2,
            borderColor: color,
            borderRadius: 2.5,
          }}
        />

        {/* Tai trái: Path M2 14h2 */}
        <View
          style={{
            position: "absolute",
            left: 1.5,
            top: 13,
            width: 2.5,
            height: 2,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />

        {/* Tai phải: Path M20 14h2 */}
        <View
          style={{
            position: "absolute",
            left: 20,
            top: 13,
            width: 2.5,
            height: 2,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />

        {/* Mắt trái: Path M9 13v2 */}
        <View
          style={{
            position: "absolute",
            left: 8,
            top: 12.5,
            width: 2,
            height: 2.5,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />

        {/* Mắt phải: Path M15 13v2 */}
        <View
          style={{
            position: "absolute",
            left: 14,
            top: 12.5,
            width: 2,
            height: 2.5,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
      </View>
    </View>
  );
}

export { BotIcon as Bot };
export default BotIcon;

