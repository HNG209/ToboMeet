// src/app/[locale]/(auth)/layout.tsx
import React from "react";
import { headers } from "next/headers";
import AuthDesktopSwitch from "@/components/auth/DesktopAuthGate";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const userAgent = headerList.get("user-agent") || "";
  const serverIsDesktop = userAgent.includes("ToboMeetDesktop");

  return (
    <AuthDesktopSwitch serverIsDesktop={serverIsDesktop}>
      {children}
    </AuthDesktopSwitch>
  );
}
