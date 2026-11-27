// ─── FeaturesSection ──────────────────────────────────────────────────────────
// Bento grid showcasing real ToboMeet capabilities with a real meeting screenshot.

import Image from "next/image";
import {
  Video,
  Sparkles,
  GraduationCap,
  ShieldCheck,
  Check,
  LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { FEATURES_CONFIG } from "@/lib/constants";

const ICON_MAP: Record<string, LucideIcon> = {
  Video,
  Sparkles,
  GraduationCap,
  ShieldCheck,
};

export default function FeaturesSection() {
  const t = useTranslations("features");
  const items = t.raw("items") as Array<{ title: string; description: string }>;
  const videoTags = t.raw("video_tags") as string[];

  return (
    <section
      id="features"
      className="relative py-16 md:py-20 bg-white border-t border-slate-200/60"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Section Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-14">
          <div className="max-w-2xl flex-1">
            <h2 className="text-[clamp(28px,4vw,46px)] font-bold text-navy tracking-tighter leading-[1.1]">
              {t("section_title")}{" "}
              <span className="text-gradient-brand">
                {t("section_title_gradient")}
              </span>
            </h2>
          </div>
          <p className="text-[17px] text-slate-500 leading-relaxed max-w-md md:max-w-[380px] md:shrink-0">
            {t("section_desc")}
          </p>
        </div>

        {/* ── Bento Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-px bg-slate-200 border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">
          {/* Feature 1 — Large card (50% width) */}
          <div className="md:col-span-3 bg-white p-10 md:p-12 flex flex-col justify-between group hover:bg-slate-50/50 transition-colors">
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-300">
                {(() => {
                  const Icon = ICON_MAP[FEATURES_CONFIG[0].icon];
                  return (
                    <Icon size={22} className="text-blue-600" strokeWidth={1.75} />
                  );
                })()}
              </div>
              <h3 className="text-[28px] font-bold tracking-tight text-navy mb-4">
                {items[0].title}
              </h3>
              <p className="text-[16px] text-slate-500 leading-relaxed max-w-lg">
                {items[0].description}
              </p>
            </div>

            {/* Plain-language feature tags */}
            <div className="mt-8 flex flex-wrap gap-2.5">
              {videoTags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-[12px] font-semibold text-blue-700"
                >
                  <Check size={12} className="text-blue-500" />
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Real Meeting Screenshot Card (50% width) */}
          <div className="md:col-span-3 bg-[#111214] p-4 sm:p-6 flex items-center justify-center overflow-hidden relative">
            <div className="w-full rounded-[14px] overflow-hidden border border-white/10 shadow-2xl">
              <Image
                src="/meeting.png"
                alt={items[0].title}
                width={1920}
                height={972}
                sizes="(max-width: 768px) 100vw, 50vw"
                className="w-full h-auto block"
                priority
              />
            </div>
          </div>

          {/* Feature 2 — Smart Meeting Notes & Summary (33.3% width) */}
          <div className="md:col-span-2 bg-white p-10 flex flex-col group hover:bg-slate-50/50 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              {(() => {
                const Icon = ICON_MAP[FEATURES_CONFIG[1].icon];
                return (
                  <Icon size={20} className="text-indigo-600" strokeWidth={1.75} />
                );
              })()}
            </div>
            <h3 className="text-[20px] font-bold tracking-tight text-navy mb-3">
              {items[1].title}
            </h3>
            <p className="text-[15px] text-slate-500 leading-relaxed">
              {items[1].description}
            </p>
          </div>

          {/* Feature 3 — Teamwork & Classroom Tools (33.3% width) */}
          <div className="md:col-span-2 bg-white p-10 flex flex-col group hover:bg-slate-50/50 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              {(() => {
                const Icon = ICON_MAP[FEATURES_CONFIG[2].icon];
                return (
                  <Icon size={20} className="text-violet-600" strokeWidth={1.75} />
                );
              })()}
            </div>
            <h3 className="text-[20px] font-bold tracking-tight text-navy mb-3">
              {items[2].title}
            </h3>
            <p className="text-[15px] text-slate-500 leading-relaxed">
              {items[2].description}
            </p>
          </div>

          {/* Feature 4 — Privacy & Room Control (33.3% width) */}
          <div className="md:col-span-2 bg-white p-10 flex flex-col group hover:bg-slate-50/50 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              {(() => {
                const Icon = ICON_MAP[FEATURES_CONFIG[3].icon];
                return (
                  <Icon size={20} className="text-emerald-600" strokeWidth={1.75} />
                );
              })()}
            </div>
            <h3 className="text-[20px] font-bold tracking-tight text-navy mb-3">
              {items[3].title}
            </h3>
            <p className="text-[15px] text-slate-500 leading-relaxed">
              {items[3].description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
