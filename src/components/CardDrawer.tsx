"use client";

import { ArrowUp, Briefcase, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, PenLine, Send, Trash, X } from "lucide-react";
import { AiCardActions } from "./AiTools";
import MediaField from "./MediaField";
import PlacementPicker from "./PlacementPicker";
import PlacementSwitch from "./PlacementSwitch";
import ReviewNote from "./ReviewNote";
import PostPreview from "./PostPreview";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import { CATEGORIES, STAGES, VERTICAL, type ContentCard, type Placement } from "@/lib/types";
import { can, cn, confirmTab, fmtDateTime, placementsOf } from "@/lib/utils";
import { Alert, Avatar, Button, Field, inputCls, JobStatusBadge, PlacementMark, PlatformMark, REVIEW_DOT, selectCls, STAGE_STYLE, StageBadge, StatusPill } from "./ui";

export default function CardDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useDB();
  const { db, role } = s;
  const { t, locale } = useT();
  const card = db.cards.find((c) => c.id === id);
  const [draft, setDraft] = useState<ContentCard | null>(card ? structuredClone(card) : null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pv, setPv] = useState<Placement>(card ? placementsOf(card)[0] : "fb_post");
  // the post changed elsewhere (e.g. its hiring caption arrived a moment later, or a live update) and
  // nothing was typed here yet → show the new version instead of the snapshot taken when the editor opened
  const seen = useRef(card);
  useEffect(() => {
    if (card && seen.current !== card && draft && seen.current && !hasChanges(seen.current, draft)) setDraft(structuredClone(card));
    seen.current = card;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

  if (!card || !draft) return null;

  const editable = can.editCards(role);
  const job = db.jobs.find((j) => j.id === card.jobId);
  const dirty = hasChanges(card, draft);
  const set = (p: Partial<ContentCard>) => setDraft({ ...draft, ...p });
  const idx = STAGES.indexOf(card.stage);
  const S = STAGE_STYLE[card.stage];

  const move = (dir: -1 | 1) => {
    const to = STAGES[idx + dir];
    if (!to) return;
    const r = s.moveStage(card.id, to);
    setError(r.ok ? "" : r.error);
  };

  const decide = (d: "approved" | "changes") => {
    if (d === "changes" && !note.trim()) {
      setError("cf.writeNote");
      return;
    }
    s.clientDecide(card.id, d, note.trim());
    setNote("");
    setError("");
  };

  const rv = card.review.status;
  const tab = confirmTab(card);
  const needsMe = can.reviewPosts(role) && rv === "review";
  const sendReview = () => {
    const r = s.sendForReview(card.id, pickEditable(draft));
    if (r.ok && dirty) s.updateCard(card.id, pickEditable(draft));
    setError(r.ok ? "" : r.error);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="animate-slide-in absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-edge bg-frame shadow-float sm:inset-y-3 sm:right-3 sm:rounded-[28px] sm:border">
        {/* header */}
        <div className="p-5 pb-4">
          <div className="flex items-start gap-3">
            <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", S.bar)}>
              <S.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl leading-tight font-medium tracking-tight text-ink">{card.title}</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <StageBadge stage={card.stage} />
                {tab && tab !== "published" && (
                  <StatusPill color={REVIEW_DOT[tab]} className="px-2 py-1 text-[11px] ring-1 ring-line">
                    {t(`cf.st.${tab}`)}
                  </StatusPill>
                )}
              </div>
            </div>
            <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-raised hover:text-ink" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* stepper */}
          <div className="mt-5 grid grid-cols-6 gap-1.5">
            {STAGES.map((st, i) => {
              const SS = STAGE_STYLE[st];
              return (
                <div key={st} className="flex flex-col items-center gap-1">
                  <span className={cn("h-1.5 w-full rounded-full", i <= idx ? SS.lane : "bg-chip")} />
                  <span className={cn("hidden text-[10px] sm:block", i === idx ? "font-medium text-ink" : "text-ink-mute")}>{t(`stage.${st}`)}</span>
                </div>
              );
            })}
          </div>
          {editable && (
            <div className="mt-3 flex justify-between gap-2">
              <Button variant="secondary" size="sm" disabled={idx === 0} onClick={() => move(-1)}>
                <ChevronLeft className="h-4 w-4" /> {idx > 0 ? t(`stage.${STAGES[idx - 1]}`) : ""}
              </Button>
              <Button size="sm" disabled={idx === STAGES.length - 1} onClick={() => move(1)}>
                {idx < STAGES.length - 1 ? t(`stage.${STAGES[idx + 1]}`) : ""} <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6">
          {job?.status === "closed" && <Alert>{t("d.closedJob")}</Alert>}
          {error && <Alert onClose={() => setError("")}>{t(error)}</Alert>}

          {/* client review */}
          <section
            className={cn(
              "rounded-[20px] border p-4",
              rv === "changes" ? "border-rose-200 bg-rose-50" : needsMe ? "border-yellow-200 bg-gradient-to-br from-yellow-100 to-yellow-50" : "border-edge bg-card shadow-card",
            )}
          >
            <h3 className="mb-1 text-sm font-medium text-ink">{rv === "changes" ? t("d.clientWants") : t("d.review")}</h3>
            {rv === "changes" && card.review.note && <ReviewNote note={card.review.note} className="mb-2 rounded-xl bg-surface p-3 text-sm ring-1 ring-rose-200" />}
            <p className="text-sm text-ink-soft">
              {rv === "none" ? t("d.reviewNone") : rv === "review" ? t("d.reviewWaiting") : rv === "approved" ? t("d.reviewApproved") : ""}
            </p>

            {editable && (rv === "none" || rv === "changes") && card.stage !== "published" && (
              <Button className="mt-3" size="sm" variant={rv === "changes" ? "primary" : "secondary"} onClick={sendReview}>
                <Send className="h-3.5 w-3.5" /> {rv === "changes" ? t("d.sendAgain") : t("d.sendReview")}
              </Button>
            )}

            {needsMe && (
              <div className="mt-3 space-y-2">
                <textarea className={inputCls} rows={2} placeholder={t("cf.notePh")} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="danger" onClick={() => decide("changes")}>
                    <PenLine className="h-4 w-4" /> {t("cf.needEdit")}
                  </Button>
                  <Button variant="success" onClick={() => decide("approved")}>
                    <Check className="h-4 w-4" /> {t("cf.approve")}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* preview */}
          <section className="rounded-[20px] border border-edge bg-card p-4 shadow-card">
            {(() => {
              const pls = placementsOf(editable ? draft : card);
              const shown = pls.includes(pv) ? pv : pls[0];
              return (
                <>
                  <PlacementSwitch options={pls} value={shown} onChange={setPv} className="mb-3" />
                  <PostPreview card={editable ? draft : card} placement={shown} />
                </>
              );
            })()}
          </section>

          {/* where it goes + content for each */}
          {editable && (
            <section className="space-y-4 rounded-[20px] border border-edge bg-card p-4 shadow-card">
              <div className="rounded-2xl bg-primary-soft/50 p-3 ring-1 ring-primary/10">
                <h3 className="mb-2 text-xs font-medium text-ink-soft">{t("ai.tools")}</h3>
                <AiCardActions card={draft} tools={["draft", "check", "tiktok", "boost"]} onApply={(p) => setDraft((d) => (d ? { ...d, ...p } : d))} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink">{t("d.postOn")}</h3>
                <PlacementPicker value={draft.placements} onChange={(placements) => set({ placements })} />
              </div>

              {(draft.placements.includes("fb_post") || draft.placements.includes("fb_reel")) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
                      <PlatformMark platform="facebook" /> {t("d.fbCaption")}
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard?.writeText(draft.caption);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("d.copied") : t("d.copyCaption")}
                    </Button>
                  </div>
                  <textarea className={inputCls + " text-[13px] leading-relaxed"} rows={8} value={draft.caption} onChange={(e) => set({ caption: e.target.value })} />
                </div>
              )}

              {draft.placements.includes("fb_post") && (
                <MediaField
                  label={t("d.fbGraphic")}
                  value={draft.graphicUrl}
                  src={draft.graphicSrc}
                  folder={`cards/${card.id}`}
                  onChange={(graphicUrl, graphicSrc) => set({ graphicUrl, graphicSrc })}
                />
              )}

              {draft.placements.some((p) => VERTICAL.includes(p)) && (
                <MediaField
                  label={t("d.vertical")}
                  value={draft.tiktokMediaUrl}
                  src={draft.tiktokSrc}
                  folder={`cards/${card.id}`}
                  onChange={(tiktokMediaUrl, tiktokSrc) => set({ tiktokMediaUrl, tiktokSrc })}
                />
              )}

              {draft.placements.includes("tiktok") && (
                <div className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
                    <PlacementMark placement="tiktok" /> {t("d.ttCaption")}
                  </h3>
                  <textarea className={inputCls + " text-[13px] leading-relaxed"} rows={4} value={draft.tiktokCaption} onChange={(e) => set({ tiktokCaption: e.target.value })} />
                </div>
              )}
            </section>
          )}

          {/* details */}
          <section className="rounded-[20px] border border-edge bg-card p-4 shadow-card">
            <h3 className="mb-3 text-sm font-medium text-ink">{t("d.details")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={t("f.title")}>
                  <input className={inputCls} disabled={!editable} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
                </Field>
              </div>
              <Field label={t("f.category")}>
                <select className={selectCls} disabled={!editable} value={draft.category} onChange={(e) => set({ category: e.target.value as ContentCard["category"] })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`cat.${c}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("f.postDate")}>
                <input type="date" className={inputCls} disabled={!can.moveDates(role)} value={draft.plannedDate} onChange={(e) => set({ plannedDate: e.target.value })} />
              </Field>
              <Field label={t("f.time")}>
                <input type="time" className={inputCls} disabled={!editable} value={draft.plannedTime} onChange={(e) => set({ plannedTime: e.target.value })} />
              </Field>
              {editable && (
                <>
                  <Field label={t("f.sourceLink")} hint={t("f.sourceHint")}>
                    <input className={inputCls} value={draft.sourceLink} onChange={(e) => set({ sourceLink: e.target.value })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={t("col.notes")}>
                      <textarea rows={3} className={inputCls} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
                    </Field>
                  </div>
                </>
              )}
              {job && (
                <div className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
                  <Briefcase className="h-4 w-4" /> {t("d.job")}: <b className="font-medium text-ink">{job.title}</b> <JobStatusBadge status={job.status} />
                </div>
              )}
            </div>

            {(editable || can.moveDates(role)) && (
              <div className="mt-4 flex items-center gap-2">
                <Button disabled={!dirty} onClick={() => (editable ? s.updateCard(card.id, pickEditable(draft)) : s.setDate(card.id, draft.plannedDate))}>
                  {t("d.saveChanges")}
                </Button>
                {editable && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(t("d.deleteConfirm"))) {
                        s.deleteCard(card.id);
                        onClose();
                      }
                    }}
                  >
                    <Trash className="h-4 w-4" /> {t("d.delete")}
                  </Button>
                )}
              </div>
            )}
          </section>

          {/* versions */}
          {card.versions.length > 0 && can.seeAllCards(role) && (
            <section className="rounded-[20px] border border-edge bg-card p-4 shadow-card">
              <button className="flex w-full items-center justify-between text-sm font-medium text-ink" onClick={() => setShowVersions(!showVersions)}>
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-ink-soft" /> {t("d.versions")} ({card.versions.length})
                </span>
                <ChevronDown className={cn("h-4 w-4 text-ink-mute transition", showVersions && "rotate-180")} />
              </button>
              {showVersions && (
                <ul className="mt-3 space-y-2">
                  {card.versions.map((v, i) => (
                    <li key={i} className="rounded-xl bg-surface p-3 text-xs ring-1 ring-line">
                      <div className="mb-1 font-medium text-ink-soft">
                        v{card.versions.length - i} · {t("d.saved")} {fmtDateTime(v.at, locale)}
                      </div>
                      <pre className="max-h-32 overflow-auto font-sans whitespace-pre-wrap text-ink">{v.caption || t("d.emptyCaption")}</pre>
                      {v.graphicUrl && (
                        <div className="mt-1 truncate text-ink-mute">
                          {t("d.graphic")}: {v.graphicUrl}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* comments */}
          {can.seeAllCards(role) && (
            <section className="space-y-3 rounded-[20px] border border-edge bg-card p-4 shadow-card">
              <h3 className="text-sm font-medium text-ink">{t("d.comments")}</h3>
              {card.comments.length === 0 && <p className="text-sm text-ink-mute">{t("d.noComments")}</p>}
              {card.comments.map((c) => {
                const mine = c.by === role;
                const who = c.byName ?? t(`role.${c.by}`);
                return (
                  <div key={c.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                    <Avatar name={who} className="h-8 w-8 text-xs" />
                    <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", mine ? "rounded-tr-md bg-primary text-white" : "rounded-tl-md bg-surface text-ink ring-1 ring-line")}>
                      <div className={cn("mb-0.5 text-[11px]", mine ? "text-white/80" : "text-ink-mute")}>
                        <b className="font-medium">{who}</b> · {fmtDateTime(c.at, locale)}
                      </div>
                      {c.text}
                    </div>
                  </div>
                );
              })}
              {can.comment(role) && (
                <form
                  className="rounded-2xl border border-line bg-surface p-2 shadow-raised"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (comment.trim()) {
                      s.addComment(card.id, comment.trim());
                      setComment("");
                    }
                  }}
                >
                  <textarea
                    rows={2}
                    className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-ink-mute"
                    placeholder={t("d.commentPh")}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={!comment.trim()}>
                      {t("d.send")} <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </form>
              )}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function pickEditable(c: ContentCard): Partial<ContentCard> {
  const { title, category, format, jobId, caption, tiktokCaption, hashtags, cta, graphicUrl, tiktokMediaUrl, sourceLink, plannedDate, plannedTime, publishedUrl, placements, notes } = c;
  return { title, category, format, jobId, caption, tiktokCaption, hashtags, cta, graphicUrl, tiktokMediaUrl, sourceLink, plannedDate, plannedTime, publishedUrl, placements, notes };
}

function hasChanges(a: ContentCard, b: ContentCard) {
  return JSON.stringify(pickEditable(a)) !== JSON.stringify(pickEditable(b));
}
