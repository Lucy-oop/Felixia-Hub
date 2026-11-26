"use client";

import { useT } from "@/lib/i18n";
import type { Placement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlacementMark } from "./ui";

/** Pick which placement's preview to show (only the post's own placements). */
export default function PlacementSwitch({
  options,
  value,
  onChange,
  className,
}: {
  options: Placement[];
  value: Placement;
  onChange: (p: Placement) => void;
  className?: string;
}) {
  const { t } = useT();
  if (options.length < 2)
    return (
      <span className={cn("inline-flex items-center gap-2 text-sm font-medium text-ink-soft", className)}>
        <PlacementMark placement={value} className="h-5 w-5" /> {t(`pl.${value}`)}
      </span>
    );
  return (
    <div className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-[18px] bg-chip/70 p-1", className)} role="tablist">
      {options.map((p) => (
        <button
          key={p}
          role="tab"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all",
            value === p ? "bg-surface font-medium text-ink shadow-raised" : "text-ink-soft hover:text-ink",
          )}
        >
          <PlacementMark placement={p} />
          {t(`pl.${p}`)}
        </button>
      ))}
    </div>
  );
}
