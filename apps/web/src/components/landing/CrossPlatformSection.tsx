// ─── CrossPlatformSection ─────────────────────────────────────────────────────
// Tabbed interface showing platform support: Web, Desktop, Mobile,
// with a direct link to the dedicated Desktop download page.

"use client";

import { useState } from "react";
import {
  Globe,
  Monitor,
  Smartphone,
  Check,
  Download,
  ArrowRight,
  LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { PLATFORMS_CONFIG } from "@/lib/constants";
import { Link } from "@/i18n/navigation";

const ICON_MAP: Record<string, LucideIcon> = { Globe, Monitor, Smartphone };

// ─── Device Mockups ───────────────────────────────────────────────────────────
function WebMockup() {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-white shadow-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-100 border-b border-slate-200">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 mx-2 px-3 py-1 bg-white rounded-md border border-slate-200 text-[11px] text-slate-400 font-medium">
          tobomeet.app
        </div>
      </div>
      <div className="bg-slate-900 px-6 py-8 flex items-center justify-center">
        <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
          {["NH", "HL", "PH", "TH"].map((init, i) => (
            <div
              key={i}
              className="aspect-video bg-slate-800 rounded-lg flex items-center justify-center"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold
                ${
                  i === 0
                    ? "bg-gradient-to-br from-blue-500 to-cyan-400"
                    : i === 1
                      ? "bg-gradient-to-br from-violet-500 to-purple-600"
                      : i === 2
                        ? "bg-gradient-to-br from-emerald-500 to-teal-500"
                        : "bg-gradient-to-br from-orange-500 to-rose-500"
                }`}
              >
                {init}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DesktopMockup() {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-slate-800 shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <span className="text-[11px] text-slate-400 font-medium">
          ToboMeet Desktop
        </span>
        <div className="w-16" />
      </div>
      <div className="flex">
        <div className="w-12 bg-slate-900/80 flex flex-col items-center py-4 gap-3">
          {["H", "C", "T", "S"].map((icon, i) => (
            <div
              key={i}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold
              ${i === 0 ? "bg-brand-500 text-white" : "bg-slate-700 text-slate-400"}`}
            >
              {icon}
            </div>
          ))}
        </div>
        <div className="flex-1 bg-slate-800 p-4">
          <div className="grid grid-cols-2 gap-2">
            {["NH", "HL", "PH", "TH"].map((init, i) => (
              <div
                key={i}
                className="aspect-video bg-slate-700/80 rounded-lg flex items-center justify-center"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold
                  ${
                    i === 0
                      ? "bg-gradient-to-br from-blue-500 to-cyan-400"
                      : i === 1
                        ? "bg-gradient-to-br from-violet-500 to-purple-600"
                        : i === 2
                          ? "bg-gradient-to-br from-emerald-500 to-teal-500"
                          : "bg-gradient-to-br from-orange-500 to-rose-500"
                  }`}
                >
                  {init}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileMockup() {
  return (
    <div className="max-w-[220px] mx-auto rounded-[28px] border-[6px] border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-20 h-4 bg-slate-800 rounded-full" />
      </div>
      <div className="px-3 pb-3">
        <div className="text-[9px] font-bold text-slate-400 text-center mb-2">
          ToboMeet
        </div>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {["NH", "HL", "PH", "TH"].map((init, i) => (
            <div
              key={i}
              className="aspect-square bg-slate-800 rounded-xl flex items-center justify-center"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold
                ${
                  i === 0
                    ? "bg-gradient-to-br from-blue-500 to-cyan-400"
                    : i === 1
                      ? "bg-gradient-to-br from-violet-500 to-purple-600"
                      : i === 2
                        ? "bg-gradient-to-br from-emerald-500 to-teal-500"
                        : "bg-gradient-to-br from-orange-500 to-rose-500"
                }`}
              >
                {init}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-2">
          {["🎤", "📷", "💬", "🔴"].map((icon, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px]
              ${i === 3 ? "bg-red-500" : "bg-slate-700"}`}
            >
              {icon}
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-center py-2">
        <div className="w-16 h-1 bg-slate-600 rounded-full" />
      </div>
    </div>
  );
}

const MOCKUPS = [WebMockup, DesktopMockup, MobileMockup];

// ─── CrossPlatformSection Component ──────────────────────────────────────────
export default function CrossPlatformSection() {
  const t = useTranslations("platforms");
  const items = t.raw("items") as Array<{
    name: string;
    description: string;
    badges: string[];
  }>;
  const tabs = [t("tab_web"), t("tab_desktop"), t("tab_mobile")];
  // Mặc định mở tab Desktop để người dùng thấy ngay ứng dụng máy tính
  const [activeTab, setActiveTab] = useState(1);

  const ActiveMockup = MOCKUPS[activeTab];
  const isDesktopTab = PLATFORMS_CONFIG[activeTab].key === "desktop";

  return (
    <section
      id="platform"
      className="py-16 md:py-20 bg-white border-t border-slate-200/60"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Section Header ── */}
        <div className="text-center mb-14 max-w-2xl mx-auto">
          <h2 className="text-[clamp(36px,5vw,52px)] font-bold text-navy tracking-tighter leading-[1.1]">
            {t("section_title")}
          </h2>
          <p className="mt-5 text-[17px] text-slate-500 leading-relaxed">
            {t("section_desc")}
          </p>
        </div>

        {/* ── Tabs ── */}
        <div className="flex justify-center mb-12">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full p-1 shadow-sm">
            {PLATFORMS_CONFIG.map((platform, i) => {
              const Icon = ICON_MAP[platform.icon];
              return (
                <button
                  key={platform.key}
                  id={`platform-tab-${i}`}
                  onClick={() => setActiveTab(i)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[14px] font-semibold transition-all duration-200
                    ${
                      activeTab === i
                        ? "bg-navy text-white shadow-sm"
                        : "text-slate-500 hover:text-navy hover:bg-white"
                    }`}
                >
                  {Icon && <Icon size={15} />}
                  <span className="hidden sm:block">{tabs[i]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab Content ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Mockup */}
          <div className="animate-scale-in">
            <ActiveMockup />
          </div>

          {/* Info */}
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-[28px] font-bold tracking-tight text-navy mb-3">
                {items[activeTab].name}
              </h3>
              <p className="text-[16px] text-slate-500 leading-relaxed">
                {items[activeTab].description}
              </p>
            </div>

            {/* Supported platforms */}
            <div className="flex flex-wrap gap-2">
              {items[activeTab].badges.map((badge) => (
                <span
                  key={badge}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-600"
                >
                  <Check size={12} className="text-brand-500" />
                  {badge}
                </span>
              ))}
            </div>

            {/* Action button to dedicated Download page */}
            <div className="flex flex-wrap items-center gap-3">
              <Link
                id="platform-download-link"
                href="/download"
                className={
                  isDesktopTab
                    ? "btn-enterprise h-12 px-7 text-[15px]"
                    : "btn-enterprise-outline h-12 px-6 text-[14px]"
                }
              >
                <Download size={17} />
                {t("download_desktop_btn")}
                <ArrowRight size={15} />
              </Link>
            </div>

            {/* One-account note */}
            <div className="flex items-start gap-3 p-4 rounded-[16px] bg-slate-50 border border-slate-200/80">
              <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check size={16} className="text-brand-600" />
              </div>
              <p className="text-[14px] text-slate-600 leading-relaxed">
                <span className="font-bold text-navy">{t("one_account")}</span>{" "}
                {t("one_account_desc")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
