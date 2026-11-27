// ─── Navigation ───────────────────────────────────────────────────────────────
export const NAV_LINKS = [
  { labelKey: 'header.features', href: '/#features' },
  { labelKey: 'header.solutions', href: '/#solutions' },
  { labelKey: 'header.platform', href: '/#platform' },
  { labelKey: 'header.download', href: '/download' },
] as const;

// ─── Mock Meeting Participants (Meeting UI Preview) ───────────────────────────
export const MOCK_PARTICIPANTS = [
  { id: 1, name: 'Ngọc Huệ', initials: 'NH', gradient: 'from-blue-500 to-cyan-400', isMuted: false, isSpeaking: true },
  { id: 2, name: 'Hoa Lan', initials: 'HL', gradient: 'from-violet-500 to-purple-600', isMuted: true, isSpeaking: false },
  { id: 3, name: 'Trần Phúc Hưng', initials: 'PH', gradient: 'from-emerald-500 to-teal-500', isMuted: false, isSpeaking: false },
  { id: 4, name: 'Thu Hằng', initials: 'TH', gradient: 'from-orange-500 to-rose-500', isMuted: true, isSpeaking: false },
] as const;

// ─── Features ─────────────────────────────────────────────────────────────────
export const FEATURES_CONFIG = [
  { icon: 'Video', gradient: 'from-blue-500 to-cyan-500', messageKey: 0 },
  { icon: 'Sparkles', gradient: 'from-indigo-500 to-blue-600', messageKey: 1 },
  { icon: 'GraduationCap', gradient: 'from-violet-500 to-purple-600', messageKey: 2 },
  { icon: 'ShieldCheck', gradient: 'from-emerald-500 to-teal-600', messageKey: 3 },
] as const;

// ─── How It Works ─────────────────────────────────────────────────────────────
export const HOW_IT_WORKS_CONFIG = [
  { icon: 'PlusCircle', gradient: 'from-blue-500 to-cyan-500', bgLight: 'bg-blue-50', ring: 'ring-blue-200' },
  { icon: 'Share2', gradient: 'from-violet-500 to-purple-600', bgLight: 'bg-violet-50', ring: 'ring-violet-200' },
  { icon: 'Zap', gradient: 'from-emerald-500 to-teal-500', bgLight: 'bg-emerald-50', ring: 'ring-emerald-200' },
] as const;

// ─── Platforms ────────────────────────────────────────────────────────────────
export const PLATFORMS_CONFIG = [
  { key: 'web', icon: 'Globe', gradient: 'from-blue-500 to-cyan-500', messageKey: 0 },
  { key: 'desktop', icon: 'Monitor', gradient: 'from-violet-500 to-indigo-600', messageKey: 1 },
  { key: 'mobile', icon: 'Smartphone', gradient: 'from-emerald-500 to-teal-600', messageKey: 2 },
] as const;
