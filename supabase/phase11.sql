-- Felixia Hub — Phase 11: two hiring post templates (Tokutei Ginou / Katsudo) in AI Brand Settings
-- Run in Supabase → SQL Editor → New query → paste → Run. Safe to run again:
-- it only fills a template that is still missing or empty, so your own edits are never overwritten.
-- (If you never ran phase9.sql, run it first.)

update brand_settings
set post_templates = post_templates
  || case when coalesce(trim(post_templates->>'fb_hiring_tokutei'), '') = ''
       then jsonb_build_object('fb_hiring_tokutei', $tpl$🇯🇵 [Location Scope: ဂျပန်ပြည်တွင်း / ပြည်ပ] Tokutei Ginou ([Job Title]) အလုပ်အကိုင်အခွင့်အလမ်း! [1-2 relevant emojis]

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

#FelixiaRecruitment #JapanJobs #TokuteiGinou #[Prefecture]Jobs #[JobTitleInBurmese] #ဂျပန်ပြည်တွင်းအလုပ်အကိုင် #MyanmarInJapan$tpl$::text) else '{}'::jsonb end
  || case when coalesce(trim(post_templates->>'fb_hiring_katsudo'), '') = ''
       then jsonb_build_object('fb_hiring_katsudo', $tpl$🇯🇵 [Location Scope: ဂျပန်ပြည်တွင်း / ပြည်ပ] Katsudo ([Job Title]) အလုပ်အကိုင်အခွင့်အလမ်း! [1-2 relevant emojis]

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

#FelixiaRecruitment #JapanJobs #Katsudo #[Prefecture]Jobs #[JobTitleInBurmese] #ဂျပန်ပြည်တွင်းအလုပ်အကိုင် #MyanmarInJapan$tpl$::text) else '{}'::jsonb end,
    updated_at = now()
where id = 1;
