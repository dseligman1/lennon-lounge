const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  IP = require("../in-play-market.js"),
  harness = require("./app-harness.cjs"),
  state = require("../backups/2026-10-26.json");
function draft(now = Date.now()) {
  return {
    revision: "v1",
    gwId: "gw_74",
    status: "draft",
    generatedAt: now,
    source: { fetchedAt: now, warnings: [] },
    cutoff: now + 60000,
    maxCutoff: now + 120000,
    blockedReasons: [],
    matches: {
      m_75: {
        id: "m_75",
        home: "dunny",
        away: "rowez",
        odds: { home: 1.5, draw: 10, away: 2 },
        suspended: false,
        currentHome: 20,
        currentAway: 18,
      },
    },
    originalOdds: { m_75: { home: 1.7, draw: 14, away: 1.9 } },
  };
}
function leg() {
  return {
    type: "match",
    gwId: "gw_74",
    matchId: "m_75",
    pick: "home",
    odds: 1.5,
    marketRevision: "v1",
  };
}
test("cutoffs stop before kickoff, shorten during play, close on completion", () => {
  const now = 1000000;
  assert.equal(
    IP.windowFor([{ k: now + 60000, started: false }], now).maxCutoff,
    now + 60000,
  );
  assert.equal(IP.windowFor([{ started: true }], now).maxCutoff, now + 120000);
  assert.ok(IP.windowFor([{ finished: true }], now).reasons.length);
  assert.ok(IP.windowFor([{ k: now - 1 }], now).reasons.length);
});
test("publication rejects old/future feeds, invalid cutoff, blockers and decided markets", () => {
  const now = 1000000,
    d = draft(now);
  assert.equal(IP.publishError(d, now + 60000, now), null);
  for (const bad of [
    { ...d, source: { fetchedAt: now - 360000 } },
    { ...d, source: { fetchedAt: now + 20000 } },
    { ...d, blockedReasons: ["mismatch"] },
    { ...d, matches: { m: { suspended: true } } },
  ])
    assert.ok(IP.publishError(bad, now + 60000, now));
  assert.ok(IP.publishError(d, now + 120001, now));
  assert.ok(IP.publishError(d, now, now));
});
test("revision, expiry, missing prices and suspended match reject a stale slip", () => {
  const now = 1000000,
    m = IP.publishRecord(draft(now), now + 60000, now, "selig");
  assert.equal(IP.legError(m, leg(), now), null);
  assert.ok(IP.legError(m, { ...leg(), marketRevision: "old" }, now));
  assert.ok(IP.legError(m, leg(), now + 60000));
  assert.ok(IP.legError(m, { ...leg(), odds: 8 }, now));
  assert.ok(IP.legError({ ...m, matches: {} }, leg(), now));
});
test("republish preserves original odds and does not mutate previous market or bets", () => {
  const now = 1000000,
    first = IP.publishRecord(draft(now), now + 60000, now, "selig"),
    saved = structuredClone(first);
  const next = {
    ...draft(now + 1000),
    revision: "v2",
    originalOdds: { wrong: {} },
  };
  const second = IP.publishRecord(
    next,
    now + 61000,
    now + 1000,
    "selig",
    first,
  );
  assert.deepEqual(second.originalOdds, first.originalOdds);
  assert.deepEqual(first, saved);
});
test("Draft explain format retains per-fixture stats and rejects absent scores", () => {
  const p = IP.parsePlayerLive({
    stats: { minutes: 90, total_points: 6, clean_sheets: 1, goals_conceded: 0 },
    explain: [
      [
        [
          { stat: "minutes", value: 90, points: 2 },
          { stat: "clean_sheets", value: 1, points: 4 },
        ],
        71,
      ],
    ],
  });
  assert.equal(p.fixtures[71].clean_sheets, 1);
  assert.equal(p.points, 6);
  assert.throws(() => IP.parsePlayerLive({}), /Missing/);
});
test("in-play renders score/old odds and blocks unversioned or expired selections", () => {
  const h = harness(state),
    d = draft();
  h.ctx.d = d;
  h.run("d.forecast=LennonModel.snapshot(modelForecast(S,8))");
  h.run(
    "inPlayState.gw_74={published:LennonInPlay.publishRecord(d,d.cutoff,Date.now(),'selig')}; builderSec='inplay'",
  );
  const html = h.run("vBuilder()");
  assert.ok(html.includes("20–18"));
  assert.ok(html.includes("<s"));
  assert.ok(!html.includes("Coming soon"));
  h.run(
    "slip=[{type:'match',gwId:'gw_74',matchId:'m_75',pick:'home',odds:1.5}]",
  );
  assert.equal(h.run("slipContext().ok"), false);
  h.run("slip[0].marketRevision='v1'");
  assert.equal(h.run("slipContext().ok"), true);
  h.run("inPlayState.gw_74.published.cutoff=1");
  assert.equal(h.run("slipContext().ok"), false);
});
