/**
 * A client's brand kit, and the blank one.
 *
 * These live here rather than in components/BrandKitPanel.tsx, and
 * that is the whole reason this file exists.
 *
 * BrandKitPanel is a "use client" module. A SERVER component that
 * imports a plain function from one of those does not get the
 * function — it gets a client reference, a placeholder React swaps for
 * the real thing in the browser. Calling it on the server throws
 * `TypeError: (0 , x.y) is not a function`, and because it happens
 * while the page is rendering, the whole route comes back as the
 * "that page didn't load" screen.
 *
 * That is exactly what a videographer hit opening a client:
 *
 *     <BrandKitPanel initialKit={brandKit.data ?? emptyBrandKit(id)} />
 *
 * The right-hand side of `??` only runs when there is no brand kit
 * row, so the page worked for every client somebody had filled a
 * brand kit in for and broke for the ones nobody had — which is why
 * it looked like one client being cursed rather than a bug in the
 * page. The CEO's own client page never hit it: it passes the row
 * through a client component, where calling the function is fine.
 *
 * A type and a function with no hooks and no JSX have no business
 * being in a client module anyway. Here, either side can use them.
 */
export interface BrandKit {
  client_id: string;
  colours: string[];
  fonts: string[];
  platforms: string[];
  logo_urls: string[];
  tone_of_voice: string | null;
  dos: string | null;
  donts: string | null;
}

export function emptyBrandKit(clientId: string): BrandKit {
  return {
    client_id: clientId,
    colours: [],
    fonts: [],
    platforms: [],
    logo_urls: [],
    tone_of_voice: null,
    dos: null,
    donts: null,
  };
}

/**
 * Forces a kit into the shape the panel assumes.
 *
 * Every `.length` and `.map` in BrandKitPanel used to run straight off
 * the row, so one null list — a row written by something other than
 * the panel, a partly-applied migration — threw during render and took
 * the page down the same way. The four lists are declared
 * `not null default '{}'` in 0020, but "the database says it cannot
 * happen" is what the page was relying on when it broke.
 */
export function normaliseBrandKit(
  kit: Partial<BrandKit> | null | undefined,
  clientId?: string
): BrandKit {
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return {
    client_id: kit?.client_id ?? clientId ?? "",
    colours: list(kit?.colours),
    fonts: list(kit?.fonts),
    platforms: list(kit?.platforms),
    logo_urls: list(kit?.logo_urls),
    tone_of_voice: kit?.tone_of_voice ?? null,
    dos: kit?.dos ?? null,
    donts: kit?.donts ?? null,
  };
}
