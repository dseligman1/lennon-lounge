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

## Step 6 — Set up automatic FPL sync (does everything — do this instead of manual sync)

A GitHub Action fetches your league from FPL's servers directly (server-side, so it isn't
blocked by the browser CORS restriction the in-app "Sync FPL" button hits) and writes
fixtures, results, standings and live in-play scores straight to Firebase. Once it's set up
you never need to touch FPL sync again — no JSON, no copy-pasting.

It runs automatically:
- Every 30 minutes on Saturdays & Sundays, 12:00–23:00 UK time (matchday live scores)
- Once daily at 6am UTC (catch-all refresh)
- **Or on demand**, any time, via a button — see "Run it right now" below

### 1. Create a Firebase Service Account
1. Firebase Console → **Project Settings → Service Accounts**
2. Click **Generate new private key** → downloads a JSON file to your computer

### 2. Add 3 GitHub Secrets (one-time)
In your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**,
add each of these:

| Secret name | Value |
|---|---|
| `FIREBASE_DB_URL` | Your database URL (e.g. `https://lennon-lounge-12345-default-rtdb.europe-west1.firebasedatabase.app`) — find it in Firebase Console → Realtime Database |
| `FIREBASE_SERVICE_KEY` | Open the JSON file from step 1 in a text editor, select all, copy the **entire contents**, paste as the secret value |
| `FPL_LEAGUE_ID` | The numeric league ID from Step 5 above (e.g. `12345`) |

The workflow file (`.github/workflows/fpl-sync.yml`) is already in this repo — GitHub picks
it up automatically once the secrets exist. Nothing else to configure.

### 3. Run it right now ("push of a button")
1. In your GitHub repo, click the **Actions** tab
2. Click **FPL Data Sync** in the left sidebar
3. Click **Run workflow** (top right) → **Run workflow** again to confirm
4. Wait ~15 seconds, refresh — a green ✅ means it worked. Click into the run and expand
   the step to see a log line like `Full sync: 6 history result(s), 1 gameweek(s) with
   fixtures, 0 unmatched entr(y/ies)`
5. Reload the app — fixtures/standings should now be populated

Re-run this manual trigger any time you want a sync immediately instead of waiting for the
schedule (e.g. right after your draft, or right after a gameweek finishes).

**One thing to check first:** in the app, go to **Back Office → FPL Settings** and make sure
**"Hold back last N GWs"** is set to **0** before your first real sync. That field is a
testing toggle (defaults to 5) that deliberately hides the most recent real gameweeks so you
can rehearse the betting flow against real historical data — leave it above 0 for a live
season and recent results will look like they haven't happened yet.

**If a run ever shows unmatched entries** in its log: that means an FPL manager's registered
name (or team name) on the draft site doesn't match anyone in the app's team list (see
"Team & player names" below) — check spelling against what FPL has on file for them.

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

**FPL sync shows "CORS error" when I click the in-app Sync FPL button**  
→ Expected — the FPL API blocks direct browser requests. Don't fight it: set up the GitHub
Actions workflow instead (Step 6) and use its "Run workflow" button — that runs server-side
and isn't affected by CORS. The in-app paste box still exists as a last-resort fallback if
GitHub Actions is ever unavailable to you.

**GitHub Action run shows unmatched entries in its log**  
→ An FPL manager's registered name (or FPL team name) doesn't match anyone in `TEAMS`. See
"Team & player names" above — check spelling/edit the `fplName` field for that team.

**Fixtures/results loaded but a gameweek looks like it "hasn't happened" when it clearly has**  
→ Check **Back Office → FPL Settings → "Hold back last N GWs"**. It should be `0` for a live
season — anything above 0 deliberately hides the most recent real gameweeks (a testing
feature, see Step 6).

**Someone forgot their PIN**  
→ Admin goes to Back Office → All PINs, reads it out to them. Or click Reset to generate a new one.

**Page looks wrong on phone**  
→ Make sure you haven't zoomed the browser. The app is designed for mobile — add it to your home screen for the best experience (Safari: Share → Add to Home Screen; Chrome: menu → Install app).
