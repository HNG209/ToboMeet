"use server";

import { createClient } from "@/lib/supabase/server";

export interface UserAuthInfoResult {
  success: boolean;
  providers: string[];
  hasPassword: boolean;
  email?: string;
  error?: string;
}

/**
 * Server action to get user authentication identities and providers.
 * Runs in Server environment where HTTP-only cookies are readable via next/headers.
 */
export async function getUserAuthInfo(): Promise<UserAuthInfoResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        providers: [],
        hasPassword: false,
        error: userError?.message || "User not found",
      };
    }

    const detected = new Set<string>();

    // 1. Check user.identities
    if (Array.isArray(user.identities)) {
      user.identities.forEach((id) => {
        if (id.provider) detected.add(id.provider.toLowerCase());
      });
    }

    // 2. Fallback to getUserIdentities() if identities array is empty
    if (detected.size === 0) {
      try {
        const { data: idData } = await supabase.auth.getUserIdentities();
        if (Array.isArray(idData?.identities)) {
          idData.identities.forEach((id) => {
            if (id.provider) detected.add(id.provider.toLowerCase());
          });
        }
      } catch {
        // ignore
      }
    }

    // 3. Check app_metadata
    const appProviders = user.app_metadata?.providers;
    if (Array.isArray(appProviders)) {
      appProviders.forEach((p) => p && detected.add(p.toLowerCase()));
    }
    if (user.app_metadata?.provider) {
      detected.add(user.app_metadata.provider.toLowerCase());
    }

    // 4. Fallback if user has email and no oauth provider detected
    if (detected.size === 0 && user.email) {
      detected.add("email");
    }

    const hasPassword = detected.has("email");

    return {
      success: true,
      providers: Array.from(detected),
      hasPassword,
      email: user.email,
    };
  } catch (err: any) {
    return {
      success: false,
      providers: [],
      hasPassword: false,
      error: err?.message || "Internal server error",
    };
  }
}


