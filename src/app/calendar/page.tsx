"use client";

import { Check, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { useState } from "react";
import { isImg } from "@/components/CardTile";
import PostingSheet from "@/components/PostingSheet";
import { isVideo } from "@/components/PostPreview";
import { Button, CategoryChip, Empty, Panel, PlacementMark, Segmented } from "@/components/ui";
import WeekTimeline, { startOfWeek } from "@/components/WeekTimeline";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import type { ContentCard } from "@/lib/types";
import { addDays, can, cn, placementsOf, toISODate, visibleCards } from "@/lib/utils";

type View = "month" | "list";

/** Posting Calendar: only posts the client approved, and what is already published. */
export default function PostingCalendarPage() {
  const s = useDB();
  const { db, role } = s;
  const { t, locale } = useT();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [open, setOpen] = useState<string | null>(null);
  const today = toISODate(new Date());

  const cards = visibleCards(db.cards, role)
    .filter((c) => c.stage === "approved" || c.stage === "published")
    .sort((a, b) => (a.plannedDate + a.plannedTime).localeCompare(b.plannedDate + b.plannedTime));
  const todays = cards.filter((c) => c.plannedDate === today);
  const placesLeft = todays.reduce((n, c) => n + placementsOf(c).filter((p) => !c.posted[p]).length, 0);
  const late = cards.filter((c) => c.plannedDate < today && c.stage === "approved");

  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const start = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  let days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  if (days[35].getMonth() !== cursor.getMonth()) days = days.slice(0, 35);
  const weekdays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date()), i).toLocaleDateString(locale, { weekday: "short" }));

  return (
    <div className="space-y-3">
      {/* today strip */}
      {can.editCards(role) && (todays.length > 0 || late.length > 0) && (
        <Panel className="animate-rise flex flex-wrap items-center gap-3 border-green-200 bg-gradient-to-r from-green-50 to-card">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-green-500 text-white shadow">
            <Send className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-ink">{t("post.today", { n: todays.length, left: placesLeft })}</div>
            {late.length > 0 && <div className="text-sm text-rose-600">{t("post.late", { n: late.length })}</div>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[...late, ...todays].slice(0, 4).map((c) => (
              <Button key={c.id} size="sm" variant="secondary" onClick={() => setOpen(c.id)} className="max-w-56">
                <span className="truncate">{c.title}</span>
              </Button>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="animate-rise">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[28px] leading-tight font-medium tracking-tight">{t("post.title")}</h1>
            <p className="mt-0.5 text-sm text-ink-soft">{t("post.sub")}</p>
          </div>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { id: "month", label: t("cal.month") },
              { id: "list", label: t("cal.list") },
            ]}
          />
        </div>

        {view === "month" ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex items-center rounded-full border border-line bg-surface shadow-raised">
                <button className="grid h-9 w-9 place-items-center text-ink-soft hover:text-ink" onClick={() => shift(-1)} aria-label="Previous">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-36 px-1 text-center text-sm font-medium">{cursor.toLocaleDateString(locale, { month: "long", year: "numeric" })}</span>
                <button className="grid h-9 w-9 place-items-center text-ink-soft hover:text-ink" onClick={() => shift(1)} aria-label="Next">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <Button variant="secondary" size="sm" className="h-9" onClick={() => setCursor(new Date())}>
                {t("cal.today")}
              </Button>
            </div>
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="min-w-[640px]">
                <div className="mb-1.5 grid grid-cols-7 gap-1.5">
                  {weekdays.map((d, i) => (
                    <div key={d} className={cn("rounded-xl py-1.5 text-center text-[11px]", i >= 5 ? "bg-chip text-ink-soft" : "bg-surface text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line)]")}>
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
                        className={cn(
                          "min-h-32 rounded-xl p-1.5",
                          weekend ? "stripes" : "bg-surface/80 shadow-[inset_0_0_0_1px_rgba(233,235,239,0.9)] dark:shadow-[inset_0_0_0_1px_var(--color-line)]",
                          d.getMonth() !== cursor.getMonth() && "opacity-40",
                          iso === today && "ring-2 ring-primary",
                        )}
                      >
                        <span className={cn("mb-1 grid h-6 w-6 place-items-center rounded-full text-xs", iso === today ? "bg-primary font-medium text-white" : "text-ink-soft")}>{d.getDate()}</span>
                        <div className="space-y-1">
                          {list.map((c) => (
                            <PostChip key={c.id} card={c} onOpen={() => setOpen(c.id)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          <ListView cards={cards.filter((c) => c.plannedDate >= toISODate(addDays(new Date(), -30)))} onOpen={setOpen} />
        )}

        {/* legend */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border-2 border-green-500 bg-surface" /> {t("post.legendReady")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-ink" /> {t("post.legendLive")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="relative">
              <PlacementMark placement="fb_post" className="h-4 w-4" />
              <Check className="absolute -right-1 -bottom-1 h-2.5 w-2.5 rounded-full bg-green-500 text-white" strokeWidth={4} />
            </span>
            {t("post.legendPosted")}
          </span>
        </div>
      </Panel>

      {/* every planned post at a glance (all stages) — for the manager's planning */}
      {can.editCards(role) && (
        <Panel className="animate-rise">
          <h2 className="mb-3 text-sm font-medium text-ink">{t("post.allStages")}</h2>
          <WeekTimeline start={startOfWeek(new Date())} days={14} cards={visibleCards(db.cards, role)} canDrag onMove={s.setDate} />
        </Panel>
      )}

      {open && <PostingSheet id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** One post in the month grid: thumbnail, time, places (ticked when posted). */
function PostChip({ card, onOpen }: { card: ContentCard; onOpen: () => void }) {
  const live = card.stage === "published";
  const thumb = card.graphicSrc || card.tiktokSrc;
  const stored = card.graphicSrc ? card.graphicUrl : card.tiktokMediaUrl;
  return (
    <button
      onClick={onOpen}
      title={card.title}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-lg p-1 text-left text-[11px] transition hover:-translate-y-px",
        live ? "bg-gradient-to-r from-[#1f2329] to-[#3f4652] text-white dark:from-[#3a3d44] dark:to-[#4a4e57]" : "border-2 border-green-500 bg-surface text-ink",
      )}
    >
      {thumb && !isVideo(stored) && (isImg(thumb) || stored.startsWith("sb:")) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {card.plannedTime} {card.title}
        </span>
        <span className="mt-0.5 flex gap-0.5">
          {placementsOf(card).map((p) => (
            <span key={p} className="relative">
              <PlacementMark placement={p} className={cn("h-3.5 w-3.5 text-[8px]", !card.posted[p] && "opacity-35 grayscale")} />
              {card.posted[p] && <Check className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-green-500 text-white" strokeWidth={4} />}
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

function ListView({ cards, onOpen }: { cards: ContentCard[]; onOpen: (id: string) => void }) {
  const { t, locale } = useT();
  if (!cards.length) return <Empty>{t("post.empty")}</Empty>;
  const groups = cards.reduce<Record<string, ContentCard[]>>((acc, c) => ((acc[c.plannedDate] ??= []).push(c), acc), {});
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {Object.entries(groups).map(([date, list]) => (
        <div key={date}>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white shadow-blue">
              {new Date(date + "T00:00:00").toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className="space-y-2">
            {list.map((c) => {
              const pls = placementsOf(c);
              const done = pls.filter((p) => c.posted[p]).length;
              return (
                <button key={c.id} onClick={() => onOpen(c.id)} className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-edge bg-surface p-3 text-left shadow-card hover:shadow-float">
                  <span className="text-sm text-ink-soft">{c.plannedTime}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                  <CategoryChip category={c.category} />
                  <span className="flex gap-1">
                    {pls.map((p) => (
                      <PlacementMark key={p} placement={p} className={cn("h-5 w-5", !c.posted[p] && "opacity-35 grayscale")} />
                    ))}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", done === pls.length ? "bg-ink text-white" : "bg-green-50 text-green-700")}>
                    {done}/{pls.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
