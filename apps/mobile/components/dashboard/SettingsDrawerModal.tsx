import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";

interface SettingsDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsDrawerModal({
  isOpen,
  onClose,
}: SettingsDrawerModalProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      onClose();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/(auth)/login");
    } catch (error) {
      console.error("Lỗi đăng xuất", error);
      toast.error("Lỗi đăng xuất, vui lòng thử lại sau.");
    }
  };

  const currentLanguageName = i18n.language.startsWith("vi")
    ? t("settings.language.vietnamese") || "Tiếng Việt"
    : t("settings.language.english") || "English (US)";

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(15, 23, 42, 0.5)",
        }}
      >
        {/* Backdrop clickable */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={{ flex: 1 }}
        />

        {/* Bottom Drawer Content */}
        <View
          style={{
            backgroundColor: "#F8FAFC",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "85%",
            minHeight: "55%",
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 24,
          }}
        >
          {/* Top handle pill */}
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 6 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#CBD5E1",
              }}
            />
          </View>

          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 22,
              paddingVertical: 14,
              backgroundColor: "#ffffff",
              borderBottomWidth: 1,
              borderBottomColor: "#E2E8F0",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: "#EFF6FF",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Feather name="settings" size={18} color="#0052FF" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: "#0F172A" }}>
                {t("settings.title", "Cài đặt")}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: "#F1F5F9",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Feather name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Settings list */}
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Ngôn ngữ */}
            <TouchableOpacity
              onPress={() => {
                onClose();
                router.push("/dashboard/settings/language");
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 15,
                borderRadius: 18,
                backgroundColor: "#ffffff",
                borderWidth: 1,
                borderColor: "#E2E8F0",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flex: 1 }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    backgroundColor: "#EFF6FF",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Feather name="globe" size={20} color="#0052FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "bold", color: "#1E293B", fontSize: 14 }}>
                    {t("settings.tabs.language", "Ngôn ngữ")}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                    {currentLanguageName}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* 2. Quản lý thiết bị */}
            <TouchableOpacity
              onPress={() => {
                onClose();
                router.push("/dashboard/settings/devices");
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 15,
                borderRadius: 18,
                backgroundColor: "#ffffff",
                borderWidth: 1,
                borderColor: "#E2E8F0",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flex: 1 }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    backgroundColor: "#EFF6FF",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Feather name="smartphone" size={20} color="#0052FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "bold", color: "#1E293B", fontSize: 14 }}>
                    {t("settings.tabs.devices", "Quản lý thiết bị")}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                    Các thiết bị đã đăng nhập tài khoản
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* 3. Mật khẩu */}
            <TouchableOpacity
              onPress={() => {
                onClose();
                router.push("/dashboard/settings/password");
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingVertical: 15,
                borderRadius: 18,
                backgroundColor: "#ffffff",
                borderWidth: 1,
                borderColor: "#E2E8F0",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14, flex: 1 }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    backgroundColor: "#EFF6FF",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Feather name="lock" size={20} color="#0052FF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "bold", color: "#1E293B", fontSize: 14 }}>
                    {t("settings.password.header", "Đổi mật khẩu")}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                    Cập nhật mật khẩu bảo vệ tài khoản
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* 4. Logout button */}
            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                onPress={handleLogout}
                style={{
                  width: "100%",
                  backgroundColor: "#FEF2F2",
                  paddingVertical: 15,
                  borderRadius: 18,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#FEE2E2",
                }}
              >
                <Feather
                  name="log-out"
                  size={18}
                  color="#EF4444"
                  style={{ marginRight: 8 }}
                />
                <Text style={{ color: "#EF4444", fontWeight: "bold", fontSize: 14 }}>
                  {t("dashboard.logout", "Đăng xuất")}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <SafeAreaView />
        </View>
      </View>
    </Modal>
  );
}
