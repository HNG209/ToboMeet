"use client";

import React from "react";

export default function RoomSkeleton() {
  return (
    <div className="h-screen w-full flex bg-white font-sans overflow-hidden text-slate-900 select-none animate-pulse">
      {/* ================= LEFT SIDEBAR SKELETON ================= */}
      <aside className="w-64 h-full bg-[#f5f5f5] flex flex-col border-r border-slate-200 shrink-0">
        {/* Room Header */}
        <div className="px-4 h-14 flex items-center justify-between border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-md bg-slate-200 shrink-0" />
            <div className="h-4 w-28 bg-slate-300 rounded" />
          </div>
          <div className="w-7 h-7 rounded-md bg-slate-200 shrink-0" />
        </div>

        {/* Room Code & Quick Action Banner */}
        <div className="p-3 border-b border-slate-200/80">
          <div className="h-8 w-full rounded-lg bg-slate-200" />
        </div>

        {/* Channels Section */}
        <div className="p-3 flex-1 overflow-hidden space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="h-3 w-16 bg-slate-200 rounded" />
            <div className="w-4 h-4 rounded bg-slate-200" />
          </div>

          <div className="space-y-1.5">
            {/* Active channel skeleton */}
            <div className="h-8 w-full rounded-md bg-slate-300/80 flex items-center px-3 gap-2">
              <div className="w-4 h-4 rounded bg-slate-400/50 shrink-0" />
              <div className="h-3.5 w-20 bg-slate-400/60 rounded" />
            </div>
            {/* Other channels */}
            <div className="h-8 w-full rounded-md bg-slate-200/60 flex items-center px-3 gap-2">
              <div className="w-4 h-4 rounded bg-slate-300 shrink-0" />
              <div className="h-3.5 w-24 bg-slate-300 rounded" />
            </div>
            <div className="h-8 w-full rounded-md bg-slate-200/60 flex items-center px-3 gap-2">
              <div className="w-4 h-4 rounded bg-slate-300 shrink-0" />
              <div className="h-3.5 w-16 bg-slate-300 rounded" />
            </div>
            <div className="h-8 w-full rounded-md bg-slate-200/60 flex items-center px-3 gap-2">
              <div className="w-4 h-4 rounded bg-slate-300 shrink-0" />
              <div className="h-3.5 w-28 bg-slate-300 rounded" />
            </div>
          </div>

          {/* Assignments Module section skeleton */}
          <div className="pt-2">
            <div className="flex items-center justify-between px-2 mb-2">
              <div className="h-3 w-20 bg-slate-200 rounded" />
            </div>
            <div className="h-8 w-full rounded-md bg-slate-200/60 flex items-center px-3 gap-2">
              <div className="w-4 h-4 rounded bg-slate-300 shrink-0" />
              <div className="h-3.5 w-24 bg-slate-300 rounded" />
            </div>
          </div>
        </div>

        {/* Bottom User Profile Skeleton */}
        <div className="p-3 border-t border-slate-200 flex items-center gap-2.5 shrink-0 bg-[#f0f0f0]">
          <div className="w-8 h-8 rounded-full bg-slate-300 shrink-0" />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="h-3.5 w-24 bg-slate-300 rounded" />
            <div className="h-2.5 w-16 bg-slate-200 rounded" />
          </div>
        </div>
      </aside>

      {/* ================= MAIN CONTENT SKELETON ================= */}
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-white">
        {/* Main Content Header */}
        <header className="h-14 px-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-brand-100 rounded shrink-0" />
              <div className="h-5 w-24 bg-slate-200 rounded" />
            </div>

            {/* Tabs skeleton */}
            <div className="hidden sm:flex items-center gap-4 ml-6">
              <div className="h-4 w-16 bg-brand-300/60 rounded" />
              <div className="h-4 w-14 bg-slate-200 rounded" />
              <div className="h-4 w-20 bg-slate-200 rounded" />
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2">
            <div className="h-9 w-36 rounded-lg bg-indigo-100 shrink-0" />
            <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
          </div>
        </header>

        {/* Main Feed Body */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col justify-between bg-slate-50/40">
          {/* Post Skeletons */}
          <div className="space-y-4 overflow-hidden max-w-4xl w-full mx-auto">
            {/* Card 1 */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                  <div className="h-2.5 w-20 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="space-y-2 pl-13">
                <div className="h-4 w-3/4 bg-slate-200/80 rounded" />
                <div className="h-4 w-1/2 bg-slate-200/60 rounded" />
              </div>
              <div className="pt-2 pl-13">
                <div className="h-8 w-32 rounded-lg bg-slate-100" />
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-28 bg-slate-200 rounded" />
                  <div className="h-2.5 w-24 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="space-y-2 pl-13">
                <div className="h-4 w-5/6 bg-slate-200/80 rounded" />
                <div className="h-4 w-2/3 bg-slate-200/60 rounded" />
              </div>
            </div>
          </div>

          {/* Bottom Chat / Compose Bar Skeleton */}
          <div className="max-w-4xl w-full mx-auto pt-4">
            <div className="h-14 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center justify-between px-4">
              <div className="h-4 w-48 bg-slate-200 rounded" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100" />
                <div className="w-8 h-8 rounded-lg bg-brand-100" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

