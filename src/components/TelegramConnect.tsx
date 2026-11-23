"use client";

import { BellRing, Check, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

async function api(method: "GET" | "POST" | "DELETE") {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/telegram/link", { method, headers: { Authorization: `Bearer ${data.session?.access_token}` } });
  return res.json().catch(() => ({}));
}

/** "Connect Telegram" item for the user menu. */
export default function TelegramConnect() {
  const { t } = useT();
  const [state, setState] = useState<{ connected: boolean; ready: boolean } | null>(null);
  const [err, setErr] = useState("");

  const check = useCallback(() => api("GET").then((r) => r && "connected" in r && setState(r)), []);
  useEffect(() => {
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [check]);

  if (!state) return null;
  if (state.connected)
    return (
      <div className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm text-green-700">
        <Check className="h-4 w-4" /> {t("tg.connected")}
        <button className="ml-auto text-xs text-ink-mute hover:text-rose-600" onClick={() => api("DELETE").then(check)}>
          {t("tg.off")}
        </button>
      </div>
    );
  return (
    <div>
      <button
        disabled={!state.ready}
        onClick={async () => {
          setErr("");
          const r = await api("POST");
          if (r.url) window.open(r.url, "_blank");
          else setErr(t(r.error ?? "err.noBot"));
        }}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm text-ink-soft hover:bg-frame hover:text-ink disabled:opacity-40"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#229ED9] text-white">
          <Send className="h-3 w-3" />
        </span>
        {t("tg.connect")}
        <BellRing className="ml-auto h-3.5 w-3.5 text-ink-mute" />
      </button>
      {(err || !state.ready) && <p className="px-2 pb-1 text-[11px] text-ink-mute">{err || t("err.noBot")}</p>}
    </div>
  );
}
