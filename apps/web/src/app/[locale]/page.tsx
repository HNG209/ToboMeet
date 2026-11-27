// ─── Landing Page ─────────────────────────────────────────────────────────────────────
// Trang chủ ToboMeet — Bố cục gọn gàng tập trung vào tính năng thực tế và tải ứng dụng.
// Sections: Header → Hero → Features → HowItWorks → CrossPlatform → CTA → Footer

import Header from '@/components/landing/Header';
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import HowItWorksSection from '@/components/landing/HowItWorksSection';
import CrossPlatformSection from '@/components/landing/CrossPlatformSection';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white overflow-x-hidden">
      {/* ── Sticky Navigation ── */}
      <Header />

      {/* ── Above the Fold ── */}
      <HeroSection />

      {/* ── Product Features (Bento Grid) ── */}
      <FeaturesSection />

      {/* ── How It Works (3 Steps) ── */}
      <HowItWorksSection />

      {/* ── Multi-Platform Support & Desktop Link ── */}
      <CrossPlatformSection />

      {/* ── Final Call-to-Action ── */}
      <CTASection />

      {/* ── Site Footer ── */}
      <Footer />
    </main>
  );
}
