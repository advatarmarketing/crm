# Content Hub numbers: the social stats scraper

Every day at **5pm UK time** a scraper opens each client's public profile
(Instagram, TikTok, YouTube, Facebook, LinkedIn, X), logged out, and takes
a screenshot. Claude Haiku reads the numbers off it. It then does the same
for the latest few posts. Every reading is saved with its date, so the
Content Hub can show 7 days, 30 days, 90 days and "Since we started".

It runs on **GitHub Actions** (the `scraper/` folder and
`.github/workflows/social-scraper.yml`), not on Vercel, and writes into the
same Supabase database.

## One-off setup

1. **Supabase:** run database update `0052_social_scraper.sql` (or its
   `PASTE_` version), then `VERIFY_0052.sql`. Every line should say OK.
2. **GitHub:** the `advatarmarketing/crm` repository → **Settings → Secrets
   and variables → Actions → New repository secret**. Add three:
   - `ANTHROPIC_API_KEY`: your Anthropic key.
   - `SUPABASE_URL`: from Supabase → Project Settings → API → Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: from the same page, the `service_role`
     secret.
3. **Vercel (for the Refresh now button):** create a GitHub token at
   github.com → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → Generate new token:
   - Resource owner: advatarmarketing
   - Repository access: Only select repositories → `crm`
   - Permissions → Repository permissions → **Actions: Read and write**
   - Copy it, then in Vercel → Settings → Environment Variables add
     `GITHUB_ACTIONS_TOKEN` with it, for Production, and redeploy.

You no longer need `SCRAPECREATORS_API_KEY` or any Meta/TikTok codes.

## Adding a client

Open the client → **Performance** → **Accounts we manage**. For each
platform you post on:
- paste the public profile link;
- type the follower count on the day you started (the starting point);
- pick the date you started.

Click **Save**, then **Refresh now** if you don't want to wait until 5pm.
The numbers appear within about 5 minutes.

## Safety checks

- A reading that fails, or a follower count that jumps more than 20% since
  the last good one, is **not shown to the client**. It appears under
  **Needs checking** on the Performance tab with the screenshot the AI read,
  for you to **Accept** or **Reject**.
- A page that fails is retried once, then marked failed. One broken link
  never stops the run.
- A number the platform doesn't show (hidden likes, login walls) is stored
  as not available and shows as "Not available from this platform", never
  as a made-up number.
- Screenshots are kept for 14 days, then deleted. The readings stay.

## Costs

Finance → **AI spend** shows what every Anthropic call costs (the scraper,
and the meeting reader, report writer and screenshot reader), from the
token counts the API reports. Set the prices, the £/$ rate and a **monthly
budget** there. At 80% the team sees a warning; at 100% the scraper pauses
until you raise the budget or the month resets.

A screenshot read costs about $0.0002–0.0003 with Claude Haiku. A client
with all six platforms and 3 posts each is about 24 reads a day, roughly
**$0.20 a month**.

## Good to know

- Platforms try to stop logged-out visits from servers. YouTube almost
  always works; TikTok and Facebook Pages usually do; Instagram often
  shows a login wall; LinkedIn and X are hit and miss. Failures are shown,
  never guessed.
- GitHub sometimes starts scheduled jobs 5–30 minutes late.
- GitHub Actions is free for private repositories up to 2,000 minutes a
  month. A daily run takes roughly 1 minute per client.
