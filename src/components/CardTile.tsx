"use client";

import ReviewNote from "./ReviewNote";
import { isVideo } from "@/components/PostPreview";
import { CalendarDays, Clock } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import type { ContentCard } from "@/lib/types";
import { cn, confirmTab, fmtDate, fmtDateTime, needsEdit, placementsOf } from "@/lib/utils";
import { useUI } from "./Shell";
import { Badge, GrayChip, PlacementMark, REVIEW_DOT, STAGE_STYLE, StatusPill } from "./ui";

export const isImg = (u: string) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u) || u.includes("placehold.co") || u.startsWith("data:image");

export default function CardTile({ card, draggable = false, highlight = false }: { card: ContentCard; showStage?: boolean; draggable?: boolean; highlight?: boolean }) {
  const { openCard } = useUI();
  const { db } = useDB();
  const { t, locale } = useT();
  const job = db.jobs.find((j) => j.id === card.jobId);
  const S = STAGE_STYLE[card.stage];
  const tab = confirmTab(card);
  const red = needsEdit(card);

  return (
    <button
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/card", card.id)}
      onClick={() => openCard(card.id)}
      className={cn(
        "group w-full rounded-2xl p-3 text-left transition-all duration-150 hover:-translate-y-0.5",
        red
          ? "border border-rose-200 bg-rose-50 shadow-card hover:shadow-float"
          : highlight ? "bg-gradient-to-br from-yellow-300 to-yellow-200 shadow-[0_10px_24px_-12px_rgba(234,179,8,0.7)]" : "border border-white bg-white shadow-card hover:shadow-float",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-2.5">
        {card.graphicSrc && (isImg(card.graphicSrc) || card.graphicUrl.startsWith("sb:")) && !isVideo(card.graphicUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.graphicSrc} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-white" />
        ) : (
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", S.bar)}>
            <S.icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="line-clamp-2 text-sm leading-snug font-medium text-ink">{card.title}</div>
            <span className="mt-0.5 flex shrink-0 -space-x-1">
              {placementsOf(card).map((p) => (
                <PlacementMark key={p} placement={p} className="ring-2 ring-white" />
              ))}
            </span>
          </div>
          <div className={cn("mt-0.5 truncate text-xs", highlight ? "text-amber-900/70" : "text-ink-mute")}>
            {t(`stage.${card.stage}`)} · {t(`cat.${card.category}`)} · {placementsOf(card).map((p) => t(`pl.short.${p}`)).join(" · ")}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <GrayChip icon={CalendarDays} className={highlight ? "bg-white/50" : ""}>
          {fmtDate(card.plannedDate, locale)}
        </GrayChip>
        <GrayChip icon={Clock} className={highlight ? "bg-white/50" : ""}>
          {card.plannedTime || "—"}
        </GrayChip>
        {tab && tab !== "published" && (
          <StatusPill color={REVIEW_DOT[tab]} className="ring-1 ring-line">
            {t(`cf.st.${tab}`)}
          </StatusPill>
        )}
        {job?.status === "closed" && <Badge className="bg-rose-500 text-white">{t("tile.closed")}</Badge>}
      </div>
      <FbStatus card={card} locale={locale} t={t} />
      {red && card.review.note && (
        <ReviewNote note={card.review.note} compact className="mt-2 rounded-xl bg-white px-2.5 py-1.5 text-xs ring-1 ring-rose-200" />
      )}
    </button>
  );
}

/** Facebook auto-scheduling state: scheduling… / scheduled for <time> / posted / error message. */
function FbStatus({ card, locale, t }: { card: ContentCard; locale: string; t: (k: string) => string }) {
  const { fbScheduleStatus: st, fbPostId, fbScheduledFor, fbScheduleError } = card;
  if (st === "failed")
    return (
      <div title={fbScheduleError} className="mt-2 line-clamp-3 rounded-xl bg-white px-2.5 py-1.5 text-xs text-rose-700 ring-1 ring-rose-200">
        <span className="font-medium">{t("fb.failed")}:</span> {fbScheduleError}
      </div>
    );
  if (st === "pending")
    return (
      <div className="mt-2">
        <StatusPill color="bg-primary animate-pulse" className="ring-1 ring-line">{t("fb.pending")}</StatusPill>
      </div>
    );
  if (!fbPostId) return null;
  const live = !!fbScheduledFor && Date.parse(fbScheduledFor) <= Date.now();
  return (
    <div className="mt-2">
      <StatusPill color={live ? "bg-ink" : "bg-[#1877F2]"} className="ring-1 ring-line">
        {t(live ? "fb.live" : "fb.scheduled")}
        {!live && fbScheduledFor && ` · ${fmtDateTime(fbScheduledFor, locale)}`}
      </StatusPill>
    </div>
  );
}
