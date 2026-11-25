import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DesktopCallbackClient from "@/components/auth/DesktopCallbackClient";

export const dynamic = "force-dynamic";

export default async function DesktopCallbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    state?: string;
    callback_mode?: string;
    callback_port?: string;
  }>;
}) {
  const { locale } = await params;
  const resolvedSearch = await searchParams;
  const state = (resolvedSearch.state || "").trim();
  const callbackMode =
    resolvedSearch.callback_mode === "loopback" ? "loopback" : "protocol";
  const parsedPort = resolvedSearch.callback_port
    ? parseInt(resolvedSearch.callback_port, 10)
    : null;
  const callbackPort =
    parsedPort && !Number.isNaN(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535
      ? parsedPort
      : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const query = new URLSearchParams();
    query.set("source", "desktop");
    if (state) query.set("state", state);
    query.set("callback_mode", callbackMode);
    if (callbackPort) query.set("callback_port", String(callbackPort));
    redirect(`/${locale}/login?${query.toString()}`);
  }

  return (
    <DesktopCallbackClient
      state={state}
      callbackMode={callbackMode}
      callbackPort={callbackPort}
      userEmail={user.email || ""}
    />
  );
}

