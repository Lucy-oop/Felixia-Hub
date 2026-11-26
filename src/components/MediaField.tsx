"use client";

import { Film, Link2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { SB, uploadFile } from "@/lib/store";
import { cn, shrinkImage, uid } from "@/lib/utils";
import { isImg } from "./CardTile";
import { isVideo } from "./PostPreview";
import { inputCls } from "./ui";

const MAX = 50 * 1024 * 1024;

/**
 * Picture / short video for a post: upload from the computer (up to 50 MB) or paste a link.
 * `value` is what is saved (a link, or "sb:<path>" for uploads); `src` is what can be shown.
 */
export default function MediaField({
  label,
  value,
  src,
  folder,
  onChange,
}: {
  label: string;
  value: string;
  src: string;
  folder: string;
  onChange: (value: string, src: string) => void;
}) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const uploaded = value.startsWith(SB);
  const video = isVideo(value) || isVideo(src);

  const upload = async (f?: File) => {
    if (!f) return;
    setErr("");
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) return setErr(t("ideas.onlyImages"));
    if (f.size > MAX) return setErr(t("up.tooBig"));
    try {
      setPct(0);
      const isPic = f.type.startsWith("image/") && f.type !== "image/gif";
      const blob = isPic ? ((await shrinkImage(f, 2000)) as Blob) : f;
      const ext = isPic ? "jpg" : (f.name.split(".").pop() || "mp4").toLowerCase();
      const path = await uploadFile(blob, `${folder}/${uid()}.${ext}`, setPct);
      onChange(SB + path, URL.createObjectURL(f));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPct(null);
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-ink-soft">{label}</span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files[0]);
        }}
        className={cn("flex items-center gap-3 rounded-2xl border border-dashed p-2.5 transition", drag ? "border-primary bg-primary-soft/40" : "border-gray-300 bg-surface/60")}
      >
        {/* thumbnail */}
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-chip/60 text-ink-mute">
          {src && video ? (
            <video src={src} muted className="h-full w-full object-cover" />
          ) : src && (uploaded || isImg(src)) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : src ? (
            <Link2 className="h-5 w-5" />
          ) : (
            <Film className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {pct !== null ? (
            <div>
              <div className="mb-1 text-xs text-ink-soft">
                {t("up.uploading")} {pct}%
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-chip">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-medium text-white shadow-blue hover:bg-blue-600"
              >
                <Upload className="h-3.5 w-3.5" /> {t("up.upload")}
              </button>
              <input
                className={inputCls + " h-9 py-1.5 text-xs"}
                placeholder={t("up.orLink")}
                value={uploaded ? t("up.uploaded") : value}
                readOnly={uploaded}
                onChange={(e) => onChange(e.target.value, e.target.value)}
              />
              {value && (
                <button type="button" onClick={() => onChange("", "")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mute hover:bg-frame hover:text-ink" aria-label="Remove">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] text-ink-mute">{err ? <span className="text-rose-600">{err}</span> : t("up.hint")}</p>
        </div>
        <input ref={input} type="file" accept="image/*,video/*" hidden onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ""))} />
      </div>
    </div>
  );
}
