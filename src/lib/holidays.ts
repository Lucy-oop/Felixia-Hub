/**
 * Myanmar + Japan holidays, JLPT exams and Japan hiring seasons — used by the AI Content Calendar.
 *
 * Fixed-date holidays are exact. Myanmar full-moon festivals follow the lunisolar calendar, so their
 * dates are computed from the astronomical full moon (Myanmar time) nearest a typical date and marked
 * `approx: true` (usually right to ±1 day). If the official calendar differs, add the real date to
 * MM_LUNAR_OVERRIDES below.
 */

export type HolidayCountry = "MM" | "JP" | "BOTH";
export type HolidayKind = "holiday" | "festival" | "exam" | "season";

export interface Holiday {
  /** stable key for editing: built-in = "MM:Independence Day:2027", custom = "c:<random>" */
  id?: string;
  /** added by the manager in the AI month plan (not in the built-in list) */
  custom?: boolean;
  /** yyyy-mm-dd (first day). Seasons that cover the whole month use the 1st. */
  date: string;
  /** yyyy-mm-dd, for events longer than one day */
  endDate?: string;
  country: HolidayCountry;
  kind: HolidayKind;
  name: { en: string; my: string; ja: string };
  /** a good day for a festival / wishing post */
  wish: boolean;
  /** date is computed from the moon — check the official calendar */
  approx?: boolean;
  /** guidance for the content (tone, angle) */
  note?: string;
}

type Name = Holiday["name"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ---------- full moons (Meeus, ch. 49 — accurate to a few minutes) ---------- */

const rad = (deg: number) => (deg * Math.PI) / 180;

function fullMoonJDE(k: number) {
  const T = k / 1236.85;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = rad(2.5534 + 29.1053567 * k - 0.0000014 * T * T);
  const Mp = rad(201.5643 + 385.81693528 * k + 0.0107582 * T * T);
  const F = rad(160.7108 + 390.67050284 * k - 0.0016118 * T * T);
  const Om = rad(124.7746 - 1.56375588 * k + 0.0020672 * T * T);
  const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T;
  return (
    jde -
    0.40614 * Math.sin(Mp) +
    0.17302 * E * Math.sin(M) +
    0.01614 * Math.sin(2 * Mp) +
    0.01043 * Math.sin(2 * F) +
    0.00734 * E * Math.sin(Mp - M) -
    0.00515 * E * Math.sin(Mp + M) +
    0.00209 * E * E * Math.sin(2 * M) -
    0.00111 * Math.sin(Mp - 2 * F) -
    0.00057 * Math.sin(Mp + 2 * F) +
    0.00056 * E * Math.sin(2 * Mp + M) -
    0.00042 * Math.sin(3 * Mp) +
    0.00042 * E * Math.sin(M + 2 * F) +
    0.00038 * E * Math.sin(M - 2 * F) -
    0.00024 * E * Math.sin(2 * Mp - M) -
    0.00017 * Math.sin(Om)
  );
}

/** Full-moon dates (yyyy-mm-dd, Myanmar time UTC+6:30) in a year. */
const moonCache = new Map<number, string[]>();
export function fullMoons(year: number): string[] {
  const hit = moonCache.get(year);
  if (hit) return hit;
  const out: string[] = [];
  const k0 = Math.floor((year - 2000) * 12.3685) - 2;
  for (let k = k0; k < k0 + 16; k++) {
    const jd = fullMoonJDE(k + 0.5);
    const ms = (jd - 2440587.5) * 86400000 + 6.5 * 3600000; // → Myanmar local time
    const d = new Date(ms).toISOString().slice(0, 10);
    if (d.startsWith(String(year))) out.push(d);
  }
  moonCache.set(year, out);
  return out;
}

/** The full moon nearest to a typical date (this rule matches the official dates in recent years, incl. leap-month years). */
function nearestFullMoon(year: number, month: number, day: number) {
  const target = Date.UTC(year, month - 1, day);
  return fullMoons(year).reduce((best, d) => (Math.abs(Date.parse(d) - target) < Math.abs(Date.parse(best) - target) ? d : best));
}

/* ---------- Myanmar ---------- */

const MM_FIXED: { m: number; d: number; days?: number; name: Name; wish: boolean; note?: string }[] = [
  { m: 1, d: 4, name: { en: "Independence Day", my: "လွတ်လပ်ရေးနေ့", ja: "ミャンマー独立記念日" }, wish: true },
  { m: 2, d: 12, name: { en: "Union Day", my: "ပြည်ထောင်စုနေ့", ja: "ミャンマー連邦記念日" }, wish: true },
  { m: 3, d: 2, name: { en: "Peasants' Day", my: "တောင်သူလယ်သမားနေ့", ja: "ミャンマー農民の日" }, wish: false },
  {
    m: 4,
    d: 13,
    days: 4,
    name: { en: "Thingyan Water Festival", my: "သင်္ကြန်ပွဲတော်", ja: "ティンジャン（水かけ祭り）" },
    wish: true,
    note: "Biggest holiday of the year — festive, family, homecoming mood.",
  },
  { m: 4, d: 17, name: { en: "Myanmar New Year", my: "မြန်မာနှစ်သစ်ကူး", ja: "ミャンマー新年" }, wish: true },
  { m: 5, d: 1, name: { en: "Labour Day", my: "အလုပ်သမားနေ့", ja: "メーデー（労働者の日）" }, wish: true, note: "Fits recruitment — thank workers." },
  {
    m: 7,
    d: 19,
    name: { en: "Martyrs' Day", my: "အာဇာနည်နေ့", ja: "殉難者の日" },
    wish: false,
    note: "Day of remembrance — respectful only, no promotion or celebration.",
  },
  { m: 12, d: 25, name: { en: "Christmas", my: "ခရစ္စမတ်", ja: "クリスマス" }, wish: true },
];

/** Full-moon festivals: typical month/day used to pick the nearest full moon. */
const MM_LUNAR: { key: string; m: number; d: number; days?: number; name: Name; wish: boolean; note?: string }[] = [
  { key: "tabaung", m: 3, d: 12, name: { en: "Full Moon of Tabaung", my: "တပေါင်းလပြည့်နေ့", ja: "ダバウン満月祭" }, wish: true },
  {
    key: "kason",
    m: 5,
    d: 10,
    name: { en: "Full Moon of Kason (Buddha Day)", my: "ကဆုန်လပြည့် ညောင်ရေသွန်းနေ့", ja: "カソン満月（仏陀の日）" },
    wish: true,
  },
  { key: "waso", m: 7, d: 20, name: { en: "Full Moon of Waso (Buddhist Lent begins)", my: "ဝါဆိုလပြည့်နေ့", ja: "ワーゾー満月（雨安居入り）" }, wish: true },
  {
    key: "thadingyut",
    m: 10,
    d: 15,
    days: 3,
    name: { en: "Thadingyut Festival of Lights", my: "သီတင်းကျွတ် မီးထွန်းပွဲတော်", ja: "ダディンジュ（灯明祭）" },
    wish: true,
    note: "Paying respect to parents and teachers (ကန်တော့) — warm, grateful tone.",
  },
  {
    key: "tazaungdaing",
    m: 11,
    d: 13,
    name: { en: "Tazaungdaing Festival", my: "တန်ဆောင်တိုင် ပွဲတော်", ja: "タザウンダイン（灯祭り）" },
    wish: true,
  },
];

/** Verified dates that replace the computed ones: { 2027: { thadingyut: "2027-10-15" } } */
export const MM_LUNAR_OVERRIDES: Record<number, Partial<Record<string, string>>> = {};

function myanmar(year: number): Holiday[] {
  const out: Holiday[] = MM_FIXED.map((h) => ({
    date: iso(year, h.m, h.d),
    endDate: h.days ? addDays(iso(year, h.m, h.d), h.days - 1) : undefined,
    country: "MM",
    kind: h.wish ? "festival" : "holiday",
    name: h.name,
    wish: h.wish,
    note: h.note,
  }));
  const lunar: Record<string, string> = {};
  for (const h of MM_LUNAR) {
    const fixed = MM_LUNAR_OVERRIDES[year]?.[h.key];
    const fm = fixed ?? nearestFullMoon(year, h.m, h.d);
    lunar[h.key] = fm;
    // Thadingyut holidays are the day before, the full moon day and the day after
    const start = h.key === "thadingyut" ? addDays(fm, -1) : fm;
    out.push({
      date: start,
      endDate: h.days ? addDays(start, h.days - 1) : undefined,
      country: "MM",
      kind: "festival",
      name: h.name,
      wish: h.wish,
      approx: !fixed,
      note: h.note,
    });
  }
  // National Day: 10th waning day of Tazaungmon
  out.push({
    date: addDays(lunar.tazaungdaing, 10),
    country: "MM",
    kind: "holiday",
    name: { en: "National Day", my: "အမျိုးသားနေ့", ja: "ミャンマー国民の日" },
    wish: true,
    approx: !MM_LUNAR_OVERRIDES[year]?.tazaungdaing,
  });
  return out;
}

/* ---------- Japan ---------- */

/** nth weekday (0 = Sun … 6 = Sat) of a month, as yyyy-mm-dd */
function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return iso(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

function japan(year: number): Holiday[] {
  const jp = (date: string, name: Name, extra: Partial<Holiday> = {}): Holiday => ({ date, country: "JP", kind: "holiday", name, wish: false, ...extra });
  return [
    jp(iso(year, 1, 1), { en: "Japanese New Year (Shōgatsu)", my: "ဂျပန် နှစ်သစ်ကူး", ja: "お正月" }, { endDate: iso(year, 1, 3), kind: "festival", wish: true }),
    jp(nthWeekday(year, 1, 1, 2), { en: "Coming of Age Day", my: "ဂျပန် အရွယ်ရောက်နေ့", ja: "成人の日" }),
    jp(iso(year, 4, 29), { en: "Golden Week", my: "ဂျပန် Golden Week ရုံးပိတ်ရက်ရှည်", ja: "ゴールデンウィーク" }, {
      endDate: iso(year, 5, 5),
      kind: "season",
      note: "Long holiday in Japan — good for 'life in Japan' and travel content.",
    }),
    jp(iso(year, 8, 13), { en: "Obon", my: "ဂျပန် Obon ပွဲတော်", ja: "お盆" }, {
      endDate: iso(year, 8, 16),
      kind: "festival",
      wish: true,
      note: "Summer festival season — culture and life-in-Japan content.",
    }),
    jp(nthWeekday(year, 7, 0, 1), { en: "JLPT exam (July)", my: "JLPT စာမေးပွဲ (ဇူလိုင်)", ja: "日本語能力試験（7月）" }, {
      kind: "exam",
      wish: true,
      note: "Good-luck post on the day; study tips in the weeks before.",
    }),
    jp(nthWeekday(year, 12, 0, 1), { en: "JLPT exam (December)", my: "JLPT စာမေးပွဲ (ဒီဇင်ဘာ)", ja: "日本語能力試験（12月）" }, {
      kind: "exam",
      wish: true,
      note: "Good-luck post on the day; study tips in the weeks before.",
    }),
    jp(iso(year, 4, 1), { en: "Japan April hiring intake (new fiscal year)", my: "ဂျပန် ဧပြီ အလုပ်သမား လက်ခံချိန် (ဘဏ္ဍာနှစ်သစ်)", ja: "4月入社（新年度）" }, {
      endDate: iso(year, 4, 30),
      kind: "season",
      note: "Workers start jobs — welcome / departure / success-story content.",
    }),
    jp(iso(year, 10, 1), { en: "Japan October hiring intake", my: "ဂျပန် အောက်တိုဘာ အလုပ်သမား လက်ခံချိန်", ja: "10月入社" }, {
      endDate: iso(year, 10, 31),
      kind: "season",
      note: "Second intake of the year — departure / welcome content.",
    }),
  ];
}

/** Recruitment pushes a few months before each intake. */
function seasons(year: number): Holiday[] {
  const s = (m: number, name: Name, note: string): Holiday => ({
    date: iso(year, m, 1),
    endDate: iso(year, m, new Date(Date.UTC(year, m, 0)).getUTCDate()),
    country: "JP",
    kind: "season",
    name,
    wish: false,
    note,
  });
  return [
    s(1, { en: "Hiring push for the April intake", my: "ဧပြီ လက်ခံချိန်အတွက် အလုပ်ခေါ်ချိန်", ja: "4月入社に向けた採用期" }, "Interview-prep, documents and Japanese-study tips for workers starting in April."),
    s(2, { en: "Hiring push for the April intake", my: "ဧပြီ လက်ခံချိန်အတွက် အလုပ်ခေါ်ချိန်", ja: "4月入社に向けた採用期" }, "Interview-prep, documents and Japanese-study tips for workers starting in April."),
    s(7, { en: "Hiring push for the October intake", my: "အောက်တိုဘာ လက်ခံချိန်အတွက် အလုပ်ခေါ်ချိန်", ja: "10月入社に向けた採用期" }, "Interview-prep, documents and Japanese-study tips for workers starting in October."),
    s(8, { en: "Hiring push for the October intake", my: "အောက်တိုဘာ လက်ခံချိန်အတွက် အလုပ်ခေါ်ချိန်", ja: "10月入社に向けた採用期" }, "Interview-prep, documents and Japanese-study tips for workers starting in October."),
  ];
}

/** Holidays, exams and seasons that touch the given month (month = 1–12), sorted by date. */
export function getHolidaysForMonth(year: number, month: number): Holiday[] {
  const first = iso(year, month, 1);
  const last = iso(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return [...myanmar(year), ...japan(year), ...seasons(year)]
    .filter((h) => h.date <= last && (h.endDate ?? h.date) >= first)
    .map((h) => ({ ...h, id: `${h.country}:${h.name.en}:${year}` }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));
}

export const HOLIDAY_KINDS: HolidayKind[] = ["holiday", "festival", "exam", "season"];
export const HOLIDAY_COUNTRIES: HolidayCountry[] = ["MM", "JP", "BOTH"];

/** Moves a holiday by n days (keeps the length of multi-day events). */
export function shiftHoliday(h: Holiday, n: number): Holiday {
  return { ...h, date: addDays(h.date, n), endDate: h.endDate ? addDays(h.endDate, n) : undefined };
}

/** Sort order used everywhere: date, then country. */
export const sortHolidays = (list: Holiday[]) =>
  [...list].sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * A holiday list sent by the browser (the manager's edited list), checked and trimmed.
 * Keeps only well-formed items that touch the month; null when nothing usable was sent.
 */
export function cleanHolidays(input: unknown, year: number, month: number): Holiday[] | null {
  if (!Array.isArray(input)) return null;
  const first = iso(year, month, 1);
  const last = iso(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
  const out: Holiday[] = [];
  for (const raw of input.slice(0, 40)) {
    const h = (raw ?? {}) as Partial<Holiday> & { name?: Partial<Name> };
    const date = text(h.date, 10);
    const endDate = text(h.endDate, 10);
    if (!DAY.test(date)) continue;
    const end = DAY.test(endDate) && endDate >= date ? endDate : undefined;
    if (date > last || (end ?? date) < first) continue;
    const en = text(h.name?.en, 120) || text(h.name?.my, 120) || text(h.name?.ja, 120);
    if (!en) continue;
    out.push({
      id: text(h.id, 160) || undefined,
      custom: h.custom === true || undefined,
      date,
      endDate: end,
      country: HOLIDAY_COUNTRIES.includes(h.country as HolidayCountry) ? (h.country as HolidayCountry) : "BOTH",
      kind: HOLIDAY_KINDS.includes(h.kind as HolidayKind) ? (h.kind as HolidayKind) : "festival",
      name: { en, my: text(h.name?.my, 120) || en, ja: text(h.name?.ja, 120) || en },
      wish: h.wish !== false,
      approx: h.approx === true || undefined,
      note: text(h.note, 300) || undefined,
    });
  }
  return sortHolidays(out);
}
