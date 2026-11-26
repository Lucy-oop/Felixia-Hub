"use client";

import {
  ArrowRight,
  Check,
  Clapperboard,
  Copy,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { callAI } from "@/lib/ai-client";
import {
  designNotes,
  formatScript,
  type BoostAdvice,
  type ComplianceIssue,
  type ComplianceResult,
  type DraftPostResult,
  type HiringPostResult,
  type RepurposeResult,
  type TikTokScript,
} from "@/lib/ai-shared";
import { detectHiringVisa, HIRING_VISA_LABEL, type HiringVisa } from "@/lib/hiring-templates";
import { useT, type Lang } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import type { ContentCard, JobOrder, Placement, Platform } from "@/lib/types";
import { cn, placementsOf } from "@/lib/utils";
import { useUI } from "./Shell";
import { Alert, Button, Field, inputCls, Portal } from "./ui";

/* ---------- shared bits ---------- */

const areaCls = cn(inputCls, "resize-y py-2 text-[13px] leading-relaxed");
const isFacebook = (c: ContentCard) =>
  placementsOf(c).some((p) => p.startsWith("fb_"));
const appendNotes = (notes: string, block: string) =>
  [notes.trim(), block && `— AI —\n${block}`].filter(Boolean).join("\n\n");

/**
 * One AI request at a time: spinner state, error, and a cooldown countdown after a rate limit (429).
 * Buttons should be disabled while `blocked`.
 */
function useAiCall() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [until]);
  const wait = Math.max(0, Math.ceil((until - now) / 1000));

  const run = useCallback(
    async <T,>(path: string, body: unknown): Promise<T | undefined> => {
      setBusy(true);
      setError("");
      const r = await callAI<T>(path, body);
      setBusy(false);
      if (r.retryAfter) {
        setUntil(Date.now() + r.retryAfter * 1000);
        setNow(Date.now());
        setError(r.error === "ai.err.overloaded" ? "busy" : "rate");
        return undefined;
      }
      if (r.error || !r.data) {
        setError(r.error ?? "ai.err.bad");
        return undefined;
      }
      return r.data;
    },
    [],
  );

  return {
    busy,
    wait,
    cooling: wait > 0,
    blocked: busy || wait > 0,
    error,
    clearError: () => setError(""),
    run,
  };
}
type AiCall = ReturnType<typeof useAiCall>;

function AiError({ ai }: { ai: AiCall }) {
  const { t } = useT();
  if (!ai.error) return null;
  if (ai.error === "rate" || ai.error === "busy")
    return (
      <Alert tone="amber" onClose={ai.clearError}>
        ⚠{" "}
        {ai.cooling
          ? t(ai.error === "busy" ? "ai.overloaded" : "ai.rateLimit", {
              n: ai.wait,
            })
          : t("ai.rateReady")}
      </Alert>
    );
  return <Alert onClose={ai.clearError}>⚠ {t(ai.error)}</Alert>;
}

/** Generate / try-again button with spinner and rate-limit countdown. */
function GenButton({
  ai,
  again,
  onClick,
  disabled,
  variant,
}: {
  ai: AiCall;
  again?: boolean;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const { t } = useT();
  return (
    <Button
      variant={variant ?? (again ? "secondary" : "primary")}
      disabled={ai.blocked || disabled}
      onClick={onClick}
    >
      {ai.busy ? (
        <Spinner />
      ) : ai.cooling ? (
        <RefreshCw className="h-4 w-4" />
      ) : (
        <Wand2 className="h-4 w-4" />
      )}{" "}
      {ai.busy
        ? t("ai.working")
        : ai.cooling
          ? t("ai.retryIn", { n: ai.wait })
          : again
            ? t("ai.again")
            : t("ai.generate")}
    </Button>
  );
}

/** Runs once when a dialog opens (guarded so React Strict Mode doesn't send it twice). */
function useRunOnce(fn: () => void) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function AiModal({
  title,
  sub,
  onClose,
  children,
  footer,
  wide,
  locked,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  locked?: boolean;
}) {
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-ink/25 p-4 backdrop-blur-[3px] sm:items-center"
        onClick={() => !locked && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "animate-rise w-full space-y-4 rounded-[28px] border border-edge bg-frame p-6 shadow-float",
            wide ? "max-w-3xl" : "max-w-xl",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-2xl font-medium tracking-tight">
                <Sparkles className="h-5 w-5 shrink-0 text-primary" /> {title}
              </h2>
              {sub && (
                <p className="mt-1 truncate text-sm text-ink-soft">{sub}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-soft shadow-raised"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-chip/70 p-1">
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
            value === o.id
              ? "bg-surface text-ink shadow-raised"
              : "text-ink-soft hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LangChoice({
  value,
  onChange,
}: {
  value: Lang;
  onChange: (l: Lang) => void;
}) {
  const { t } = useT();
  return (
    <Field label={t("ai.lang")}>
      <div>
        <Choice<Lang>
          value={value}
          onChange={onChange}
          options={[
            { id: "my", label: "MM" },
            { id: "en", label: "EN" },
            { id: "ja", label: "JP" },
          ]}
        />
      </div>
    </Field>
  );
}

function Spinner() {
  return (
    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />
  );
}

function Busy({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl bg-surface py-8 text-sm text-ink-soft ring-1 ring-line">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />{" "}
      {text}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}{" "}
      {done ? t("d.copied") : t("ai.copy")}
    </Button>
  );
}

function GraphicFields({
  headline,
  idea,
  onChange,
}: {
  headline: string;
  idea: string;
  onChange: (p: { graphic_headline?: string; visual_idea?: string }) => void;
}) {
  const { t } = useT();
  return (
    <div className="grid gap-3 rounded-2xl bg-primary-soft/40 p-3 ring-1 ring-primary/10 sm:grid-cols-2">
      <Field label={t("ai.graphicHeadline")} hint={t("ai.graphicHint")}>
        <input
          className={inputCls}
          value={headline}
          onChange={(e) => onChange({ graphic_headline: e.target.value })}
        />
      </Field>
      <Field label={t("ai.visualIdea")}>
        <input
          className={inputCls}
          value={idea}
          onChange={(e) => onChange({ visual_idea: e.target.value })}
        />
      </Field>
    </div>
  );
}

function ScriptFields({
  script,
  onChange,
}: {
  script: TikTokScript;
  onChange: (s: TikTokScript) => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
      <Field label={t("ai.script.hook")}>
        <input
          className={inputCls}
          value={script.hook}
          onChange={(e) => onChange({ ...script, hook: e.target.value })}
        />
      </Field>
      <Field label={t("ai.script.spoken")}>
        <textarea
          rows={5}
          className={areaCls}
          value={script.spoken}
          onChange={(e) => onChange({ ...script, spoken: e.target.value })}
        />
      </Field>
      <Field label={t("ai.script.onScreen")} hint={t("ai.script.onScreenHint")}>
        <textarea
          rows={4}
          className={areaCls}
          value={script.on_screen.join("\n")}
          onChange={(e) =>
            onChange({ ...script, on_screen: e.target.value.split("\n") })
          }
        />
      </Field>
      <Field label={t("ai.script.cta")}>
        <input
          className={inputCls}
          value={script.cta}
          onChange={(e) => onChange({ ...script, cta: e.target.value })}
        />
      </Field>
    </div>
  );
}
const tidyScript = (s: TikTokScript): TikTokScript => ({
  ...s,
  on_screen: s.on_screen.map((x) => x.trim()).filter(Boolean),
});

/* ---------- 1. Hiring post from a job ---------- */

export function HiringPostButton({ job }: { job: JobOrder }) {
  const { role } = useDB();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (role !== "manager") return null;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5 text-primary" /> {t("ai.hiring.btn")}
      </Button>
      {open && <HiringPostDialog job={job} onClose={() => setOpen(false)} />}
    </>
  );
}

function HiringPostDialog({
  job,
  onClose,
}: {
  job: JobOrder;
  onClose: () => void;
}) {
  const s = useDB();
  const { t, lang: uiLang } = useT();
  const { openCard } = useUI();
  const ai = useAiCall();
  const [lang, setLang] = useState<Lang>(uiLang);
  const [r, setR] = useState<HiringPostResult | null>(null);
  // raw job data (pre-filled with the client's paste) + visa template: auto-detected unless the manager picks one
  const [raw, setRaw] = useState(job.rawText ?? "");
  const [visaPick, setVisaPick] = useState<HiringVisa | null>(null);
  const detected = detectHiringVisa(raw);
  const visa: HiringVisa = visaPick ?? detected ?? "tokutei";

  const generate = async () => {
    const data = await ai.run<HiringPostResult>("hiring-post", {
      jobId: job.id,
      lang,
      visa,
      rawText: raw,
    });
    if (data) setR(data);
  };
  const create = () => {
    if (!r) return;
    const id = s.newCard({
      title: r.title.trim() || `${job.title} — hiring post`,
      jobId: job.id,
      category: "Hiring",
      stage: "draft",
      caption: r.caption,
      tiktokCaption: r.tiktok_caption,
      hashtags: r.hashtags,
      cta: r.cta,
      notes: designNotes(r.graphic_headline, r.visual_idea),
    });
    onClose();
    openCard(id);
  };

  return (
    <AiModal
      wide
      locked={ai.busy}
      title={t("ai.hiring.title")}
      sub={`${job.title}${job.location ? ` · ${job.location}` : ""}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("btn.cancel")}
          </Button>
          <GenButton ai={ai} again={!!r} onClick={generate} />
          {r && (
            <Button disabled={ai.busy} onClick={create}>
              <Check className="h-4 w-4" /> {t("ai.hiring.create")}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <LangChoice value={lang} onChange={setLang} />
        <Field label={t("ai.hiring.visa")}>
          <div>
            <Choice<HiringVisa>
              value={visa}
              onChange={setVisaPick}
              options={[
                { id: "tokutei", label: HIRING_VISA_LABEL.tokutei },
                { id: "katsudo", label: HIRING_VISA_LABEL.katsudo },
              ]}
            />
            <p className="mt-1.5 text-xs text-ink-mute">
              {detected
                ? t("ai.hiring.detected", { v: HIRING_VISA_LABEL[detected] })
                : t("ai.hiring.notDetected")}
            </p>
          </div>
        </Field>
      </div>
      <Field label={t("ai.hiring.raw")} hint={t("ai.hiring.rawHint")}>
        <textarea
          rows={r ? 5 : 10}
          className={areaCls}
          value={raw}
          disabled={ai.busy}
          onChange={(e) => setRaw(e.target.value)}
        />
      </Field>
      <AiError ai={ai} />
      {ai.busy && !r && <Busy text={t("ai.working")} />}
      {r && (
        <div
          className={cn(
            "space-y-3",
            ai.busy && "pointer-events-none opacity-50",
          )}
        >
          {r.source === "template" && (
            <div className="flex items-start gap-2 rounded-2xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("ai.hiring.exact")}
            </div>
          )}
          {!!r.missing?.length && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="mb-1 font-medium">{t("ai.hiring.missing")}</div>
              <ul className="space-y-0.5">
                {r.missing.map((m, i) => (
                  <li key={i}>
                    <span className="text-amber-700">{m.label}:</span> {m.value}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label={t("f.title")}>
            <input
              className={inputCls}
              value={r.title}
              onChange={(e) => setR({ ...r, title: e.target.value })}
            />
          </Field>
          <GraphicFields
            headline={r.graphic_headline}
            idea={r.visual_idea}
            onChange={(p) => setR({ ...r, ...p })}
          />
          <Field label={t("d.fbCaption")}>
            <textarea
              rows={12}
              className={areaCls}
              value={r.caption}
              onChange={(e) => setR({ ...r, caption: e.target.value })}
            />
          </Field>
          <Field label={t("d.ttCaption")}>
            <textarea
              rows={3}
              className={areaCls}
              value={r.tiktok_caption}
              onChange={(e) => setR({ ...r, tiktok_caption: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("ai.hashtags")}>
              <input
                className={inputCls}
                value={r.hashtags}
                onChange={(e) => setR({ ...r, hashtags: e.target.value })}
              />
            </Field>
            <Field label={t("ai.cta")}>
              <input
                className={inputCls}
                value={r.cta}
                onChange={(e) => setR({ ...r, cta: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-ink-mute">{t("ai.hiring.hint")}</p>
        </div>
      )}
    </AiModal>
  );
}

/* ---------- 2–5. Per-post tools ---------- */

type Tool = "draft" | "check" | "tiktok" | "boost";

/**
 * Manager-only AI buttons for one post.
 * `card` may be the unsaved editor draft; `onApply` receives changes (default: saved straight to the post).
 * The TikTok button only shows for Facebook posts that have a caption.
 */
export function AiCardActions({
  card,
  tools = ["draft", "check", "tiktok"],
  onApply,
  compact,
  className,
}: {
  card: ContentCard;
  tools?: Tool[];
  onApply?: (patch: Partial<ContentCard>) => void;
  compact?: boolean;
  className?: string;
}) {
  const s = useDB();
  const { t } = useT();
  const [open, setOpen] = useState<Tool | null>(null);
  if (s.role !== "manager") return null;
  const apply =
    onApply ?? ((p: Partial<ContentCard>) => s.updateCard(card.id, p));
  const shown = tools.filter(
    (x) => x !== "tiktok" || (isFacebook(card) && card.caption.trim()),
  );
  const btn: Record<
    Tool,
    { icon: typeof Sparkles; label: string; short: string }
  > = {
    draft: { icon: Sparkles, label: "ai.draft.btn", short: "ai.short.draft" },
    check: {
      icon: ShieldCheck,
      label: "ai.check.btn",
      short: "ai.short.check",
    },
    tiktok: {
      icon: Clapperboard,
      label: "ai.tiktok.btn",
      short: "ai.short.tiktok",
    },
    boost: { icon: Megaphone, label: "ai.boost.btn", short: "ai.boost.btn" },
  };

  return (
    <>
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {shown.map((k) => {
          const B = btn[k];
          return (
            <Button
              key={k}
              type="button"
              size="sm"
              variant="secondary"
              className={compact ? "h-7 px-2.5 text-[11px]" : ""}
              title={t(B.label)}
              onClick={() => setOpen(k)}
            >
              <B.icon className="h-3.5 w-3.5 text-primary" />{" "}
              {t(compact ? B.short : B.label)}
            </Button>
          );
        })}
      </div>
      {open === "draft" && (
        <DraftDialog
          card={card}
          onApply={apply}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "check" && (
        <ComplianceDialog
          card={card}
          onApply={apply}
          inEditor={!!onApply}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "tiktok" && (
        <RepurposeDialog card={card} onClose={() => setOpen(null)} />
      )}
      {open === "boost" && (
        <BoostDialog card={card} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/* ----- Draft with AI ----- */

function DraftDialog({
  card,
  onApply,
  onClose,
}: {
  card: ContentCard;
  onApply: (p: Partial<ContentCard>) => void;
  onClose: () => void;
}) {
  const { t, lang: uiLang } = useT();
  const ai = useAiCall();
  const pls = placementsOf(card);
  const [headline, setHeadline] = useState(card.title);
  const [platform, setPlatform] = useState<Platform>(
    pls.every((p) => p === "tiktok") ? "tiktok" : "facebook",
  );
  const [lang, setLang] = useState<Lang>(uiLang);
  const [r, setR] = useState<DraftPostResult | null>(null);

  const generate = async () => {
    const data = await ai.run<DraftPostResult>("draft-post", {
      headline,
      platform,
      lang,
      cardId: card.id,
      category: card.category,
    });
    if (data) setR(data);
  };
  const use = () => {
    if (!r) return;
    const design = designNotes(r.graphic_headline, r.visual_idea);
    const need: Placement = platform === "tiktok" ? "tiktok" : "fb_post";
    const placements =
      pls.includes(need) || (platform === "facebook" && isFacebook(card))
        ? pls
        : [...pls, need];
    const patch: Partial<ContentCard> =
      platform === "tiktok" && r.script
        ? {
            tiktokCaption: r.caption,
            placements,
            notes: appendNotes(
              card.notes,
              [formatScript(tidyScript(r.script)), design]
                .filter(Boolean)
                .join("\n\n"),
            ),
          }
        : {
            caption: r.caption,
            hashtags: r.hashtags,
            cta: r.cta,
            placements,
            notes: appendNotes(card.notes, design),
          };
    if (platform === "tiktok" && !card.hashtags && r.hashtags)
      patch.hashtags = r.hashtags;
    onApply(patch);
    onClose();
  };

  return (
    <AiModal
      wide={!!r}
      locked={ai.busy}
      title={t("ai.draft.title")}
      sub={t("ai.draft.sub")}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("btn.cancel")}
          </Button>
          <GenButton
            ai={ai}
            again={!!r}
            disabled={!headline.trim()}
            onClick={generate}
          />
          {r && (
            <Button disabled={ai.busy} onClick={use}>
              <Check className="h-4 w-4" /> {t("ai.draft.use")}
            </Button>
          )}
        </>
      }
    >
      <Field label={t("ai.draft.headline")}>
        <input
          className={inputCls}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-4">
        <Field label={t("ai.platform")}>
          <div>
            <Choice<Platform>
              value={platform}
              onChange={(p) => {
                setPlatform(p);
                setR(null);
              }}
              options={[
                { id: "facebook", label: t("ai.draft.fb") },
                { id: "tiktok", label: t("ai.draft.tt") },
              ]}
            />
          </div>
        </Field>
        <LangChoice value={lang} onChange={setLang} />
      </div>
      <AiError ai={ai} />
      {ai.busy && !r && <Busy text={t("ai.working")} />}
      {r && (
        <div
          className={cn(
            "space-y-3",
            ai.busy && "pointer-events-none opacity-50",
          )}
        >
          <GraphicFields
            headline={r.graphic_headline}
            idea={r.visual_idea}
            onChange={(p) => setR({ ...r, ...p })}
          />
          {platform === "tiktok" && r.script && (
            <ScriptFields
              script={r.script}
              onChange={(script) => setR({ ...r, script })}
            />
          )}
          <Field
            label={platform === "tiktok" ? t("d.ttCaption") : t("d.fbCaption")}
          >
            <textarea
              rows={platform === "tiktok" ? 3 : 10}
              className={areaCls}
              value={r.caption}
              onChange={(e) => setR({ ...r, caption: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("ai.hashtags")}>
              <input
                className={inputCls}
                value={r.hashtags}
                onChange={(e) => setR({ ...r, hashtags: e.target.value })}
              />
            </Field>
            {platform === "facebook" && (
              <Field label={t("ai.cta")}>
                <input
                  className={inputCls}
                  value={r.cta}
                  onChange={(e) => setR({ ...r, cta: e.target.value })}
                />
              </Field>
            )}
          </div>
          {platform === "tiktok" && (
            <p className="text-xs text-ink-mute">
              {t("ai.draft.scriptToNotes")}
            </p>
          )}
        </div>
      )}
    </AiModal>
  );
}

/* ----- Turn a Facebook post into a TikTok script (creates a new draft card) ----- */

function RepurposeDialog({
  card,
  onClose,
}: {
  card: ContentCard;
  onClose: () => void;
}) {
  const s = useDB();
  const { t, lang } = useT();
  const { openCard } = useUI();
  const ai = useAiCall();
  const [r, setR] = useState<RepurposeResult | null>(null);
  const [newId, setNewId] = useState<string | null>(null);

  const generate = async () => {
    const data = await ai.run<RepurposeResult>("repurpose-tiktok", {
      title: card.title,
      caption: card.caption,
      hashtags: card.hashtags,
      cardId: card.id,
      lang,
    });
    if (!data) return;
    setR(data);
    const id = s.newCard({
      title: data.title || `${card.title} — TikTok`,
      category: card.category,
      jobId: card.jobId,
      stage: "draft",
      platform: "tiktok",
      format: "Video",
      placements: ["tiktok"],
      tiktokCaption: data.tiktok_caption,
      hashtags: data.hashtags,
      plannedDate: card.plannedDate,
      plannedTime: card.plannedTime,
      notes: appendNotes(
        `From Facebook post: ${card.title}`,
        [
          formatScript(data.script),
          designNotes(data.graphic_headline, data.visual_idea),
        ]
          .filter(Boolean)
          .join("\n\n"),
      ),
    });
    setNewId(id);
  };
  useRunOnce(generate);

  return (
    <AiModal
      wide={!!r}
      locked={ai.busy}
      title={t("ai.tiktok.title")}
      sub={card.title}
      onClose={onClose}
      footer={
        <>
          {!newId && <GenButton ai={ai} again onClick={generate} />}
          <Button variant="secondary" onClick={onClose}>
            {t("ai.close")}
          </Button>
          {newId && (
            <Button
              onClick={() => {
                onClose();
                openCard(newId);
              }}
            >
              {t("ai.tiktok.open")} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </>
      }
    >
      <AiError ai={ai} />
      {ai.busy && <Busy text={t("ai.tiktok.working")} />}
      {r && (
        <div className="animate-rise space-y-3">
          {newId && (
            <div className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <Check className="h-4 w-4 shrink-0" /> {t("ai.tiktok.created")}
            </div>
          )}
          <ScriptView script={r.script} />
          {(r.graphic_headline || r.visual_idea) && (
            <div className="rounded-2xl bg-primary-soft/40 p-3 text-sm ring-1 ring-primary/10">
              {r.graphic_headline && (
                <div>
                  <span className="text-xs text-ink-soft">
                    {t("ai.graphicHeadline")}:
                  </span>{" "}
                  <b className="font-medium">{r.graphic_headline}</b>
                </div>
              )}
              {r.visual_idea && (
                <div className="mt-1">
                  <span className="text-xs text-ink-soft">
                    {t("ai.visualIdea")}:
                  </span>{" "}
                  {r.visual_idea}
                </div>
              )}
            </div>
          )}
          {r.tiktok_caption && (
            <div className="rounded-2xl bg-surface p-3 text-sm ring-1 ring-line">
              <div className="mb-1 text-xs text-ink-soft">
                {t("d.ttCaption")}
              </div>
              <p className="whitespace-pre-wrap">{r.tiktok_caption}</p>
              {r.hashtags && <p className="mt-1 text-primary">{r.hashtags}</p>}
            </div>
          )}
        </div>
      )}
    </AiModal>
  );
}

function ScriptView({ script }: { script: TikTokScript }) {
  const { t } = useT();
  const rows: [string, React.ReactNode][] = [
    [
      "0–3s",
      <b key="h" className="font-medium">
        {script.hook}
      </b>,
    ],
    [
      "3–25s",
      <div key="s" className="space-y-2">
        <p className="leading-relaxed whitespace-pre-wrap">{script.spoken}</p>
        {script.on_screen.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {script.on_screen.map((x, i) => (
              <span
                key={i}
                className="rounded-lg bg-ink px-2 py-0.5 text-xs text-white"
              >
                {x}
              </span>
            ))}
          </div>
        )}
      </div>,
    ],
    ["25–30s", <span key="c">{script.cta}</span>],
  ];
  return (
    <div className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
      <div className="px-3 pt-2.5 pb-1.5 text-xs font-medium text-ink-soft">
        {t("ai.tiktok.script")}
      </div>
      {rows.map(([time, body]) => (
        <div key={time} className="flex gap-3 px-3 py-2.5 text-sm">
          <span className="w-14 shrink-0 pt-0.5 text-xs font-medium text-primary tabular-nums">
            {time}
          </span>
          <div className="min-w-0 flex-1 text-ink">{body}</div>
        </div>
      ))}
    </div>
  );
}

/* ----- FB & TikTok rule checker with "Apply Fix" ----- */

type TextField = "caption" | "tiktokCaption" | "cta" | "hashtags";
const TEXT_FIELDS: TextField[] = [
  "caption",
  "tiktokCaption",
  "cta",
  "hashtags",
];

function ComplianceDialog({
  card,
  onApply,
  inEditor,
  onClose,
}: {
  card: ContentCard;
  onApply: (p: Partial<ContentCard>) => void;
  inEditor: boolean;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const ai = useAiCall();
  const pls = placementsOf(card);
  // the text as it was when the dialog opened; fixes are applied on top of it
  const [texts, setTexts] = useState<Record<TextField, string>>(() => ({
    caption: pls.some((p) => p.startsWith("fb_")) ? card.caption : "",
    tiktokCaption: pls.includes("tiktok") ? card.tiktokCaption : "",
    cta: card.cta,
    hashtags: card.hashtags,
  }));
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());

  const check = async () => {
    const data = await ai.run<ComplianceResult>("check-compliance", {
      title: card.title,
      ...texts,
      placements: pls,
      lang,
    });
    if (data) {
      setResult(data);
      setApplied(new Set());
    }
  };
  useRunOnce(check);

  const fieldOf = (issue: ComplianceIssue, from = texts) =>
    TEXT_FIELDS.find((f) => from[f] && from[f].includes(issue.risky_text));

  const applyFixes = (indexes: number[]) => {
    if (!result) return;
    const next = { ...texts };
    const patch: Partial<Record<TextField, string>> = {};
    const done = new Set(applied);
    for (const i of indexes) {
      const issue = result.issues[i];
      const f = fieldOf(issue, next);
      if (!f) continue;
      next[f] = next[f].split(issue.risky_text).join(issue.suggested_fix);
      patch[f] = next[f];
      done.add(i);
    }
    if (!Object.keys(patch).length) return;
    setTexts(next);
    setApplied(done);
    onApply(patch);
  };

  const fixable = result
    ? result.issues
        .map((_, i) => i)
        .filter((i) => !applied.has(i) && fieldOf(result.issues[i]))
    : [];

  return (
    <AiModal
      wide={!!result?.issues.length}
      locked={ai.busy}
      title={t("ai.check.title")}
      sub={card.title}
      onClose={onClose}
      footer={
        <>
          <GenButton ai={ai} again variant="secondary" onClick={check} />
          {fixable.length > 1 && (
            <Button
              variant="secondary"
              disabled={ai.busy}
              onClick={() => applyFixes(fixable)}
            >
              <Check className="h-4 w-4" />{" "}
              {t("ai.check.applyAll", { n: fixable.length })}
            </Button>
          )}
          <Button onClick={onClose}>{t("ai.close")}</Button>
        </>
      }
    >
      <AiError ai={ai} />
      {ai.busy && <Busy text={t("ai.check.working")} />}
      {!ai.busy && result && (
        <div
          className={cn(
            "animate-rise rounded-2xl border p-4",
            result.status === "pass"
              ? "border-green-200 bg-green-50"
              : "border-amber-200 bg-amber-50",
          )}
          role="status"
        >
          <div
            className={cn(
              "flex items-center gap-2 text-sm font-medium",
              result.status === "pass" ? "text-green-700" : "text-amber-800",
            )}
          >
            {result.status === "pass" ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )}
            {result.status === "pass"
              ? t("ai.check.pass")
              : t("ai.check.warning", { n: result.issues.length })}
          </div>
          {result.issues.length > 0 && (
            <>
              <ul className="mt-3 space-y-2.5">
                {result.issues.map((issue, i) => {
                  const done = applied.has(i);
                  const found = !!fieldOf(issue);
                  return (
                    <li
                      key={i}
                      className={cn(
                        "rounded-xl bg-surface p-3 ring-1",
                        done ? "ring-green-200" : "ring-amber-200",
                      )}
                    >
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
                        <div>
                          <div className="mb-0.5 text-[11px] font-medium text-rose-600">
                            {t("ai.check.risky")}
                          </div>
                          <p
                            className={cn(
                              "rounded-lg bg-rose-50 px-2 py-1 text-sm whitespace-pre-wrap text-rose-800",
                              done && "line-through opacity-60",
                            )}
                          >
                            {issue.risky_text}
                          </p>
                        </div>
                        <ArrowRight className="mx-auto hidden h-4 w-4 text-ink-mute sm:mt-6 sm:block" />
                        <div>
                          <div className="mb-0.5 text-[11px] font-medium text-green-700">
                            {t("ai.check.safe")}
                          </div>
                          <p className="rounded-lg bg-green-50 px-2 py-1 text-sm whitespace-pre-wrap text-green-800">
                            {issue.suggested_fix || (
                              <i className="opacity-70">
                                {t("ai.check.remove")}
                              </i>
                            )}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                        {issue.reason}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                        {!found && !done && (
                          <span className="mr-auto text-xs text-ink-mute">
                            {t("ai.check.notFound")}
                          </span>
                        )}
                        {issue.suggested_fix && (
                          <CopyButton text={issue.suggested_fix} />
                        )}
                        {done ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                            <Check className="h-3.5 w-3.5" />{" "}
                            {t("ai.check.applied")}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="success"
                            disabled={!found}
                            onClick={() => applyFixes([i])}
                          >
                            <Wand2 className="h-3.5 w-3.5" />{" "}
                            {t("ai.check.apply")}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-ink-soft">
                {inEditor ? t("ai.check.editorHint") : t("ai.check.savedHint")}
              </p>
            </>
          )}
        </div>
      )}
    </AiModal>
  );
}

/* ----- Boost budget advisor ----- */

function BoostDialog({
  card,
  onClose,
}: {
  card: ContentCard;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const ai = useAiCall();
  const pls = placementsOf(card);
  const [d, setD] = useState<BoostAdvice | null>(null);
  const ask = async () => {
    const data = await ai.run<BoostAdvice>("boost-advice", {
      category: card.category,
      caption:
        pls.includes("tiktok") && !isFacebook(card)
          ? card.tiktokCaption
          : card.caption,
      placements: pls,
      jobId: card.jobId ?? "",
      lang,
    });
    if (data) setD(data);
  };
  useRunOnce(ask);

  return (
    <AiModal
      title={t("ai.boost.title")}
      sub={card.title}
      locked={ai.busy}
      onClose={onClose}
      footer={
        <>
          <GenButton ai={ai} again variant="secondary" onClick={ask} />
          <Button onClick={onClose}>{t("ai.close")}</Button>
        </>
      }
    >
      <AiError ai={ai} />
      {ai.busy && <Busy text={t("ai.working")} />}
      {!ai.busy && d && (
        <div className="animate-rise space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
              <div className="text-xs text-ink-soft">
                {t("ai.boost.budget")}
              </div>
              <div className="mt-1 text-3xl font-medium tracking-tight text-ink">
                ${d.recommended_budget_usd}
              </div>
            </div>
            <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
              <div className="text-xs text-ink-soft">
                {t("ai.boost.duration")}
              </div>
              <div className="mt-1 text-3xl font-medium tracking-tight text-ink">
                {t("ai.boost.days", { n: d.duration_days })}
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
            <div className="text-xs text-ink-soft">
              {t("ai.boost.audience")}
            </div>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {d.target_audience}
            </p>
          </div>
          <div className="rounded-2xl bg-primary-soft/60 p-4 ring-1 ring-primary/15">
            <div className="text-xs text-ink-soft">{t("ai.boost.reason")}</div>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {d.reason}
            </p>
          </div>
          <p className="text-xs text-ink-mute">{t("ai.boost.basis")}</p>
        </div>
      )}
    </AiModal>
  );
}
