"use client";

import { Check, Eye, Link2, Sparkles, Trash } from "lucide-react";
import { useState } from "react";
import IdeaForm from "@/components/IdeaForm";
import { useUI } from "@/components/Shell";
import { Avatar, Button, Empty, PageHeader, Panel, PanelHeader, pillSelectCls, Segmented, StatusPill } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import type { Idea, IdeaStatus } from "@/lib/types";
import { can, cn, fmtDateTime } from "@/lib/utils";

const STATUS_DOT: Record<IdeaStatus, string> = { new: "bg-primary", seen: "bg-yellow-400", planned: "bg-violet-500", used: "bg-green-500" };

export default function IdeasPage() {
  const { db, role } = useDB();
  const { t } = useT();
  const [filter, setFilter] = useState<"all" | IdeaStatus>("all");
  const [from, setFrom] = useState<"all" | "client" | "manager">("all");
  if (!can.ideas(role)) return <Empty>{t("err.noAccess")}</Empty>;

  const list = db.ideas.filter((i) => (filter === "all" || i.status === filter) && (from === "all" || i.by === from));

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <PageHeader title={t("ideas.title")} sub={t("ideas.sub")} />
      <IdeaForm />
      <Panel className="animate-rise">
        <PanelHeader title={t("ideas.list")} count={db.ideas.length}>
          <select className={pillSelectCls} value={from} onChange={(e) => setFrom(e.target.value as typeof from)}>
            <option value="all">{t("ideas.fromAll")}</option>
            <option value="client">{t("ideas.fromClient")}</option>
            <option value="manager">{t("ideas.fromManager")}</option>
          </select>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: t("inq.all") },
              { id: "new", label: t("ideas.st.new") },
              { id: "seen", label: t("ideas.st.seen") },
              { id: "planned", label: t("ideas.st.planned") },
              { id: "used", label: t("ideas.st.used") },
            ]}
          />
        </PanelHeader>
        {list.length === 0 ? (
          <Empty>{t("ideas.empty")}</Empty>
        ) : (
          <ul className="space-y-2.5">
            {list.map((i) => (
              <IdeaRow key={i.id} idea={i} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function IdeaRow({ idea }: { idea: Idea }) {
  const s = useDB();
  const { t, locale } = useT();
  const { openCard } = useUI();
  const manager = can.manageIdeas(s.role);
  const who = idea.byName ?? t(`role.${idea.by}`);

  return (
    <li className={cn("rounded-2xl border bg-surface p-4 shadow-card", idea.status === "new" && manager ? "border-primary/30" : "border-edge")}>
      <div className="flex items-start gap-3">
        <Avatar name={who} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-mute">
            <b className="font-medium text-ink-soft">{who}</b> · {fmtDateTime(idea.at, locale)}
            <StatusPill color={STATUS_DOT[idea.status]} className="ring-1 ring-line">
              {t(`ideas.st.${idea.status}`)}
            </StatusPill>
          </div>
          {idea.text && <p className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-wrap text-ink">{idea.text}</p>}

          {idea.imageUrls.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {idea.imageUrls.map((u, k) =>
                /\.(mp4|webm|mov)$/i.test(idea.images[k]) ? (
                  <video key={k} src={u} controls className="h-28 rounded-xl ring-1 ring-line" />
                ) : (
                  <a key={k} href={u} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-28 w-28 rounded-xl object-cover ring-1 ring-line transition hover:opacity-90" />
                  </a>
                ),
              )}
            </div>
          )}

          {idea.links.length > 0 && (
            <ul className="mt-2 space-y-1">
              {idea.links.map((l, k) => (
                <li key={k}>
                  <a href={l} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-sm text-primary hover:underline">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{l}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {(manager || idea.cardId) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {idea.cardId ? (
                <Button size="sm" variant="secondary" onClick={() => openCard(idea.cardId!)}>
                  <Eye className="h-3.5 w-3.5" /> {t("ideas.openPost")}
                </Button>
              ) : (
                manager && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const id = s.ideaToCard(idea.id);
                      if (id) openCard(id);
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> {t("ideas.makePost")}
                  </Button>
                )
              )}
              {manager && idea.status === "new" && (
                <Button size="sm" variant="secondary" onClick={() => s.setIdeaStatus(idea.id, "seen")}>
                  <Check className="h-3.5 w-3.5" /> {t("ideas.markSeen")}
                </Button>
              )}
              {manager && (
                <Button size="sm" variant="ghost" onClick={() => confirm(t("ideas.deleteConfirm")) && s.deleteIdea(idea.id)}>
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
