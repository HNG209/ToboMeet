import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/auth/logout
// Đăng xuất session Supabase hiện tại rồi chuyển hướng về trang login.
// Dùng cho nút "Đăng nhập" trên landing page để đảm bảo user luôn phải nhập lại thông tin.
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Xác định locale từ query param hoặc cookie
  const searchParams = request.nextUrl.searchParams;
  const locale =
    searchParams.get("locale") ||
    request.cookies.get("NEXT_LOCALE")?.value ||
    "vi";
  const redirectTarget = searchParams.get("redirect");

  // Đăng xuất khỏi Supabase (xoá session cookie)
  await supabase.auth.signOut({ scope: "local" });

  // Redirect về trang login với locale đúng (và mang theo param redirect nếu có)
  const loginUrl = new URL(`/${locale}/login`, request.url);
  if (redirectTarget) {
    loginUrl.searchParams.set("redirect", redirectTarget);
  }
  return NextResponse.redirect(loginUrl);
}
