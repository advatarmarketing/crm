# Connecting Facebook, Instagram and TikTok (Content Hub)

The client's **Content Hub** shows real numbers from Facebook, Instagram and
TikTok. To do that, Advatar needs its own "app" on Meta's and TikTok's
developer sites. That's a one-off setup, done once for the whole agency, not
per client. After that, each client (or your team) presses **Connect** and
logs in.

You'll end up with a few codes to paste into Vercel. Never paste them into a
chat.

Wherever it says `app.advatar.co.uk`, use your real app address.

---

## Before you start

- **A privacy policy page and a terms page on your website.** For example
  `https://www.advatar.co.uk/privacy` and `https://www.advatar.co.uk/terms`.
  Both Meta and TikTok refuse to approve an app without them.
- **A square logo**, 1024 × 1024 pixels, PNG.
- **Your business documents**, for Meta's business verification: a company
  registration certificate, a utility bill, or a bank statement showing the
  business name and address.
- **Each client's Instagram must be a Business or Creator account linked to
  their Facebook Page.** In the Instagram app go to Settings → Account type
  and tools, then Facebook Page. Personal Instagram accounts can't share
  numbers with any app.

---

## Part 1: Meta (Facebook + Instagram)

### 1. Create the app
1. Go to **developers.facebook.com** and log in with the Facebook account
   that runs Advatar's Business Manager.
2. Click **My Apps → Create App**.
3. When asked what the app is for, choose **Other**, then app type
   **Business**.
4. Name it something like **Advatar Dashboard**, enter your email, pick your
   business portfolio, and click **Create app**.

### 2. Add Facebook Login for Business
1. On the app's dashboard, find **Facebook Login for Business** and click
   **Set up**.
2. Go to **Facebook Login for Business → Settings**. Under **Valid OAuth
   Redirect URIs**, paste exactly:
   `https://app.advatar.co.uk/api/social/callback/meta`
   Then click **Save changes**.
3. Go to **Facebook Login for Business → Configurations → Create
   configuration**:
   - Name: **Content Hub**
   - Login variation: **General**
   - Access token type: **User access token**
   - Permissions: tick all six of these:
     `pages_show_list`, `pages_read_engagement`, `read_insights`,
     `instagram_basic`, `instagram_manage_insights`, `business_management`
   - Click **Create** and copy the **Configuration ID** it shows you.

### 3. Fill in the basics
Go to **App settings → Basic**:
- **App domains**: `app.advatar.co.uk`
- **Privacy Policy URL** and **Terms of Service URL**: your two pages.
- **App icon**: your logo.
- **Category**: Business and pages.
- Click **Add platform → Website**, Site URL `https://app.advatar.co.uk`.
- Click **Save changes**.
- Copy the **App ID** and the **App Secret** (click **Show**).

### 4. Verify the business
Go to **App settings → Basic → Verification**, or in Business Manager go to
**Security Centre → Start verification**. Upload your documents. This usually
takes 1–5 working days. App Review won't start until it's done.

### 5. App Review (so clients can connect)
Until the app is approved, only people you've added under **App roles →
Roles** (you and your team) can connect accounts. That's fine for testing
with your own pages.

To let clients connect:
1. Go to **App Review → Permissions and Features**.
2. For each of the six permissions, click **Request advanced access**.
3. For each one, Meta asks:
   - **How you'll use it.** Something like: *"Advatar is a social media
     agency. Our clients log in to our dashboard and connect their own
     Facebook Page and Instagram business account so they can see their own
     followers, post likes, comments and video views. We only read data; we
     never post."*
   - **A short screen recording** (1–2 minutes). Show:
     1. Logging in to app.advatar.co.uk as a client.
     2. Opening Content Hub and pressing **Connect Instagram**.
     3. Approving on Facebook.
     4. The numbers appearing on the dashboard.

     A free screen recorder is fine.
4. Submit. Approval usually takes from a few days to two weeks. If Meta
   rejects it, they say why. It's usually that the recording didn't show
   clearly where the data appears. Re-record and resubmit.

### 6. Go live
At the top of the app dashboard, switch the app from **Development** to
**Live**.

---

## Part 2: TikTok

### 1. Create the app
1. Go to **developers.tiktok.com** and log in, ideally with Advatar's own
   TikTok account.
2. Click **Manage apps → Connect an app** (or **Create app**). Choose
   **Organisation** and create one for Advatar if asked.
3. Fill in:
   - **App icon**: your logo.
   - **App name**: Advatar Dashboard
   - **Category**: Business.
   - **Description**: *"Clients of our marketing agency connect their own
     TikTok account so they can see their followers, likes, comments and
     video views on our dashboard. We only read data."*
   - **Terms of Service URL** and **Privacy Policy URL**: your two pages.
   - **Platforms**: tick **Web**, and enter `https://app.advatar.co.uk`.
4. TikTok may ask you to **verify** the web address. It gives you a small
   file to put on the site, or a DNS record. If that's not something you
   do, send that step to whoever manages the domain.

### 2. Add Login Kit and the permissions
1. Click **Add products** and add **Login Kit**.
2. In Login Kit, under **Redirect URI** (Web), paste exactly:
   `https://app.advatar.co.uk/api/social/callback/tiktok`
3. Under **Scopes**, make sure all four are added:
   `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`
   (`video.list` may sit under **Display API**. Add that product too if
   TikTok asks.)
4. Copy the **Client key** and **Client secret** from the top of the app page.

### 3. Test, then submit for review
- While the app is waiting for approval, use **Sandbox**: add your own
  TikTok account (and any test accounts) under **Sandbox → Target users**.
  Those accounts can connect straight away.
- When ready, click **Submit for review** and attach a screen recording, the
  same idea as Meta's: log in as a client, Content Hub, **Connect TikTok**,
  approve, numbers appear. Review usually takes a few days to two weeks.

---

## Part 3: Put the codes into Vercel

In **Vercel → your project → Settings → Environment Variables**, add these
for **Production**, then **redeploy**:

| Name | What to paste |
|---|---|
| `META_APP_ID` | Meta App ID (Part 1, step 3) |
| `META_APP_SECRET` | Meta App Secret (Part 1, step 3) |
| `META_LOGIN_CONFIG_ID` | Meta Configuration ID (Part 1, step 2) |
| `TIKTOK_CLIENT_KEY` | TikTok Client key |
| `TIKTOK_CLIENT_SECRET` | TikTok Client secret |
| `CRON_SECRET` | Any long random password you make up (30+ letters and numbers). It stops strangers triggering the daily refresh. |
| `NEXT_PUBLIC_SITE_URL` | `https://app.advatar.co.uk` |

Optional: `SOCIAL_TOKEN_KEY` is another long random password used to encrypt
the saved connections. If you leave it out, the app uses your Supabase
service key instead. If you ever change it, every account has to be
connected again.

Until a platform's codes are in, its card on the Content Hub says it's not
switched on yet, instead of showing a Connect button.

---

## Part 4: Using it

1. Run database updates **0048** and **0049** in Supabase (SQL editor). Then
   run `VERIFY_0048.sql` and `VERIFY_0049.sql`; every line should say OK.
2. Open a client in the CRM, go to the **Performance** tab, and under
   **Social accounts** tick the platforms you post on for them.
3. Either you press **Connect** there (if you have the client's logins), or
   the client presses **Connect** on their own Content Hub.
4. Numbers appear straight away and refresh every morning at about 5–6am UK
   time. A snapshot of followers is saved every day, so the growth charts
   build up from the day you connect.
5. Video post numbers fill themselves in too. On a video, under **Where it's
   posted**, paste the post's link. If that platform is connected for the
   client, its views, likes, comments and shares appear on their own and
   update every morning. The row is marked **Automatic**. YouTube links do
   the same once `YOUTUBE_API_KEY` is set. **Gather all metrics** on the
   Performance tab refreshes everything for that client straight away.
   Screenshots are only needed for a platform that isn't connected.

**If an account says "Reconnect"**, the platform stopped letting us read it.
That usually happens after a password change or when someone removed the app
from the account. Press **Reconnect** and log in again. The history is kept.
