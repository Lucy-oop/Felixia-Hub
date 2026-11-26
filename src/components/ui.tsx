"use client";

import { CircleCheck, Clapperboard, Eye, Lightbulb, Palette, PenLine, Send, type LucideIcon } from "lucide-react";
import { LANGS, useT } from "@/lib/i18n";
import type { ApplicantStage, ApprovalStatus, Category, JobStatus, Placement, Platform, Stage } from "@/lib/types";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Renders popups on top of the whole page (outside animated cards, which would clip a fixed overlay). */
export function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}

/* ---------- Buttons ---------- */
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "dark";
  size?: "sm" | "md";
}) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        "focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:outline-none",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-primary text-white shadow-blue hover:bg-blue-600",
        variant === "secondary" && "border border-line bg-white text-ink shadow-raised hover:bg-gray-50",
        variant === "ghost" && "text-ink-soft hover:bg-chip/70 hover:text-ink",
        variant === "danger" && "border border-line bg-white text-rose-600 shadow-raised hover:bg-rose-50",
        variant === "success" && "bg-green-500 text-white shadow-[0_8px_20px_-8px_rgba(34,197,94,0.6)] hover:bg-green-600",
        variant === "dark" && "bg-ink text-white hover:bg-black",
        className,
      )}
    />
  );
}

export function IconButton({ className, active, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...p}
      className={cn(
        "relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all [&_svg]:h-[18px] [&_svg]:w-[18px]",
        active ? "border border-line bg-white text-ink shadow-raised" : "text-ink-soft hover:bg-white hover:text-ink",
        className,
      )}
    />
  );
}

/* ---------- Form ---------- */
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-mute">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-mute outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-frame disabled:text-ink-soft";

export const selectCls =
  inputCls +
  " appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239ca3af%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_0.85rem_center] bg-no-repeat pr-9";

/** Small pill dropdown used for filters (does not stretch). */
export const pillSelectCls =
  "h-9 shrink-0 appearance-none rounded-full border border-line bg-white bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239ca3af%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-8 pl-3.5 text-xs text-ink shadow-raised outline-none focus:ring-4 focus:ring-primary/10";

/* ---------- Surfaces ---------- */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-[24px] border border-white bg-card p-5 shadow-card", className)}>{children}</section>;
}

export function PanelHeader({ title, children, count }: { title: string; children?: React.ReactNode; count?: number }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-medium tracking-tight text-ink">
        {title}
        {count !== undefined && <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-ink-soft">{count}</span>}
      </h2>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="animate-rise mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-tight font-medium tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-gray-300 bg-white/50 px-4 py-8 text-center text-sm text-ink-mute">{children}</div>;
}

export function Alert({ children, tone = "rose", onClose }: { children: React.ReactNode; tone?: "rose" | "amber"; onClose?: () => void }) {
  return (
    <div
      className={cn(
        "animate-rise flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
        tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <span>{children}</span>
      {onClose && (
        <button onClick={onClose} className="opacity-60 hover:opacity-100" aria-label="Close">
          ✕
        </button>
      )}
    </div>
  );
}

/* ---------- Chips & pills ---------- */
export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap", className)}>{children}</span>;
}

/** Gray info chip, e.g. "14:00 – 15:00" or "December, 5". */
export function GrayChip({ icon: Icon, children, className }: { icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg bg-chip/80 px-2.5 py-1 text-xs text-ink-soft shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]", className)}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

/** Small white pill with a colored dot, e.g. "● Approved". */
export function StatusPill({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-ink shadow-sm", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      {children}
    </span>
  );
}

/* ---------- Stages (Image 1 status colors) ---------- */
export const STAGE_STYLE: Record<Stage, { bar: string; icon: LucideIcon; iconWrap: string; chip: string; dot: string; lane: string }> = {
  idea: { bar: "bg-gradient-to-r from-gray-200 to-gray-100 text-gray-700", icon: Lightbulb, iconWrap: "bg-white/80 text-gray-500", chip: "bg-gray-100 text-gray-600", dot: "bg-gray-400", lane: "bg-gray-400" },
  draft: { bar: "bg-gradient-to-r from-blue-200/90 to-blue-100/80 text-blue-900 backdrop-blur", icon: PenLine, iconWrap: "bg-white/70 text-blue-500", chip: "bg-blue-50 text-blue-700", dot: "bg-blue-400", lane: "bg-blue-400" },
  design: { bar: "bg-gradient-to-r from-violet-600 to-violet-400 text-white", icon: Palette, iconWrap: "bg-white/20 text-white", chip: "bg-violet-50 text-violet-700", dot: "bg-violet-500", lane: "bg-violet-500" },
  review: { bar: "bg-gradient-to-r from-yellow-300 to-yellow-200 text-amber-950", icon: Eye, iconWrap: "bg-white/50 text-amber-700", chip: "bg-yellow-50 text-amber-700", dot: "bg-yellow-400", lane: "bg-yellow-400" },
  approved: { bar: "bg-gradient-to-r from-green-500 to-green-400 text-white", icon: CircleCheck, iconWrap: "bg-white/20 text-white", chip: "bg-green-50 text-green-700", dot: "bg-green-500", lane: "bg-green-500" },
  published: { bar: "bg-gradient-to-r from-[#1f2329] to-[#3f4652] text-white", icon: Send, iconWrap: "bg-white/15 text-white", chip: "bg-gray-800 text-white", dot: "bg-ink", lane: "bg-ink" },
};

export function StageBadge({ stage }: { stage: Stage }) {
  const { t } = useT();
  const S = STAGE_STYLE[stage];
  return (
    <Badge className={S.chip}>
      <S.icon className="h-3 w-3" />
      {t(`stage.${stage}`)}
    </Badge>
  );
}

export function PlatformMark({ platform, className }: { platform: Platform; className?: string }) {
  return platform === "facebook" ? (
    <span className={cn("grid h-4 w-4 place-items-center rounded-full bg-[#1877F2] text-[10px] font-bold text-white", className)}>f</span>
  ) : (
    <span className={cn("grid h-4 w-4 place-items-center rounded-full bg-ink text-[9px] font-bold text-white", className)}>♪</span>
  );
}

/** Content type colours (Content Calendar pillars). */
export const CATEGORY_COLOR: Record<Category, { chip: string; dot: string; bar: string }> = {
  Brand: { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-400", bar: "bg-amber-400" },
  Hiring: { chip: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500", bar: "bg-blue-500" },
  Knowledge: { chip: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500", bar: "bg-violet-500" },
  Marketing: { chip: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500", bar: "bg-orange-500" },
  Educational: { chip: "bg-green-50 text-green-700 ring-green-200", dot: "bg-green-500", bar: "bg-green-500" },
  Seasonal: { chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500", bar: "bg-rose-500" },
};

export function CategoryChip({ category, className }: { category: Category; className?: string }) {
  const { t } = useT();
  const c = CATEGORY_COLOR[category] ?? CATEGORY_COLOR.Hiring;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1", c.chip, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {t(`cat.${category}`)}
    </span>
  );
}

/** Icon for a placement: FB Post "f", FB Reel (film), FB Story (ring), TikTok (♪). */
export function PlacementMark({ placement, className }: { placement: Placement; className?: string }) {
  const base = "grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold";
  if (placement === "fb_post") return <span className={cn(base, "bg-[#1877F2] text-white", className)}>f</span>;
  if (placement === "fb_reel")
    return (
      <span className={cn(base, "bg-[#1877F2] text-white", className)}>
        <Clapperboard className="h-[60%] w-[60%]" strokeWidth={2.5} />
      </span>
    );
  if (placement === "fb_story")
    return (
      <span className={cn(base, "bg-white ring-2 ring-[#1877F2] ring-inset", className)}>
        <span className="h-[40%] w-[40%] rounded-full bg-[#1877F2]" />
      </span>
    );
  return <span className={cn(base, "bg-ink text-[9px] text-white", className)}>♪</span>;
}

export function PlatformBadge({ platform, format }: { platform: Platform; format?: string }) {
  const { t } = useT();
  return (
    <Badge className="bg-white text-ink-soft shadow-sm ring-1 ring-line">
      <PlatformMark platform={platform} className="h-3.5 w-3.5 text-[8px]" />
      {platform === "facebook" ? "Facebook" : "TikTok"}
      {format ? ` · ${t(`fmt.${format}`)}` : ""}
    </Badge>
  );
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { t } = useT();
  const dot = { open: "bg-green-500", hot: "bg-orange-500", closed: "bg-rose-500" }[status];
  return (
    <StatusPill color={dot} className="px-2 py-1 text-[11px] ring-1 ring-line">
      {t(`jobStatus.${status}`)}
    </StatusPill>
  );
}

export const APPROVAL_DOT: Record<ApprovalStatus, string> = {
  none: "bg-gray-300",
  pending: "bg-yellow-400",
  approved: "bg-green-500",
  changes: "bg-rose-500",
};

/** Applicant stage colors (same palette as content stages). */
export const APPLICANT_TONE: Record<ApplicantStage, { dot: string; bar: string }> = {
  new: { dot: "bg-primary", bar: "bg-gradient-to-r from-blue-200/90 to-blue-100/80 text-blue-900" },
  contacted: { dot: "bg-yellow-400", bar: "bg-gradient-to-r from-yellow-300 to-yellow-200 text-amber-950" },
  interview: { dot: "bg-violet-500", bar: "bg-gradient-to-r from-violet-600 to-violet-400 text-white" },
  passed: { dot: "bg-green-500", bar: "bg-gradient-to-r from-green-500 to-green-400 text-white" },
  departed: { dot: "bg-ink", bar: "bg-gradient-to-r from-[#1f2329] to-[#3f4652] text-white" },
  rejected: { dot: "bg-gray-400", bar: "bg-gradient-to-r from-gray-200 to-gray-100 text-gray-700" },
};

/** Post Confirmation status colors. */
export const REVIEW_DOT = { review: "bg-yellow-400", changes: "bg-rose-500", approved: "bg-green-500", published: "bg-ink" } as const;

export function ApprovalBadge({ label, status }: { label: string; status: ApprovalStatus }) {
  const { t } = useT();
  return (
    <StatusPill color={APPROVAL_DOT[status]} className="px-2 py-1 text-[11px] ring-1 ring-line">
      {label}: {t(`appr.${status}`)}
    </StatusPill>
  );
}

/* ---------- Segmented control & language ---------- */
export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-full bg-chip/70 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn("rounded-full px-3.5 py-1.5 text-xs font-medium transition-all", value === o.id ? "bg-white text-ink shadow-raised" : "text-ink-soft hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LangSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <div className={cn("inline-flex rounded-full bg-chip/70 p-1", className)} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.id}
          lang={l.id}
          title={l.name}
          onClick={() => setLang(l.id)}
          className={cn("rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all", lang === l.id ? "bg-white text-ink shadow-raised" : "text-ink-soft hover:text-ink")}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}

/* ---------- People ---------- */
const AVATAR_TONES = ["bg-amber-200 text-amber-900", "bg-sky-200 text-sky-900", "bg-rose-200 text-rose-900", "bg-emerald-200 text-emerald-900", "bg-violet-200 text-violet-900", "bg-orange-200 text-orange-900"];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const n = (name || "?").trim();
  const tone = AVATAR_TONES[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span title={n} className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ring-2 ring-white", tone, className)}>
      {n.charAt(0).toUpperCase()}
    </span>
  );
}

export function AvatarStack({ names, max = 3, className }: { names: string[]; max?: number; className?: string }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className={cn("flex items-center -space-x-2", className)}>
      {shown.map((n, i) => (
        <Avatar key={i} name={n} />
      ))}
      {extra > 0 && <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-xs font-medium text-ink-soft ring-2 ring-white shadow-raised">{extra}+</span>}
    </div>
  );
}
