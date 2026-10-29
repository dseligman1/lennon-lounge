const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { generate } = require("../scripts/in-play.cjs"),
  base = require("../backups/2026-10-26.json");
const source = require("./fixtures/in-play-source.cjs");

test("in-play workflow generates reviewable active-game draft with current scores and bounded cutoff", async () => {
  const { s, g, now, fetch } = source(),
    before = structuredClone(s),
    d = await generate(s, g, { id: "r1" }, fetch, () => now);
  assert.equal(d.status, "draft");
  assert.equal(d.source.publicationLagMs, null);
  assert.equal(d.maxCutoff, now + 120000);
  assert.deepEqual(d.blockedReasons, []);
  assert.equal(Object.values(d.matches)[0].currentHome, 22);
  assert.equal(Object.keys(d.forecast.teams).length, 12);
  assert.deepEqual(s, before);
});
test("inconsistent official and player scores block publication", async () => {
  const { s, g, now, fetch } = source(true),
    d = await generate(s, g, { id: "r1" }, fetch, () => now);
  assert.ok(d.blockedReasons.some((x) => x.includes("disagrees")));
});
