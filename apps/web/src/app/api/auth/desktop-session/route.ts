import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

const NESTJS_BASE_URL =
  process.env.NESTJS_BASE_URL || "http://localhost:3001/api";

/**
 * POST /api/auth/desktop-session
 * Nhận { code, state } từ ứng dụng Electron Desktop (qua Deep Link hoặc Loopback),
 * gọi NestJS POST /api/auth/desktop-exchange để đổi one-time code trong Redis lấy tokenHash,
 * sau đó gọi supabase.auth.verifyOtp({ token_hash, type: "magiclink" }) để tạo 1 phiên Supabase
 * độc lập hoàn toàn với trình duyệt và lưu vào HTTP-only cookies của Electron (persist:tobomeet).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const state = typeof body?.state === "string" ? body.state.trim() : "";

    if (!code || !state) {
      return NextResponse.json(
        { error: "Thiếu mã xác thực (code) hoặc state." },
        { status: 400 },
      );
    }

    // 1. Đổi one-time code trong Redis trên NestJS server lấy magiclink tokenHash
    const exchangeRes = await fetch(`${NESTJS_BASE_URL}/auth/desktop-exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ code, state }),
      cache: "no-store",
    });

    const exchangeJson = await exchangeRes.json().catch(() => null);
    if (!exchangeRes.ok) {
      const errMsg =
        exchangeJson?.message ||
        exchangeJson?.error ||
        "Mã đăng nhập không hợp lệ hoặc đã hết hạn.";
      return NextResponse.json(
        { error: errMsg },
        { status: exchangeRes.status || 401 },
      );
    }

    const payload = exchangeJson?.result ?? exchangeJson;
    const tokenHash: string | undefined = payload?.tokenHash;
    const fallbackRole: string = payload?.role || "user";

    if (!tokenHash) {
      return NextResponse.json(
        { error: "Không nhận được token xác thực từ máy chủ." },
        { status: 500 },
      );
    }

    // 2. Xác thực tokenHash với Supabase để khởi tạo session MỚI độc lập và gắn HTTP-only cookie
    const cookieStore = await cookies();
    const cookiesToAttach: Array<{
      name: string;
      value: string;
      options: Record<string, any>;
    }> = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          encode: "tokens-only",
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              const mergedOptions = {
                ...options,
                httpOnly: true,
                sameSite: "lax" as const,
                secure: process.env.NODE_ENV === "production",
                path: "/",
              };
              cookiesToAttach.push({ name, value, options: mergedOptions });
              try {
                cookieStore.set(name, value, mergedOptions);
              } catch {
                // Bỏ qua nếu cookieStore ở trạng thái read-only
              }
            });
          },
        },
      },
    );

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

    if (error || !data?.session) {
      console.error("[desktop-session] verifyOtp failed:", error);
      return NextResponse.json(
        {
          error:
            error?.message ||
            "Không thể khởi tạo phiên đăng nhập trên Desktop.",
        },
        { status: 401 },
      );
    }

    const resolvedRole =
      data.user?.app_metadata?.role || fallbackRole || "user";

    const response = NextResponse.json({
      success: true,
      role: resolvedRole,
      email: data.user?.email || payload?.email || "",
    });

    for (const c of cookiesToAttach) {
      response.cookies.set(c.name, c.value, c.options);
    }

    return response;
  } catch (err: any) {
    console.error("[desktop-session] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "Lỗi hệ thống khi xác thực Desktop." },
      { status: 500 },
    );
  }
}

