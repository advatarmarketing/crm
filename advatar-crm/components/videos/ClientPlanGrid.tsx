"use client";

import { VideoSchedule } from "./VideoSchedule";

/**
 * The Videos tab of the client's Content Plan: exactly the team's
 * coloured box grid (components/videos/VideoSchedule), read-only. A
 * box opens that video on the client's own Videos page, where they
 * watch it and leave notes.
 */
export function ClientPlanGrid({ clientId }: { clientId: string }) {
  return <VideoSchedule clientId={clientId} editable={false} openHref={(id) => `/app/portal/videos#video-${id}`} />;
}
