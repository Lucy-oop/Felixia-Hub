"use client";

import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CalendarResponse } from "@/app/api/ai/calendar/route";
import { callAI } from "@/lib/ai-client";
import {
  countTotal,
  DEFAULT_COUNTS,
  MAX_PER_PILLAR,
  MAX_TOTAL,
  PILLAR_CATEGORY,
  PILLARS,
  plannableMonths,
  type Pillar,
  type PlanCounts,
  type PlanRow,
} from "@/lib/calendar-ai";
import { getHolidaysForMonth, type Holiday } from "@/lib/holidays";
import { useT, type Lang } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import type { Platform } from "@/lib/types";
import { cn } from "@/lib/utils";
import { HolidayEditor } from "./HolidayEditor";
import {
  Alert,
  Button,
  CATEGORY_COLOR,
  inputCls,
  PlatformMark,
  Portal,
} from "./ui";

type Row = PlanRow & { key: number; on: boolean };
let nextKey = 1;

/** Pillar colours = the Content Calendar colours of the category each pillar is saved as. */
const PC = (p: Pillar) => CATEGORY_COLOR[PILLAR_CATEGORY[p]];
/** Manager-only button + modal: AI month plan with month picker, post counts, editable holidays and per-row regenerate (no hiring posts — those are added by hand). */
export function MonthPlanButton({
  month,
  onSaved,
}: {
  month: string;
  monthName?: string;
  onSaved?: (month: string) => void;
}) {
  const { role } = useDB();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (role !== "manager") return null;
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="h-9"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-4 w-4 text-primary" /> {t("aiplan.btn")}
      </Button>
      {open && (
        <Portal>
          <MonthPlanModal
            initialMonth={month}
            onSaved={onSaved}
            onClose={() => setOpen(false)}
          />
        </Portal>
      )}
    </>
  );
}

function MonthPlanModal({
  initialMonth,
  onSaved,
  onClose,
}: {
  initialMonth: string;
  onSaved?: (month: string) => void;
  onClose: () => void;
}) {
  const s = useDB();
  const { t, lang: uiLang, locale } = useT();

  // month: this month … +11 (starts on the calendar's month when it's in range)
  const months = useMemo(() => plannableMonths(), []);
  const [ym, setYm] = useState(() =>
    months.includes(initialMonth) ? initialMonth : months[0],
  );
  const [year, mon] = ym.split("-").map(Number);
  const monthIdx = months.indexOf(ym);
  const monthName = new Date(year, mon - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  // holidays: the built-in list, or the manager's saved edits for this month (month_holidays)
  const [holidays, setHolidays] = useState<Holiday[]>(() => getHolidaysForMonth(year, mon));
  const [holidaysEdited, setHolidaysEdited] = useState(false);
  const [holidaysDbOk, setHolidaysDbOk] = useState(true);
  const days = holidays.filter((h) => h.kind !== "season");
  useEffect(() => {
    let alive = true;
    setHolidays(getHolidaysForMonth(year, mon));
    setHolidaysEdited(false);
    s.loadMonthHolidays(ym).then(({ items, ok }) => {
      if (!alive) return;
      setHolidaysDbOk(ok);
      if (items) {
        setHolidays(items);
        setHolidaysEdited(true);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);
  const editHolidays = async (next: Holiday[]) => {
    setHolidays(next);
    setHolidaysEdited(true);
    setHolidaysDbOk(await s.saveMonthHolidays(ym, next));
  };
  const resetHolidays = async () => {
    setHolidays(getHolidaysForMonth(year, mon));
    setHolidaysEdited(false);
    await s.resetMonthHolidays(ym);
  };

  const [lang, setLang] = useState<Lang>(uiLang);
  const [counts, setCounts] = useState<PlanCounts>(DEFAULT_COUNTS);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [busyRows, setBusyRows] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Esc closes; the page behind doesn't scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, saving]);

  // rate-limit / overload cooldown countdown
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [waitUntil]);
  const wait = Math.max(0, Math.ceil((waitUntil - now) / 1000));
  const cooling = wait > 0;
  const countdownError =
    error === "aiplan.rateLimit" || error === "aiplan.overloaded";
  const anyBusy = busyAll || busyRows.size > 0 || saving;

  // seconds since "Generate" was pressed (so a slow Gemini doesn't look frozen)
  const [startedAt, setStartedAt] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!busyAll) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busyAll]);
  const elapsed =
    busyAll && startedAt
      ? Math.max(0, Math.floor((tick - startedAt) / 1000))
      : 0;

  const aiTotal = countTotal(counts);
  const unused = s.db.ideas.filter(
    (i) => i.status === "new" || i.status === "seen",
  );
  const ideaText = (id: string | null) =>
    id
      ? s.db.ideas
          .find((i) => i.id === id)
          ?.text.split("\n")
          .find((l) => l.trim())
      : undefined;
  const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale, opts);
  const changeMonth = (dir: -1 | 1) => {
    const next = months[monthIdx + dir];
    if (!next || anyBusy) return;
    if (rows?.length && !confirm(t("aiplan.changeMonthConfirm"))) return;
    setYm(next);
    setRows(null);
    setError("");
  };

  /* ----- AI ----- */
  const fail = (res: { error?: string; retryAfter?: number }) => {
    if (res.retryAfter) {
      setWaitUntil(Date.now() + res.retryAfter * 1000);
      setNow(Date.now());
      setError(
        res.error === "ai.err.overloaded"
          ? "aiplan.overloaded"
          : "aiplan.rateLimit",
      );
    } else setError(res.error ?? "ai.err.bad");
  };

  const generate = async () => {
    setStartedAt(Date.now());
    setTick(Date.now());
    setBusyAll(true);
    setError("");
    const res = await callAI<CalendarResponse>("calendar", {
      year,
      month: mon,
      counts,
      holidays,
      language: lang,
    });
    setBusyAll(false);
    if (res.error || !res.data) return fail(res);
    setRows(res.data.rows.map((r) => ({ ...r, key: nextKey++, on: true })));
  };

  const regenerate = async (row: Row) => {
    setBusyRows((b) => new Set(b).add(row.key));
    setError("");
    const keep = (rows ?? [])
      .filter((r) => r.key !== row.key)
      .map((r) => ({ headline: r.headline, idea_id: r.idea_id }));
    keep.push({ headline: row.headline, idea_id: null }); // don't come back with the same headline
    const res = await callAI<CalendarResponse>("calendar", {
      mode: "single",
      year,
      month: mon,
      language: lang,
      holidays,
      row: { date: row.date, pillar: row.pillar, platform: row.platform },
      keep,
    });
    setBusyRows((b) => {
      const n = new Set(b);
      n.delete(row.key);
      return n;
    });
    const fresh = res.data?.rows[0];
    if (res.error || !fresh) return fail(res);
    setRows(
      (rs) =>
        rs &&
        rs.map((r) =>
          r.key === row.key ? { ...fresh, key: r.key, on: true } : r,
        ),
    );
  };

  const setRow = (key: number, p: Partial<Row>) =>
    setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const chosen = (rows ?? []).filter((r) => r.on && r.headline.trim());
  const allOn = !!rows?.length && rows.every((r) => r.on);

  const save = async () => {
    setSaving(true);
    const aiLines = chosen.map((r) => ({
      date: r.date,
      headline: r.headline.trim(),
      platform: r.platform,
      category: PILLAR_CATEGORY[r.pillar],
      ideaId: r.idea_id,
      graphicHeadline: r.graphic_headline,
      visualIdea: r.visual_idea,
    }));
    const ok = await s.addPlanLines(
      aiLines.sort((a, b) => a.date.localeCompare(b.date)),
    );
    setSaving(false);
    if (ok) {
      onSaved?.(ym);
      onClose();
    } else setError("aiplan.saveFailed");
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/25 backdrop-blur-[3px] sm:items-center sm:p-4"
      onClick={() => !anyBusy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aiplan-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-rise flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[28px] border border-white bg-frame shadow-float sm:max-h-[90vh] sm:rounded-[28px]"
      >
        {/* header */}
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="aiplan-title"
              className="text-xl leading-tight font-medium tracking-tight text-ink sm:text-2xl"
            >
              {t("aiplan.titleShort")}
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {t("aiplan.subShort")}
            </p>
          </div>
          {/* month stepper */}
          <div className="order-last flex w-full items-center justify-between gap-1 rounded-full border border-line bg-white p-1 shadow-raised sm:order-none sm:w-auto">
            <MonthBtn
              label={t("aiplan.prevMonth")}
              disabled={monthIdx <= 0 || anyBusy}
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </MonthBtn>
            <span
              className="min-w-36 px-2 text-center text-sm font-medium text-ink"
              aria-live="polite"
            >
              {monthName}
            </span>
            <MonthBtn
              label={t("aiplan.nextMonth")}
              disabled={monthIdx >= months.length - 1 || anyBusy}
              onClick={() => changeMonth(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </MonthBtn>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-white text-ink-soft shadow-raised transition hover:text-ink"
            aria-label={t("ai.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* body */}
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[360px_1fr] lg:overflow-hidden">
          {/* settings */}
          <aside className="space-y-3 border-line p-4 sm:p-5 lg:overflow-y-auto lg:border-r">
            {/* AI content */}
            <section className="space-y-4 rounded-[20px] border border-white bg-card p-4 shadow-card">
              <div>
                <Label>{t("ai.lang")}</Label>
                <div className="grid grid-cols-3 rounded-full bg-chip/70 p-1">
                  {(
                    [
                      ["my", "မြန်မာ"],
                      ["en", "English"],
                      ["ja", "日本語"],
                    ] as [Lang, string][]
                  ).map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setLang(id)}
                      aria-pressed={lang === id}
                      className={cn(
                        "rounded-full py-1.5 text-xs font-medium transition-all",
                        lang === id
                          ? "bg-white text-ink shadow-raised"
                          : "text-ink-soft hover:text-ink",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="mb-0">{t("aiplan.contentMix")}</Label>
                  <button
                    type="button"
                    onClick={() => setCounts(DEFAULT_COUNTS)}
                    className="inline-flex items-center gap-1 text-[11px] text-ink-mute transition hover:text-primary"
                  >
                    <RotateCcw className="h-3 w-3" /> {t("aiplan.reset")}
                  </button>
                </div>
                {/* stacked bar: AI pillars */}
                <div
                  className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-chip"
                  aria-hidden
                >
                  {PILLARS.map((p) => (
                    <span
                      key={p}
                      className={cn("h-full transition-all", PC(p).bar)}
                      style={{
                        width: `${aiTotal ? (counts[p] / aiTotal) * 100 : 0}%`,
                      }}
                    />
                  ))}
                </div>
                <ul className="divide-y divide-line">
                  {PILLARS.map((p) => (
                    <li key={p} className="flex items-center gap-3 py-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          PC(p).dot,
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink">
                          {t(`aiplan.p.${p}`)}
                        </div>
                        <div className="truncate text-[11px] text-ink-mute">
                          {p === "festival"
                            ? t("aiplan.festivalHint", {
                                n: days.filter((h) => h.wish).length,
                              })
                            : t(`aiplan.d.${p}`)}
                        </div>
                      </div>
                      <Stepper
                        value={counts[p]}
                        min={0}
                        max={Math.min(
                          MAX_PER_PILLAR,
                          counts[p] + MAX_TOTAL - aiTotal,
                        )}
                        label={t(`aiplan.p.${p}`)}
                        onChange={(v) => setCounts({ ...counts, [p]: v })}
                      />
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-ink-soft">
                  {t("aiplan.totals", { n: aiTotal })}
                </p>
              </div>

              <Button
                className="w-full"
                disabled={anyBusy || cooling || aiTotal === 0}
                onClick={generate}
              >
                {busyAll ? (
                  <Spin />
                ) : cooling ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {busyAll
                  ? `${t("aiplan.generating")} ${elapsed}s`
                  : cooling
                    ? t("aiplan.retryIn", { n: wait })
                    : rows
                      ? t("aiplan.regenAll")
                      : t("aiplan.generate", { n: aiTotal })}
              </Button>
            </section>

            {/* context the AI uses */}
            <section className="space-y-3 rounded-[20px] border border-white bg-card p-4 shadow-card">
              <div className="flex items-center gap-2 text-sm">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600">
                  <Lightbulb className="h-3.5 w-3.5" />
                </span>
                <span className="text-ink">
                  {unused.length
                    ? t("aiplan.ideasReady", { n: unused.length })
                    : t("aiplan.ideasNone")}
                </span>
              </div>
              <HolidayEditor
                month={ym}
                holidays={holidays}
                onChange={editHolidays}
                edited={holidaysEdited}
                onReset={resetHolidays}
                notSaved={!holidaysDbOk}
                disabled={anyBusy}
              />
            </section>
          </aside>

          {/* preview */}
          <section className="flex min-h-0 flex-col p-4 sm:p-5 lg:overflow-y-auto">
            {error && (
              <div className="mb-3">
                <Alert
                  tone={countdownError ? "amber" : "rose"}
                  onClose={() => setError("")}
                >
                  ⚠{" "}
                  {countdownError
                    ? cooling
                      ? t(error, { n: wait })
                      : t("aiplan.rateReady")
                    : t(error)}
                </Alert>
              </div>
            )}

            <div className="mb-3 flex flex-wrap items-center gap-2">
              {rows ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={allOn}
                    onChange={(e) =>
                      setRows(
                        (rs) =>
                          rs && rs.map((r) => ({ ...r, on: e.target.checked })),
                      )
                    }
                  />
                  {t("aiplan.preview", { n: rows.length })}
                </label>
              ) : (
                <span className="text-sm font-medium text-ink">
                  {monthName}
                </span>
              )}
              {rows && rows.length < aiTotal && (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">
                  {t("aiplan.short", { n: rows.length, m: aiTotal })}
                </span>
              )}
              <span className="flex-1" />
              {rows &&
                PILLARS.map((p) => {
                  const n = rows.filter((r) => r.on && r.pillar === p).length;
                  return n ? (
                    <span
                      key={p}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
                        PC(p).chip,
                      )}
                    >
                      <span
                        className={cn("h-1.5 w-1.5 rounded-full", PC(p).dot)}
                      />
                      {t(`aiplan.p.${p}`)} {n}
                    </span>
                  ) : null;
                })}
            </div>

            {busyAll && !rows && (
              <div
                className="mb-2.5 flex items-center gap-2 px-1 text-xs text-ink-soft"
                aria-live="polite"
              >
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                {t("aiplan.generating")} {elapsed}s · {t("aiplan.slowHint")}
              </div>
            )}

            <ul
              className={cn(
                "space-y-2.5",
                busyAll && rows && "pointer-events-none opacity-50",
              )}
            >
              {[...(rows ?? [])]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((r) => (
                  <AiItem
                    key={`r${r.key}`}
                    row={r}
                    month={ym}
                    busy={busyRows.has(r.key)}
                    lockRegen={busyAll || saving || cooling}
                    cooling={cooling}
                    wait={wait}
                    idea={ideaText(r.idea_id)}
                    holiday={
                      days.find(
                        (h) => h.date <= r.date && (h.endDate ?? h.date) >= r.date,
                      )?.name[uiLang]
                    }
                    dayLabel={dayLabel}
                    onChange={(p) => setRow(r.key, p)}
                    onRegen={() => regenerate(r)}
                  />
                ))}

              {/* placeholders while generating / before the first run */}
              {busyAll && !rows
                ? Array.from({ length: Math.min(aiTotal, 5) }, (_, i) => (
                    <li
                      key={`sk${i}`}
                      className="flex animate-pulse gap-3 rounded-[20px] border border-white bg-card p-4 shadow-card"
                      style={{ animationDelay: `${i * 120}ms` }}
                    >
                      <span className="h-12 w-12 shrink-0 rounded-2xl bg-chip" />
                      <span className="flex-1 space-y-2 pt-1">
                        <span className="block h-3 w-1/3 rounded-full bg-chip" />
                        <span className="block h-4 w-3/4 rounded-full bg-chip" />
                        <span className="block h-3 w-1/2 rounded-full bg-chip/70" />
                      </span>
                    </li>
                  ))
                : !rows && (
                    <li className="rounded-[20px] border border-dashed border-gray-300 bg-white/50 px-6 py-10 text-center">
                      <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-white text-primary shadow-raised ring-4 ring-primary/10">
                        <Sparkles className="h-5 w-5" />
                      </span>
                      <h3 className="text-sm font-medium text-ink">
                        {t("aiplan.emptyTitle2", { n: aiTotal })}
                      </h3>
                      <p className="mx-auto mt-1 max-w-sm text-xs text-ink-soft">
                        {t("aiplan.empty2")}
                      </p>
                    </li>
                  )}
            </ul>
          </section>
        </div>

        {/* footer */}
        <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-card/80 px-5 py-3 sm:px-6">
          <span className="mr-auto text-xs text-ink-soft">
            {rows
              ? t("aiplan.summary2", {
                  n: chosen.length,
                  ideas: new Set(chosen.map((r) => r.idea_id).filter(Boolean))
                    .size,
                })
              : t("aiplan.footerHint")}
          </span>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            {t("btn.cancel")}
          </Button>
          <Button
            disabled={anyBusy || chosen.length === 0}
            onClick={save}
          >
            {saving ? <Spin /> : <CalendarCheck className="h-4 w-4" />}{" "}
            {saving
              ? t("aiplan.saving")
              : t("aiplan.save", { n: chosen.length })}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/* ---------- preview items ---------- */

type DayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => string;

function DateTile({
  date,
  month,
  disabled,
  onChange,
  dayLabel,
  tone = "gray",
}: {
  date: string;
  month: string;
  disabled?: boolean;
  onChange: (d: string) => void;
  dayLabel: DayLabel;
  tone?: "gray" | "blue";
}) {
  const { t } = useT();
  return (
    <label
      className={cn(
        "relative flex w-14 shrink-0 cursor-pointer flex-col items-center self-start rounded-2xl py-2 ring-1 transition",
        tone === "blue"
          ? "bg-white ring-blue-200 hover:ring-blue-400"
          : "bg-frame ring-line hover:ring-primary/40",
      )}
      title={t("aiplan.col.date")}
    >
      <span className="text-[10px] text-ink-mute uppercase">
        {dayLabel(date, { weekday: "short" })}
      </span>
      <span className="text-xl leading-tight font-medium text-ink">
        {Number(date.slice(8))}
      </span>
      <input
        type="date"
        min={`${month}-01`}
        max={`${month}-31`}
        value={date}
        disabled={disabled}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={t("aiplan.col.date")}
      />
    </label>
  );
}

function AiItem({
  row: r,
  month,
  busy,
  lockRegen,
  cooling,
  wait,
  idea,
  holiday,
  dayLabel,
  onChange,
  onRegen,
}: {
  row: Row;
  month: string;
  busy: boolean;
  lockRegen: boolean;
  cooling: boolean;
  wait: number;
  idea?: string;
  holiday?: string;
  dayLabel: DayLabel;
  onChange: (p: Partial<Row>) => void;
  onRegen: () => void;
}) {
  const { t } = useT();
  return (
    <li
      className={cn(
        "flex gap-3 rounded-[20px] border bg-white p-3 shadow-card transition sm:p-4",
        r.on ? "border-white" : "border-transparent opacity-60",
        busy && "animate-pulse",
      )}
    >
      <DateTile
        date={r.date}
        month={month}
        disabled={busy}
        dayLabel={dayLabel}
        onChange={(date) => onChange({ date })}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="checkbox"
            className="mr-1 h-4 w-4 accent-primary"
            checked={r.on}
            onChange={(e) => onChange({ on: e.target.checked })}
            aria-label={r.headline}
          />
          <PlatformToggle
            value={r.platform}
            disabled={busy}
            onChange={(platform) => onChange({ platform })}
          />
          <span
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
              PC(r.pillar).chip,
            )}
          >
            <span
              className={cn("h-1.5 w-1.5 rounded-full", PC(r.pillar).dot)}
            />
            {t(`aiplan.p.${r.pillar}`)}
            <select
              value={r.pillar}
              disabled={busy}
              onChange={(e) => onChange({ pillar: e.target.value as Pillar })}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={t("aiplan.col.pillar")}
            >
              {PILLARS.map((p) => (
                <option key={p} value={p}>
                  {t(`aiplan.p.${p}`)}
                </option>
              ))}
            </select>
          </span>
          {holiday && (
            <span className="truncate rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">
              {holiday}
            </span>
          )}
        </div>
        <input
          className="-ml-2 w-full rounded-xl border border-transparent bg-transparent px-2 py-1 text-[15px] font-medium text-ink transition outline-none hover:border-line focus:border-primary/50 focus:bg-white focus:ring-4 focus:ring-primary/10"
          value={r.headline}
          disabled={busy}
          onChange={(e) => onChange({ headline: e.target.value })}
          aria-label={t("aiplan.col.headline")}
        />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <input
            className={cn(inputCls, "py-1.5 text-xs")}
            placeholder={t("aiplan.col.graphicPh")}
            value={r.graphic_headline}
            disabled={busy}
            onChange={(e) => onChange({ graphic_headline: e.target.value })}
          />
          <input
            className={cn(inputCls, "py-1.5 text-xs")}
            placeholder={t("aiplan.col.visualPh")}
            value={r.visual_idea}
            disabled={busy}
            onChange={(e) => onChange({ visual_idea: e.target.value })}
          />
        </div>
        {idea && (
          <div className="flex items-center gap-1.5 text-xs text-violet-700">
            <Lightbulb className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {t("aiplan.fromIdea")}: {idea}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRegen}
        disabled={busy || lockRegen}
        title={
          cooling ? t("aiplan.retryIn", { n: wait }) : t("aiplan.regenRow")
        }
        aria-label={t("aiplan.regenRow")}
        className="grid h-9 w-9 shrink-0 place-items-center self-start rounded-full border border-line bg-white text-ink-soft shadow-raised transition hover:text-primary disabled:opacity-40"
      >
        <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
      </button>
    </li>
  );
}

/* ---------- small parts ---------- */

function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mb-1.5 block text-xs font-medium text-ink-soft",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** − [n] + with a typeable number. */
function Stepper({
  value,
  min,
  max,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (v: number) => void;
}) {
  const set = (v: number) =>
    onChange(Math.min(max, Math.max(min, Math.trunc(v) || 0)));
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-white p-0.5 shadow-raised">
      <button
        type="button"
        aria-label={`${label} −`}
        onClick={() => set(value - 1)}
        disabled={value <= min}
        className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition hover:bg-frame hover:text-ink disabled:opacity-35"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => set(Number(e.target.value))}
        className="w-8 bg-transparent text-center text-sm font-medium text-ink tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        aria-label={label}
      />
      <button
        type="button"
        aria-label={`${label} +`}
        onClick={() => set(value + 1)}
        disabled={value >= max}
        className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition hover:bg-frame hover:text-ink disabled:opacity-35"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MonthBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-full text-ink-soft transition hover:bg-frame hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function PlatformToggle({
  value,
  onChange,
  disabled,
}: {
  value: Platform;
  onChange: (p: Platform) => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex rounded-full bg-chip/70 p-0.5">
      {(["facebook", "tiktok"] as Platform[]).map((p) => (
        <button
          type="button"
          key={p}
          disabled={disabled}
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition",
            value === p
              ? "bg-white text-ink shadow-raised"
              : "text-ink-mute hover:text-ink",
          )}
        >
          <PlatformMark platform={p} className="h-3.5 w-3.5 text-[8px]" />
          {p === "facebook" ? "Facebook" : "TikTok"}
        </button>
      ))}
    </span>
  );
}

function Spin() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
  );
}
