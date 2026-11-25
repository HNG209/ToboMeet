// hooks/socket/useForceLogoutSocket.ts
import { useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import { toast } from "sonner";
import { doClientLogout } from "@/lib/axios";
import { createClient } from "@/lib/supabase/client";

interface ForceLogoutPayload {
  revokedSessionIds?: string[];
  reason?: string;
}

interface SessionRevokedPayload {
  sessionId: string;
}

/**
 * Decode JWT để lấy "sid" claim (Supabase session ID).
 */
function parseSessionIdFromJwt(jwt: string): string | null {
  try {
    const base64Payload = jwt.split(".")[1];
    if (!base64Payload) return null;
    const padded = base64Payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(padded));
    return (json.session_id as string) || (json.sid as string) || null;
  } catch {
    return null;
  }
}

/**
 * Lấy sessionId hiện tại từ Supabase JWT (claim "sid").
 */
async function getCurrentSessionId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    return accessToken ? parseSessionIdFromJwt(accessToken) : null;
  } catch {
    return null;
  }
}

/**
 * Lắng nghe 2 sự kiện WebSocket liên quan đến đăng xuất từ xa:
 *
 * 1. "force_logout" — emit khi thiết bị khác bấm "Đăng xuất tất cả thiết bị".
 *    → Thiết bị hiện tại logout ngay lập tức.
 *
 * 2. "session_revoked" — emit khi một thiết bị cụ thể bị đăng xuất.
 *    → Chỉ logout nếu sessionId trong payload khớp với sessionId hiện tại
 *      của thiết bị này (tránh logout sai thiết bị A vừa thực hiện thao tác).
 */
export function useForceLogoutSocket() {
  const socket = useSocket();

  useEffect(() => {
    // ── Handler 1: Đăng xuất tất cả ─────────────────────────────────────────
    const handleForceLogout = async (data: ForceLogoutPayload) => {
      // So sánh với sessionId của thiết bị hiện tại
      const currentSessionId = await getCurrentSessionId();

      // Chỉ thực hiện force logout nếu session hiện tại của thiết bị nằm trong danh sách bị thu hồi
      if (data?.revokedSessionIds) {
        if (!currentSessionId || !data.revokedSessionIds.includes(currentSessionId)) {
          return;
        }
      }

      const isRolePromoted = data?.reason === "role_promoted_admin";
      const isRoleUpdated = data?.reason === "role_updated";

      toast.warning(
        isRolePromoted || isRoleUpdated
          ? "Quyền tài khoản đã thay đổi"
          : "Phiên đăng nhập bị kết thúc",
        {
          description: isRolePromoted
            ? "Tài khoản của bạn đã được cấp quyền Quản trị viên. Vui lòng đăng nhập lại để áp dụng quyền mới."
            : isRoleUpdated
              ? "Vai trò tài khoản của bạn đã được cập nhật. Vui lòng đăng nhập lại."
              : "Phiên đăng nhập của bạn đã bị đăng xuất từ một thiết bị khác.",
          duration: 4000,
        },
      );

      // Delay nhỏ để user kịp đọc thông báo
      await new Promise((resolve) => setTimeout(resolve, 1500));

      await doClientLogout();
    };

    // ── Handler 2: Đăng xuất 1 thiết bị cụ thể ──────────────────────────────
    const handleSessionRevoked = async (data: SessionRevokedPayload) => {
      if (!data?.sessionId) return;

      // So sánh với sessionId của thiết bị hiện tại
      const currentSessionId = await getCurrentSessionId();

      // Không phải session của thiết bị này → bỏ qua
      if (!currentSessionId || currentSessionId !== data.sessionId) return;

      toast.warning("Thiết bị bị đăng xuất", {
        description: "Phiên đăng nhập trên thiết bị này đã bị thu hồi từ xa.",
        duration: 4000,
      });

      await new Promise((resolve) => setTimeout(resolve, 1500));

      await doClientLogout();
    };

    socket.on("force_logout", handleForceLogout);
    socket.on("session_revoked", handleSessionRevoked);

    return () => {
      socket.off("force_logout", handleForceLogout);
      socket.off("session_revoked", handleSessionRevoked);
    };
  }, []);
}
