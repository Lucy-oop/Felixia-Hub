"use client";

/**
 * Data store backed by Supabase.
 * Pages only use the actions below. Each action writes to Supabase, then reloads.
 * Permission rules are enforced twice: in the UI (utils.can) and in the database (RLS, supabase/schema.sql).
 */
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  extractJobFacts,
  factsLookComplete,
  fillHiringTemplate,
} from "./job-extract";
import type { Holiday } from "./holidays";
import { supabase } from "./supabase";
import type {
  Activity,
  ApplicantStage,
  ContentCard,
  DB,
  Idea,
  IdeaStatus,
  Inquiry,
  JobOrder,
  MetricShot,
  Platform,
  Profile,
  Reference,
  Reply,
  Role,
  Stage,
  WeeklyMetric,
} from "./types";
import {
  CATEGORIES,
  PLACEMENTS,
  STAGE_LABEL,
  type Category,
  type Placement,
  type PlanStatus,
} from "./types";
import {
  captionFromJob,
  jobLineNotes,
  jobLineTitle,
  jobToText,
  now,
  placementsOf,
  salaryText,
  shrinkImage,
  toISODate,
  uid,
} from "./utils";

type Result = { ok: true } | { ok: false; error: string };
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

// ---------- row mapping (database snake_case ↔ app camelCase) ----------
const jobFromRow = (r: Row): JobOrder => ({
  id: r.id,
  title: r.title,
  company: r.company,
  location: r.location,
  salaryMin: Number(r.salary_min),
  salaryMax: Number(r.salary_max),
  currency: r.currency,
  salaryPer: r.salary_per,
  requirements: r.requirements,
  benefits: r.benefits,
  visaType: r.visa_type,
  positions: r.positions,
  deadline: r.deadline ?? "",
  status: r.status,
  rawText: r.raw_text ?? "",
  rawTextBefore: r.raw_text_before ?? "",
  needsTidy: !!r.needs_tidy,
  createdAt: r.created_at,
});
const jobToRow = (j: JobOrder): Row => ({
  id: j.id,
  title: j.title,
  company: j.company,
  location: j.location,
  salary_min: j.salaryMin,
  salary_max: j.salaryMax,
  currency: j.currency,
  salary_per: j.salaryPer,
  requirements: j.requirements,
  benefits: j.benefits,
  visa_type: j.visaType,
  positions: j.positions,
  deadline: j.deadline || null,
  status: j.status,
  raw_text: j.rawText,
  needs_tidy: j.needsTidy,
});

const CARD_MAP: [keyof ContentCard, string][] = [
  ["title", "title"],
  ["category", "category"],
  ["platform", "platform"],
  ["format", "format"],
  ["stage", "stage"],
  ["caption", "caption"],
  ["tiktokCaption", "tiktok_caption"],
  ["tiktokMediaUrl", "tiktok_media_url"],
  ["placements", "platforms"],
  ["notes", "notes"],
  ["clientNote", "client_note"],
  ["hashtags", "hashtags"],
  ["cta", "cta"],
  ["graphicUrl", "graphic_url"],
  ["sourceLink", "source_link"],
  ["publishedUrl", "published_url"],
];
function cardPatchToRow(p: Partial<ContentCard>): Row {
  const r: Row = {};
  for (const [k, col] of CARD_MAP) if (p[k] !== undefined) r[col] = p[k];
  if ("jobId" in p) r.job_id = p.jobId || null;
  if (p.plannedDate !== undefined) r.planned_date = p.plannedDate || null;
  if (p.plannedTime !== undefined) r.planned_time = p.plannedTime || null;
  if (p.contentApproval) {
    r.content_approval = p.contentApproval.status;
    r.content_approval_note = p.contentApproval.note ?? null;
    r.content_approval_at = p.contentApproval.at ?? null;
  }
  if (p.graphicApproval) {
    r.graphic_approval = p.graphicApproval.status;
    r.graphic_approval_note = p.graphicApproval.note ?? null;
    r.graphic_approval_at = p.graphicApproval.at ?? null;
  }
  if (p.plan) {
    r.plan_status = p.plan.status;
    r.plan_note = p.plan.note ?? null;
    r.plan_headline = p.plan.headline ?? null;
    r.plan_at = p.plan.at ?? null;
  }
  if (p.posted) r.posted = p.posted;
  if (p.review) {
    r.review = p.review.status;
    r.review_note = p.review.note ?? null;
    r.review_at = p.review.at ?? null;
  }
  return r;
}

/** Planned date + time as an ISO instant. They're saved without a time zone, so they mean this browser's local time. */
function scheduledIso(c: ContentCard): string {
  if (!c.plannedDate) return "";
  const d = new Date(`${c.plannedDate}T${c.plannedTime || "19:00"}:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function canMove(c: ContentCard, to: Stage): Result {
  if (to === "review" && !c.graphicUrl && !c.tiktokMediaUrl)
    return { ok: false, error: "err.needGraphic" };
  if (to === "approved" && c.review.status !== "approved")
    return { ok: false, error: "err.needClient" };
  if (to === "published" && c.stage !== "approved")
    return { ok: false, error: "err.onlyApproved" };
  return { ok: true };
}

function blankCard(p: Partial<ContentCard>): ContentCard {
  return {
    id: uid(),
    title: "New content idea",
    category: "Hiring",
    platform: "facebook",
    format: "Feed",
    stage: "idea",
    caption: "",
    tiktokCaption: "",
    hashtags: "",
    cta: "",
    graphicUrl: "",
    tiktokMediaUrl: "",
    graphicSrc: "",
    tiktokSrc: "",
    placements: ["fb_post"],
    notes: "",
    clientNote: "",
    sourceLink: "",
    plannedDate: toISODate(new Date()),
    plannedTime: "19:00",
    publishedUrl: "",
    contentApproval: { status: "none" },
    graphicApproval: { status: "none" },
    review: { status: "none" },
    plan: { status: "draft" },
    posted: {},
    fbPostId: null,
    fbScheduleStatus: null,
    fbScheduleError: "",
    fbScheduledFor: "",
    versions: [],
    comments: [],
    createdAt: now(),
    ...p,
  };
}

/** Signed links for private uploads, cached so pictures don't reload every refresh. */
const signed = new Map<string, { url: string; exp: number }>();
async function signUrls(paths: string[]) {
  const need = [...new Set(paths)].filter(
    (p) => (signed.get(p)?.exp ?? 0) < Date.now(),
  );
  if (need.length) {
    const { data } = await supabase.storage
      .from("uploads")
      .createSignedUrls(need, 60 * 60 * 6);
    for (const d of data ?? [])
      if (d.signedUrl && d.path)
        signed.set(d.path, {
          url: d.signedUrl,
          exp: Date.now() + 60 * 60 * 5 * 1000,
        });
  }
  return (p: string) => signed.get(p)?.url ?? "";
}

/** Old content types → new ones. */
const OLD_CATEGORY: Record<string, Category> = {
  Recruitment: "Hiring",
  Career: "Knowledge",
  Company: "Brand",
  JapanLife: "Knowledge",
  Success: "Brand",
  Event: "Marketing",
};
function toCategory(v: string): Category {
  return (CATEGORIES as readonly string[]).includes(v)
    ? (v as Category)
    : (OLD_CATEGORY[v] ?? "Hiring");
}

/** Old rows stored "facebook"/"tiktok"; turn them (and new placement ids) into placements. */
function toPlacements(raw: string[] | null, format: string): Placement[] {
  const out = new Set<Placement>();
  for (const v of raw ?? []) {
    if ((PLACEMENTS as readonly string[]).includes(v)) out.add(v as Placement);
    else if (v === "facebook")
      out.add(
        format === "Reel"
          ? "fb_reel"
          : format === "Story"
            ? "fb_story"
            : "fb_post",
      );
    else if (v === "tiktok") out.add("tiktok");
  }
  return out.size ? PLACEMENTS.filter((p) => out.has(p)) : ["fb_post"];
}

/** Uploaded files are stored as "sb:<path>" in text columns. */
export const SB = "sb:";
const sbPath = (v: string) => (v.startsWith(SB) ? v.slice(SB.length) : null);

/** Upload one file to the private "uploads" bucket with a progress callback. Returns the storage path. */
export async function uploadFile(
  file: Blob,
  path: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/uploads/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.upload.onprogress = (e) =>
      e.lengthComputable &&
      onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status < 300) return resolve();
      let msg = xhr.responseText;
      try {
        msg = JSON.parse(xhr.responseText).message ?? msg;
      } catch {}
      reject(new Error(msg || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () =>
      reject(new Error("Upload failed — check your internet."));
    xhr.send(file);
  });
  return path;
}

/** Which SQL files still need to run (a missing column means that phase was never applied). */
async function checkSchema(): Promise<string[]> {
  const probe = async (cols: string) =>
    !(await supabase.from("content_cards").select(cols).limit(1)).error;
  const [p4, p5, p12, p13] = await Promise.all([
    probe("plan_status, plan_note, plan_at, posted"),
    probe("client_note"),
    // AI month plan holiday edits; only the manager can read the table, so only report it for them
    supabase
      .from("month_holidays")
      .select("month")
      .limit(1)
      .then((r) => !r.error || !/month_holidays|schema cache|does not exist/i.test(r.error.message)),
    probe("fb_post_id, fb_schedule_status, fb_schedule_error, fb_scheduled_for"),
  ]);
  return [!p4 && "phase4.sql", !p5 && "phase5.sql", !p12 && "phase12.sql", !p13 && "phase13.sql"].filter(
    (x): x is string => !!x,
  );
}

async function loadAll(): Promise<DB> {
  const [
    profiles,
    jobs,
    cards,
    versions,
    comments,
    refs,
    activity,
    ideas,
    inquiries,
    metrics,
    replies,
    shots,
  ] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase
      .from("job_orders")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("content_cards")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("card_versions")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("comments")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("references_board")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("ideas")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("inquiries")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("metrics_weekly")
      .select("*")
      .order("week_start", { ascending: true }),
    supabase.from("replies").select("*").order("sort").order("created_at"),
    supabase
      .from("metric_shots")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);
  const err = [
    profiles,
    jobs,
    cards,
    versions,
    comments,
    refs,
    activity,
    ideas,
    inquiries,
    metrics,
    replies,
    shots,
  ].find((r) => r.error)?.error;
  if (err)
    throw new Error(
      err.message.includes("does not exist") ||
        err.message.includes("schema cache")
        ? "err.runPhase2"
        : err.message,
    );
  // sign every private file we need to show (cached)
  const urlOf = await signUrls([
    ...(ideas.data ?? []).flatMap((i) => i.images ?? []),
    ...(shots.data ?? []).flatMap((x) => x.images ?? []),
    ...(cards.data ?? []).flatMap((c) =>
      [sbPath(c.graphic_url ?? ""), sbPath(c.tiktok_media_url ?? "")].filter(
        (x): x is string => !!x,
      ),
    ),
  ]);
  const src = (v: string) => (sbPath(v) ? urlOf(sbPath(v)!) : v);

  const people: Profile[] = (profiles.data ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    role: p.role,
  }));
  const who = (id: string) => people.find((p) => p.id === id);
  const roleOf = (id: string): Role => who(id)?.role ?? "client";
  const nameOf = (id: string) => who(id)?.fullName || undefined;

  return {
    profiles: people,
    jobs: (jobs.data ?? []).map(jobFromRow),
    cards: (cards.data ?? []).map((r): ContentCard => ({
      id: r.id,
      title: r.title,
      category: toCategory(r.category),
      platform: r.platform,
      format: r.format,
      jobId: r.job_id ?? undefined,
      stage: r.stage,
      caption: r.caption,
      tiktokCaption: r.tiktok_caption ?? "",
      hashtags: r.hashtags,
      cta: r.cta,
      graphicUrl: r.graphic_url,
      tiktokMediaUrl: r.tiktok_media_url ?? "",
      graphicSrc: src(r.graphic_url ?? ""),
      tiktokSrc: src(r.tiktok_media_url ?? ""),
      placements: toPlacements(r.platforms, r.format),
      notes: r.notes ?? "",
      clientNote: r.client_note ?? "",
      sourceLink: r.source_link,
      plannedDate: r.planned_date ?? "",
      plannedTime: (r.planned_time ?? "").slice(0, 5),
      publishedUrl: r.published_url,
      contentApproval: {
        status: r.content_approval,
        note: r.content_approval_note ?? undefined,
        at: r.content_approval_at ?? undefined,
      },
      graphicApproval: {
        status: r.graphic_approval,
        note: r.graphic_approval_note ?? undefined,
        at: r.graphic_approval_at ?? undefined,
      },
      review: {
        status: r.review ?? "none",
        note: r.review_note ?? undefined,
        at: r.review_at ?? undefined,
      },
      plan: {
        status: r.plan_status ?? "approved",
        note: r.plan_note ?? undefined,
        headline: r.plan_headline ?? undefined,
        at: r.plan_at ?? undefined,
      },
      posted: r.posted ?? {},
      fbPostId: r.fb_post_id ?? null,
      fbScheduleStatus: r.fb_schedule_status ?? null,
      fbScheduleError: r.fb_schedule_error ?? "",
      fbScheduledFor: r.fb_scheduled_for ?? "",
      versions: (versions.data ?? [])
        .filter((v) => v.card_id === r.id)
        .map((v) => ({
          at: v.created_at,
          caption: v.caption,
          graphicUrl: v.graphic_url,
        })),
      comments: (comments.data ?? [])
        .filter((c) => c.card_id === r.id)
        .map((c) => ({
          id: c.id,
          by: roleOf(c.author),
          byName: nameOf(c.author),
          text: c.body,
          at: c.created_at,
        })),
      createdAt: r.created_at,
    })),
    references: (refs.data ?? []).map((r): Reference => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      url: r.url,
      note: r.note,
      by: roleOf(r.author),
      byName: nameOf(r.author),
      at: r.created_at,
    })),
    activity: (activity.data ?? []).map((a): Activity => ({
      id: String(a.id),
      at: a.created_at,
      by: roleOf(a.actor),
      byName: nameOf(a.actor),
      text: a.text,
    })),
    ideas: (ideas.data ?? []).map((r): Idea => ({
      id: r.id,
      text: r.text,
      links: r.links ?? [],
      images: r.images ?? [],
      imageUrls: (r.images ?? []).map(urlOf),
      status: r.status,
      cardId: r.card_id ?? undefined,
      by: roleOf(r.author),
      byName: nameOf(r.author),
      at: r.created_at,
    })),
    inquiries: (inquiries.data ?? []).map((r): Inquiry => ({
      id: r.id,
      date: r.date,
      platform: r.platform,
      kind: r.kind,
      name: r.name,
      contact: r.contact,
      jobId: r.job_id ?? undefined,
      cardId: r.card_id ?? undefined,
      note: r.note,
      stage: r.stage ?? "new",
      byName: nameOf(r.author),
      at: r.created_at,
    })),
    metrics: (metrics.data ?? []).map((r): WeeklyMetric => ({
      weekStart: r.week_start,
      platform: r.platform,
      reach: r.reach,
      engagement: r.engagement,
      newFollowers: r.new_followers,
      linkClicks: r.link_clicks,
    })),
    replies: (replies.data ?? []).map((r): Reply => ({
      id: r.id,
      title: r.title,
      answerMy: r.answer_my,
      answerEn: r.answer_en,
      answerJa: r.answer_ja,
      jobId: r.job_id ?? undefined,
      sort: r.sort,
    })),
    shots: (shots.data ?? []).map((r): MetricShot => ({
      id: r.id,
      weekStart: r.week_start,
      platform: r.platform,
      images: r.images ?? [],
      imageUrls: (r.images ?? []).map(urlOf),
      at: r.created_at,
    })),
  };
}

/** Fire-and-forget Telegram alert (server decides who gets it). Never blocks or fails the action. */
async function notify(
  event:
    | "review"
    | "changes"
    | "approved"
    | "idea"
    | "job"
    | "jobUpdated"
    | "application"
    | "plan"
    | "planChanges"
    | "planFixed"
    | "clientNote"
    | "posted",
  id?: string,
) {
  try {
    const { data } = await supabase.auth.getSession();
    fetch("/api/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session?.access_token}`,
      },
      body: JSON.stringify({ event, id }),
    }).catch(() => {});
  } catch {}
}

/**
 * Hiring caption filled from the client's pasted text into the saved fb_hiring template (exact words —
 * see lib/job-extract). null when the text isn't labelled well enough or there's no template.
 */
async function exactJobCaption(j: JobOrder): Promise<string | null> {
  if (!j.rawText?.trim()) return null;
  const facts = extractJobFacts(j.rawText);
  if (!factsLookComplete(facts)) return null;
  const { data } = await supabase
    .from("brand_settings")
    .select("post_templates")
    .eq("id", 1)
    .maybeSingle();
  const template: string = data?.post_templates?.fb_hiring ?? "";
  return template.includes("[") ? fillHiringTemplate(template, facts) : null;
}

function useStoreValue() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [db, setDb] = useState<DB | null>(null);
  const [error, setError] = useState("");
  const dbRef = useRef<DB | null>(null);
  dbRef.current = db;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const [schemaMissing, setSchemaMissing] = useState<string[]>([]);
  const reload = useCallback(async () => {
    try {
      const [data, missing] = await Promise.all([loadAll(), checkSchema()]);
      setDb(data);
      setSchemaMissing((old) =>
        old.join() === missing.join() ? old : missing,
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setDb(null);
      return;
    }
    reload();
    // keep everyone in sync: live changes (Supabase Realtime), tab focus, and every 20s as a fallback
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    const t = setInterval(reload, 20_000);
    let soon: ReturnType<typeof setTimeout> | undefined;
    const live = supabase
      .channel("content-cards-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "content_cards" },
        () => {
          clearTimeout(soon);
          soon = setTimeout(reload, 400);
        },
      )
      .subscribe();
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
      clearTimeout(soon);
      supabase.removeChannel(live);
    };
  }, [userId, reload]);

  const me = db?.profiles.find((p) => p.id === userId) ?? null;
  // an unknown role name (e.g. from an older database) gets the most limited view
  const roleOk = !me || ["manager", "client"].includes(me.role);
  const role: Role = roleOk ? (me?.role ?? "client") : "client";

  /** Run database writes, log activity, then reload. Shows the error if any write fails. */
  const run = useCallback(
    async (
      fn: () => PromiseLike<
        | { error: { message: string } | null }[]
        | { error: { message: string } | null }
      >,
      log?: string,
    ) => {
      const res = await fn();
      const list = Array.isArray(res) ? res : [res];
      const err = list.find((r) => r.error)?.error;
      if (err) setError(err.message);
      else if (log) await supabase.from("activity_log").insert({ text: log });
      await reload();
      return !err;
    },
    [reload],
  );

  const find = (id: string) => dbRef.current?.cards.find((c) => c.id === id);

  /** Ask the server to schedule (POST) or cancel (DELETE) the post on the Facebook Page. */
  const callFacebook = async (method: "POST" | "DELETE", body: { postId: string; scheduledAt?: string }) => {
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/facebook/schedule", {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify(body),
      });
      const out: { status?: string; error?: string } = await res.json().catch(() => ({}));
      // Facebook / validation errors are saved on the card (badge); only show setup problems here
      if (!res.ok && out.status !== "failed") setError(out.error || `Facebook scheduling failed (${res.status})`);
      return out.status ?? "error";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return "error";
    }
  };

  /**
   * Keep Facebook in step with a card once its change is saved (`saved` = the run() result):
   * into Approved → schedule natively on Facebook (once); out of Approved (except to Published) →
   * cancel there; date / time changed while Approved → cancel + schedule again.
   */
  const fbSync = async (before: ContentCard, after: ContentCard, saved: Promise<boolean>) => {
    if (!(await saved)) return;
    const fb = after.placements.includes("fb_post");
    const wasIn = before.stage === "approved";
    const isIn = after.stage === "approved";
    const queued = !!before.fbPostId || !!before.fbScheduleStatus;
    const timeChanged = before.plannedDate !== after.plannedDate || before.plannedTime !== after.plannedTime;
    const leaving = !isIn && after.stage !== "published" && (wasIn || queued);
    const dropped = isIn && !fb && queued;
    const schedule = isIn && fb && (!wasIn || timeChanged || !before.placements.includes("fb_post"));
    if (!leaving && !dropped && !schedule) return;

    const mark = (fbScheduleStatus: ContentCard["fbScheduleStatus"]) =>
      setDb((d) => (d ? { ...d, cards: d.cards.map((x) => (x.id === after.id ? { ...x, fbScheduleStatus, fbScheduleError: "" } : x)) } : d));
    if (leaving || dropped || (schedule && wasIn && timeChanged && before.fbPostId)) {
      const st = await callFacebook("DELETE", { postId: after.id });
      // couldn't cancel (or it is already live) → don't schedule a second copy
      if (st !== "cancelled" && st !== "none") return void reload();
    }
    if (schedule) {
      mark("pending");
      await callFacebook("POST", { postId: after.id, scheduledAt: scheduledIso(after) });
    }
    await reload();
  };
  /** One version save at a time per post, so quick repeat saves can't race past the duplicate check. */
  const versionQueue = useRef(new Map<string, Promise<unknown>>());

  const actions = {
    // ---- Auth ----
    async signIn(email: string, password: string) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return error?.message ?? null;
    },
    async signOut() {
      await supabase.auth.signOut();
    },

    // ---- Team ----
    updateProfile(id: string, patch: { fullName?: string; role?: Role }) {
      const row: Row = {};
      if (patch.fullName !== undefined) row.full_name = patch.fullName;
      if (patch.role) row.role = patch.role;
      run(
        () => supabase.from("profiles").update(row).eq("id", id),
        patch.role
          ? `changed a team member's role to ${patch.role}`
          : undefined,
      );
    },

    // ---- Jobs ----
    saveJob(job: JobOrder) {
      const j = role === "manager" ? { ...job, needsTidy: false } : job;
      // admin checked the client's update → next update compares against today's text
      // (raw_text_before only sent when set, so saving still works before phase8.sql is run)
      const row =
        role === "manager" && job.rawTextBefore
          ? { ...jobToRow(j), raw_text_before: "" }
          : jobToRow(j);
      run(
        () => supabase.from("job_orders").upsert(row),
        `saved job order "${job.title}"`,
      );
    },
    /** Client: changed the job details she sent → back to the admin, who sees the changed lines (+ Telegram). */
    async updateJobText(id: string, text: string): Promise<string | null> {
      const j = dbRef.current?.jobs.find((x) => x.id === id);
      if (!j) return "Not found";
      // keep the text the admin last checked, even if the client updates twice before the admin looks
      const before =
        j.needsTidy && j.rawTextBefore
          ? j.rawTextBefore
          : j.rawText.trim() || jobToText(j);
      setDb((d) =>
        d
          ? {
              ...d,
              jobs: d.jobs.map((x) =>
                x.id === id
                  ? {
                      ...x,
                      rawText: text,
                      rawTextBefore: before,
                      needsTidy: true,
                    }
                  : x,
              ),
            }
          : d,
      );
      let failed: string | null = null;
      const ok = await run(async () => {
        const res = await supabase
          .from("job_orders")
          .update({ raw_text: text, raw_text_before: before, needs_tidy: true })
          .eq("id", id)
          .select("id");
        if (!res.error && !res.data?.length)
          failed = "No permission to save this job (check the account role).";
        else if (res.error)
          failed = res.error.message.includes("raw_text_before")
            ? "err.schema"
            : res.error.message;
        return failed
          ? {
              error: {
                message:
                  failed === "err.schema"
                    ? "Database update needed: run supabase/phase8.sql in the Supabase SQL Editor."
                    : failed,
              },
            }
          : res;
      }, `updated job details "${j.title}"`);
      if (ok) notify("jobUpdated", id);
      return failed;
    },
    setJobStatus(id: string, status: JobOrder["status"]) {
      const j = dbRef.current?.jobs.find((x) => x.id === id);
      run(
        () => supabase.from("job_orders").update({ status }).eq("id", id),
        `changed "${j?.title}" to ${status}`,
      );
    },
    makePostFromJob(jobId: string): string | null {
      const j = dbRef.current?.jobs.find((x) => x.id === jobId);
      if (!j) return null;
      const c = blankCard({
        title: `${j.title} — hiring post`,
        jobId: j.id,
        stage: "draft",
        caption: captionFromJob(j),
        tiktokCaption: `${j.title} in ${j.location} — ${salaryText(j)}. Message us to apply! #FelixiaRecruitment #JapanJobs`,
        hashtags: "#FelixiaRecruitment #JapanJobs #SSW",
        cta: "Message us on Messenger",
      });
      setDb((d) => (d ? { ...d, cards: [c, ...d.cards] } : d)); // show immediately
      run(async () => {
        // the client's own words in our saved fb_hiring template (exact), instead of the generic caption
        const exact = await exactJobCaption(j);
        if (exact) {
          c.caption = exact;
          setDb((d) =>
            d
              ? {
                  ...d,
                  cards: d.cards.map((x) =>
                    x.id === c.id ? { ...x, caption: exact } : x,
                  ),
                }
              : d,
          );
        }
        return supabase
          .from("content_cards")
          .insert({ id: c.id, ...cardPatchToRow(c) });
      }, `created a post from job "${j.title}"`);
      return c.id;
    },

    // ---- Cards ----
    newCard(init: Partial<ContentCard> = {}): string {
      const c = blankCard(init);
      setDb((d) => (d ? { ...d, cards: [c, ...d.cards] } : d));
      run(
        () =>
          supabase
            .from("content_cards")
            .insert({ id: c.id, ...cardPatchToRow(c) }),
        "created a new content card",
      );
      return c.id;
    },
    updateCard(id: string, patch: Partial<ContentCard>) {
      const c = find(id);
      if (!c) return;
      const full = { ...patch };
      const captionChanged =
        (patch.caption !== undefined && patch.caption !== c.caption) ||
        (patch.tiktokCaption !== undefined &&
          patch.tiktokCaption !== c.tiktokCaption);
      const graphicChanged =
        (patch.graphicUrl !== undefined && patch.graphicUrl !== c.graphicUrl) ||
        (patch.tiktokMediaUrl !== undefined &&
          patch.tiktokMediaUrl !== c.tiktokMediaUrl);
      // an approved post that changes must be confirmed again
      if (
        (captionChanged || graphicChanged) &&
        c.review.status === "approved"
      ) {
        full.review = { status: "none" };
        if (c.stage === "approved") full.stage = "review";
      }
      // edits after approval need a new confirmation
      if (captionChanged && c.contentApproval.status === "approved")
        full.contentApproval = { status: "none" };
      if (graphicChanged && c.graphicApproval.status === "approved")
        full.graphicApproval = { status: "none" };

      // show the edit right away (and make the next call see it), so a second click / repeat save
      // finds nothing changed instead of saving the same old text as another version
      const next = { ...c, ...full };
      if (dbRef.current)
        dbRef.current = {
          ...dbRef.current,
          cards: dbRef.current.cards.map((x) => (x.id === id ? next : x)),
        };
      setDb((d) =>
        d
          ? { ...d, cards: d.cards.map((x) => (x.id === id ? { ...x, ...full } : x)) }
          : d,
      );

      const snapshot = { caption: c.caption, graphic_url: c.graphicUrl };
      const saved = run(
        async () => {
          const out = [];
          if (captionChanged || graphicChanged) {
            const q = versionQueue.current;
            const prev = q.get(id) ?? Promise.resolve();
            const job = prev.then(async () => {
              // skip if the latest saved version already has exactly this text + graphic
              const { data: last } = await supabase
                .from("card_versions")
                .select("caption, graphic_url")
                .eq("card_id", id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (
                last &&
                last.caption === snapshot.caption &&
                last.graphic_url === snapshot.graphic_url
              )
                return { error: null };
              return supabase
                .from("card_versions")
                .insert({ card_id: id, ...snapshot });
            });
            const tail = job.catch(() => {});
            q.set(id, tail);
            out.push(await job);
            if (q.get(id) === tail) q.delete(id);
          }
          out.push(
            await supabase
              .from("content_cards")
              .update(cardPatchToRow(full))
              .eq("id", id),
          );
          return out;
        },
        `edited "${patch.title ?? c.title}"`,
      );
      void fbSync(c, next, saved);
    },
    deleteCard(id: string) {
      const c = find(id);
      run(
        async () => {
          // cancel on Facebook first so a deleted post can't still be published
          if (c?.fbPostId) {
            const st = await callFacebook("DELETE", { postId: id });
            if (st !== "cancelled" && st !== "none" && st !== "live")
              return { error: { message: "Couldn't cancel the scheduled Facebook post, so it was not deleted. Try again." } };
          }
          return supabase.from("content_cards").delete().eq("id", id);
        },
        `deleted "${c?.title}"`,
      );
    },
    moveStage(id: string, to: Stage): Result {
      const c = find(id);
      if (!c) return { ok: false, error: "Not found" };
      const res = canMove(c, to);
      if (!res.ok) return res;
      const patch: Partial<ContentCard> = { stage: to };
      if (to === "review" && c.review.status !== "approved")
        patch.review = { status: "review", at: now() };
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            }
          : d,
      );
      void fbSync(
        c,
        { ...c, ...patch },
        run(
          () =>
            supabase
              .from("content_cards")
              .update(cardPatchToRow(patch))
              .eq("id", id),
          `moved "${c.title}" to ${STAGE_LABEL[to]}`,
        ),
      );
      return { ok: true };
    },
    requestContentApproval(id: string) {
      const c = find(id);
      if (!c) return;
      const patch: Partial<ContentCard> = {
        contentApproval: { status: "pending", at: now() },
      };
      if (c.stage === "idea") patch.stage = "draft";
      run(
        () =>
          supabase
            .from("content_cards")
            .update(cardPatchToRow(patch))
            .eq("id", id),
        `sent "${c.title}" caption for confirmation`,
      );
    },
    decide(
      id: string,
      which: "content" | "graphic",
      decision: "approved" | "changes",
      note: string,
    ) {
      const c = find(id);
      if (!c) return;
      const a = { status: decision, note, at: now() };
      const patch: Partial<ContentCard> =
        which === "content" ? { contentApproval: a } : { graphicApproval: a };
      if (which === "graphic") {
        if (decision === "approved" && c.contentApproval.status === "approved")
          patch.stage = "approved";
        if (decision === "changes") patch.stage = "design";
      }
      const saved = run(
        async () => {
          const out = [
            await supabase
              .from("content_cards")
              .update(cardPatchToRow(patch))
              .eq("id", id),
          ];
          if (note)
            out.push(
              await supabase.from("comments").insert({
                card_id: id,
                body: `[${decision === "approved" ? "Approved" : "Changes requested"} — ${which}] ${note}`,
              }),
            );
          return out;
        },
        `${decision === "approved" ? "approved" : "requested changes on"} the ${which} of "${c.title}"`,
      );
      void fbSync(c, { ...c, ...patch }, saved);
    },
    addComment(id: string, text: string) {
      run(() => supabase.from("comments").insert({ card_id: id, body: text }));
    },
    setDate(id: string, date: string) {
      const c = find(id);
      if (!c || c.plannedDate === date) return;
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) =>
                x.id === id ? { ...x, plannedDate: date } : x,
              ),
            }
          : d,
      );
      void fbSync(
        c,
        { ...c, plannedDate: date },
        run(
          () =>
            supabase
              .from("content_cards")
              .update({ planned_date: date })
              .eq("id", id),
          `moved "${c.title}" to ${date}`,
        ),
      );
    },
    submitIdea(title: string, note: string) {
      const text = [title, note].filter(Boolean).join("\n\n");
      run(() => supabase.from("ideas").insert({ text }), "sent a content idea");
    },

    // ---- Content Calendar (monthly plan the client approves) ----
    /** Send every draft / changed line of a month ("2026-12") to the client. */
    sendPlan(month: string) {
      const ids = (dbRef.current?.cards ?? [])
        .filter(
          (c) =>
            c.plannedDate.startsWith(month) &&
            (c.plan.status === "draft" || c.plan.status === "changes"),
        )
        .map((c) => c.id);
      if (!ids.length) return;
      const plan = { status: "sent" as PlanStatus, at: now() };
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) =>
                ids.includes(x.id) ? { ...x, plan } : x,
              ),
            }
          : d,
      );
      run(
        () =>
          supabase
            .from("content_cards")
            .update({
              plan_status: "sent",
              plan_note: null,
              plan_headline: null,
              plan_at: plan.at,
            })
            .in("id", ids),
        `sent the ${month} content plan to the client (${ids.length} lines)`,
      ).then((ok) => void (ok && notify("plan", month)));
    },
    /** Client: Approved / Need to edit on one plan line — saved right away. */
    setPlanDecision(
      id: string,
      decision: "approved" | "changes",
      note = "",
      headline = "",
    ) {
      const c = find(id);
      if (!c) return;
      const plan = {
        status: decision as PlanStatus,
        note: decision === "changes" ? note || undefined : undefined,
        headline: decision === "changes" ? headline || undefined : undefined,
        at: now(),
      };
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) => (x.id === id ? { ...x, plan } : x)),
            }
          : d,
      );
      run(
        () =>
          supabase
            .from("content_cards")
            .update(cardPatchToRow({ plan }))
            .eq("id", id),
        decision === "approved"
          ? `approved plan line "${c.title}"`
          : `asked to change plan line "${c.title}"`,
      ).then(
        (ok) =>
          void (ok && decision === "changes" && notify("planChanges", id)),
      );
    },
    /** Client: Approved / Need to edit + her comment, saved together (one write, one reload). */
    async decidePlan(
      id: string,
      decision: "approved" | "changes",
      comment: string,
    ): Promise<string | null> {
      const c = find(id);
      if (!c) return "Not found";
      const text = comment.trim();
      const plan = {
        status: decision as PlanStatus,
        note: decision === "changes" ? text || undefined : undefined,
        at: now(),
      };
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) =>
                x.id === id ? { ...x, plan, clientNote: text } : x,
              ),
            }
          : d,
      );
      let failed: string | null = null;
      const ok = await run(
        async () => {
          const res = await supabase
            .from("content_cards")
            .update({ ...cardPatchToRow({ plan }), client_note: text })
            .eq("id", id)
            .select("id");
          // RLS can silently update 0 rows — treat that as an error too
          if (!res.error && !res.data?.length)
            failed =
              "No permission to save this line (check the account role).";
          else if (res.error)
            failed =
              res.error.message.includes("client_note") ||
              res.error.message.includes("plan_")
                ? "err.schema"
                : res.error.message;
          return failed ? { error: { message: failed } } : res;
        },
        decision === "approved"
          ? `approved plan line "${c.title}"`
          : `asked to change plan line "${c.title}"`,
      );
      if (ok && decision === "changes") notify("planChanges", id);
      return failed;
    },
    /** Manager: fixed a "Need to edit" line → send it back to the client (keeps her request as history) and tell her. */
    fixPlanLine(id: string, patch: Partial<ContentCard>) {
      const c = find(id);
      if (!c) return;
      const full: Partial<ContentCard> = {
        ...patch,
        clientNote: "",
        plan: {
          status: "sent",
          note: c.clientNote || c.plan.note || undefined,
          at: now(),
        },
      };
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) => (x.id === id ? { ...x, ...full } : x)),
            }
          : d,
      );
      run(
        () =>
          supabase
            .from("content_cards")
            .update(cardPatchToRow(full))
            .eq("id", id),
        `fixed plan line "${patch.title ?? c.title}"`,
      ).then((ok) => void (ok && notify("planFixed", id)));
    },
    /** Manager: one Telegram alert to the client about lines waiting this month. */
    notifyPlan(month: string) {
      notify("plan", month);
    },
    /** Manager: approved plan line → start the real post (hiring lines get the job's caption). */
    startPostFromLine(id: string) {
      const c = find(id);
      if (!c) return;
      const j = c.jobId
        ? dbRef.current?.jobs.find((x) => x.id === c.jobId)
        : undefined;
      if (j && !c.caption)
        void exactJobCaption(j).then((exact) =>
          actions.updateCard(id, {
            caption: exact ?? captionFromJob(j),
            tiktokCaption: `${j.title} in ${j.location} — ${salaryText(j)}. Message us to apply! #FelixiaRecruitment #JapanJobs`,
            hashtags: "#FelixiaRecruitment #JapanJobs #SSW",
            cta: "Message us on Messenger",
          }),
        );
      if (c.stage === "idea") actions.moveStage(id, "draft");
    },
    /** Client: approve every line still waiting in that month. */
    approveAllSent(month: string) {
      const ids = (dbRef.current?.cards ?? [])
        .filter(
          (c) => c.plannedDate.startsWith(month) && c.plan.status === "sent",
        )
        .map((c) => c.id);
      if (!ids.length) return;
      const plan = { status: "approved" as PlanStatus, at: now() };
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) =>
                ids.includes(x.id) ? { ...x, plan } : x,
              ),
            }
          : d,
      );
      run(
        () =>
          supabase
            .from("content_cards")
            .update({
              plan_status: "approved",
              plan_note: null,
              plan_headline: null,
              plan_at: plan.at,
            })
            .in("id", ids),
        `approved ${ids.length} plan lines`,
      );
    },
    /** Client: her own note on a plan line (saved quietly; manager is told only for a new note). */
    setClientNote(id: string, text: string, quiet = false) {
      const c = find(id);
      if (!c || c.clientNote === text) return;
      const first = !c.clientNote && !!text;
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) =>
                x.id === id ? { ...x, clientNote: text } : x,
              ),
            }
          : d,
      );
      run(() =>
        supabase
          .from("content_cards")
          .update({ client_note: text })
          .eq("id", id),
      ).then((ok) => void (ok && first && !quiet && notify("clientNote", id)));
    },
    /** Manager: take the client's suggested headline. */
    useSuggestedHeadline(id: string) {
      const c = find(id);
      if (!c?.plan.headline) return;
      const patch: Partial<ContentCard> = {
        title: c.plan.headline,
        plan: { ...c.plan, headline: undefined },
      };
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            }
          : d,
      );
      run(
        () =>
          supabase
            .from("content_cards")
            .update(cardPatchToRow(patch))
            .eq("id", id),
        `used the client's headline "${c.plan.headline}"`,
      );
    },

    // ---- Posting checklist ----
    /** Tick (url = string, may be "") or untick (url = null) one place. All ticked → Published. */
    setPosted(id: string, placement: Placement, url: string | null) {
      const c = find(id);
      if (!c) return;
      const posted = { ...c.posted };
      if (url === null) delete posted[placement];
      else posted[placement] = { at: posted[placement]?.at ?? now(), url };
      const all = placementsOf(c).every((p) => posted[p]);
      const patch: Partial<ContentCard> = { posted };
      if (all && c.stage === "approved") patch.stage = "published";
      if (!all && c.stage === "published") patch.stage = "approved";
      // first live link also fills the old "published URL"
      if (!c.publishedUrl && url) patch.publishedUrl = url;
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            }
          : d,
      );
      run(
        () =>
          supabase
            .from("content_cards")
            .update(cardPatchToRow(patch))
            .eq("id", id),
        patch.stage === "published"
          ? `published "${c.title}" on all places`
          : undefined,
      ).then(
        (ok) =>
          void (ok && patch.stage === "published" && notify("posted", id)),
      );
    },

    // ---- Client review (one review for Facebook + TikTok) ----
    /** `edits` = unsaved changes in the editor (saved separately just before). */
    sendForReview(id: string, edits: Partial<ContentCard> = {}): Result {
      const found = find(id);
      if (!found) return { ok: false, error: "Not found" };
      const c = { ...found, ...edits };
      if (!c.graphicUrl && !c.tiktokMediaUrl)
        return { ok: false, error: "err.needGraphic" };
      const patch: Partial<ContentCard> = {
        stage: "review",
        review: { status: "review", at: now() },
      };
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            }
          : d,
      );
      const saved = run(
        () =>
          supabase
            .from("content_cards")
            .update(cardPatchToRow(patch))
            .eq("id", id),
        `sent "${c.title}" to the client for review`,
      );
      saved.then((ok) => void (ok && notify("review", id)));
      void fbSync(found, { ...c, ...patch }, saved);
      return { ok: true };
    },
    clientDecide(id: string, decision: "approved" | "changes", note: string) {
      const c = find(id);
      if (!c) return;
      const patch: Partial<ContentCard> = {
        review: { status: decision, note: note || undefined, at: now() },
      };
      patch.stage = decision === "approved" ? "approved" : "review";
      setDb((d) =>
        d
          ? {
              ...d,
              cards: d.cards.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            }
          : d,
      );
      const saved = run(
        async () => {
          const out = [
            await supabase
              .from("content_cards")
              .update(cardPatchToRow(patch))
              .eq("id", id),
          ];
          if (note)
            out.push(
              await supabase.from("comments").insert({
                card_id: id,
                body: `[${decision === "approved" ? "Approved" : "Needs edit"}] ${note}`,
              }),
            );
          return out;
        },
        `${decision === "approved" ? "approved" : "asked for edits on"} "${c.title}"`,
      );
      void fbSync(c, { ...c, ...patch }, saved);
      saved.then(
        (ok) =>
          void (
            ok && notify(decision === "approved" ? "approved" : "changes", id)
          ),
      );
    },

    // ---- Jobs: client pastes raw text ----
    pasteJob(text: string, guess: Partial<JobOrder>) {
      const row = {
        id: uid(),
        title:
          guess.title ||
          text
            .split("\n")
            .find((l) => l.trim())
            ?.trim()
            .slice(0, 80) ||
          "New job",
        location: guess.location ?? "",
        salary_min: guess.salaryMin ?? 0,
        salary_max: guess.salaryMax ?? 0,
        currency: guess.currency ?? "JPY",
        salary_per: guess.salaryPer ?? "month",
        positions: guess.positions ?? 1,
        visa_type: guess.visaType || "Specified Skilled Worker (SSW)",
        requirements: guess.requirements ?? "",
        benefits: guess.benefits ?? "",
        raw_text: text,
        needs_tidy: true,
      };
      run(
        () => supabase.from("job_orders").insert(row),
        `sent new job details "${row.title}"`,
      ).then((ok) => void (ok && notify("job", row.id)));
    },

    // ---- Ideas inbox ----
    async addIdea(
      text: string,
      links: string[],
      files: File[],
    ): Promise<string | null> {
      const paths: string[] = [];
      for (const f of files) {
        const blob =
          f.type.startsWith("image/") && f.type !== "image/gif"
            ? ((await shrinkImage(f)) as Blob)
            : f;
        const ext =
          blob === f ? (f.name.split(".").pop() || "bin").toLowerCase() : "jpg";
        const path = `ideas/${uid()}.${ext}`;
        const { error } = await supabase.storage
          .from("uploads")
          .upload(path, blob, {
            contentType: blob === f ? f.type : "image/jpeg",
          });
        if (error) {
          setError(error.message);
          return error.message;
        }
        paths.push(path);
      }
      if (
        await run(
          () => supabase.from("ideas").insert({ text, links, images: paths }),
          "sent a content idea",
        )
      )
        notify("idea");
      return null;
    },
    setIdeaStatus(id: string, status: IdeaStatus) {
      setDb((d) =>
        d
          ? {
              ...d,
              ideas: d.ideas.map((x) => (x.id === id ? { ...x, status } : x)),
            }
          : d,
      );
      run(() => supabase.from("ideas").update({ status }).eq("id", id));
    },
    deleteIdea(id: string) {
      const i = dbRef.current?.ideas.find((x) => x.id === id);
      run(async () => {
        if (i?.images.length)
          await supabase.storage.from("uploads").remove(i.images);
        return supabase.from("ideas").delete().eq("id", id);
      });
    },
    ideaToCard(ideaId: string): string | null {
      const i = dbRef.current?.ideas.find((x) => x.id === ideaId);
      if (!i) return null;
      const first =
        i.text
          .split("\n")
          .find((l) => l.trim())
          ?.trim() ?? "";
      const c = blankCard({
        title: first.slice(0, 70) || "Idea from client",
        sourceLink: i.links[0] ?? "",
        graphicUrl: "",
      });
      setDb((d) =>
        d
          ? {
              ...d,
              cards: [c, ...d.cards],
              ideas: d.ideas.map((x) =>
                x.id === ideaId ? { ...x, status: "used", cardId: c.id } : x,
              ),
            }
          : d,
      );
      const note = [i.text, ...i.links].filter(Boolean).join("\n");
      run(async () => {
        const out = [
          await supabase
            .from("content_cards")
            .insert({ id: c.id, ...cardPatchToRow(c) }),
        ];
        out.push(
          await supabase
            .from("ideas")
            .update({ status: "used", card_id: c.id })
            .eq("id", ideaId),
        );
        if (note)
          out.push(
            await supabase
              .from("comments")
              .insert({ card_id: c.id, body: `Client idea: ${note}` }),
          );
        return out;
      }, `made a post from a client idea`);
      return c.id;
    },

    /**
     * Manager: save AI-suggested calendar rows as draft plan lines, and link the ideas they came from
     * (Smart Idea Linking: idea → "planned" + card_id). Returns false if saving failed.
     */
    async addPlanLines(
      lines: {
        date: string;
        headline: string;
        platform: Platform;
        category: Category;
        ideaId: string | null;
        jobId?: string;
        graphicHeadline?: string;
        visualIdea?: string;
        notes?: string;
      }[],
    ): Promise<boolean> {
      if (!lines.length) return true;
      const cards = lines.map((l) =>
        blankCard({
          title: l.headline,
          plannedDate: l.date,
          category: l.category,
          jobId: l.jobId,
          platform: l.platform,
          placements: [l.platform === "tiktok" ? "tiktok" : "fb_post"],
          notes: [
            l.notes,
            l.graphicHeadline && `Graphic headline: ${l.graphicHeadline}`,
            l.visualIdea && `Visual idea: ${l.visualIdea}`,
          ]
            .filter(Boolean)
            .join("\n"),
          plan: { status: "draft" },
        }),
      );
      const linked = new Map<string, string>();
      lines.forEach(
        (l, i) =>
          l.ideaId &&
          !linked.has(l.ideaId) &&
          linked.set(l.ideaId, cards[i].id),
      );
      setDb((d) =>
        d
          ? {
              ...d,
              cards: [...cards, ...d.cards],
              ideas: d.ideas.map((x) =>
                linked.has(x.id)
                  ? { ...x, status: "planned", cardId: linked.get(x.id) }
                  : x,
              ),
            }
          : d,
      );
      return run(async () => {
        const out = [
          await supabase
            .from("content_cards")
            .insert(cards.map((c) => ({ id: c.id, ...cardPatchToRow(c) }))),
        ];
        if (out[0].error) return out;
        for (const [ideaId, cardId] of linked) {
          let res = await supabase
            .from("ideas")
            .update({ status: "planned", card_id: cardId })
            .eq("id", ideaId);
          // before phase10.sql the database only knows new / seen / used
          if (res.error?.code === "23514")
            res = await supabase
              .from("ideas")
              .update({ status: "used", card_id: cardId })
              .eq("id", ideaId);
          out.push(res);
        }
        return out;
      }, `added ${cards.length} AI-planned calendar lines`);
    },

    /** Manager: put a client's job into a calendar line (e.g. a reserved hiring slot): job title, details, link. */
    attachJobToLine(
      cardId: string,
      jobId: string,
      extra: Partial<ContentCard> = {},
      positionsLabel?: string,
    ) {
      const j = dbRef.current?.jobs.find((x) => x.id === jobId);
      if (!j) return;
      actions.updateCard(cardId, {
        jobId: j.id,
        category: "Hiring",
        title: jobLineTitle(j),
        notes: jobLineNotes(j, positionsLabel),
        ...extra,
      });
    },

    // ---- Inquiries & applications ----
    addInquiry(q: Omit<Inquiry, "id" | "at" | "byName">) {
      const id = uid();
      run(
        () =>
          supabase.from("inquiries").insert({
            id,
            date: q.date,
            platform: q.platform,
            kind: q.kind,
            name: q.name,
            contact: q.contact,
            job_id: q.jobId || null,
            card_id: q.cardId || null,
            note: q.note,
          }),
        `recorded a new ${q.kind}`,
      ).then((ok) => {
        if (ok && q.kind === "application") notify("application", id);
      });
    },
    setInquiryStage(id: string, stage: ApplicantStage) {
      setDb((d) =>
        d
          ? {
              ...d,
              inquiries: d.inquiries.map((x) =>
                x.id === id ? { ...x, stage } : x,
              ),
            }
          : d,
      );
      run(
        () =>
          supabase
            .from("inquiries")
            .update({ stage, stage_at: now() })
            .eq("id", id),
        `moved an applicant to ${stage}`,
      );
    },
    deleteInquiry(id: string) {
      run(() => supabase.from("inquiries").delete().eq("id", id));
    },

    // ---- Saved replies ----
    saveReply(r: Omit<Reply, "id"> & { id?: string }) {
      const row = {
        title: r.title,
        answer_my: r.answerMy,
        answer_en: r.answerEn,
        answer_ja: r.answerJa,
        job_id: r.jobId || null,
        sort: r.sort,
      };
      run(
        () =>
          r.id
            ? supabase.from("replies").update(row).eq("id", r.id)
            : supabase.from("replies").insert(row),
        `saved reply "${r.title}"`,
      );
    },
    deleteReply(id: string) {
      run(() => supabase.from("replies").delete().eq("id", id));
    },

    // ---- Performance screenshots ----
    async addShots(
      weekStart: string,
      platform: Platform,
      files: File[],
      onProgress?: (pct: number) => void,
    ): Promise<{ id: string; error?: string }> {
      try {
        const paths: string[] = [];
        for (const [i, f] of files.entries()) {
          const blob = (await shrinkImage(f, 2000)) as Blob;
          paths.push(
            await uploadFile(
              blob,
              `metrics/${weekStart}/${platform}-${uid()}.jpg`,
              (p) =>
                onProgress?.(Math.round(((i + p / 100) / files.length) * 100)),
            ),
          );
        }
        const id = uid();
        const { error } = await supabase
          .from("metric_shots")
          .insert({ id, week_start: weekStart, platform, images: paths });
        if (error) throw new Error(error.message);
        await reload();
        return { id };
      } catch (e) {
        return { id: "", error: e instanceof Error ? e.message : String(e) };
      }
    },
    deleteShot(id: string) {
      const x = dbRef.current?.shots.find((s) => s.id === id);
      run(async () => {
        if (x?.images.length)
          await supabase.storage.from("uploads").remove(x.images);
        return supabase.from("metric_shots").delete().eq("id", id);
      });
    },
    /** Ask Claude (server side) to read the numbers from screenshots. */
    async readMetrics(shotIds: string[]): Promise<{
      numbers?: Pick<
        WeeklyMetric,
        "reach" | "engagement" | "newFollowers" | "linkClicks"
      >;
      error?: string;
    }> {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/read-metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify({ shotIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { error: json.error ?? `Error ${res.status}` };
      return { numbers: json };
    },

    // ---- Weekly numbers ----
    saveMetric(
      weekStart: string,
      platform: Platform,
      m: Pick<
        WeeklyMetric,
        "reach" | "engagement" | "newFollowers" | "linkClicks"
      >,
    ) {
      run(
        () =>
          supabase.from("metrics_weekly").upsert({
            week_start: weekStart,
            platform,
            reach: m.reach,
            engagement: m.engagement,
            new_followers: m.newFollowers,
            link_clicks: m.linkClicks,
            updated_at: now(),
          }),
        `updated ${platform} numbers for the week of ${weekStart}`,
      );
    },

    // ---- References ----
    addReference(r: Omit<Reference, "id" | "at" | "by">) {
      run(
        () =>
          supabase
            .from("references_board")
            .insert({ kind: r.kind, title: r.title, url: r.url, note: r.note }),
        `added a reference "${r.title}"`,
      );
    },
    /**
     * AI month plan: the manager's edited holiday list for a month ("yyyy-mm").
     * `items` null = no saved edits (use the built-in list); `ok` false = phase12.sql not run yet.
     */
    async loadMonthHolidays(month: string): Promise<{ items: Holiday[] | null; ok: boolean }> {
      const { data, error } = await supabase
        .from("month_holidays")
        .select("items")
        .eq("month", month)
        .maybeSingle();
      if (error) return { items: null, ok: false };
      return { items: Array.isArray(data?.items) ? (data.items as Holiday[]) : null, ok: true };
    },
    /** Saves the full edited list for the month. false = couldn't save (e.g. phase12.sql not run). */
    async saveMonthHolidays(month: string, items: Holiday[]): Promise<boolean> {
      const { error } = await supabase
        .from("month_holidays")
        .upsert({ month, items, updated_at: new Date().toISOString() });
      return !error;
    },
    /** Back to the built-in list for the month. */
    async resetMonthHolidays(month: string): Promise<boolean> {
      const { error } = await supabase.from("month_holidays").delete().eq("month", month);
      return !error;
    },

    removeReference(id: string) {
      run(() => supabase.from("references_board").delete().eq("id", id));
    },
  };

  return {
    db,
    role,
    roleOk,
    me,
    session,
    authReady,
    error,
    schemaMissing,
    clearError: () => setError(""),
    reload,
    ...actions,
  };
}

type Store = ReturnType<typeof useStoreValue>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const v = useStoreValue();
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}

/** Use inside pages: returns the loaded DB (pages render only after load). */
export function useDB() {
  const s = useStore();
  return useMemo(() => ({ ...s, db: s.db as DB }), [s]);
}
