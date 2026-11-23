import { extractJobFacts, headcountNumber, salaryAmount } from "./job-extract";
import {
  PLACEMENT_PLATFORM,
  PLACEMENTS,
  type ContentCard,
  type JobOrder,
  type Placement,
  type Platform,
  type Role,
} from "./types";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export const now = () => new Date().toISOString();

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function fmtDate(iso: string, locale = "en-GB") {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(iso: string, locale = "en-GB") {
  return new Date(iso).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function salaryText(j: JobOrder, per: string = j.salaryPer) {
  const n = (v: number) => v.toLocaleString("en-US");
  const range =
    j.salaryMax && j.salaryMax !== j.salaryMin
      ? `${n(j.salaryMin)} – ${n(j.salaryMax)}`
      : n(j.salaryMin);
  return `${range} ${j.currency} / ${per}`;
}

/** A job as plain text — what the client edits when the admin typed the job in (no pasted text). */
export function jobToText(j: JobOrder) {
  return [
    j.title,
    j.company,
    j.location,
    j.salaryMin ? salaryText(j) : "",
    j.positions ? `Positions: ${j.positions}` : "",
    j.visaType,
    j.deadline ? `Deadline: ${j.deadline}` : "",
    j.requirements.trim() && `Requirements:\n${j.requirements.trim()}`,
    j.benefits.trim() && `Benefits:\n${j.benefits.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Indexes of lines in `now` that are new or changed compared with `before` (simple line match — fine for job details). */
export function changedLines(now: string, before: string) {
  const old = new Set(
    before
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const out = new Set<number>();
  now
    .split("\n")
    .forEach((l, i) => l.trim() && !old.has(l.trim()) && out.add(i));
  return out;
}

/** Caption template used by "Make post from this job". */
export function captionFromJob(j: JobOrder) {
  const bullets = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `✅ ${l}`)
      .join("\n");
  return [
    `🇯🇵 ${j.title} — ${j.positions} positions`,
    ``,
    `📍 Location: ${j.location}`,
    `💴 Salary: ${salaryText(j)}`,
    `🛂 Visa: ${j.visaType}`,
    ``,
    `📋 Requirements`,
    bullets(j.requirements),
    ``,
    `🎁 Benefits`,
    bullets(j.benefits),
    ``,
    `⏰ Apply before ${fmtDate(j.deadline)}`,
    `💬 Message our page to apply!`,
  ].join("\n");
}

/** Permissions table from the spec. */
export const can = {
  editJobs: (r: Role) => r === "manager" || r === "client",
  makePost: (r: Role) => r === "manager",
  editCards: (r: Role) => r === "manager",
  approve: (r: Role) => r === "client",
  comment: (r: Role) => r === "manager" || r === "client",
  moveDates: (r: Role) => r === "manager" || r === "client",
  addReferences: (r: Role) => r === "manager" || r === "client",
  seeAllCards: (r: Role) => r === "manager" || r === "client",
  ideas: (r: Role) => r === "manager" || r === "client",
  manageIdeas: (r: Role) => r === "manager",
  seeReports: (r: Role) => r === "manager" || r === "client",
  enterMetrics: (r: Role) => r === "manager",
  reviewPosts: (r: Role) => r === "client",
};

/** Does this post need the manager to fix something? (light red card) */
export const needsEdit = (c: ContentCard) => c.review.status === "changes";

/** Placements of a post, in fixed order. */
export function placementsOf(c: Pick<ContentCard, "placements">): Placement[] {
  return c.placements?.length
    ? PLACEMENTS.filter((p) => c.placements.includes(p))
    : ["fb_post"];
}
/** Platforms (Facebook / TikTok) this post goes to — from its placements. */
export function platformsOf(c: Pick<ContentCard, "placements">): Platform[] {
  const pl = placementsOf(c);
  return (["facebook", "tiktok"] as const).filter((p) =>
    pl.some((x) => PLACEMENT_PLATFORM[x] === p),
  );
}

/** Parts of a post the client can ask to change. Saved in the note as "[media] [text] …". */
export const REVIEW_PARTS = ["text", "media", "date", "other"] as const;
export type ReviewPart = (typeof REVIEW_PARTS)[number];
/** What the client can ask to change on a Content Calendar line. */
export const PLAN_PARTS = [
  "headline",
  "date",
  "type",
  "places",
  "other",
] as const;
export type PlanPart = (typeof PLAN_PARTS)[number];

export function joinReviewNote(parts: readonly string[], text: string) {
  return [...parts.map((p) => `[${p}]`), text.trim()].filter(Boolean).join(" ");
}
export function splitReviewNote<P extends string = ReviewPart>(
  note = "",
  allowed: readonly P[] = REVIEW_PARTS as unknown as readonly P[],
): { parts: P[]; text: string } {
  const parts: P[] = [];
  let rest = note.trim();
  for (
    let m = rest.match(/^\[(\w+)\]\s*/);
    m && (allowed as readonly string[]).includes(m[1]);
    m = rest.match(/^\[(\w+)\]\s*/)
  ) {
    parts.push(m[1] as P);
    rest = rest.slice(m[0].length);
  }
  return { parts, text: rest };
}

/** Plan line can no longer be changed by the client: the post was already sent for review. */
export const planLocked = (c: ContentCard) =>
  !["idea", "draft", "design"].includes(c.stage);

export type ConfirmTab = "review" | "changes" | "approved" | "published";
/** Which Post Confirmation tab a post belongs to (null = not shown to the client yet). */
export function confirmTab(c: ContentCard): ConfirmTab | null {
  if (c.stage === "published") return "published";
  if (c.review.status === "approved" || c.stage === "approved")
    return "approved";
  if (c.review.status === "changes") return "changes";
  if (c.review.status === "review" || c.stage === "review") return "review";
  return null;
}

export function visibleCards(cards: ContentCard[], role: Role) {
  return can.seeAllCards(role)
    ? cards
    : cards.filter((c) => c.stage === "published");
}

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Monday of the week that contains d. */
export function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Shrink a picture before upload (keeps uploads small and fast). */
export function shrinkImage(
  file: File,
  max = 1400,
  type: "blob" | "dataUrl" = "blob",
): Promise<Blob | string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      if (type === "dataUrl") resolve(canvas.toDataURL("image/jpeg", 0.8));
      else
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("image"))),
          "image/jpeg",
          0.82,
        );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const PREFECTURES = [
  "Hokkaido",
  "Aomori",
  "Iwate",
  "Miyagi",
  "Akita",
  "Yamagata",
  "Fukushima",
  "Ibaraki",
  "Tochigi",
  "Gunma",
  "Saitama",
  "Chiba",
  "Tokyo",
  "Kanagawa",
  "Niigata",
  "Toyama",
  "Ishikawa",
  "Fukui",
  "Yamanashi",
  "Nagano",
  "Gifu",
  "Shizuoka",
  "Aichi",
  "Mie",
  "Shiga",
  "Kyoto",
  "Osaka",
  "Hyogo",
  "Nara",
  "Wakayama",
  "Tottori",
  "Shimane",
  "Okayama",
  "Hiroshima",
  "Yamaguchi",
  "Tokushima",
  "Kagawa",
  "Ehime",
  "Kochi",
  "Fukuoka",
  "Saga",
  "Nagasaki",
  "Kumamoto",
  "Oita",
  "Miyazaki",
  "Kagoshima",
  "Okinawa",
];
const PREF_JA = [
  "北海道",
  "青森",
  "岩手",
  "宮城",
  "秋田",
  "山形",
  "福島",
  "茨城",
  "栃木",
  "群馬",
  "埼玉",
  "千葉",
  "東京",
  "神奈川",
  "新潟",
  "富山",
  "石川",
  "福井",
  "山梨",
  "長野",
  "岐阜",
  "静岡",
  "愛知",
  "三重",
  "滋賀",
  "京都",
  "大阪",
  "兵庫",
  "奈良",
  "和歌山",
  "鳥取",
  "島根",
  "岡山",
  "広島",
  "山口",
  "徳島",
  "香川",
  "愛媛",
  "高知",
  "福岡",
  "佐賀",
  "長崎",
  "熊本",
  "大分",
  "宮崎",
  "鹿児島",
  "沖縄",
];

/**
 * Job fields from the client's pasted text. Labelled fields (တည်နေရာ / လစာ / 勤務地 …) are read exactly by
 * extractJobFacts; the old guesses are only used when a label is missing — and never look at the agency's
 * own footer (Felixia's Tokyo office) or at fees (a ¥15,000 dorm fee is not salary).
 */
export function parseJobText(text: string): Partial<JobOrder> {
  const out: Partial<JobOrder> = {};
  const f = extractJobFacts(text);
  // the agency footer ("Felixia Recruitment" + office address) is never job data
  const body = text.split(/^\s*Felixia\b.*$/im)[0];
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const job = f.role || f.industry;
  const firstLine = lines.find((l) => !/求人番号|Job\s*ID/i.test(l))?.replace(/^[#*\-•\s]+/, "");
  out.title = (job ? [f.industry, f.role].filter(Boolean).join(" — ") : firstLine || "").slice(0, 80) || undefined;

  // location: the labelled field, else a prefecture named in the job text (not the footer)
  if (f.location) out.location = f.location;
  else {
    const en = PREFECTURES.findIndex((p) => new RegExp(`\\b${p}\\b`, "i").test(body));
    const ja = PREF_JA.findIndex((p) => body.includes(p));
    const i = en >= 0 ? en : ja;
    if (i >= 0) out.location = `${PREFECTURES[i]}, Japan`;
  }

  // salary: only the labelled pay line (fees / bonus are not salary)
  const pay = f.salary ? salaryAmount(f.salary) : 0;
  if (pay) {
    out.salaryMin = pay;
    out.salaryMax = pay;
    out.currency = "JPY";
    out.salaryPer = /hour|時給|နာရီ/i.test(f.salary) && pay < 5000 ? "hour" : "month";
  }

  // headcount: "ကျား 4 ဦး", "女性 2名", "6 people"
  const people = f.headcount ? headcountNumber(f.headcount) : Number(body.match(/(\d+)\s*(?:positions?|people|persons?|名|人|ဦး)/i)?.[1] ?? 0);
  if (people) out.positions = Math.min(999, people);

  if (f.requirements.length) out.requirements = f.requirements.join("\n");
  if (f.benefits.length) out.benefits = f.benefits.join("\n");
  if (f.visa) out.visaType = f.visa;
  return out;
}

/** A calendar line reserved for hiring that has no job yet (filled later with the client's job details). */
export const isOpenSlot = (c: Pick<ContentCard, "category" | "jobId">) =>
  c.category === "Hiring" && !c.jobId;

/** Headline + notes of a calendar line made from a job (same text as Hiring → "Add to calendar"). */
export const jobLineTitle = (j: JobOrder) =>
  [j.title, j.location].filter(Boolean).join(" — ");
export const jobLineNotes = (j: JobOrder, positionsLabel = "Positions") =>
  [
    salaryText(j),
    j.positions ? `${positionsLabel}: ${j.positions}` : "",
    j.visaType,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Months ("yyyy-mm", sorted) that have plan lines waiting for this person:
 * client → lines sent for approval; manager → lines the client asked to change.
 */
export function waitingPlanMonths(cards: Pick<ContentCard, "plannedDate" | "plan">[], role: Role): string[] {
  const status = role === "client" ? "sent" : "changes";
  return [...new Set(cards.filter((c) => c.plan.status === status && c.plannedDate).map((c) => c.plannedDate.slice(0, 7)))].sort();
}
