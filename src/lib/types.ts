export type Role = "manager" | "client";

export const ROLE_LABEL: Record<Role, string> = {
  manager: "Content Manager",
  client: "Client (Felixia)",
};

export type JobStatus = "open" | "hot" | "closed";

export interface JobOrder {
  id: string;
  title: string;
  company: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  currency: string;
  salaryPer: "hour" | "month";
  requirements: string;
  benefits: string;
  visaType: string;
  positions: number;
  deadline: string; // yyyy-mm-dd
  status: JobStatus;
  rawText: string; // what the client pasted
  rawTextBefore: string; // the client's text before her last update (admin sees the changed lines); "" once the admin saved
  needsTidy: boolean; // pasted by client, manager still has to tidy it
  createdAt: string;
}

export const STAGES = ["idea", "draft", "design", "review", "approved", "published"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  idea: "Idea",
  draft: "Draft",
  design: "Design",
  review: "Review",
  approved: "Approved",
  published: "Published",
};

/** Content types (pillars) shown in the Content Calendar. */
export const CATEGORIES = ["Brand", "Hiring", "Knowledge", "Marketing", "Educational"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Platform = "facebook" | "tiktok";

/** Where a post is published. Reel, Story and TikTok are vertical (9:16) and share one video. */
export const PLACEMENTS = ["fb_post", "fb_reel", "fb_story", "tiktok"] as const;
export type Placement = (typeof PLACEMENTS)[number];
export const VERTICAL: Placement[] = ["fb_reel", "fb_story", "tiktok"];
export const PLACEMENT_PLATFORM: Record<Placement, Platform> = { fb_post: "facebook", fb_reel: "facebook", fb_story: "facebook", tiktok: "tiktok" };
export const FORMATS: Record<Platform, string[]> = {
  facebook: ["Feed", "Story", "Reel"],
  tiktok: ["Video"],
};

export type ApprovalStatus = "none" | "pending" | "approved" | "changes";

/** The single client review of a post (Facebook + TikTok together). */
export type ReviewStatus = "none" | "review" | "changes" | "approved";
export interface Review {
  status: ReviewStatus;
  note?: string;
  at?: string;
}

export interface Approval {
  status: ApprovalStatus;
  note?: string;
  at?: string;
}

export interface Profile {
  id: string;
  fullName: string;
  role: Role;
}

export interface Comment {
  id: string;
  by: Role;
  byName?: string;
  text: string;
  at: string;
}

export interface Version {
  at: string;
  caption: string;
  graphicUrl: string;
}

/** Client approval of one line of the monthly Content Calendar. */
export type PlanStatus = "draft" | "sent" | "approved" | "changes";
export interface PlanInfo {
  status: PlanStatus;
  note?: string; // client's comment
  headline?: string; // headline the client suggests
  at?: string;
}
/** Which places are already posted, with the live link. */
export type Posted = Partial<Record<Placement, { at: string; url: string }>>;

export interface ContentCard {
  id: string;
  title: string;
  category: Category;
  platform: Platform; // old single platform (kept for old rows)
  placements: Placement[]; // where this post goes (saved in the "platforms" column)
  format: string;
  jobId?: string;
  stage: Stage;
  caption: string; // Facebook caption
  tiktokCaption: string;
  hashtags: string;
  cta: string;
  graphicUrl: string; // Facebook image / link
  tiktokMediaUrl: string; // TikTok cover / video link
  graphicSrc: string; // what to show for graphicUrl (signed link for uploads)
  tiktokSrc: string; // what to show for tiktokMediaUrl
  notes: string;
  clientNote: string; // the client's own note on a plan line
  sourceLink: string;
  plannedDate: string; // yyyy-mm-dd
  plannedTime: string; // HH:mm
  publishedUrl: string;
  contentApproval: Approval;
  graphicApproval: Approval;
  review: Review;
  plan: PlanInfo;
  posted: Posted;
  versions: Version[];
  comments: Comment[];
  createdAt: string;
}

export interface Reference {
  id: string;
  kind: "like" | "dislike";
  title: string;
  url: string;
  note: string;
  by: Role;
  byName?: string;
  at: string;
}

export interface Activity {
  id: string;
  at: string;
  by: Role;
  byName?: string;
  text: string;
}

/** planned = put on the Content Calendar by the AI planner (has cardId); used = a post was made from it */
export type IdeaStatus = "new" | "seen" | "planned" | "used";
export interface Idea {
  id: string;
  text: string;
  links: string[];
  images: string[]; // storage paths
  imageUrls: string[]; // signed URLs for showing
  status: IdeaStatus;
  cardId?: string;
  byName?: string;
  by: Role;
  at: string;
}

export type InquiryKind = "inquiry" | "application";
export const APPLICANT_STAGES = ["new", "contacted", "interview", "passed", "departed", "rejected"] as const;
export type ApplicantStage = (typeof APPLICANT_STAGES)[number];
export interface Inquiry {
  id: string;
  date: string; // yyyy-mm-dd
  platform: Platform;
  kind: InquiryKind;
  name: string;
  contact: string;
  jobId?: string;
  cardId?: string;
  note: string;
  stage: ApplicantStage;
  byName?: string;
  at: string;
}

export interface Reply {
  id: string;
  title: string;
  answerMy: string;
  answerEn: string;
  answerJa: string;
  jobId?: string;
  sort: number;
}

export interface MetricShot {
  id: string;
  weekStart: string;
  platform: Platform;
  images: string[];
  imageUrls: string[];
  at: string;
}

export interface WeeklyMetric {
  weekStart: string; // Monday, yyyy-mm-dd
  platform: Platform;
  reach: number;
  engagement: number;
  newFollowers: number;
  linkClicks: number;
}
export const METRICS = ["reach", "engagement", "newFollowers", "linkClicks"] as const;
export type MetricKey = (typeof METRICS)[number];

export interface DB {
  profiles: Profile[];
  jobs: JobOrder[];
  cards: ContentCard[];
  references: Reference[];
  activity: Activity[];
  ideas: Idea[];
  inquiries: Inquiry[];
  metrics: WeeklyMetric[];
  replies: Reply[];
  shots: MetricShot[];
}
