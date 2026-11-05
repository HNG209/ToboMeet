import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

const AUTH_PATHS = ["/login", "/signup", "/forgot-password"];

export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, httpOnly: true }),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Đọc role từ app_metadata của Supabase
  const role = user?.app_metadata?.role;

  const pathname = request.nextUrl.pathname;
  const pathWithoutLocale = pathname.replace(/^\/(vi|en)/, "") || "/";
  const isAuthPage = AUTH_PATHS.includes(pathWithoutLocale);
  const isHomePage = pathWithoutLocale === "/";
  const isAdminPage = pathWithoutLocale.startsWith("/admin");
  const isResetting = request.nextUrl.searchParams.get("step") === "reset"; // Đang ở bước reset password

  const localeMatch = pathname.match(/^\/(vi|en)/);
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const currentLocale = localeMatch ? localeMatch[1] : cookieLocale || "vi";

  const isCallbackPage = pathWithoutLocale.startsWith("/auth/callback");
  const isRoomJoinPage = pathWithoutLocale.startsWith("/room/join");
  const isMeetingPage = pathWithoutLocale.startsWith("/meeting");
  const isPublicPage =
    isAuthPage ||
    isHomePage ||
    isCallbackPage ||
    isRoomJoinPage ||
    isMeetingPage;

  // Nếu vào trang admin mà không có user hoặc role không phải admin -> Giả vờ như trang không tồn tại (404)
  if (isAdminPage && role !== "admin") {
    return NextResponse.rewrite(new URL(`/${currentLocale}/404`, request.url));
  }

  // Nếu người dùng đã có token (user tồn tại) và đang vào các trang cấm (login, signup, forgot-password)
  const isAuthRestricted =
    pathWithoutLocale === "/login" ||
    pathWithoutLocale === "/signup" ||
    pathWithoutLocale === "/forgot-password";
  if (user && (isAuthRestricted || isHomePage) && !isResetting) {
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    if (redirectParam) {
      return NextResponse.redirect(new URL(redirectParam, request.url));
    }

    // Nếu là admin -> Bẻ lái vào /admin
    if (role === "admin") {
      return NextResponse.redirect(
        new URL(`/${currentLocale}/admin`, request.url),
      );
    }

    // Nếu là user thường -> Bẻ lái vào /dashboard
    return NextResponse.redirect(
      new URL(`/${currentLocale}/dashboard`, request.url),
    );
  }

  // Nếu là Next-Action (Server Action), không redirect để tránh lỗi "unexpected response from server"
  if (request.headers.has("next-action")) {
    return response;
  }

  // Nếu người dùng chưa có token (user không tồn tại) và đang vào các trang cần auth
  if (!user && !isPublicPage) {
    return NextResponse.redirect(new URL(`/${currentLocale}`, request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
