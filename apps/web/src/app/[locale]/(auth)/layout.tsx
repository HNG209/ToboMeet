// src/app/[locale]/(auth)/layout.tsx
import React from "react";
import LanguageSwitcher from "@/components/commons/LanguageSwitcher";
import AuthLeftPanel from "@/components/auth/AuthLeftPanel";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-white font-sans">
      <AuthLeftPanel />

      <div className="relative flex h-full min-h-0 flex-1 flex-col bg-[#FAFAFA] lg:w-[45%] xl:w-[40%] border-l border-gray-100">
        <div className="absolute top-4 right-4 sm:top-6 sm:right-8 z-50">
          <LanguageSwitcher />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex min-h-full w-full items-center justify-center px-4 py-16 sm:px-6">
            <div className="w-full max-w-110">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
