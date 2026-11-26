"use client";

import { ArrowRight, CalendarClock, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { DateChange, OptimizeResponse } from "@/app/api/ai/optimize-dates/route";
import { callAI } from "@/lib/ai-client";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import { CATEGORIES, type Category, type Placement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert, Button, CategoryChip, PlacementMark, Portal } from "./ui";

/** Manager-only button + modal: Gemini reviews the month's dates (Content + TikTok calendars) and suggests moves to apply. */
export function OptimizeDatesButton({ month }: { month: string }) {
  const { role } = useDB();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (role !== "manager") return null;
  return (
    <>
      <Button size="sm" variant="secondary" className="h-9" onClick={() => setOpen(true)}>
        <CalendarClock className="h-4 w-4 text-primary" /> {t("opt.btn")}
      </Button>
      {open && (
        <Portal>
          <OptimizeModal month={month} onClose={() => setOpen(false)} />
        </Portal>
      )}
    </>
  );
}

function OptimizeModal({ month, onClose }: { month: string; onClose: () => void }) {
  const s = useDB();
  const { t, lang, locale } = useT();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  const [res, setRes] = useState<OptimizeResponse | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({});

  const run = async () => {
    setBusy(true);
    setError("");
    setRes(null);
    const [y, m] = month.split("-").map(Number);
    const r = await callAI<OptimizeResponse>("optimize-dates", { year: y, month: m, language: lang });
    setBusy(false);
    if (r.data) {
      setRes(r.data);
      setOn(Object.fromEntries(r.data.changes.map((c) => [c.id, true])));
    } else if (r.retryAfter) {
      setWait(r.retryAfter);
      setError(r.error === "ai.err.overloaded" ? "aiplan.overloaded" : "aiplan.rateLimit");
    } else setError(r.error ?? "ai.err.bad");
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
  const picked = res?.changes.filter((c) => on[c.id]) ?? [];

  const apply = () => {
    // only move lines that still sit on the date the AI saw
    for (const c of picked) {
      const card = s.db.cards.find((x) => x.id === c.id);
      if (card && card.plannedDate === c.oldDate) s.setDate(c.id, c.newDate);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/25 backdrop-blur-[3px] sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="opt-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-rise flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-edge bg-frame shadow-float sm:max-h-[90vh] sm:rounded-[28px]"
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="opt-title" className="text-xl leading-tight font-medium tracking-tight text-ink">
              {t("opt.title")}
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {new Date(`${month}-01T00:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" })} · {t("opt.sub")}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {busy && (
            <div className="flex flex-col items-center gap-3 py-14 text-sm text-ink-soft">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              {t("opt.busy")}
            </div>
          )}

          {error && (
            <Alert tone={wait ? "amber" : "rose"} onClose={() => setError("")}>
              ⚠ {t(error, { n: wait })}
            </Alert>
          )}

          {res && (
            <>
              <div className="rounded-2xl border border-line bg-surface p-4 shadow-raised">
                <div className="mb-1 text-xs font-medium tracking-wide text-ink-mute uppercase">{t("opt.health")}</div>
                <p className="text-sm whitespace-pre-wrap text-ink">{res.summary || "—"}</p>
              </div>

              {res.changes.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-soft">✓ {t("opt.noChanges")}</p>
              ) : (
                <ul className="space-y-2">
                  {res.changes.map((c) => (
                    <ChangeRow
                      key={c.id}
                      c={c}
                      on={!!on[c.id]}
                      toggle={() => setOn({ ...on, [c.id]: !on[c.id] })}
                      fmt={fmt}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3 sm:px-6">
          {res && res.changes.length > 0 && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
                checked={picked.length === res.changes.length}
                onChange={(e) => setOn(Object.fromEntries(res.changes.map((c) => [c.id, e.target.checked])))}
              />
              {t("opt.selected", { n: picked.length, total: res.changes.length })}
            </label>
          )}
          <div className="flex-1" />
          {!busy && (
            <Button variant="ghost" size="sm" onClick={run}>
              {t("opt.again")}
            </Button>
          )}
          <Button size="sm" disabled={busy || picked.length === 0} onClick={apply}>
            {t("opt.apply")}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function ChangeRow({ c, on, toggle, fmt }: { c: DateChange; on: boolean; toggle: () => void; fmt: (iso: string) => string }) {
  return (
    <li>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 rounded-2xl border bg-surface p-3 transition",
          on ? "border-primary/40 shadow-raised" : "border-line opacity-60",
        )}
      >
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)]" checked={on} onChange={toggle} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {(c.platforms as Placement[]).map((p) => (
              <PlacementMark key={p} placement={p} className="h-4 w-4" />
            ))}
            <span className="font-medium text-ink">{c.title}</span>
            {(CATEGORIES as readonly string[]).includes(c.category) && <CategoryChip category={c.category as Category} />}
          </div>
          <div className="flex items-center gap-2 text-sm tabular-nums">
            <span className="text-ink-mute line-through">{fmt(c.oldDate)}</span>
            <ArrowRight className="h-3.5 w-3.5 text-ink-mute" />
            <span className="font-medium text-primary">{fmt(c.newDate)}</span>
          </div>
          {c.reason && <p className="text-xs text-ink-soft">{c.reason}</p>}
        </div>
      </label>
    </li>
  );
}
