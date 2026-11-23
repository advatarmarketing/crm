/**
 * Professional Replier (0056): shared shapes and labels, safe for the
 * browser. The prompt and the call to Claude are in lib/replier-server.ts.
 */

export type ReplyingAs = "sales" | "videographer" | "operations" | "ceo";
export type Channel = "whatsapp" | "instagram" | "email" | "text";

export const REPLYING_AS: { id: ReplyingAs; label: string }[] = [
  { id: "sales", label: "Sales" },
  { id: "videographer", label: "Videographer" },
  { id: "operations", label: "Operations" },
  { id: "ceo", label: "CEO" },
];

export const CHANNELS: { id: Channel; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram DM" },
  { id: "email", label: "Email" },
  { id: "text", label: "Text message" },
];

export interface Reply {
  label: string;
  text: string;
  why: string;
}

export interface ReplierResult {
  understanding: string;
  needs_ceo: boolean;
  ceo_reason: string | null;
  note_to_ceo: string | null;
  replies: Reply[];
  check_first: string[];
}

export interface ReplierRun {
  id: string;
  created_by: string;
  client_id: string | null;
  replying_as: ReplyingAs;
  channel: Channel;
  client_message: string;
  extra: string | null;
  result: ReplierResult;
  needs_ceo: boolean;
  ceo_reason: string | null;
  cost_usd: number | null;
  chosen: number | null;
  copied_at: string | null;
  rating: -1 | 1 | null;
  feedback: string | null;
  created_at: string;
}

export interface Playbook {
  needs_ceo: string;
  house_style: string;
  never_promise: string;
  facts: string;
  updated_at: string | null;
}

export interface ReplierExample {
  id: string;
  client_message: string;
  reply: string;
  note: string | null;
  created_at: string;
}

export const RUN_COLUMNS =
  "id, created_by, client_id, replying_as, channel, client_message, extra, result, needs_ceo, ceo_reason, cost_usd, chosen, copied_at, rating, feedback, created_at";

export const MAX_MESSAGE = 8000;
export const MAX_EXTRA = 2000;
