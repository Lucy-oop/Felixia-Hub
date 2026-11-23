import "server-only";
import { NextResponse } from "next/server";
import { isOverloaded } from "@/lib/brand-gemini";
import { adminClient, caller, hasAdmin } from "@/lib/server";

/** Shared bits for the /api/ai/* routes (manager-only Gemini features). */

export type AiLang = "my" | "en" | "ja";
export const LANG_NAME: Record<AiLang, string> = {
  my: "Myanmar (Burmese, Unicode script)",
  en: "English",
  ja: "Japanese",
};
export const asLang = (v: unknown): AiLang =>
  v === "my" || v === "ja" || v === "en" ? v : "en";

/** Returns an error response unless the caller is the content manager (and the server is set up). */
export async function managerOnly(req: Request): Promise<NextResponse | null> {
  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ error: "ai.err.noKey" }, { status: 500 });
  if (!hasAdmin())
    return NextResponse.json({ error: "ai.err.noAdmin" }, { status: 500 });
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "err.noAccess" }, { status: 401 });
  if (me?.role !== "manager")
    return NextResponse.json({ error: "err.noAccess" }, { status: 403 });
  return null;
}

export async function readJson<T>(req: Request): Promise<Partial<T>> {
  return ((await req.json().catch(() => ({}))) ?? {}) as Partial<T>;
}

/** Turns a Gemini / Supabase failure into a JSON error the UI can show. */
export function aiFail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[ai]", msg);
  if (/brand_settings/.test(msg))
    return NextResponse.json({ error: "brand.missing" }, { status: 500 });
  if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg)) {
    // Gemini often says how long to wait ("retryDelay":"23s" / "retry in 23.4s")
    const m = msg.match(/retry(?:Delay"?:\s*"|\s+in\s+)(\d+(?:\.\d+)?)s/i);
    const retryAfter = Math.min(
      Math.max(Math.ceil(Number(m?.[1]) || 30), 5),
      120,
    );
    return NextResponse.json(
      { error: "ai.err.busy", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  if (isOverloaded(e))
    return NextResponse.json(
      { error: "ai.err.overloaded", retryAfter: 20 },
      { status: 503, headers: { "Retry-After": "20" } },
    );
  if (/API key|PERMISSION_DENIED|401|403/i.test(msg))
    return NextResponse.json({ error: "ai.err.noKey" }, { status: 500 });
  if (e instanceof SyntaxError)
    return NextResponse.json({ error: "ai.err.bad" }, { status: 502 });
  return NextResponse.json({ error: `AI error: ${msg}` }, { status: 502 });
}

export const str = (v: unknown, max = 8000) =>
  typeof v === "string" ? v.slice(0, max) : "";

/** Pillar, notes and linked job of a saved post, as prompt context. */
export async function cardContext(cardId: string | undefined) {
  if (!cardId) return "";
  const sb = adminClient();
  const { data: c } = await sb
    .from("content_cards")
    .select("category, notes, client_note, job_id")
    .eq("id", cardId)
    .maybeSingle();
  if (!c) return "";
  let out = `Pillar: ${c.category}\n`;
  if (c.notes) out += `Manager notes: ${str(c.notes, 1500)}\n`;
  if (c.client_note) out += `Client note: ${str(c.client_note, 1500)}\n`;
  if (c.job_id) {
    const { data: j } = await sb
      .from("job_orders")
      .select(
        "title, location, salary_min, salary_max, currency, salary_per, requirements, benefits",
      )
      .eq("id", c.job_id)
      .maybeSingle();
    if (j)
      out += `Linked job: ${j.title} in ${j.location}, ${j.salary_min}–${j.salary_max} ${j.currency}/${j.salary_per}\nRequirements: ${j.requirements}\nBenefits: ${j.benefits}\n`;
  }
  return out;
}
