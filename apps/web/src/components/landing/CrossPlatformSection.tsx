// ─── CrossPlatformSection ─────────────────────────────────────────────────────
// Tabbed interface showing real app screenshots for Web, Desktop, and Mobile.
// Shows the desktop download button only when the Desktop tab is selected.

"use client";

import { useState } from "react";
import Image from "next/image";
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

// ─── Real Screenshot Previews ─────────────────────────────────────────────────
function WebPreview({ alt }: { alt: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white shadow-xl shadow-slate-200/60 overflow-hidden">
      {/* Subtle browser address bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 mx-2 px-3 py-1 bg-white rounded-md border border-slate-200 text-[11px] text-slate-400 font-medium">
          tobomeet.app
        </div>
      </div>
      <div className="bg-[#111214]">
        <Image
          src="/meeting.png"
          alt={alt}
          width={1920}
          height={972}
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="w-full h-auto block"
        />
      </div>
    </div>
  );
}

function DesktopPreview({ alt }: { alt: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200/90 bg-white shadow-xl shadow-slate-200/70 overflow-hidden">
      <Image
        src="/desktop_rooms.png"
        alt={alt}
        width={1920}
        height={1080}
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="w-full h-auto block"
      />
    </div>
  );
}

function MobilePreview({ alt }: { alt: string }) {
  return (
    <div className="max-w-[250px] sm:max-w-[270px] mx-auto rounded-[34px] border-[7px] border-slate-900 bg-slate-900 shadow-2xl overflow-hidden">
      <Image
        src="/mobile_rooms.jpg"
        alt={alt}
        width={720}
        height={1464}
        sizes="270px"
        className="w-full h-auto block rounded-[26px]"
      />
    </div>
  );
}

const PREVIEWS = [WebPreview, DesktopPreview, MobilePreview];

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

  const ActivePreview = PREVIEWS[activeTab];
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
          {/* Real Screenshot Preview */}
          <div key={activeTab} className="animate-scale-in">
            <ActivePreview alt={items[activeTab].name} />
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

            {/* Show download button ONLY on Desktop tab */}
            {isDesktopTab && (
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  id="platform-download-link"
                  href="/download"
                  className="btn-enterprise h-12 px-7 text-[15px]"
                >
                  <Download size={17} />
                  {t("download_desktop_btn")}
                  <ArrowRight size={15} />
                </Link>
              </div>
            )}

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
