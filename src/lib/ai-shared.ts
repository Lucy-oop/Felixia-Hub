/** Types + helpers shared by the /api/ai/* routes and the AI tools UI (safe for client and server). */

import type { HiringVisa } from "./hiring-templates";

/** 30-second TikTok script. */
export interface TikTokScript {
  hook: string; // 0–3s
  spoken: string; // 3–25s voice-over / talking
  on_screen: string[]; // 3–25s text overlays, in order
  cta: string; // 25–30s
}

export const TIKTOK_SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "0–3s: the scroll-stopping first line (spoken and on screen)." },
    spoken: { type: "string", description: "3–25s: what the presenter says (about 55–65 words)." },
    on_screen: { type: "array", items: { type: "string" }, description: "3–25s: short on-screen text overlays, in order (3–6 items, max ~6 words each)." },
    cta: { type: "string", description: "25–30s: the call to action." },
  },
  required: ["hook", "spoken", "on_screen", "cta"],
};

export const GRAPHIC_FIELDS = {
  graphic_headline: { type: "string", description: "5–7 word headline for the Canva graphic / video cover." },
  visual_idea: { type: "string", description: "ONE line describing the picture or video for the designer." },
};

export interface HiringPostResult {
  title: string;
  caption: string;
  tiktok_caption: string;
  hashtags: string;
  cta: string;
  graphic_headline: string;
  visual_idea: string;
  /** "template" = caption filled from the client's text by code (exact); "ai" = written by Gemini */
  source?: "template" | "ai";
  /** which visa template was used (Tokutei Ginou / Katsudo) */
  visa?: HiringVisa;
  /** details from the client's text that the AI caption is missing — the manager should check them */
  missing?: { label: string; value: string }[];
}

export interface DraftPostResult {
  caption: string; // Facebook caption, or the TikTok post caption
  script: TikTokScript | null; // TikTok only
  hashtags: string;
  cta: string;
  graphic_headline: string;
  visual_idea: string;
}

export interface RepurposeResult {
  title: string;
  script: TikTokScript;
  tiktok_caption: string;
  hashtags: string;
  graphic_headline: string;
  visual_idea: string;
}

export interface ComplianceIssue {
  risky_text: string; // exact words from the post
  reason: string;
  suggested_fix: string; // safe rewrite of risky_text
}
export interface ComplianceResult {
  status: "pass" | "warning";
  issues: ComplianceIssue[];
}

export interface BoostAdvice {
  recommended_budget_usd: number;
  duration_days: number;
  target_audience: string;
  reason: string;
}

/** Plain text of a TikTok script (for the post notes). */
export function formatScript(s: TikTokScript): string {
  return [
    `[0–3s HOOK] ${s.hook}`,
    `[3–25s SCRIPT] ${s.spoken}`,
    s.on_screen.length ? `[3–25s ON-SCREEN TEXT]\n${s.on_screen.map((x) => `• ${x}`).join("\n")}` : "",
    `[25–30s CTA] ${s.cta}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Notes block for the designer. */
export function designNotes(graphicHeadline?: string, visualIdea?: string): string {
  return [graphicHeadline && `Graphic headline: ${graphicHeadline}`, visualIdea && `Visual idea: ${visualIdea}`].filter(Boolean).join("\n");
}

export const cleanScript = (s: Partial<TikTokScript> | null | undefined): TikTokScript => ({
  hook: String(s?.hook ?? "").trim(),
  spoken: String(s?.spoken ?? "").trim(),
  on_screen: Array.isArray(s?.on_screen) ? s!.on_screen.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : [],
  cta: String(s?.cta ?? "").trim(),
});
