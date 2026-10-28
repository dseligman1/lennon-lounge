const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  M = require("../odds-model.js");
function state() {
  const players = {},
    squads = { h: [], a: [] },
    hist = {};
  let id = 1;
  for (const tid of ["h", "a"])
    for (const pos of [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4]) {
      players[id] = {
        n: "P" + id,
        p: pos,
        t: tid === "h" ? 1 : 2,
        ppg: 4,
        mn: 360,
        st: "a",
      };
      squads[tid].push(id);
      hist[id] = [1, 2, 3, 4].map((event) => ({
        event,
        minutes: 90,
        starts: 1,
        points: 4,
        goals: 0,
        assists: 0,
        xg: 0.1,
        xa: 0.1,
        cs: 0,
        gc: 1,
      }));
      id++;
    }
  return {
    teams: [{ id: "h" }, { id: "a" }],
    history: [],
    gameweeks: [],
    settings: { oddsCompetitiveness: 10 },
    fpl: {
      players,
      squads,
      playerHistory: hist,
      squadEvent: 4,
      modelData: { fetchedAt: 1 },
      plFixtures: { 5: [{ id: 1, h: 1, a: 2, hd: 3, ad: 3, k: 10 }] },
    },
  };
}
test("deterministic, finite forecasts, legal formations and additive player contributions", () => {
  const s = state(),
    p = M.forecast(s, 5, { samples: 600 });
  assert.deepEqual(p, M.forecast(s, 5, { samples: 600 }));
  for (const t of Object.values(p.teams)) {
    assert.ok(t.proj > 0);
    assert.ok(t.confidence >= 0 && t.confidence <= 100);
    assert.ok(
      Math.abs(t.players.reduce((a, p) => a + p.contribution, 0) - t.proj) <
        1e-9,
    );
    assert.equal(
      Math.round(
        t.players.reduce((a, p) => a + p.selectionProbability / 100, 0),
      ),
      11,
    );
    assert.ok(
      t.players
        .filter((p) => p.position === 1)
        .reduce((s, p) => s + p.selectionProbability / 100, 0) <= 1.0001,
    );
  }
  assert.deepEqual(s, state());
});
test("future results, fixture results and player history cannot affect pre-event predictions", () => {
  const s = state(),
    a = M.forecast(s, 5, { samples: 300 });
  s.history.push({ event: 5, a: "h", b: "a", ap: 1000, bp: 0 });
  s.fpl.playerHistory[1].push({
    event: 5,
    minutes: 90,
    points: 999,
    starts: 1,
  });
  s.fpl.plFixtures[5][0].hg = 10;
  s.fpl.plFixtures[5][0].finished = true;
  assert.deepEqual(a, M.forecast(s, 5, { samples: 300 }));
});
test("blank yields zero; double adds a second fixture; unavailable players zero", () => {
  const s = state();
  s.fpl.players[1].st = "i";
  const one = M.forecast(s, 5, { samples: 500 });
  assert.equal(one.players[1].proj, 0);
  s.fpl.plFixtures[5].push({ id: 2, h: 1, a: 2, hd: 3, ad: 3 });
  const dbl = M.forecast(s, 5, { samples: 500 });
  assert.ok(dbl.teams.h.proj > one.teams.h.proj * 1.6);
  s.fpl.plFixtures[5] = [{ id: 3, h: 3, a: 4 }];
  const blank = M.forecast(s, 5, { samples: 100 });
  assert.equal(blank.teams.h.proj, 0);
});
test("wrong-event lineups are not locked; known lineups are", () => {
  const s = state();
  s.fpl.lineups = {
    h: M.bestXI(
      s.fpl.squads.h.map((id) => ({ id, pos: s.fpl.players[id].p })),
      () => 1,
    ).map((p) => p.id),
  };
  s.fpl.lineupsPublished = true;
  s.fpl.lineupEvent = 4;
  assert.equal(M.forecast(s, 5, { samples: 100 }).teams.h.lineupKnown, false);
  s.fpl.lineupEvent = 5;
  assert.equal(M.forecast(s, 5, { samples: 100 }).teams.h.lineupKnown, true);
});
test("house edge rules and price floors are preserved for all slider values", () => {
  for (let i = 1; i <= 20; i++) {
    const e = M.houseEdgePct({ oddsCompetitiveness: i });
    assert.ok(e >= 10 && e <= 28);
    for (let p = 0.03; p < (1 - e / 100) / 1.05; p += 0.01) {
      assert.ok(1 - p * M.edgedOdds(p, e) >= e / 100 - 1e-10);
    }
  }
  assert.equal(M.houseEdgePct({ oddsCompetitiveness: 10 }), 16.3);
  assert.equal(M.houseEdgePct({ oddsCompetitiveness: 20 }), 10);
});
test("in-play retains current scores; completed fixture points are not double counted", () => {
  const s = state();
  s.fpl.plFixtures[5][0].finished = true;
  const p = M.forecast(s, 5, {
    samples: 100,
    live: {
      teamPoints: { h: 45, a: 35 },
      playerPoints: { 1: { points: 5, minutes: 90 } },
    },
  });
  assert.equal(p.teams.h.proj, 45);
  assert.equal(p.teams.a.proj, 35);
  assert.equal(
    M.recommendation(s, "h", "a", 5, p, { inPlay: true }).suspended,
    true,
  );
});
test("browser and Node execute the identical engine", () => {
  const sandbox = {};
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../odds-model.js"), "utf8"),
    sandbox,
  );
  const s = state(),
    a = M.forecast(s, 5, { samples: 100 }),
    b = sandbox.LennonModel.forecast(s, 5, { samples: 100 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
test("app and workflow JavaScript parse", () => {
  const html = fs.readFileSync(require.resolve("../index.html"), "utf8");
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  new vm.Script(
    fs.readFileSync(require.resolve("../scripts/sync-fpl.cjs"), "utf8"),
  );
});
test("invalid published lineup cannot bypass formation rules", () => {
  const s = state();
  s.fpl.lineups = { h: s.fpl.squads.h.slice(0, 11) };
  s.fpl.lineupsPublished = true;
  s.fpl.lineupEvent = 5;
  assert.equal(M.forecast(s, 5, { samples: 100 }).teams.h.lineupKnown, false);
});
test("opposing defenders and forwards share negative fixture covariance", () => {
  const s = state(),
    p = M.forecast(s, 5, { samples: 10000, includePlayerSamples: true });
  const x = p.playerSamples[3],
    y = p.playerSamples[28],
    mx = x.reduce((a, b) => a + b) / x.length,
    my = y.reduce((a, b) => a + b) / y.length;
  const cov = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) / x.length;
  assert.ok(cov < 0, `opponent covariance ${cov}`);
});
test("active fixture never re-awards existing clean sheets and respects substituted players", () => {
  const s = state();
  s.fpl.plFixtures[5][0] = {
    id: 1,
    h: 1,
    a: 2,
    started: true,
    minutes: 90,
    hg: 0,
    ag: 0,
  };
  const points = {};
  for (const id of Object.keys(s.fpl.players))
    points[id] = {
      points: 6,
      minutes: 90,
      fixtures: { 1: { minutes: 90, clean_sheets: 1, goals_conceded: 0 } },
    };
  const p = M.forecast(s, 5, {
    samples: 200,
    live: { teamPoints: { h: 66, a: 66 }, playerPoints: points },
  });
  assert.equal(p.teams.h.proj, 66);
  assert.equal(p.teams.a.proj, 66);
});
