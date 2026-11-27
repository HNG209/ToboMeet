// ─── Footer ───────────────────────────────────────────────────────────────────
// Academic footer for Graduation Thesis.

import { Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="bg-slate-50 border-t border-slate-200">
      {/* ── Main content ── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="flex flex-col md:flex-row justify-between gap-12">
          {/* Left: Brand & Thesis Info */}
          <div className="flex flex-col gap-6 max-w-lg">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group w-fit">
              <div className="relative flex h-9 w-9 items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-brand-600 to-indigo-500 rounded-xl transform rotate-3 group-hover:rotate-6 transition-transform duration-300 shadow-md"></div>
                <div className="absolute inset-0 bg-brand-500 blur opacity-40 rounded-xl group-hover:opacity-60 transition-opacity duration-300"></div>
                <div className="relative z-10 text-white">
                  <Video
                    size={18}
                    strokeWidth={2.5}
                    className="group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
              </div>
              <span className="text-[22px] font-black tracking-tighter text-navy">
                Tobo
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-500">
                  Meet
                </span>
              </span>
            </Link>

            <div>
              <h3 className="text-[18px] font-bold text-navy leading-snug mb-2">
                {t("thesis_title")}
              </h3>
              <p className="text-[14px] text-slate-500 font-medium">
                {t("university")} — {t("faculty")}
              </p>
            </div>
          </div>

          {/* Right: Author Info */}
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-[20px] p-7 border border-slate-200 shadow-sm min-w-[280px]">
              <div className="flex flex-col gap-5">
                <div>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    {t("advisor_label")}
                  </p>
                  <p className="text-[15px] font-bold text-navy">
                    {t("advisor_name")}
                  </p>
                </div>
                <div className="h-px w-full bg-slate-100" />
                <div>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    {t("student_label")}
                  </p>
                  <p className="text-[15px] font-bold text-brand-600 whitespace-pre-line">
                    {t("student_name")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-[13px] font-medium text-slate-400">{t("year")}</p>
          <p className="text-[13px] font-medium text-slate-400">
            {t("made_with")}
          </p>

          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[13px] font-medium text-slate-500">
              {t("status")}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
