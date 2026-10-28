const https = require("https");

const LEAGUE_ID = process.env.FPL_LEAGUE_ID;
const DB_URL = process.env.FIREBASE_DB_URL;
const SERVICE_KEY = JSON.parse(process.env.FIREBASE_SERVICE_KEY || "null");

// Mirrors the TEAMS array in index.html (id/name/owner/fplName only — that's all
// matching needs). If you rename a team, an owner, or add/replace a manager there,
// copy the same change here so server-side matching stays in sync with the app.
const TEAMS = [
  {
    id: "selig",
    name: "Selig's Shakers",
    owner: "Daniel",
    fplName: "Daniel Seligman",
  },
  { id: "rowez", name: "Inter Rowe-Z", owner: "Jack", fplName: "Jack Rowe" },
  { id: "murov", name: "The Murovers", owner: "Alex", fplName: "Alex Murawa" },
  {
    id: "fride",
    name: "Fride FC",
    owner: "Benjamin",
    fplName: "Benjamin Finestein",
  },
  {
    id: "round",
    name: "Roundabout Rangers",
    owner: "Adam",
    fplName: "Adam Bowers",
  },
  {
    id: "dunny",
    name: "DUNNEY MONSTERS",
    owner: "James",
    fplName: "James Hodari",
  },
  {
    id: "adder",
    name: "The Adders FC",
    owner: "Jacob",
    fplName: "Jacob Adshead",
  },
  {
    id: "kapil",
    name: "KapilaMockingbirds",
    owner: "Sam",
    fplName: "Sam Kapila",
  },
  {
    id: "blank",
    name: "Blanks Bruisers",
    owner: "Simon",
    fplName: "Simon Blank",
  },
  { id: "henry", name: "Henry's Heroes", owner: "Ben", fplName: "Ben Annis" },
  {
    id: "disco",
    name: "Disco Dave's Dodgers",
    owner: "Jason",
    fplName: "Jason Stein",
  },
  { id: "huxle", name: "HUXLEY", owner: "Ryan", fplName: "Ryan Silvester" },
];

// Same precedence as matchTeamName() in index.html: the manager's real name first
// (fixed — protects against an in-season FPL team rename breaking the mapping),
// then the FPL team name as a fallback.
function matchTeamName(str) {
  const s = (str || "").toLowerCase().trim();
  if (!s) return null;
  let t = TEAMS.find((t) => t.fplName.toLowerCase() === s);
  if (t) return t.id;
  t = TEAMS.find((t) => t.owner.toLowerCase() === s);
  if (t) return t.id;
  t = TEAMS.find((t) => t.name.toLowerCase() === s);
  if (t) return t.id;
  t = TEAMS.find(
    (t) => t.name.toLowerCase().includes(s) || s.includes(t.name.toLowerCase()),
  );
  if (t) return t.id;
  const words = s.split(/\s+/).filter((w) => w.length > 3);
  t = TEAMS.find((t) => words.some((w) => t.fplName.toLowerCase().includes(w)));
  if (t) return t.id;
  t = TEAMS.find((t) => words.some((w) => t.name.toLowerCase().includes(w)));
  return t ? t.id : null;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    };
    https
      .get(url, opts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error("FPL HTTP " + res.statusCode));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Parse error: " + data.slice(0, 200)));
          }
        });
      })
      .on("error", reject)
      .setTimeout(20000, function () {
        this.destroy(new Error("HTTP timeout"));
      });
  });
}

async function getAccessToken(serviceKey) {
  // Generate a JWT for Firebase service account. The downloaded JSON uses snake_case
  // field names (private_key, client_email) — mapped to camelCase locals here.
  const { private_key: privateKey, client_email: clientEmail } = serviceKey;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope:
      "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
  };
  const { createSign } = require("crypto");
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${body}`);
  const sig = sign.sign(privateKey, "base64url");
  const jwt = `${header}.${body}.${sig}`;

  return new Promise((resolve, reject) => {
    const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const req = https.request(
      {
        hostname: "oauth2.googleapis.com",
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": postData.length,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d).access_token);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function readFirebase(path, token) {
  const dbHost = DB_URL.replace("https://", "").replace(/\/$/, "");
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          hostname: dbHost,
          path: `/${path}.json`,
          headers: { Authorization: `Bearer ${token}` },
        },
        (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(d));
            } catch (e) {
              resolve(null);
            }
          });
        },
      )
      .on("error", () => resolve(null));
  });
}

function writeToFirebase(path, data, token) {
  const dbHost = DB_URL.replace("https://", "").replace(/\/$/, "");
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request(
      {
        hostname: dbHost,
        path: `/${path}.json`,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          console.log(`PATCH ${path}: ${res.statusCode}`);
          if (res.statusCode >= 400)
            reject(new Error("Firebase write failed: " + res.statusCode));
          else resolve(d);
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// POST = Firebase's "push" semantics (server generates a unique child key). Used only for
// the admin notification below — everything else in this file is a targeted PATCH merge.
function pushToFirebase(path, data, token) {
  const dbHost = DB_URL.replace("https://", "").replace(/\/$/, "");
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request(
      {
        hostname: dbHost,
        path: `/${path}.json`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          console.log(`POST ${path}: ${res.statusCode}`);
          resolve(d);
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
async function pushNotif(teamId, type, msg, token) {
  // Mirrors pushNotif() in index.html field-for-field: {id, type, msg, ts, read}, pushed
  // to lennon-lounge-notifs/{teamId}. Written directly via the REST POST above since this
  // Action has no Firebase SDK, only the same service-account REST calls used everywhere
  // else in this file.
  const notif = {
    id: Date.now() + "_" + Math.random().toString(36).slice(2),
    type,
    msg,
    ts: Date.now(),
    read: false,
  };
  return pushToFirebase(`lennon-lounge-notifs/${teamId}`, notif, token);
}
function asArr(x) {
  return Array.isArray(x) ? x : x ? Object.values(x) : [];
}

const LennonModel = require("../odds-model.js");
const { enrich } = require("./fpl-data.cjs");
const SD = 15,
  SD_DIFF = SD * Math.SQRT2,
  phi = (x) => 1 / (1 + Math.exp(-1.702 * x));
const pOver = (line, avg) => 1 - phi((line - avg) / SD);
const { houseEdgePct, edgedOdds } = LennonModel;
const forecastCache = new WeakMap();
function modelForecast(state, ev) {
  const f = state.fpl || {};
  const key = [
    ev,
    f.squadSync,
    f.lastSync,
    f.modelData && f.modelData.fetchedAt,
    JSON.stringify(f.lineups),
    JSON.stringify(state.stats),
  ].join("|");
  let c = forecastCache.get(state);
  if (!c || c.key !== key || c.fpl !== f) {
    c = {
      key,
      fpl: f,
      pred: LennonModel.forecast(state, ev || Number(f.squadEvent) || 1),
    };
    forecastCache.set(state, c);
  }
  return c.pred;
}
function projectTeams(state, ev) {
  return modelForecast(state, ev).teams;
}
function teamProj(state, tid, ev) {
  return (projectTeams(state, ev)[tid] || { proj: 50 }).proj;
}
function fairMatchProbs(state, h, a, ev) {
  const pred = modelForecast(state, ev),
    rec = LennonModel.recommendation(state, h, a, ev, pred);
  return {
    ...rec.pricedProbabilities,
    projHome: pred.teams[h].proj,
    projAway: pred.teams[a].proj,
    rawDiff: pred.teams[h].proj - pred.teams[a].proj,
  };
}
function recOdds(state, h, a, ev) {
  return LennonModel.recommendation(state, h, a, ev, modelForecast(state, ev))
    .odds;
}
function extremeScoreProbs(projs, sign) {
  const mus = projs.map((m) => sign * m);
  if (!mus.length) return [];
  const lo = Math.min.apply(null, mus) - 4 * SD,
    hi = Math.max.apply(null, mus) + 4 * SD,
    steps = 160,
    h = (hi - lo) / steps;
  const out = mus.map(() => 0);
  const dens = (x, mu) =>
    Math.exp(-Math.pow((x - mu) / SD, 2) / 2) / (SD * Math.sqrt(2 * Math.PI));
  for (let k = 0; k <= steps; k++) {
    const x = lo + k * h,
      wt = k === 0 || k === steps ? 0.5 : 1;
    const cdf = mus.map((mu) =>
      Math.min(1 - 1e-9, Math.max(1e-9, phi((x - mu) / SD))),
    );
    let prod = 1;
    for (let i = 0; i < cdf.length; i++) prod *= cdf[i];
    for (let i = 0; i < mus.length; i++)
      out[i] += wt * h * dens(x, mus[i]) * (prod / cdf[i]);
  }
  const tot = out.reduce((a, b) => a + b, 0);
  return tot > 0 ? out.map((v) => v / tot) : out.map(() => 1 / out.length);
}
// Minimal template lookup: only the pricing inputs suggestSpecialOdds() actually reads
// (tpl.kind, tpl.dir) — it never reads tpl.line/tpl.lineOffset (those only feed
// specialMarketDefaultLine(), the admin's market-CREATION helper, deliberately not
// ported — see the block comment above). Mirrors index.html's SPECIAL_MARKET_TEMPLATES
// ids/kinds/dirs; add an entry here if a future batch adds a template there.
const SPECIAL_MARKET_KIND = {
  top_scorer: { kind: "top_score" },
  bottom_scorer: { kind: "bottom_score" },
  haul_35: { kind: "haul" },
  haul_45: { kind: "haul" },
  haul_55: { kind: "haul" },
  haul_65: { kind: "haul" },
  pts_over: { kind: "team_pts", dir: "over" },
  pts_under: { kind: "team_pts", dir: "under" },
  form_spike: { kind: "team_pts", dir: "over" },
  off_day: { kind: "team_pts", dir: "under" },
  shootout: { kind: "match_total", dir: "over" },
  stalemate: { kind: "match_total", dir: "under" },
  banker: { kind: "haul" },
  beat_par: { kind: "team_pts", dir: "over" },
  disaster: { kind: "team_pts", dir: "under" },
  blowout: { kind: "match_total", dir: "over" },
};
function suggestSpecialOdds(state, gwObj, tpl, params) {
  const ev = gwObj ? gwObj.event : null;
  const edge = houseEdgePct(state.settings);
  const fixtures = gwObj
    ? asArr(gwObj.matches).filter((m) => m.home && m.away)
    : [];
  const P = projectTeams(state, ev);
  const pr = (tid) => (P[tid] && P[tid].proj) || 50;
  if (tpl.kind === "top_score" || tpl.kind === "bottom_score") {
    const tids = [...new Set(fixtures.flatMap((m) => [m.home, m.away]))];
    if (!tids.length || !params.teamId) return null;
    const idx = tids.indexOf(params.teamId);
    if (idx < 0) return null;
    const ps = extremeScoreProbs(
      tids.map(pr),
      tpl.kind === "top_score" ? 1 : -1,
    );
    return edgedOdds(ps[idx], edge);
  }
  if (tpl.kind === "haul") {
    if (!params.teamId || params.line == null) return null;
    return edgedOdds(pOver(params.line - 0.5, pr(params.teamId)), edge);
  }
  if (tpl.kind === "team_pts") {
    if (!params.teamId || params.line == null) return null;
    const proj = pr(params.teamId);
    const p =
      tpl.dir === "under"
        ? 1 - pOver(params.line, proj)
        : pOver(params.line, proj);
    return edgedOdds(p, edge);
  }
  if (tpl.kind === "match_total") {
    if (params.line == null) return null;
    const m = fixtures.find((x) => x.id === params.matchId);
    if (!m) return null;
    const tot = pr(m.home) + pr(m.away);
    const p =
      tpl.dir === "under"
        ? phi((params.line - tot) / SD_DIFF)
        : 1 - phi((params.line - tot) / SD_DIFF);
    return edgedOdds(p, edge);
  }
  return null;
}
// Resets one draft gameweek's match + special-market odds to the model's current output —
// the Node equivalent of clicking "↺ Reset all to recommended" (rerecommend() in
// index.html). Only ever touches .odds fields; ids/results/lines/labels/status untouched.
function recomputeGwOdds(state, g) {
  const PJ = projectTeams(state, g.event);
  const matches = asArr(g.matches).map((m) => ({
    ...m,
    odds: recOdds(state, m.home, m.away, g.event, PJ),
  }));
  const specialMarkets = asArr(g.specialMarkets).map((m) => {
    const tpl = SPECIAL_MARKET_KIND[m.templateId];
    if (!tpl) return m;
    const sug = suggestSpecialOdds(state, g, tpl, {
      teamId: m.teamId,
      matchId: m.matchId,
      line: m.line,
    });
    return { ...m, odds: Math.max(1.05, Number(sug) || 1.05) };
  });
  return {
    matches,
    specialMarkets,
    forecast: LennonModel.snapshot(modelForecast(state, g.event)),
  };
}

/* ================================================================
   BATCH 50 — 21h-before-cutoff odds auto-suggest window
   ================================================================
   "21 hours before cutoff" at hourly-cron granularity (±30min per the spec) is widened to
   a 2h band (20-22h out) rather than a single instant, so the existing hourly schedule (see
   the self-throttle note at the top of this file) reliably lands inside it at least once —
   typically twice — even if one tick is late or skipped. oddsAutoSuggestedAt makes a second
   hit in the same window a no-op, so the wider band costs nothing but a couple of extra
   hourly full-sync runs per gameweek that would previously have been skipped outright (this
   window sits well outside the existing 2h-before/1h-after deadline throttle) — see the
   schedule block below and PROGRESS.md for the added GitHub Actions cost this implies. */
const ODDS_AUTOSUGGEST_WINDOW_START_H = 22; // window opens this many hours before cutoff
const ODDS_AUTOSUGGEST_WINDOW_END_H = 20; // window closes this many hours before cutoff
function nearestDraftGw(gws) {
  return (
    asArr(gws)
      .filter((g) => g && g.status === "draft" && g.deadline)
      .sort((a, b) => (a.event || 0) - (b.event || 0))[0] || null
  );
}
function oddsWindowDue(g, now) {
  if (!g || g.oddsAutoSuggestedAt) return false;
  const hoursOut = (g.deadline - now) / 3600000;
  return (
    hoursOut <= ODDS_AUTOSUGGEST_WINDOW_START_H &&
    hoursOut >= ODDS_AUTOSUGGEST_WINDOW_END_H
  );
}

/* ================================================================
   Stranded-gameweek catch-up (fixed 2026-09-22)
   ================================================================
   isMatchday/nearDeadline above are both keyed off real-world kickoff time, but what
   the Settler tab actually needs is the draft league's own per-match `finished` flag
   (history, built from details.matches[].finished below) — and that can lag the real
   final whistle by well over a day while bonus points / provisional stats settle.
   Observed 2026-09-19/21: GW5's last kickoff was Sun 15:30 UTC, matchday detection
   (same-day + 3h-post-kickoff) had gone false by Mon 00:03 UTC, and nothing ever
   checked again — 24 history results stayed frozen for two full days even though the
   GW had genuinely finished, because the one hourly tick that should have landed just
   after full-time either ran late or was skipped by GitHub's scheduler and by the next
   tick the window had already closed. Mirrors fplScoresReady() in index.html so the
   two "is this gameweek done" checks (server throttle vs. Settler tab) never disagree.
   Self-limiting: stops firing once history catches up OR the admin settles the
   gameweek (status leaves 'open') — whichever comes first. */
function gwScoresReady(state, g) {
  const real = asArr(g.matches).filter((m) => m && m.home && m.away);
  if (!real.length) return true;
  const hs = asArr(state.history).filter((h) => h.event === g.event);
  const have = real.filter((m) =>
    hs.some(
      (h) =>
        (h.a === m.home && h.b === m.away) ||
        (h.a === m.away && h.b === m.home),
    ),
  ).length;
  return have === real.length;
}
function gwPendingSync(state, now) {
  return asArr(state.gameweeks).some(
    (g) =>
      g &&
      g.status === "open" &&
      g.event &&
      g.deadline &&
      now - g.deadline > 6 * 3600000 &&
      !gwScoresReady(state, g),
  );
}
// Locates the Firebase child key for a gameweek by its `id` field, without assuming
// `gameweeks` is a contiguous JSON array — RTDB can return a sparse list as an object
// keyed by string index instead. Getting this wrong would PATCH the wrong gameweek.
function gwFirebaseKey(rawGameweeks, gwId) {
  if (Array.isArray(rawGameweeks)) {
    const i = rawGameweeks.findIndex((x) => x && x.id === gwId);
    return i >= 0 ? String(i) : null;
  }
  const keys = Object.keys(rawGameweeks || {});
  return (
    keys.find((k) => rawGameweeks[k] && rawGameweeks[k].id === gwId) || null
  );
}
async function maybeAutoSuggestOdds(token) {
  const state = await readFirebase("lennon-lounge", token);
  if (!state) {
    console.log("Odds auto-suggest: could not read app state, skipping.");
    return;
  }
  const rawGws = state.gameweeks;
  const g = nearestDraftGw(rawGws);
  if (!g) {
    console.log(
      "Odds auto-suggest: no draft gameweek with a deadline — nothing to do.",
    );
    return;
  }
  const now = Date.now();
  if (g.oddsAutoSuggestedAt) {
    console.log(
      `Odds auto-suggest: ${g.name || g.id} already auto-suggested at ${new Date(g.oddsAutoSuggestedAt).toISOString()} — skipping.`,
    );
    return;
  }
  if (!oddsWindowDue(g, now)) {
    const hoursOut = ((g.deadline - now) / 3600000).toFixed(1);
    console.log(
      `Odds auto-suggest: nearest draft ${g.name || g.id} is ${hoursOut}h from cutoff — outside the ${ODDS_AUTOSUGGEST_WINDOW_END_H}-${ODDS_AUTOSUGGEST_WINDOW_START_H}h window, skipping.`,
    );
    return;
  }
  const key = gwFirebaseKey(rawGws, g.id);
  if (key == null) {
    console.log(
      "Odds auto-suggest: could not re-locate gameweek by id, skipping.",
    );
    return;
  }
  const { matches, specialMarkets, forecast } = recomputeGwOdds(state, g);
  const stampedAt = Date.now();
  // Targeted PATCH to just this gameweek's odds fields — never touches `status`, never
  // touches any other gameweek. Draft stays draft; nothing becomes bettable.
  await writeToFirebase(
    `lennon-lounge/gameweeks/${key}`,
    { matches, specialMarkets, forecast, oddsAutoSuggestedAt: stampedAt },
    token,
  );
  console.log(
    `Odds auto-suggest: recomputed ${matches.length} match(es) and ${specialMarkets.length} special market(s) for ${g.name || g.id}, cutoff in ${((g.deadline - now) / 3600000).toFixed(1)}h — status stays 'draft'.`,
  );
  // Admin-only notification. ADMIN_TEAM_IDS mirrors TEAMS[].admin===true in index.html
  // (selig/rowez) — keep in sync by hand if the admin roster ever changes there.
  const ADMIN_TEAM_IDS = ["selig", "rowez"];
  for (const teamId of ADMIN_TEAM_IDS) {
    await pushNotif(
      teamId,
      "odds_auto_suggested",
      `🤖 Odds auto-suggested for ${g.name || g.id} — review before publishing (cutoff ${new Date(g.deadline).toISOString()}).`,
      token,
    );
  }
  // Phone alert: queued for the "Phone Alerts" Action (notify.yml), which sends it on its
  // next 5-minute tick. Plenty of notice — this fires ~21h before cutoff.
  const cutoff = new Date(g.deadline).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  try {
    await pushToFirebase(
      "lennon-lounge-alerts/queue",
      {
        title: `🤖 ${g.name || g.id} odds are ready`,
        body: `Auto-suggested from the latest FPL data. Review and publish before cutoff (${cutoff}).`,
        at: Date.now(),
      },
      token,
    );
  } catch (e) {
    console.log("Queueing phone alert failed (non-fatal):", e.message);
  }
}

async function main() {
  if (!LEAGUE_ID) {
    console.log("No FPL_LEAGUE_ID set — skipping");
    return;
  }

  console.log(`Fetching FPL league ${LEAGUE_ID}...`);
  const token = await getAccessToken(SERVICE_KEY);

  const bootstrap = await fetchJson(
    "https://draft.premierleague.com/api/bootstrap-static",
  );
  // bootstrap.events is {current, data:[...]} on the draft API, not a bare array.
  const evList = Array.isArray(bootstrap.events)
    ? bootstrap.events
    : (bootstrap.events && bootstrap.events.data) || [];

  // Self-throttle: on a scheduled (not manual) run, only pay for the full sync — the
  // per-team lineup fetches and every Firebase write below — when it can actually
  // matter: within 2h before/1h after a gameweek deadline, or on a day real PL
  // fixtures kick off. Uses live FPL data (this event's own deadlines, the classic
  // API's fixture kickoff times) rather than a hardcoded matchday/deadline schedule,
  // so it stays correct even when fixtures get rearranged mid-season. Deliberately
  // errs toward syncing if the fixture check itself fails.
  if ((process.env.TRIGGER_EVENT || "schedule") === "schedule") {
    const now = Date.now();
    const deadlines = evList
      .map((e) =>
        e.deadline_time ? new Date(e.deadline_time).getTime() : null,
      )
      .filter(Boolean);
    const nextDeadline = deadlines
      .filter((d) => d >= now)
      .sort((a, b) => a - b)[0];
    const prevDeadline = deadlines
      .filter((d) => d < now)
      .sort((a, b) => b - a)[0];
    const nearDeadline =
      (nextDeadline && nextDeadline - now <= 2 * 3600000) ||
      (prevDeadline && now - prevDeadline <= 1 * 3600000);

    let isMatchday = true; // fail-open: an unknown fixture state syncs rather than silently going stale
    try {
      const fixtures = await fetchJson(
        "https://fantasy.premierleague.com/api/fixtures/",
      );
      const todayStr = new Date(now).toISOString().slice(0, 10);
      isMatchday = (Array.isArray(fixtures) ? fixtures : []).some((f) => {
        if (!f.kickoff_time) return false;
        const ko = new Date(f.kickoff_time).getTime();
        return (
          new Date(ko).toISOString().slice(0, 10) === todayStr ||
          (ko <= now && now - ko <= 3 * 3600000 && !f.finished)
        );
      });
    } catch (e) {
      console.log(
        "Matchday check failed, syncing anyway to be safe:",
        e.message,
      );
    }

    // Batch 50: 21h-before-cutoff odds auto-suggest sits well outside the 2h-before/1h-
    // after deadline window above and isn't a matchday signal either, so without this it
    // would never get a chance to fire — every scheduled tick in that window would just
    // skip with zero writes. One small extra Firebase GET, same cost class as the fixtures
    // check just above; only actually triggers a full sync during the ~2h/gameweek window
    // where a draft gameweek is genuinely due and hasn't already been auto-suggested.
    let oddsDue = false,
      pendingSync = false;
    try {
      const state = await readFirebase("lennon-lounge", token);
      oddsDue = oddsWindowDue(nearestDraftGw(state && state.gameweeks), now);
      pendingSync = !!(state && gwPendingSync(state, now));
    } catch (e) {
      console.log(
        "Odds auto-suggest / stranded-gameweek check failed, treating as not due:",
        e.message,
      );
    }

    if (!nearDeadline && !isMatchday && !oddsDue && !pendingSync) {
      console.log(
        "Not near a deadline, no fixtures today, no draft gameweek in its odds auto-suggest window, and no open gameweek waiting on stale scores — skipping this scheduled run, no Firebase writes.",
      );
      return;
    }
    console.log(
      `Proceeding with full sync (nearDeadline=${!!nearDeadline}, isMatchday=${isMatchday}, oddsDue=${oddsDue}, pendingSync=${pendingSync}).`,
    );
  }

  // Live in-play points for the current gameweek, for the "in-play" odds/results view.
  const currentEvent = evList.find((e) => e.is_current);
  const liveScores = {};
  if (currentEvent) {
    try {
      const picks = await fetchJson(
        `https://draft.premierleague.com/api/event/${currentEvent.id}/live`,
      );
      liveScores[currentEvent.id] = { live: true, scores: picks };
    } catch (e) {
      console.log("Could not fetch live scores:", e.message);
    }
  }

  const fplPatch = { leagueId: LEAGUE_ID, liveScores, lastSync: Date.now() };

  // Full sync — the same computation the in-app "Sync FPL" button runs (ingestFpl in
  // index.html), just running server-side so it isn't blocked by the FPL API's CORS
  // policy the way a direct browser fetch is. Pulls the season's full fixture list,
  // finished results (→ history, powers the odds engine), and the team/manager
  // mapping. Safe to (and expected to) run on every trigger — it's a full rebuild
  // from the latest FPL data each time, same as clicking "Sync FPL" repeatedly.
  let details = null;
  try {
    details = await fetchJson(
      `https://draft.premierleague.com/api/league/${LEAGUE_ID}/details`,
    );
  } catch (e) {
    console.log("Could not fetch league details:", e.message);
  }

  if (details && details.league_entries && details.matches) {
    const existingFpl = (await readFirebase("lennon-lounge/fpl", token)) || {};
    // "Hold back last N GWs" (Back Office → FPL Settings) — a testing toggle that
    // treats the most recent N already-finished real gameweeks as if still upcoming,
    // for trying out the live betting flow against real historical data. Should be 0
    // for a genuinely live season; honoured here so an automated run can't change the
    // behaviour the admin configured in-app.
    const holdbackRaw = await readFirebase("lennon-lounge/sim/holdback", token);
    const hb = Math.max(0, Number(holdbackRaw) || 0);

    const entryMap = { ...(existingFpl.entryMap || {}) };
    // Batch 33 fix: league_entries carries two different ids per manager -- `id` (the
    // league-scoped id entryMap above is keyed by, matching matches[].league_entry_1/2)
    // and `entry_id` (FPL's global/classic entry id). element-status' `owner` field
    // (used below to build squads) turns out to be `entry_id`, verified directly
    // against the live API on 2026-08-19 -- the squad section previously assumed
    // `owner` was the league-scoped id and looked it up in entryMap, which silently
    // matched zero players on every single run. entryIdMap fixes that: entry_id -> teamId.
    const entryIdMap = { ...(existingFpl.entryIdMap || {}) };
    const unmatched = [];
    details.league_entries.forEach((en) => {
      const playerName = (
        (en.player_first_name || "") +
        " " +
        (en.player_last_name || "")
      ).trim();
      const tid =
        matchTeamName(playerName) || matchTeamName(en.entry_name || "");
      if (tid) {
        entryMap[en.id] = tid;
        if (en.entry_id != null) entryIdMap[en.entry_id] = tid;
      } else if (en.entry_name)
        unmatched.push(`${en.entry_name} (${playerName || "no manager name"})`);
    });

    const history = [],
      fplFixtures = {},
      simEvents = {};
    const finished = details.matches.filter((m) => m.finished);
    const maxEv = finished.length
      ? Math.max(...finished.map((m) => m.event))
      : 0;
    const simFrom = maxEv - hb + 1;
    details.matches.forEach((m) => {
      const a = entryMap[m.league_entry_1],
        b = entryMap[m.league_entry_2];
      if (!a || !b) return;
      if (m.finished) {
        if (hb > 0 && m.event >= simFrom) {
          (simEvents[m.event] = simEvents[m.event] || []).push({
            a,
            b,
            ap: m.league_entry_1_points,
            bp: m.league_entry_2_points,
          });
          (fplFixtures[m.event] = fplFixtures[m.event] || []).push({
            home: a,
            away: b,
          });
        } else {
          history.push({
            event: m.event,
            a,
            b,
            ap: m.league_entry_1_points,
            bp: m.league_entry_2_points,
          });
        }
      } else {
        (fplFixtures[m.event] = fplFixtures[m.event] || []).push({
          home: a,
          away: b,
        });
      }
    });

    const events = { ...(existingFpl.events || {}) };
    evList.forEach((ev) => {
      events[ev.id] = {
        deadline: ev.deadline_time
          ? new Date(ev.deadline_time).getTime()
          : null,
        name: ev.name,
      };
    });

    Object.assign(fplPatch, { entryMap, entryIdMap, events });
    await writeToFirebase("lennon-lounge", { history, fplFixtures }, token);
    // sim.events isn't touched here deliberately — it's only ever populated when
    // holdback > 0 (a deliberate testing setup) and the admin's own in-app sync
    // already owns rebuilding it in that mode.
    if (hb > 0)
      await writeToFirebase("lennon-lounge/sim", { events: simEvents }, token);

    if (unmatched.length)
      console.log("Unmatched FPL entries:", unmatched.join(", "));
    console.log(
      `Full sync: ${history.length} history result(s), ${Object.keys(fplFixtures).length} gameweek(s) with fixtures, ${unmatched.length} unmatched entr(y/ies)`,
    );
  } else {
    console.log(
      "League details unavailable this run — synced live scores only.",
    );
  }

  // ================= Batch 29: Squad Viewer data =================
  // Three new things the app's squad-on-pitch / fixture-comparison popups need, none of
  // which existed before this batch: player master data, per-manager 15-man squads, and
  // Fixture Difficulty Ratings. All of it is fetched HERE, server-side, rather than in
  // the browser — that's the whole point: FDR only exists on the CLASSIC FPL API
  // (fantasy.premierleague.com), which the app's optional Cloudflare Worker proxy does
  // NOT whitelist, so doing it in-app would force every user to hand-edit their Worker.
  // Running it in this Action means it works for everyone with zero extra setup.
  // Every step below is individually try/caught and non-fatal: a failure here must never
  // break the fixtures/results/standings sync above, which is the load-bearing part.
  try {
    const entryMap =
      fplPatch.entryMap ||
      (await readFirebase("lennon-lounge/fpl/entryMap", token)) ||
      {};
    const entryIdMap =
      fplPatch.entryIdMap ||
      (await readFirebase("lennon-lounge/fpl/entryIdMap", token)) ||
      {};

    // The draft bootstrap's events live at events.data[] with the current gameweek id at
    // events.current (NOT an is_current flag on each event — that's the classic API's
    // shape). Pre-season, events.current is null, so fall back to the earliest unfinished
    // gameweek by deadline.
    const focusEvent =
      (bootstrap.events && bootstrap.events.current) ||
      (
        evList
          .filter((e) => !e.finished)
          .sort(
            (a, b) => new Date(a.deadline_time) - new Date(b.deadline_time),
          )[0] || {}
      ).id ||
      null;

    // (1) Real-life Premier League clubs. Verified against both APIs on 2026-08-19: the
    // draft and classic bootstraps carry an IDENTICAL 20-team list with identical ids, so
    // elements[].team from the draft API indexes straight into the classic fixtures'
    // team_h/team_a with no translation table needed.
    const plTeams = {};
    (bootstrap.teams || []).forEach((t) => {
      plTeams[t.id] = { n: t.name, s: t.short_name };
    });

    // (2) Per-manager squads. league/{id}/element-status is the draft API's ownership map;
    // its `owner` field is FPL's global/classic entry_id (verified directly against the
    // live API on 2026-08-19) — a DIFFERENT number from the league-scoped id entryMap is
    // keyed by, despite both being small integers in the same rough range. entryIdMap
    // (built above, entry_id -> teamId) is the correct lookup. Returns exactly 15 players
    // per owner, and works even before a gameweek's picks exist (unlike the
    // entry/.../event/... endpoint used in step 5).
    const squads = {};
    const ownedIds = new Set();
    try {
      const es = await fetchJson(
        `https://draft.premierleague.com/api/league/${LEAGUE_ID}/element-status`,
      );
      (es.element_status || []).forEach((r) => {
        const tid = r.owner != null ? entryIdMap[r.owner] : null;
        if (!tid) return;
        (squads[tid] = squads[tid] || []).push(r.element);
        ownedIds.add(r.element);
      });
    } catch (e) {
      console.log("Could not fetch element-status:", e.message);
    }

    // (3) Player master data, slimmed hard and scoped to ONLY the ~180 players actually
    // owned in this league (not all ~600 in the game). The app keeps this inside its
    // single Firebase state blob, which the debounced save() rewrites in full — so this
    // has to stay tens of KB, not the ~900KB the raw elements[] array is.
    const players = {};
    (bootstrap.elements || []).forEach((el) => {
      if (!ownedIds.has(el.id)) return;
      // Batch 48: `cp` and `mn` feed the deep odds model (playerAvailability() /
      // playerStartShare() in index.html). chance_of_playing_this_round is 0/25/50/75/100
      // or null; between gameweeks FPL populates next_round instead, so fall back to it.
      // Season-total minutes is the rotation-risk proxy — deliberately NOT a per-gameweek
      // minutes history, which would cost ~180 extra API calls per run.
      const cp =
        el.chance_of_playing_this_round != null
          ? el.chance_of_playing_this_round
          : el.chance_of_playing_next_round != null
            ? el.chance_of_playing_next_round
            : null;
      players[el.id] = {
        n: el.web_name,
        t: el.team,
        p: el.element_type,
        f: Number(el.form) || 0,
        tp: el.total_points || 0,
        ep: el.event_points || 0,
        ppg: Number(el.points_per_game) || 0,
        st: el.status || "a",
        cp: cp,
        cpn: el.chance_of_playing_next_round ?? null,
        code: el.code,
        mn: el.minutes != null ? Number(el.minutes) || 0 : null,
      };
    });

    // (4) Fixture Difficulty Rating (1-5 per side, per fixture). The one call in this
    // whole workflow that hits fantasy.premierleague.com rather than draft.premierleague.com
    // — FDR simply is not exposed by the draft API at all.
    const plFixtures = {};
    try {
      const fixtures = await fetchJson(
        "https://fantasy.premierleague.com/api/fixtures/",
      );
      (Array.isArray(fixtures) ? fixtures : []).forEach((f) => {
        if (!f.event) return;
        (plFixtures[f.event] = plFixtures[f.event] || []).push({
          h: f.team_h,
          a: f.team_a,
          hd: f.team_h_difficulty,
          ad: f.team_a_difficulty,
          k: f.kickoff_time ? new Date(f.kickoff_time).getTime() : null,
        });
      });
    } catch (e) {
      console.log("Could not fetch classic fixtures (FDR):", e.message);
    }

    // (5) Starting XI vs bench — best effort only. entry/{entry_id}/event/{ev} returns
    // {picks:[{element, position, ...}]} with positions 1-11 the starters and 12-15 the
    // bench. It 404s with "No pick history" until that gameweek's picks actually exist,
    // so this is deliberately optional: the app renders a perfectly good pitch from the
    // 15-man squad alone whenever `lineups` is missing. Note this endpoint keys on
    // league_entries[].entry_id (the global FPL entry id), NOT the .id used everywhere
    // else above — the two are different numbers.
    const lineups = {},
      benchOrder = {};
    if (focusEvent && details && details.league_entries) {
      for (const en of details.league_entries) {
        const tid = entryMap[en.id];
        if (!tid || !en.entry_id) continue;
        try {
          const p = await fetchJson(
            `https://draft.premierleague.com/api/entry/${en.entry_id}/event/${focusEvent}`,
          );
          const start = ((p && p.picks) || [])
            .filter((x) => x.position <= 11)
            .map((x) => x.element);
          if (start.length) {
            lineups[tid] = start;
            benchOrder[tid] = (p.picks || [])
              .filter((x) => x.position > 11)
              .sort((a, b) => a.position - b.position)
              .map((x) => x.element);
          }
        } catch (e) {
          /* no picks published for this entry/event yet — expected */
        }
      }
    }

    Object.assign(fplPatch, {
      plTeams,
      players,
      squads,
      plFixtures,
      // null deletes the key on a Firebase PATCH, which is what we want when picks
      // aren't available — better a missing `lineups` than a stale one from last week.
      lineups: Object.keys(lineups).length ? lineups : null,
      benchOrder,
      lineupEvent: focusEvent,
      lineupsPublished:
        !!focusEvent &&
        evList.some(
          (e) =>
            e.id === focusEvent && Date.parse(e.deadline_time) <= Date.now(),
        ),
      squadEvent: focusEvent,
      squadSync: Date.now(),
    });
    try {
      Object.assign(fplPatch, await enrich(bootstrap, ownedIds, fetchJson));
    } catch (e) {
      delete fplPatch.plFixtures;
      console.log(
        "Model histories unavailable; preserving prior inputs:",
        e.message,
      );
    }
    console.log(
      `Squad data: ${Object.keys(squads).length} squad(s), ${Object.keys(players).length} owned player(s), ${Object.keys(plFixtures).length} gameweek(s) of FDR, ${Object.keys(lineups).length} lineup(s), focus GW ${focusEvent}`,
    );
  } catch (e) {
    console.log(
      "Squad/FDR sync step failed (non-fatal, rest of the sync stands):",
      e.message,
    );
  }

  await writeToFirebase("lennon-lounge/fpl", fplPatch, token);

  // ================= Batch 50: odds auto-suggest =================
  // Runs at the end of every full sync (whichever condition triggered it — near-deadline,
  // matchday, odds-window, or a manual workflow_dispatch). Self-gates on the same window +
  // oddsAutoSuggestedAt idempotency check regardless of why this run happened, so a manual
  // "Run workflow" click outside the window is a safe no-op, not a forced early fire.
  // Never fatal to the sync above: fixtures/results/standings/squads already landed.
  try {
    await maybeAutoSuggestOdds(token);
  } catch (e) {
    console.log(
      "Odds auto-suggest step failed (non-fatal, rest of sync stands):",
      e.message,
    );
  }

  console.log("FPL sync complete");
}

module.exports = { recomputeGwOdds, oddsWindowDue, gwFirebaseKey };
if (require.main === module)
  main().catch((e) => {
    console.error("FPL sync failed:", e);
    process.exit(1);
  });
