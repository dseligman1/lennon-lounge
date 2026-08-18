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

## Step 5 — Set your FPL League ID

1. Go to [draft.premierleague.com](https://draft.premierleague.com)
2. Navigate to your league's Standings page
3. The URL will be: `draft.premierleague.com/league/**12345**/standings`
4. That number is your **numeric league ID** (NOT the invite code "vou37u")
5. In the app: go to **Back Office → FPL Settings** and enter the ID
6. Click **Sync FPL** to test the connection

> ⚠️ The FPL API blocks browser requests (CORS). The in-app sync button uses a workaround (paste JSON). For automated daily sync, see Step 6.

---

## Step 6 — Set up automatic FPL sync (optional but recommended)

This runs a GitHub Action every 30 minutes on matchdays to fetch live scores.

### Create a Firebase Service Account
1. Firebase Console → **Project Settings → Service Accounts**
2. Click **Generate new private key** → download the JSON file

### Add GitHub Secrets
In your GitHub repo → **Settings → Secrets and variables → Actions**:

| Secret name | Value |
|---|---|
| `FIREBASE_DB_URL` | Your database URL (e.g. `https://lennon-lounge-12345-default-rtdb.europe-west1.firebasedatabase.app`) |
| `FIREBASE_SERVICE_KEY` | The entire contents of the service account JSON file |
| `FPL_LEAGUE_ID` | Your numeric FPL league ID (e.g. `12345`) |

### Add the workflow
The file `.github/workflows/fpl-sync.yml` is already in this repo. GitHub Actions will pick it up automatically.

Test it: go to **Actions → FPL Data Sync → Run workflow**.

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

**FPL sync shows "CORS error"**  
→ This is expected for the in-app sync button. Use the manual paste option, or set up the GitHub Actions workflow (Step 6).

**Someone forgot their PIN**  
→ Admin goes to Back Office → All PINs, reads it out to them. Or click Reset to generate a new one.

**Page looks wrong on phone**  
→ Make sure you haven't zoomed the browser. The app is designed for mobile — add it to your home screen for the best experience (Safari: Share → Add to Home Screen; Chrome: menu → Install app).
