// ─── HowItWorksSection ────────────────────────────────────────────────────────
// 3-step visual guide showing how simple it is to start meeting with ToboMeet.

import { PlusCircle, Share2, Zap, LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { HOW_IT_WORKS_CONFIG } from "@/lib/constants";
import { Link } from "@/i18n/navigation";

const ICON_MAP: Record<string, LucideIcon> = { PlusCircle, Share2, Zap };

export default function HowItWorksSection() {
  const t = useTranslations("how_it_works");
  const steps = t.raw("steps") as Array<{
    step: string;
    title: string;
    description: string;
  }>;

  return (
    <section
      id="solutions"
      className="py-16 md:py-20 bg-slate-50 border-t border-slate-200/60"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Section Header ── */}
        <div className="text-center mb-20 max-w-4xl mx-auto">
          <h2 className="text-[clamp(36px,5vw,52px)] font-bold text-navy tracking-tighter leading-[1.1]">
            {t("section_title")}{" "}
            <span className="text-gradient-brand">
              {t("section_title_accent")}
            </span>
          </h2>
          <p className="mt-5 text-[17px] text-slate-500 leading-relaxed">
            {t("section_desc")}
          </p>
        </div>

        {/* ── Steps ── */}
        <div className="relative">
          {/* Connecting line on desktop */}
          <div className="hidden md:block absolute top-[52px] left-[calc(16.66%+24px)] right-[calc(16.66%+24px)] h-px bg-gradient-to-r from-slate-200 via-brand-200 to-slate-200 z-0" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8 relative z-10">
            {HOW_IT_WORKS_CONFIG.map((config, i) => {
              const Icon = ICON_MAP[config.icon];
              const step = steps[i];

              return (
                <div
                  key={i}
                  id={`how-it-works-step-${i + 1}`}
                  className="flex flex-col items-center text-center group"
                >
                  {/* Icon circle */}
                  <div
                    className={`relative w-[100px] h-[100px] rounded-full ${config.bgLight} ${config.ring} ring-1 flex items-center justify-center mb-7 group-hover:scale-105 transition-transform duration-300 shadow-sm`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg`}
                    >
                      {Icon && (
                        <Icon
                          size={24}
                          className="text-white"
                          strokeWidth={2}
                        />
                      )}
                    </div>
                  </div>

                  {/* Step number text */}
                  <span className="inline-block text-[13px] font-black tracking-widest text-brand-600 uppercase mb-4 bg-brand-50 px-4 py-1.5 rounded-full border border-brand-100 shadow-sm">
                    {step.step}
                  </span>

                  {/* Title */}
                  <h3 className="text-[22px] font-bold tracking-tight text-navy mb-3">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-[15px] text-slate-500 leading-relaxed max-w-xs">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Bottom CTA ── */}
        <div className="mt-16 text-center">
          <Link
            href="/signup"
            className="btn-enterprise h-12 px-8 text-[15px] inline-flex"
          >
            <Zap size={18} />
            {t("cta_btn")}
          </Link>
        </div>
      </div>
    </section>
  );
}
