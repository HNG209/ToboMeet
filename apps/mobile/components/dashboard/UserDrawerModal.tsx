import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";

interface UserDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 330);

export default function UserDrawerModal({
  isOpen,
  onClose,
}: UserDrawerModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useGetMeQuery();

  const [modalVisible, setModalVisible] = useState(isOpen);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      setModalVisible(true);
      slideAnim.setValue(0);
      fadeAnim.setValue(0);
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
    } else if (modalVisible) {
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
      ]).start(() => {
        setModalVisible(false);
      });
    }
  }, [isOpen]);

  const handleClose = () => {
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
    ]).start(() => {
      setModalVisible(false);
      onClose();
    });
  };

  const handleLogout = async () => {
    try {
      handleClose();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/(auth)/login");
    } catch (error) {
      console.error("Lỗi đăng xuất", error);
      toast.error(t("dashboard.logout_error", "Lỗi đăng xuất, vui lòng thử lại sau."));
    }
  };

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0],
  });

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Backdrop overlay: click ra ngoài để đóng */}
        <TouchableWithoutFeedback onPress={handleClose}>
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

        {/* Drawer Content */}
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
          <View
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              paddingTop: Math.max(insets.top, 24),
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            {/* ── HEADER CỦA DRAWER: Avatar, Tên & Email chung dòng/khối ngang ── */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: "#F8FAFC",
                borderBottomWidth: 1,
                borderBottomColor: "#E2E8F0",
              }}
            >
              {/* Khối bấm chuyển hướng sang trang profile */}
              <TouchableOpacity
                onPress={() => {
                  handleClose();
                  router.push("/profile");
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                {/* Avatar */}
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
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
                        fontSize: 18,
                      }}
                    >
                      {(profile?.displayName || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  )}
                </View>

                {/* Tên & Email hiển thị chung hàng/khối */}
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "bold",
                      color: "#0F172A",
                    }}
                    numberOfLines={1}
                  >
                    {profile?.displayName || t("common.user", "Người dùng")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#64748B",
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {profile?.email || ""}
                  </Text>
                </View>

                <Feather
                  name="chevron-right"
                  size={16}
                  color="#94A3B8"
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
            </View>

            {/* ── DANH SÁCH MENU BÊN TRONG DRAWER ── */}
            <View
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 12,
                gap: 4,
              }}
            >
              {/* Tab 1: Cuộc họp cá nhân */}
              <TouchableOpacity
                onPress={() => {
                  handleClose();
                  router.push("/settings/personal-meeting");
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 12,
                }}
              >
                <Feather
                  name="video"
                  size={18}
                  color="#0052FF"
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
                  {t("settings.tabs.personal_meeting", "Cuộc họp cá nhân")}
                </Text>
                <Feather name="chevron-right" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* Tab 2: Quản lý thiết bị */}
              <TouchableOpacity
                onPress={() => {
                  handleClose();
                  router.push("/settings/devices");
                }}
                activeOpacity={0.7}
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
                <Feather name="chevron-right" size={16} color="#CBD5E1" />
              </TouchableOpacity>

              {/* Tab 3: Ngôn ngữ */}
              <TouchableOpacity
                onPress={() => {
                  handleClose();
                  router.push("/settings/language");
                }}
                activeOpacity={0.7}
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
                <Feather name="chevron-right" size={16} color="#CBD5E1" />
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
                activeOpacity={0.8}
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
        </Animated.View>
      </View>
    </Modal>
  );
}
