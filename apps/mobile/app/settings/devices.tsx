import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { Feather } from "@expo/vector-icons";
import {
  useGetSessionsQuery,
  useGetLoggedOutSessionsQuery,
  useRevokeSessionMutation,
  useRevokeOtherSessionsMutation,
  UserSession,
} from "../../lib/redux/features/users/usersApi";
import { supabase } from "../../lib/supabase";
import { router } from "expo-router";
import { toast } from "../../lib/toast";
import { socket } from "../../lib/socket";

function formatLocation(city?: string, country?: string, isp?: string): string {
  const INVALID = ["không xác định", "unknown", ""];
  const safeCity =
    city && !INVALID.includes(city.trim().toLowerCase()) ? city.trim() : "";
  const safeCountry =
    country && !INVALID.includes(country.trim().toLowerCase())
      ? country.trim()
      : "";
  const safeIsp =
    isp && !INVALID.includes(isp.trim().toLowerCase()) ? isp.trim() : "";

  if (safeCity && safeCountry) return `${safeCity}, ${safeCountry}`;
  if (safeIsp && safeCountry) return `${safeIsp}, ${safeCountry}`;
  if (safeCountry) return safeCountry;
  if (safeIsp) return safeIsp;
  return "Không xác định";
}

function getRelativeTime(dateStr: string, locale: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (locale.startsWith("vi")) {
      if (minutes < 1) return "Vừa xong";
      if (minutes < 60) return `${minutes} phút trước`;
      if (hours < 24) return `${hours} giờ trước`;
      if (days === 1) return "Hôm qua";
      return `${days} ngày trước`;
    } else {
      if (minutes < 1) return "Just now";
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      if (days === 1) return "Yesterday";
      return `${days}d ago`;
    }
  } catch {
    return dateStr;
  }
}

function getMethodName(method: string | undefined, t: TFunction) {
  if (!method) return t("settings.devices.method_password") || "Mật khẩu";
  const m = method.toLowerCase();
  if (m === "google" || m === "oauth") return t("settings.devices.method_google") || "Google";
  if (m === "otp") return t("settings.devices.method_otp") || "Mã OTP";
  if (m === "qr") return t("settings.devices.method_qr") || "Mã QR";
  return t("settings.devices.method_password") || "Mật khẩu";
}

function translateDeviceName(name: string | undefined, t: TFunction): string {
  if (!name) return "Không rõ";
  const nameLower = name.toLowerCase().trim();
  
  if (nameLower === "android device" || nameLower === "android") {
    return t("settings.devices.device_android") || "Thiết bị Android";
  }
  if (nameLower === "iphone") {
    return t("settings.devices.device_iphone") || "iPhone";
  }
  if (nameLower === "ipad") {
    return t("settings.devices.device_ipad") || "iPad";
  }
  if (nameLower === "windows pc" || nameLower === "windows") {
    return t("settings.devices.device_windows") || "Máy tính Windows";
  }
  if (nameLower === "macos" || nameLower === "macintosh" || nameLower === "macbook") {
    return t("settings.devices.device_macos") || "Máy tính macOS";
  }
  if (nameLower === "linux") {
    return t("settings.devices.device_linux") || "Máy tính Linux";
  }
  if (nameLower === "trình duyệt web" || nameLower === "trìnhduyệtweb" || nameLower === "browser") {
    return t("settings.devices.device_web_browser") || "Trình duyệt Web";
  }
  
  return name;
}

export default function DeviceSettingsScreen() {
  const { t, i18n } = useTranslation();

  const [showAllLoggedOut, setShowAllLoggedOut] = useState(false);
  const [loggedOutPage, setLoggedOutPage] = useState(1);
  const [allLoggedOutSessions, setAllLoggedOutSessions] = useState<UserSession[]>([]);

  const {
    data: sessions,
    isLoading: isSessionsLoading,
    refetch,
  } = useGetSessionsQuery(undefined);

  const { data: loggedOutData, isFetching: isLoggedOutFetching } = useGetLoggedOutSessionsQuery(
    { page: loggedOutPage, limit: 10 },
    { skip: !showAllLoggedOut }
  );

  useEffect(() => {
    if (loggedOutData?.sessions) {
      setAllLoggedOutSessions((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const newSessions = loggedOutData.sessions.filter((s) => !existingIds.has(s.id));
        if (loggedOutPage === 1) {
          return loggedOutData.sessions;
        }
        return [...prev, ...newSessions];
      });
    }
  }, [loggedOutData, loggedOutPage]);

  useEffect(() => {
    if (showAllLoggedOut) {
      setLoggedOutPage(1);
    }
  }, [showAllLoggedOut]);

  const [revokeSession, { isLoading: isRevokingSingle }] = useRevokeSessionMutation();
  const [revokeOtherSessions, { isLoading: isRevokingOthers }] = useRevokeOtherSessionsMutation();
  const isRevoking = isRevokingSingle || isRevokingOthers;

  // Lắng nghe sự kiện socket để tự động cập nhật danh sách thiết bị
  useEffect(() => {
    const handleSessionListChanged = () => {
      refetch();
    };

    socket.on("session_list_changed", handleSessionListChanged);
    return () => {
      socket.off("session_list_changed", handleSessionListChanged);
    };
  }, [refetch]);

  const handleRevokeSession = async (sessionId: string) => {
    Alert.alert(
      t("settings.devices.header"),
      t("settings.devices.confirm_logout"),
      [
        { text: t("settings.cancel"), style: "cancel" },
        {
          text: "OK",
          style: "destructive",
          onPress: async () => {
            try {
              await revokeSession(sessionId).unwrap();
              refetch();
            } catch (err) {
              console.error(err);
              toast.error("settings.devices.logout_failed");
            }
          },
        },
      ],
    );
  };

  const handleRevokeAll = () => {
    Alert.alert(
      t("settings.devices.header"),
      "Bạn có chắc muốn đăng xuất tất cả các thiết bị khác?",
      [
        { text: t("settings.cancel"), style: "cancel" },
        {
          text: "Đăng xuất",
          style: "destructive",
          onPress: async () => {
            try {
              // Lấy socketId của thiết bị hiện tại để server exclude khi emit force_logout
              const currentSocketId = socket.connected ? (socket.id ?? "") : "";
              await revokeOtherSessions({ socketId: currentSocketId }).unwrap();
              toast.success("Đã đăng xuất khỏi tất cả các thiết bị khác.");
              refetch();
            } catch (err) {
              console.error(err);
              toast.error("Đăng xuất thiết bị khác thất bại.");
            }
          },
        },
      ],
    );
  };

  const currentDevice = sessions?.currentDevice ?? null;
  const otherDevices = sessions?.otherDevices ?? [];
  const recentlyLoggedOut = sessions?.recentlyLoggedOut ?? [];
  const hasOthers = otherDevices.length > 0;

  const displayedLoggedOut = showAllLoggedOut 
    ? allLoggedOutSessions 
    : recentlyLoggedOut;

  const hasMoreLoggedOut = loggedOutData ? allLoggedOutSessions.length < loggedOutData.total : false;

  const renderDeviceItem = (session: UserSession, showRevokeButton: boolean = false) => {
    const relativeTime = session.loggedOutAt
      ? getRelativeTime(session.loggedOutAt, i18n.language)
      : "";

    return (
      <View
        key={session.id}
        className={`flex-row items-center justify-between p-4 rounded-2xl border ${
          session.isCurrent
            ? "border-blue-500/30 bg-blue-50/5"
            : "border-slate-100 bg-white"
        }`}
      >
        <View className="flex-row items-center gap-4 flex-1">
          {/* Device Icon */}
          <View
            className={`w-10 h-10 rounded-xl items-center justify-center ${
              session.isCurrent
                ? "bg-blue-500/10 text-[#0052FF]"
                : "bg-slate-100"
            }`}
          >
            {session.isMobile ? (
              <Feather
                name="smartphone"
                size={20}
                color={session.isCurrent ? "#0052FF" : "#64748B"}
              />
            ) : (
              <Feather
                name="monitor"
                size={20}
                color={session.isCurrent ? "#0052FF" : "#64748B"}
              />
            )}
          </View>

          {/* Device Info */}
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="font-bold text-slate-800 text-sm truncate">
                {translateDeviceName(
                  session.deviceName ||
                    (session.browser && session.os && session.os !== "Không rõ"
                      ? `${session.browser} - ${session.os}`
                      : session.browser || "Không rõ"),
                  t
                )}
              </Text>
              {session.isCurrent && (
                <View className="px-2 py-0.5 rounded-full bg-green-50 border border-green-200">
                  <Text className="text-[9px] font-bold text-green-700">
                    {t("settings.devices.current_device")}
                  </Text>
                </View>
              )}
            </View>
            <Text className="text-[10px] text-slate-400 font-semibold mt-1">
              📍 {formatLocation(session.city, session.country, session.isp) !== "Không xác định"
                ? formatLocation(session.city, session.country, session.isp)
                : session.ipAddress
                ? `IP: ${session.ipAddress}`
                : "Không xác định"}
            </Text>
            <Text className="text-[10px] text-slate-400 font-semibold mt-0.5">
              {session.loggedOutAt ? (
                <Text className="text-slate-400">{relativeTime}</Text>
              ) : (
                <Text className="text-slate-400">
                  {t("settings.devices.login_method_prefix") || "Đăng nhập bằng "}
                  {getMethodName(session.loginMethod, t)}
                </Text>
              )}
            </Text>
          </View>
        </View>

        {/* Revoke button */}
        {showRevokeButton && !session.isCurrent && !session.loggedOutAt && (
          <TouchableOpacity
            onPress={() => handleRevokeSession(session.id)}
            disabled={isRevoking}
            className="p-2 rounded-xl bg-red-50"
          >
            <Feather name="log-out" size={16} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="px-6 py-4 bg-white border-b border-slate-100 flex-row items-center gap-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1 -ml-1 rounded-full active:bg-slate-100"
        >
          <Feather name="arrow-left" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-slate-900">
          {t("settings.tabs.devices")}
        </Text>
      </View>

      {/* Content Area */}
      <ScrollView className="flex-1 p-6">
        <View className="gap-6 flex-1">
          <View>
            <Text className="text-base font-bold text-slate-800">
              {t("settings.devices.header")}
            </Text>
            <Text className="text-xs text-slate-400 mt-1 leading-relaxed">
              {t("settings.devices.desc")}
            </Text>
          </View>

          {/* Device list */}
          <View className="gap-4">
            {isSessionsLoading ? (
              <View className="items-center justify-center py-10 gap-3">
                <ActivityIndicator size="large" color="#0052FF" />
                <Text className="text-xs text-slate-400 font-semibold">
                  {t("settings.devices.loading")}
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                {/* Thiết bị này */}
                <View className="gap-2">
                  <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {t("settings.devices.section_current") || "Thiết bị này"}
                  </Text>
                  {currentDevice ? (
                    renderDeviceItem(currentDevice)
                  ) : (
                    <Text className="text-xs text-slate-400 py-2">
                      {t("settings.devices.loading")}
                    </Text>
                  )}
                </View>

                {/* Thiết bị khác đang đăng nhập */}
                <View className="gap-2 mt-2">
                  <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {t("settings.devices.section_others") || "Thiết bị khác đang đăng nhập"}
                  </Text>
                  {hasOthers ? (
                    <View className="gap-3">
                      {otherDevices.map((session) => renderDeviceItem(session, true))}
                    </View>
                  ) : (
                    <Text className="text-xs text-slate-400 py-2">
                      {t("settings.devices.empty")}
                    </Text>
                  )}

                  {hasOthers && (
                    <TouchableOpacity
                      onPress={handleRevokeAll}
                      disabled={isRevoking}
                      className="mt-2 w-full flex-row items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-50 border border-red-100 active:opacity-70"
                      style={{ opacity: isRevoking ? 0.5 : 1 }}
                    >
                      <Feather name="log-out" size={16} color="#EF4444" />
                      <Text className="text-red-500 font-bold text-sm">
                        Đăng xuất tất cả thiết bị khác
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Thiết bị đã đăng xuất gần đây */}
                <View className="gap-2 mt-2">
                  <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {t("settings.devices.section_logged_out") || "Thiết bị đã đăng xuất gần đây"}
                  </Text>
                  {recentlyLoggedOut.length > 0 ? (
                    <View className="gap-3">
                      {displayedLoggedOut.map((session) => renderDeviceItem(session))}

                      {!showAllLoggedOut && (sessions?.totalLoggedOut ?? 0) > 5 && (
                        <TouchableOpacity
                          onPress={() => setShowAllLoggedOut(true)}
                          className="w-full py-3 items-center justify-center"
                        >
                          <Text className="text-xs font-bold text-[#0052FF]">
                            {t("settings.devices.view_all_logged_out", { count: sessions?.totalLoggedOut ?? 0 })}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {showAllLoggedOut && hasMoreLoggedOut && (
                        <TouchableOpacity
                          onPress={() => setLoggedOutPage((p) => p + 1)}
                          disabled={isLoggedOutFetching}
                          className="w-full py-3 items-center justify-center"
                        >
                          <Text className={`text-xs font-bold text-[#0052FF] ${isLoggedOutFetching ? "opacity-50" : ""}`}>
                            {isLoggedOutFetching ? "Đang tải..." : "Tải thêm"}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <Text className="text-xs text-slate-400 py-2">
                      {t("settings.devices.empty_logged_out") || "Chưa có thiết bị nào đã đăng xuất gần đây."}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
