import { NextResponse } from "next/server";
import { adminClient, caller, hasAdmin } from "@/lib/server";

/** GET: is my Telegram connected? POST: make a one-time link to connect it. DELETE: disconnect. */
export async function GET(req: Request) {
  if (!hasAdmin()) return NextResponse.json({ connected: false, ready: false });
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data } = await adminClient().from("profiles").select("telegram_chat_id").eq("id", me.id).single();
  return NextResponse.json({ connected: !!data?.telegram_chat_id, ready: !!process.env.TELEGRAM_BOT_USERNAME });
}

export async function POST(req: Request) {
  if (!hasAdmin()) return NextResponse.json({ error: "err.noBot" }, { status: 500 });
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  if (!bot) return NextResponse.json({ error: "err.noBot" }, { status: 500 });
  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  await adminClient().from("profiles").update({ telegram_code: code }).eq("id", me.id);
  return NextResponse.json({ url: `https://t.me/${bot}?start=${code}` });
}

export async function DELETE(req: Request) {
  if (!hasAdmin()) return NextResponse.json({ ok: true });
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await adminClient().from("profiles").update({ telegram_chat_id: null, telegram_code: null }).eq("id", me.id);
  return NextResponse.json({ ok: true });
}
