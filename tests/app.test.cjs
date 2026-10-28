const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  harness = require("./app-harness.cjs");
const state = JSON.parse(
  fs.readFileSync(require.resolve("../backups/2026-10-26.json")),
);
test("all major admin/player views and both posters render against the real backup without writes", () => {
  const h = harness(state);
  for (const fn of [
    "vHome",
    "vBuilder",
    "vMyBets",
    "vResults",
    "vStandings",
    "vInsights",
    "vUserSettings",
    "vReview",
    "vLoader",
    "vOddSetter",
    "vSettler",
    "vPromos",
    "vOffice",
  ]) {
    const html = h.run(`${fn}()`);
    assert.equal(typeof html, "string", fn);
    assert.ok(!html.includes("NaN"), fn + " contains NaN");
  }
  for (const edition of ["Odds", "Recap"]) {
    const html = h.run(
      `poster${edition}Html(S.gameweeks[${edition === "Odds" ? 7 : 6}])`,
    );
    assert.ok(html.includes("pst-"));
    assert.ok(!html.includes("NaN"));
  }
});
test("why explanations expose team and every owned player score plus defined confidence", () => {
  const h = harness(state),
    why = h.run(
      "matchPricingRationale(S,S.gameweeks[8].id,S.gameweeks[8].matches[0].id)",
    );
  assert.equal(why.home.players.length, 15);
  assert.equal(why.away.players.length, 15);
  assert.ok(why.bullets[0].includes("±10"));
  assert.ok(
    h
      .run("forecastTable(modelForecast(S,9).teams.selig)")
      .includes("Confidence ±2"),
  );
});
test("published forecast stays fixed after source data refresh", () => {
  const h = harness(state);
  h.run(
    "S.gameweeks[8].status='open'; S.gameweeks[8].forecast=LennonModel.snapshot(modelForecast(S,9))",
  );
  const a = h.run(
    "matchPricingRationale(S,S.gameweeks[8].id,S.gameweeks[8].matches[0].id).projHome",
  );
  h.run("S.fpl.players={}; S.fpl.squadSync++");
  const b = h.run(
    "matchPricingRationale(S,S.gameweeks[8].id,S.gameweeks[8].matches[0].id).projHome",
  );
  assert.equal(a, b);
});
