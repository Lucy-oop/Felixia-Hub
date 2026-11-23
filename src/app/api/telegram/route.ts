import { NextResponse } from "next/server";
import { adminClient, esc, hasAdmin, sendTelegram } from "@/lib/server";

/**
 * Telegram webhook. A person opens t.me/<bot>?start=<code> (from "Connect Telegram" in the app),
 * Telegram sends "/start <code>" here, and we remember their chat for alerts.
 */
export async function POST(req: Request) {
  if (!hasAdmin()) return NextResponse.json({ ok: false }, { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET)
    return NextResponse.json({ ok: false }, { status: 401 });

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  const chatId = msg?.chat?.id ? String(msg.chat.id) : "";
  const text: string = msg?.text ?? "";
  if (!chatId) return NextResponse.json({ ok: true });

  const code = text.match(/^\/start\s+(\S+)/)?.[1];
  if (!code) {
    await sendTelegram(chatId, "Open Felixia Hub → your picture (top right) → <b>Connect Telegram</b> to turn on alerts.");
    return NextResponse.json({ ok: true });
  }

  const sb = adminClient();
  const { data: p } = await sb.from("profiles").select("id, full_name").eq("telegram_code", code).single();
  if (!p) {
    await sendTelegram(chatId, "This link has expired. Please press <b>Connect Telegram</b> in Felixia Hub again.");
    return NextResponse.json({ ok: true });
  }
  await sb.from("profiles").update({ telegram_chat_id: chatId, telegram_code: null }).eq("id", p.id);
  await sendTelegram(chatId, `✅ Connected${p.full_name ? `, ${esc(p.full_name)}` : ""}! Felixia Hub will message you here.\n✅ ချိတ်ဆက်ပြီးပါပြီ။\n✅ 接続しました。`);
  return NextResponse.json({ ok: true });
}
