const { test } = require("node:test"),
  assert = require("node:assert/strict");
const Core = require("../scripts/autopilot-core.cjs");

const H = 3600000,
  MIN = 60000;
const T0 = Date.parse("2026-12-05T12:30:00Z"); // first kickoff of the test gameweek
// 10 fixtures like a normal weekend: Sat 12:30, 4x15:00, 17:30, 20:00; Sun 14:00 x2, 16:30.
const KO = [0, 2.5, 2.5, 2.5, 2.5, 5, 7.5, 25.5, 25.5, 28].map((h) => T0 + h * H);
function fixtures(now, ev = 14) {
  return KO.map((k, i) => ({
    id: i + 1,
    event: ev,
    kickoff_time: new Date(k).toISOString(),
    started: now >= k,
    finished_provisional: now >= k + 115 * MIN,
    finished: now >= k + 115 * MIN,
  }));
}
const teams = ["a", "b", "c", "d", "e", "f"].flatMap((x) => [x + "1", x + "2"]);
const matches = [0, 1, 2, 3, 4, 5].map((i) => ({
  id: "m" + i,
  home: teams[i * 2],
  away: teams[i * 2 + 1],
}));
const gw = (status, extra = {}) => ({ id: "gw14", name: "GW 14", event: 14, status, matches, ...extra });
const decide = (now, state, ap = {}, config) =>
  Core.decide({ now, config, fixturesByEvent: { 14: fixtures(now) }, state, ap });

test("releases about 24h before the first kickoff, not before", () => {
  const state = { gameweeks: [gw("draft")], bets: [], history: [] };
  const early = decide(T0 - 25 * H, state);
  assert.deepEqual(early.actions, []);
  assert.equal(early.active, true, "watcher stays up when release is within 30h");
  assert.ok(early.nextCheckAt <= T0 - 24 * H, "checks again by release time");
  assert.equal(decide(T0 - 24 * H - 5 * MIN, state).nextCheckAt, T0 - 24 * H, "wakes exactly at release time");
  assert.equal(decide(T0 - 60 * H, state).active, false, "idle when release is far off");
  const due = decide(T0 - 24 * H + MIN, state);
  assert.deepEqual(due.actions.map((a) => a.type), ["release"]);
  assert.equal(due.actions[0].ev, 14);
});

test("release respects the configured hours", () => {
  const state = { gameweeks: [gw("draft")], bets: [], history: [] };
  assert.deepEqual(decide(T0 - 30 * H, state, {}, { releaseHoursBefore: 36 }).actions.map((a) => a.type), ["release"]);
});

test("never republishes, and records a gameweek Dan published by hand", () => {
  const open = { gameweeks: [gw("open")], bets: [], history: [] };
  assert.deepEqual(decide(T0 - 20 * H, open).actions.map((a) => a.type), ["note-released"]);
  const done = decide(T0 - 20 * H, open, { gws: { 14: { released: { at: 1 } } } });
  assert.deepEqual(done.actions, []);
  const inplayOnly = { gameweeks: [gw("draft", { normalOff: true })], bets: [], history: [] };
  assert.equal(decide(T0 - 20 * H, inplayOnly).actions[0].by, "in-play-only");
});

test("too close to kickoff: warns once instead of publishing", () => {
  const state = { gameweeks: [gw("draft")], bets: [], history: [] };
  assert.deepEqual(decide(T0 - 2 * H, state).actions.map((a) => a.type), ["release-missed"]);
  assert.deepEqual(decide(T0 - 2 * H, state, { gws: { 14: { missedWarned: 1 } } }).actions, []);
});

test("gives up after three failed publishes", () => {
  const state = { gameweeks: [gw("draft")], bets: [], history: [] };
  const a = decide(T0 - 20 * H, state, { gws: { 14: { releaseFailures: 3 } } }).actions;
  assert.deepEqual(a.map((x) => x.type), ["release-gave-up"]);
});

test("paused: does nothing", () => {
  const state = { gameweeks: [gw("draft")], bets: [], history: [] };
  const p = decide(T0 - 20 * H, state, {}, { enabled: false });
  assert.deepEqual(p.actions, []);
  assert.equal(p.active, false);
});

test("bet updates: after 3-5 games at a lull, then 5-7, then optional 8-9", () => {
  const state = { gameweeks: [gw("open")], bets: [], history: [] };
  const trends = (now, ap) => decide(now, state, ap).actions.filter((a) => a.type === "trend");
  // 14:30: one game done, four live.
  assert.deepEqual(trends(T0 + 2 * H), []);
  // 16:55: five done (12:30 + four 15:00s), 17:30 not started -> update 1.
  const u1 = trends(T0 + 4.5 * H);
  assert.equal(u1.length, 1);
  assert.equal(u1[0].index, 0);
  assert.equal(u1[0].finished, 5);
  const ap1 = { gws: { 14: { updates: [{ at: T0 + 4.5 * H, finished: 5 }] } } };
  // 19:30: six done -> not yet (needs 7 = 5+2).
  assert.deepEqual(trends(T0 + 7 * H, ap1), []);
  // 22:00: seven done -> update 2.
  const u2 = trends(T0 + 9.5 * H, ap1);
  assert.equal(u2[0].index, 1);
  assert.equal(u2[0].finished, 7);
  const ap2 = { gws: { 14: { updates: [...ap1.gws[14].updates, { at: T0 + 9.5 * H, finished: 7 }] } } };
  // Sunday 16:00: nine done, one to come -> optional third update.
  const u3 = trends(T0 + 27.5 * H, ap2);
  assert.equal(u3[0].index, 2);
  assert.equal(u3[0].finished, 9);
  // All finished -> no more updates.
  assert.deepEqual(trends(T0 + 31 * H, ap2), []);
});

test("bet update waits for live games unless the window's top is reached", () => {
  const s = { total: 10, finished: 4, live: 2, started: 6, allFinished: false };
  assert.equal(Core.trendDue({}, s, 0), null, "4 done, games live: wait for the lull");
  assert.equal(Core.trendDue({}, { ...s, finished: 5 }, 0).index, 0, "5 done: send even with games live");
  assert.equal(Core.trendDue({}, { ...s, live: 0 }, 0).index, 0, "4 done and a lull: send");
});

test("settles when every final Draft score is synced; syncs FPL first if not", () => {
  const after = T0 + 31 * H;
  const history = matches.map((m) => ({ event: 14, a: m.home, b: m.away, ap: 40, bp: 30 }));
  const notReady = decide(after, { gameweeks: [gw("open")], bets: [], history: history.slice(1) });
  assert.deepEqual(notReady.actions.map((a) => a.type), ["sync-fpl"]);
  const recent = decide(after, { gameweeks: [gw("open")], bets: [], history: history.slice(1) }, { lastSyncAt: after - 5 * MIN });
  assert.deepEqual(recent.actions, [], "FPL sync throttled to every 20 min");
  const ready = decide(after, { gameweeks: [gw("open")], bets: [], history });
  assert.deepEqual(ready.actions.map((a) => a.type), ["settle"]);
  const settled = decide(after, { gameweeks: [gw("open")], bets: [], history }, { gws: { 14: { settled: { at: 1 } } } });
  assert.deepEqual(settled.actions, []);
});

test("unreviewed bets: warn, wait the grace period, then settle (they expire)", () => {
  const after = T0 + 31 * H;
  const history = matches.map((m) => ({ event: 14, a: m.home, b: m.away, ap: 40, bp: 30 }));
  const state = { gameweeks: [gw("open")], bets: [{ id: "b1", gwId: "gw14", status: "pending", legs: [] }], history };
  assert.deepEqual(decide(after, state).actions.map((a) => a.type), ["warn-pending"]);
  const warned = { gws: { 14: { pendingWarnedAt: after } } };
  assert.deepEqual(decide(after + 2 * H, state, warned).actions, []);
  const go = decide(after + 12 * H, state, warned).actions;
  assert.deepEqual(go.map((a) => a.type), ["settle"]);
  assert.equal(go[0].expiring, 1);
  assert.deepEqual(decide(after, state, {}, { settleGraceHours: 0 }).actions.map((a) => a.type), ["warn-pending"]);
});

test("next gameweek's release and this one's settlement can both be due", () => {
  const now = T0 + 31 * H;
  const history = matches.map((m) => ({ event: 14, a: m.home, b: m.away, ap: 40, bp: 30 }));
  const fx15 = fixtures(now, 15).map((f) => ({ ...f, kickoff_time: new Date(Date.parse(f.kickoff_time) + 50 * H).toISOString(), started: false, finished: false, finished_provisional: false }));
  const plan = Core.decide({
    now,
    fixturesByEvent: { 14: fixtures(now), 15: fx15 },
    state: { gameweeks: [gw("open"), { ...gw("draft"), id: "gw15", event: 15 }], bets: [], history },
    ap: {},
  });
  assert.deepEqual(plan.actions.map((a) => `${a.type}:${a.ev}`).sort(), ["release:15", "settle:14"]);
});

test("bet tracker text shows live legs, chances and skips when there are no bets", () => {
  const g = gw("open");
  const snap = {
    matches: {
      m0: { id: "m0", home: "a1", away: "a2", currentHome: 40, currentAway: 22, probabilities: { home: 0.8, draw: 0.02, away: 0.18 } },
      m1: { id: "m1", home: "b1", away: "b2", currentHome: 10, currentAway: 30, probabilities: { home: 0.1, draw: 0.02, away: 0.88 } },
      m2: { id: "m2", home: "c1", away: "c2", currentHome: 50, currentAway: 49, probabilities: { home: 0.5, draw: 0.05, away: 0.45 } },
    },
    teams: { a1: { remainingPlayers: 0 }, a2: { remainingPlayers: 0 }, b1: { remainingPlayers: 3 }, b2: { remainingPlayers: 2 } },
  };
  const bets = [
    { id: "x", teamId: "henry", gwId: "gw14", status: "accepted", stake: 5, effOdds: 3.4, legs: [
      { type: "match", matchId: "m0", pick: "home", label: "A1 to WIN v A2" },
      { type: "match", matchId: "m2", pick: "home", label: "C1 to WIN v C2" },
    ] },
    { id: "y", teamId: "fride", gwId: "gw14", status: "accepted", stake: 10, effOdds: 2, legs: [
      { type: "match", matchId: "m1", pick: "home", label: "B1 to WIN v B2" },
    ] },
    { id: "z", teamId: "fride", gwId: "gw13", status: "accepted", stake: 10, effOdds: 2, legs: [] },
    { id: "w", teamId: "fride", gwId: "gw14", status: "rejected", stake: 10, effOdds: 2, legs: [] },
  ];
  const teamsList = [{ id: "henry", name: "Henry's Heroes", owner: "Ben" }, { id: "fride", name: "Fride FC", owner: "Benjamin" }];
  const text = Core.trendText({ g, bets, teams: teamsList, snap, update: { index: 0, finished: 4, total: 10 }, link: "https://x/?from=gw14-up1-wa" });
  assert.match(text, /GW 14 BET TRACKER · update 1/);
  assert.match(text, /4\/10 Premier League games done · 2\/2 slips still alive/);
  assert.match(text, /Ben \(Henry's Heroes\): £5\.00 double @ 3\.40 → £17\.00/);
  assert.match(text, /✅ A1 to WIN v A2 \(40–22\)/, "finished match shows as landed");
  assert.match(text, /🟢 C1 to WIN v C2 \(50–49\) · 50%/);
  assert.match(text, /~50% to land/);
  assert.match(text, /🟠 B1 to WIN v B2 \(10–30\) · 10%/);
  assert.ok(text.indexOf("Henry") < text.indexOf("Fride FC"), "best chance first");
  assert.match(text, /House sweating on £37\.00/);
  assert.doesNotMatch(text, /gw13|rejected/);
  assert.equal(Core.trendText({ g, bets: [], teams: teamsList, snap, update: { index: 0, finished: 4, total: 10 } }), null);
});

test("special legs: points lines lock in as soon as they're decided", () => {
  const g = gw("open");
  const snap = {
    matches: { m0: { id: "m0", home: "a1", away: "a2", currentHome: 61, currentAway: 20, probabilities: { home: 0.9 } } },
    teams: { a1: { remainingPlayers: 4 }, a2: { remainingPlayers: 0 } },
  };
  const t = (leg) => Core.legTrend(leg, g, snap);
  assert.equal(t({ kind: "team_pts", teamId: "a1", dir: "over", line: 55.5 }).icon, "✅");
  assert.equal(t({ kind: "team_pts", teamId: "a1", dir: "under", line: 55.5 }).icon, "❌");
  assert.equal(t({ kind: "team_pts", teamId: "a2", dir: "over", line: 40.5 }).icon, "❌", "finished team under the line");
  assert.equal(t({ kind: "haul", teamId: "a1", line: 70 }).icon, "🟠");
  assert.equal(t({ kind: "match_total", matchId: "m0", dir: "over", line: 75.5 }).icon, "✅");
  assert.equal(t({ type: "bespoke", label: "x" }).icon, "⏳");
});
