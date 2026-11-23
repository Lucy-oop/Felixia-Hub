"use client";

import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Eye, Heart, ImagePlus, MousePointerClick, Printer, Save, Sparkles, Trash, UserPlus, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, Button, Empty, Field, inputCls, PageHeader, Panel, PanelHeader, PlatformMark, Segmented } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import { METRICS, type MetricKey, type Platform, type WeeklyMetric } from "@/lib/types";
import { addDays, can, cn, fmtDate, mondayOf, toISODate } from "@/lib/utils";

type Mode = "week" | "month";
type Pf = "all" | Platform;

const ICON: Record<MetricKey, LucideIcon> = { reach: Eye, engagement: Heart, newFollowers: UserPlus, linkClicks: MousePointerClick };

/** A period is a Monday (week mode) or the 1st of a month (month mode). */
function shift(d: Date, mode: Mode, n: number) {
  return mode === "week" ? addDays(d, 7 * n) : new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function startOf(d: Date, mode: Mode) {
  return mode === "week" ? mondayOf(d) : new Date(d.getFullYear(), d.getMonth(), 1);
}
/** Is a date (yyyy-mm-dd) inside the period that starts at p? */
function inPeriod(iso: string, p: Date, mode: Mode) {
  const from = toISODate(p);
  const to = toISODate(shift(p, mode, 1));
  return iso >= from && iso < to;
}

export default function PerformancePage() {
  const { db, role } = useDB();
  const { t, locale } = useT();
  const [mode, setMode] = useState<Mode>("week");
  const [pf, setPf] = useState<Pf>("all");
  const [metric, setMetric] = useState<MetricKey>("reach");
  // start on the latest week that has numbers (or this week)
  const latest = db.metrics.at(-1)?.weekStart;
  const [cursor, setCursor] = useState(() => (latest ? new Date(latest + "T00:00:00") : new Date()));

  if (!can.seeReports(role)) return <Empty>{t("err.noAccess")}</Empty>;

  const period = startOf(cursor, mode);
  const rows = db.metrics.filter((m) => pf === "all" || m.platform === pf);
  // for months, a week counts in the month where its Monday falls
  const sum = (p: Date, k: MetricKey) => rows.filter((m) => inPeriod(m.weekStart, p, mode)).reduce((a, m) => a + m[k], 0);
  const has = (p: Date) => rows.some((m) => inPeriod(m.weekStart, p, mode));
  const prev = shift(period, mode, -1);
  const n = (v: number) => v.toLocaleString(locale);

  const label = (p: Date) =>
    mode === "week"
      ? `${p.toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${addDays(p, 6).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`
      : p.toLocaleDateString(locale, { month: "long", year: "numeric" });

  const trend = Array.from({ length: mode === "week" ? 8 : 6 }, (_, i) => shift(period, mode, i - (mode === "week" ? 7 : 5)));
  const max = Math.max(1, ...trend.map((p) => sum(p, metric)));

  const inq = db.inquiries.filter((q) => inPeriod(q.date, period, mode) && (pf === "all" || q.platform === pf));
  const inqPrev = db.inquiries.filter((q) => inPeriod(q.date, prev, mode) && (pf === "all" || q.platform === pf));
  const nApp = inq.filter((q) => q.kind === "application").length;
  const byJob = Object.entries(
    inq.reduce<Record<string, { i: number; a: number; h: number }>>((acc, q) => {
      const k = q.jobId ?? "";
      acc[k] ??= { i: 0, a: 0, h: 0 };
      acc[k][q.kind === "application" ? "a" : "i"]++;
      if (q.kind === "application" && (q.stage === "passed" || q.stage === "departed")) acc[k].h++;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1].i + b[1].a - (a[1].i + a[1].a))
    .slice(0, 5);
  const published = db.cards.filter((c) => c.stage === "published" && inPeriod(c.plannedDate, period, mode)).length;

  return (
    <div className="space-y-3">
      <PageHeader title={t("perf.title")} sub={t("perf.sub")}>
        <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {t("perf.print")}
        </Button>
      </PageHeader>

      {/* controls */}
      <div className="animate-rise flex flex-wrap items-center gap-2 print:hidden">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setCursor(startOf(cursor, m));
          }}
          options={[
            { id: "week", label: t("perf.week") },
            { id: "month", label: t("perf.month") },
          ]}
        />
        <div className="flex items-center rounded-full border border-line bg-white shadow-raised">
          <button className="grid h-9 w-9 place-items-center text-ink-soft hover:text-ink" onClick={() => setCursor(shift(period, mode, -1))} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-40 px-1 text-center text-sm font-medium">{label(period)}</span>
          <button className="grid h-9 w-9 place-items-center text-ink-soft hover:text-ink" onClick={() => setCursor(shift(period, mode, 1))} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1" />
        <Segmented
          value={pf}
          onChange={setPf}
          options={[
            { id: "all", label: t("inq.all") },
            { id: "facebook", label: "Facebook" },
            { id: "tiktok", label: "TikTok" },
          ]}
        />
      </div>

      {/* print heading */}
      <div className="hidden print:block">
        <h2 className="text-lg font-medium">
          {t("perf.report")} · {label(period)} · {pf === "all" ? "Facebook + TikTok" : pf === "facebook" ? "Facebook" : "TikTok"}
        </h2>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {METRICS.map((k) => {
          const now = sum(period, k);
          const before = sum(prev, k);
          const diff = before ? Math.round(((now - before) / before) * 100) : null;
          const Icon = ICON[k];
          const active = metric === k;
          return (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={cn(
                "animate-rise rounded-[24px] border p-4 text-left transition-all",
                active ? "border-primary/30 bg-white shadow-raised ring-4 ring-primary/10" : "border-white bg-card shadow-card hover:bg-white",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-soft">{t(`perf.${k}`)}</span>
                <span className={cn("grid h-9 w-9 place-items-center rounded-full", active ? "bg-primary text-white shadow-blue" : "bg-chip/70 text-ink-soft")}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-[28px] leading-none font-medium tracking-tight text-ink">{has(period) ? (k === "newFollowers" && now > 0 ? "+" : "") + n(now) : "—"}</div>
              <div className="mt-2 h-5 text-xs">
                {diff !== null && has(period) && (
                  <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-medium", diff >= 0 ? "bg-green-50 text-green-700" : "bg-rose-50 text-rose-700")}>
                    {diff >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(diff)}% <span className="font-normal opacity-80">{mode === "week" ? t("perf.vsWeek") : t("perf.vsMonth")}</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* trend chart */}
        <Panel className="animate-rise lg:col-span-2">
          <PanelHeader title={`${t(`perf.${metric}`)} · ${mode === "week" ? t("perf.trendWeeks") : t("perf.trendMonths")}`} />
          {trend.every((p) => !has(p)) ? (
            <Empty>{t("perf.noData")}</Empty>
          ) : (
            <div className="flex h-56 items-end gap-2 sm:gap-3">
              {trend.map((p) => {
                const v = sum(p, metric);
                const cur = toISODate(p) === toISODate(period);
                return (
                  <button key={toISODate(p)} onClick={() => setCursor(p)} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${label(p)}: ${n(v)}`}>
                    <span className={cn("text-[11px] tabular-nums", cur ? "font-semibold text-ink" : "text-ink-mute opacity-0 group-hover:opacity-100")}>{n(v)}</span>
                    <span
                      className={cn("w-full max-w-12 rounded-t-xl rounded-b-md transition-all", cur ? "bg-primary shadow-blue" : "bg-primary/25 group-hover:bg-primary/45")}
                      style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
                    />
                    <span className={cn("truncate text-[11px]", cur ? "font-medium text-ink" : "text-ink-mute")}>
                      {mode === "week" ? p.toLocaleDateString(locale, { day: "numeric", month: "numeric" }) : p.toLocaleDateString(locale, { month: "short" })}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        {/* inquiries */}
        <Panel className="animate-rise">
          <PanelHeader title={t("perf.inqTitle")} />
          <div className="grid grid-cols-3 gap-2">
            {[
              [t("inq.kind.inquiry"), inq.length - nApp, "bg-primary-soft/60 text-primary"],
              [t("inq.kind.application"), nApp, "bg-green-50 text-green-700"],
              [t("perf.posts"), published, "bg-chip/60 text-ink"],
            ].map(([l, v, cls]) => (
              <div key={l as string} className={cn("rounded-2xl p-3", cls as string)}>
                <div className="text-2xl font-medium">{v as number}</div>
                <div className="mt-0.5 text-[11px] leading-tight opacity-80">{l as string}</div>
              </div>
            ))}
          </div>
          {inqPrev.length > 0 && (
            <p className="mt-2 text-xs text-ink-mute">
              {mode === "week" ? t("perf.vsWeek") : t("perf.vsMonth")}: {inqPrev.length} → {inq.length}
            </p>
          )}
          <h3 className="mt-4 mb-2 flex items-center justify-between text-sm font-medium">
            {t("perf.topJobs")}
            <span className="flex gap-1 text-[10px] font-normal text-ink-mute">
              <span className="rounded-full bg-primary-soft px-1.5 text-primary">{t("inq.kind.inquiry")}</span>
              <span className="rounded-full bg-green-50 px-1.5 text-green-700">{t("inq.kind.application")}</span>
              <span className="rounded-full bg-ink px-1.5 text-white">{t("app.hired")}</span>
            </span>
          </h3>
          {byJob.length === 0 ? (
            <p className="text-sm text-ink-mute">{t("inq.empty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {byJob.map(([id, c]) => (
                <li key={id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-card">
                  <span className="min-w-0 flex-1 truncate">{db.jobs.find((j) => j.id === id)?.title ?? "—"}</span>
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">{c.i}</span>
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700" title={t("inq.kind.application")}>
                    {c.a}
                  </span>
                  <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-white" title={t("app.hired")}>
                    {c.h}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* screenshots for this period */}
      {(() => {
        const shots = db.shots.filter((x) => inPeriod(x.weekStart, period, mode) && (pf === "all" || x.platform === pf));
        if (!shots.length) return null;
        return (
          <Panel className="animate-rise break-inside-avoid">
            <PanelHeader title={t("shot.title")} count={shots.reduce((a, x) => a + x.imageUrls.length, 0)} />
            <div className="flex flex-wrap gap-2.5">
              {shots.flatMap((x) =>
                x.imageUrls.map((u, i) => (
                  <a key={x.id + i} href={u} target="_blank" rel="noreferrer" className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-40 rounded-xl object-cover ring-1 ring-line transition group-hover:opacity-90 print:h-56" />
                    <span className="absolute top-2 left-2 rounded-full bg-white/90 p-0.5 shadow">
                      <PlatformMark platform={x.platform} />
                    </span>
                  </a>
                )),
              )}
            </div>
          </Panel>
        );
      })()}

      {can.enterMetrics(role) && <EnterNumbers key={db.metrics.length} />}
    </div>
  );
}

/** Manager: type this week's numbers for both platforms. */
function EnterNumbers() {
  const s = useDB();
  const { t, locale } = useT();
  const [week, setWeek] = useState(() => toISODate(mondayOf(addDays(new Date(), -7))));
  const [saved, setSaved] = useState(false);
  const existing = (p: Platform) => s.db.metrics.find((m) => m.weekStart === week && m.platform === p);
  const empty = { reach: 0, engagement: 0, newFollowers: 0, linkClicks: 0 };
  const pick = (m?: WeeklyMetric) => (m ? { reach: m.reach, engagement: m.engagement, newFollowers: m.newFollowers, linkClicks: m.linkClicks } : empty);
  const [vals, setVals] = useState(() => ({ facebook: pick(existing("facebook")), tiktok: pick(existing("tiktok")) }));

  const changeWeek = (iso: string) => {
    const w = toISODate(mondayOf(new Date(iso + "T00:00:00")));
    setWeek(w);
    const f = (p: Platform) => pick(s.db.metrics.find((m) => m.weekStart === w && m.platform === p));
    setVals({ facebook: f("facebook"), tiktok: f("tiktok") });
  };

  return (
    <Panel className="animate-rise print:hidden">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          s.saveMetric(week, "facebook", vals.facebook);
          s.saveMetric(week, "tiktok", vals.tiktok);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }}
      >
        <PanelHeader title={t("shot.enter")}>
          <Button type="submit">
            <Save className="h-4 w-4" /> {saved ? t("perf.saved") : t("perf.save")}
          </Button>
        </PanelHeader>
        <p className="-mt-2 mb-4 text-sm text-ink-soft">{t("shot.enterSub")}</p>
        <div className="mb-4 max-w-xs">
          <Field label={t("perf.weekOf")} hint={fmtDate(week, locale) + " – " + fmtDate(toISODate(addDays(new Date(week + "T00:00:00"), 6)), locale)}>
            <input type="date" className={inputCls} value={week} onChange={(e) => e.target.value && changeWeek(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(["facebook", "tiktok"] as const).map((p) => (
            <div key={p} className="rounded-2xl border border-white bg-white p-4 shadow-card">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <PlatformMark platform={p} className="h-5 w-5 text-[10px]" /> {p === "facebook" ? "Facebook" : "TikTok"}
              </div>
              <ShotBox week={week} platform={p} onRead={(n) => setVals((v) => ({ ...v, [p]: n }))} />
              <div className="grid grid-cols-2 gap-2.5">
                {METRICS.map((k) => (
                  <Field key={k} label={t(`perf.${k}`)}>
                    <input
                      type="number"
                      min={0}
                      className={inputCls}
                      value={vals[p][k] || ""}
                      placeholder="0"
                      onChange={(e) => setVals({ ...vals, [p]: { ...vals[p], [k]: Number(e.target.value) || 0 } })}
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
      </form>
    </Panel>
  );
}

/** Screenshots for one week + platform, and "Read numbers with AI". */
function ShotBox({ week, platform, onRead }: { week: string; platform: Platform; onRead: (n: Pick<WeeklyMetric, MetricKey>) => void }) {
  const s = useDB();
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [busy, setBusy] = useState<"" | "upload" | "read">("");
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const shots = s.db.shots.filter((x) => x.weekStart === week && x.platform === platform);

  const add = (files: FileList | File[] | null) => files && setQueue((q) => [...q, ...Array.from(files).filter((f) => f.type.startsWith("image/"))].slice(0, 8));

  const read = async () => {
    setMsg(null);
    const ids = shots.map((x) => x.id);
    if (queue.length) {
      setBusy("upload");
      const r = await s.addShots(week, platform, queue, setPct);
      if (r.error) {
        setBusy("");
        return setMsg({ ok: false, text: t(r.error) });
      }
      ids.push(r.id);
      setQueue([]);
    }
    if (!ids.length) return setBusy("");
    setBusy("read");
    const r = await s.readMetrics(ids);
    setBusy("");
    if (r.error || !r.numbers) return setMsg({ ok: false, text: t(r.error ?? "err.aiRead") });
    onRead(r.numbers);
    setMsg({ ok: true, text: t("shot.readOk") });
  };

  return (
    <div className="mb-3 space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        onPaste={(e) => add(e.clipboardData.files)}
        tabIndex={0}
        onClick={() => input.current?.click()}
        className={cn(
          "flex cursor-pointer flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed p-2.5 outline-none transition focus:border-primary/50",
          drag ? "border-primary bg-primary-soft/40" : "border-gray-300 bg-frame/60 hover:border-primary/40",
        )}
      >
        {shots.flatMap((x) =>
          x.imageUrls.map((u, i) => (
            <span key={x.id + i} className="relative" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-line" />
              {i === 0 && (
                <button
                  type="button"
                  onClick={() => confirm(t("shot.deleteConfirm")) && s.deleteShot(x.id)}
                  className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white"
                  aria-label="Delete"
                >
                  <Trash className="h-3 w-3" />
                </button>
              )}
            </span>
          )),
        )}
        {queue.map((f, i) => (
          <span key={i} className="grid h-14 w-14 place-items-center rounded-lg bg-primary-soft text-[10px] text-primary ring-1 ring-primary/30">
            {t("shot.new")}
          </span>
        ))}
        <span className="flex items-center gap-1.5 px-1 text-xs text-ink-soft">
          <ImagePlus className="h-4 w-4" /> {t("shot.drop")}
        </span>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      </div>
      <Button type="button" size="sm" variant="secondary" disabled={!!busy || (!queue.length && !shots.length)} onClick={read}>
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {busy === "upload" ? `${t("up.uploading")} ${pct}%` : busy === "read" ? t("shot.reading") : t("shot.read")}
      </Button>
      {msg &&
        (msg.ok ? (
          <p className="text-xs text-green-700">{msg.text}</p>
        ) : (
          <Alert onClose={() => setMsg(null)}>{msg.text}</Alert>
        ))}
    </div>
  );
}
