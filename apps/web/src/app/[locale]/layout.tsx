// ─── [locale] Layout ──────────────────────────────────────────────────────────
// Root locale layout: thiết lập html lang, font, metadata SEO và NextIntlClientProvider.

import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { GlobalSocketListeners } from '@/providers/GlobalSocketListeners';
import TopLoadingBar from '@/components/common/TopLoadingBar';
import DesktopTitleBar from '@/components/common/DesktopTitleBar';
import '../globals.css';

// ─── Viewport Configuration ───────────────────────────────────────────────────
// Bật interactiveWidget: 'resizes-content' để trình duyệt mobile tự co giãn nội dung khi mở bàn phím
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: 'resizes-content',
};

// ─── Font ─────────────────────────────────────────────────────────────────────
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

// ─── SEO Metadata (per locale) ────────────────────────────────────────────────
const metadataMap: Record<string, Metadata> = {
  vi: {
    title: 'ToboMeet — Họp trực tuyến và học tập nhóm đơn giản',
    description:
      'Nền tảng họp trực tuyến rõ nét, dễ dùng với bảng trắng vẽ chung, ghi chép thông minh và hỗ trợ cả trình duyệt lẫn máy tính.',
    keywords: ['họp trực tuyến', 'gọi video', 'học online', 'làm việc nhóm', 'ToboMeet'],
    openGraph: {
      title: 'ToboMeet — Họp trực tuyến và học tập nhóm đơn giản',
      description: 'Gọi video rõ nét, chia sẻ màn hình, bảng trắng vẽ chung và làm việc nhóm hiệu quả.',
      type: 'website',
      locale: 'vi_VN',
    },
  },
  en: {
    title: 'ToboMeet — Simple Online Meetings & Group Learning',
    description:
      'A clear, easy-to-use online meeting platform with shared whiteboards, smart meeting notes, and web plus desktop support.',
    keywords: ['online meeting', 'video call', 'online learning', 'team collaboration', 'ToboMeet'],
    openGraph: {
      title: 'ToboMeet — Simple Online Meetings & Group Learning',
      description: 'Clear video calls, screen sharing, shared whiteboards, and smooth team collaboration.',
      type: 'website',
      locale: 'en_US',
    },
  },
};

// ─── generateMetadata ─────────────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return metadataMap[locale] ?? metadataMap['vi'];
}

// ─── generateStaticParams ─────────────────────────────────────────────────────
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// ─── Layout Component ─────────────────────────────────────────────────────────
interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  // Validate locale
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Fetch messages on the server
  const messages = await getMessages();

  return (
    <html lang={locale} className={`scroll-smooth ${plusJakartaSans.variable}`}>
      <body className="antialiased min-h-screen flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <DesktopTitleBar />
          <Suspense fallback={null}>
            <TopLoadingBar />
          </Suspense>
          <GlobalSocketListeners />
          <div className="flex-1 flex flex-col min-h-0">
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
