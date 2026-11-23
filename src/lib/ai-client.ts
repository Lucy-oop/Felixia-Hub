"use client";

import { supabase } from "./supabase";

/** Calls one of the manager-only /api/ai/* routes with the signed-in user's token. */
export async function callAI<T>(path: string, body: unknown): Promise<{ data?: T; error?: string; retryAfter?: number }> {
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(`/api/ai/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? `Error ${res.status}`, retryAfter: res.status === 429 || res.status === 503 ? Number(json.retryAfter) || 20 : undefined };
    return { data: json as T };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
