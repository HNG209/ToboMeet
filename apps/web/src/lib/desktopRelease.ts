// ─── Desktop Release Manifest Helper ──────────────────────────────────────────
// Reads the latest Windows desktop installer metadata uploaded to Cloudflare R2
// under the `desktop-releases/latest/latest.json` path inside the `tobomeet` bucket.

export interface DesktopReleaseManifest {
  version: string;
  fileName: string;
  downloadUrl: string;
  fileSize?: number;
  sha256?: string;
  releasedAt?: string;
  platform?: string;
}

export interface DesktopReleaseInfo {
  available: boolean;
  version: string | null;
  fileName: string | null;
  downloadUrl: string;
  fileSize: number | null;
  releasedAt: string | null;
  source: "r2" | "fallback";
}

const GITHUB_RELEASES_FALLBACK_URL =
  "https://github.com/HNG209/ToboMeet/releases/latest";

const DESKTOP_RELEASES_FOLDER = "desktop-releases";

function resolveManifestUrl(): string | null {
  const explicitUrl = process.env.NEXT_PUBLIC_DESKTOP_MANIFEST_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim();
  if (!r2PublicUrl) {
    return null;
  }

  const normalizedBase = r2PublicUrl.replace(/\/+$/, "");
  return `${normalizedBase}/${DESKTOP_RELEASES_FOLDER}/latest/latest.json`;
}

export async function getLatestDesktopRelease(): Promise<DesktopReleaseInfo> {
  const manifestUrl = resolveManifestUrl();

  if (!manifestUrl) {
    return {
      available: false,
      version: null,
      fileName: null,
      downloadUrl: GITHUB_RELEASES_FALLBACK_URL,
      fileSize: null,
      releasedAt: null,
      source: "fallback",
    };
  }

  try {
    const response = await fetch(manifestUrl, {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Manifest fetch failed with status ${response.status}`);
    }

    const data = (await response.json()) as Partial<DesktopReleaseManifest>;

    if (!data.downloadUrl || !data.version) {
      throw new Error("Manifest missing required fields");
    }

    return {
      available: true,
      version: data.version,
      fileName: data.fileName ?? `ToboMeet-Setup-${data.version}.exe`,
      downloadUrl: data.downloadUrl,
      fileSize: typeof data.fileSize === "number" ? data.fileSize : null,
      releasedAt: data.releasedAt ?? null,
      source: "r2",
    };
  } catch {
    return {
      available: false,
      version: null,
      fileName: null,
      downloadUrl: GITHUB_RELEASES_FALLBACK_URL,
      fileSize: null,
      releasedAt: null,
      source: "fallback",
    };
  }
}

export function formatFileSize(bytes: number | null, locale: string): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  const formatted = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(mb);
  return `${formatted} MB`;
}

export function formatReleaseDate(isoDate: string | null, locale: string): string | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

