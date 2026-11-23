"use client";

import { CalendarDays, Minus, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { shiftHoliday, sortHolidays, type Holiday, type HolidayCountry } from "@/lib/holidays";
import { useT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button, inputCls, Segmented } from "./ui";

type Draft = { id: string | null; date: string; name: string; country: HolidayCountry };

/**
 * AI month plan → "Holidays & seasons": the month's holiday list with add / edit / delete and ±1 day
 * nudges for Myanmar full-moon dates. The parent saves every change (and sends the list to Gemini).
 */
export function HolidayEditor({
  month,
  holidays,
  onChange,
  edited,
  onReset,
  notSaved,
  disabled,
}: {
  /** "yyyy-mm" */
  month: string;
  holidays: Holiday[];
  onChange: (next: Holiday[]) => void;
  /** the list differs from the built-in one (shows "Reset to built-in") */
  edited: boolean;
  onReset: () => void;
  /** edits can't be saved (phase12.sql not run) */
  notSaved: boolean;
  disabled?: boolean;
}) {
  const { t, lang, locale } = useT();
  const [draft, setDraft] = useState<Draft | null>(null);

  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const days = holidays.filter((h) => h.kind !== "season");
  const seasons = holidays.filter((h) => h.kind === "season");
  const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, opts);
  const name = (h: Holiday) => h.name[lang as Lang] || h.name.en;
  const inMonth = (h: Holiday) => h.date <= last && (h.endDate ?? h.date) >= first;

  const replace = (id: string | undefined, next: Holiday | null) =>
    onChange(sortHolidays(next ? holidays.map((h) => (h.id === id ? next : h)) : holidays.filter((h) => h.id !== id)));

  const nudge = (h: Holiday, n: number) => {
    const moved = shiftHoliday(h, n);
    if (inMonth(moved)) replace(h.id, moved);
  };

  const startAdd = () => setDraft({ id: null, date: first, name: "", country: "BOTH" });
  const startEdit = (h: Holiday) => setDraft({ id: h.id ?? null, date: h.date, name: name(h), country: h.country });

  const saveDraft = () => {
    if (!draft || !draft.name.trim() || draft.date < first || draft.date > last) return;
    const text = draft.name.trim().slice(0, 120);
    const old = draft.id ? holidays.find((h) => h.id === draft.id) : undefined;
    if (old) {
      const moved = old.date === draft.date ? old : shiftHoliday(old, Math.round((Date.parse(draft.date) - Date.parse(old.date)) / 86400000));
      replace(old.id, {
        ...moved,
        country: draft.country,
        // a renamed holiday uses the new name in every language (Gemini reads the English + Myanmar names)
        name: text === name(old) ? old.name : { en: text, my: text, ja: text },
        approx: old.date === draft.date ? old.approx : undefined, // a date the manager set is exact
      });
    } else {
      onChange(
        sortHolidays([
          ...holidays,
          {
            id: `c:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            custom: true,
            date: draft.date,
            country: draft.country,
            kind: "festival",
            name: { en: text, my: text, ja: text },
            wish: true,
          },
        ]),
      );
    }
    setDraft(null);
  };

  const iconBtn =
    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-mute transition hover:bg-white hover:text-ink hover:shadow-raised disabled:pointer-events-none disabled:opacity-30";

  const form = draft && (
    <li className="space-y-2 rounded-2xl bg-white p-3 shadow-raised ring-1 ring-line">
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <input
          type="date"
          min={first}
          max={last}
          value={draft.date}
          onChange={(e) => e.target.value && setDraft({ ...draft, date: e.target.value })}
          className={cn(inputCls, "w-36 py-1.5 text-xs")}
          aria-label={t("aiplan.hol.date")}
        />
        <input
          autoFocus
          value={draft.name}
          maxLength={120}
          placeholder={t("aiplan.hol.namePh")}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && saveDraft()}
          className={cn(inputCls, "py-1.5 text-xs")}
          aria-label={t("aiplan.hol.name")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<HolidayCountry>
          value={draft.country}
          onChange={(country) => setDraft({ ...draft, country })}
          options={[
            { id: "MM", label: "MM" },
            { id: "JP", label: "JP" },
            { id: "BOTH", label: t("aiplan.hol.both") },
          ]}
        />
        <span className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>
          {t("btn.cancel")}
        </Button>
        <Button size="sm" disabled={!draft.name.trim()} onClick={saveDraft}>
          {t("aiplan.hol.save")}
        </Button>
      </div>
    </li>
  );

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-soft">{t("aiplan.holidays")}</span>
        {edited && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setDraft(null);
              onReset();
            }}
            className="inline-flex items-center gap-1 text-[11px] text-ink-mute transition hover:text-primary"
          >
            <RotateCcw className="h-3 w-3" /> {t("aiplan.hol.reset")}
          </button>
        )}
      </div>

      <ul className={cn("space-y-1.5", disabled && "pointer-events-none opacity-60")}>
        {days.length === 0 && seasons.length === 0 && !draft && <li className="text-xs text-ink-mute">{t("aiplan.noHolidays")}</li>}
        {days.map((h) =>
          draft && draft.id === h.id ? (
            <div key={h.id}>{form}</div>
          ) : (
            <li key={h.id ?? h.date + h.name.en} className="group flex items-center gap-1.5" title={h.note}>
              <span className="grid w-10 shrink-0 rounded-xl bg-white py-1 text-center shadow-raised ring-1 ring-line">
                <span className="text-[9px] leading-none text-ink-mute uppercase">{dayLabel(h.date, { month: "short" })}</span>
                <span className="text-sm leading-tight font-medium text-ink">
                  {h.approx && <span className="text-ink-mute">≈</span>}
                  {Number(h.date.slice(8))}
                </span>
              </span>
              {h.approx && (
                <span className="flex flex-col">
                  <button
                    type="button"
                    className={cn(iconBtn, "h-4 w-5")}
                    disabled={!inMonth(shiftHoliday(h, 1))}
                    onClick={() => nudge(h, 1)}
                    title={t("aiplan.hol.later")}
                    aria-label={t("aiplan.hol.later")}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className={cn(iconBtn, "h-4 w-5")}
                    disabled={!inMonth(shiftHoliday(h, -1))}
                    onClick={() => nudge(h, -1)}
                    title={t("aiplan.hol.earlier")}
                    aria-label={t("aiplan.hol.earlier")}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                </span>
              )}
              <span className="ml-1 min-w-0 flex-1 text-xs leading-snug text-ink">{name(h)}</span>
              <CountryTag c={h.country} />
              <button type="button" className={iconBtn} onClick={() => startEdit(h)} title={t("aiplan.hol.edit")} aria-label={t("aiplan.hol.edit")}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn(iconBtn, "hover:text-rose-600")}
                onClick={() => replace(h.id, null)}
                title={t("aiplan.hol.delete")}
                aria-label={t("aiplan.hol.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ),
        )}
        {seasons.map((h) => (
          <li key={h.id ?? h.date + h.name.en} className="flex items-center gap-2.5" title={h.note}>
            <span className="grid h-[38px] w-10 shrink-0 place-items-center rounded-xl bg-chip/60 text-ink-soft">
              <CalendarDays className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-xs leading-snug text-ink-soft">{name(h)}</span>
            <CountryTag c={h.country} />
            <button
              type="button"
              className={cn(iconBtn, "hover:text-rose-600")}
              onClick={() => replace(h.id, null)}
              title={t("aiplan.hol.delete")}
              aria-label={t("aiplan.hol.delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {draft && draft.id === null && form}
      </ul>

      {!draft && (
        <button
          type="button"
          disabled={disabled}
          onClick={startAdd}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary/80"
        >
          <Plus className="h-3.5 w-3.5" /> {t("aiplan.hol.add")}
        </button>
      )}
      {days.some((h) => h.approx) && <p className="mt-2 text-[11px] text-ink-mute">{t("aiplan.approx")}</p>}
      {notSaved && edited && <p className="mt-1 text-[11px] text-amber-700">{t("aiplan.hol.notSaved")}</p>}
    </div>
  );
}

export function CountryTag({ c }: { c: HolidayCountry }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        c === "MM" ? "bg-amber-50 text-amber-700" : c === "JP" ? "bg-rose-50 text-rose-600" : "bg-chip text-ink-soft",
      )}
    >
      {c === "BOTH" ? "MM·JP" : c}
    </span>
  );
}
