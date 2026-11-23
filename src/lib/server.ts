import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Helpers for API routes only (they use secrets — never import from client components). */

/** Is the secret server key set? (Needed for Telegram alerts.) */
export const hasAdmin = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Full-access client (bypasses database rules). Use only after checking who is calling. */
export function adminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

/** Who is calling (from "Authorization: Bearer <supabase access token>"), with their role. */
export async function caller(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const sb = adminClient();
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await sb.from("profiles").select("id, role, full_name").eq("id", data.user.id).single();
  return p as { id: string; role: "manager" | "client"; full_name: string } | null;
}

/** Send a Telegram message. Silently does nothing if the bot isn't set up. */
export async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Public address of the app (for links in messages). */
export function appUrl(req: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
}
