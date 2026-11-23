import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Reads reach / engagement / new followers / link clicks from Facebook or TikTok insight screenshots.
 * Only the content manager may call it. Body: { shotIds: string[] } (rows in metric_shots).
 */
export const maxDuration = 60;

const MODEL = "claude-opus-5-5";
const SCHEMA = {
  type: "object",
  properties: {
    reach: { type: "integer", description: "Total reach / accounts reached / views of the page's content in the period. 0 if not visible." },
    engagement: { type: "integer", description: "Total engagements / interactions (reactions + comments + shares + saves). 0 if not visible." },
    newFollowers: { type: "integer", description: "Net new followers / follows gained in the period (can be negative). 0 if not visible." },
    linkClicks: { type: "integer", description: "Link clicks / profile link taps / website clicks. 0 if not visible." },
  },
  required: ["reach", "engagement", "newFollowers", "linkClicks"],
  additionalProperties: false,
} as const;

const PROMPT = `These are screenshots of social media insights (Meta Business Suite / Facebook Insights or TikTok Studio analytics) for one platform and one week.
Read the numbers and return them as JSON.
- Convert abbreviations to whole numbers: "1.2K" = 1200, "3.4M" = 3400000, "1,234" = 1234, "1.2万" = 12000.
- If a metric appears in several screenshots, use the total for the whole period, not a single post.
- If a metric is not visible in any screenshot, return 0 for it. Do not guess.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "err.noAiKey" }, { status: 500 });

  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // act as the signed-in user, so the database rules apply
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: user } = await sb.auth.getUser(token);
  if (!user.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.user.id).single();
  if (me?.role !== "manager") return NextResponse.json({ error: "err.noAccess" }, { status: 403 });

  const { shotIds } = (await req.json().catch(() => ({}))) as { shotIds?: string[] };
  if (!shotIds?.length) return NextResponse.json({ error: "No screenshots" }, { status: 400 });

  const { data: shots, error } = await sb.from("metric_shots").select("id, images").in("id", shotIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const paths = (shots ?? []).flatMap((s) => s.images as string[]).slice(0, 10);

  const images: Anthropic.ImageBlockParam[] = [];
  for (const p of paths) {
    const { data: blob } = await sb.storage.from("uploads").download(p);
    if (!blob) continue;
    const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
    images.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } });
  }
  if (!images.length) return NextResponse.json({ error: "Could not open the screenshots" }, { status: 400 });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [...images, { type: "text", text: PROMPT }] }],
    });
    if (response.stop_reason === "refusal") return NextResponse.json({ error: "err.aiRead" }, { status: 422 });
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return NextResponse.json({ error: "err.aiRead" }, { status: 422 });
    const n = JSON.parse(text.text) as Record<keyof typeof SCHEMA.properties, number>;

    // remember what was read, for reference
    await sb.from("metric_shots").update({ extracted: n }).in("id", shotIds);
    return NextResponse.json(n);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "err.noAiKey" }, { status: 500 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Too many requests — try again in a minute." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `AI error ${e.status}: ${e.message}` }, { status: 502 });
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
