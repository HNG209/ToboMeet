import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  Image,
  SafeAreaView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";

interface UserDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 330);

export default function UserDrawerModal({
  isOpen,
  onClose,
  onOpenSettings,
}: UserDrawerModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: profile } = useGetMeQuery();

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 1,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, slideAnim, fadeAnim]);

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

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0],
  });

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Backdrop overlay */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              opacity: fadeAnim,
            }}
          />
        </TouchableWithoutFeedback>

        {/* Drawer Content (Trượt từ trái sang phải) */}
        <Animated.View
          style={{
            width: DRAWER_WIDTH,
            height: "100%",
            backgroundColor: "#ffffff",
            transform: [{ translateX }],
            shadowColor: "#000",
            shadowOffset: { width: 4, height: 0 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 20,
          }}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <View style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {/* ── HEADER CỦA DRAWER: Hiện đầy đủ thông tin người dùng ── */}
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingTop: Platform.OS === "android" ? 36 : 16,
                  paddingBottom: 20,
                  backgroundColor: "#F8FAFC",
                  borderBottomWidth: 1,
                  borderBottomColor: "#E2E8F0",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Avatar lớn kèm chấm trạng thái online */}
                  <View style={{ position: "relative" }}>
                    <View
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 29,
                        backgroundColor: "#DBEAFE",
                        justifyContent: "center",
                        alignItems: "center",
                        overflow: "hidden",
                        borderWidth: 2,
                        borderColor: "#ffffff",
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
                            fontSize: 22,
                          }}
                        >
                          {(profile?.displayName || "U")
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Nút đóng drawer */}
                  <TouchableOpacity
                    onPress={onClose}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: "#ffffff",
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                    }}
                  >
                    <Feather name="x" size={16} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Thông tin tên & email người dùng */}
                <View style={{ marginTop: 12 }}>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "bold",
                      color: "#0F172A",
                    }}
                    numberOfLines={1}
                  >
                    {profile?.displayName || "Người dùng"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#64748B",
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {profile?.email || ""}
                  </Text>
                </View>
              </View>

              {/* ── DANH SÁCH MENU BÊN TRONG DRAWER ── */}
              <View style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 12 }}>
                {/* Mục Cài đặt chính (Đã được chuyển từ bottom tab vào đây) */}
                <TouchableOpacity
                  onPress={onOpenSettings}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 13,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    backgroundColor: "#EFF6FF",
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: "#0052FF",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                    }}
                  >
                    <Feather name="settings" size={18} color="#ffffff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "bold",
                        color: "#0052FF",
                      }}
                    >
                      {t("dashboard.tab_settings", "Cài đặt")}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#60A5FA" }}>
                      Thiết bị, ngôn ngữ, mật khẩu
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color="#0052FF" />
                </TouchableOpacity>

                {/* Menu items phụ */}
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    router.push("/dashboard/settings/devices");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                  }}
                >
                  <Feather
                    name="smartphone"
                    size={18}
                    color="#64748B"
                    style={{ marginRight: 12 }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: "#334155",
                      flex: 1,
                    }}
                  >
                    {t("settings.tabs.devices", "Quản lý thiết bị")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    router.push("/dashboard/settings/language");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                  }}
                >
                  <Feather
                    name="globe"
                    size={18}
                    color="#64748B"
                    style={{ marginRight: 12 }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: "#334155",
                      flex: 1,
                    }}
                  >
                    {t("settings.tabs.language", "Ngôn ngữ")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    router.push("/dashboard/settings/password");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                  }}
                >
                  <Feather
                    name="lock"
                    size={18}
                    color="#64748B"
                    style={{ marginRight: 12 }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: "#334155",
                      flex: 1,
                    }}
                  >
                    {t("settings.password.header", "Đổi mật khẩu")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── FOOTER CỦA DRAWER: Nút Đăng xuất ── */}
              <View
                style={{
                  padding: 16,
                  borderTopWidth: 1,
                  borderTopColor: "#F1F5F9",
                }}
              >
                <TouchableOpacity
                  onPress={handleLogout}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    backgroundColor: "#FEF2F2",
                    borderWidth: 1,
                    borderColor: "#FEE2E2",
                  }}
                >
                  <Feather
                    name="log-out"
                    size={16}
                    color="#EF4444"
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "bold",
                      color: "#EF4444",
                    }}
                  >
                    {t("dashboard.logout", "Đăng xuất")}
                  </Text>
                </TouchableOpacity>

                <Text
                  style={{
                    fontSize: 10,
                    color: "#94A3B8",
                    textAlign: "center",
                    marginTop: 10,
                  }}
                >
                  ToboMeet v1.0.0
                </Text>
              </View>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}
