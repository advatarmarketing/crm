"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GuidedTour } from "@/components/portal/ClientTour";
import { teamTour, teamTourSteps, type TeamTourKind } from "@/lib/team-tour";

/**
 * The team walkthrough: a welcome, then a tour of their own pages.
 *
 * - Sales (staff) and videographers get theirs once, on their first
 *   visit (profiles.tour_seen_at, shared with the client tour), and can
 *   replay it from the ⓘ button.
 * - The CEO and operations managers can preview either one with
 *   ?tour=sales or ?tour=videography (the buttons on Team access). A
 *   preview is never marked as seen and has no ⓘ button.
 */
export function TeamTour({
  kind,
  autoStart,
  clientId,
  hidden,
  replier,
}: {
  /** Null for people who only ever preview (CEO, operations). */
  kind: TeamTourKind | null;
  autoStart: boolean;
  clientId: string | null;
  hidden: string[];
  replier: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const asked = params?.get("tour");
  // Held here (this sits in the app layout, which stays put), because
  // the tour moves on to pages whose address has no ?tour= on it.
  const [preview, setPreview] = useState<TeamTourKind | null>(null);
  useEffect(() => {
    if (kind === null && (asked === "sales" || asked === "videography")) setPreview(asked);
  }, [asked, kind]);
  const shown = preview ?? kind;

  // Closing a preview drops ?tour= too, so a refresh doesn't reopen it.
  const endPreview = useCallback(() => {
    if (!preview) return;
    setPreview(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has("tour")) {
      url.searchParams.delete("tour");
      router.replace(url.pathname + url.search);
    }
  }, [preview, router]);

  const steps = useMemo(
    () => (shown ? teamTourSteps(shown, { clientId, hidden: preview ? [] : hidden, replier: preview ? true : replier }) : []),
    [shown, clientId, hidden, replier, preview]
  );
  if (!shown) return null;
  const t = teamTour(shown, { replier: preview ? true : replier });

  return (
    <GuidedTour
      // A fresh tour for each preview, so switching between them restarts.
      key={preview ? `preview-${preview}` : shown}
      autoStart={preview ? true : autoStart}
      steps={steps}
      welcome={t.welcome}
      home={preview ? "/app/settings/access" : t.home}
      done={t.done}
      markSeen={!preview}
      replayWelcome
      showInfo={!preview}
      onClosed={endPreview}
    />
  );
}
