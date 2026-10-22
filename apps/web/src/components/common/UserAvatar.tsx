"use client";

import React, { useState } from "react";

interface UserAvatarProps {
  avatarUrl?: string | null;
  displayName?: string | null;
  /** Tailwind size class, e.g. "w-10 h-10". Default: "w-10 h-10" */
  size?: string;
  /** Extra class names to merge onto the wrapper div */
  className?: string;
  /** If true, show green/grey presence dot */
  showOnlineBadge?: boolean;
  isOnline?: boolean;
}

/**
 * Reusable avatar component with graceful fallback.
 *
 * Priority:
 * 1. Render <img> when avatarUrl is provided.
 * 2. If image fails to load (broken URL, expired signed URL, etc.), fall back
 *    to the first letter of displayName.
 * 3. If neither is available, show "U".
 */
export default function UserAvatar({
  avatarUrl,
  displayName,
  size = "w-10 h-10",
  className = "",
  showOnlineBadge = false,
  isOnline = false,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const initial = displayName?.trim().charAt(0).toUpperCase() || "U";
  const showImage = Boolean(avatarUrl) && !imgError;

  return (
    <div className={`relative shrink-0 ${className}`}>
      <div
        className={`${size} rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center text-sm font-semibold text-slate-600 shadow-xs select-none`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl!}
            alt={displayName || "User"}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>

      {showOnlineBadge && (
        <span
          className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs ${
            isOnline ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
      )}
    </div>
  );
}
