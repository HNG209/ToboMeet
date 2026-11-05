import { ApiResponse } from "@tobomeet/shared/types";
import axios, { AxiosError } from "axios";
import { createClient } from "@/lib/supabase/client";

export const axiosInstance = axios.create({
  baseURL: "/api",
});

let isLoggingOut = false;

function isPublicPage(): boolean {
  if (typeof window === "undefined") return false;
  const pathWithoutLocale =
    window.location.pathname.replace(/^\/(vi|en)/, "") || "/";
  return (
    pathWithoutLocale === "/" ||
    pathWithoutLocale.startsWith("/login") ||
    pathWithoutLocale.startsWith("/signup") ||
    pathWithoutLocale.startsWith("/forgot-password") ||
    pathWithoutLocale.startsWith("/auth") ||
    pathWithoutLocale.startsWith("/meeting") ||
    pathWithoutLocale.startsWith("/room/join")
  );
}

export async function doClientLogout() {
  if (isLoggingOut) return;
  isLoggingOut = true;

  try {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch { }

  if (typeof window !== "undefined") {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch { }

    const locale = window.location.pathname.split("/")[1] || "vi";
    const currentPath = window.location.pathname + window.location.search;
    const redirectParam = encodeURIComponent(currentPath);
    window.location.href = `/api/auth/logout?locale=${locale}&redirect=${redirectParam}`;
  }
}

axiosInstance.interceptors.response.use(
  (response) => {
    const data = response.data as ApiResponse<unknown>;

    if (data && typeof data.code === "number") {
      if (data.code >= 200 && data.code < 300) {
        return data.result;
      }

      return Promise.reject(data);
    }

    return response.data;
  },
  (error: AxiosError) => {
    const response = error.response?.data as ApiResponse<unknown>;

    // Nếu tài khoản bị khóa hoặc phiên bị thu hồi từ xa / hết hạn (401 / 403)
    // Lưu ý: KHÔNG tự động đá ra trang login nếu người dùng đang ở các trang public (như /meeting hoặc /room/join)
    if (
      ((error.response?.status === 403 && response?.code === 4031) ||
        (error.response?.status === 401 && response?.code === 4011)) &&
      !isLoggingOut &&
      !isPublicPage()
    ) {
      doClientLogout();
      return new Promise(() => { });
    }

    if (error.response?.data) {
      return Promise.reject(error.response.data);
    }

    return Promise.reject({
      code: 5000,
      message: error.message || "Lỗi kết nối đến máy chủ",
      result: null,
    });
  },
);
