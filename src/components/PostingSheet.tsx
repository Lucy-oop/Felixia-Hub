"use client";

import { Check, Copy, Download, ExternalLink, PenLine, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import { VERTICAL, type ContentCard, type Placement } from "@/lib/types";
import { can, cn, fmtDate, fmtDateTime, placementsOf } from "@/lib/utils";
import PlacementSwitch from "./PlacementSwitch";
import PostPreview from "./PostPreview";
import { useUI } from "./Shell";
import { Button, CategoryChip, GrayChip, inputCls, PlacementMark, StageBadge } from "./ui";

/** Posting day: preview + tick each place as posted (with the live link). Client / page admin see it read-only. */
export default function PostingSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useDB();
  const { t, locale } = useT();
  const { openCard } = useUI();
  const card = s.db.cards.find((c) => c.id === id);
  const [pv, setPv] = useState<Placement | null>(null);
  if (!card) return null;
  const pls = placementsOf(card);
  const shown = pv && pls.includes(pv) ? pv : pls[0];
  const manager = can.editCards(s.role);
  const done = pls.filter((p) => card.posted[p]).length;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="animate-slide-in absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-edge bg-frame shadow-float sm:inset-y-3 sm:right-3 sm:rounded-[28px] sm:border">
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <StageBadge stage={card.stage} />
              <CategoryChip category={card.category} />
              <GrayChip>
                {fmtDate(card.plannedDate, locale)} · {card.plannedTime}
              </GrayChip>
            </div>
            <h2 className="mt-2 text-xl leading-tight font-medium tracking-tight text-ink">{card.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{t("post.progress", { done, n: pls.length })}</p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-raised hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto px-5 pb-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <PlacementSwitch options={pls} value={shown} onChange={setPv} className="mb-3" />
            <PostPreview card={card} placement={shown} />
          </div>

          <div className="space-y-2.5">
            <h3 className="text-sm font-medium text-ink">{t("post.checklist")}</h3>
            {pls.map((p) => (
              <PlaceRow key={p + (card.posted[p]?.url ?? "")} card={card} placement={p} manager={manager} />
            ))}
            {manager && (
              <Button variant="ghost" className="w-full" onClick={() => (onClose(), openCard(card.id))}>
                <PenLine className="h-4 w-4" /> {t("post.openEditor")}
              </Button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function PlaceRow({ card, placement, manager }: { card: ContentCard; placement: Placement; manager: boolean }) {
  const s = useDB();
  const { t, locale } = useT();
  const [copied, setCopied] = useState(false);
  const p = card.posted[placement];
  const caption = placement === "tiktok" ? card.tiktokCaption || card.caption : placement === "fb_story" ? "" : card.caption;
  const media = VERTICAL.includes(placement) ? card.tiktokSrc || card.graphicSrc : card.graphicSrc;

  return (
    <div className={cn("rounded-2xl border bg-surface p-3 transition", p ? "border-green-200" : "border-line")}>
      <div className="flex items-center gap-2.5">
        <button
          disabled={!manager}
          onClick={() => s.setPosted(card.id, placement, p ? null : "")}
          aria-pressed={!!p}
          aria-label={t("post.markPosted")}
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 transition",
            p ? "border-green-500 bg-green-500 text-white" : "border-gray-300 bg-surface text-transparent hover:border-green-400",
            !manager && "cursor-default",
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
        <PlacementMark placement={placement} className="h-6 w-6" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-ink">{t(`pl.${placement}`)}</div>
          <div className="text-xs text-ink-mute">{p ? `${t("post.postedAt")} ${fmtDateTime(p.at, locale)}` : t("post.notYet")}</div>
        </div>
      </div>

      {manager && (
        <div className="mt-2.5 space-y-2">
          <input
            className={inputCls + " h-9 py-1.5 text-xs"}
            placeholder={t("post.linkPh")}
            defaultValue={p?.url ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (p?.url ?? "") && (v || p)) s.setPosted(card.id, placement, v);
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {caption && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard?.writeText([caption, placement !== "tiktok" ? card.hashtags : ""].filter(Boolean).join("\n\n"));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("d.copied") : t("d.copyCaption")}
              </Button>
            )}
            {media && (
              <a href={media} target="_blank" rel="noreferrer" download className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-medium shadow-raised hover:bg-gray-50">
                <Download className="h-3.5 w-3.5" /> {t("post.download")}
              </a>
            )}
          </div>
        </div>
      )}
      {!manager && p?.url && (
        <a href={p.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ExternalLink className="h-4 w-4" /> {t("cf.viewLive")}
        </a>
      )}
    </div>
  );
}
