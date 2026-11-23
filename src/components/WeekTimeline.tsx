"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import { PLACEMENTS, type ContentCard } from "@/lib/types";
import { addDays, cn, confirmTab, needsEdit, placementsOf, toISODate } from "@/lib/utils";
import { useUI } from "./Shell";
import { PlacementMark, REVIEW_DOT, STAGE_STYLE } from "./ui";


export function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday first
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function WeekTimeline({
  start,
  days = 7,
  cards,
  canDrag,
  onMove,
  onOpen,
  badge,
  red: isRed = needsEdit,
  look,
}: {
  start: Date;
  days?: number;
  cards: ContentCard[];
  canDrag: boolean;
  onMove: (cardId: string, iso: string) => void;
  /** what a click opens (default: the post editor) */
  onOpen?: (cardId: string) => void;
  /** small status dot (default: post review status) */
  badge?: (c: ContentCard) => { color: string; title: string } | null;
  /** light red chip when true (default: client asked for edits) */
  red?: (c: ContentCard) => boolean;
  /** override the chip colors + icon (default: the post stage) */
  look?: (c: ContentCard) => { bar: string; iconWrap: string; icon: typeof STAGE_STYLE[keyof typeof STAGE_STYLE]["icon"] };
}) {
  const { t, locale } = useT();
  const { openCard: defaultOpen } = useUI();
  const openCard = onOpen ?? defaultOpen;
  const [over, setOver] = useState("");
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const today = toISODate(new Date());
  const todayIdx = dates.findIndex((d) => toISODate(d) === today);
  const cols = `minmax(150px, 180px) repeat(${days}, minmax(${days > 7 ? 100 : 92}px, 1fr))`;
  const wide = days <= 7;

  const drop = (e: React.DragEvent, iso: string) => {
    e.preventDefault();
    setOver("");
    const id = e.dataTransfer.getData("text/card");
    if (id) onMove(id, iso);
  };

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="relative" style={{ minWidth: days > 7 ? 1700 : 820 }}>
        {/* header */}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: cols }}>
          <div className="flex items-end pb-1 text-xs font-medium text-ink-soft">{t("tl.channels")}</div>
          {dates.map((d) => {
            const iso = toISODate(d);
            const isToday = iso === today;
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div
                key={iso}
                className={cn(
                  "flex flex-col items-center rounded-xl py-1.5 text-[11px] leading-tight",
                  isToday ? "bg-primary text-white shadow-blue" : weekend ? "bg-chip text-ink-soft" : "bg-white text-ink-soft shadow-[inset_0_0_0_1px_var(--color-line)]",
                )}
              >
                <span>{d.toLocaleDateString(locale, { weekday: "short" })}</span>
                <span className={cn("font-medium", isToday ? "text-white" : "text-ink")}>{d.getDate()}</span>
              </div>
            );
          })}
        </div>

        {/* rows */}
        <div className="mt-1.5 space-y-1.5">
          {PLACEMENTS.map((ch) => (
            <div key={ch} className="grid gap-1.5" style={{ gridTemplateColumns: cols }}>
              <div className="flex items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--color-line)]">
                <PlacementMark placement={ch} className="h-8 w-8 text-sm" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-medium text-ink">{ch === "tiktok" ? "TikTok" : "Facebook"}</div>
                  <div className="truncate text-xs text-ink-mute">{t(`pl.short.${ch}`)}</div>
                </div>
              </div>
              {dates.map((d) => {
                const iso = toISODate(d);
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                const list = cards.filter((c) => c.plannedDate === iso && placementsOf(c).includes(ch));
                const key = iso + ch;
                return (
                  <div
                    key={key}
                    onDragOver={(e) => {
                      if (!canDrag) return;
                      e.preventDefault();
                      setOver(key);
                    }}
                    onDragLeave={() => setOver("")}
                    onDrop={(e) => drop(e, iso)}
                    className={cn(
                      "min-h-[52px] space-y-1 rounded-xl p-0.5 transition",
                      weekend ? "stripes" : "bg-white/70 shadow-[inset_0_0_0_1px_rgba(233,235,239,0.8)]",
                      over === key && "ring-2 ring-primary/60",
                    )}
                  >
                    {list.map((c) => {
                      const S = look ? look(c) : STAGE_STYLE[c.stage];
                      const tab = confirmTab(c);
                      const red = !look && isRed(c);
                      const dot = badge ? badge(c) : tab && tab !== "published" ? { color: REVIEW_DOT[tab], title: t(`cf.st.${tab}`) } : null;
                      return (
                        <button
                          key={c.id}
                          draggable={canDrag}
                          onDragStart={(e) => e.dataTransfer.setData("text/card", c.id)}
                          onClick={() => openCard(c.id)}
                          title={`${c.title} · ${t(`stage.${c.stage}`)}`}
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded-[10px] p-1 pr-1.5 text-left text-xs shadow-[0_6px_14px_-8px_rgba(16,24,40,0.35)] transition hover:-translate-y-px hover:brightness-105",
                            red ? "bg-linear-to-r from-amber-50 to-yellow-100 text-amber-800 ring-1 ring-amber-200" : S.bar,
                            canDrag && "cursor-grab active:cursor-grabbing",
                          )}
                        >
                          <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", S.iconWrap)}>
                            <S.icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{c.title}</span>
                            {wide && <span className="block truncate text-[10px] opacity-75">{c.plannedTime}</span>}
                          </span>
                          {dot && <span title={dot.title} className={cn("h-2 w-2 shrink-0 rounded-full ring-2 ring-white/80", dot.color)} />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* today dashed line */}
        {todayIdx >= 0 && (
          <div className="pointer-events-none absolute inset-0 grid gap-1.5" style={{ gridTemplateColumns: cols }}>
            <div style={{ gridColumn: todayIdx + 2 }} className="flex justify-center pt-11">
              <div className="h-full border-l-2 border-dashed border-primary/80" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
