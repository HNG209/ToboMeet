// ─── [locale] Layout ──────────────────────────────────────────────────────────
// Root locale layout: thiết lập html lang, font, metadata SEO và NextIntlClientProvider.

import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { GlobalSocketListeners } from '@/providers/GlobalSocketListeners';
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
    title: 'Tobo — Kết nối không giới hạn | Họp trực tuyến HD',
    description:
      'Nền tảng họp trực tuyến thế hệ mới — Video HD, độ trễ thấp, bảo mật E2E. Dành cho doanh nghiệp, trường học và mọi đội nhóm.',
    keywords: ['họp trực tuyến', 'video call', 'học online', 'hội nghị trực tuyến', 'Tobo'],
    openGraph: {
      title: 'Tobo — Kết nối không giới hạn',
      description: 'Giải pháp video call chất lượng cao cho doanh nghiệp và giáo dục.',
      type: 'website',
      locale: 'vi_VN',
    },
  },
  en: {
    title: 'Tobo — Connect Without Limits | HD Online Meetings',
    description:
      'Next-generation online meeting platform — HD video, ultra-low latency, E2E security. Built for enterprises, schools, and every team.',
    keywords: ['online meeting', 'video call', 'e-learning', 'conference', 'Tobo'],
    openGraph: {
      title: 'Tobo — Connect Without Limits',
      description: 'High-quality video call solution for enterprises and education.',
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
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <GlobalSocketListeners />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
