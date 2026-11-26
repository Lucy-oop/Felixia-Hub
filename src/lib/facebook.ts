import "server-only";

/**
 * Facebook Page scheduling via the Meta Graph API (native FB scheduling: published=false +
 * scheduled_publish_time). Server only — FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN never reach the browser.
 */

const GRAPH = "https://graph.facebook.com/v27.0";
const MIN_AHEAD = 10 * 60; // Facebook: at least 10 minutes ahead
const MAX_AHEAD = 30 * 24 * 60 * 60; // our limit: at most 30 days ahead

export class FacebookError extends Error {}

function creds() {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!pageId || !token) throw new FacebookError("Facebook is not set up (FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN missing on the server).");
  return { pageId, token };
}

export const hasFacebook = () => !!process.env.FB_PAGE_ID && !!process.env.FB_PAGE_ACCESS_TOKEN;

/** ISO date → Unix seconds, checked to be 10 minutes – 30 days from now. */
export function toScheduleTime(scheduledAt: string): number {
  const ms = Date.parse(scheduledAt);
  if (Number.isNaN(ms)) throw new FacebookError("The post has no valid date / time.");
  const ts = Math.floor(ms / 1000);
  const now = Math.floor(Date.now() / 1000);
  if (ts < now + MIN_AHEAD) throw new FacebookError("Facebook needs the post time to be at least 10 minutes from now.");
  if (ts > now + MAX_AHEAD) throw new FacebookError("The post time is more than 30 days away — Facebook scheduling is limited to 30 days.");
  return ts;
}

async function graph<T>(method: "POST" | "DELETE", path: string, body?: Record<string, unknown>): Promise<T> {
  const { token } = creds();
  const url = `${GRAPH}/${path}${method === "DELETE" ? `?access_token=${encodeURIComponent(token)}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify({ ...body, access_token: token }) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    const e = data?.error;
    throw new FacebookError(e?.error_user_msg || e?.message || `Facebook error (${res.status})`);
  }
  return data as T;
}

/**
 * Schedule a Page post. Text-only → /feed; one photo → /photos; several photos → upload each as an
 * unpublished temporary photo, then /feed with attached_media. Returns the Facebook post id.
 */
export async function scheduleFacebookPost(p: { caption: string; imageUrls: string[]; scheduledAt: string }): Promise<{ fbPostId: string; scheduledFor: number }> {
  const { pageId } = creds();
  const scheduled_publish_time = toScheduleTime(p.scheduledAt);
  const images = p.imageUrls.filter(Boolean);
  let data: { id?: string; post_id?: string };

  if (images.length === 0) {
    if (!p.caption.trim()) throw new FacebookError("Nothing to post — the caption is empty and there is no picture.");
    data = await graph("POST", `${pageId}/feed`, { message: p.caption, published: false, scheduled_publish_time });
  } else if (images.length === 1) {
    data = await graph("POST", `${pageId}/photos`, { url: images[0], caption: p.caption, published: false, scheduled_publish_time });
  } else {
    const media: { media_fbid: string }[] = [];
    for (const url of images) {
      const photo = await graph<{ id: string }>("POST", `${pageId}/photos`, { url, published: false, temporary: true });
      media.push({ media_fbid: photo.id });
    }
    data = await graph("POST", `${pageId}/feed`, { message: p.caption, attached_media: media, published: false, scheduled_publish_time });
  }

  const fbPostId = data.post_id || data.id;
  if (!fbPostId) throw new FacebookError("Facebook did not return a post id.");
  return { fbPostId, scheduledFor: scheduled_publish_time };
}

/** Delete / cancel a (scheduled) post. A post that no longer exists counts as cancelled. */
export async function deleteFacebookPost(fbPostId: string): Promise<void> {
  try {
    await graph("DELETE", encodeURIComponent(fbPostId));
  } catch (e) {
    if (e instanceof FacebookError && /does not exist|cannot be loaded|Unsupported delete request/i.test(e.message)) return;
    throw e;
  }
}
