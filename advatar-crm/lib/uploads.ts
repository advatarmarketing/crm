import type { SubmissionStatus, SubmissionVisibility } from "@/lib/supabase/types";

/**
 * Structural rather than `SupabaseClient<Database>`, for the same
 * reason lib/submissions.ts is — see the long note there and in
 * lib/supabase/admin.ts. The hand-written Database type doesn't match
 * the installed supabase-js, so a typed client won't assign to a
 * typed parameter and the call site fails to compile on a query that
 * is perfectly valid.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

/** Which thread a note belongs to. */
export type FeedbackAudience = "team" | "client";

export interface UploadVersion {
  id: string;
  version: number;
  url: string | null;
  notes: string | null;
  created_at: string;
}

export interface UploadNote {
  id: string;
  version: number | null;
  body: string;
  audience: FeedbackAudience;
  timecode_seconds: number | null;
  /** Signed, short-lived, and null when there is no screenshot or the sign failed. */
  screenshotUrl: string | null;
  created_at: string;
  authorId: string | null;
  authorName: string | null;
}

export interface UploadChecklistItem {
  id: string;
  text: string;
  done: boolean;
  version: number | null;
  source: FeedbackAudience;
  feedbackId: string | null;
  created_at: string;
}

export interface UploadEntry {
  id: string;
  title: string;
  brief: string | null;
  status: SubmissionStatus;
  visibility: SubmissionVisibility;
  current_version: number;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
  clientName: string | null;
  personName: string | null;
  versions: UploadVersion[];
  notes: UploadNote[];
  checklist: UploadChecklistItem[];
}

export interface AssetEntry {
  id: string;
  client_id: string;
  submission_id: string | null;
  kind: "link" | "file";
  title: string;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  visibility: "team" | "team_and_client";
  uploaded_by: string | null;
  created_at: string;
  clientName: string | null;
  uploaderName: string | null;
  /** Signed link for a stored file; null for links, which carry `url`. */
  fileUrl: string | null;
}

/**
 * Everything the Uploads tab shows, for whoever is asking.
 *
 * Flat queries rather than nested embeds, deliberately — every child
 * table here has its own RLS, and keeping them separate means an
 * empty list is visibly "the policy returned nothing" rather than an
 * embed having quietly dropped rows.
 *
 * Each query is also allowed to fail on its own. The Uploads page is
 * the first thing three of the four roles will open, and this app has
 * twice had a page go blank because one query referenced a column a
 * migration hadn't added yet. A missing checklist table should cost
 * the checklist, not the page.
 */
export async function loadUploads(
  supabase: QueryableClient,
  filter?: { createdBy?: string; clientId?: string; audience?: FeedbackAudience }
): Promise<{ uploads: UploadEntry[]; problem: string | null }> {
  let query = supabase
    .from("submissions")
    .select("id, title, brief, status, visibility, current_version, client_id, created_by, created_at")
    .order("created_at", { ascending: false });

  if (filter?.createdBy) query = query.eq("created_by", filter.createdBy);
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);

  const { data: rows, error } = await query;

  if (error) return { uploads: [], problem: error.message };

  const parents = (rows ?? []) as Omit<
    UploadEntry,
    "versions" | "notes" | "checklist" | "clientName" | "personName"
  >[];

  if (parents.length === 0) return { uploads: [], problem: null };

  const ids = parents.map((s) => s.id);

  const [versions, feedback, checklist, people, clients] = await Promise.all([
    settle(
      supabase
        .from("submission_versions")
        .select("id, submission_id, version, url, notes, created_at")
        .in("submission_id", ids)
        .order("version", { ascending: false })
    ),
    settle(
      supabase
        .from("submission_feedback")
        .select("id, submission_id, version, body, audience, timecode_seconds, screenshot_path, author_id, created_at")
        .in("submission_id", ids)
        .order("created_at", { ascending: true })
    ),
    settle(
      supabase
        .from("submission_checklist")
        .select("id, submission_id, feedback_id, version, text, done, source, created_at")
        .in("submission_id", ids)
        .order("created_at", { ascending: true })
    ),
    settle(supabase.from("profiles").select("id, full_name")),
    settle(supabase.from("clients").select("id, name")),
  ]);

  const nameById = new Map(
    ((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name?.trim() || null])
  );
  const clientNameById = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const versionsBySubmission = groupBy(
    (versions ?? []) as (UploadVersion & { submission_id: string })[],
    (v) => v.submission_id
  );

  type FeedbackRow = {
    id: string;
    submission_id: string;
    version: number | null;
    body: string;
    audience: FeedbackAudience | null;
    timecode_seconds: number | null;
    screenshot_path: string | null;
    author_id: string | null;
    created_at: string;
  };

  const feedbackRows = (feedback ?? []) as FeedbackRow[];

  // One signing round for every screenshot on the page rather than one
  // per note: createSignedUrls takes a list, and a page of ten notes
  // with a grab each would otherwise be ten round trips.
  const shotPaths = feedbackRows.map((f) => f.screenshot_path).filter((p): p is string => !!p);
  const shotUrlByPath = await signMany(supabase, "feedback-shots", shotPaths);

  const notesBySubmission = groupBy(
    feedbackRows
      .filter((f) => (filter?.audience ? (f.audience ?? "team") === filter.audience : true))
      .map<UploadNote & { submission_id: string }>((f) => ({
        submission_id: f.submission_id,
        id: f.id,
        version: f.version,
        body: f.body,
        audience: (f.audience ?? "team") as FeedbackAudience,
        timecode_seconds: f.timecode_seconds,
        screenshotUrl: f.screenshot_path ? shotUrlByPath.get(f.screenshot_path) ?? null : null,
        created_at: f.created_at,
        authorId: f.author_id,
        authorName: f.author_id ? nameById.get(f.author_id) ?? null : null,
      })),
    (f) => f.submission_id
  );

  const checklistBySubmission = groupBy(
    ((checklist ?? []) as {
      id: string;
      submission_id: string;
      feedback_id: string | null;
      version: number | null;
      text: string;
      done: boolean;
      source: FeedbackAudience | null;
      created_at: string;
    }[]).map((c) => ({
      submission_id: c.submission_id,
      id: c.id,
      text: c.text,
      done: c.done,
      version: c.version,
      source: (c.source ?? "team") as FeedbackAudience,
      feedbackId: c.feedback_id,
      created_at: c.created_at,
    })),
    (c) => c.submission_id
  );

  return {
    problem: null,
    uploads: parents.map((s) => ({
      ...s,
      clientName: s.client_id ? clientNameById.get(s.client_id) ?? null : null,
      personName: s.created_by ? nameById.get(s.created_by) ?? null : null,
      versions: versionsBySubmission.get(s.id) ?? [],
      notes: notesBySubmission.get(s.id) ?? [],
      checklist: checklistBySubmission.get(s.id) ?? [],
    })),
  };
}

/**
 * Raw footage and reference material, for the Uploads tab's second
 * sub-tab.
 *
 * `clientId` narrows it to one client; without it you get everything
 * RLS allows, which for a CEO is every client and for a videographer
 * is the handful they are assigned to.
 */
export async function loadAssets(
  supabase: QueryableClient,
  filter?: { clientId?: string }
): Promise<{ assets: AssetEntry[]; problem: string | null }> {
  let query = supabase
    .from("client_assets")
    .select(
      "id, client_id, submission_id, kind, title, url, storage_path, mime_type, size_bytes, notes, visibility, uploaded_by, created_at"
    )
    .order("created_at", { ascending: false });

  if (filter?.clientId) query = query.eq("client_id", filter.clientId);

  const { data, error } = await query;

  if (error) return { assets: [], problem: error.message };

  const rows = (data ?? []) as Omit<AssetEntry, "clientName" | "uploaderName" | "fileUrl">[];

  if (rows.length === 0) return { assets: [], problem: null };

  const [people, clients] = await Promise.all([
    settle(supabase.from("profiles").select("id, full_name")),
    settle(supabase.from("clients").select("id, name")),
  ]);

  const nameById = new Map(
    ((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name?.trim() || null])
  );
  const clientNameById = new Map(((clients ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const paths = rows.map((a) => a.storage_path).filter((p): p is string => !!p);
  const fileUrlByPath = await signMany(supabase, "upload-assets", paths);

  return {
    problem: null,
    assets: rows.map((a) => ({
      ...a,
      clientName: clientNameById.get(a.client_id) ?? null,
      uploaderName: a.uploaded_by ? nameById.get(a.uploaded_by) ?? null : null,
      fileUrl: a.storage_path ? fileUrlByPath.get(a.storage_path) ?? null : null,
    })),
  };
}

/**
 * Signed URLs for a batch of storage paths.
 *
 * Never throws and never rejects: a bucket that doesn't exist yet
 * (because 0028 hasn't been run) returns an empty map, and the caller
 * renders "screenshot unavailable" rather than a 500. An hour is long
 * enough to read a page and short enough that a copied link is not a
 * permanent back door.
 */
async function signMany(
  supabase: QueryableClient,
  bucket: string,
  paths: string[]
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const unique = Array.from(new Set(paths));
  if (unique.length === 0) return found;

  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, 60 * 60);
    for (const row of (data ?? []) as { path: string | null; signedUrl: string | null }[]) {
      if (row.path && row.signedUrl) found.set(row.path, row.signedUrl);
    }
  } catch {
    // Leave the map empty.
  }

  return found;
}

/** Awaits a PostgREST query and hands back its rows, or null if it failed. */
async function settle<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  try {
    const { data } = await query;
    return data ?? null;
  } catch {
    return null;
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(row);
  }
  return out;
}

/**
 * 83 -> "1:23". The inverse of parseTimecode below.
 *
 * Hours only appear when there are any, because a 40-second reel
 * showing "0:00:12" reads as a mistake.
 */
export function formatTimecode(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * "1:23", "83", "1:02:03" -> seconds. Anything else -> null.
 *
 * Typed by hand into a small box while scrubbing a video, so it takes
 * the three forms people actually write and refuses the rest rather
 * than guessing — a note pinned to the wrong moment is worse than one
 * pinned to no moment at all.
 */
export function parseTimecode(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  const parts = raw.split(":");
  if (parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p.trim()))) return null;

  const numbers = parts.map((p) => parseInt(p.trim(), 10));
  const seconds =
    numbers.length === 1
      ? numbers[0]
      : numbers.length === 2
        ? numbers[0] * 60 + numbers[1]
        : numbers[0] * 3600 + numbers[1] * 60 + numbers[2];

  // 24 hours of video is a typo, not a timecode.
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) return null;
  return seconds;
}
