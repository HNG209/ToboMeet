// ─── Download Page ────────────────────────────────────────────────────────────
// Trang tải ứng dụng ToboMeet cho máy tính Windows.
// Tự động lấy đường dẫn và thông tin bản cài đặt mới nhất từ Cloudflare R2.

import type { Metadata } from "next";
import Image from "next/image";
import {
  Download,
  Monitor,
  Bell,
  Video,
  Link2,
  CheckCircle2,
  Globe,
  ArrowRight,
  Info,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import { Link } from "@/i18n/navigation";
import {
  getLatestDesktopRelease,
  formatFileSize,
  formatReleaseDate,
} from "@/lib/desktopRelease";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "download" });
  return {
    title: t("meta_title"),
    description: t("meta_description"),
  };
}

const BENEFIT_ICONS = [Monitor, Bell, Video, Link2];

export default async function DownloadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "download" });
  const release = await getLatestDesktopRelease();

  const fileSizeLabel = formatFileSize(release.fileSize, locale);
  const releaseDateLabel = formatReleaseDate(release.releasedAt, locale);

  const benefits = t.raw("benefits") as Array<{
    title: string;
    description: string;
  }>;
  const steps = t.raw("steps") as Array<{
    step: string;
    title: string;
    description: string;
  }>;

  return (
    <main className="min-h-screen bg-white overflow-x-hidden flex flex-col">
      <Header />

      {/* ── Hero & Download Card ── */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 bg-enterprise-mesh overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 relative z-10">
          {/* Heading */}
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h1 className="animate-fade-in-up text-[clamp(36px,5.5vw,64px)] font-bold tracking-tighter text-navy leading-[1.08] mb-5">
              {t("title")}{" "}
              <span className="text-gradient-brand">{t("title_accent")}</span>
            </h1>
            <p className="animate-fade-in-up delay-100 text-[clamp(16px,2vw,19px)] text-slate-500 leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          {/* Main Windows Download Card */}
          <div className="animate-fade-in-up delay-200 rounded-[28px] bg-white border border-slate-200/90 shadow-xl shadow-slate-200/50 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Left: Action & Release Info */}
              <div className="lg:col-span-7 p-8 sm:p-10 md:p-12 flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-brand-700 text-[13px] font-semibold mb-6">
                    <Monitor size={15} />
                    <span>{t("windows_badge")}</span>
                  </div>

                  <h2 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-navy mb-3">
                    {t("card_title")}
                  </h2>
                  <p className="text-[15px] text-slate-500 leading-relaxed mb-8">
                    {t("card_desc")}
                  </p>
                </div>

                <div className="space-y-5">
                  {/* Primary Download Button */}
                  <div className="flex flex-wrap items-center gap-3">
                    {release.available ? (
                      <a
                        id="download-windows-installer"
                        href={release.downloadUrl}
                        download={release.fileName ?? undefined}
                        className="btn-enterprise h-14 px-8 text-[15px] w-full sm:w-auto"
                      >
                        <Download size={18} />
                        <span>{t("download_button")}</span>
                      </a>
                    ) : (
                      <a
                        id="download-windows-fallback"
                        href={release.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-enterprise h-14 px-8 text-[15px] w-full sm:w-auto"
                      >
                        <Download size={18} />
                        <span>{t("download_fallback_button")}</span>
                      </a>
                    )}

                    <Link
                      href="/signup"
                      className="btn-enterprise-outline h-14 px-6 text-[14px] w-full sm:w-auto"
                    >
                      <Globe size={16} />
                      <span>{t("use_web_instead")}</span>
                    </Link>
                  </div>

                  {/* Release metadata row */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-[13px] text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-500" />
                      {t("os_requirement")}
                    </span>

                    {release.version && (
                      <span>
                        {t("version_label")}{" "}
                        <strong className="text-navy font-semibold">
                          v{release.version}
                        </strong>
                      </span>
                    )}

                    {fileSizeLabel && (
                      <span>
                        {t("size_label")}{" "}
                        <strong className="text-navy font-semibold">
                          {fileSizeLabel}
                        </strong>
                      </span>
                    )}

                    {releaseDateLabel && (
                      <span>
                        {t("updated_label")}{" "}
                        <strong className="text-navy font-semibold">
                          {releaseDateLabel}
                        </strong>
                      </span>
                    )}
                  </div>

                  {!release.available && (
                    <p className="text-[13px] text-slate-400">
                      {t("fallback_note")}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Real Desktop App Preview */}
              <div className="lg:col-span-5 bg-slate-900 p-6 sm:p-8 flex flex-col justify-center relative overflow-hidden">
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 rounded-[16px] border border-slate-700/80 bg-white shadow-2xl overflow-hidden">
                  <Image
                    src="/desktop_small.png"
                    alt={t("card_title")}
                    width={1058}
                    height={905}
                    sizes="(max-width: 1024px) 100vw, 42vw"
                    className="w-full h-auto block"
                    priority
                  />
                </div>

                <p className="relative z-10 mt-5 text-center text-[13px] text-slate-400">
                  {t("preview_caption")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Benefits Section ── */}
      <section className="py-16 md:py-20 bg-white border-t border-slate-200/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-[clamp(28px,4vw,42px)] font-bold text-navy tracking-tighter leading-[1.12]">
              {t("benefits_title")}
            </h2>
            <p className="mt-4 text-[16px] text-slate-500 leading-relaxed">
              {t("benefits_desc")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((item, idx) => {
              const Icon = BENEFIT_ICONS[idx % BENEFIT_ICONS.length];
              return (
                <div
                  key={item.title}
                  className="rounded-[20px] bg-slate-50/70 border border-slate-200/80 p-7 hover:bg-white hover:shadow-md transition-all"
                >
                  <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-5">
                    <Icon size={20} className="text-brand-600" />
                  </div>
                  <h3 className="text-[18px] font-bold text-navy mb-2.5">
                    {item.title}
                  </h3>
                  <p className="text-[14px] text-slate-500 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Simple Install Guide ── */}
      <section className="py-16 md:py-20 bg-slate-50 border-t border-slate-200/60">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-[clamp(28px,4vw,40px)] font-bold text-navy tracking-tighter leading-[1.15]">
              {t("guide_title")}
            </h2>
            <p className="mt-4 text-[16px] text-slate-500 leading-relaxed">
              {t("guide_desc")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((step) => (
              <div
                key={step.step}
                className="rounded-[20px] bg-white border border-slate-200 p-7 shadow-sm"
              >
                <span className="inline-block text-[12px] font-black tracking-widest text-brand-600 bg-brand-50 border border-brand-100 px-3 py-1 rounded-full mb-4">
                  {step.step}
                </span>
                <h3 className="text-[19px] font-bold text-navy mb-2.5">
                  {step.title}
                </h3>
                <p className="text-[14px] text-slate-500 leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>

          {/* Friendly Windows install note */}
          <div className="mt-8 rounded-[18px] bg-white border border-slate-200 p-5 sm:p-6 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Info size={18} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-navy mb-1">
                {t("install_tip_title")}
              </h3>
              <p className="text-[14px] text-slate-500 leading-relaxed">
                {t("install_tip_desc")}
              </p>
            </div>
          </div>

          {/* Back to Home link */}
          <div className="mt-10 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[14px] font-semibold text-slate-600 hover:text-navy transition-colors"
            >
              <span>{t("back_home")}</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

