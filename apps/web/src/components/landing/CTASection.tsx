// ─── CTASection ───────────────────────────────────────────────────────────────
// Clean final call-to-action with web sign-up and desktop download actions.

import { ArrowRight, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function CTASection() {
  const t = useTranslations("cta");

  return (
    <section className="py-16 md:py-20 bg-slate-50 border-t border-slate-200/60 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── CTA Card ── */}
        <div className="relative rounded-[32px] bg-navy overflow-hidden px-8 py-16 md:px-20 md:py-20 text-center">
          {/* Background decoration */}
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-brand-500/20 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-violet-500/15 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <div className="absolute inset-0 opacity-5 pointer-events-none bg-dot-grid" />

          <div className="relative z-10 max-w-2xl mx-auto">
            {/* Headline */}
            <h2 className="text-[clamp(32px,4.5vw,54px)] font-bold tracking-tighter text-white leading-[1.1] mb-5">
              {t("title")}{" "}
              <span className="text-gradient-brand">{t("title_accent")}</span>
            </h2>

            {/* Description */}
            <p className="text-[17px] text-slate-300 leading-relaxed mb-10">
              {t("description")}
            </p>

            {/* Primary & Secondary Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <Link
                id="cta-start-web"
                href="/signup"
                className="btn-enterprise h-[52px] px-8 text-[15px] w-full sm:w-auto"
              >
                {t("cta_button")}
                <ArrowRight size={17} />
              </Link>

              <Link
                id="cta-download-desktop"
                href="/download"
                className="inline-flex items-center justify-center gap-2 h-[52px] px-7 rounded-full text-[15px] font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/20 backdrop-blur-sm transition-all w-full sm:w-auto"
              >
                <Download size={17} />
                {t("download_button")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
