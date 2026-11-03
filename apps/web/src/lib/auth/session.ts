/**
 * Updates HTTP-only session cookies in the browser by calling the /api/auth/bridge Route Handler.
 * Reuses the existing /api/auth/bridge endpoint with Accept: application/json.
 */
export async function refreshWebSession(session: {
  access_token: string;
  refresh_token: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/bridge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        success: false,
        error: data.error || data.details || `HTTP error ${res.status}`,
      };
    }

    return await res.json();
  } catch (err: any) {
    console.error("[refreshWebSession] Failed to call /api/auth/bridge:", err);
    return {
      success: false,
      error: err?.message || "Failed to update session",
    };
  }
}
