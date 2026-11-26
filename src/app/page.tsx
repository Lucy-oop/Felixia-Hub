"use client";

import { isVideo } from "@/components/PostPreview";
import { ArrowUpRight, Briefcase, CalendarDays, ChevronLeft, ChevronRight, Clock, Eye, Lightbulb, Plus, Send } from "lucide-react";
import IdeaForm from "@/components/IdeaForm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { isImg } from "@/components/CardTile";
import { useUI } from "@/components/Shell";
import { REVIEW_DOT, Button, Empty, GrayChip, Panel, PanelHeader, STAGE_STYLE, StatusPill } from "@/components/ui";
import WeekTimeline, { startOfWeek } from "@/components/WeekTimeline";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import type { ContentCard } from "@/lib/types";
import { addDays, can, cn, confirmTab, fmtDate, needsEdit, placementsOf, toISODate, visibleCards } from "@/lib/utils";

export default function Home() {
  const s = useDB();
  const { db, role } = s;
  const { t, locale } = useT();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const cards = visibleCards(db.cards, role);
  const today = toISODate(new Date());
  // "Going live soon": posts the client already approved (or is checking now), next ones first
  const upcoming = cards
    .filter((c) => c.plannedDate >= today && (c.stage === "approved" || c.stage === "review"))
    .sort((a, b) => (a.plannedDate + a.plannedTime).localeCompare(b.plannedDate + b.plannedTime))
    .slice(0, 4);
  const pending = cards.filter((c) => c.review.status === "review");
  const myWork = cards
    .filter((c) => c.review.status === "changes" || c.stage === "approved" || (c.stage === "design" && !c.graphicUrl && !c.tiktokMediaUrl))
    .sort((a, b) => Number(b.review.status === "changes") - Number(a.review.status === "changes"));
  const weekLabel = `${weekStart.toLocaleDateString(locale, { day: "numeric", month: "short" })} – ${addDays(weekStart, 6).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`;

  const timeline = (
    <Panel className="animate-rise">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className={cn("leading-tight font-medium tracking-tight", role === "client" ? "text-xl" : "text-[28px]")}>{t("tl.title")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full border border-line bg-surface shadow-raised">
            <button className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:text-ink" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="flex items-center gap-2 px-1 text-sm whitespace-nowrap" onClick={() => setWeekStart(startOfWeek(new Date()))}>
              <CalendarDays className="h-4 w-4 text-ink-soft" /> {weekLabel}
            </button>
            <button className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:text-ink" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Link href="/calendar" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm whitespace-nowrap shadow-raised hover:bg-gray-50">
            <ArrowUpRight className="h-4 w-4" /> {t("tl.viewAll")}
          </Link>
        </div>
      </div>
      <WeekTimeline start={weekStart} cards={cards} canDrag={can.moveDates(role)} onMove={s.setDate} />
    </Panel>
  );

  // Client: what needs her first (check posts, send ideas, what's coming) — calendar last
  const planWaiting = cards.filter((c) => c.plan.status === "sent").length;

  if (role === "client")
    return (
      <div className="space-y-3">
        {planWaiting > 0 && (
          <Link
            href="/plan"
            className="animate-rise flex flex-wrap items-center gap-3 rounded-[24px] border border-yellow-200 bg-gradient-to-r from-yellow-100 to-yellow-50 p-4 shadow-card transition hover:-translate-y-0.5"
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-yellow-400 text-amber-950">
              <CalendarDays className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-ink">{t("home.planWaiting", { n: planWaiting })}</span>
              <span className="block text-sm text-ink-soft">{t("home.planWaitingSub")}</span>
            </span>
            <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-medium text-white">
              {t("home.openPlan")} <ArrowUpRight className="h-4 w-4" />
            </span>
          </Link>
        )}
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel className="animate-rise flex flex-col">
            <PanelHeader title={t("home.toCheck")} count={pending.length} />
            {pending.length === 0 ? (
              <Empty>{t("empty.nothingApprove")}</Empty>
            ) : (
              <>
                <MiniGrid cards={pending} empty="" />
                <Link
                  href="/confirm"
                  className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-medium text-white shadow-blue hover:bg-blue-600"
                >
                  <Eye className="h-4 w-4" /> {t("home.checkNow")}
                </Link>
              </>
            )}
          </Panel>
          <IdeaForm compact title={t("ideas.title")} />
          <Panel className="animate-rise">
            <PanelHeader title={t("up.title")}>
              <ViewAll href="/calendar" />
            </PanelHeader>
            {upcoming.length === 0 ? (
              <Empty>{t("empty.noUpcoming")}</Empty>
            ) : (
              <div className="space-y-2.5">
                {upcoming.map((c, i) => (
                  <Upcoming key={c.id} card={c} highlight={i === 0} />
                ))}
              </div>
            )}
          </Panel>
        </div>
        {timeline}
      </div>
    );

  return (
    <div className="space-y-3">
      {/* timeline — like "Planned Absences" */}
      {timeline}

      <div className="grid gap-3 lg:grid-cols-3">
        {/* upcoming — like "Future Events" */}
        <Panel className="animate-rise">
          <PanelHeader title={t("up.title")}>
            <ViewAll href="/calendar" />
          </PanelHeader>
          {upcoming.length === 0 ? (
            <Empty>{t("empty.noUpcoming")}</Empty>
          ) : (
            <div className="space-y-2.5">
              {upcoming.map((c, i) => (
                <Upcoming key={c.id} card={c} highlight={i === 0} />
              ))}
            </div>
          )}
        </Panel>

        {/* role box — like "Onboarding" (manager only) */}
        {role === "manager" && (
          <Panel className="animate-rise">
              <PanelHeader title={t("work.title")} count={myWork.length}>
                <ViewAll href="/pipeline" />
              </PanelHeader>
              <MiniGrid cards={myWork} empty={t("empty.noChanges")} />
          </Panel>
        )}

        {/* welcome — like the AI assistant card */}
        <WelcomeCard />
      </div>
    </div>
  );
}

function ViewAll({ href }: { href: string }) {
  const { t } = useT();
  return (
    <Link href={href} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm whitespace-nowrap shadow-raised hover:bg-gray-50">
      <ArrowUpRight className="h-4 w-4" /> {t("tl.viewAll")}
    </Link>
  );
}

function Upcoming({ card, highlight }: { card: ContentCard; highlight: boolean }) {
  const { t, locale } = useT();
  const { openCard } = useUI();
  const diff = Math.round((new Date(card.plannedDate + "T00:00:00").getTime() - new Date(toISODate(new Date()) + "T00:00:00").getTime()) / 86400000);
  const when = diff === 0 ? t("up.today") : diff === 1 ? t("up.tomorrow") : t("up.inDays", { n: diff });
  return (
    <button
      onClick={() => openCard(card.id)}
      className={cn(
        "w-full rounded-2xl p-3.5 text-left transition hover:-translate-y-0.5",
        highlight ? "bg-gradient-to-br from-yellow-300 to-yellow-200 shadow-[0_12px_24px_-14px_rgba(202,138,4,0.8)]" : "border border-edge bg-surface shadow-card",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{card.title}</div>
          <div className={cn("truncate text-xs", highlight ? "text-amber-900/70" : "text-ink-mute")}>
            {placementsOf(card).map((p) => t(`pl.${p}`)).join(" · ")} · {t(`stage.${card.stage}`)}
          </div>
        </div>
        <StatusPill color={highlight ? "bg-amber-500" : "bg-primary"} className="shrink-0">
          {when}
        </StatusPill>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <GrayChip icon={Clock} className={highlight ? "bg-surface/45" : ""}>
          {card.plannedTime || "—"}
        </GrayChip>
        <GrayChip icon={CalendarDays} className={highlight ? "bg-surface/45" : ""}>
          {fmtDate(card.plannedDate, locale)}
        </GrayChip>
      </div>
    </button>
  );
}

/** 2×2 grid of small centered cards (like the "Onboarding" people cards). */
function MiniGrid({ cards, empty }: { cards: ContentCard[]; empty: string }) {
  const { t } = useT();
  const { openCard } = useUI();
  if (!cards.length) return <Empty>{empty}</Empty>;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {cards.slice(0, 4).map((c) => {
        const S = STAGE_STYLE[c.stage];
        return (
          <button
            key={c.id}
            onClick={() => openCard(c.id)}
            className={cn(
              "flex flex-col items-center rounded-2xl border p-3 text-center shadow-card transition hover:-translate-y-0.5",
              needsEdit(c) ? "border-rose-200 bg-rose-50" : "border-edge bg-surface",
            )}
          >
            {c.graphicSrc && (isImg(c.graphicSrc) || c.graphicUrl.startsWith("sb:")) && !isVideo(c.graphicUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.graphicSrc} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-surface" />
            ) : (
              <span className={cn("grid h-11 w-11 place-items-center rounded-full ring-2 ring-surface", S.bar)}>
                <S.icon className="h-4 w-4" />
              </span>
            )}
            <div className="mt-2 line-clamp-2 text-sm leading-tight font-medium">{c.title}</div>
            <div className="mt-0.5 text-xs text-ink-mute">{t(`stage.${c.stage}`)}</div>
            {confirmTab(c) && (
              <StatusPill color={REVIEW_DOT[confirmTab(c)!]} className="mt-2 ring-1 ring-line">
                {t(`cf.st.${confirmTab(c)}`)}
              </StatusPill>
            )}
          </button>
        );
      })}
    </div>
  );
}

function WelcomeCard() {
  const s = useDB();
  const { role, me } = s;
  const { t } = useT();
  const { newPost } = useUI();
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [sent, setSent] = useState(false);
  const first = (me?.fullName || "").split(" ")[0];
  const canIdea = can.addReferences(role);

  return (
    <Panel className="animate-rise flex flex-col">
      <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
        <div className="orb animate-float h-24 w-24" />
        <p className="mt-6 text-xl leading-snug font-medium tracking-tight">
          {t("welcome.title", { name: first || t(`role.${role}`) })}
          <br />
          <span className="text-ink">{t("welcome.q")}</span>
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {can.editCards(role) && (
            <Button size="sm" variant="secondary" onClick={() => newPost()}>
              <Plus className="h-3.5 w-3.5" /> {t("qa.newPost")}
            </Button>
          )}
          {can.editJobs(role) && (
            <Button size="sm" variant="secondary" onClick={() => router.push("/jobs?new=1")}>
              <Briefcase className="h-3.5 w-3.5" /> {t("qa.addJob")}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => router.push("/calendar")}>
            <CalendarDays className="h-3.5 w-3.5" /> {t("qa.openCalendar")}
          </Button>
        </div>
      </div>

      {canIdea && (
        <form
          className="mt-3 rounded-2xl border border-line bg-surface p-2.5 shadow-raised"
          onSubmit={(e) => {
            e.preventDefault();
            if (!idea.trim()) return;
            s.submitIdea(idea.trim().slice(0, 80), idea.trim().length > 80 ? idea.trim() : "");
            setIdea("");
            setSent(true);
            setTimeout(() => setSent(false), 2500);
          }}
        >
          <div className="flex items-start gap-2">
            <textarea
              rows={2}
              maxLength={300}
              className="flex-1 resize-none bg-transparent px-1 text-sm outline-none placeholder:text-ink-mute"
              placeholder={t("qa.ideaPh")}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
            <button type="submit" className="grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-frame hover:text-primary" aria-label={t("qa.sendIdea")}>
              <Send className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-ink-soft">
              <Lightbulb className="h-3.5 w-3.5" /> {sent ? t("qa.sent") : t("qa.sendIdea")}
            </span>
            <span className="text-xs text-ink-mute">{idea.length}/300</span>
          </div>
        </form>
      )}
    </Panel>
  );
}
