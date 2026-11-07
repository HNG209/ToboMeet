"use server";
import { createClient } from "@/lib/supabase/server";
import { Provider } from "@supabase/supabase-js";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

async function getOrigin() {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin.replace(/\/$/, "");

  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  const proto =
    headerList.get("x-forwarded-proto") ||
    (host && !host.includes("localhost") ? "https" : "http");
  return `${proto}://${host}`.replace(/\/$/, "");
}

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

  const origin = (process.env.SITE_URL || (await getOrigin())).replace(/\/$/, "");

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
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
  const siteUrl = (process.env.SITE_URL || (await getOrigin())).replace(/\/$/, "");
  const locale = await getLocale();
  const redirectUrl = formData.get("redirect") as string;
  // Xác định đường dẫn tiếp theo sau khi OAuth thành công
  const nextPath = redirectUrl || `/${locale}`;
  const nextParam = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(nextParam)}`,
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

// Xác thực mã OTP (Tạo phiên khôi phục mật khẩu - recovery session)
export async function verifyPasswordResetOtp(email: string, token: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "recovery", // Bắt buộc phải là 'recovery' để Supabase cấp recovery session
  });

  if (error) {
    console.error("Lỗi xác minh OTP:", error.message);
    return {
      success: false,
      error: "otp_invalid_or_expired",
    };
  }

  return { success: true };
}

// Cập nhật mật khẩu mới (Sử dụng recovery session được cấp từ bước xác thực OTP)
export async function updatePassword(password: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password,
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

  // Đăng xuất session phục hồi sau khi đổi mật khẩu xong
  await supabase.auth.signOut({ scope: "local" });

  return { success: true };
}
