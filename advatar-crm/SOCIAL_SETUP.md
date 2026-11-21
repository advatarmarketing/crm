# Content Hub numbers (Instagram, TikTok, Facebook)

The client's **Content Hub** shows their followers, likes, comments, views
and best videos. The numbers are read from their **public profiles**, using
a scanning service called **ScrapeCreators**. There's no Meta or TikTok
app, no business verification and no client logins. You paste a profile
link, and the app reads the rest.

## One-off setup (about 5 minutes)

1. Go to **scrapecreators.com** and sign up. You get some free credits to
   start with. After that you buy credits as you go. Reading one profile,
   or one page of its posts, uses one credit.
2. In the ScrapeCreators dashboard, copy your **API key**. Never paste it
   into a chat.
3. In **Vercel → your project → Settings → Environment Variables**, add
   these for **Production**:

   | Name | What to paste |
   |---|---|
   | `SCRAPECREATORS_API_KEY` | the API key from step 2 |
   | `CRON_SECRET` | any long random password you make up (30+ letters and numbers). It lets the daily refresh run, and stops strangers from triggering it. |

4. **Redeploy** (Deployments → ⋯ on the latest → Redeploy).

## For each client

1. Open the client → **Performance** → **Accounts we manage**.
2. Paste their Instagram, TikTok and/or Facebook profile link (or @name).
3. Set the **first posting date**, the day we started posting for them.
   Only posts from that day on count.
4. Click **Save**. The profiles are read straight away (it can take up to
   a minute). The numbers then show on their Content Hub.

The numbers refresh every morning at about 5–6am UK time. A snapshot of
followers is saved each day, so the growth figures build up from the day
you add the link.

**Video post numbers fill themselves in too.** On a video, under **Where
it's posted**, paste the post's link. Its views, likes, comments and
shares appear by themselves, update every morning, and are marked
**Automatic**.

## Good to know

- **Accounts must be public.** A private account's numbers can't be read.
  The card says so if that's the problem.
- **What you get:** followers, posts, likes, comments, video views and
  shares (TikTok and Facebook). Instagram doesn't show shares publicly.
  Reach, impressions and audience details are private to the account
  owner, so they aren't available this way.
- **Credits:** each client uses a few credits per platform per day, plus a
  few more when you press **Save** or **Refresh now**. Keep an eye on the
  balance in the ScrapeCreators dashboard. When it runs out, the cards say
  so and the numbers stop updating until you top up.
- **Changing a link** to a different account clears what was read from the
  old one, so two accounts' numbers never mix.
- **Something not updating?** Press **Refresh now** on the Performance
  tab. If there's a problem, a plain message appears on that platform's
  card.
