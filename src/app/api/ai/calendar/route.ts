import { NextResponse } from "next/server";
import {
  aiFail,
  asLang,
  LANG_NAME,
  managerOnly,
  readJson,
  str,
} from "@/lib/ai-route";
import { generateWithBrandVoice } from "@/lib/brand-gemini";
import {
  clampCounts,
  countTotal,
  PILLAR_BRIEF,
  PILLARS,
  type Pillar,
  type PlanRow,
} from "@/lib/calendar-ai";
import { cleanHolidays, getHolidaysForMonth, type Holiday } from "@/lib/holidays";
import { adminClient } from "@/lib/server";

/**
 * Manager only. AI Content Calendar generator.
 * Month:  { year, month (1–12), counts: { knowledge, tips, trust, festival }, holidays, language }
 * Single: { mode: "single", year, month, language, holidays, row: { date, pillar, platform }, keep: [{ headline, idea_id }] }
 *         → regenerates one row (same date + pillar) without repeating the other rows.
 * `holidays` = the manager's edited holiday list for the month (falls back to the built-in list when missing).
 * The AI never writes hiring posts — the manager adds those to the Content Calendar by hand.
 * Returns { rows: PlanRow[], holidays: Holiday[] }.
 */
export const maxDuration = 60;

export type { PlanRow };
export interface CalendarResponse {
  rows: PlanRow[];
  holidays: Holiday[];
}

const ROW_SCHEMA = {
  type: "object",
  properties: {
    date: {
      type: "string",
      description: "yyyy-mm-dd inside the requested month.",
    },
    headline: {
      type: "string",
      description: "Short post headline for the calendar.",
    },
    platform: { type: "string", enum: ["facebook", "tiktok"] },
    pillar: { type: "string", enum: [...PILLARS] },
    idea_id: {
      type: ["string", "null"],
      description: "id of the Ideas Inbox item this row is based on, or null.",
    },
    graphic_headline: {
      type: "string",
      description:
        "The short big text to put on the graphic / video cover (max ~8 words).",
    },
    visual_idea: {
      type: "string",
      description:
        "One or two sentences describing the picture or video for the designer.",
    },
  },
  required: [
    "date",
    "headline",
    "platform",
    "pillar",
    "idea_id",
    "graphic_headline",
    "visual_idea",
  ],
};
const SCHEMA = {
  type: "object",
  properties: { rows: { type: "array", items: ROW_SCHEMA } },
  required: ["rows"],
};

interface Body {
  mode: "month" | "single";
  year: number;
  month: number;
  counts: Record<string, number>;
  holidays: unknown;
  language: string;
  row: { date: string; pillar: string; platform: string };
  keep: { headline: string; idea_id: string | null }[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysAgo = (from: Date, n: number) =>
  new Date(from.getTime() - n * 86400000).toISOString().slice(0, 10);

export async function POST(req: Request) {
  const denied = await managerOnly(req);
  if (denied) return denied;
  const b = await readJson<Body>(req);
  const year = Math.trunc(Number(b.year));
  const month = Math.trunc(Number(b.month));
  if (!(year >= 2020 && year <= 2100 && month >= 1 && month <= 12))
    return NextResponse.json(
      { error: "Missing year / month" },
      { status: 400 },
    );
  const lang = asLang(b.language);
  const single = b.mode === "single";
  const counts = clampCounts(b.counts);
  const total = countTotal(counts);
  if (!single && total === 0)
    return NextResponse.json({ error: "aiplan.err.noCounts" }, { status: 400 });

  const ym = `${year}-${pad(month)}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = `${ym}-01`;
  const last = `${ym}-${pad(lastDay)}`;
  // anti-repetition window: 30 days before the month (or before today, whichever is earlier) up to the month's end
  const since = daysAgo(
    new Date(Math.min(Date.now(), Date.parse(`${first}T00:00:00Z`))),
    30,
  );

  const sb = adminClient();
  const [ideasRes, recentRes] = await Promise.all([
    sb
      .from("ideas")
      .select("id, text, links")
      .in("status", ["new", "seen"])
      .order("created_at", { ascending: false })
      .limit(40),
    sb
      .from("content_cards")
      .select("title, planned_date")
      .gte("planned_date", since)
      .lte("planned_date", last)
      .order("planned_date")
      .limit(200),
  ]);
  if (ideasRes.error)
    return NextResponse.json(
      { error: ideasRes.error.message },
      { status: 500 },
    );
  const ideas = ideasRes.data ?? [];
  const ideaIds = new Set(ideas.map((i) => i.id as string));
  const recent = (recentRes.data ?? []).map((c) => ({
    title: String(c.title),
    date: String(c.planned_date),
  }));
  const busyDates = [
    ...new Set(recent.filter((r) => r.date >= first).map((r) => r.date)),
  ];
  const holidays =
    cleanHolidays(b.holidays, year, month) ?? getHolidaysForMonth(year, month);
  const COUNTRY = { MM: "Myanmar", JP: "Japan", BOTH: "Myanmar & Japan" } as const;

  const holidayText =
    holidays
      .map(
        (h) =>
          `- ${h.date}${h.endDate && h.endDate !== h.date ? ` → ${h.endDate}` : ""} [${COUNTRY[h.country] ?? h.country}, ${h.kind}${h.wish ? ", wishing post" : ""}${h.approx ? ", date ±1 day" : ""}${h.custom ? ", added by the manager — exact date" : ""}] ${h.name.en}${h.name.my && h.name.my !== h.name.en ? ` / ${h.name.my}` : ""}${h.note ? ` — ${h.note}` : ""}`,
      )
      .join("\n") || "(none this month)";
  const ideasText =
    ideas
      .map(
        (i) =>
          `- id: ${i.id}\n  idea: ${String(i.text).replace(/\s+/g, " ").slice(0, 400)}${(i.links as string[])?.length ? `\n  links: ${(i.links as string[]).slice(0, 3).join(" ")}` : ""}`,
      )
      .join("\n") || "(the inbox is empty — use idea_id = null)";
  const avoid = [
    ...recent.map((r) => r.title),
    ...(single ? (b.keep ?? []).map((k) => str(k?.headline, 200)) : []),
  ].filter(Boolean);
  const takenIdeas = single
    ? (b.keep ?? []).map((k) => k?.idea_id).filter((x): x is string => !!x)
    : [];

  const common = `
=== MYANMAR & JAPAN HOLIDAYS / SEASONS THIS MONTH (checked by the manager — use exactly these dates, nothing else) ===
${holidayText}

=== IDEAS INBOX (unused) ===
${ideasText}

=== HEADLINES ALREADY USED (last 30 days and this month) — NEVER repeat these or make near-copies ===
${avoid.map((h) => `- ${h}`).join("\n") || "(none)"}

=== PILLARS ===
${PILLARS.map((p) => `- ${p}: ${PILLAR_BRIEF[p]}`).join("\n")}

Rules:
- NEVER write hiring posts, job adverts or "we are hiring" content — hiring posts are made separately from the client's job details. Recruitment can still be mentioned softly inside knowledge/tips/trust posts.
- Every "festival" row must be on the EXACT date of a holiday listed above with "wishing post" (the first day for multi-day festivals). Never place a festival/wishing post on a day of remembrance.
- Seasons (hiring intake, JLPT, Golden Week) should shape the angle of knowledge / tips posts around them.
- Prefer basing rows on Ideas Inbox items (set idea_id to that item's id; use each idea at most once). Otherwise idea_id = null.
- Write headline, graphic_headline and visual_idea in ${LANG_NAME[lang]}.
- platform is "facebook" or "tiktok" — use tiktok for short, visual, story-style content.`;

  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(b.row?.date ?? "") && b.row!.date.startsWith(ym)
      ? b.row!.date
      : first;
  const pillar = (PILLARS as readonly string[]).includes(b.row?.pillar ?? "")
    ? (b.row!.pillar as Pillar)
    : "knowledge";
  let prompt: string;
  if (single) {
    prompt = `Write ONE new row for Felixia Recruitment's ${ym} content calendar to replace a row the manager did not like.
It must be on ${date}, pillar "${pillar}"${b.row?.platform ? `, platform "${b.row.platform === "tiktok" ? "tiktok" : "facebook"}"` : ""}, with a fresh angle different from every headline listed below.
Do not use these idea ids (already used by other rows): ${takenIdeas.join(", ") || "none"}.
${common}

Return JSON: { "rows": [ { date, headline, platform, pillar, idea_id, graphic_headline, visual_idea } ] } with exactly one row.`;
  } else {
    prompt = `Plan Felixia Recruitment's content calendar for ${ym} (${first} to ${last}): exactly ${total} posts.
Write EXACTLY this many rows per pillar: ${PILLARS.map((p) => `${p} ${counts[p]}`).join(", ")}. No other pillars.
${counts.festival === 0 ? "No festival rows were requested, but you may still mention a holiday inside another pillar's angle.\n" : ""}Spread the posts evenly across the month (avoid more than one post per day where possible). These dates already have posts (e.g. hiring posts the manager added): ${busyDates.join(", ") || "none"}.
${common}

Return JSON: { "rows": [ { date, headline, platform, pillar, idea_id, graphic_headline, visual_idea } ] } sorted by date.`;
  }

  try {
    const out = await generateWithBrandVoice<{ rows: PlanRow[] }>({
      prompt,
      schema: SCHEMA,
      includeTemplates: false,
    });
    const usedIdeas = new Set(takenIdeas);
    const taken: Partial<Record<Pillar, number>> = {};
    const rows = (Array.isArray(out.rows) ? out.rows : [])
      .filter((r) => r && typeof r.headline === "string" && r.headline.trim())
      .map((r): PlanRow => {
        const day = Math.min(
          Math.max(Number(String(r.date).slice(8, 10)) || 1, 1),
          lastDay,
        );
        let idea =
          r.idea_id && ideaIds.has(r.idea_id) && !usedIdeas.has(r.idea_id)
            ? r.idea_id
            : null;
        if (idea) usedIdeas.add(idea);
        else idea = null;
        return {
          date: String(r.date).startsWith(ym) ? `${ym}-${pad(day)}` : first,
          headline: r.headline.trim().slice(0, 160),
          platform: r.platform === "tiktok" ? "tiktok" : "facebook",
          pillar: (PILLARS as readonly string[]).includes(r.pillar)
            ? r.pillar
            : "knowledge", // e.g. a stray "hiring"
          idea_id: idea,
          graphic_headline: str(r.graphic_headline, 160).trim(),
          visual_idea: str(r.visual_idea, 600).trim(),
        };
      })
      // keep the manager's numbers: drop surplus rows of a pillar (Gemini sometimes adds an extra)
      .filter((r) => {
        if (single) return true;
        const n = (taken[r.pillar] ?? 0) + 1;
        taken[r.pillar] = n;
        return n <= counts[r.pillar];
      })
      .slice(0, single ? 1 : total)
      .map((r) => (single ? { ...r, date, pillar } : r))
      .sort((a, b2) => a.date.localeCompare(b2.date));
    if (!rows.length)
      return NextResponse.json({ error: "ai.err.bad" }, { status: 502 });
    return NextResponse.json({ rows, holidays } satisfies CalendarResponse);
  } catch (e) {
    return aiFail(e);
  }
}
