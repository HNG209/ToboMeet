// ─── HeroSection ──────────────────────────────────────────────────────────────
// Landing page hero: headline, description, desktop download link,
// and plain-language highlights.

import { ArrowRight, Download, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function HeroSection() {
  const t = useTranslations("hero");
  const highlights = t.raw("highlights") as string[];

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
          <p className="animate-fade-in-up delay-200 text-[clamp(16px,2vw,20px)] text-slate-500 leading-relaxed max-w-2xl mb-9">
            {t("description")}
          </p>

          {/* Desktop Download Shortcut */}
          <div className="animate-fade-in-up delay-300">
            <Link
              id="hero-download-desktop"
              href="/download"
              className="btn-enterprise h-13 px-7 text-[15px]"
            >
              <Download size={17} />
              <span>{t("download_desktop_cta")}</span>
              <ArrowRight size={15} />
            </Link>
          </div>

          {/* Plain-language Highlights Strip */}
          <div className="animate-fade-in delay-400 mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {highlights.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 text-[14px] font-medium text-slate-600"
              >
                <CheckCircle2
                  size={16}
                  className="text-brand-500 flex-shrink-0"
                />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
