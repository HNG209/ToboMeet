import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // Lấy URL hiện tại và bóc tách các tham số mà Facebook/Google trả về
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorCode = searchParams.get("error_code");

  // Nếu có tham số 'next' trên URL (ví dụ: muốn chuyển về /vi sau khi login), nếu không thì mặc định về /vi
  const next = searchParams.get("next") ?? "/";
  const normalizedNext = next.startsWith("/") ? next : `/${next}`;

  const localeMatch = normalizedNext.match(/^\/(vi|en)/);
  const locale = localeMatch ? localeMatch[1] : "vi";

  // Nếu Facebook/Google có trả về mã 'code'
  if (code) {
    const supabase = await createClient();

    // Đổi mã code lấy Session.
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${normalizedNext}`);
    }
  }

  let errorMessage = "error.auth.oauth_failed";
  if (errorCode) {
    if (errorCode === "user_banned") {
      errorMessage = "error.auth.user_locked";
    } else if (errorCode === "too_many_requests") {
      errorMessage = "error.auth.too_many_requests";
    }
  }

  return NextResponse.redirect(
    `${origin}/${locale}/login?error=${errorMessage}`,
  );
}
