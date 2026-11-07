// 2026-11-07: odds calibration, partial in-play suspension, provisional bonus and refresh status.
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  M = require("../odds-model.js"),
  IP = require("../in-play-market.js"),
  harness = require("./app-harness.cjs"),
  base = require("../backups/2026-11-02.json");
const arr = (x) =>
  Array.isArray(x) ? x.filter(Boolean) : Object.values(x || {});

test("pre-match underdogs sit around 1.85–2.0 and never drift far past 2.0", () => {
  const dogs = [];
  for (const ev of [10, 11]) {
    const g = arr(base.gameweeks).find((g) => g.event === ev),
      pred = M.forecast(base, ev, { samples: 1500 });
    for (const m of g.matches) {
      const r = M.recommendation(base, m.home, m.away, ev, pred);
      dogs.push(Math.max(r.odds.home, r.odds.away));
      assert.ok(
        Math.min(r.odds.home, r.odds.away) >= 1.5,
        JSON.stringify(r.odds),
      );
    }
  }
  dogs.sort((a, b) => a - b);
  assert.ok(dogs.at(-1) <= 2.05, `longest underdog ${dogs.at(-1)}`);
  assert.ok(
    dogs[Math.floor(dogs.length / 2)] <= 1.97,
    `median underdog ${dogs}`,
  );
});

test("calibrated pricing keeps banked points exact and only shrinks what is still to play", () => {
  const pred = M.forecast(base, 10, { samples: 400 });
  for (const t of Object.values(pred.teams)) {
    assert.ok(Number.isFinite(t.priceProj) && t.priceSd > 0);
    assert.ok(t.slotsLeft > 9 && t.slotsLeft <= 15);
  }
  // Projections are pulled towards the league average, not reordered wholesale.
  const raw = Object.values(pred.teams).map((t) => t.proj),
    cal = Object.values(pred.teams).map((t) => t.priceProj),
    spread = (xs) => Math.max(...xs) - Math.min(...xs);
  assert.ok(spread(cal) < spread(raw));
});

test("in-play: a near-certain favourite goes OFF while the outsider and draw stay bettable", () => {
  const n = 1000,
    home = Array.from({ length: n }, (_, i) => (i < 880 ? 60 : 40)),
    away = Array.from({ length: n }, (_, i) => (i < 880 ? 45 : 50 + (i % 2)));
  const pred = {
    inPlay: true,
    teams: { h: { proj: 58, players: [] }, a: { proj: 46, players: [] } },
    priceSamples: { h: home, a: away },
  };
  const r = M.recommendation(base, "h", "a", 10, pred, { inPlay: true });
  assert.equal(r.odds.home, null);
  assert.ok(r.odds.away > 5);
  assert.equal(r.suspended, false);
  const market = {
    status: "published",
    publishedAt: Date.now() - 1000,
    cutoff: Date.now() + 60000,
    revision: "r",
    matches: { m: { ...r } },
  };
  assert.match(
    IP.legError(
      market,
      {
        type: "match",
        marketRevision: "r",
        matchId: "m",
        pick: "home",
        odds: 1.05,
      },
      Date.now(),
    ),
    /too likely/,
  );
  assert.equal(
    IP.legError(
      market,
      {
        type: "match",
        marketRevision: "r",
        matchId: "m",
        pick: "away",
        odds: r.odds.away,
      },
      Date.now(),
    ),
    null,
  );
});

test("provisional bonus follows FPL's BPS tie rules and is skipped once bonus is confirmed", () => {
  const bps = (h) => [
    { s: "bonus", h: [], a: [] },
    { s: "bps", h, a: [] },
  ];
  const fx = (h, extra = {}) => ({
    started: true,
    finished: false,
    finished_provisional: true,
    stats: bps(h),
    ...extra,
  });
  const e = (element, value) => ({ element, value });
  assert.deepEqual(
    IP.provisionalBonus(fx([e(1, 40), e(2, 40), e(3, 30), e(4, 20)])),
    { 1: 3, 2: 3, 3: 1 },
  );
  assert.deepEqual(
    IP.provisionalBonus(fx([e(1, 40), e(2, 30), e(3, 30), e(4, 20)])),
    { 1: 3, 2: 2, 3: 2 },
  );
  assert.deepEqual(
    IP.provisionalBonus(fx([e(1, 40), e(2, 30), e(3, 20), e(4, 20)])),
    { 1: 3, 2: 2, 3: 1, 4: 1 },
  );
  assert.deepEqual(
    IP.provisionalBonus(fx([e(1, 40)], { finished_provisional: false }), 45),
    { 1: 1.5 },
  );
  const confirmed = fx([e(1, 40)]);
  confirmed.stats[0].h = [e(1, 3)];
  assert.deepEqual(IP.provisionalBonus(confirmed), {});
  assert.deepEqual(IP.provisionalBonus(fx([e(1, 40)], { finished: true })), {});
});

test("refresh status dot: amber while refreshing, red on failure or stale, green when fresh", () => {
  const h = harness(require("../backups/2026-10-26.json"));
  h.run(`render=()=>{};toast=()=>{};me=TEAMS.find(t=>t.admin);g=gw('gw_74');g.status='open';
    fresh={revision:'r1',status:'draft',active:true,generatedAt:Date.now(),blockedReasons:[],cutoff:Date.now()+60000,maxCutoff:Date.now()+60000,
      source:{fetchedAt:Date.now(),warnings:[],fixtures:{total:10,finished:3,live:2,nextKickoff:Date.now()+3600000}},matches:{},forecast:{teams:{}}};`);
  const level = () => h.run("inPlayHealth(g).level");
  h.run(
    "inPlayState[g.id]={request:{id:'q',status:'running',requestedAt:Date.now()}}",
  );
  assert.equal(level(), "amber");
  h.run("inPlayState[g.id].request.dispatch={ok:false,code:401}");
  assert.equal(level(), "red");
  assert.match(h.run("inPlayHealth(g).text"), /401/);
  h.run(
    "inPlayState[g.id]={request:{id:'q',status:'queued',requestedAt:Date.now()-4*60000}}",
  );
  assert.equal(level(), "red");
  h.run("inPlayState[g.id]={request:{id:'q',status:'error',error:'FPL down'}}");
  assert.match(h.run("inPlayHealth(g).text"), /FPL down/);
  h.run("inPlayState[g.id]={request:{status:'ready'},draft:fresh}");
  assert.equal(level(), "green");
  assert.match(
    h.run("inPlayHealth(g).text"),
    /3 of 10 PL games finished, 2 in play/,
  );
  h.run("fresh.source.fetchedAt=Date.now()-20*60000");
  assert.equal(level(), "amber");
  h.run("fresh.source.fetchedAt=Date.now()-45*60000");
  assert.equal(level(), "red");
  h.run("fresh.active=false");
  assert.equal(
    level(),
    "green",
    "between games an older pull is still current",
  );
  h.run("fresh.blockedReasons=['Scores disagree.']");
  assert.equal(level(), "red");
  const card = h.run("inPlayAdminCard(g)");
  assert.ok(
    card.includes("🔄 Refresh in-play odds") && card.includes("ip-health"),
  );
});
