import { NextResponse } from "next/server";
import { aiFail, asLang, LANG_NAME, managerOnly, readJson, str } from "@/lib/ai-route";
import type { BoostAdvice } from "@/lib/ai-shared";
import { generateWithBrandVoice } from "@/lib/brand-gemini";
import { adminClient } from "@/lib/server";

/** Manager only. Body: { category, caption, placements, jobId?, lang } → boost budget advice using recent weekly numbers. */
export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    recommended_budget_usd: { type: "number", description: "Total budget in US dollars for the whole boost." },
    duration_days: { type: "integer", description: "How many days to run the boost." },
    target_audience: { type: "string", description: "Locations, age range and interests — within Meta's Employment special ad category limits." },
    reason: { type: "string", description: "Short explanation that refers to the numbers." },
  },
  required: ["recommended_budget_usd", "duration_days", "target_audience", "reason"],
};

export async function POST(req: Request) {
  const denied = await managerOnly(req);
  if (denied) return denied;
  const b = await readJson<{ category: string; caption: string; placements: string[]; jobId: string; lang: string }>(req);
  const lang = asLang(b.lang);

  const sb = adminClient();
  const { data: metrics } = await sb
    .from("metrics_weekly")
    .select("week_start, platform, reach, engagement, new_followers, link_clicks")
    .order("week_start", { ascending: false })
    .limit(32);
  let job = "";
  if (b.jobId) {
    const { data: j } = await sb.from("job_orders").select("title, location, positions, deadline, status").eq("id", b.jobId).maybeSingle();
    if (j) job = `${j.title} in ${j.location}, ${j.positions} positions, deadline ${j.deadline ?? "none"}${j.status === "hot" ? ", URGENT" : ""}`;
  }

  // weekly averages per platform over the recorded weeks (newest 8 per platform)
  const rows = metrics ?? [];
  const stats = (["facebook", "tiktok"] as const)
    .map((pf) => {
      const r = rows.filter((m) => m.platform === pf).slice(0, 8);
      if (!r.length) return "";
      const avg = (k: "reach" | "engagement" | "new_followers" | "link_clicks") => Math.round(r.reduce((a, m) => a + (Number(m[k]) || 0), 0) / r.length);
      const er = avg("reach") ? ((avg("engagement") / avg("reach")) * 100).toFixed(1) : "0";
      return `${pf} (average of last ${r.length} weeks): reach ${avg("reach")}/week, engagement ${avg("engagement")}/week (${er}% of reach), new followers ${avg("new_followers")}/week, link clicks ${avg("link_clicks")}/week. Latest week ${r[0].week_start}: reach ${r[0].reach}, engagement ${r[0].engagement}.`;
    })
    .filter(Boolean)
    .join("\n");

  const prompt = `Suggest a paid boost for this post. We are a small recruitment agency with a modest budget (typical boosts are 5–50 USD).
Hiring posts must follow Meta's Employment special ad category (no age/gender targeting, location radius ≥ 15 miles). Be concrete and realistic.
Write target_audience and reason in ${LANG_NAME[lang]}.

Post type (pillar): ${str(b.category, 50) || "unknown"}
Placements: ${(Array.isArray(b.placements) ? b.placements : []).join(", ") || "fb_post"}
${job ? `Linked job: ${job}\n` : ""}=== CAPTION ===
${str(b.caption, 3000) || "(empty)"}

=== RECENT PERFORMANCE AVERAGES (organic, from our Performance page) ===
${stats || "(no numbers recorded yet)"}`;

  try {
    const out = await generateWithBrandVoice<BoostAdvice>({ prompt, schema: SCHEMA, includeTemplates: false });
    return NextResponse.json({
      recommended_budget_usd: Math.max(0, Math.round(Number(out.recommended_budget_usd) || 0)),
      duration_days: Math.max(1, Math.round(Number(out.duration_days) || 1)),
      target_audience: str(out.target_audience, 2000),
      reason: str(out.reason, 2000),
    } satisfies BoostAdvice);
  } catch (e) {
    return aiFail(e);
  }
}
