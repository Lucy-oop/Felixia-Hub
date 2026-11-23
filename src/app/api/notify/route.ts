import { NextResponse } from "next/server";
import { adminClient, appUrl, caller, esc, hasAdmin, sendTelegram } from "@/lib/server";

type Event = "review" | "changes" | "approved" | "idea" | "job" | "jobUpdated" | "application" | "plan" | "planChanges" | "planFixed" | "clientNote" | "posted";
type Role = "manager" | "client";

/**
 * Sends Telegram alerts after something happens in the app.
 * Body: { event, id } — id is the card / job / inquiry it is about.
 */
export async function POST(req: Request) {
  // alerts need the server key + bot; without them, skip quietly
  if (!hasAdmin() || !process.env.TELEGRAM_BOT_TOKEN) return NextResponse.json({ ok: true, skipped: true });
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { event, id } = (await req.json().catch(() => ({}))) as { event?: Event; id?: string };
  if (!event) return NextResponse.json({ error: "No event" }, { status: 400 });

  const sb = adminClient();
  const url = appUrl(req);
  const who = esc(me.full_name || "Someone");
  let to: Role[] = [];
  let text = "";

  if (event === "review" || event === "changes" || event === "approved") {
    const { data: c } = await sb.from("content_cards").select("title, review, review_note").eq("id", id ?? "").single();
    if (!c) return NextResponse.json({ ok: true });
    const title = esc(c.title);
    if (event === "review") {
      to = ["client"];
      text = `🟡 <b>ပို့စ် အသစ် စစ်ရန်</b> / New post to check\n“${title}”\n\nအတည်ပြုပါ သို့မဟုတ် ပြင်စေချင်တာ ရေးပေးပါ။\n👉 ${url}/confirm`;
    } else if (event === "changes") {
      to = ["manager"];
      text = `🔴 <b>Need edit</b> — ${who}\n“${title}”${c.review_note ? `\n\n💬 ${esc(c.review_note)}` : ""}\n👉 ${url}/confirm`;
    } else {
      to = ["manager"];
      text = `🟢 <b>Approved</b> — ${who}\n“${title}”\n👉 ${url}/pipeline`;
    }
  } else if (event === "idea") {
    if (me.role === "manager") return NextResponse.json({ ok: true }); // don't alert yourself
    to = ["manager"];
    const { data: i } = await sb.from("ideas").select("text, links, images").order("created_at", { ascending: false }).limit(1).single();
    const extra = [i?.images?.length ? `🖼 ${i.images.length}` : "", i?.links?.length ? `🔗 ${i.links.length}` : ""].filter(Boolean).join("  ");
    text = `💡 <b>New idea</b> — ${who}\n${esc((i?.text ?? "").slice(0, 300))}${extra ? `\n${extra}` : ""}\n👉 ${url}/ideas`;
  } else if (event === "job") {
    to = ["manager"];
    const { data: j } = await sb.from("job_orders").select("title").eq("id", id ?? "").single();
    text = `📋 <b>New job details</b> — ${who}\n“${esc(j?.title ?? "")}” — please tidy and make a post.\n👉 ${url}/jobs`;
  } else if (event === "jobUpdated") {
    if (me.role === "manager") return NextResponse.json({ ok: true }); // don't alert yourself
    to = ["manager"];
    const { data: j } = await sb.from("job_orders").select("title").eq("id", id ?? "").single();
    text = `✏️ <b>Job details updated</b> — ${who}\n“${esc(j?.title ?? "")}” — please check the changes.\n👉 ${url}/jobs`;
  } else if (event === "application") {
    to = ["manager", "client"];
    const { data: q } = await sb.from("inquiries").select("name, platform, job_id").eq("id", id ?? "").single();
    const { data: j } = q?.job_id ? await sb.from("job_orders").select("title").eq("id", q.job_id).single() : { data: null };
    text = `🙋 <b>အလုပ်လျှောက်လွှာ အသစ်</b> / New application\n${esc(q?.name || "—")} · ${q?.platform === "tiktok" ? "TikTok" : "Facebook"}${j ? `\n${esc(j.title)}` : ""}\n👉 ${url}/inquiries`;
  }

  if (event === "plan") {
    const [y, m] = (id ?? "").split("-").map(Number);
    const from = `${id}-01`;
    const to_ = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    const { data: rows } = await sb.from("content_cards").select("title, plan_status, plan_note, plan_headline").gte("planned_date", from).lt("planned_date", to_);
    const list = rows ?? [];
    if (event === "plan") {
      to = ["client"];
      const n = list.filter((r) => r.plan_status === "sent").length;
      text = `📅 <b>${esc(id ?? "")} Content plan</b> — ${n} lines\nခေါင်းစဉ်များ စစ်ပြီး အတည်ပြုပေးပါ / Please check and approve the plan.\n👉 ${url}/plan?month=${id ?? ""}`;
    }
  } else if (event === "planChanges" || event === "clientNote") {
    to = ["manager"];
    const { data: c } = await sb.from("content_cards").select("title, plan_note, plan_headline, client_note, planned_date").eq("id", id ?? "").single();
    const planLink = `${url}/plan${c?.planned_date ? `?month=${String(c.planned_date).slice(0, 7)}` : ""}`;
    const clean = (v?: string | null) => esc((v ?? "").replace(/^(\[\w+\]\s*)+/, ""));
    text =
      event === "planChanges"
        ? `✎ <b>Need to edit (plan)</b> — ${who}\n“${esc(c?.title ?? "")}”${c?.plan_headline ? `\n➡️ ${esc(c.plan_headline)}` : ""}${c?.plan_note ? `\n${clean(c.plan_note)}` : ""}\n👉 ${planLink}`
        : `🗒 <b>Client note</b> — ${who}\n“${esc(c?.title ?? "")}”\n${esc(c?.client_note ?? "")}\n👉 ${planLink}`;
  } else if (event === "planFixed") {
    to = ["client"];
    const { data: c } = await sb.from("content_cards").select("title, plan_note, planned_date").eq("id", id ?? "").single();
    const planLink = `${url}/plan${c?.planned_date ? `?month=${String(c.planned_date).slice(0, 7)}` : ""}`;
    text = `✏️ <b>ခေါင်းစဉ် ပြင်ပြီးပါပြီ / Headline updated</b> — ${who}\n“${esc(c?.title ?? "")}”${c?.plan_note ? `\n\n💬 ${esc(c.plan_note)}` : ""}\n\nပြန်စစ်ပြီး အတည်ပြုပေးပါ / Please check again.\n👉 ${planLink}`;
  } else if (event === "posted") {
    to = ["client"];
    const { data: c } = await sb.from("content_cards").select("title, published_url").eq("id", id ?? "").single();
    text = `🚀 <b>တင်ပြီးပါပြီ / Published</b>\n“${esc(c?.title ?? "")}”${c?.published_url ? `\n${esc(c.published_url)}` : ""}\n👉 ${url}/calendar`;
  }

  if (!to.length) return NextResponse.json({ ok: true });
  const { data: people } = await sb.from("profiles").select("id, telegram_chat_id").in("role", to).not("telegram_chat_id", "is", null);
  await Promise.all((people ?? []).filter((p) => p.id !== me.id).map((p) => sendTelegram(p.telegram_chat_id, text)));
  return NextResponse.json({ ok: true, sent: people?.length ?? 0 });
}
