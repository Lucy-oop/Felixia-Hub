"use client";

import { MonthPlanButton } from "@/components/MonthPlanAI";
import {
  ArrowRight,
  Briefcase,
  Check,
  ChevronLeft,
  CircleCheck,
  ChevronRight,
  PenLine,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import PlacementPicker from "@/components/PlacementPicker";
import ReviewNote from "@/components/ReviewNote";
import { useUI } from "@/components/Shell";
import {
  Button,
  CATEGORY_COLOR,
  CategoryChip,
  Empty,
  Field,
  inputCls,
  Panel,
  pillSelectCls,
  PlacementMark,
  Segmented,
  selectCls,
  Portal,
  STAGE_STYLE,
  StatusPill,
} from "@/components/ui";
import WeekTimeline, { startOfWeek } from "@/components/WeekTimeline";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import {
  CATEGORIES,
  type ContentCard,
  type Placement,
  type Platform,
  type PlanStatus,
} from "@/lib/types";
import {
  addDays,
  can,
  cn,
  isOpenSlot,
  isTikTokVideo,
  jobLineTitle,
  placementsOf,
  planLocked,
  platformsOf,
  salaryText,
  toISODate,
  waitingPlanMonths,
} from "@/lib/utils";

const STATUS_DOT: Record<PlanStatus, string> = {
  draft: STAGE_STYLE.idea.dot,
  sent: STAGE_STYLE.draft.dot,
  approved: STAGE_STYLE.approved.dot,
  changes: STAGE_STYLE.review.dot,
};
const PLAN_STATUSES: PlanStatus[] = ["draft", "sent", "approved", "changes"];
const monthKey = (d: Date) => toISODate(d).slice(0, 7);
type View = "timeline" | "month" | "table";
type EditReq = { id?: string; date?: string; init?: Partial<ContentCard> };
/** Manager: open the text-only line popup (existing line by id, or a new line on a date). */
const EditCtx = createContext<(e: EditReq) => void>(() => {});
type ReviewReq = { id: string; comment?: boolean };
/** Client: open the review popup for a line (optionally straight on the comment box). */
const ReviewCtx = createContext<(r: ReviewReq) => void>(() => {});
/** Page toast (ink pill at the bottom) — short "done" feedback after a decision. */
const ToastCtx = createContext<(msg: string) => void>(() => {});

/** Content Calendar (the monthly plan the client approves) — Timeline · Month · Table, like the original calendar. */
export default function PlanPage() {
  const s = useDB();
  const { db, role } = s;
  const { t, locale } = useT();
  const manager = can.editCards(role);
  const [view, setView] = useState<View>("table");
  const [cursor, setCursor] = useState(() => new Date());
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [reviewing, setReviewing] = useState<ReviewReq | null>(null);
  const [editing, setEditing] = useState<EditReq | null>(null);
  const [notified, setNotified] = useState("");
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  // Which month to show: ?month=yyyy-mm (bell, Telegram links) wins; otherwise, if today's month has nothing
  // waiting but another month does, open that month — so "15 lines to check" never lands on an empty calendar.
  const waitingMonths = waitingPlanMonths(db.cards, role);
  const firstWaiting = waitingMonths[0] ?? "";
  useEffect(() => {
    const goTo = (m: string) => /^\d{4}-\d{2}$/.test(m) && setCursor(new Date(`${m}-01T00:00:00`));
    const fromUrl = new URLSearchParams(window.location.search).get("month");
    if (fromUrl) {
      goTo(fromUrl);
      const url = new URL(window.location.href);
      url.searchParams.delete("month");
      window.history.replaceState(null, "", url.pathname + url.search);
    } else if (firstWaiting && !waitingMonths.includes(monthKey(new Date()))) goTo(firstWaiting);
    // clicking the bell while already on this page
    const onMonth = (e: Event) => goTo((e as CustomEvent<string>).detail);
    window.addEventListener("felixia:plan-month", onMonth);
    return () => window.removeEventListener("felixia:plan-month", onMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstWaiting]);

  // Hiring page → "Add to calendar" links here with ?job=<id>: open the line popup prefilled from the job
  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("job");
    if (!jobId || !manager) return;
    window.history.replaceState(null, "", "/plan");
    const j = db.jobs.find((x) => x.id === jobId);
    if (!j) return;
    const notes = [
      salaryText(j),
      j.positions ? `${t("job.positions")}: ${j.positions}` : "",
      j.visaType,
    ]
      .filter(Boolean)
      .join(" · ");
    setEditing({
      init: {
        jobId: j.id,
        category: "Hiring",
        title: [j.title, j.location].filter(Boolean).join(" — "),
        notes,
        plan: { status: "draft" },
      },
    });
  }, [manager, db.jobs, t]);

  const month = monthKey(cursor);
  const monthName = cursor.toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  // the client only sees lines that were sent to her
  const all = db.cards
    .filter((c) => manager || c.plan.status !== "draft")
    .filter(
      (c) =>
        (!platform || platformsOf(c).includes(platform as Platform)) &&
        (!category || c.category === category) &&
        (!status || viewStatus(c, manager) === status),
    )
    .sort((a, b) =>
      (a.plannedDate + a.plannedTime).localeCompare(
        b.plannedDate + b.plannedTime,
      ),
    );
  const contentLines = all.filter((c) => !isTikTokVideo(c));
  const videoLines = all.filter(isTikTokVideo);
  const videoCount = videoLines.filter((c) => c.plannedDate.startsWith(month)).length;
  const monthLines = db.cards.filter(
    (c) =>
      c.plannedDate.startsWith(month) && (manager || c.plan.status !== "draft"),
  );
  const drafts = monthLines.filter((c) => c.plan.status === "draft").length;
  const waiting = monthLines.filter((c) => c.plan.status === "sent").length;
  const toFix = manager
    ? db.cards
        .filter((c) => c.plan.status === "changes" && !planLocked(c))
        .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
    : [];

  if (!can.seeReports(role)) return <Empty>{t("err.noAccess")}</Empty>;

  const shift = (n: number) => {
    const d = new Date(cursor);
    if (view === "timeline") d.setDate(d.getDate() + 14 * n);
    else d.setMonth(d.getMonth() + n, 1);
    setCursor(d);
  };
  const tlStart = startOfWeek(cursor);
  const title =
    view === "timeline"
      ? `${tlStart.toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${addDays(tlStart, 13).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`
      : monthName;
  const open = (id: string) =>
    manager ? setEditing({ id }) : setReviewing({ id });
  const todayIso = toISODate(new Date());
  const editCard = editing?.id
    ? db.cards.find((c) => c.id === editing.id)
    : undefined;
  const reviewCard = reviewing
    ? db.cards.find((c) => c.id === reviewing.id)
    : null;
  // status chips: counts for this month (ignoring the status filter itself)
  const chipLines = monthLines.filter(
    (c) =>
      (!platform || platformsOf(c).includes(platform as Platform)) &&
      (!category || c.category === category),
  );
  const chips = (
    [
      ["", chipLines.length],
      ...PLAN_STATUSES.filter((st) => manager || st !== "changes").map((st) => [
        st,
        chipLines.filter((c) => viewStatus(c, manager) === st).length,
      ]),
    ] as [string, number][]
  ).filter(([st, n]) => st === "" || n > 0 || st === status);

  const views = (lines: ContentCard[]) => (
    <>
              {view === "timeline" && (
                <WeekTimeline
                  start={tlStart}
                  days={14}
                  cards={lines}
                  canDrag={manager}
                  onMove={s.setDate}
                  onOpen={open}
                  look={manager ? planLook : clientLook}
                  badge={() => null}
                />
              )}

              {view === "month" && (
                <PlanMonth
                  cursor={cursor}
                  cards={lines}
                  manager={manager}
                  onOpen={open}
                />
              )}

              {view === "table" && (
                <PlanTable
                  month={month}
                  lines={lines.filter((c) => c.plannedDate.startsWith(month))}
                  manager={manager}
                />
              )}
    </>
  );

  return (
    <EditCtx.Provider value={setEditing}>
      <ReviewCtx.Provider value={setReviewing}>
        <ToastCtx.Provider value={showToast}>
          <div className="space-y-3 pb-24">
            <Panel className="animate-rise">
              {/* header — like the original calendar */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-[28px] leading-tight font-medium tracking-tight">
                    {t("plan.title")}
                  </h1>
                  <p className="mt-0.5 max-w-2xl text-sm text-ink-soft">
                    {manager ? t("plan.subManager") : t("plan.subClient")}
                  </p>
                </div>
                <Segmented
                  value={view}
                  onChange={setView}
                  options={[
                    { id: "timeline", label: t("cal.timeline") },
                    { id: "month", label: t("cal.month") },
                    { id: "table", label: t("cal.table") },
                  ]}
                />
              </div>

              {/* toolbar */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-full border border-line bg-white shadow-raised">
                  <button
                    className="grid h-9 w-9 place-items-center text-ink-soft hover:text-ink"
                    onClick={() => shift(-1)}
                    aria-label="Previous"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-1 text-sm font-medium">{title}</span>
                  <button
                    className="grid h-9 w-9 place-items-center text-ink-soft hover:text-ink"
                    onClick={() => shift(1)}
                    aria-label="Next"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9"
                  onClick={() => setCursor(new Date())}
                >
                  {t("cal.today")}
                </Button>
                <div className="flex-1" />
                <select
                  className={pillSelectCls}
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  <option value="">{t("filter.allPlatforms")}</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                </select>
                <select
                  className={pillSelectCls}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">{t("filter.allTypes")}</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`cat.${c}`)}
                    </option>
                  ))}
                </select>
                {manager && (
                  <MonthPlanButton
                    month={month}
                    onSaved={(ym) => setCursor(new Date(`${ym}-01T00:00:00`))}
                  />
                )}
                {manager && (
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={() =>
                      setEditing({
                        date: todayIso.startsWith(month)
                          ? todayIso
                          : `${month}-01`,
                      })
                    }
                  >
                    <Plus className="h-4 w-4" /> {t("plan.addLine")}
                  </Button>
                )}
              </div>

              {/* lines waiting in other months (so an empty month never hides them) */}
              {waitingMonths.filter((m) => m !== month).length > 0 && (
                <div className="animate-rise mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-yellow-50 px-3 py-2 text-sm text-yellow-900 ring-1 ring-yellow-200">
                  <span className="h-2 w-2 rounded-full bg-yellow-400" />
                  <span className="flex-1">{t(manager ? "plan.otherMonthsFix" : "plan.otherMonthsWaiting")}</span>
                  {waitingMonths
                    .filter((m) => m !== month)
                    .map((m) => {
                      const n = db.cards.filter((c) => c.plannedDate.startsWith(m) && c.plan.status === (manager ? "changes" : "sent")).length;
                      return (
                        <Button key={m} size="sm" variant="secondary" onClick={() => setCursor(new Date(`${m}-01T00:00:00`))}>
                          {new Date(`${m}-01T00:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" })} · {n}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      );
                    })}
                </div>
              )}

              {/* manager: lines the client asked to fix */}
              {manager && toFix.length > 0 && (
                <div className="animate-rise mb-4 rounded-2xl bg-white p-3 shadow-card ring-1 ring-line">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full",
                        STAGE_STYLE.review.bar,
                      )}
                    >
                      <PenLine className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm font-medium text-ink">
                      {t("plan.needsFix", { n: toFix.length })}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {toFix.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-start gap-3 rounded-xl bg-yellow-50/70 px-3 py-2 ring-1 ring-yellow-200"
                      >
                        <span className="w-16 shrink-0 pt-0.5 text-xs text-ink-soft">
                          {new Date(
                            c.plannedDate + "T00:00:00",
                          ).toLocaleDateString(locale, {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">
                            {c.title}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-ink-soft">
                            “{clientComment(c)}”
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditing({ id: c.id })}
                        >
                          <PenLine className="h-3.5 w-3.5" /> {t("plan.fix")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* status summary — tap to filter (replaces the old legend) */}
              <div
                role="tablist"
                aria-label={t("col.status")}
                className="mb-4 flex flex-wrap items-center gap-1.5"
              >
                {chips.map(([st, n]) => {
                  const on = status === st;
                  return (
                    <button
                      key={st || "all"}
                      role="tab"
                      aria-selected={on}
                      onClick={() => setStatus(on && st ? "" : st)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition",
                        on
                          ? "bg-white text-ink shadow-raised ring-1 ring-line"
                          : "text-ink-soft hover:bg-white/70 hover:text-ink",
                      )}
                    >
                      {st && (
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            STATUS_DOT[st as PlanStatus],
                          )}
                        />
                      )}
                      {st ? t(`plan.status.${st}`) : t("plan.filterAll")}
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] tabular-nums",
                          on ? "bg-frame text-ink" : "bg-chip/70 text-ink-mute",
                        )}
                      >
                        {n}
                      </span>
                    </button>
                  );
                })}
              </div>

              {views(contentLines)}
            </Panel>

            {/* TikTok Video Calendar — TikTok-only lines; new lines here default to TikTok */}
            <EditCtx.Provider
              value={(e) =>
                setEditing(
                  e.id
                    ? e
                    : { ...e, init: { ...e.init, placements: ["tiktok"] } },
                )
              }
            >
              <Panel className="animate-rise">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-xl font-medium tracking-tight">
                    <PlacementMark placement="tiktok" className="h-5 w-5" />
                    {t("plan.tiktokTitle")}
                    <span className="rounded-full bg-chip/70 px-2 text-xs font-medium tabular-nums text-ink-mute">
                      {videoCount}
                    </span>
                  </h2>
                  {manager && (
                    <Button
                      size="sm"
                      className="h-9"
                      onClick={() =>
                        setEditing({
                          date: todayIso.startsWith(month)
                            ? todayIso
                            : `${month}-01`,
                          init: { placements: ["tiktok"] },
                        })
                      }
                    >
                      <Plus className="h-4 w-4" /> {t("plan.addVideo")}
                    </Button>
                  )}
                </div>
                {videoCount === 0 && view !== "month" ? (
                  <Empty>{t("plan.noVideos")}</Empty>
                ) : (
                  views(videoLines)
                )}
              </Panel>
            </EditCtx.Provider>

            {/* one bottom action bar — same look for both roles */}
            {(manager ? drafts > 0 || waiting > 0 : waiting > 0) && (
              <div className="frost sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-[22px] p-2.5 pl-4 shadow-float ring-1 ring-line">
                <span className="flex flex-1 items-center gap-2 text-sm text-ink">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      manager && drafts > 0
                        ? STATUS_DOT.draft
                        : STATUS_DOT.sent,
                    )}
                  />
                  {manager && drafts > 0
                    ? t("plan.draftCount", { n: drafts })
                    : manager
                      ? t("plan.waitingClient", { n: waiting })
                      : t("plan.waitingCount", { n: waiting })}
                </span>
                {manager && drafts > 0 && (
                  <Button
                    className="h-10 px-5"
                    onClick={() =>
                      confirm(
                        t("plan.sendConfirm", { n: drafts, month: monthName }),
                      ) && s.sendPlan(month)
                    }
                  >
                    <Send className="h-4 w-4" />{" "}
                    {t("plan.send", { month: monthName, n: drafts })}
                  </Button>
                )}
                {manager && drafts === 0 && (
                  <Button
                    variant="secondary"
                    className="h-10 px-5"
                    disabled={notified === month}
                    onClick={() => {
                      s.notifyPlan(month);
                      setNotified(month);
                      showToast(t("plan.notified"));
                    }}
                  >
                    <Send className="h-4 w-4" />{" "}
                    {notified === month
                      ? t("plan.notified")
                      : t("plan.notifyShort")}
                  </Button>
                )}
                {!manager && (
                  <Button
                    className="h-10 px-5"
                    onClick={() =>
                      confirm(t("plan.approveAllConfirm", { n: waiting })) &&
                      s.approveAllSent(month)
                    }
                  >
                    <Check className="h-4 w-4" />{" "}
                    {t("plan.approveAllNow", { n: waiting })}
                  </Button>
                )}
              </div>
            )}

            {/* toast */}
            {toast && (
              <div
                role="status"
                className="animate-rise fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-float"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-green-400" /> {toast}
                </span>
              </div>
            )}

            {/* client: one line in a popup (same frame as the manager's) */}
            {!manager && reviewCard && reviewing && (
              <Portal>
                <ClientLineDialog
                  key={reviewCard.id}
                  card={reviewCard}
                  startWithComment={reviewing.comment}
                  onClose={() => setReviewing(null)}
                />
              </Portal>
            )}

            {/* manager: add / edit one line (text only) */}
            {manager && editing && (editing.id ? editCard : true) && (
              <Portal>
                <PlanLineDialog
                  key={editing.id ?? editing.date ?? editing.init?.jobId}
                  card={editCard}
                  init={editing.init}
                  date={
                    editing.date ??
                    (todayIso.startsWith(month) ? todayIso : `${month}-01`)
                  }
                  onClose={() => setEditing(null)}
                  onSent={() => showToast(t("plan.sentToClient"))}
                />
              </Portal>
            )}
          </div>
        </ToastCtx.Provider>
      </ReviewCtx.Provider>
    </EditCtx.Provider>
  );
}

/** Month grid — the original calendar look, with plan-status dots. */
function PlanMonth({
  cursor,
  cards,
  manager,
  onOpen,
}: {
  cursor: Date;
  cards: ContentCard[];
  manager: boolean;
  onOpen: (id: string) => void;
}) {
  const s = useDB();
  const { t, locale } = useT();
  const edit = useContext(EditCtx);
  const [over, setOver] = useState("");
  const today = toISODate(new Date());
  const start = startOfWeek(
    new Date(cursor.getFullYear(), cursor.getMonth(), 1),
  );
  let days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  if (days[35].getMonth() !== cursor.getMonth()) days = days.slice(0, 35);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfWeek(new Date()), i).toLocaleDateString(locale, {
      weekday: "short",
    }),
  );

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="min-w-190">
        <div className="mb-1.5 grid grid-cols-7 gap-1.5">
          {weekdays.map((d, i) => (
            <div
              key={d}
              className={cn(
                "rounded-xl py-1.5 text-center text-[11px]",
                i >= 5
                  ? "bg-chip text-ink-soft"
                  : "bg-white text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line)]",
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const iso = toISODate(d);
            const list = cards.filter((c) => c.plannedDate === iso);
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={iso}
                onDragOver={(e) => {
                  if (!manager) return;
                  e.preventDefault();
                  setOver(iso);
                }}
                onDragLeave={() => setOver("")}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver("");
                  const id = e.dataTransfer.getData("text/card");
                  if (id) s.setDate(id, iso);
                }}
                className={cn(
                  "group min-h-28 rounded-xl p-1.5 transition",
                  weekend
                    ? "stripes"
                    : "bg-white/80 shadow-[inset_0_0_0_1px_rgba(233,235,239,0.9)]",
                  d.getMonth() !== cursor.getMonth() && "opacity-40",
                  iso === today && "ring-2 ring-primary",
                  over === iso && "ring-2 ring-primary/60",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-full text-xs",
                      iso === today
                        ? "bg-primary font-medium text-white"
                        : "text-ink-soft",
                    )}
                  >
                    {d.getDate()}
                  </span>
                  {manager && (
                    <button
                      onClick={() => edit({ date: iso })}
                      className="grid h-6 w-6 place-items-center rounded-full text-ink-mute opacity-0 transition group-hover:opacity-100 hover:bg-primary-soft hover:text-primary"
                      aria-label={t("plan.add")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {list.map((c) => {
                    const L = PLAN_LOOK[viewStatus(c, manager)];
                    return (
                      <button
                        key={c.id}
                        draggable={manager}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/card", c.id)
                        }
                        onClick={() => onOpen(c.id)}
                        title={`${c.title} — ${t(`plan.st.${c.plan.status}`)}`}
                        className={cn(
                          "flex w-full items-center gap-1 truncate rounded-lg px-1.5 py-1 text-left text-[11px] font-medium transition hover:brightness-105",
                          L.bar,
                          manager && "cursor-grab",
                        )}
                      >
                        <span className="flex shrink-0 -space-x-1">
                          {placementsOf(c).map((p) => (
                            <PlacementMark
                              key={p}
                              placement={p}
                              className="h-3.5 w-3.5 text-[8px] ring-1 ring-white"
                            />
                          ))}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {c.plannedTime} {c.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Table view: manager clicks a line to edit its text; client approves line by line. */
function PlanTable({
  month,
  lines,
  manager,
}: {
  month: string;
  lines: ContentCard[];
  manager: boolean;
}) {
  const { t, locale } = useT();
  const days: string[] = [];
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    if (lines.some((c) => c.plannedDate === iso)) days.push(iso);
  }
  if (!days.length) return <Empty>{t("plan.emptyClient")}</Empty>;

  return (
    <div>
      {/* content-type mix (slim) */}
      {lines.length > 0 && (
        <div className="mb-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-chip">
            {CATEGORIES.map((c) => {
              const n = lines.filter((x) => x.category === c).length;
              return n ? (
                <span
                  key={c}
                  className={CATEGORY_COLOR[c].bar}
                  style={{ width: `${(n / lines.length) * 100}%` }}
                  title={`${t(`cat.${c}`)} ${n}`}
                />
              ) : null;
            })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {CATEGORIES.map((c) => {
              const n = lines.filter((x) => x.category === c).length;
              return n ? (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 text-xs text-ink-soft"
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      CATEGORY_COLOR[c].dot,
                    )}
                  />{" "}
                  {t(`cat.${c}`)} <b className="font-medium text-ink">{n}</b>
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-230 border-separate border-spacing-0 overflow-hidden rounded-2xl bg-white text-sm shadow-card">
          <thead>
            <tr className="bg-frame text-left text-xs text-ink-soft">
              <th className="w-28 px-4 py-2.5 font-medium">
                {t("plan.col.date")}
              </th>
              <th className="px-3 py-2.5 font-medium">{t("col.title")}</th>
              <th className="w-40 px-3 py-2.5 font-medium">{t("col.type")}</th>
              <th className="w-28 px-3 py-2.5 font-medium">
                {t("col.platform")}
              </th>
              <th className="px-3 py-2.5 font-medium">{t("col.notes")}</th>
              <th className="w-64 px-3 py-2.5 font-medium">
                {t("col.status")}
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((iso) => {
              const list = lines.filter((c) => c.plannedDate === iso);
              const d = new Date(iso + "T00:00:00");
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              const isToday = iso === toISODate(new Date());
              const dateCell = (rows: number) => (
                <td
                  rowSpan={rows}
                  className={cn(
                    "border-t border-line px-4 py-2.5 align-top",
                    weekend && "bg-frame/70",
                  )}
                >
                  <div
                    className={cn(
                      "text-sm font-medium",
                      isToday ? "text-primary" : "text-ink",
                    )}
                  >
                    {d.toLocaleDateString(locale, {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                  <div className="text-xs text-ink-mute">
                    {d.toLocaleDateString(locale, { weekday: "short" })}
                  </div>
                </td>
              );
              if (!list.length)
                return (
                  <tr key={iso}>
                    {dateCell(1)}
                    <td
                      colSpan={5}
                      className={cn(
                        "border-t border-line px-3 py-2.5",
                        weekend && "stripes",
                      )}
                    />
                  </tr>
                );
              return list.map((c, i) => (
                <PlanRow
                  key={c.id}
                  card={c}
                  manager={manager}
                  dateCell={i === 0 ? dateCell(list.length) : null}
                />
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The client's comment on a line (her own note, or the older "need to edit" note). */
function clientComment(card: ContentCard) {
  return (
    card.clientNote ||
    (card.plan.status === "changes" ? (card.plan.note ?? "") : "")
  );
}

/** What a viewer sees: for the client, a line she asked to edit is back with the admin → "Draft". */
const viewStatus = (c: ContentCard, manager: boolean): PlanStatus =>
  !manager && c.plan.status === "changes" ? "draft" : c.plan.status;

/** Sent back after a fix: still waiting, but "fixed". */
const isUpdated = (c: ContentCard) => c.plan.status === "sent" && !!c.plan.note;

/** Design-system status pill (white pill + colored dot), same for manager and client. */
function PlanStatusPill({ status }: { status: PlanStatus }) {
  const { t } = useT();
  return (
    <StatusPill
      color={STATUS_DOT[status]}
      className="px-2 py-1 text-[11px] ring-1 ring-line"
    >
      {t(`plan.status.${status}`)}
    </StatusPill>
  );
}

/** Where this headline is in its short journey: Sent → Edit asked → Fixed → Approved. Written from the viewer's side. */
function HeadlineSteps({
  card,
  manager,
}: {
  card: ContentCard;
  manager: boolean;
}) {
  const { t } = useT();
  const st = card.plan.status;
  if (st === "draft") return null;
  const waitKey = manager ? "plan.step.waitClient" : "plan.step.waitYou";
  const steps: { key: string; on: boolean; dot: string }[] =
    st === "approved"
      ? [{ key: "plan.step.approved", on: true, dot: STATUS_DOT.approved }]
      : st === "changes"
        ? [
            { key: "plan.step.sent", on: false, dot: "bg-ink-mute" },
            {
              key: "plan.step.editAsked",
              on: manager,
              dot: STATUS_DOT.changes,
            },
            {
              key: manager ? "plan.step.yourFix" : "plan.step.adminFixing",
              on: !manager,
              dot: "bg-gray-400",
            },
          ]
        : isUpdated(card)
          ? [
              { key: "plan.step.editAsked", on: false, dot: "bg-ink-mute" },
              { key: "plan.step.fixed", on: true, dot: STATUS_DOT.sent },
              { key: waitKey, on: false, dot: "bg-ink-mute" },
            ]
          : [
              { key: "plan.step.sent", on: true, dot: STATUS_DOT.sent },
              { key: waitKey, on: false, dot: "bg-ink-mute" },
            ];
  return (
    <div className="flex flex-wrap items-center gap-1 px-1.5 pt-0.5 text-[11px]">
      {steps.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-ink-mute/70" />}
          <span
            className={cn("h-1.5 w-1.5 rounded-full", s.on ? s.dot : "bg-chip")}
          />
          <span className={s.on ? "font-medium text-ink" : "text-ink-mute"}>
            {t(s.key)}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * One line of the table — the SAME row for manager and client.
 * Only the Status cell differs: manager sees the pill (+ Make post); client gets Approve / Edit.
 */
function PlanRow({
  card,
  dateCell,
  manager,
}: {
  card: ContentCard;
  dateCell: React.ReactNode;
  manager: boolean;
}) {
  const s = useDB();
  const { t } = useT();
  const { openCard } = useUI();
  const edit = useContext(EditCtx);
  const review = useContext(ReviewCtx);
  const st = card.plan.status;
  const comment = clientComment(card);
  const cell = cn(
    "border-t border-line px-3 py-2.5 align-top transition-colors duration-300 group-hover:bg-frame/60",
    manager && st === "changes" && "bg-yellow-50/70",
    !manager && st === "sent" && "bg-primary-soft/25",
  );

  return (
    <tr
      onClick={() =>
        manager ? edit({ id: card.id }) : review({ id: card.id })
      }
      className="group cursor-pointer"
      title={t(manager ? "plan.editLine" : "plan.openLine")}
    >
      {dateCell}
      <td
        className={cn(
          cell,
          !manager &&
            st === "sent" &&
            "shadow-[inset_3px_0_0_var(--color-primary)]",
        )}
      >
        <div className="px-1.5 pt-1 font-medium text-ink transition-colors group-hover:text-primary">
          {card.title}
        </div>
        {manager && isOpenSlot(card) && <SlotAttach card={card} />}
        <HeadlineSteps card={card} manager={manager} />
      </td>
      <td className={cell}>
        <div className="pt-1">
          <CategoryChip category={card.category} />
        </div>
      </td>
      <td className={cell}>
        <div className="flex flex-wrap gap-1 pt-1">
          {placementsOf(card).map((p) => (
            <span key={p} title={t(`pl.${p}`)}>
              <PlacementMark placement={p} className="h-5 w-5" />
            </span>
          ))}
        </div>
      </td>
      <td className={cell}>
        {card.notes && (
          <div className="px-1.5 py-1 whitespace-pre-wrap text-ink-soft">
            {card.notes}
          </div>
        )}
        {comment && (
          <CommentView
            label={t(manager ? "plan.clientComment" : "plan.yourComment")}
            text={comment}
            warn={st === "changes"}
          />
        )}
      </td>
      <td className={cell}>
        {manager ? (
          <div className="flex flex-col items-start gap-1.5 pt-0.5">
            <PlanStatusPill status={st} />
            {st === "approved" && card.stage === "idea" && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  s.startPostFromLine(card.id);
                  openCard(card.id);
                }}
              >
                <Sparkles className="h-3.5 w-3.5" /> {t("plan.makePost")}
              </Button>
            )}
            {card.stage !== "idea" && (
              <span className="text-[11px] text-ink-mute">
                {t("ideas.openPost")} · {t(`stage.${card.stage}`)}
              </span>
            )}
          </div>
        ) : (
          <div onClick={(e) => e.stopPropagation()} className="cursor-default">
            <ClientDecision card={card} />
          </div>
        )}
      </td>
    </tr>
  );
}

/** Client still has to decide: two real buttons — green Approve (primary choice) and white Ask for edit. */
function DecisionButtons({
  onApprove,
  onEdit,
  editing,
  disabled,
  size = "sm",
  onUndo,
}: {
  onApprove: () => void;
  onEdit: () => void;
  editing?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  onUndo?: () => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="success"
          size={size}
          disabled={disabled}
          onClick={onApprove}
        >
          <Check className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />{" "}
          {t("plan.approve")}
        </Button>
        <Button
          variant="secondary"
          size={size}
          disabled={disabled}
          onClick={onEdit}
          aria-pressed={editing}
          className={cn(editing && "ring-2 ring-yellow-300")}
        >
          <PenLine className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />{" "}
          {t("plan.askEdit")}
        </Button>
      </div>
      {onUndo && (
        <button
          onClick={onUndo}
          className="px-1 text-[11px] text-ink-mute hover:text-primary hover:underline"
        >
          {t("cf.cancel")}
        </button>
      )}
    </div>
  );
}

/** Client already decided: one clear result chip in the stage colours (+ when, + what she can do next). */
function DecisionResult({
  card,
  onChange,
  size = "sm",
}: {
  card: ContentCard;
  onChange?: () => void;
  size?: "sm" | "md";
}) {
  const { t, locale } = useT();
  const locked = planLocked(card);
  const approved = card.plan.status === "approved" || locked;
  const S = approved ? STAGE_STYLE.approved : STAGE_STYLE.review;
  const Icon = approved ? CircleCheck : PenLine;
  const when = card.plan.at
    ? new Date(card.plan.at).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
      })
    : "";
  const link = "text-ink-mute hover:text-primary hover:underline";
  return (
    <div className="space-y-1">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-medium",
          S.chip,
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        )}
      >
        <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />{" "}
        {t(approved ? "plan.status.approved" : "plan.status.changes")}
      </span>
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-1 px-1 text-ink-mute",
          size === "sm" ? "text-[11px]" : "text-xs",
        )}
      >
        {when && <span>{when}</span>}
        {locked ? (
          <Link href="/confirm" className={cn("block", link)}>
            {when && "· "}
            {t("plan.locked")}
          </Link>
        ) : (
          onChange && (
            <button
              onClick={onChange}
              className={cn(link, approved ? "" : "font-medium text-green-700")}
            >
              {when && "· "}
              {t(approved ? "plan.change" : "plan.approveInstead")}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/** Note card used when the client asks for an edit (design-system card + primary Save). */
function EditNoteCard({
  value,
  onChange,
  onSave,
  onCancel,
  error,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  error?: string;
  busy?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="animate-rise space-y-2 rounded-2xl bg-white p-2.5 shadow-card ring-1 ring-line">
      <span className="flex items-center gap-1.5 px-0.5 text-xs font-medium text-ink">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />{" "}
        {t("plan.whatChange")}
      </span>
      <textarea
        autoFocus
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("plan.commentPh")}
        className={cn(inputCls, "resize-y py-2 leading-relaxed")}
      />
      <div className="flex items-center gap-1.5">
        <Button size="sm" disabled={!value.trim() || busy} onClick={onSave}>
          <Send className="h-3.5 w-3.5" /> {t("plan.sendToAdmin")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("cf.cancel")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="px-0.5 text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Client: buttons only while she still has to decide; afterwards one result chip (Approved / Edit asked). */
function ClientDecision({ card }: { card: ContentCard }) {
  const s = useDB();
  const { t } = useT();
  const toast = useContext(ToastCtx);
  const st = card.plan.status;
  const locked = planLocked(card);
  const [reopened, setReopened] = useState(false);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const choosing = !locked && (st === "sent" || reopened);

  const send = async (decision: "approved" | "changes", text: string) => {
    setBusy(true);
    setError("");
    const failed = await s.decidePlan(card.id, decision, text);
    setBusy(false);
    if (failed) {
      setError(
        failed === "err.schema"
          ? t("err.schemaClient")
          : `${t("plan.sendFailed")} (${failed})`,
      );
      return false;
    }
    setReopened(false);
    setWriting(false);
    toast(
      t(decision === "approved" ? "plan.msg.approved" : "plan.msg.sentEdit"),
    );
    return true;
  };

  return (
    <div className="space-y-2">
      {choosing ? (
        <DecisionButtons
          disabled={busy}
          editing={writing}
          onApprove={() => send("approved", "")}
          onEdit={() => {
            setNote(st === "changes" ? card.clientNote : "");
            setError("");
            setWriting(!writing);
          }}
          onUndo={
            reopened ? () => (setReopened(false), setWriting(false)) : undefined
          }
        />
      ) : (
        <DecisionResult
          card={card}
          onChange={
            st === "changes"
              ? () => void send("approved", "") // "Approve instead"
              : () => setReopened(true)
          }
        />
      )}
      {writing && choosing && (
        <EditNoteCard
          value={note}
          onChange={setNote}
          busy={busy}
          error={error}
          onCancel={() => setWriting(false)}
          onSave={() => void send("changes", note.trim())}
        />
      )}
      {!writing && error && (
        <p role="alert" className="px-1 text-[11px] text-rose-600">
          {error}
        </p>
      )}
      {!writing && isUpdated(card) && (
        <div className="space-y-0.5 rounded-xl bg-white/80 px-2 py-1.5 text-[11px] ring-1 ring-line">
          <div className="text-ink-mute">
            {t("plan.youAsked")}: “{card.plan.note}”
          </div>
          <div className="flex items-center gap-1 font-medium text-primary">
            <ArrowRight className="h-3 w-3" /> {t("plan.nowReads")}:{" "}
            {card.title}
          </div>
        </div>
      )}
    </div>
  );
}

/** Read-only comment box. */
function CommentView({
  label,
  text,
  warn,
}: {
  label: string;
  text: string;
  warn?: boolean;
}) {
  return (
    <div className="mt-1">
      <span className="mb-0.5 flex items-center gap-1.5 px-1.5 text-[11px] font-medium text-ink-soft">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            warn ? "bg-yellow-400" : "bg-primary",
          )}
        />{" "}
        {label}
      </span>
      <div
        className={cn(
          "rounded-xl px-2.5 py-1.5 text-sm ring-1",
          warn ? "bg-white ring-yellow-200" : "bg-white/80 ring-line",
        )}
      >
        <ReviewNote note={text} plan className="text-ink" />
      </div>
    </div>
  );
}

/** Plan-status colors for Timeline / Month chips — the design system's stage bars. */
const PLAN_LOOK: Record<
  PlanStatus,
  { bar: string; iconWrap: string; icon: typeof Check }
> = {
  draft: {
    bar: STAGE_STYLE.idea.bar,
    iconWrap: STAGE_STYLE.idea.iconWrap,
    icon: PenLine,
  },
  sent: {
    bar: STAGE_STYLE.draft.bar,
    iconWrap: STAGE_STYLE.draft.iconWrap,
    icon: Send,
  },
  approved: {
    bar: STAGE_STYLE.approved.bar,
    iconWrap: STAGE_STYLE.approved.iconWrap,
    icon: Check,
  },
  changes: {
    bar: STAGE_STYLE.review.bar,
    iconWrap: STAGE_STYLE.review.iconWrap,
    icon: PenLine,
  },
};
const planLook = (c: ContentCard) => PLAN_LOOK[c.plan.status];
const clientLook = (c: ContentCard) => PLAN_LOOK[viewStatus(c, false)];

/** Client: one plan line in a popup (from Timeline / Month) — same frame as the manager's popup. */
function ClientLineDialog({
  card,
  startWithComment,
  onClose,
}: {
  card: ContentCard;
  startWithComment?: boolean;
  onClose: () => void;
}) {
  const s = useDB();
  const { t, locale } = useT();
  const st = card.plan.status;
  const locked = planLocked(card);
  const [writing, setWriting] = useState(!!startWithComment && !locked);
  const [note, setNote] = useState(st === "changes" ? card.clientNote : "");
  const d = new Date(card.plannedDate + "T00:00:00");
  const comment = clientComment(card);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reopened, setReopened] = useState(false);
  const toast = useContext(ToastCtx);
  const choosing = !locked && (st === "sent" || reopened || writing);
  const send = async (decision: "approved" | "changes", text: string) => {
    setBusy(true);
    setError("");
    const failed = await s.decidePlan(card.id, decision, text);
    setBusy(false);
    if (failed)
      setError(
        failed === "err.schema"
          ? t("err.schemaClient")
          : `${t("plan.sendFailed")} (${failed})`,
      );
    else {
      toast(
        t(decision === "approved" ? "plan.msg.approved" : "plan.msg.sentEdit"),
      );
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/20 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Panel className="animate-rise space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium text-ink">
                {t("plan.editLine")}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-ink-soft shadow-raised"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2 rounded-2xl bg-white p-3.5 ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
              <span className="font-medium text-ink">
                {d.toLocaleDateString(locale, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              <span>· {card.plannedTime}</span>
              <CategoryChip category={card.category} />
              {placementsOf(card).map((p) => (
                <PlacementMark
                  key={p}
                  placement={p}
                  className="h-4 w-4 text-[8px]"
                />
              ))}
            </div>
            <p className="text-lg leading-snug font-medium text-ink">
              {card.title}
            </p>
            <HeadlineSteps card={card} manager={false} />
            {card.notes && (
              <p className="text-sm whitespace-pre-wrap text-ink-soft">
                {card.notes}
              </p>
            )}
          </div>

          {isUpdated(card) && (
            <div className="rounded-xl bg-primary-soft/40 px-3 py-2 text-xs ring-1 ring-primary/20">
              <div className="text-ink-soft">
                {t("plan.youAsked")}: “{card.plan.note}”
              </div>
              <div className="mt-0.5 flex items-center gap-1 font-medium text-primary">
                <ArrowRight className="h-3.5 w-3.5" /> {t("plan.nowReads")}:{" "}
                {card.title}
              </div>
            </div>
          )}

          {choosing ? (
            <DecisionButtons
              size="md"
              disabled={busy}
              editing={writing}
              onApprove={() => send("approved", "")}
              onEdit={() => setWriting(!writing)}
              onUndo={
                reopened
                  ? () => (setReopened(false), setWriting(false))
                  : undefined
              }
            />
          ) : (
            <DecisionResult
              size="md"
              card={card}
              onChange={
                st === "changes"
                  ? () => void send("approved", "")
                  : () => setReopened(true)
              }
            />
          )}
          {writing && !locked && (
            <EditNoteCard
              value={note}
              onChange={setNote}
              busy={busy}
              error={error}
              onCancel={() => setWriting(false)}
              onSave={() => send("changes", note.trim())}
            />
          )}
          {!writing && error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}
          {!writing && comment && (
            <CommentView
              label={t("plan.yourComment")}
              text={comment}
              warn={st === "changes"}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Manager: add or edit one plan line — text only (headline, date, type, places, notes). */
function PlanLineDialog({
  card,
  date,
  init,
  onClose,
  onSent,
}: {
  card?: ContentCard;
  date: string;
  init?: Partial<ContentCard>;
  onClose: () => void;
  onSent?: () => void;
}) {
  const s = useDB();
  const { t, locale } = useT();
  // Hiring → "Add to calendar": offer the reserved hiring slots (from today on) instead of a new line
  const todayIso = toISODate(new Date());
  const [slots] = useState(() =>
    !card && init?.jobId
      ? s.db.cards
          .filter((c) => isOpenSlot(c) && c.plannedDate >= todayIso)
          .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
      : [],
  );
  const [slotId, setSlotId] = useState(slots[0]?.id ?? "");
  const [f, setF] = useState({
    title: card?.title ?? init?.title ?? "",
    plannedDate: card?.plannedDate ?? slots[0]?.plannedDate ?? date,
    plannedTime: card?.plannedTime ?? "19:00",
    category:
      card?.category ?? init?.category ?? ("Hiring" as ContentCard["category"]),
    placements: card
      ? placementsOf(card)
      : ((init?.placements?.length ? init.placements : ["fb_post"]) as Placement[]),
    notes: card?.notes ?? init?.notes ?? "",
  });
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const comment = card ? clientComment(card) : "";
  const fixing = card?.plan.status === "changes" && !planLocked(card);

  const save = () => {
    const v = { ...f, title: f.title.trim(), notes: f.notes.trim() };
    if (!v.title) return;
    // saved lines go straight to the client's calendar ("Waiting for client")
    const sent = { status: "sent" as PlanStatus, at: new Date().toISOString() };
    if (!card && slotId) {
      // fill the reserved slot (keeps its place in the plan)
      s.updateCard(slotId, { ...v, jobId: init?.jobId });
      onClose();
      return;
    }
    if (!card)
      s.newCard({ ...v, jobId: init?.jobId, plan: init?.plan ?? sent });
    else {
      const patch = Object.fromEntries(
        Object.entries(v).filter(
          ([k, x]) =>
            JSON.stringify(x) !==
            JSON.stringify(
              k === "placements"
                ? placementsOf(card)
                : card[k as keyof ContentCard],
            ),
        ),
      ) as Partial<ContentCard>;
      if (fixing) {
        // fixed what the client asked → back to her to approve (+ Telegram)
        s.fixPlanLine(card.id, patch);
        onSent?.();
        onClose();
        return;
      }
      // a real change (not only notes) → the client checks it again (keep the "updated" history if any)
      const changed = Object.keys(patch).some((k) => k !== "notes");
      if ((changed || card.plan.status === "draft") && !planLocked(card))
        patch.plan = {
          ...sent,
          note: card.plan.status === "sent" ? card.plan.note : undefined,
        };
      if (Object.keys(patch).length) s.updateCard(card.id, patch);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/20 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Panel className="animate-rise space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-medium text-ink">
              {t(card ? "plan.editLine" : "plan.addLine")}
            </h2>
            <button
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-ink-soft shadow-raised"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {comment && (
            <CommentView
              label={t(fixing ? "plan.clientAsked" : "plan.clientComment")}
              text={comment}
              warn={fixing}
            />
          )}
          {slots.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-dashed border-blue-300 bg-blue-50/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <Briefcase className="h-4 w-4 text-blue-600" />{" "}
                {t("plan.fillSlot")}
              </div>
              <select
                className={selectCls}
                value={slotId}
                onChange={(e) => {
                  setSlotId(e.target.value);
                  const sl = slots.find((x) => x.id === e.target.value);
                  if (sl) set({ plannedDate: sl.plannedDate });
                }}
              >
                {slots.map((x) => (
                  <option key={x.id} value={x.id}>
                    {new Date(`${x.plannedDate}T00:00:00`).toLocaleDateString(
                      locale,
                      { weekday: "short", day: "numeric", month: "short" },
                    )}{" "}
                    · {t("plan.slotWaiting")}
                  </option>
                ))}
                <option value="">{t("plan.newLineInstead")}</option>
              </select>
              <p className="text-[11px] text-ink-soft">
                {t(slotId ? "plan.fillSlotHint" : "plan.newLineHint")}
              </p>
            </div>
          )}
          <Field
            label={t(isTikTokVideo(f) ? "plan.videoHeadline" : "plan.headline")}
          >
            <input
              autoFocus
              className={cn(
                inputCls,
                "text-[15px] font-medium",
                fixing && "border-yellow-300 ring-4 ring-yellow-100",
              )}
              value={f.title}
              placeholder={t("plan.newLine")}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("plan.col.date")}>
              <input
                type="date"
                className={inputCls}
                value={f.plannedDate}
                onChange={(e) =>
                  e.target.value && set({ plannedDate: e.target.value })
                }
              />
            </Field>
            <Field label={t("plan.time")}>
              <input
                type="time"
                className={inputCls}
                value={f.plannedTime}
                onChange={(e) => set({ plannedTime: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t("col.type")}>
            <select
              className={selectCls}
              value={f.category}
              onChange={(e) =>
                set({ category: e.target.value as ContentCard["category"] })
              }
            >
              {CATEGORIES.map((x) => (
                <option key={x} value={x}>
                  {t(`cat.${x}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("col.platform")}>
            <PlacementPicker
              value={f.placements}
              onChange={(placements) => set({ placements })}
            />
          </Field>
          <Field label={t("col.notes")}>
            <textarea
              rows={3}
              className={inputCls + " resize-y"}
              value={f.notes}
              placeholder="…"
              onChange={(e) => set({ notes: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {card && (
              <Button
                variant="ghost"
                className="text-rose-600 hover:text-rose-700"
                onClick={() => {
                  if (confirm(t("plan.deleteConfirm"))) {
                    s.deleteCard(card.id);
                    onClose();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> {t("plan.delete")}
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" onClick={onClose}>
              {t("cf.cancel")}
            </Button>
            <Button disabled={!f.title.trim()} onClick={save}>
              <Check className="h-4 w-4" />{" "}
              {t(
                fixing
                  ? "plan.saveSend"
                  : !card && init?.plan?.status === "draft"
                    ? "plan.saveDraft"
                    : "plan.save",
              )}
            </Button>
          </div>
          <p className="-mt-2 text-right text-[11px] text-ink-mute">
            {t(
              !card && init?.plan?.status === "draft"
                ? "plan.draftHint"
                : "plan.saveHint",
            )}
          </p>
        </Panel>
      </div>
    </div>
  );
}

/** Manager, in the plan table: a reserved hiring slot → pick the client's job to fill it. */
function SlotAttach({ card }: { card: ContentCard }) {
  const s = useDB();
  const { t } = useT();
  const used = new Set(s.db.cards.map((c) => c.jobId).filter(Boolean));
  const jobs = s.db.jobs.filter((j) => j.status !== "closed");
  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1.5 px-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
        <Briefcase className="h-3 w-3" /> {t("plan.slotWaiting")}
      </span>
      {jobs.length > 0 && (
        <select
          className="h-7 max-w-56 cursor-pointer rounded-full border border-line bg-white px-2.5 text-[11px] text-ink shadow-raised outline-none focus:ring-2 focus:ring-primary/20"
          value=""
          onChange={(e) =>
            e.target.value &&
            s.attachJobToLine(card.id, e.target.value, {}, t("job.positions"))
          }
          aria-label={t("plan.attachJob")}
        >
          <option value="">{t("plan.attachJob")} ▾</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {jobLineTitle(j)}
              {used.has(j.id) ? " ✓" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
