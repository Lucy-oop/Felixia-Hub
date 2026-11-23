"use client";

import { ExternalLink, Globe, Heart, ImageOff, MessageCircle, Music2, Share2, ThumbsUp } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { ContentCard, Placement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isImg } from "./CardTile";
import { Logo } from "./Shell";

export const isVideo = (u: string) => /\.(mp4|webm|mov)(\?|$)/i.test(u);

/** Picture / video / link, whichever the URL is. */
function Media({ url, stored = url, className }: { url: string; stored?: string; className?: string }) {
  const { t } = useT();
  if (!url)
    return (
      <div className={cn("grid place-items-center bg-chip/60 text-ink-mute", className)}>
        <span className="flex flex-col items-center gap-2 text-sm">
          <ImageOff className="h-6 w-6" /> {t("cf.noMedia")}
        </span>
      </div>
    );
  if (isVideo(url) || isVideo(stored)) return <video src={url} controls playsInline className={cn("bg-black object-contain", className)} />;
  if (isImg(url) || stored.startsWith("sb:"))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cn("bg-white object-contain", className)} />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className={cn("grid place-items-center bg-primary-soft/50 text-primary hover:bg-primary-soft", className)}>
      <span className="flex items-center gap-2 text-sm font-medium">
        <ExternalLink className="h-4 w-4" /> {t("cf.openFile")}
      </span>
    </a>
  );
}

/** Looks like the real Facebook Post / Reel / Story or TikTok, so the client sees what will go live. */
export default function PostPreview({ card, placement }: { card: ContentCard; placement: Placement }) {
  const { t } = useT();
  const page = "Felixia Recruitment";
  // vertical placements share one video; fall back to the feed picture if none yet
  const vUrl = card.tiktokSrc || card.graphicSrc;
  const vStored = card.tiktokMediaUrl || card.graphicUrl;

  if (placement === "fb_post")
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <div className="flex items-center gap-2.5 p-3">
          <Logo className="h-10 w-10 rounded-full" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">{page}</div>
            <div className="flex items-center gap-1 text-xs text-ink-mute">
              {card.plannedDate} · {card.plannedTime} · <Globe className="h-3 w-3" />
            </div>
          </div>
        </div>
        <p className="px-3 pb-3 text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
          {card.caption || <span className="text-ink-mute">{t("cf.noCaption")}</span>}
          {card.hashtags && <span className="mt-1 block text-[#1877F2]">{card.hashtags}</span>}
        </p>
        <Media url={card.graphicSrc} stored={card.graphicUrl} className="aspect-[4/5] max-h-[560px] w-full border-y border-line" />
        <div className="grid grid-cols-3 text-sm text-ink-soft">
          {[
            [ThumbsUp, t("cf.like")],
            [MessageCircle, t("cf.comment")],
            [Share2, t("cf.share")],
          ].map(([Icon, label], i) => {
            const I = Icon as typeof ThumbsUp;
            return (
              <span key={i} className="flex items-center justify-center gap-1.5 py-2.5">
                <I className="h-4 w-4" /> {label as string}
              </span>
            );
          })}
        </div>
      </div>
    );

  if (placement === "fb_story")
    return (
      <Phone>
        <Media url={vUrl} stored={vStored} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3 pb-10 text-white">
          <div className="flex gap-1">
            <span className="h-0.5 flex-1 rounded-full bg-white" />
            <span className="h-0.5 flex-1 rounded-full bg-white/40" />
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <Logo className="h-8 w-8 rounded-full ring-2 ring-[#1877F2]" />
            <span className="text-sm font-semibold">{page}</span>
            <span className="text-xs opacity-80">· {card.plannedTime}</span>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent p-3 pt-10">
          <span className="flex-1 rounded-full border border-white/70 px-4 py-2 text-xs text-white/90">{t("pv.sendMessage")}</span>
          <ThumbsUp className="h-6 w-6 text-white" />
          <Heart className="h-6 w-6 text-white" />
        </div>
      </Phone>
    );

  const reel = placement === "fb_reel";
  return (
    <Phone>
      <Media url={vUrl} stored={vStored} className="absolute inset-0 h-full w-full" />
      {reel && <div className="pointer-events-none absolute top-3 left-4 text-lg font-semibold text-white drop-shadow">Reels</div>}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pt-16 pr-14 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {reel && <Logo className="h-7 w-7 rounded-full" />}
          {reel ? page : "@felixiarecruitment"}
          {reel && <span className="rounded-md border border-white/70 px-1.5 text-[11px] font-medium">Follow</span>}
        </div>
        <p className="mt-1 line-clamp-4 text-[13px] leading-snug whitespace-pre-wrap">{(reel ? card.caption : card.tiktokCaption || card.caption) || t("cf.noCaption")}</p>
        {!reel && (
          <div className="mt-2 flex items-center gap-1.5 text-xs opacity-90">
            <Music2 className="h-3.5 w-3.5" /> original sound · {page}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute right-2.5 bottom-24 flex flex-col items-center gap-4 text-white">
        {reel ? <ThumbsUp className="h-7 w-7" /> : <Heart className="h-7 w-7" />}
        <MessageCircle className="h-7 w-7" />
        <Share2 className="h-7 w-7" />
      </div>
    </Phone>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[340px]">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] border-4 border-ink bg-ink shadow-float">{children}</div>
    </div>
  );
}
