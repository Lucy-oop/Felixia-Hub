"use client";

import { useT } from "@/lib/i18n";
import { cn, PLAN_PARTS, splitReviewNote } from "@/lib/utils";

/** The client's "need edit" note: which parts (chips) + what she wrote. */
export default function ReviewNote({ note, className, compact = false, plan = false }: { note?: string; className?: string; compact?: boolean; plan?: boolean }) {
  const { t } = useT();
  if (!note) return null;
  const { parts, text } = plan ? splitReviewNote<string>(note, PLAN_PARTS) : splitReviewNote<string>(note);
  return (
    <div className={cn("text-rose-700", className)}>
      {parts.length > 0 && (
        <div className={cn("flex flex-wrap gap-1", text && "mb-1")}>
          {parts.map((p) => (
            <span key={p} className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
              {t(plan ? `plan.part.${p}` : `cf.part.${p}`)}
            </span>
          ))}
        </div>
      )}
      {text && <p className={cn("whitespace-pre-wrap", compact && "line-clamp-2")}>{text}</p>}
    </div>
  );
}
