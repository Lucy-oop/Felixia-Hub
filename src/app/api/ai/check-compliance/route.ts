import { NextResponse } from "next/server";
import { aiFail, asLang, LANG_NAME, managerOnly, readJson, str } from "@/lib/ai-route";
import type { ComplianceIssue, ComplianceResult } from "@/lib/ai-shared";
import { generateWithBrandVoice } from "@/lib/brand-gemini";

/**
 * Manager only. Body: { title, caption, tiktokCaption, hashtags, cta, placements, lang }
 * → { status: "pass" | "warning", issues: [{ risky_text, reason, suggested_fix }] } checked against compliance_rules.
 */
export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["pass", "warning"] },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          risky_text: { type: "string", description: "The risky phrase copied EXACTLY, character for character, from the post (short: a few words to one sentence)." },
          reason: { type: "string", description: "Which rule it breaks and why." },
          suggested_fix: { type: "string", description: "A safe rewrite that can directly replace risky_text (same language as the post). Empty string to delete it." },
        },
        required: ["risky_text", "reason", "suggested_fix"],
      },
    },
  },
  required: ["status", "issues"],
};

export async function POST(req: Request) {
  const denied = await managerOnly(req);
  if (denied) return denied;
  const b = await readJson<{ title: string; caption: string; tiktokCaption: string; hashtags: string; cta: string; placements: string[]; lang: string }>(req);
  const lang = asLang(b.lang);
  const fields = { caption: str(b.caption), tiktokCaption: str(b.tiktokCaption, 3000), hashtags: str(b.hashtags, 500), cta: str(b.cta, 300) };
  if (!fields.caption.trim() && !fields.tiktokCaption.trim()) return NextResponse.json({ error: "ai.err.noText" }, { status: 400 });

  const prompt = `Check this post against our FACEBOOK & TIKTOK COMPLIANCE RULES (Meta Employment Ad / Special Ad Category policies and TikTok rules for overseas recruitment).
Look for: discriminatory wording (age, gender, nationality, religion, marital status…), guaranteed or misleading income / visa promises, fees charged to workers, personal-data requests, prohibited claims, and anything the compliance rules forbid.
For each problem, copy the risky phrase EXACTLY as written in the post (so it can be found and replaced), explain the reason in ${LANG_NAME[lang]}, and give a safe rewrite in the post's own language.
Return status "pass" with an empty issues list only when nothing needs changing.

Placements: ${(Array.isArray(b.placements) ? b.placements : []).join(", ") || "fb_post"}
Title: ${str(b.title, 300)}
=== FACEBOOK CAPTION ===
${fields.caption || "(none)"}
=== TIKTOK CAPTION ===
${fields.tiktokCaption || "(none)"}
=== HASHTAGS ===
${fields.hashtags || "(none)"}
=== CTA ===
${fields.cta || "(none)"}`;

  try {
    const out = await generateWithBrandVoice<ComplianceResult>({ prompt, schema: SCHEMA, includeTemplates: false });
    const issues: ComplianceIssue[] = (Array.isArray(out.issues) ? out.issues : [])
      .map((i) => ({ risky_text: str(i?.risky_text, 1000).trim(), reason: str(i?.reason, 1000).trim(), suggested_fix: str(i?.suggested_fix, 2000).trim() }))
      .filter((i) => i.risky_text && i.reason);
    return NextResponse.json({ status: issues.length ? "warning" : "pass", issues } satisfies ComplianceResult);
  } catch (e) {
    return aiFail(e);
  }
}
