"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { AiCardActions } from "@/components/AiTools";
import CardTile from "@/components/CardTile";
import { useUI } from "@/components/Shell";
import { Alert, Button, Panel, pillSelectCls, STAGE_STYLE } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import { CATEGORIES, STAGES, type Platform, type Stage } from "@/lib/types";
import { can, cn, platformsOf, visibleCards } from "@/lib/utils";

export default function PipelinePage() {
  const s = useDB();
  const { db, role } = s;
  const { t } = useT();
  const { newPost } = useUI();
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [over, setOver] = useState<Stage | null>(null);

  const cards = visibleCards(db.cards, role).filter((c) => (!platform || platformsOf(c).includes(platform as Platform)) && (!category || c.category === category));
  const all = can.seeAllCards(role);
  const stages = all ? STAGES : (["published"] as const);
  const dnd = can.editCards(role);
  const filterSel = pillSelectCls;

  return (
    <Panel className="animate-rise">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-medium tracking-tight">{t(all ? "pipe.title" : "nav.published")}</h1>
          <p className="mt-0.5 text-sm text-ink-soft">{t(dnd ? "pipe.subEdit" : "pipe.subView")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={filterSel} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">{t("filter.allPlatforms")}</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
          </select>
          <select className={filterSel} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("filter.allCategories")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`cat.${c}`)}
              </option>
            ))}
          </select>
          {dnd && (
            <Button size="sm" className="h-9" onClick={() => newPost()}>
              <Plus className="h-4 w-4" /> {t("pipe.newIdea")}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert onClose={() => setError("")}>{t(error)}</Alert>
        </div>
      )}

      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {stages.map((st) => {
          const list = cards.filter((c) => c.stage === st);
          const S = STAGE_STYLE[st];
          return (
            <div
              key={st}
              onDragOver={(e) => {
                if (!dnd) return;
                e.preventDefault();
                setOver(st);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                setOver(null);
                const id = e.dataTransfer.getData("text/card");
                if (!id) return;
                const r = s.moveStage(id, st);
                setError(r.ok ? "" : r.error);
              }}
              className={cn(
                "flex w-[272px] shrink-0 snap-start flex-col rounded-[20px] bg-chip/45 p-2 transition",
                over === st && "bg-primary-soft/70 ring-2 ring-primary/50",
                !all && "w-full",
              )}
            >
              <div className={cn("mb-2 flex items-center gap-2 rounded-2xl p-1.5 pr-3", S.bar)}>
                <span className={cn("grid h-8 w-8 place-items-center rounded-full", S.iconWrap)}>
                  <S.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium">{t(`stage.${st}`)}</span>
                <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink shadow-sm">{list.length}</span>
              </div>
              <div className={cn("flex min-h-40 flex-col gap-2", !all && "sm:grid sm:grid-cols-2 lg:grid-cols-3")}>
                {list.map((c) =>
                  role === "manager" && c.stage !== "published" ? (
                    <div key={c.id} className="space-y-1.5">
                      <CardTile card={c} draggable={dnd} />
                      <AiCardActions card={c} tools={["draft", "check", "tiktok"]} compact className="px-1" />
                    </div>
                  ) : (
                    <CardTile key={c.id} card={c} draggable={dnd} />
                  ),
                )}
                {list.length === 0 && <div className="stripes grid flex-1 place-items-center rounded-2xl py-8 text-xs text-ink-mute" />}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
