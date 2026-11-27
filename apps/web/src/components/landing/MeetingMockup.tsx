import { Video, MicOff, PhoneOff, Users, MessageSquare, ScreenShare, Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MOCK_PARTICIPANTS } from '@/lib/constants';

export default function MeetingMockup() {
  const t = useTranslations('hero');

  // Sidebar buttons config
  const sidebarButtons = [
    { label: 'H', active: true },
    { label: 'C', active: false },
    { label: 'T', active: false },
    { label: 'S', active: false }
  ];

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#131d2b] flex flex-col">
      {/* ── Window Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#182335] border-b border-slate-800/40 select-none">
        <div className="flex gap-1.5 flex-1">
          <div className="w-3 h-3 rounded-full bg-red-500/90" />
          <div className="w-3 h-3 rounded-full bg-amber-400/90" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/90" />
        </div>
        <span className="text-[12px] font-semibold text-slate-300 tracking-wide flex-1 text-center">
          {t('mockup_title')}
        </span>
        <div className="flex-1 flex items-center justify-end gap-3">
          {/* Live badge */}
          <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 rounded-full px-2.5 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-blink" />
            <span className="text-[11px] font-bold text-red-400">{t('mockup_live')}</span>
          </div>
          {/* Participants count matching preview tiles */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700/80 text-[11px] text-slate-300">
            <Users size={11} />
            <span>{MOCK_PARTICIPANTS.length}</span>
          </div>
        </div>
      </div>

      {/* ── Main Window Content (Sidebar + Main Workspace) ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-16 bg-[#0c131e] flex flex-col items-center gap-3.5 py-4 border-r border-slate-900/60 flex-shrink-0">
          {sidebarButtons.map((btn) => (
            <button
              key={btn.label}
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[13px] transition-all duration-200
                ${btn.active 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10' 
                  : 'bg-[#1b2533] text-slate-500 hover:bg-[#253245] hover:text-slate-300'}`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Main Workspace (Video grid + Toolbar) */}
        <div className="flex-1 bg-[#151f2e] flex flex-col justify-between overflow-hidden">
          {/* Video Grid Container with padding */}
          <div className="flex-1 p-4 sm:p-5 overflow-hidden flex items-center justify-center">
            <div className="grid grid-cols-2 gap-4 w-full h-full">
              {MOCK_PARTICIPANTS.map((participant) => (
                <div
                  key={participant.id}
                  className={`relative bg-[#1f2b3e] rounded-[18px] flex items-center justify-center overflow-hidden transition-all duration-300 shadow-sm
                    ${participant.isSpeaking ? 'ring-2 ring-inset ring-brand-500/80' : ''}`}
                >
                  {participant.isSpeaking && (
                    <div className="absolute inset-0 bg-brand-500/5" />
                  )}

                  {/* Centered Avatar */}
                  <div className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${participant.gradient} flex items-center justify-center text-white text-xs sm:text-sm font-bold shadow-md`}>
                    {participant.isSpeaking && (
                      <div className="absolute -inset-1 rounded-full border-2 border-brand-400 animate-ping-slow opacity-60" />
                    )}
                    {participant.initials}
                  </div>

                  {/* Name chip (bottom left) */}
                  <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 z-10">
                    <span className="text-[9px] sm:text-[10px] font-semibold text-white bg-black/60 rounded px-1.5 py-0.5 backdrop-blur-sm">
                      {participant.name}
                    </span>
                    {participant.isMuted && (
                      <div className="w-3.5 h-3.5 rounded-full bg-red-500/90 flex items-center justify-center">
                        <MicOff size={8} className="text-white" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#182335] border-t border-slate-800/40 flex-shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center text-white">
                <Mic size={14} />
              </button>
              <button className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center text-white">
                <Video size={14} />
              </button>
              <button className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center text-white">
                <ScreenShare size={14} />
              </button>
              <button className="relative w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors flex items-center justify-center text-white">
                <MessageSquare size={14} />
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand-500 text-white text-[7px] flex items-center justify-center font-bold">3</span>
              </button>
            </div>

            <button className="flex items-center gap-1 px-3.5 h-8 rounded-full bg-red-500 hover:bg-red-600 transition-colors text-white text-[11px] font-semibold">
              <PhoneOff size={12} />
              <span>{t('mockup_leave')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
