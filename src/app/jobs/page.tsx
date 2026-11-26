"use client";

import { HiringPostButton } from "@/components/AiTools";
import { CalendarDays, CalendarPlus, Check, ChevronDown, ChevronRight, ClipboardPaste, MapPin, PenLine, Plus, Send, Sparkles, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUI } from "@/components/Shell";
import { Badge, Button, Empty, Field, GrayChip, inputCls, JobStatusBadge, Panel, Portal, selectCls, STAGE_STYLE } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import type { ContentCard, JobOrder } from "@/lib/types";
import { addDays, can, changedLines, cn, fmtDate, jobToText, now, parseJobText, salaryText, toISODate, uid } from "@/lib/utils";

const blank = (): JobOrder => ({
  id: uid(),
  title: "",
  company: "",
  location: "",
  salaryMin: 0,
  salaryMax: 0,
  currency: "JPY",
  salaryPer: "month",
  requirements: "",
  benefits: "",
  visaType: "Specified Skilled Worker (SSW)",
  positions: 1,
  deadline: toISODate(addDays(new Date(), 30)),
  status: "open",
  rawText: "",
  rawTextBefore: "",
  needsTidy: false,
  createdAt: now(),
});

export default function JobsPage() {
  const s = useDB();
  const router = useRouter();
  const { db, role } = s;
  const { t, locale } = useT();
  const { openCard } = useUI();
  const [editing, setEditing] = useState<{ job: JobOrder; isNew: boolean } | null>(null);
  const client = role === "client";
  // client: paste a new job (true) or edit the text of one she sent (the job)
  const [pasting, setPasting] = useState<boolean | JobOrder>(false);
  const [toast, setToast] = useState("");
  const add = () => (client ? setPasting(true) : setEditing({ job: blank(), isNew: true }));

  // "+ Add job order" in the top bar links here with ?new=1
  useEffect(() => {
    if (can.editJobs(role) && new URLSearchParams(window.location.search).get("new") === "1") {
      if (role === "client") setPasting(true);
      else setEditing({ job: blank(), isNew: true });
      window.history.replaceState(null, "", "/jobs");
    }
  }, [role]);

  /** Edit a job. A job the client pasted (manager): fill empty fields with our best guess from the pasted text. */
  const edit = (j: JobOrder) => {
    if (client) return setPasting(j); // the client only edits her own text
    if (role !== "manager" || !j.needsTidy) return setEditing({ job: structuredClone(j), isNew: false });
    const g = parseJobText(j.rawText);
    const fill = <K extends keyof JobOrder>(k: K) => (j[k] ? j[k] : (g[k] ?? j[k]));
    setEditing({ job: { ...j, title: fill("title"), location: fill("location"), salaryMin: fill("salaryMin"), salaryMax: fill("salaryMax") }, isNew: false });
  };
  const jobs = [...db.jobs].sort((a, b) => Number(b.needsTidy) - Number(a.needsTidy));

  return (
    <div className="space-y-3">
    <Panel className="animate-rise">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] leading-tight font-medium tracking-tight">{t("job.title")}</h1>
          <p className="mt-0.5 text-sm text-ink-soft">{t("job.sub")}</p>
        </div>
        {can.editJobs(role) && (
          <Button onClick={add}>
            <Plus className="h-4 w-4" /> {t(client ? "qa.addJob" : "job.new")}
          </Button>
        )}
      </div>

      {db.jobs.length === 0 && <Empty>{t("empty.noJobs")}</Empty>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {jobs.map((j) => {
          const posts = db.cards.filter((c) => c.jobId === j.id);
          const closed = j.status === "closed";
          return (
            <article
              key={j.id}
              className={cn(
                "flex flex-col rounded-[20px] border bg-surface p-4 shadow-card",
                closed && "opacity-70",
                j.needsTidy ? "border-primary/40 ring-4 ring-primary/10" : "border-edge",
              )}
            >
              {j.needsTidy && (
                <Badge className="mb-2 self-start bg-primary-soft text-primary">
                  <ClipboardPaste className="h-3 w-3" /> {t(client ? "paste.sentAdmin" : j.rawTextBefore ? "paste.updatedByClient" : "paste.fromClient")}
                </Badge>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-medium text-ink">{j.title}</h2>
                  <p className="truncate text-sm text-ink-mute">{j.company || "—"}</p>
                </div>
                <JobStatusBadge status={j.status} />
              </div>

              <div
                className={cn(
                  "mt-3 rounded-2xl p-3",
                  j.status === "hot" ? "bg-linear-to-br from-yellow-300 to-yellow-200" : closed ? "bg-chip/70" : "bg-linear-to-br from-blue-100 to-blue-50",
                )}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                  <Wallet className="h-3.5 w-3.5" /> {t("job.salary")}
                </div>
                <div className="mt-0.5 text-lg font-medium text-ink">{salaryText(j, t(`f.${j.salaryPer}`))}</div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <GrayChip icon={MapPin}>{j.location}</GrayChip>
                <GrayChip icon={Users}>
                  {t("job.positions")}: {j.positions}
                </GrayChip>
                <GrayChip icon={CalendarDays}>{fmtDate(j.deadline, locale)}</GrayChip>
                <GrayChip>{j.visaType}</GrayChip>
              </div>

              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                {[
                  [t("job.requirements"), j.requirements, "text-violet-500"],
                  [t("job.benefits"), j.benefits, "text-green-500"],
                ].map(([label, text, color]) => (
                  <div key={label}>
                    <div className="mb-1 text-xs text-ink-mute">{label}</div>
                    <ul className="space-y-1">
                      {text
                        .split("\n")
                        .filter(Boolean)
                        .map((r, k) => (
                          <li key={k} className="flex gap-1.5 text-ink">
                            <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", color)} />
                            {r}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>

              {posts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {posts.map((p) => {
                    const S = STAGE_STYLE[p.stage];
                    return (
                      <button key={p.id} onClick={() => openCard(p.id)} className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full py-0.5 pr-2.5 pl-0.5 text-xs", S.bar)}>
                        <span className={cn("grid h-5 w-5 place-items-center rounded-full", S.iconWrap)}>
                          <S.icon className="h-3 w-3" />
                        </span>
                        <span className="truncate">{p.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <JobProgress posts={posts} />

              {(can.makePost(role) || can.editJobs(role)) && (
                <div className="mt-auto pt-3">
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  {can.makePost(role) && !closed && (
                    <CreatePostMenu
                      onHeadline={() => router.push(`/plan?job=${j.id}`)}
                      onPost={() => {
                        const id = s.makePostFromJob(j.id);
                        if (id) openCard(id);
                      }}
                    />
                  )}
                  {can.makePost(role) && !closed && <HiringPostButton job={j} />}
                  {can.editJobs(role) && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => edit(j)}>
                        <PenLine className="h-3.5 w-3.5" /> {t("job.edit")}
                      </Button>
                      <select
                        className="ml-auto h-8 rounded-full border border-line bg-surface px-3 text-xs text-ink shadow-raised outline-none"
                        value={j.status}
                        onChange={(e) => s.setJobStatus(j.id, e.target.value as JobOrder["status"])}
                      >
                        <option value="open">{t("jobStatus.open")}</option>
                        <option value="hot">{t("job.optHot")}</option>
                        <option value="closed">{t("job.optClosed")}</option>
                      </select>
                    </>
                  )}
                </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {editing && (
        <JobForm
          job={editing.job}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(j) => {
            s.saveJob(j);
            setEditing(null);
          }}
        />
      )}
      {pasting && (
        <PasteJobDialog
          job={typeof pasting === "object" ? pasting : undefined}
          hasPosts={typeof pasting === "object" && db.cards.some((c) => c.jobId === pasting.id)}
          onClose={() => setPasting(false)}
          onSent={(updated) => {
            setPasting(false);
            setToast(t(updated ? "paste.updated" : "paste.sent"));
            setTimeout(() => setToast(""), 2500);
          }}
        />
      )}
    </Panel>
    {toast && (
      <Portal>
        <div role="status" className="animate-rise fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-float">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-green-400" /> {toast}
          </span>
        </div>
      </Portal>
    )}
    </div>
  );
}

/** Client: paste job details from anywhere and send — or edit the text of a job she already sent. Same frame as the manager's job form. */
function PasteJobDialog({ job, hasPosts, onClose, onSent }: { job?: JobOrder; hasPosts?: boolean; onClose: () => void; onSent: (updated: boolean) => void }) {
  const s = useDB();
  const { t } = useT();
  const start = job ? job.rawText.trim() || jobToText(job) : "";
  const [text, setText] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changed = text.trim() !== start.trim();
  const guess = text.trim().length > 20 ? parseJobText(text) : {};
  const found = [guess.title, guess.location, guess.salaryMin ? `${guess.salaryMin.toLocaleString()}${guess.salaryMax !== guess.salaryMin ? "–" + guess.salaryMax?.toLocaleString() : ""} JPY` : ""].filter(Boolean);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-3 backdrop-blur-[2px] sm:p-6" onClick={onClose}>
        <form
          onClick={(e) => e.stopPropagation()}
          className="animate-rise flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-edge bg-frame shadow-float"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            if (!job) {
              s.pasteJob(text.trim(), parseJobText(text));
              return onSent(false);
            }
            setBusy(true);
            setError("");
            const failed = await s.updateJobText(job.id, text.trim());
            setBusy(false);
            if (failed) setError(failed === "err.schema" ? t("err.schemaClient") : `${t("plan.sendFailed")} (${failed})`);
            else onSent(true);
          }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
            <div>
              <h2 className="text-xl font-medium tracking-tight">{t(job ? "paste.editTitle" : "paste.title")}</h2>
              <p className="mt-0.5 text-sm text-ink-soft">{t(job ? "paste.editSub" : "paste.sub")}</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-raised" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="rounded-[20px] border border-edge bg-card p-4 shadow-card">
              <textarea autoFocus className={inputCls + " min-h-56 text-[15px] leading-relaxed"} placeholder={t("paste.ph")} value={text} onChange={(e) => setText(e.target.value)} />
              {found.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                  {t("paste.found")}:
                  {found.map((f, i) => (
                    <GrayChip key={i}>{f}</GrayChip>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-frame px-6 py-4">
            {error ? (
              <p role="alert" className="mr-auto text-sm text-rose-600">{error}</p>
            ) : (
              job && hasPosts && <p className="mr-auto text-xs text-ink-mute">{t("paste.editNote")}</p>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("btn.cancel")}
            </Button>
            <Button type="submit" disabled={!text.trim() || (!!job && !changed) || busy}>
              <Send className="h-4 w-4" /> {t(job ? "paste.update" : "paste.send")}
            </Button>
          </div>
        </form>
      </div>
    </Portal>
  );
}

/** Manager: "Create post" — add the headline to the Content Calendar (Draft) or write the full post now (Draft). */
function CreatePostMenu({ onHeadline, onPost }: { onHeadline: () => void; onPost: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const item = "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-frame";
  return (
    <div ref={ref} className="relative">
      <Button size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Sparkles className="h-3.5 w-3.5" /> {t("job.createPost")} <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <div role="menu" className="animate-rise absolute bottom-11 left-0 z-30 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-float">
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onHeadline();
            }}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <CalendarPlus className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-medium text-ink">{t("job.toPlan")}</span>
              <span className="block text-xs text-ink-mute">{t("job.toPlanSub")}</span>
            </span>
          </button>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onPost();
            }}
          >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", STAGE_STYLE.draft.chip)}>
              <PenLine className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-medium text-ink">{t("job.writePost")}</span>
              <span className="block text-xs text-ink-mute">{t("job.writePostSub")}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Where this job's content is: No content yet → In calendar → Approved → Published. */
function JobProgress({ posts }: { posts: ContentCard[] }) {
  const { t } = useT();
  const { openCard } = useUI();
  const published = posts.find((p) => p.stage === "published");
  const approved = posts.find((p) => p.plan.status === "approved");
  const inPlan = posts.find((p) => p.plan.status !== "approved");
  const step = published ? 3 : approved ? 2 : posts.length ? 1 : 0;
  const steps = [
    { key: "job.prog.none", dot: STAGE_STYLE.idea.dot },
    { key: "job.prog.plan", dot: STAGE_STYLE.draft.dot },
    { key: "job.prog.approved", dot: STAGE_STYLE.approved.dot },
    { key: "job.prog.published", dot: STAGE_STYLE.published.dot },
  ];
  const target = published ?? approved ?? inPlan;
  const content = (
    <span className="flex flex-wrap items-center gap-1 text-[11px]">
      {steps.slice(step === 0 ? 0 : 1).map((s, i) => {
        const idx = step === 0 ? 0 : i + 1;
        const on = idx === step;
        const past = idx < step;
        return (
          <span key={s.key} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-ink-mute/70" />}
            <span className={cn("h-1.5 w-1.5 rounded-full", on || past ? s.dot : "bg-chip")} />
            <span className={on ? "font-medium text-ink" : past ? "text-ink-soft" : "text-ink-mute"}>{t(s.key)}</span>
          </span>
        );
      })}
    </span>
  );
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-frame/70 px-2.5 py-1.5">
      <span className="text-[11px] text-ink-mute">{t("job.prog.title")}</span>
      {!target ? (
        content
      ) : target.stage === "idea" ? (
        <Link href="/plan" className="rounded-md hover:bg-surface/70">
          {content}
        </Link>
      ) : (
        <button onClick={() => openCard(target.id)} className="rounded-md text-left hover:bg-surface/70">
          {content}
        </button>
      )}
    </div>
  );
}

function JobForm({ job, isNew, onClose, onSave }: { job: JobOrder; isNew: boolean; onClose: () => void; onSave: (j: JobOrder) => void }) {
  const { t } = useT();
  const [j, setJ] = useState(job);
  const set = (p: Partial<JobOrder>) => setJ({ ...j, ...p });
  const raw = job.rawText?.trim() ?? ""; // decides the two-column layout (stays stable while typing)
  const text = j.rawText ?? "";
  const before = job.needsTidy ? (job.rawTextBefore?.trim() ?? "") : "";
  const diff = before ? changedLines(text, before) : new Set<number>();
  const [editingText, setEditingText] = useState(false);
  /** Re-read the (edited) text and put what we recognise into the fields. */
  const fillFromText = () => {
    const g = parseJobText(text);
    set({
      ...(g.title && { title: g.title }),
      ...(g.location && { location: g.location }),
      ...(g.salaryMin && { salaryMin: g.salaryMin, salaryMax: g.salaryMax ?? g.salaryMin }),
      ...(g.currency && { currency: g.currency }),
      ...(g.salaryPer && { salaryPer: g.salaryPer }),
      ...(g.positions && { positions: g.positions }),
    });
  };
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-3 backdrop-blur-[2px] sm:p-6" onClick={onClose}>
        <form
          onClick={(e) => e.stopPropagation()}
          className={cn("animate-rise flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[28px] border border-edge bg-frame shadow-float", raw ? "max-w-6xl" : "max-w-2xl")}
          onSubmit={(e) => {
            e.preventDefault();
            onSave(j);
          }}
        >
          {/* header (stays visible) */}
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
            <div>
              <h2 className="text-xl font-medium tracking-tight">{isNew ? t("job.formNew") : t("job.formEdit")}</h2>
              {job.needsTidy && <p className="mt-0.5 text-sm text-ink-soft">{t("paste.tidyHint")}</p>}
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-raised" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* body (scrolls) */}
          <div className={cn("min-h-0 flex-1 overflow-y-auto p-4 sm:p-6", raw && "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]")}>
            {raw && (
              <div className="rounded-[20px] border border-primary/20 bg-primary-soft/30 p-4 lg:sticky lg:top-0 lg:max-h-full lg:self-start lg:overflow-y-auto">
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-primary">
                  <ClipboardPaste className="h-3.5 w-3.5" /> {t("paste.raw")}
                  {diff.size > 0 && (
                    <Badge className={STAGE_STYLE.review.chip}>
                      <PenLine className="h-3 w-3" /> {t("paste.changedLines", { n: diff.size })}
                    </Badge>
                  )}
                  <Button type="button" size="sm" variant={editingText ? "primary" : "secondary"} className="ml-auto h-7" onClick={() => setEditingText(!editingText)}>
                    {editingText ? <Check className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />} {t(editingText ? "paste.doneText" : "paste.editText")}
                  </Button>
                </div>
                {editingText ? (
                  <div className="space-y-2">
                    <textarea autoFocus className={cn(inputCls, "min-h-72 resize-y py-2 text-sm leading-relaxed")} value={text} onChange={(e) => set({ rawText: e.target.value })} />
                    <Button type="button" size="sm" variant="ghost" onClick={fillFromText}>
                      <Sparkles className="h-3.5 w-3.5" /> {t("paste.fillFields")}
                    </Button>
                  </div>
                ) : (
                  <div className="font-sans text-sm leading-relaxed text-ink">
                    {text.split("\n").map((line, i) => (
                      <div key={i} className={cn("min-h-[1.6em] whitespace-pre-wrap", diff.has(i) && "-mx-1 rounded bg-yellow-100 px-1")}>
                        {line}
                      </div>
                    ))}
                  </div>
                )}
                {before && (
                  <details className="mt-3 rounded-xl bg-surface/70 px-3 py-2 ring-1 ring-line">
                    <summary className="cursor-pointer text-xs font-medium text-ink-soft">{t("paste.before")}</summary>
                    <pre className="mt-2 font-sans text-xs leading-relaxed whitespace-pre-wrap text-ink-mute line-through decoration-ink-mute/40">{before}</pre>
                  </details>
                )}
              </div>
            )}
            <div className="grid content-start gap-3 rounded-[20px] border border-edge bg-card p-4 shadow-card sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={`${t("f.jobTitle")} *`}>
                  <input required className={inputCls} value={j.title} onChange={(e) => set({ title: e.target.value })} placeholder="Food Factory Worker" />
                </Field>
              </div>
              <Field label={t("f.company")}>
                <input className={inputCls} value={j.company} onChange={(e) => set({ company: e.target.value })} />
              </Field>
              <Field label={`${t("f.location")} *`}>
                <input required className={inputCls} value={j.location} onChange={(e) => set({ location: e.target.value })} placeholder="Aichi, Japan" />
              </Field>
              <Field label={`${t("f.salaryFrom")} *`}>
                <input required type="number" min={0} className={inputCls} value={j.salaryMin || ""} onChange={(e) => set({ salaryMin: +e.target.value })} />
              </Field>
              <Field label={t("f.salaryTo")}>
                <input type="number" min={0} className={inputCls} value={j.salaryMax || ""} onChange={(e) => set({ salaryMax: +e.target.value })} />
              </Field>
              <Field label={t("f.currency")}>
                <select className={selectCls} value={j.currency} onChange={(e) => set({ currency: e.target.value })}>
                  <option>JPY</option>
                  <option>USD</option>
                  <option>MMK</option>
                </select>
              </Field>
              <Field label={t("f.per")}>
                <select className={selectCls} value={j.salaryPer} onChange={(e) => set({ salaryPer: e.target.value as JobOrder["salaryPer"] })}>
                  <option value="month">{t("f.month")}</option>
                  <option value="hour">{t("f.hour")}</option>
                </select>
              </Field>
              <Field label={t("f.visa")}>
                <input className={inputCls} value={j.visaType} onChange={(e) => set({ visaType: e.target.value })} />
              </Field>
              <Field label={t("f.positions")}>
                <input type="number" min={1} className={inputCls} value={j.positions} onChange={(e) => set({ positions: +e.target.value })} />
              </Field>
              <Field label={t("f.requirements")} hint={t("f.onePerLine")}>
                <textarea rows={5} className={inputCls} value={j.requirements} onChange={(e) => set({ requirements: e.target.value })} placeholder={"Age 20–35\nJLPT N4"} />
              </Field>
              <Field label={t("f.benefits")} hint={t("f.onePerLine")}>
                <textarea rows={5} className={inputCls} value={j.benefits} onChange={(e) => set({ benefits: e.target.value })} placeholder={"Dormitory\nTransport allowance"} />
              </Field>
              <Field label={t("f.deadline")}>
                <input type="date" className={inputCls} value={j.deadline} onChange={(e) => set({ deadline: e.target.value })} />
              </Field>
            </div>
          </div>

          {/* footer (stays visible) */}
          <div className="flex justify-end gap-2 border-t border-line bg-frame px-6 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("btn.cancel")}
            </Button>
            <Button type="submit">{t("btn.saveJob")}</Button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
