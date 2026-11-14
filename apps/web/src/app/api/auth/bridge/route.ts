import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const preferredRegion = "sin1";
export const dynamic = "force-dynamic";

/**
 * Route handler nhận access_token và refresh_token từ mobile webview qua POST body,
 * thiết lập session Supabase hợp lệ trong HTTP-only cookies và chuyển hướng sang URL đích (?next=).
 * Dùng cho mobile để đồng bộ phiên đăng nhập hiện tại với Webview
 */
export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let next = searchParams.get("next") || "";

    // Parse body (hỗ trợ cả JSON, URL-encoded form và Multipart form)
    let body: Record<string, any> = {};
    const contentType = request.headers.get("content-type") || "";

    try {
      if (contentType.includes("application/json")) {
        body = await request.json();
      } else if (
        contentType.includes("application/x-www-form-urlencoded") ||
        contentType.includes("multipart/form-data")
      ) {
        const formData = await request.formData();
        formData.forEach((value, key) => {
          body[key] = value.toString();
        });
      } else {
        const text = await request.text();
        try {
          body = JSON.parse(text);
        } catch {
          const params = new URLSearchParams(text);
          params.forEach((value, key) => {
            body[key] = value;
          });
        }
      }
    } catch (err) {
      console.error("[bridge] Error parsing request body:", err);
    }

    if (!next && body.next) {
      next = body.next;
    }
    if (!next) {
      next = "/";
    }

    const access_token = body.access_token || body.accessToken;
    const refresh_token = body.refresh_token || body.refreshToken;

    if (!access_token || !refresh_token) {
      return NextResponse.json(
        {
          error:
            "Missing access_token or refresh_token in request body. Both are required.",
        },
        { status: 400 },
      );
    }

    const forwardedHost = request.headers.get("x-forwarded-host");
    const hostHeader = request.headers.get("host");
    const proto =
      request.headers.get("x-forwarded-proto") ||
      request.nextUrl.protocol.replace(":", "");
    const resolvedOrigin = forwardedHost
      ? `${proto}://${forwardedHost}`
      : hostHeader
        ? `${proto}://${hostHeader}`
        : request.nextUrl.origin;

    let redirectUrl: URL;
    try {
      if (next.startsWith("http://") || next.startsWith("https://")) {
        const parsed = new URL(next);
        // Chỉ chấp nhận absolute URL nếu cùng origin (bảo mật)
        if (parsed.origin === resolvedOrigin || parsed.origin === request.nextUrl.origin) {
          redirectUrl = parsed;
        } else {
          // Khác origin → strip về path để redirect local
          redirectUrl = new URL(parsed.pathname + parsed.search, resolvedOrigin);
        }
      } else {
        redirectUrl = new URL(
          next.startsWith("/") ? next : `/${next}`,
          resolvedOrigin,
        );
      }
    } catch {
      redirectUrl = new URL("/", resolvedOrigin);
    }

    console.log("[bridge] resolvedOrigin:", resolvedOrigin, "→ redirect to:", redirectUrl.toString());

    // Khởi tạo response chuyển hướng 303 See Other (chuyển đổi POST -> GET cho trang đích)
    const response = NextResponse.redirect(redirectUrl, { status: 303 });
    const cookieStore = await cookies();

    // Tạo Supabase SSR client với tokens-only và đồng bộ cookie vào cả cookieStore & response
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

              try {
                cookieStore.set(name, value, mergedOptions);
              } catch {
                // Tránh throw nếu cookieStore bị khóa
              }

              try {
                response.cookies.set(name, value, mergedOptions);
              } catch {
                // Tránh throw nếu response bị khóa
              }
            });
          },
        },
      },
    );

    // Chuyển access + refresh token thành Supabase session
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      console.error("[bridge] Failed to set Supabase session:", error);
      return NextResponse.json(
        {
          error: "Failed to establish Supabase session",
          details: error.message,
        },
        { status: 401 },
      );
    }

    // Nếu request có Header Accept: application/json và không phải là form submission từ browser/webview
    const accept = request.headers.get("accept") || "";
    if (
      accept.includes("application/json") &&
      !contentType.includes("application/x-www-form-urlencoded")
    ) {
      const jsonResponse = NextResponse.json({
        success: true,
        redirectUrl: redirectUrl.toString(),
        userId: data.user?.id,
      });

      // Sao chép toàn bộ cookie sang JSON response
      response.cookies.getAll().forEach((cookie) => {
        jsonResponse.cookies.set(cookie);
      });

      return jsonResponse;
    }

    return response;
  } catch (error: any) {
    console.error("[bridge] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error?.message },
      { status: 500 },
    );
  }
}
