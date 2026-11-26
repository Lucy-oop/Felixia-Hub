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
import { cleanHolidays, getHolidaysForMonth } from "@/lib/holidays";
import { adminClient } from "@/lib/server";

/**
 * Manager only. "Optimize Dates with AI": Gemini reviews the month's whole schedule
 * (Content Calendar + TikTok Video Calendar) and suggests better dates.
 * Body: { year, month (1–12), language }
 * Returns { summary, changes: [{ id, title, category, oldDate, newDate, reason }] } — nothing is saved here.
 * Locked lines (holiday / Seasonal posts, already posted or published, in the past) are never moved.
 */
export const maxDuration = 60;

export interface DateChange {
  id: string;
  title: string;
  category: string;
  platforms: string[];
  oldDate: string;
  newDate: string;
  reason: string;
}
export interface OptimizeResponse {
  summary: string;
  changes: DateChange[];
}

const SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "2–3 sentences on the schedule's health (spacing, mix, engagement days).",
    },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "id of the line to move (from the list)." },
          new_date: { type: "string", description: "yyyy-mm-dd inside the month." },
          reason: { type: "string", description: "One short sentence why." },
        },
        required: ["id", "new_date", "reason"],
      },
    },
  },
  required: ["summary", "changes"],
};

const pad = (n: number) => String(n).padStart(2, "0");
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekday = (iso: string) => DAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];

export async function POST(req: Request) {
  const denied = await managerOnly(req);
  if (denied) return denied;
  const b = await readJson<{ year: number; month: number; language: string }>(req);
  const year = Math.trunc(Number(b.year));
  const month = Math.trunc(Number(b.month));
  if (!(year >= 2020 && year <= 2100 && month >= 1 && month <= 12))
    return NextResponse.json({ error: "Missing year / month" }, { status: 400 });
  const lang = asLang(b.language);

  const ym = `${year}-${pad(month)}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = `${ym}-01`;
  const last = `${ym}-${pad(lastDay)}`;
  // Myanmar time — "today" for the team
  const today = new Date(Date.now() + 6.5 * 3600000).toISOString().slice(0, 10);

  const sb = adminClient();
  const [cardsRes, holRes] = await Promise.all([
    sb
      .from("content_cards")
      .select("id, title, category, platforms, format, planned_date, planned_time, stage, published_url, posted, plan_status")
      .gte("planned_date", first)
      .lte("planned_date", last)
      .order("planned_date"),
    sb.from("month_holidays").select("items").eq("month", ym).maybeSingle(),
  ]);
  if (cardsRes.error)
    return NextResponse.json({ error: cardsRes.error.message }, { status: 500 });
  const cards = cardsRes.data ?? [];
  if (cards.length < 2)
    return NextResponse.json({ error: "opt.err.few" }, { status: 400 });

  const holidays =
    cleanHolidays(holRes.data?.items, year, month) ?? getHolidaysForMonth(year, month);
  const holidayDates = new Set(
    holidays.filter((h) => h.wish || h.kind === "holiday").map((h) => h.date),
  );

  type Line = { id: string; title: string; category: string; platforms: string[]; date: string; locked: string };
  const lines: Line[] = cards.map((c) => {
    const date = String(c.planned_date);
    const platforms: string[] = Array.isArray(c.platforms) && c.platforms.length ? c.platforms : ["fb_post"];
    const posted = c.posted && typeof c.posted === "object" && Object.keys(c.posted).length > 0;
    const locked =
      c.stage === "published" || c.published_url || posted
        ? "already posted"
        : date < today
          ? "date has passed"
          : c.category === "Seasonal"
            ? "seasonal / holiday post"
            : holidayDates.has(date) && /festival|holiday|new year|christmas|national|thingyan|thadingyut|wish/i.test(String(c.title))
              ? "holiday post"
              : "";
    return { id: String(c.id), title: String(c.title), category: String(c.category), platforms, date, locked };
  });
  const byId = new Map(lines.map((l) => [l.id, l]));

  const holidayText =
    holidays
      .map((h) => `- ${h.date}${h.endDate && h.endDate !== h.date ? ` → ${h.endDate}` : ""} (${weekday(h.date)}) [${h.country}, ${h.kind}] ${h.name.en}${h.note ? ` — ${h.note}` : ""}`)
      .join("\n") || "(none)";
  const linesText = lines
    .map(
      (l) =>
        `- id: ${l.id} | ${l.date} (${weekday(l.date)}) | ${l.category} | ${l.platforms.join("+")} | "${l.title.replace(/\s+/g, " ").slice(0, 160)}"${l.locked ? ` | LOCKED (${l.locked})` : ""}`,
    )
    .join("\n");

  const prompt = `Review Felixia Recruitment's posting schedule for ${ym} (${first} to ${last}) — Facebook posts and TikTok videos together — and suggest better dates.
Today is ${today}. Allowed new dates: ${today > first ? today : first} to ${last}.

=== SCHEDULED LINES ===
${linesText}

=== HOLIDAYS / EVENTS THIS MONTH ===
${holidayText}

Rules:
1. NEVER move a line marked LOCKED. Never move holiday / festival / wishing posts off their holiday date, and never move event-timed posts (e.g. JLPT tips must stay BEFORE the exam date, countdowns stay before their event).
2. Spacing: spread posts evenly across the month; avoid clusters on back-to-back days and long empty gaps. Facebook and TikTok may share a day, but avoid 2+ posts on the same platform the same day.
3. Engagement for Myanmar audiences: Educational / Knowledge posts on Tue–Thu; light, fun TikToks and quizzes on Fri–Sun; Hiring / Marketing posts on high-reach weekdays (Mon–Thu).
4. Content mix: avoid the same content type on consecutive posting days.
5. Only suggest moves that clearly improve the schedule — fewer, better changes. If the schedule is already good, return an empty changes list.
6. Each line can appear at most once in changes. new_date must differ from its current date.
7. Write summary and reasons in ${LANG_NAME[lang]}. Keep each reason short (e.g. "Too close to the Dec 4 post; Thu gets better engagement").

Return JSON: { "summary": string, "changes": [ { id, new_date, reason } ] }`;

  try {
    const out = await generateWithBrandVoice<{ summary: string; changes: { id: string; new_date: string; reason: string }[] }>({
      prompt,
      schema: SCHEMA,
      includeTemplates: false,
      includeCompliance: false,
      temperature: 0.3,
    });
    const minDate = today > first ? today : first;
    const seen = new Set<string>();
    const changes: DateChange[] = (Array.isArray(out.changes) ? out.changes : [])
      .filter((c) => {
        const l = byId.get(String(c?.id));
        const d = String(c?.new_date ?? "");
        if (!l || l.locked || seen.has(l.id)) return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < minDate || d > last || d === l.date) return false;
        seen.add(l.id);
        return true;
      })
      .map((c) => {
        const l = byId.get(String(c.id))!;
        return {
          id: l.id,
          title: l.title,
          category: l.category,
          platforms: l.platforms,
          oldDate: l.date,
          newDate: String(c.new_date),
          reason: str(c.reason, 300).trim(),
        };
      })
      .sort((a, b2) => a.oldDate.localeCompare(b2.oldDate));
    return NextResponse.json({ summary: str(out.summary, 1200).trim(), changes } satisfies OptimizeResponse);
  } catch (e) {
    return aiFail(e);
  }
}
