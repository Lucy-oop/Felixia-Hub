/**
 * Hiring post templates per visa type + auto-detection (safe for client and server).
 * The saved copies live in brand_settings.post_templates (fb_hiring_tokutei / fb_hiring_katsudo);
 * these defaults pre-fill the AI Brand Settings page and are used when a saved one is empty.
 */

export type HiringVisa = "tokutei" | "katsudo";

export const HIRING_TEMPLATE_KEY = {
  tokutei: "fb_hiring_tokutei",
  katsudo: "fb_hiring_katsudo",
} as const satisfies Record<HiringVisa, string>;

export const HIRING_VISA_LABEL: Record<HiringVisa, string> = {
  tokutei: "Tokutei Ginou",
  katsudo: "Katsudo",
};

/** "Katsudo" / "Tokutei Ginou" (or the Japanese 特定活動 / 特定技能) in the raw job text → its template. null = not found. */
export function detectHiringVisa(raw: string): HiringVisa | null {
  const katsudo = raw.search(/katsudo|特定活動/i);
  const tokutei = raw.search(/tokutei\s*ginou|特定技能/i);
  if (katsudo < 0 && tokutei < 0) return null;
  if (katsudo < 0) return "tokutei";
  if (tokutei < 0) return "katsudo";
  return katsudo < tokutei ? "katsudo" : "tokutei"; // both mentioned → the first one (usually the headline)
}

export const DEFAULT_HIRING_TEMPLATES: Record<HiringVisa, string> = {
  tokutei: `🇯🇵 [Location Scope: ဂျပန်ပြည်တွင်း / ပြည်ပ] Tokutei Ginou ([Job Title]) အလုပ်အကိုင်အခွင့်အလမ်း! [1-2 relevant emojis]

ဂျပန်နိုင်ငံ၊ [Prefecture / City] ခရိုင်တွင် [Job Description] (Tokutei Ginou) လုပ်ရန် ဝန်ထမ်းများ အမြန်ခေါ်ယူနေပါပြီ။ ([Optional: 1 short natural highlight sentence from raw data, e.g., မြန်မာစီနီယာများလည်း ရှိပါတယ်။ — omit parentheses if none])

🆔 求人番号: [Job ID]

📌 အလုပ်အချက်အလက်များ
📍 တည်နေရာ: [Prefecture / City]
🛠 အလုပ်အကိုင်: [Exact Job Description]
👷‍♂️ လူဦးရေ: [Headcount]
💰 လစာ: [Full Salary + exact Base / Overtime breakdown]
🕘 အလုပ်ချိန်: [Working Hours + Break Time]
📅 ပိတ်ရက်: [Weekly Holidays + Annual/Seasonal Holidays]
🎁 Bonus & အကျိုးခံစားခွင့်များ: [Bonus, Dorm, Transport, Lunch — omit line if not in raw data]

✅ လိုအပ်သောအချက်အလက်များ
- [List every requirement from raw data verbatim]

📋 လျှောက်ထားရန် လိုအပ်သောစာရွက်စာတမ်းများ
- [List every required document from raw data verbatim, e.g., CV Form, 特定技能 Skill Test, 日本語 Certificate, 在留カード]

📩 ဆက်သွယ်လျှောက်ထားရန်
စိတ်ပါဝင်စားသူများအနေဖြင့် အသေးစိတ်အချက်အလက်များကို Page ရဲ့ Facebook Messenger သို့မဟုတ် LINE မှတစ်ဆင့် အခုပဲ ဆက်သွယ်စုံစမ်း လျှောက်ထားနိုင်ပါတယ်ခင်ဗျာ။

🏢 Felixia Recruitment
Room - 1002, Lions Mansion Otsuka, 2-16-9, Kita Otsuka, Toshima Ku, Tokyo

#FelixiaRecruitment #JapanJobs #TokuteiGinou #[Prefecture]Jobs #[JobTitleInBurmese] #ဂျပန်ပြည်တွင်းအလုပ်အကိုင် #MyanmarInJapan`,

  katsudo: `🇯🇵 [Location Scope: ဂျပန်ပြည်တွင်း / ပြည်ပ] Katsudo ([Job Title]) အလုပ်အကိုင်အခွင့်အလမ်း! [1-2 relevant emojis]

ဂျပန်နိုင်ငံ၊ [Prefecture / City] ခရိုင်တွင် [Job Description] (Katsudo) လုပ်ရန် ဝန်ထမ်းများ ခေါ်ယူနေပါပြီ။ ([Optional: 1 short natural highlight sentence from raw data, e.g., မြန်မာစီနီယာများလည်း ရှိပါတယ်။ — omit parentheses if none])

🆔 求人番号: [Job ID]

📌 အလုပ်အချက်အလက်များ
📍 တည်နေရာ: [Prefecture / City]
💼 အလုပ်အကိုင်: [Exact Job Description]
👥 လူဦးရေ: [Headcount]
💰 လစာ: [Full Salary + exact Base / Allowance / Overtime breakdown]
🕘 အလုပ်ချိန်: [Working Hours + Break Time]
📅 ပိတ်ရက်: [Weekly Holidays + Annual/Seasonal Holidays]
🎁 Bonus & အကျိုးခံစားခွင့်များ: [Bonus, Visa Support, Dorm, Transport, Insurance — omit line if not in raw data]

✅ လိုအပ်သောအချက်အလက်များ
- [List every requirement from raw data verbatim: JLPT Level, Education/Degree, Experience, Visa eligibility]

📋 လျှောက်ထားရန် လိုအပ်သောစာရွက်စာတမ်းများ
- [List every required document from raw data verbatim, e.g., CV Form / Rirekisho, JLPT Certificate, Graduation Certificate, 在留カード]

📩 ဆက်သွယ်လျှောက်ထားရန်
စိတ်ပါဝင်စားသူများအနေဖြင့် အသေးစိတ်အချက်အလက်များကို Page ရဲ့ Facebook Messenger သို့မဟုတ် LINE မှတစ်ဆင့် အခုပဲ ဆက်သွယ်စုံစမ်း လျှောက်ထားနိုင်ပါတယ်ခင်ဗျာ။

🏢 Felixia Recruitment
Room - 1002, Lions Mansion Otsuka, 2-16-9, Kita Otsuka, Toshima Ku, Tokyo

#FelixiaRecruitment #JapanJobs #Katsudo #[Prefecture]Jobs #[JobTitleInBurmese] #ဂျပန်ပြည်တွင်းအလုပ်အကိုင် #MyanmarInJapan`,
};
