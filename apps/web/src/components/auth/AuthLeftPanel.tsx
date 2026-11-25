"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Video } from "lucide-react";

export default function AuthLeftPanel() {
  const tAuth = useTranslations("auth_layout");

  return (
    <div className="relative hidden h-full shrink-0 items-center justify-center bg-[#0052FF] overflow-hidden lg:flex lg:w-[55%] xl:w-[60%]">
      {/* Các mảng màu trang trí */}
      <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/10 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-10 -right-20 h-80 w-80 rounded-full bg-[#00D4FF]/20 blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 h-125 w-125 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-gradient-to-tr from-white/5 to-transparent backdrop-blur-sm pointer-events-none"></div>

      <div className="relative z-10 flex w-full max-w-xl flex-col px-12 text-white">
        {/* --- KHU VỰC LOGO --- */}
        <Link
          href="/"
          className="mb-12 flex items-center gap-2.5 group shrink-0 w-fit"
        >
          <div className="relative flex h-10 w-10 items-center justify-center">
            <div className="absolute inset-0 bg-white rounded-xl transform rotate-3 group-hover:rotate-6 transition-transform duration-300 shadow-md"></div>
            <div className="absolute inset-0 bg-white blur opacity-40 rounded-xl group-hover:opacity-60 transition-opacity duration-300"></div>
            <div className="relative z-10 text-[#0052FF]">
              <Video
                size={20}
                strokeWidth={2.5}
                className="group-hover:scale-110 transition-transform duration-300"
              />
            </div>
          </div>

          <span className="text-[28px] font-black tracking-tighter text-white">
            Tobo
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] to-white">
              Meet
            </span>
          </span>
        </Link>
        {/* --- KẾT THÚC KHU VỰC LOGO --- */}

        <h1 className="mb-6 text-4xl font-extrabold leading-tight xl:text-5xl">
          {tAuth("connect_without_limits")}
          <br />
          <span className="text-white/70">
            {tAuth("smart_collaboration")}
          </span>
        </h1>

        <p className="text-lg text-white/80 leading-relaxed">
          {tAuth("platform_description")}
        </p>
      </div>
    </div>
  );
}
