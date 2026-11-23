"use client";

import { Check, ImagePlus, Lightbulb, Link2, Send, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { useDB } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Alert, Button, inputCls, Panel, PanelHeader } from "./ui";

const MAX = 20 * 1024 * 1024;
const okFile = (f: File) => (f.type.startsWith("image/") || f.type.startsWith("video/")) && f.size <= MAX;

/** Content idea box: text + pictures/videos (drop, choose, paste) + links. `compact` = smaller, for Home. */
export default function IdeaForm({ compact = false, title }: { compact?: boolean; title?: string }) {
  const s = useDB();
  const { t } = useT();
  const [text, setText] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // thumbnails for chosen files
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const all = Array.from(list);
    const good = all.filter(okFile);
    if (good.length < all.length) setMsg({ tone: "err", text: t("ideas.onlyImages") });
    setFiles((f) => [...f, ...good].slice(0, 10));
  };

  const addLink = () => {
    const l = link.trim();
    if (!l) return;
    setLinks((x) => [...x, /^https?:\/\//i.test(l) ? l : `https://${l}`]);
    setLink("");
  };

  const send = async () => {
    const allLinks = link.trim() ? [...links, /^https?:\/\//i.test(link.trim()) ? link.trim() : `https://${link.trim()}`] : links;
    if (!text.trim() && !files.length && !allLinks.length) return;
    setBusy(true);
    const err = await s.addIdea(text.trim(), allLinks, files);
    setBusy(false);
    if (err) return setMsg({ tone: "err", text: err });
    setText("");
    setLinks([]);
    setLink("");
    setFiles([]);
    setMsg({ tone: "ok", text: t("ideas.sent") });
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <Panel className={cn("animate-rise", compact && "flex flex-col")}>
      {title && (
        <PanelHeader title={title}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
            <Lightbulb className="h-4 w-4" />
          </span>
        </PanelHeader>
      )}
      <textarea
        className={inputCls + (compact ? " min-h-24" : " min-h-32") + " text-[15px] leading-relaxed"}
        placeholder={t("ideas.ph")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (imgs.length) {
            e.preventDefault();
            add(imgs);
          }
        }}
      />

      {/* drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        className={cn(
          "mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 text-center transition",
          compact ? "py-3" : "py-6",
          drag ? "border-primary bg-primary-soft/50" : "border-gray-300 bg-white/60 hover:border-primary/50 hover:bg-white",
        )}
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-primary shadow-raised">
          <ImagePlus className="h-5 w-5" />
        </span>
        <span className="text-sm font-medium text-ink">{t("ideas.drop")}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm shadow-raised">
          <Upload className="h-4 w-4" /> {t("ideas.choose")}
        </span>
        <span className="text-xs text-ink-mute">{t("ideas.pasteHint")}</span>
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      </div>

      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              {f.type.startsWith("video/") ? (
                <video src={previews[i]} className="h-20 w-20 rounded-xl object-cover ring-1 ring-line" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[i]} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-line" />
              )}
              <button
                onClick={() => setFiles((x) => x.filter((_, k) => k !== i))}
                className="absolute -top-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink text-white shadow"
                aria-label="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* links */}
      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input
            className={inputCls + " pl-9"}
            placeholder={t("ideas.linkPh")}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())}
          />
        </div>
        <Button variant="secondary" onClick={addLink} disabled={!link.trim()}>
          {t("ideas.addLink")}
        </Button>
      </div>
      {links.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {links.map((l, i) => (
            <li key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary-soft/60 py-1 pr-1 pl-3 text-xs text-primary">
              <span className="truncate">{l}</span>
              <button onClick={() => setLinks((x) => x.filter((_, k) => k !== i))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white" aria-label="Remove">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <div className="mt-3">
          {msg.tone === "ok" ? (
            <div className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <Check className="h-4 w-4" /> {msg.text}
            </div>
          ) : (
            <Alert onClose={() => setMsg(null)}>{msg.text}</Alert>
          )}
        </div>
      )}

      <Button className={cn("mt-4 h-12 w-full text-[15px]", !compact && "sm:w-auto sm:px-8")} onClick={send} disabled={busy || (!text.trim() && !files.length && !links.length && !link.trim())}>
        <Send className="h-4 w-4" /> {busy ? t("ideas.sending") : t("ideas.send")}
      </Button>
    </Panel>
  );
}
