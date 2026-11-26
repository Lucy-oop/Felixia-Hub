"use client";

import { AiCardActions } from "@/components/AiTools";
import { CalendarDays, Check, Clock, ExternalLink, PenLine, Send, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReviewNote from "@/components/ReviewNote";
import PostPreview from "@/components/PostPreview";
import { useUI } from "@/components/Shell";
import { Button, Empty, GrayChip, inputCls, PageHeader, Panel, REVIEW_DOT as TAB_DOT, StatusPill } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import type { ContentCard, Placement } from "@/lib/types";
import PlacementSwitch from "@/components/PlacementSwitch";
import { can, cn, confirmTab, fmtDate, fmtDateTime, joinReviewNote, placementsOf, REVIEW_PARTS, type ConfirmTab, type ReviewPart } from "@/lib/utils";

type Tab = ConfirmTab;

export default function ConfirmPage() {
  const { db, role } = useDB();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("review");

  if (!can.seeReports(role)) return <Empty>{t("err.noAccess")}</Empty>;

  const byTab = (x: Tab) =>
    db.cards
      .filter((c) => confirmTab(c) === x)
      .sort((a, b) => (x === "published" ? -1 : 1) * (a.plannedDate + a.plannedTime).localeCompare(b.plannedDate + b.plannedTime));
  const list = byTab(tab);
  const tabs: Tab[] = ["review", "changes", "approved", "published"];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("cf.title")} sub={t("cf.sub")} />

      <div className="animate-rise mb-4 flex gap-1.5 overflow-x-auto rounded-full bg-chip/70 p-1 [scrollbar-width:none] sm:inline-flex [&::-webkit-scrollbar]:hidden">
        {tabs.map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
              tab === x ? "bg-surface text-ink shadow-raised" : "text-ink-soft hover:text-ink",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", TAB_DOT[x])} />
            {t(`cf.tab.${x}`)}
            <span className="rounded-full bg-chip px-2 py-0.5 text-xs">{byTab(x).length}</span>
          </button>
        ))}
      </div>

      {tab === "review" && can.reviewPosts(role) && list.length > 0 && (
        <p className="animate-rise mb-3 text-sm text-ink-soft">{t("cf.waitingCount", { n: list.length })}</p>
      )}

      {list.length === 0 ? (
        <Empty>{tab === "review" ? t("cf.emptyReview") : t("cf.empty")}</Empty>
      ) : (
        <div className="space-y-4">
          {list.map((c, i) => (
            <PostReview key={c.id} card={c} tab={tab} index={i + 1} total={list.length} />
          ))}
        </div>
      )}
    </div>
  );
}

const SUGGESTIONS = ["simpler", "long", "picture", "info"] as const;
const UNDO_MS = 6000;

type Mode = { kind: "idle" } | { kind: "form" } | { kind: "pending"; decision: "approved" | "changes"; note: string };

/**
 * One post for the client to check. Flow: decide (Approve / Needs changes) → if changes, say which part + note →
 * short "Sent ✓ · Undo" moment → saved. Nothing is written until the undo time has passed.
 */
function PostReview({ card, tab, index, total }: { card: ContentCard; tab: Tab; index: number; total: number }) {
  const s = useDB();
  const { t, locale } = useT();
  const { openCard } = useUI();
  const pls = placementsOf(card);
  const [placement, setPlacement] = useState<Placement>(pls[0]);
  const shown = pls.includes(placement) ? placement : pls[0];
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [parts, setParts] = useState<ReviewPart[]>([]);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const client = can.reviewPosts(s.role);
  const root = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ decision: "approved" | "changes"; note: string } | null>(null);
  const decideRef = useRef(s.clientDecide);
  decideRef.current = s.clientDecide;

  /** Save now (after the undo time, or when leaving the page). */
  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    // bring the next post into view before this one moves to another tab
    const next = root.current?.closest("[data-post]")?.nextElementSibling as HTMLElement | null;
    next?.scrollIntoView({ behavior: "smooth", block: "start" });
    decideRef.current(card.id, p.decision, p.note);
  };

  // leaving the page or this card unmounting: don't lose a pending decision
  useEffect(() => {
    const flush = () => commit();
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = (decision: "approved" | "changes", text = "") => {
    pending.current = { decision, note: text };
    setMode({ kind: "pending", decision, note: text });
    timer.current = setTimeout(commit, UNDO_MS);
  };
  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const was = pending.current;
    pending.current = null;
    setMode(was?.decision === "changes" ? { kind: "form" } : { kind: "idle" });
  };

  const canSend = parts.length > 0 || note.trim().length > 0;
  const togglePart = (p: ReviewPart) => setParts((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));
  const addSuggestion = (k: (typeof SUGGESTIONS)[number]) => {
    const line = t(`cf.sug.${k}`);
    setNote((n) => (n.includes(line) ? n : n.trim() ? `${n.trim()}\n${line}` : line));
    if (k === "picture" && !parts.includes("media")) setParts((x) => [...x, "media"]);
  };

  return (
    <div data-post className="scroll-mt-28">
      <Panel
        className={cn(
          "animate-rise transition-colors",
          (tab === "changes" || (mode.kind === "pending" && mode.decision === "changes")) && "border-rose-200 bg-rose-50",
          mode.kind === "pending" && mode.decision === "approved" && "border-green-200 bg-green-50",
        )}
      >
        <section ref={root} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* the post, as it will look */}
          <div className="min-w-0">
            <PlacementSwitch options={pls} value={shown} onChange={setPlacement} className="mb-3" />
            <PostPreview card={card} placement={shown} />
          </div>

          {/* decision panel — stays next to the post while scrolling */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-28 lg:self-start">
            <div>
              <div className="flex items-center justify-between gap-2">
                <StatusPill color={TAB_DOT[tab]} className="px-2.5 py-1 text-xs ring-1 ring-line">
                  {t(`cf.st.${tab}`)}
                </StatusPill>
                {client && tab === "review" && total > 1 && <span className="text-xs text-ink-mute">{t("cf.progress", { i: index, n: total })}</span>}
              </div>
              <h2 className="mt-2 text-xl leading-snug font-medium tracking-tight text-ink">{card.title}</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <GrayChip icon={CalendarDays}>{fmtDate(card.plannedDate, locale)}</GrayChip>
                <GrayChip icon={Clock}>{card.plannedTime || "—"}</GrayChip>
              </div>
            </div>

            {/* ---- client: step 1, decide ---- */}
            {client && tab === "review" && mode.kind === "idle" && (
              <div className="space-y-2.5 rounded-2xl bg-surface p-4 ring-1 ring-line">
                <p className="text-[15px] font-medium text-ink">{t("cf.ready")}</p>
                <Button variant="success" className="h-12 w-full text-[15px]" onClick={() => start("approved")}>
                  <Check className="h-5 w-5" /> {t("cf.yesApprove")}
                </Button>
                <Button variant="danger" className="h-12 w-full border-rose-200 text-[15px]" onClick={() => setMode({ kind: "form" })}>
                  <PenLine className="h-4 w-4" /> {t("cf.needsChanges")}
                </Button>
              </div>
            )}

            {/* ---- client: step 2, what to change ---- */}
            {client && tab === "review" && mode.kind === "form" && (
              <div className="animate-rise space-y-3 rounded-2xl bg-surface p-4 ring-1 ring-rose-200">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] font-medium text-ink">{t("cf.whatChange")}</p>
                  <button onClick={() => setMode({ kind: "idle" })} className="grid h-7 w-7 place-items-center rounded-full text-ink-mute hover:bg-frame" aria-label={t("cf.cancel")}>
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-ink-soft">{t("cf.whichPart")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REVIEW_PARTS.map((p) => {
                      const on = parts.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={on}
                          onClick={() => togglePart(p)}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition",
                            on ? "border-rose-300 bg-rose-50 font-medium text-rose-700" : "border-line bg-surface text-ink-soft hover:border-rose-200",
                          )}
                        >
                          {on && <Check className="h-3.5 w-3.5" />}
                          {t(`cf.part.${p}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-ink-soft">{t("cf.yourNote")}</span>
                  <textarea autoFocus className={inputCls + " text-[15px] leading-relaxed"} rows={4} placeholder={t("cf.notePh")} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((k) => (
                    <button key={k} type="button" onClick={() => addSuggestion(k)} className="rounded-full bg-chip/70 px-2.5 py-1 text-xs text-ink-soft hover:bg-chip hover:text-ink">
                      + {t(`cf.sug.${k}`)}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5 pt-1">
                  <Button
                    className="h-12 w-full text-[15px]"
                    disabled={!canSend}
                    onClick={() => {
                      setTried(true);
                      if (canSend) start("changes", joinReviewNote(parts, note));
                    }}
                  >
                    <Send className="h-4 w-4" /> {t("cf.sendTeam")}
                  </Button>
                  {!canSend && <p className={cn("text-center text-xs", tried ? "text-rose-600" : "text-ink-mute")}>{t("cf.pickPart")}</p>}
                  <Button variant="ghost" className="w-full" onClick={() => setMode({ kind: "idle" })}>
                    {t("cf.cancel")}
                  </Button>
                </div>
              </div>
            )}

            {/* ---- client: step 3, sent + undo ---- */}
            {mode.kind === "pending" && (
              <div
                role="status"
                className={cn(
                  "animate-rise rounded-2xl bg-surface p-4 ring-1",
                  mode.decision === "approved" ? "ring-green-200" : "ring-rose-200",
                )}
              >
                <div className={cn("flex items-center gap-2 text-[15px] font-medium", mode.decision === "approved" ? "text-green-700" : "text-rose-700")}>
                  <span className={cn("grid h-7 w-7 place-items-center rounded-full text-white", mode.decision === "approved" ? "bg-green-500" : "bg-rose-500")}>
                    <Check className="h-4 w-4" />
                  </span>
                  {mode.decision === "approved" ? t("cf.sentApproved") : t("cf.sentChanges")}
                </div>
                {mode.decision === "changes" && <ReviewNote note={mode.note} className="mt-2 text-sm" />}
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-chip">
                  <div className={cn("h-full origin-left", mode.decision === "approved" ? "bg-green-500" : "bg-rose-400")} style={{ animation: `shrink ${UNDO_MS}ms linear forwards` }} />
                </div>
                <button onClick={undo} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">
                  <Undo2 className="h-4 w-4" /> {t("cf.undo")}
                </button>
              </div>
            )}

            {/* ---- already decided ---- */}
            {card.review.note && tab !== "review" && (
              <div className={cn("rounded-2xl rounded-tl-md bg-surface p-3.5 text-sm ring-1", tab === "changes" ? "ring-rose-200" : "ring-line")}>
                <div className="mb-1 text-xs font-medium text-ink-mute">
                  {client ? t("cf.yourNote") : t("cf.clientNote")}
                  {card.review.at && ` · ${fmtDateTime(card.review.at, locale)}`}
                </div>
                <ReviewNote note={card.review.note} className={tab === "changes" ? "" : "text-ink"} />
              </div>
            )}
            {tab === "changes" && <p className="text-sm text-rose-700">{client ? t("cf.waitingClient") : t("cf.waiting")}</p>}

            {card.publishedUrl && (
              <a href={card.publishedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <ExternalLink className="h-4 w-4" /> {t("cf.viewLive")}
              </a>
            )}
            {can.editCards(s.role) && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => openCard(card.id)}>
                  <PenLine className="h-4 w-4" /> {t("job.edit")}
                </Button>
                <AiCardActions card={card} tools={["check", "tiktok"]} />
              </div>
            )}
          </div>
        </section>
      </Panel>
    </div>
  );
}
