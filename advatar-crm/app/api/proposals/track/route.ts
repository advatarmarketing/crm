import { NextResponse } from "next/server";
import { z } from "zod";
import { recordEvents } from "@/lib/proposals/server";

export const dynamic = "force-dynamic";

/**
 * What a client does on their proposal link (0057): which pages, for
 * how long, which package, extras, the contract. Sent in small
 * batches by the page (navigator.sendBeacon). Unknown codes and
 * previews are dropped quietly.
 */
const body = z.object({
  code: z.string().regex(/^[a-f0-9]{64}$/),
  session: z.string().min(4).max(64),
  events: z
    .array(
      z.object({
        kind: z.enum(["open", "slide", "package", "breakdown", "extra", "plan", "contract", "lets_go", "email", "method"]),
        slide: z.string().max(60).nullish(),
        package: z.string().max(30).nullish(),
        ms: z.number().min(0).max(3600000).nullish(),
        detail: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).nullish(),
      })
    )
    .max(60),
});

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = body.safeParse(JSON.parse(await request.text()));
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  await recordEvents(parsed.data.code, parsed.data.session, parsed.data.events).catch((e) => console.error("[proposals/track]", e));
  return NextResponse.json({ ok: true });
}
