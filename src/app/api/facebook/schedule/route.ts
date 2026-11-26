import { NextResponse } from "next/server";
import { deleteFacebookPost, FacebookError, scheduleFacebookPost } from "@/lib/facebook";
import { adminClient, caller, hasAdmin } from "@/lib/server";

/**
 * POST   { postId, scheduledAt }  → schedule the approved post on the Facebook Page (once).
 * DELETE { postId }               → cancel it on Facebook and clear fb_post_id.
 *
 * Caption and picture are read from the database (not from the request), so only the approved
 * content can ever be scheduled. scheduledAt comes from the browser because planned date/time are
 * saved without a time zone and mean "local time of the person using the app".
 */

const VIDEO = /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i;

type Card = {
  id: string;
  stage: string;
  platforms: string[] | null;
  caption: string;
  hashtags: string;
  graphic_url: string;
  fb_post_id: string | null;
  fb_schedule_status: string | null;
  fb_scheduled_for: string | null;
};

async function setup(req: Request) {
  const who = await caller(req);
  if (!who) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!hasAdmin()) return { error: NextResponse.json({ error: "Server key missing (SUPABASE_SERVICE_ROLE_KEY)" }, { status: 500 }) };
  const body = await req.json().catch(() => ({}));
  if (typeof body.postId !== "string" || !body.postId) return { error: NextResponse.json({ error: "postId is required" }, { status: 400 }) };
  const sb = adminClient();
  const { data, error } = await sb
    .from("content_cards")
    .select("id, stage, platforms, caption, hashtags, graphic_url, fb_post_id, fb_schedule_status, fb_scheduled_for")
    .eq("id", body.postId)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: /fb_/.test(error.message) ? "Database update needed: run supabase/phase13.sql" : error.message }, { status: 500 }) };
  if (!data) return { error: NextResponse.json({ error: "Post not found" }, { status: 404 }) };
  return { sb, card: data as Card, body: body as { postId: string; scheduledAt?: string } };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const nowIso = () => new Date().toISOString();

export async function POST(req: Request) {
  const s = await setup(req);
  if ("error" in s) return s.error;
  const { sb, card, body } = s;

  if (card.stage !== "approved") return NextResponse.json({ status: "skipped", reason: "Post is not approved" });
  if (!(card.platforms ?? []).includes("fb_post")) return NextResponse.json({ status: "skipped", reason: "Not a Facebook feed post" });
  if (card.fb_post_id) {
    // already queued on Facebook — never schedule twice
    await sb.from("content_cards").update({ fb_schedule_status: "scheduled", fb_schedule_error: null }).eq("id", card.id);
    return NextResponse.json({ status: "scheduled", fbPostId: card.fb_post_id, already: true });
  }

  // claim the post so two quick approvals can't both schedule it (a stuck claim expires after 2 min)
  const stale = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claimed } = await sb
    .from("content_cards")
    .update({ fb_schedule_status: "pending", fb_schedule_error: null, fb_synced_at: nowIso() })
    .eq("id", card.id)
    .is("fb_post_id", null)
    .or(`fb_schedule_status.is.null,fb_schedule_status.neq.pending,fb_synced_at.lt.${stale}`)
    .select("id");
  if (!claimed?.length) return NextResponse.json({ status: "pending" });

  try {
    const graphic = card.graphic_url ?? "";
    if (VIDEO.test(graphic)) throw new FacebookError("Video posts can't be auto-scheduled — please post this one by hand.");
    const imageUrls: string[] = [];
    if (graphic.startsWith("sb:")) {
      // Facebook downloads the picture right away, so a 1-hour link is enough
      const { data, error } = await sb.storage.from("uploads").createSignedUrl(graphic.slice(3), 60 * 60);
      if (error || !data) throw new FacebookError(`Couldn't read the uploaded picture: ${error?.message ?? "unknown"}`);
      imageUrls.push(data.signedUrl);
    } else if (graphic) imageUrls.push(graphic);

    const caption = [card.caption, card.hashtags && !card.caption.includes(card.hashtags) ? card.hashtags : ""].filter((x) => x?.trim()).join("\n\n");
    const r = await scheduleFacebookPost({ caption, imageUrls, scheduledAt: body.scheduledAt ?? "" });
    const scheduledFor = new Date(r.scheduledFor * 1000).toISOString();
    await sb
      .from("content_cards")
      .update({ fb_post_id: r.fbPostId, fb_schedule_status: "scheduled", fb_schedule_error: null, fb_scheduled_for: scheduledFor, fb_synced_at: nowIso() })
      .eq("id", card.id);
    return NextResponse.json({ status: "scheduled", fbPostId: r.fbPostId, scheduledFor });
  } catch (e) {
    const error = message(e);
    await sb.from("content_cards").update({ fb_schedule_status: "failed", fb_schedule_error: error, fb_synced_at: nowIso() }).eq("id", card.id);
    return NextResponse.json({ status: "failed", error }, { status: e instanceof FacebookError ? 200 : 500 });
  }
}

export async function DELETE(req: Request) {
  const s = await setup(req);
  if ("error" in s) return s.error;
  const { sb, card } = s;

  if (!card.fb_post_id) {
    if (card.fb_schedule_status) await sb.from("content_cards").update({ fb_schedule_status: null, fb_schedule_error: null }).eq("id", card.id);
    return NextResponse.json({ status: "none" });
  }
  // already published by Facebook → don't delete a live post
  if (card.fb_scheduled_for && Date.parse(card.fb_scheduled_for) <= Date.now())
    return NextResponse.json({ status: "live", fbPostId: card.fb_post_id });

  try {
    await deleteFacebookPost(card.fb_post_id);
    await sb
      .from("content_cards")
      .update({ fb_post_id: null, fb_schedule_status: null, fb_schedule_error: null, fb_scheduled_for: null, fb_synced_at: nowIso() })
      .eq("id", card.id);
    return NextResponse.json({ status: "cancelled" });
  } catch (e) {
    // keep fb_post_id: the post may still publish, so the card must keep showing it
    const error = `Couldn't cancel on Facebook: ${message(e)}`;
    await sb.from("content_cards").update({ fb_schedule_status: "failed", fb_schedule_error: error, fb_synced_at: nowIso() }).eq("id", card.id);
    return NextResponse.json({ status: "failed", error }, { status: e instanceof FacebookError ? 200 : 500 });
  }
}
