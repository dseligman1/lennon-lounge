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

test("pre-gameweek previews match every normal price, including manual odds, boosts and promos, without live picks", async () => {
  const { s, g, now, fetch } = source();
  g.status = "draft";
  g.deadline = now + 7200000;
  g.matches[0].odds.home = 3.275;
  g.matches[1].boostSide = "draw";
  g.favBoostTeamId = g.matches[2].away;
  s.promos = [
    {
      active: true,
      gwId: g.id,
      matchId: g.matches[3].id,
      pick: "home",
      odds: 5.43,
    },
  ];
  const before = structuredClone(s),
    urls = [];
  const d = await generate(
    s,
    g,
    { id: "pre" },
    async (url) => {
      urls.push(url);
      assert.ok(
        url.endsWith("bootstrap-static"),
        "previews must not depend on unpublished event picks or live scores",
      );
      const boot = await fetch(url);
      boot.events.data[0].deadline_time = new Date(now + 3600000).toISOString();
      return boot;
    },
    () => now,
  );
  assert.equal(urls.length, 1);
  assert.equal(d.preStart, true);
  assert.equal(d.cutoff, now + 3600000);
  assert.equal(d.maxCutoff, d.cutoff);
  const h = require("./app-harness.cjs")(s);
  h.ctx.gid = g.id;
  for (const m of g.matches)
    for (const pick of ["home", "draw", "away"]) {
      h.ctx.mid = m.id;
      h.ctx.pick = pick;
      const boardPrice = h.run(
        "promoPrice(gid,mid,pick) ?? weekBoostPrice(gw(gid),gw(gid).matches.find(m=>m.id===mid),pick) ?? gw(gid).matches.find(m=>m.id===mid).odds[pick]",
      );
      assert.equal(d.matches[m.id].odds[pick], boardPrice);
      assert.equal(d.originalOdds[m.id][pick], boardPrice);
    }
  assert.ok(
    Object.values(d.matches).every(
      (m) => m.currentHome === 0 && m.currentAway === 0,
    ),
  );
  assert.deepEqual(s, before);
  const IP = require("../in-play-market.js");
  assert.match(IP.baselineError(d, s, g, now), /Publish the normal/);
  g.status = "open";
  assert.equal(IP.baselineError(d, s, g, now), null);
  g.deadline = now + 30000;
  assert.match(IP.baselineError(d, s, g, now), /cutoff changed/);
  g.deadline = now + 7200000;
  g.matches[0].odds.home++;
  assert.match(IP.baselineError(d, s, g, now), /changed/);
  assert.ok(IP.publishError(d, d.cutoff, d.startsAt));
});
