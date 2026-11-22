// npx tsx test/unit.ts
import { parseCount } from "../src/numbers.js";
import { postFromLink, postedFromKey, plausible } from "../src/platforms.js";
import { londonMarks, cost } from "../src/store.js";
import { clean } from "../src/read.js";

let fails = 0;
const eq = (n: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fails++;
  console.log(ok ? "PASS" : "FAIL", n, ok ? "" : `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
};

eq("12.3K", parseCount("12.3K"), { value: 12300, abbreviated: true });
eq("1.2M followers", parseCount("1.2M followers"), { value: 1200000, abbreviated: true });
eq("1,204", parseCount("1,204"), { value: 1204, abbreviated: false });
eq("1.204 (European)", parseCount("1.204"), { value: 1204, abbreviated: false });
eq("12,3K (comma decimal)", parseCount("12,3K"), { value: 12300, abbreviated: true });
eq("2.1 million", parseCount("2.1 million subscribers"), { value: 2100000, abbreviated: true });
eq("850", parseCount("850"), { value: 850, abbreviated: false });
eq("no number", parseCount("Followers"), { value: null, abbreviated: false });
eq("12.5 without suffix isn't a count", parseCount("12.5").value, null);
eq("1 204 (space)", parseCount("1 204").value, 1204);

eq("IG reel link", postFromLink("instagram", "/rapid247/reel/DAbcdefgh02/", "https://www.instagram.com/rapid247")?.key, "ig:DAbcdefgh02");
eq("TikTok video", postFromLink("tiktok", "https://www.tiktok.com/@a/video/7400000000000000001?lang=en", "https://www.tiktok.com/")?.key, "tt:7400000000000000001");
eq("YouTube watch", postFromLink("youtube", "/watch?v=dQw4w9WgXcQ&t=1", "https://www.youtube.com/@x/videos")?.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
eq("YouTube short", postFromLink("youtube", "/shorts/abcDEF12345", "https://www.youtube.com/")?.key, "yt:abcDEF12345");
eq("X status (own)", postFromLink("x", "/rapid247/status/1790000000000000000", "https://x.com/rapid247", "rapid247")?.key, "x:1790000000000000000");
eq("X status (someone else's)", postFromLink("x", "/other/status/1790000000000000000", "https://x.com/rapid247", "rapid247"), null);
eq("LinkedIn post", postFromLink("linkedin", "https://www.linkedin.com/posts/rapid_hello-activity-7250000000000000000-abcd", "https://www.linkedin.com/")?.key, "li:7250000000000000000");
eq("Facebook reel", postFromLink("facebook", "https://www.facebook.com/reel/1114235920664408", "https://www.facebook.com/")?.key, "fb:1114235920664408");
eq("Facebook pfbid post", postFromLink("facebook", "https://www.facebook.com/rapid/posts/pfbid0abc?__cft__=x", "https://www.facebook.com/")?.url, "https://www.facebook.com/rapid/posts/pfbid0abc");
eq("profile link isn't a post", postFromLink("instagram", "/explore/", "https://www.instagram.com/"), null);

eq("TikTok id date", postedFromKey("tt:7470969622276164906")?.toISOString().slice(0, 10), "2025-02-13"); // matches create_time 1739470683
eq("X id date", postedFromKey("x:1790000000000000000")?.toISOString().slice(0, 7), "2024-05");
eq("IG shortcode date (DH3tWudxIKB = 31 Mar 2025)", postedFromKey("ig:DH3tWudxIKB")?.toISOString().slice(0, 10), "2025-03-31");
eq("implausible date dropped", plausible(new Date("1999-01-01")), null);

const summer = londonMarks(new Date("2026-07-10T16:05:00Z"));
eq("summer: 16:05 UTC is 17:00 in London", summer.hour, 17);
eq("summer: London midnight is 23:00 UTC the day before", summer.dayStart.toISOString(), "2026-07-09T23:00:00.000Z");
const winter = londonMarks(new Date("2026-01-10T16:05:00Z"));
eq("winter: 16:05 UTC is 16:00 in London (skipped)", winter.hour, 16);
eq("winter: 17:05 UTC is 17:00", londonMarks(new Date("2026-01-10T17:05:00Z")).hour, 17);
eq("month start (winter)", winter.monthStart.toISOString(), "2026-01-01T00:00:00.000Z");
eq("last month start across new year", winter.lastMonthStart.toISOString(), "2025-12-01T00:00:00.000Z");

const s = { scraper_model: "claude-haiku-5-5", posts_per_profile: 3, monthly_budget_usd: 10, prices: { "claude-haiku-5-5": { input: 0.1, output: 0.5 } } };
eq("cost from usage", cost(s, "claude-haiku-5-5", 1_000_000, 1_000_000), 0.6);
eq("unknown model costs 0 (shown as such)", cost(s, "other", 100, 100), 0);

const c = clean([{ name: "followers", label: "Followers", text: "12.3K", value: 12000, abbreviated: true, confidence: 0.9 }]);
eq("AI value disagrees with its own text: text wins, confidence lowered", [c[0].value, c[0].confidence], [12300, 0.5]);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
