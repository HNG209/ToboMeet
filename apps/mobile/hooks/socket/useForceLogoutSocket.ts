// hooks/socket/useForceLogoutSocket.ts
import { useEffect } from "react";
import { socket } from "../../lib/socket";
import { supabase } from "../../lib/supabase";
import { router } from "expo-router";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toast } from "../../lib/toast";

interface ForceLogoutPayload {
  revokedSessionIds?: string[];
  reason?: string;
}

interface SessionRevokedPayload {
  sessionId: string;
}

function parseSessionIdFromJwt(jwt: string): string | null {
  try {
    const base64Payload = jwt.split(".")[1];
    if (!base64Payload) return null;
    const padded = base64Payload.replace(/-/g, "+").replace(/_/g, "/");
    
    // Simple pure-JS base64 decoder safe for React Native
    const decodeBase64 = (str: string): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let buffer = '';
      str = str.replace(/=+$/, '');
      for (let i = 0, len = str.length; i < len; i += 4) {
        const chunk = (chars.indexOf(str[i]) << 18) |
                      (chars.indexOf(str[i + 1]) << 12) |
                      ((i + 2 < len ? chars.indexOf(str[i + 2]) : 0) << 6) |
                      (i + 3 < len ? chars.indexOf(str[i + 3]) : 0);
        
        const r1 = (chunk >> 16) & 255;
        const r2 = (chunk >> 8) & 255;
        const r3 = chunk & 255;
        
        buffer += String.fromCharCode(r1);
        if (i + 2 < len) buffer += String.fromCharCode(r2);
        if (i + 3 < len) buffer += String.fromCharCode(r3);
      }
      return decodeURIComponent(escape(buffer));
    };

    const json = JSON.parse(decodeBase64(padded));
    return (json.session_id as string) || (json.sid as string) || null;
  } catch {
    return null;
  }
}

async function getCurrentSessionId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    return accessToken ? parseSessionIdFromJwt(accessToken) : null;
  } catch {
    return null;
  }
}

/**
 * Lắng nghe sự kiện "force_logout" và "session_revoked" từ server.
 * Tự động: hiển thị Alert → clear token → signOut → redirect Login.
 */
export function useForceLogoutSocket() {
  useEffect(() => {
    const handleForceLogout = async (data: ForceLogoutPayload) => {
      const currentSessionId = await getCurrentSessionId();

      // Chỉ thực hiện force logout nếu session hiện tại của thiết bị nằm trong danh sách bị thu hồi
      if (data?.revokedSessionIds) {
        if (!currentSessionId || !data.revokedSessionIds.includes(currentSessionId)) {
          return;
        }
      }

      const isRolePromoted = data?.reason === "role_promoted_admin";
      const isRoleUpdated = data?.reason === "role_updated";

      // Hiển thị thông báo cho user
      Alert.alert(
        isRolePromoted || isRoleUpdated
          ? "Quyền tài khoản đã thay đổi"
          : "Phiên đăng nhập kết thúc",
        isRolePromoted
          ? "Tài khoản của bạn đã được cấp quyền Quản trị viên. Vui lòng đăng nhập lại để áp dụng quyền mới."
          : isRoleUpdated
            ? "Vai trò tài khoản của bạn đã được cập nhật. Vui lòng đăng nhập lại."
            : "Phiên đăng nhập của bạn đã bị đăng xuất từ một thiết bị khác.",
        [
          {
            text: "OK",
            onPress: async () => {
              await performLogout();
            },
          },
        ],
        { cancelable: false },
      );

      // Đồng thời thực hiện logout sau 1.5s (kể cả khi user chưa bấm OK)
      setTimeout(() => {
        performLogout();
      }, 1500);
    };

    const handleSessionRevoked = async (data: SessionRevokedPayload) => {
      if (!data?.sessionId) return;

      const currentSessionId = await getCurrentSessionId();

      // Không phải session của thiết bị này → bỏ qua
      if (!currentSessionId || currentSessionId !== data.sessionId) return;

      Alert.alert(
        "Thiết bị bị đăng xuất",
        "Phiên đăng nhập trên thiết bị này đã bị thu hồi từ xa.",
        [
          {
            text: "OK",
            onPress: async () => {
              await performLogout();
            },
          },
        ],
        { cancelable: false },
      );

      setTimeout(() => {
        performLogout();
      }, 1500);
    };

    socket.on("force_logout", handleForceLogout);
    socket.on("session_revoked", handleSessionRevoked);

    return () => {
      socket.off("force_logout", handleForceLogout);
      socket.off("session_revoked", handleSessionRevoked);
    };
  }, []);
}

async function performLogout() {
  try {
    // 1. Ngắt kết nối Socket trước
    if (socket.connected) {
      socket.disconnect();
    }

    // 2. Đăng xuất Supabase (xóa session local)
    await supabase.auth.signOut({ scope: "local" });

    // 3. Xóa toàn bộ AsyncStorage (token, cache, v.v.)
    await AsyncStorage.clear();
  } catch (err) {
    console.error("[ForceLogout] Lỗi khi logout:", err);
  } finally {
    // 4. Redirect về màn Login dù có lỗi hay không
    try {
      router.replace("/(auth)/login");
    } catch {
      // Fallback nếu router không sẵn sàng
    }
  }
}
