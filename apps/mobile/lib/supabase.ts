import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mxmxqllqxtudlrojrrtb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iyjKfCUYMkLZU00VzysFJw_T7eQgnXd";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage, // Báo cho Supabase biết đây là môi trường Mobile
    autoRefreshToken: true, // Tự động lấy token mới khi hết hạn
    persistSession: true, // Tự động giữ đăng nhập khi tắt app mở lại
    detectSessionInUrl: false,
  },
});

export const supabaseAuth = {
  /**
   * Đăng nhập bằng Email và Mật khẩu
   */
  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Đăng ký tài khoản mới bằng Email và Mật khẩu
   */
  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw new Error(error.message);

    // Nếu Supabase trả về user nhưng session null (do đang bật Confirm Email)
    if (data.user && !data.session) {
      return { requiresEmailConfirmation: true };
    }

    return { requiresEmailConfirmation: false, data };
  },

  /**
   * Đăng nhập bằng Mạng xã hội (OAuth)
   */
  async signInWithOAuth(provider: "google" | "facebook") {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Cần đổi 'tobomeet://' thành scheme thực tế trong app.json của bạn
        redirectTo: "tobomeet://auth/callback",
      },
    });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * 1. Gửi email chứa mã OTP khôi phục mật khẩu (6 số)
   */
  async sendPasswordResetOtp(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
  },

  /**
   * 2. Xác thực OTP khôi phục mật khẩu.
   * LƯU Ý: Chạy xong hàm này, Supabase sẽ TỰ ĐỘNG lưu Session vào AsyncStorage!
   */
  async verifyPasswordResetOtp(email: string, token: string) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "recovery",
    });

    if (error) throw new Error(error.message);
    // Không cần return Token nữa! Trạng thái app lúc này đã là "Đang đăng nhập"
  },

  /**
   * 3. Đặt mật khẩu mới (dành cho luồng quên mật khẩu / recovery session).
   * Sau khi đặt mật khẩu mới thành công, tự động đăng xuất để người dùng đăng nhập lại.
   */
  async updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);

    await supabase.auth.signOut({ scope: "local" });
  },

  /**
   * 4. Cập nhật hoặc thiết lập mật khẩu khi đang đăng nhập (Profile / Settings).
   * - Nếu tài khoản đã có mật khẩu: Bắt buộc truyền currentPassword.
   * - Nếu tài khoản OAuth chưa có mật khẩu: Không cần currentPassword.
   * Supabase tự động cập nhật session trong AsyncStorage mà không đăng xuất.
   */
  async updateUserPassword(newPassword: string, currentPassword?: string) {
    const payload: { password: string; current_password?: string } = {
      password: newPassword.trim(),
    };
    if (currentPassword && currentPassword.trim()) {
      payload.current_password = currentPassword.trim();
    }
    const { data, error } = await supabase.auth.updateUser(payload);
    if (error) throw error;
    return data;
  },

  /**
   * 5. Đặt lại mật khẩu khi đang có recovery session (dành cho người dùng đang đăng nhập đổi mật khẩu qua OTP).
   * Supabase tự động cập nhật mật khẩu và làm mới session trong AsyncStorage mà KHÔNG đăng xuất.
   */
  async resetPasswordStayLoggedIn(newPassword: string) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword.trim(),
    });
    if (error) throw error;
    return data;
  },
};
