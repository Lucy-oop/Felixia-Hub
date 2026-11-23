import { NextResponse } from "next/server";
import { aiFail, asLang, cardContext, LANG_NAME, managerOnly, readJson, str } from "@/lib/ai-route";
import { cleanScript, GRAPHIC_FIELDS, TIKTOK_SCRIPT_SCHEMA, type RepurposeResult } from "@/lib/ai-shared";
import { generateWithBrandVoice } from "@/lib/brand-gemini";

/** Manager only. Body: { title, caption, hashtags, cardId?, lang } → a 30-second TikTok script made from a Facebook post. */
export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short internal title for the TikTok post." },
    script: TIKTOK_SCRIPT_SCHEMA,
    tiktok_caption: { type: "string", description: "The short TikTok post caption (1–3 lines)." },
    hashtags: { type: "string", description: "TikTok hashtags separated by spaces." },
    ...GRAPHIC_FIELDS,
  },
  required: ["title", "script", "tiktok_caption", "hashtags", "graphic_headline", "visual_idea"],
};

export async function POST(req: Request) {
  const denied = await managerOnly(req);
  if (denied) return denied;
  const b = await readJson<{ title: string; caption: string; hashtags: string; cardId: string; lang: string }>(req);
  const lang = asLang(b.lang);
  const caption = str(b.caption).trim();
  if (!caption) return NextResponse.json({ error: "ai.err.noText" }, { status: 400 });
  const context = await cardContext(b.cardId);

  const prompt = `Turn this Facebook post into a 30-second TikTok video script.
Structure: 0–3s hook (scroll-stopping), 3–25s spoken script with short on-screen text overlays, 25–30s call to action.
Keep every fact (job, salary, dates, requirements) exactly as in the Facebook post — never add new facts. Make it conversational and fast, following the saved tiktok_script template and our brand voice.
Write everything in ${LANG_NAME[lang]}. Also give a 5–7 word graphic_headline for the video cover and a one-line visual_idea (setting, shots) for the video editor.
${context ? `\n=== CONTEXT ===\n${context}` : ""}
=== FACEBOOK POST: ${str(b.title, 200)} ===
${caption}
${str(b.hashtags, 500)}`;

  try {
    const out = await generateWithBrandVoice<RepurposeResult>({ prompt, schema: SCHEMA, includeTemplates: ["tiktok_script"] });
    const script = cleanScript(out.script);
    if (!script.hook && !script.spoken) return NextResponse.json({ error: "ai.err.bad" }, { status: 502 });
    return NextResponse.json({
      title: str(out.title, 160).trim(),
      script,
      tiktok_caption: str(out.tiktok_caption, 2000),
      hashtags: str(out.hashtags, 500),
      graphic_headline: str(out.graphic_headline, 160),
      visual_idea: str(out.visual_idea, 400),
    } satisfies RepurposeResult);
  } catch (e) {
    return aiFail(e);
  }
}
