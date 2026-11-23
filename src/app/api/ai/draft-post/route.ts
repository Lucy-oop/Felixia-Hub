import { NextResponse } from "next/server";
import { aiFail, asLang, cardContext, LANG_NAME, managerOnly, readJson, str } from "@/lib/ai-route";
import { cleanScript, GRAPHIC_FIELDS, TIKTOK_SCRIPT_SCHEMA, type DraftPostResult, type TikTokScript } from "@/lib/ai-shared";
import { generateWithBrandVoice } from "@/lib/brand-gemini";

/**
 * Manager only. Body: { headline, platform: "facebook" | "tiktok", lang, cardId?, category? } → FB caption or 30s TikTok
 * script + graphic headline + visual idea.
 * - Hiring posts: strict — follow the saved hiring template, facts only, low temperature (0.2).
 * - Every other post (Educational, Knowledge, Brand, Marketing, Ideas Inbox): the saved templates are only style
 *   guides; the AI picks a fresh structure and writes natural conversational Burmese, temperature 0.75.
 *   Compliance rules still apply in full.
 */
export const maxDuration = 60;

/** Non-hiring posts: templates guide the style only; the writing should feel human and varied. */
const CREATIVE_RULES = `This is NOT a hiring post. The saved post templates and the brand voice are flexible style and tone guidelines, not a fill-in-the-blank form: never copy a template's headings, emoji labels or line layout.
Choose the structure that best fits the idea (story, relatable scenario, Q&A, myth vs. fact, short tips, step-by-step) so posts feel fresh and varied.
When writing Burmese, write natural, fluent, conversational Burmese — never robotic, overly formal or word-for-word translated.
The Facebook & TikTok compliance rules are NOT flexible: follow them strictly.
Never invent facts, numbers, salaries, dates or visa rules.`;

const FB_SCHEMA = {
  type: "object",
  properties: {
    caption: { type: "string", description: "The full Facebook post caption." },
    hashtags: { type: "string", description: "Hashtags separated by spaces." },
    cta: { type: "string", description: "One short call to action." },
    ...GRAPHIC_FIELDS,
  },
  required: ["caption", "hashtags", "cta", "graphic_headline", "visual_idea"],
};
const TT_SCHEMA = {
  type: "object",
  properties: {
    script: TIKTOK_SCRIPT_SCHEMA,
    caption: { type: "string", description: "The short TikTok post caption (1–3 lines)." },
    hashtags: { type: "string", description: "Hashtags separated by spaces." },
    cta: { type: "string", description: "Same call to action as the script's ending, short." },
    ...GRAPHIC_FIELDS,
  },
  required: ["script", "caption", "hashtags", "cta", "graphic_headline", "visual_idea"],
};

export async function POST(req: Request) {
  const denied = await managerOnly(req);
  if (denied) return denied;
  const body = await readJson<{ headline: string; platform: string; lang: string; cardId: string; category: string }>(req);
  const lang = asLang(body.lang);
  const tiktok = body.platform === "tiktok";
  const headline = str(body.headline, 300).trim();
  if (!headline) return NextResponse.json({ error: "Missing headline" }, { status: 400 });
  const context = await cardContext(body.cardId);
  // the editor's (maybe unsaved) category wins; else the saved post's pillar
  const category = str(body.category, 40) || context.match(/^Pillar: (.+)$/m)?.[1] || "";
  const hiring = /^(hiring|recruitment)$/i.test(category.trim());
  const myanmar = lang === "my";
  const facts = `Never invent salaries, dates, visa rules, numbers or other facts that are not given below.${context ? `\n\n=== CONTEXT ===\n${context}` : ""}`;

  const prompt = hiring
    ? tiktok
      ? `Write a 30-second TikTok video script for this hiring headline: "${headline}".
Follow the saved tiktok_script template and our brand voice. Structure: 0–3s hook, 3–25s spoken script with on-screen text overlays, 25–30s call to action.
Write everything in ${LANG_NAME[lang]}. Keep salary, location, visa and requirements exactly as given.
${facts}
Also give a 5–7 word graphic_headline for the video cover and a one-line visual_idea (setting, shots) for the video editor.`
      : `Write a Facebook hiring post for this headline: "${headline}".
Follow the saved fb_hiring_tokutei or fb_hiring_katsudo template (pick the one that matches the visa) line by line, in our brand voice. Write everything in ${LANG_NAME[lang]}.
Keep salary, location, visa and requirements exactly as given; leave out a template line whose detail is not given.
${facts}
Also give a 5–7 word graphic_headline for the Canva graphic and a one-line visual_idea for the designer.`
    : `Write a ${tiktok ? "30-second TikTok video script" : "Facebook post"} for this ${category ? `${category} ` : ""}headline: "${headline}".
Write everything in ${LANG_NAME[lang]}.

HOW TO WRITE IT:
- The saved templates and brand voice are STYLE GUIDES (tone, emoji use, sign-off, hashtags) — not a form to fill in. Do not copy their headings or layout.
- Pick the structure that fits THIS idea best — e.g. a short story, a relatable scenario ("ဂျပန်ရောက်ခါစ ဒီလိုဖြစ်ဖူးလား…"), Q&A, myth vs. fact, a numbered list of quick tips, or a simple step-by-step. Vary it; don't default to the same layout every time.
- Open with a hook that makes a Myanmar worker stop scrolling, then give real, useful value, then end with a light call to action.${
        myanmar
          ? `
- Write natural, fluent, conversational Burmese — the way a friendly Myanmar person who lives in Japan would talk to friends on Facebook. Use everyday words and spoken endings (ပါတယ် / နော် / ရယ် / ဗျ / ရှင့်) where they feel natural. Avoid stiff, formal or word-for-word translated Burmese, and avoid long government-style sentences.
- Japanese terms people really use (e.g. 在留カード, JLPT N4, 特定技能) can stay in Japanese.`
          : ""
      }
- Short paragraphs and line breaks so it reads easily on a phone.${
        tiktok
          ? `
- Script structure: 0–3s hook, 3–25s spoken script with on-screen text overlays, 25–30s call to action.`
          : ""
      }
- Follow the Facebook & TikTok compliance rules strictly — they are not flexible.
${facts}
Also give a 5–7 word graphic_headline for the ${tiktok ? "video cover" : "Canva graphic"} and a one-line visual_idea for the ${tiktok ? "video editor" : "designer"}.`;

  try {
    const out = await generateWithBrandVoice<Omit<DraftPostResult, "script"> & { script?: TikTokScript }>({
      prompt,
      schema: tiktok ? TT_SCHEMA : FB_SCHEMA,
      includeTemplates: hiring
        ? tiktok
          ? ["tiktok_script"]
          : ["fb_hiring_tokutei", "fb_hiring_katsudo"]
        : tiktok
          ? ["tiktok_script"]
          : ["fb_educational"],
      includeCompliance: true,
      temperature: hiring ? 0.2 : 0.75,
      ...(hiring ? {} : { systemRules: CREATIVE_RULES }),
    });
    return NextResponse.json({
      caption: str(out.caption),
      script: tiktok ? cleanScript(out.script) : null,
      hashtags: str(out.hashtags, 500),
      cta: str(out.cta, 300),
      graphic_headline: str(out.graphic_headline, 160),
      visual_idea: str(out.visual_idea, 400),
    } satisfies DraftPostResult);
  } catch (e) {
    return aiFail(e);
  }
}
