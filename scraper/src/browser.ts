import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

/**
 * A normal, logged-out desktop browser. Nothing is signed in and no
 * cookies are kept between runs.
 */
export async function openBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    // Only for running on this machine against a browser that's already
    // installed; the GitHub job installs its own.
    executablePath: process.env.SCRAPER_CHROMIUM_PATH || undefined,
  });
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "en-GB",
    timezoneId: "Europe/London",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  context.setDefaultTimeout(15_000);
  await instagramLogin(context);
  await fixtures(context);
  return context;
}

/** True when an Instagram login is saved in the job's secrets. */
export function instagramLoggedIn(): boolean {
  return !!process.env.INSTAGRAM_SESSIONID?.trim();
}

/**
 * An Instagram login, when one is saved (GitHub secret
 * INSTAGRAM_SESSIONID): the "sessionid" cookie from a browser where that
 * account is logged in. Nothing types a password; logging that session
 * out in Instagram (Settings → Accounts Centre → Password and security →
 * Where you're logged in) cancels it. The cookie only ever goes to
 * instagram.com.
 */
async function instagramLogin(context: BrowserContext) {
  const value = process.env.INSTAGRAM_SESSIONID?.trim();
  if (!value) return;
  await context.addCookies([
    { name: "sessionid", value: decodeURIComponent(value), domain: ".instagram.com", path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
  ]);
}

/**
 * Test runs only (SCRAPER_FIXTURES set): every page comes from a local
 * folder instead of the internet, so the whole run can be checked
 * without touching the real sites.
 */
async function fixtures(context: BrowserContext) {
  const base = process.env.SCRAPER_FIXTURES;
  if (!base) return;
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    const res = await fetch(`${base}/${u.hostname}${u.pathname}${u.search}`).catch(() => null);
    if (!res || !res.ok) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ status: 200, contentType: res.headers.get("content-type") ?? "text/html", body: Buffer.from(await res.arrayBuffer()) });
  });
}

// Cookie banners and "log in to see more" boxes: the buttons that close
// them, in the languages a UK visitor is likely to get.
const CLOSE = /^(accept all( cookies)?|allow all( cookies)?|accept( cookies)?|i agree|agree|got it|ok|only allow essential cookies|decline optional cookies|reject all|reject non-essential cookies|not now|close|dismiss|×|✕)$/i;

/**
 * Login walls that have no close button: hide anything fixed on top of
 * the page that covers a good part of it and asks to log in or accept
 * cookies, and let the page scroll again. (A string, for the same reason
 * as in meta() below.)
 */
const HIDE_NAGS = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    const s = getComputedStyle(el);
    if (s.position !== "fixed" && s.position !== "sticky") continue;
    // Never the page itself: some sites lay their whole page out in a
    // fixed box, and a nag box has little text of its own.
    if (el.querySelector("main, header, article, [role=main]") || (el.innerText || "").length > 600) continue;
    const r = el.getBoundingClientRect();
    const covers = r.width * r.height > vw * vh * 0.25;
    const dialog = el.getAttribute("role") === "dialog" || el.getAttribute("aria-modal") === "true";
    const text = (el.innerText || "").toLowerCase();
    const nag = /log ?in|sign ?up|sign ?in|cookie|consent|create (an )?account|join now/.test(text);
    if ((covers || dialog) && nag) el.style.setProperty("display", "none", "important");
  }
  for (const el of [document.documentElement, document.body]) el.style.setProperty("overflow", "auto", "important");
  window.scrollTo(0, 0);
})()`;

/**
 * The ✕ in the corner of a "See photos and videos from …" or "Never
 * miss a post from …" box (Instagram, TikTok): an icon labelled Close
 * inside the box. Clicking it is what a visitor does, and the page
 * underneath then shows normally.
 */
const CLOSE_ICON = '[role="dialog"] [aria-label="Close" i], [aria-modal="true"] [aria-label="Close" i], [role="dialog"] [aria-label="Dismiss" i]';

export async function closeBoxes(page: Page) {
  for (let round = 0; round < 2; round++) {
    const icons = page.locator(CLOSE_ICON);
    const n = Math.min(await icons.count().catch(() => 0), 4);
    let clicked = false;
    for (let i = 0; i < n; i++) {
      const icon = icons.nth(i);
      if (!(await icon.isVisible().catch(() => false))) continue;
      await icon.click({ timeout: 2_000 }).then(() => (clicked = true)).catch(() => {});
    }
    if (!clicked) return;
    await page.waitForTimeout(600);
  }
}

/** Close what can be closed and take the rest out of the way. Never throws. */
export async function clearPopups(page: Page) {
  // The box's own ✕ first, as a person would; then hide any big overlay
  // still there, so it doesn't sit on top of the buttons below.
  await closeBoxes(page).catch(() => {});
  await page.evaluate(HIDE_NAGS).catch(() => {});
  for (let round = 0; round < 2; round++) {
    for (const frame of page.frames()) {
      try {
        const buttons = frame.getByRole("button", { name: CLOSE });
        const n = Math.min(await buttons.count(), 4);
        for (let i = 0; i < n; i++) {
          const b = buttons.nth(i);
          if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2_000 }).catch(() => {});
        }
      } catch {
        // A frame that went away mid-way.
      }
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.evaluate(HIDE_NAGS).catch(() => {});
}

/** How much readable text is on the page, and where it ended up. */
export async function pageState(page: Page): Promise<{ text: number; url: string; loginWall: boolean }> {
  const text = (await page.evaluate(`(document.body && document.body.innerText || "").trim().length`).catch(() => 0)) as number;
  const url = page.url();
  return { text, url, loginWall: /\/accounts\/login|\/login\b|authwall|checkpoint|\/i\/flow\/login|signup/i.test(new URL(url).pathname + new URL(url).search) };
}

/**
 * Open a page, wait until it has actually drawn something (and, when
 * given, until `waitFor` appears), then clear pop-ups. Many of these
 * sites draw the page with JavaScript a few seconds after it "loads".
 */
export async function load(page: Page, url: string, waitFor?: string) {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(`(document.body && document.body.innerText || "").trim().length > 120`, null, { timeout: 12_000 }).catch(() => {});
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  await clearPopups(page);
  await page.waitForTimeout(800);
  return res?.status() ?? 0;
}

/** Scroll down to make a post grid load, then back to the top. */
export async function nudge(page: Page, waitFor?: string) {
  await page.evaluate(`window.scrollTo(0, 1400)`).catch(() => {});
  await page.waitForTimeout(1_500);
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 8_000 }).catch(() => {});
  await page.evaluate(`window.scrollTo(0, 0)`).catch(() => {});
}

/** One small screenshot of what's on screen (1280×800, compressed). */
export async function shot(page: Page): Promise<Buffer> {
  return page.screenshot({ type: "jpeg", quality: 60, fullPage: false });
}

/** All the text the page shows. */
export async function bodyText(page: Page): Promise<string> {
  return ((await page.evaluate(`(document.body && document.body.innerText) || ""`).catch(() => "")) as string) ?? "";
}

/** Every link on the page, in order. */
export async function links(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href)).catch(() => []);
}

/** What the page says about itself for sharing: picture, text and date. */
export async function meta(page: Page): Promise<{ image: string | null; description: string | null; published: string | null }> {
  // Written as a string: code run inside the page can't use helpers the
  // TypeScript runner adds around named functions.
  const script = `(() => {
    const get = (sel) => { const el = document.querySelector(sel); return el ? el.getAttribute("content") : null; };
    return {
      image: get('meta[property="og:image"]') || get('meta[name="twitter:image"]'),
      description: get('meta[property="og:description"]') || get('meta[name="description"]'),
      published: get('meta[itemprop="datePublished"]') || get('meta[itemprop="uploadDate"]') || get('meta[property="article:published_time"]') || get('meta[property="og:video:release_date"]'),
    };
  })()`;
  return (page.evaluate(script) as Promise<{ image: string | null; description: string | null; published: string | null }>).catch(() => ({
    image: null,
    description: null,
    published: null,
  }));
}
