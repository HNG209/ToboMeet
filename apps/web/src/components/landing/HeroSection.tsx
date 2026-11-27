// ─── HeroSection ──────────────────────────────────────────────────────────────
// Landing page hero: headline, create/join meeting CTA, desktop download shortcut,
// and plain-language highlights (no fake metrics or technical jargon).

"use client";

import { useState, FormEvent } from "react";
import {
  ArrowRight,
  Video,
  Download,
  CheckCircle2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

export default function HeroSection() {
  const t = useTranslations("hero");
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const highlights = t.raw("highlights") as string[];

  const handleJoinRoom = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = roomCode.trim();
    if (!cleaned) return;
    router.push(`/meeting/${encodeURIComponent(cleaned)}`);
  };

  return (
    <section className="relative pt-28 pb-20 md:pt-36 md:pb-24 bg-enterprise-mesh overflow-hidden">
      {/* Background decoration orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-48 bg-gradient-to-t from-slate-50/40 to-transparent pointer-events-none" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        {/* ── Copy Block ── */}
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          {/* Headline */}
          <h1 className="animate-fade-in-up delay-100 text-[clamp(40px,6.5vw,82px)] font-bold tracking-tighter text-navy leading-[1.06] mb-6">
            <span className="md:whitespace-nowrap">
              {t("title_line1")}{" "}
              <span className="text-gradient-brand">
                {t("title_line1_accent")}
              </span>
            </span>
            <br />
            <span className="text-slate-400">{t("title_line2")}</span>
          </h1>

          {/* Description */}
          <p className="animate-fade-in-up delay-200 text-[clamp(16px,2vw,20px)] text-slate-500 leading-relaxed max-w-2xl mb-10">
            {t("description")}
          </p>

          {/* CTA Row */}
          <div className="animate-fade-in-up delay-300 flex flex-wrap items-center justify-center gap-3.5 w-full">
            {/* Start / Create account button */}
            <Link
              id="hero-create-meeting"
              href="/signup"
              className="btn-enterprise h-14 px-8 text-[15px] flex-shrink-0"
            >
              <Video size={19} />
              {t("create_meeting")}
            </Link>

            {/* Join room form */}
            <form
              onSubmit={handleJoinRoom}
              className="flex items-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm h-14 w-full sm:w-auto focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/15 transition-all"
            >
              <input
                id="hero-join-code"
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder={t("join_placeholder")}
                className="bg-transparent border-none outline-none px-5 text-[15px] text-navy w-full sm:w-52 placeholder-slate-400"
              />
              <button
                id="hero-join-button"
                type="submit"
                disabled={!roomCode.trim()}
                className="flex items-center justify-center gap-2 px-5 h-full font-semibold text-[14px] text-navy hover:bg-slate-50 border-l border-slate-100 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("join_button")}
                <ArrowRight size={15} />
              </button>
            </form>
          </div>

          {/* Desktop Download Shortcut */}
          <div className="animate-fade-in-up delay-400 mt-5">
            <Link
              id="hero-download-desktop"
              href="/download"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[14px] font-semibold text-brand-600 hover:text-brand-700 hover:bg-brand-50/80 transition-colors"
            >
              <Download size={16} />
              <span>{t("download_desktop_cta")}</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Plain-language Highlights Strip */}
          <div className="animate-fade-in delay-500 mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {highlights.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 text-[14px] font-medium text-slate-600"
              >
                <CheckCircle2 size={16} className="text-brand-500 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
