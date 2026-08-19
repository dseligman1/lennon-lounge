# Lennon Lounge v2 — Setup Guide

## What you need
- A free Google/Firebase account
- A free GitHub account
- 20 minutes

---

## Step 1 — Create Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `lennon-lounge`
3. Disable Google Analytics (not needed) → **Create project**

### Enable Realtime Database
4. In the left sidebar → **Build → Realtime Database**
5. Click **Create Database**
6. Choose **Europe West (Belgium)** as the region
7. Start in **Test mode** (you can lock it down later)

### Get your Firebase config
8. Click the gear icon → **Project Settings**
9. Scroll down to **Your apps** → click the **`</>`** (Web) button
10. Register with any nickname (e.g. "lennon-lounge-web")
11. Copy the `firebaseConfig` object — it looks like:
```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "lennon-lounge-12345.firebaseapp.com",
  databaseURL: "https://lennon-lounge-12345-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "lennon-lounge-12345",
  storageBucket: "lennon-lounge-12345.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## Step 2 — Edit the HTML file

Open `lennon-lounge-v2.html` and find this block near the top of the `<script>` section:

```js
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  ...
```

Replace the placeholder values with your actual Firebase config from Step 1.

---

## Step 3 — Deploy to GitHub Pages

1. Create a new **private** GitHub repository (e.g. `lennon-lounge`)
2. Upload `lennon-lounge-v2.html` and rename it to `index.html`  
   (or keep the name and set it as the Pages root)
3. Go to **Settings → Pages** in your repo
4. Under **Source**: select `main` branch, `/ (root)` folder → **Save**
5. Your URL will be: `https://yourusername.github.io/lennon-lounge/`

> Share this URL with all 12 players. It works on any phone or browser.

---

## Step 4 — First login

1. Open the URL and wait for "Connecting to Lennon Lounge..."
2. On first load, 6-digit PINs are **auto-generated** for all 12 teams and saved to Firebase
3. Log in as **Daniel (Selig's Shakers)** or **Jack (Inter Rowe-Z)** — you're admins
4. Go to **Back Office → All PINs** to see everyone's PIN
5. Share each player's PIN with them privately (e.g. WhatsApp)

> Players can change their own PIN in **Settings → Change PIN**.

---

## Team & player names — how matching works

Each of the 12 teams in `index.html` (search `const TEAMS`) has:

- `name` — the fun display name (e.g. "DUNNEY MONSTERS") — shown everywhere in the app
- `owner` — a short first name used for casual display (e.g. "James")
- `fplName` — the manager's **exact full name as registered on the FPL Draft site**
  (e.g. "James Hodari")

FPL sync (both the automated GitHub Action and the in-app button) matches each FPL entry to
one of these 12 teams to know who's who. It checks `fplName` first, then `owner`, then the
FPL team name — in that order — because a player can rename their team on the FPL site
mid-season, but their registered name doesn't change. Anchoring on the name first means a
mid-season rename can't break the mapping.

**If you ever swap in a new player or someone's FPL-registered name doesn't match**: edit
their row in the `TEAMS` array in `index.html`, **and** the matching mirrored copy of `TEAMS`
inside `.github/workflows/fpl-sync.yml` (the GitHub Action runs server-side and can't read
`index.html`, so it keeps its own copy — the two must be kept in sync by hand).

---

## Step 5 — Find your FPL Draft League ID

You need one number: your league's **numeric ID**. You only ever need to find this once.

1. On a **laptop/desktop browser** (much easier than mobile for this one step — mobile
   browsers often hide the full address bar until you tap it), go to
   [draft.premierleague.com](https://draft.premierleague.com) and log in
2. Click into your league, then click its **Standings** tab specifically (not just the
   league home/overview page)
3. Look at the address bar — the URL is now `draft.premierleague.com/league/12345/standings`.
   **`12345` is your numeric league ID.**
   - If the address bar still looks short (e.g. just `draft.premierleague.com/league`),
     click into it once — browsers often collapse long URLs visually until you click/tap
     them. The full path is always there even if it's not shown by default.
   - This is **not** the invite code (the short code like `vou37u` you'd share to invite
     people) — it's a plain number, usually 5-7 digits.
4. If you're stuck on mobile: tap **Share → Copy Link** on the Standings page instead of
   reading the address bar — the copied link will contain the full URL with the number in it.

That's the only manual step. Once you have the number, you plug it in once (Step 6) and the
rest — fixtures, results, standings, live in-play scores — pulls in automatically from then on.

---

## Step 6 — Load a gameweek: the one button you actually use week to week

Everything lives in **Back Office → 🔗 FPL Sync**. There is one button:
**"⟳ Sync & stage next gameweek."** Click it and it:

1. Pulls fixtures, results and standings from the FPL Draft API
2. Works out which gameweek is next (the earliest one that has fixtures but no board yet)
3. Builds that gameweek's board with recommended odds and drops you straight into **Odds
   Setter** to review, tweak, and publish

Nothing runs on a schedule — it only does anything when you click it. Repeat once a week,
whenever you're ready to open the next gameweek for betting (see "Your weekly routine" below).

**Before your first real sync**, set your league ID (Step 5) into the **Draft league ID**
field in that same card, and check **"Hold back last N GWs" is 0** — it defaults to a
testing value of 5, which deliberately hides recent real results so you can rehearse the
betting flow; leave it above 0 for a live season and recent gameweeks will look like they
haven't happened yet.

### The CORS catch, and your two options

Browsers block a page from calling `draft.premierleague.com` directly (CORS) — this affects
every browser, not a bug in this app. That means "Sync & stage" needs one of the two setups
below to actually reach FPL. Pick one:

**Option A — GitHub Action (works today, needs an extra tab each time you sync)**

The Action already in this repo (`.github/workflows/fpl-sync.yml`) fetches server-side, where
CORS doesn't apply, and writes straight to Firebase. Set it up once:

1. Firebase Console → **Project Settings → Service Accounts → Generate new private key**
   → downloads a JSON file
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**,
   add all three:

   | Secret name | Value |
   |---|---|
   | `FIREBASE_DB_URL` | Your database URL, e.g. `https://lennon-lounge-12345-default-rtdb.europe-west1.firebasedatabase.app` |
   | `FIREBASE_SERVICE_KEY` | Entire contents of the JSON file from step 1 |
   | `FPL_LEAGUE_ID` | The numeric league ID from Step 5 |

Then each week: GitHub repo → **Actions → FPL Data Sync → Run workflow** → confirm → wait
~15 seconds → back in the app, click **Sync & stage next gameweek** (it'll now find the fresh
data already sitting in Firebase and stage from it, CORS or not). Back Office → FPL Sync also
has a direct link to the Actions page so you don't have to go hunting for it.

**Option B — Cloudflare Worker proxy (one-time ~3 min setup, then truly one click forever)**

A tiny free proxy that adds the CORS header the browser needs, so "Sync & stage" fetches live
data itself with no GitHub tab, ever. No local tools needed — everything happens in a browser.

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) → create a free
   account (no credit card needed for the free tier)
2. In the dashboard: **Workers & Pages → Create → Create Worker** → give it any name (e.g.
   `lennon-lounge-fpl-proxy`) → **Deploy** (deploys a placeholder first, that's fine)
3. Click **Edit code** (or "Quick edit") to open the built-in code editor
4. Delete everything in the editor and paste this in its place:

   ```js
   export default {
     async fetch(request) {
       const url = new URL(request.url);
       const upstreamPath = url.pathname.replace(/^\/api\//, '');
       if (!upstreamPath) return new Response('Missing path', { status: 400 });
       const resp = await fetch('https://draft.premierleague.com/api/' + upstreamPath + url.search, {
         headers: { 'User-Agent': 'Mozilla/5.0' }
       });
       const body = await resp.text();
       return new Response(body, {
         status: resp.status,
         headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
       });
     }
   };
   ```

5. Click **Save and deploy**
6. Copy the Worker's URL from the top of the page (looks like
   `https://lennon-lounge-fpl-proxy.YOUR-SUBDOMAIN.workers.dev`) and add `/api` to the end
7. In the app: **Back Office → FPL Sync → ⚙️ Advanced → Proxy URL** → paste that URL (with
   `/api` on the end) → **Save**

From then on, **Sync & stage next gameweek** fetches live data directly — no GitHub tab
needed. This proxy only ever reads public FPL data; it doesn't touch your Firebase database
or hold any of your secrets.

Either option (or both — the app tries direct, then the proxy if set, then falls back to
whatever's already synced) works fine. Option A needs zero new accounts but an extra tab each
week; Option B is a one-time setup for a genuinely single in-app click from then on.

**If a sync ever shows unmatched entries**: an FPL manager's registered name (or team name)
doesn't match anyone in the app's team list — see "Team & player names" above, check spelling
against what FPL has on file for them.

### Your weekly routine

1. Wait until a gameweek's results are official/final on FPL's own standings page
2. Back Office → FPL Sync → **Sync & stage next gameweek**
3. You land in Odds Setter with the new gameweek as a draft — tweak odds/cutoff/special
   markets if you want, then **Publish** to open it for betting
4. Settler → settle the *previous* gameweek's bets once you're confident its results are final

There's no auto-refresh in between — nothing changes underneath you until you next click sync.

---

## Step 7 — Lock down Firebase (when ready)

Once everything is working, go to Firebase Console → Realtime Database → **Rules** and replace with:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

This is sufficient for a private league where all 12 members share the same portal. For tighter security, consult the Firebase docs on auth rules.

---

## Usage summary

| Action | Who |
|---|---|
| Place a bet | Any player |
| Review & accept/reject bets | Admins (Jack, Daniel) |
| Load gameweek fixtures | Admins |
| Set odds | Admins |
| Settle bets after GW | Admins |
| View all PINs | Admins only (Back Office) |
| Change own PIN | Any player (Settings) |
| Reset another player's PIN | Admins (Back Office) |

---

## Troubleshooting

**"Connecting to Lennon Lounge..." never goes away**  
→ Check your `FIREBASE_CONFIG` values in the HTML. The `databaseURL` is the most commonly wrong field.

**"Sync & stage next gameweek" shows a CORS message**  
→ Expected unless you've set up Option A or B in Step 6 — the FPL API blocks direct browser
requests for everyone, not just this app. It still stages from whatever's already synced
(e.g. from a previous GitHub Action run), so it's not a dead end — but for fresh data, run
the GitHub Action first (a link is right there in the fallback message) or set up the
Cloudflare proxy so this stops happening entirely.

**A sync (either option) shows unmatched entries in its log/toast**  
→ An FPL manager's registered name (or FPL team name) doesn't match anyone in `TEAMS`. See
"Team & player names" above — check spelling/edit the `fplName` field for that team (in both
`index.html` and `.github/workflows/fpl-sync.yml` if you're using the GitHub Action).

**Fixtures/results loaded but a gameweek looks like it "hasn't happened" when it clearly has**  
→ Check **Back Office → FPL Sync → "Hold back last N GWs"**. It should be `0` for a live
season — anything above 0 deliberately hides the most recent real gameweeks (a testing
feature, see Step 6).

**Gameweeks/bets look wrong, made up, or like a fake "week 2" out of nowhere**  
→ Someone (probably you, while testing) clicked **Back Office → 🧪 Test tools → "Load test
gameweeks & odds"**. It seeds fake settled/open/in-play gameweeks with fake bets for trying
the app out — harmless, but easy to mistake for real synced data. Fix: **Back Office → 🧪
Test tools → "🧹 Clear test data"** — wipes gameweeks/bets/promos/rewards only, leaves your
FPL sync setup, settings and teams untouched. Do this once before a real season starts.

**I can't find the "Gameweek Loader" tab any more**  
→ Removed from the main nav — the FPL sync now stages gameweeks automatically (Step 6), so
manually picking fixtures from dropdowns isn't needed for the normal weekly flow any more.
It's still there as an emergency fallback (if FPL data ever won't sync) via **Back Office →
FPL Sync → ⚙️ Advanced → "Manual fixture entry."**

**Someone forgot their PIN**  
→ Admin goes to Back Office → All PINs, reads it out to them. Or click Reset to generate a new one.

**Page looks wrong on phone**  
→ Make sure you haven't zoomed the browser. The app is designed for mobile — add it to your home screen for the best experience (Safari: Share → Add to Home Screen; Chrome: menu → Install app).
