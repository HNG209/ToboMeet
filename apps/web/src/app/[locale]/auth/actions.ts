"use server";
import { createClient } from "@/lib/supabase/server";
import { Provider } from "@supabase/supabase-js";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export type FormState = {
  error: string | null;
  message: string | null;
};

export async function login(prevState: FormState, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectUrl = formData.get("redirect") as string;

  const supabase = await createClient();

  // Xác thực bằng Supabase Auth
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Chi tiết lỗi Supabase:", error.message);

    let errorMessage = "error.auth.login_failed";

    if (error.message.includes("Invalid login credentials")) {
      errorMessage = "error.auth.invalid_credentials";
    } else if (error.message.includes("Email not confirmed")) {
      errorMessage = "error.auth.email_not_confirmed";
    } else if (
      error.message.includes("Too many requests") ||
      error.status === 429
    ) {
      errorMessage = "error.auth.too_many_requests";
    } else if (error.message.includes("User is banned")) {
      errorMessage = "error.auth.user_locked";
    }

    return { error: errorMessage, message: null };
  }

  // Ưu tiên redirect về url được chỉ định
  if (redirectUrl) {
    return redirect(redirectUrl);
  }

  const locale = await getLocale();

  // Lấy role từ dữ liệu trả về sau khi login thành công
  const role = authData.user?.app_metadata?.role;

  // Điều hướng dựa trên role
  if (role === "admin") {
    return redirect(`/${locale}/admin`);
  }

  return redirect(`/${locale}/dashboard`);
}

export async function signup(prevState: FormState, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();

  const { data: isEmailTaken, error: rpcError } = await supabase.rpc(
    "check_email_exists",
    { lookup_email: email },
  );

  if (rpcError) {
    console.error("Lỗi khi check email:", rpcError);
    return {
      error: "error.auth.signup_failed",
      message: null,
    };
  }

  if (isEmailTaken) {
    return {
      error: "error.auth.user_existed",
      message: null,
    };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    let errorMessage = "error.auth.signup_failed";
    console.error("Lỗi khi đăng kí:", error.message);

    if (
      error.message.includes(
        "Password should contain at least one character of each",
      )
    ) {
      errorMessage = "error.auth.password_invalid";
    }

    return {
      error: errorMessage,
      message: null,
    };
  }

  return {
    error: null,
    message: "signup.signup_success",
  };
}

export async function loginWithOAuth(
  provider: Provider,
  prevState: FormState,
  formData: FormData,
) {
  const supabase = await createClient();
  const siteUrl = process.env.SITE_URL || "http://localhost:3000";
  const locale = await getLocale();
  const redirectUrl = formData.get("redirect") as string;
  // Xác định đường dẫn tiếp theo sau khi OAuth thành công
  const nextPath = redirectUrl || `/${locale}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=/${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    console.error(`Lỗi đăng nhập ${provider}:`, error);
    // Trả về object lỗi trực tiếp thay vì redirect
    return {
      error: `error.auth.oauth_failed`,
      message: null,
    };
  }

  if (data.url) {
    // Nếu thành công, BẮT BUỘC phải redirect sang trang của FB/Google
    return redirect(data.url);
  }

  return { error: "error.auth.unknown_error", message: null };
}

export async function logout(): Promise<{ redirectUrl: string }> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });

  const locale = await getLocale();

  return { redirectUrl: `/${locale}/login` };
}

// Gửi mã OTP về email
export async function sendPasswordResetOtp(email: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    console.error("Lỗi gửi OTP:", error.message);
    return {
      success: false,
      error: "otp_send_failed",
    };
  }

  return { success: true };
}

// Xác thực mã OTP (Tạo phiên đăng nhập tạm thời)
export async function verifyPasswordResetOtp(email: string, token: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "recovery", // Bắt buộc phải là 'recovery' cho luồng quên mật khẩu
  });

  if (error) {
    console.error("Lỗi xác minh OTP:", error.message);
    return {
      success: false,
      error: "otp_invalid_or_expired",
    };
  }

  // Đặt cookie đánh dấu phiên phục hồi mật khẩu hợp lệ (tồn tại tối đa 10 phút)
  try {
    const cookieStore = await cookies();
    cookieStore.set("pwd_recovery_verified", email.trim().toLowerCase(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60, // 10 phút
      path: "/",
    });
  } catch (cookieErr) {
    console.error("Lỗi đặt recovery cookie:", cookieErr);
  }

  return { success: true };
}

// Cập nhật mật khẩu mới (Chỉ cho phép khi phiên đã xác thực OTP recovery)
export async function updatePassword(password: string) {
  const cookieStore = await cookies();
  const recoveryEmail = cookieStore.get("pwd_recovery_verified")?.value;

  // Không cho phép đổi mật khẩu nếu không có cờ xác thực OTP recovery
  if (!recoveryEmail) {
    return {
      success: false,
      error: "unauthorized_recovery_attempt",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email?.toLowerCase() !== recoveryEmail.toLowerCase()) {
    return {
      success: false,
      error: "unauthorized_recovery_attempt",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    let errorMessage = "password_update_failed";
    console.error("Lỗi cập nhật mật khẩu:", error.message);
    if (
      error.message.includes(
        "New password should be different from the old password",
      )
    ) {
      errorMessage = "new_password_must_be_different";
    }
    return { success: false, error: errorMessage };
  }

  // Dọn dẹp cookie phục hồi và đăng xuất session tạm thời
  try {
    cookieStore.delete("pwd_recovery_verified");
  } catch { }

  await supabase.auth.signOut({ scope: "local" });

  return { success: true };
}
