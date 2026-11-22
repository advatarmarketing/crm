# Social stats scraper

Reads public profile numbers for the CRM's Content Hub. See
`advatar-crm/SOCIAL_SETUP.md` for setup in plain English.

- `src/run.ts`: the run (5pm London gate, budget pause, clients, retries, safety checks, clean-up)
- `src/browser.ts`: Playwright: open a page logged out, close pop-ups, screenshot
- `src/read.ts`: Claude reads one screenshot (structured JSON), numbers checked against the text
- `src/platforms.ts`: per-platform links, post keys and dates from post ids
- `src/store.ts`: Supabase, settings, costs, London time

Run by `.github/workflows/social-scraper.yml`. Locally:

```
npm ci && npx playwright install chromium
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ANTHROPIC_API_KEY=… TRIGGER=manual CLIENT_ID=… npm run scrape
npx tsx test/unit.ts
```
