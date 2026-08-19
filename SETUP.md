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
**"⟳ Sync & stage gameweeks."** Click it and it:

1. Pulls fixtures, results and standings from the FPL Draft API
2. Builds a board (with recommended odds) for **every gameweek that isn't loaded yet** — not
   just the next one — so players can see the whole run of upcoming fixtures under Bet
   Builder's "Coming up" section, greyed out and unbettable until you publish each one
3. Drops you into **Odds Setter**, which only shows the *nearest* unpublished gameweek for
   full review (odds for a gameweek months out would be stale by the time it matters — the
   rest sit staged, listed by name, until they become the nearest one)

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
~15 seconds → back in the app, click **Sync & stage gameweeks** (it'll now find the fresh
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

From then on, **Sync & stage gameweeks** fetches live data directly — no GitHub tab
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
2. Back Office → FPL Sync → **Sync & stage gameweeks**
3. You land in Odds Setter with the new gameweek as a draft — tweak odds/cutoff/special
   markets if you want, then **Publish** to open it for betting
4. Settler → settle the *previous* gameweek's bets once you're confident its results are final

Once per week, ideally after the waiver deadline, also run **Actions → FPL Data Sync → Run
workflow** so the squad viewer's squads, player form and fixture difficulty are current — see
Step 8. Same Action, same button, nothing extra to configure.

There's no auto-refresh in between — nothing changes underneath you until you next click sync.

**Backups (set-and-forget):** a full snapshot of the database is committed automatically every
Monday morning to this repo's `backups/` folder (`.github/workflows/backup.yml`) — no action
needed. If you ever need to roll back (e.g. after "wipe betting data" or any other mistake),
Back Office → Backups has a manual "Run backup now" link plus a "Restore from backup file"
uploader that accepts either that folder's files or an in-app Export JSON download.

---

## Betting cutoff — how it's calculated

House rule: **betting closes 80 minutes before the first Premier League kickoff of that
gameweek.** E.g. first game kicks off 12:30pm Saturday → cutoff is 11:10am Saturday.

The app doesn't get real PL kickoff times directly — it gets FPL's own `deadline_time` for the
gameweek, which (confirmed against real fixture data) is consistently **exactly 90 minutes
before that same first kickoff**. So the app computes: true kickoff = FPL's deadline + 90 min,
then house cutoff = that kickoff − 80 min, which nets out to **FPL's deadline + 10 minutes**.
You'll see the cutoff time in Odds Setter/Bet Builder land 10 minutes *after* FPL's own posted
deadline — that's this calculation working correctly, not a bug.

If you ever manually set a kickoff time yourself (Manual Fixture Entry's date/time picker),
the cutoff is calculated directly as that kickoff − 80 min, no FPL deadline involved.

---

## Step 7 — Lock down Firebase (when ready) — and a plain-language security note

Once everything is working, go to Firebase Console → Realtime Database → **Rules** and replace with:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

**Be clear-eyed about what this means.** With these rules, *anyone* who has the app's URL can
read and write the entire database directly — with or without a PIN, admin or not — by simply
opening their browser's dev tools console (F12) and either calling one of the app's own
functions (e.g. typing `resetAll()`) or sending a raw request to the database URL, which is
sitting in plain sight in the page's source. The app adds a `requireAdmin()` check in front of
its highest-risk actions (wiping data, accepting/rejecting/settling bets, publishing odds,
changing settings) so the *app's own UI* won't let a non-admin session trigger them by
accident — but that check runs in the browser, not on the server, so it stops casual/accidental
misuse, not someone who deliberately goes looking. For a private group of 12 people who all
trust each other, this is a reasonable, low-effort tradeoff (the same PIN-based trust model as
before). It is **not** equivalent to real access control. If that ever matters more than
convenience — e.g. real money at stake and you don't fully trust everyone with a PIN — the
actual fix is Firebase Authentication with server-enforced security rules keyed to specific
admin user IDs, which is a bigger change than tightening these rules alone and isn't done here.

---

## Step 8 — Squad viewer: squads, player form and fixture difficulty

**What it is:** click any team name anywhere in the app — a match row in the Bet Builder, a name
on the standings tables, the team on a bet card — and you get that manager's 15 players laid out
on a pitch (GK / DEF / MID / FWD), coloured green→red by current form, with their top scorer
crowned. From a specific gameweek fixture there's also a **⚔ Squads** button that puts both
managers' squads side by side with each one's Fixture Difficulty Rating for that week.

**What you need to do: nothing new, as long as the FPL Data Sync Action is already set up
(Step 6, Option A).** Squads and difficulty ratings come down with it automatically. If you've
never set that Action up, do Option A now — it's the only path that gets fixture difficulty.

### Why this one needs the Action rather than the in-app button

The app talks to two different FPL APIs, and they aren't equally reachable:

| Data | Which API | Reachable from your browser? |
|---|---|---|
| Squads (who owns which player) | `draft.premierleague.com` | Only via the Step 6 Option B proxy |
| Player names / positions / form / points | `draft.premierleague.com` | Only via the Step 6 Option B proxy |
| **Fixture Difficulty Rating (1-5)** | `fantasy.premierleague.com` | **No — and the Option B proxy doesn't cover it either** |

Fixture difficulty is a *classic* Fantasy Premier League concept. The Draft API doesn't expose it
in any form, and the Cloudflare Worker from Step 6 Option B is written to only forward requests
to `draft.premierleague.com` — so even with the proxy set up, the app can't get difficulty
ratings on its own. Running the fetch inside the GitHub Action sidesteps all of this: it runs on
a server, where none of these browser restrictions apply, and writes everything straight to
Firebase. That's why it's the recommended route, and why it needs no extra setup from you.

### Refreshing it

Squads change when someone makes a waiver claim or a trade, and difficulty ratings shift as
fixtures get rescheduled. Both refresh whenever you run the Action:

> GitHub repo → **Actions → FPL Data Sync → Run workflow** → confirm → wait ~20 seconds

That's the same Action and the same button you already use for fixtures and results — it now
pulls squads and difficulty ratings in the same run, so there's no second thing to remember.
It stays **manual only** (nothing runs on a schedule) exactly as before. Good habit: run it once
after the waiver deadline each week, before you publish the gameweek's odds.

Back Office → FPL Sync shows what's currently loaded ("Last squad pull… N squad(s)… FDR for N
gameweek(s)"). Until you've run it at least once, clicking a team name shows a short "no squad
data pulled yet" message rather than a pitch — nothing is broken, there's just nothing to draw.

### Optional: the in-app button, and extending the proxy to cover difficulty

Back Office → FPL Sync also has a **👥 Pull squads in-app (no FDR)** button. With the Step 6
Option B proxy configured it'll fetch squads and player form directly, no GitHub tab — but it
will skip fixture difficulty, for the reason in the table above.

If you want that button to fetch difficulty too, you have to widen your Worker to forward a
second host. Edit your Worker (Cloudflare dashboard → Workers & Pages → your worker → **Edit
code**) and replace its code with this two-route version, then **Save and deploy**:

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    // /api/...  -> draft.premierleague.com   (unchanged, existing behaviour)
    // /fpl/...  -> fantasy.premierleague.com (new: fixture difficulty)
    let upstream = null;
    if (url.pathname.startsWith('/api/')) {
      upstream = 'https://draft.premierleague.com/api/' + url.pathname.slice(5);
    } else if (url.pathname.startsWith('/fpl/')) {
      upstream = 'https://fantasy.premierleague.com/api/' + url.pathname.slice(5);
    } else {
      return new Response('Missing path', { status: 400 });
    }
    const resp = await fetch(upstream + url.search, {
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

Your **Proxy URL** setting doesn't change — keep it exactly as it is, still ending in `/api`.
The app derives the `/fpl/` route from it automatically. Everything that worked before keeps
working; you've only added a second route.

This is genuinely optional. The Action already covers all of it with no Cloudflare editing, and
that's the supported path — this is only worth doing if you dislike the extra GitHub tab.

### Reading the pitch

- **Chip colour / the number in the pill** — that player's FPL *form* (average points per game
  over the last 30 days). Green is hot, gold and orange are cooling, pink is cold. Same
  green-good / pink-bad language the form dots on the gameweek board already use.
- **👑 gold chip** — that squad's top points scorer this season (occasionally two, if it's close).
- **⚠** — flagged by FPL as doubtful or unavailable.
- **The small line under each name** — the player's real-life club fixture that gameweek and its
  difficulty, e.g. `@ LIV · 5` means away at Liverpool, difficulty 5 out of 5.
- **FDR chips** — green for difficulty 1-2 (kind), amber for 3, red for 4-5 (tough). The colour
  is purely a function of the number FPL publishes for that fixture.
- **Bench** — only appears once a gameweek's line-ups are published; before that all 15 players
  are shown on the pitch together, which is the normal pre-deadline view.

---

## Usage summary

| Action | Who |
|---|---|
| Place a bet | Any player |
| View any squad on the pitch / compare two squads | Any player (click a team name) |
| Pull squads & fixture difficulty | Admins (FPL Data Sync Action — see Step 8) |
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

**"Sync & stage gameweeks" shows a CORS message**  
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

**Gameweeks/bets look wrong or made up**  
→ The old "Load test gameweeks & odds" button has been removed entirely — there's no way to
generate fake data through the app any more, so this shouldn't happen going forward. If you
still have leftover fake data from before it was removed: **Back Office → 🧹 Wipe betting
data → "Clear all gameweeks, bets & promos"** — wipes gameweeks/bets/promos/rewards only,
leaves your FPL sync setup, settings and teams untouched.

**After clicking "Clear all gameweeks, bets & promos" or any Back Office action, FPL sync
data (league ID, standings, holdback) reverts to old/empty values**  
→ This was a real bug (fixed): if the browser tab had an old copy of the app's state in
memory (e.g. left open across a GitHub Action sync), some actions used to save that whole
stale copy back to the database, silently overwriting fresher data with old data. The
highest-risk actions (clearing data, FPL sync, staging gameweeks) now write only the specific
fields they change, so this can't happen from those any more. If you still see it happen
elsewhere: refresh the page fully (not just reload the tab from cache) before clicking
anything, so you're working from current data.

**I can't find the "Gameweek Loader" tab any more**  
→ Removed from the main nav — the FPL sync now stages gameweeks automatically (Step 6), so
manually picking fixtures from dropdowns isn't needed for the normal weekly flow any more.
It's still there as an emergency fallback (if FPL data ever won't sync) via **Back Office →
FPL Sync → ⚙️ Advanced → "Manual fixture entry."**

**Someone forgot their PIN**  
→ Admin goes to Back Office → All PINs, reads it out to them. Or click Reset to generate a new one.

**Page looks wrong on phone**  
→ Make sure you haven't zoomed the browser. The app is designed for mobile — add it to your home screen for the best experience (Safari: Share → Add to Home Screen; Chrome: menu → Install app).
