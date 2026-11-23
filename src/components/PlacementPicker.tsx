"use client";

import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { PLACEMENTS, type Placement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlacementMark } from "./ui";

/** Tap-to-choose cards: FB Post · FB Reel · FB Story (My Day) · TikTok. At least one stays selected. */
export default function PlacementPicker({ value, onChange, className }: { value: Placement[]; onChange: (v: Placement[]) => void; className?: string }) {
  const { t } = useT();
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {PLACEMENTS.map((p) => {
        const on = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = on ? value.filter((x) => x !== p) : PLACEMENTS.filter((x) => x === p || value.includes(x));
              if (next.length) onChange(next);
            }}
            className={cn(
              "relative flex items-start gap-2.5 rounded-2xl border p-3 text-left transition",
              on ? "border-primary/40 bg-white shadow-raised ring-4 ring-primary/10" : "border-line bg-white/50 hover:bg-white",
            )}
          >
            <PlacementMark placement={p} className={cn("mt-0.5 h-7 w-7 text-sm", !on && "opacity-50 grayscale")} />
            <span className="min-w-0">
              <span className={cn("block text-sm", on ? "font-medium text-ink" : "text-ink-soft")}>{t(`pl.${p}`)}</span>
              <span className="block text-[11px] leading-snug text-ink-mute">{t(`pl.hint.${p}`)}</span>
            </span>
            {on && (
              <span className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-white">
                <Check className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
