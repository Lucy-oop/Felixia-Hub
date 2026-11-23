"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { Placement } from "@/lib/types";
import { toISODate } from "@/lib/utils";
import PlacementPicker from "./PlacementPicker";
import { Button, Field, inputCls } from "./ui";

/** Step before the editor: name the post, choose where it goes, and when. */
export default function NewPostDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (p: { title: string; placements: Placement[]; plannedDate: string; plannedTime: string }) => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [placements, setPlacements] = useState<Placement[]>(["fb_post"]);
  const [date, setDate] = useState(toISODate(new Date()));
  const [time, setTime] = useState("19:00");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/20 p-4 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        className="animate-rise w-full max-w-lg space-y-4 rounded-[28px] border border-white bg-frame p-6 shadow-float"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate({ title: title.trim() || t("np.untitled"), placements, plannedDate: date, plannedTime: time });
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-medium tracking-tight">{t("np.title")}</h2>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink-soft shadow-raised" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Field label={t("f.title")}>
          <input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("np.titlePh")} />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-ink-soft">{t("np.where")}</span>
          <PlacementPicker value={placements} onChange={setPlacements} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("f.postDate")}>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("f.time")}>
            <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("btn.cancel")}
          </Button>
          <Button type="submit">{t("np.create")}</Button>
        </div>
      </form>
    </div>
  );
}
