/**
 * Reads a client's pasted job post (Burmese / Japanese / English labels) into exact facts, and fills the
 * saved fb_hiring template with them — no AI, so nothing is translated, mixed up or invented.
 *
 * Rules: the job location comes ONLY from the location field (never the agency's address at the bottom);
 * salary ONLY from the salary field (fees / bonus stay separate); every value is copied word for word.
 */

export type JobScope = "japan" | "overseas" | "";

export interface JobFacts {
  jobCode: string; // 求人番号
  scope: JobScope; // ဂျပန်ပြည်တွင်း (in Japan) / ပြည်ပ (overseas)
  visa: string; // e.g. Tokutei Ginou
  industry: string; // e.g. စက်မှုကုန်ထုတ်
  location: string; // တည်နေရာ
  role: string; // အလုပ်အကိုင်
  headcount: string; // လူဦးရေ, e.g. ကျား 4 ဦး
  salary: string; // လစာ, incl. overtime note
  hours: string; // အလုပ်ချိန် (incl. break)
  holidays: string; // ပိတ်ရက်
  bonus: string;
  benefits: string[]; // unlabelled bullets in the job-info block (dorm + fee, bicycle, lunch…)
  requirements: string[]; // လိုအပ်သောအချက်အလက်များ
  documents: string[]; // အလုပ်လျှောက်ရန်လိုအပ်ချက် (CV Form, 特定技能 …, 在留カード)
  other: string[]; // anything else worth keeping
}

export const SCOPE_LABEL: Record<Exclude<JobScope, "">, string> = { japan: "ဂျပန်ပြည်တွင်း", overseas: "ပြည်ပ" };

const BULLET = /^[\s•・●▪▫◦‣∙·*\-–—✅✓✔️📍💰🕘📅🎁👷‍♂️🛠]+/u;
const SEP = /\s*[-–—:：]\s*/;

/** Labelled one-line fields: label (start of the line) → fact key. */
const FIELDS: [RegExp, keyof JobFacts][] = [
  [/^(တည်နေရာ|勤務地|就業場所|勤務先住所|Work ?location|Location)/i, "location"],
  [/^(အလုပ်အကိုင်|အလုပ်အမျိုးအစား|仕事内容|職種|業務内容|Job ?(role|type|description)?|Position)/i, "role"],
  [/^(လူဦးရေ|ခေါ်ယူမည့်လူဦးရေ|募集人数|人数|Headcount|Number of (people|workers))/i, "headcount"],
  [/^(လစာ|給与|月給|時給|基本給|賃金|Salary|Wage)/i, "salary"],
  [/^(အလုပ်ချိန်|勤務時間|就業時間|Working ?hours?|Hours)/i, "hours"],
  [/^(ပိတ်ရက်|休日|休暇|Holidays?|Days? off)/i, "holidays"],
  [/^(Bonus|ဘောနပ်|賞与|ボーナス)/i, "bonus"],
];

/** Section headings → which list the bullets below go to. Order matters (documents before requirements). */
const SECTIONS: [RegExp, "info" | "documents" | "requirements" | "contact"][] = [
  [/^(အလုပ်အချက်အလက်|求人情報|募集要項|Job ?Info)/i, "info"],
  [/^(အလုပ်လျှောက်ရန်\s*လိုအပ်ချက်|လျှောက်ထားရန်\s*လိုအပ်|必要書類|応募書類|Required ?Documents?)/i, "documents"],
  [/^(လိုအပ်သော|လိုအပ်ချက်များ|応募条件|必要条件|応募資格|Requirements?|Qualifications?)/i, "requirements"],
];

const VISA = /(Tokutei\s*Ginou|特定技能|SSW|Specified Skilled|技能実習|Technical Intern|Ginou\s*Jisshu|技人国|Engineer)/i;

const clean = (s: string) => s.replace(BULLET, "").trim();

/** Exact facts from a pasted job post. Unknown / missing details stay "" or []. */
export function extractJobFacts(raw: string): JobFacts {
  const f: JobFacts = {
    jobCode: "",
    scope: "",
    visa: "",
    industry: "",
    location: "",
    role: "",
    headcount: "",
    salary: "",
    hours: "",
    holidays: "",
    bonus: "",
    benefits: [],
    requirements: [],
    documents: [],
    other: [],
  };
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  let section: "head" | "info" | "documents" | "requirements" | "contact" | "footer" = "head";

  for (const line of lines) {
    if (!line) continue;
    const text = clean(line);
    if (!text) continue;

    // the agency's own footer (name + office address) — never job data
    if (/^Felixia\b/i.test(text)) {
      section = "footer";
      continue;
    }
    if (section === "footer") continue;

    const code = text.match(/(?:求人番号|Job\s*(?:ID|No\.?|code)|Ref(?:erence)?\s*No\.?)\s*[:：]?\s*([A-Za-z0-9\-_]+)/i);
    if (code && !f.jobCode) {
      f.jobCode = code[1];
      continue;
    }

    // contact line(s) are fixed text in the template
    if (/ဆက်သွယ်စုံစမ်း|Messenger|LINE\b|お問い合わせ/i.test(text) && !SEP.test(text.slice(0, 12))) {
      section = "contact";
      continue;
    }

    const heading = SECTIONS.find(([re]) => re.test(text));
    if (heading && !BULLET.test(line.slice(0, 1)) && text.length < 60) {
      section = heading[1];
      continue;
    }

    // labelled one-line fields (anywhere)
    const field = FIELDS.find(([re]) => re.test(text));
    if (field) {
      const value = text.replace(field[0], "").replace(/^\s*[-–—:：]\s*/, "").trim();
      if (value && !f[field[1]]) (f[field[1]] as string) = value;
      continue;
    }

    if (section === "head") {
      if (/ဂျပန်ပြည်တွင်း|国内(在住)?|in Japan/i.test(text)) f.scope ||= "japan";
      else if (/ပြည်ပ|海外(在住)?|overseas/i.test(text)) f.scope ||= "overseas";
      else if (VISA.test(text) && !f.visa) f.visa = text;
      else if (!f.industry) f.industry = text;
      else f.other.push(text);
    } else if (section === "info") f.benefits.push(text);
    else if (section === "documents") f.documents.push(text);
    else if (section === "requirements") f.requirements.push(text);
    else if (section !== "contact") f.other.push(text);
  }
  return f;
}

/** Enough was found to fill the template without AI. */
export const factsLookComplete = (f: JobFacts) => !!(f.location && f.salary && (f.role || f.industry));

/** First money amount in the salary field, e.g. "¥237,200 (…)" → 237200; "時給 1,100円" → 1100. */
export function salaryAmount(salary: string): number {
  const man = salary.match(/(\d+(?:\.\d+)?)\s*万/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const m = salary.match(/[¥￥]\s*([\d,]{3,})|([\d,]{3,})\s*(?:円|yen|JPY)/i);
  return m ? Number((m[1] ?? m[2]).replace(/,/g, "")) : 0;
}

/** Number of people from the headcount field, e.g. "ကျား 4 ဦး" → 4. */
export function headcountNumber(headcount: string): number {
  const ascii = headcount.replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040));
  const m = ascii.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/* ---------- template filling ---------- */

/** What a [placeholder] in the template stands for. Checked in order. */
const PLACEHOLDERS: [RegExp, (f: JobFacts) => string][] = [
  [/ပြည်တွင်း|ပြည်ပ|domestic|overseas/i, (f) => (f.scope ? SCOPE_LABEL[f.scope] : "")],
  [/job\s*id|求人番号/i, (f) => f.jobCode],
  [/visa/i, (f) => f.visa],
  [/industry\s*\/\s*job\s*role/i, (f) => f.role || f.industry],
  [/^industry$/i, (f) => f.industry || f.role],
  [/prefecture|city|location/i, (f) => f.location],
  [/job\s*role|description|position/i, (f) => f.role],
  [/gender|headcount/i, (f) => f.headcount],
  [/salary|overtime/i, (f) => f.salary],
  [/start|end|break|hours/i, (f) => f.hours],
  [/holiday/i, (f) => f.holidays],
  [/bonus/i, (f) => f.bonus],
];

/** Template list sections → which facts replace their bullets. */
const LIST_SECTIONS: [RegExp, (f: JobFacts) => string[]][] = [
  [/benefit|အကျိုးခံစားခွင့်|待遇|福利/i, (f) => f.benefits],
  [/required\s*documents?|အလုပ်လျှောက်ရန်\s*လိုအပ်ချက်|必要書類/i, (f) => f.documents],
  [/requirement|လိုအပ်သော|応募条件/i, (f) => f.requirements],
];

const isListItem = (l: string) => /^\s*[-•・*]\s+/.test(l);

/**
 * Fill the saved fb_hiring template with exact facts.
 * - each `[placeholder]` gets the matching fact; a line whose fact is missing is left out (never invented)
 * - each list section (Benefits / Requirements / Required Documents) gets exactly the raw text's items —
 *   the template's example bullets (e.g. "[在留カード / Passport]") are replaced, not copied
 * - only the matching scope tag is kept; fixed text (contact, agency footer, hashtags) stays as is
 */
export function fillHiringTemplate(template: string, f: JobFacts): string {
  const out: string[] = [];
  const lines = template.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // a list section heading → replace its whole bullet group with the facts
    const list = LIST_SECTIONS.find(([re]) => re.test(line)) && !isListItem(line) ? LIST_SECTIONS.find(([re]) => re.test(line)) : undefined;
    if (list) {
      const items = list[1](f);
      let j = i + 1;
      while (j < lines.length && isListItem(lines[j])) j++;
      if (items.length) {
        out.push(line);
        const bullet = lines[i + 1]?.match(/^\s*([-•・*])\s+/)?.[1] ?? "-";
        for (const it of items) out.push(`${bullet} ${it}`);
      } else if (out.length && out[out.length - 1] === "") out.pop(); // section not in the raw text → leave it out
      i = j - 1;
      continue;
    }

    if (!line.includes("[")) {
      out.push(line);
      continue;
    }

    let missing = false;
    let filled = line.replace(/\[([^\]]+)\]/g, (_, name: string) => {
      const hit = PLACEHOLDERS.find(([re]) => re.test(name.trim()));
      const v = hit ? hit[1](f) : "";
      if (!v) missing = true;
      return v;
    });
    if (missing) {
      // scope tag unknown → drop just the "(…)" around it, keep the header
      if (/ပြည်တွင်း|ပြည်ပ/.test(line)) filled = filled.replace(/\s*\(\s*\)/, "");
      else continue; // a detail the raw text doesn't give → no line, no guess
    }
    out.push(filled);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Exact strings that must appear in any post written from these facts (used to check AI output). */
export function mustKeep(f: JobFacts): { label: string; value: string }[] {
  const keep: { label: string; value: string }[] = [];
  const add = (label: string, v: string) => v && keep.push({ label, value: v });
  add("求人番号", f.jobCode);
  add("Location", f.location);
  add("Headcount", f.headcount);
  // numbers inside the salary / hours must survive even in a translated post
  for (const n of f.salary.match(/[¥￥]?\s*[\d,]{3,}/g) ?? []) add("Salary", n.trim());
  for (const n of f.hours.match(/\d{1,2}:\d{2}/g) ?? []) add("Working hours", n);
  // Japanese document / certificate names stay in Japanese
  for (const d of f.documents) for (const jp of d.match(/[぀-ヿ一-鿿][぀-ヿ一-鿿0-9\s号級~～NＮ]*/g) ?? []) add("Documents", jp.trim());
  return keep;
}
