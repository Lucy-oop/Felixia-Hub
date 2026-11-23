import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { adminClient } from "@/lib/server";

/** Gemini helper for API routes only — loads the AI Brand Settings (row 1) and injects them as the system instruction. */

export interface BrandSettings {
  id: number;
  brand_voice: string;
  post_templates: {
    /** legacy single hiring template (still used by the non-AI "Make post" fill) */
    fb_hiring?: string;
    fb_hiring_tokutei?: string;
    fb_hiring_katsudo?: string;
    fb_educational: string;
    tiktok_script: string;
  };
  compliance_rules: string;
}

/** Main model, and a lighter backup used when the main one is overloaded (503) or too slow. */
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
/** Per-attempt time limits (ms). Together they stay under Vercel's 60s route limit. */
const MAIN_TIMEOUT = 35_000;
const FALLBACK_TIMEOUT = 20_000;
/** Less "thinking" = much faster answers; set GEMINI_THINKING=high for more careful (slower) output. */
const THINKING = (
  process.env.GEMINI_THINKING || "low"
).toUpperCase() as ThinkingLevel;

let _ai: GoogleGenAI | null = null;
function ai() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  // no silent retries: the SDK default (5 attempts, waits up to 60s) can hang a button for minutes
  return (_ai ??= new GoogleGenAI({
    apiKey,
    httpOptions: { retryOptions: { attempts: 1 } },
  }));
}

/** Gemini is overloaded / timed out → worth trying the backup model. */
export function isOverloaded(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  return (
    status === 500 ||
    status === 503 ||
    status === 504 ||
    /UNAVAILABLE|high demand|overloaded|DEADLINE_EXCEEDED|Deadline expired|timed? ?out|aborted/i.test(
      msg,
    )
  );
}

export async function getBrandSettings(): Promise<BrandSettings> {
  const { data, error } = await adminClient()
    .from("brand_settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (error || !data)
    throw new Error(
      `Failed to load brand_settings from Supabase${error ? `: ${error.message}` : "."}`,
    );
  return data as BrandSettings;
}

type TemplateKey = keyof BrandSettings["post_templates"];

export function buildSystemInstruction(
  settings: BrandSettings,
  {
    includeTemplates = true,
    includeCompliance = true,
    systemRules,
  }: {
    includeTemplates?: boolean | TemplateKey[];
    includeCompliance?: boolean;
    systemRules?: string;
  } = {},
) {
  const all =
    settings.post_templates ?? ({} as BrandSettings["post_templates"]);
  const templates = Array.isArray(includeTemplates)
    ? Object.fromEntries(includeTemplates.map((k) => [k, all[k] ?? ""]))
    : all;
  return [
    "You are the AI social media assistant for Felixia Recruitment (placing workers from Myanmar into jobs in Japan).",
    systemRules ? `\n=== STRICT RULES (these override everything below) ===\n${systemRules}` : "",
    `\n=== BRAND VOICE & STYLE ===\n${settings.brand_voice}`,
    includeTemplates
      ? `\n=== SAVED POST TEMPLATES ===\n${JSON.stringify(templates, null, 2)}`
      : "",
    includeCompliance
      ? `\n=== FACEBOOK & TIKTOK COMPLIANCE RULES ===\n${settings.compliance_rules}`
      : "",
    systemRules
      ? "\nAlways follow the STRICT RULES first, then the brand voice; the compliance rules always apply."
      : "\nAlways follow the brand voice, structure, and compliance rules above.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateWithBrandVoice<T>({
  prompt,
  model = MODEL,
  includeTemplates = true,
  includeCompliance = true,
  schema,
  temperature,
  systemRules,
}: {
  prompt: string;
  model?: string;
  includeTemplates?: boolean | TemplateKey[];
  includeCompliance?: boolean;
  /** JSON Schema the answer must follow. */
  schema?: object;
  /** Lower (e.g. 0.2) = sticks closer to the given facts; omit for the model default. */
  temperature?: number;
  /** Task-specific hard rules, placed first in the system instruction. */
  systemRules?: string;
}): Promise<T> {
  const settings = await getBrandSettings();
  const systemInstruction = buildSystemInstruction(settings, {
    includeTemplates,
    includeCompliance,
    systemRules,
  });

  const base = {
    systemInstruction,
    responseMimeType: "application/json",
    ...(schema ? { responseJsonSchema: schema } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
  };

  let response;
  try {
    response = await ai().models.generateContent({
      model,
      contents: prompt,
      config: {
        ...base,
        thinkingConfig: { thinkingLevel: THINKING },
        httpOptions: { timeout: MAIN_TIMEOUT },
      },
    });
  } catch (e) {
    if (!isOverloaded(e) || !FALLBACK_MODEL || FALLBACK_MODEL === model)
      throw e;
    console.warn(
      `[ai] ${model} unavailable (${e instanceof Error ? e.message.slice(0, 80) : e}) → trying ${FALLBACK_MODEL}`,
    );
    response = await ai().models.generateContent({
      model: FALLBACK_MODEL,
      contents: prompt,
      config: { ...base, httpOptions: { timeout: FALLBACK_TIMEOUT } },
    });
  }

  return JSON.parse(response.text || "{}") as T;
}
