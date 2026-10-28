const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  sync = require("../scripts/sync-fpl.cjs"),
  harness = require("./app-harness.cjs"),
  state = require("../backups/2026-10-26.json");
test("Action and browser recommendations match exactly and preserve market identity/status", () => {
  const h = harness(state),
    before = structuredClone(state),
    g = state.gameweeks[8],
    r = sync.recomputeGwOdds(state, g);
  for (const m of r.matches) {
    h.ctx.ids = { h: m.home, a: m.away };
    assert.deepEqual(
      m.odds,
      JSON.parse(h.run("JSON.stringify(recOdds(S,ids.h,ids.a,9))")),
    );
    assert.equal(m.id, g.matches.find((x) => x.id === m.id).id);
  }
  assert.deepEqual(state, before);
  assert.equal(r.forecast.version, require("../odds-model.js").VERSION);
});
test("auto-suggest keeps its original 20–22h window and idempotence", () => {
  const now = 1000,
    deadline = now + 21 * 3600000;
  assert.equal(sync.oddsWindowDue({ deadline }, now), true);
  assert.equal(
    sync.oddsWindowDue({ deadline, oddsAutoSuggestedAt: 1 }, now),
    false,
  );
  assert.equal(
    sync.oddsWindowDue({ deadline: now + 19 * 3600000 }, now),
    false,
  );
});
test("sparse Firebase gameweeks locate by id, never assumed array index", () => {
  assert.equal(sync.gwFirebaseKey({ 7: { id: "g" } }, "g"), "7");
  assert.equal(sync.gwFirebaseKey([{ id: "g" }], "missing"), null);
});
