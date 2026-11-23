/** Shared (client + server) types and helpers for the AI Content Calendar generator. */

import type { Category, Platform } from "./types";

/** Pillars the AI writes. Hiring is NOT here — the manager adds hiring posts to the Content Calendar by hand. */
export const PILLARS = ["knowledge", "tips", "trust", "festival"] as const;
export type Pillar = (typeof PILLARS)[number];
/** How many posts of each pillar (typed by the manager). */
export type PlanCounts = Record<Pillar, number>;

export const DEFAULT_COUNTS: PlanCounts = {
  knowledge: 4,
  tips: 4,
  trust: 2,
  festival: 2,
};
export const MAX_PER_PILLAR = 20;
export const MAX_TOTAL = 40;

/** Which Content Calendar category each AI pillar is saved as. */
export const PILLAR_CATEGORY: Record<Pillar, Category> = {
  knowledge: "Knowledge",
  tips: "Educational",
  trust: "Brand",
  festival: "Marketing",
};

export const PILLAR_BRIEF: Record<Pillar, string> = {
  knowledge:
    "Knowledge sharing: SSW / visa process, how working in Japan works, life in Japan, industry and company facts.",
  tips: "Practical tips: Japanese language / JLPT study, interview preparation, documents, step-by-step how-tos.",
  trust:
    "Trust & proof: success stories, departures, worker testimonials, behind-the-scenes, why choose Felixia.",
  festival:
    "Festival / wishing posts for Myanmar and Japan holidays — posted ON the holiday date.",
};

export interface PlanRow {
  date: string; // yyyy-mm-dd
  headline: string;
  platform: Platform;
  pillar: Pillar;
  idea_id: string | null;
  graphic_headline: string;
  visual_idea: string;
}

/** Whole numbers 0–20 per pillar; scaled down so the total stays ≤ maxTotal. */
export function clampCounts(
  c: Partial<Record<string, unknown>> | undefined,
  maxTotal = MAX_TOTAL,
): PlanCounts {
  const out = Object.fromEntries(
    PILLARS.map((p) => [
      p,
      Math.min(MAX_PER_PILLAR, Math.max(0, Math.trunc(Number(c?.[p]) || 0))),
    ]),
  ) as PlanCounts;
  let total = PILLARS.reduce((a, p) => a + out[p], 0);
  // trim the biggest pillar first until we fit
  while (total > maxTotal) {
    const big = PILLARS.reduce((a, p) => (out[p] > out[a] ? p : a), PILLARS[0]);
    out[big]--;
    total--;
  }
  return out;
}

export const countTotal = (c: PlanCounts) =>
  PILLARS.reduce((a, p) => a + c[p], 0);

const pad = (n: number) => String(n).padStart(2, "0");

/** Months the planner may pick: this month and the next `ahead` months, as "yyyy-mm". */
export function plannableMonths(from = new Date(), ahead = 11): string[] {
  return Array.from({ length: ahead + 1 }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  });
}
