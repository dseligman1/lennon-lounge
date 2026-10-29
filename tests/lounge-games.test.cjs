const { test } = require("node:test"),
  assert = require("node:assert/strict");
const G = require("../lounge-games.js"),
  harness = require("./app-harness.cjs");
const base = require("../backups/2026-10-26.json");
const now = 1800000000000;
function fixture() {
  const state = {
    fpl: { events: { 9: { deadline: now + 60000 } }, plFixtures: {} },
  };
  const g = {
    id: "gw_1",
    name: "GW 9",
    event: 9,
    status: "open",
    deadline: now + 120000,
    matches: [{ id: "m_1", home: "home", away: "away" }],
  };
  return { state, g, round: G.makeRound(state, g, now) };
}
const entry = (homePts = 47, awayPts = 39) => ({
  matchId: "m_1",
  homePts,
  awayPts,
  enteredAt: now + 1000,
});
const official = (finished = true) => [
  {
    event: 9,
    league_entry_1: 2,
    league_entry_2: 1,
    league_entry_1_points: 39,
    league_entry_2_points: 47,
    finished,
  },
];
test("publishing creates a £50-per-winner round capped at the official deadline", () => {
  const { state, g, round } = fixture();
  assert.equal(round.cutoff, now + 60000);
  assert.equal(round.prizePence, 5000);
  assert.equal(round.prizeMode, "each");
  assert.equal(G.makeRound(state, { ...g, status: "draft" }, now), null);
  assert.equal(G.makeRound(state, g, round.cutoff), null);
  assert.equal(G.makeRound({ fpl: {} }, g, now), null);
});
test("one locked entry, only a listed fixture, whole scores, and strict deadline", () => {
  const { round } = fixture();
  assert.equal(G.entryError(round, entry(), null, now + 1), null);
  assert.match(G.entryError(round, entry(), entry(), now + 1), /already/);
  assert.match(G.entryError(round, entry(), null, round.cutoff), /closed/);
  assert.match(
    G.entryError(round, { ...entry(), matchId: "other" }, null, now + 1),
    /fixture/,
  );
  for (const invalid of [NaN, Infinity, 1.5, "47", -101, 1000])
    assert.match(G.entryError(round, entry(invalid), null, now + 1), /whole/);
  assert.equal(G.entryError(round, entry(0, -1), null, now + 1), null);
});
test("official completion is required and exact scores respect fixture orientation", () => {
  const { round } = fixture(),
    map = { 1: "home", 2: "away" };
  assert.equal(
    G.settleRound(round, { p: entry() }, official(false), map, now + 120000),
    null,
  );
  assert.equal(
    G.settleRound(round, { p: entry() }, official(), map, now),
    null,
  );
  const result = G.settleRound(
    round,
    { p: entry(), q: entry(), r: entry(39, 47), s: entry(46, 39) },
    official(),
    map,
    now + 120000,
  );
  assert.equal(result.winnerCount, 2);
  assert.equal(result.totalPrizePence, 10000);
  assert.equal(result.outcomes.p.amountPence, 5000);
  assert.equal(result.outcomes.q.amountPence, 5000);
  assert.equal(result.outcomes.r.won, false);
  assert.equal(result.outcomes.s.won, false);
});
test("no missing, late or malformed entry can become a winner", () => {
  const { round } = fixture();
  const result = G.settleRound(
    round,
    {
      late: { ...entry(), enteredAt: round.cutoff },
      missing: { ...entry(), enteredAt: undefined },
      early: { ...entry(), enteredAt: now - 1 },
      wrong: { ...entry(), matchId: "missing" },
    },
    official(),
    { 1: "home", 2: "away" },
    now + 120000,
  );
  assert.equal(result.winnerCount, 0);
  assert.equal(result.totalPrizePence, 0);
});
test("a new event gives a fresh round without carrying last week’s entry", () => {
  const { state, g, round } = fixture();
  state.fpl.events[10] = { deadline: now + 86400000 };
  const next = G.makeRound(
    state,
    { ...g, event: 10, deadline: now + 86400000 },
    now + 120000,
  );
  assert.equal(next.event, 10);
  assert.equal(G.entryError(next, entry(), null, now + 120001), null);
  assert.match(G.entryError(round, entry(), entry(), now + 120001), /already/);
});
test("timeline retains score swings, suppresses unreconciled probabilities and bounds history", () => {
  const current = {
    source: { fetchedAt: now },
    matches: {
      m: {
        home: "h",
        away: "a",
        currentHome: 2,
        currentAway: 3,
        probabilities: { home: 0.4, away: 0.55 },
      },
    },
  };
  const first = G.appendTimeline([], current);
  assert.equal(first.length, 1);
  assert.equal(G.appendTimeline(first, current).length, 1);
  current.source.fetchedAt++;
  current.matches.m.currentHome = 8;
  const changed = G.appendTimeline(first, current);
  assert.equal(changed.length, 2);
  assert.equal(first[0].matches.m.homePts, 2);
  current.reconciled = false;
  assert.equal(
    G.appendTimeline(changed, current).at(-1).matches.m.homeChance,
    null,
  );
  assert.equal(
    G.appendTimeline(
      Array.from({ length: 144 }, () => first[0]),
      current,
    ).length,
    144,
  );
});
test("homepage covers loading, open, locked, closed and winner states, retaining the chosen inputs", () => {
  const h = harness(base);
  assert.match(h.run("scoreGameHome()"), /Checking your free entry/);
  h.run(
    "scoreReady=true; S.fpl.events[9].deadline=Date.now()+3600000; const game=S.gameweeks[8]; game.status='open';game.deadline=Date.now()+3600000;game.kickoff=Date.now()+7200000; S.fpl.plFixtures[9]=[]; scoreRounds[9]=LennonGames.makeRound(S,game,Date.now());scoreEntryReady[9]=true;",
  );
  assert.match(h.run("scoreGameHome()"), /Lock my free prediction/);
  h.run(
    "scoreDraft(9).homePts='47';scoreDraft(9).awayPts='39';scoreDraft(9).matchId=S.gameweeks[8].matches[0].id;",
  );
  assert.match(h.run("scoreGameHome()"), /value="47"/);
  h.run(
    "scoreEntries[9]={matchId:S.gameweeks[8].matches[0].id,homePts:47,awayPts:39,enteredAt:Date.now()}",
  );
  assert.match(h.run("scoreGameHome()"), /YOUR PREDICTION IS LOCKED/);
  assert.doesNotMatch(h.run("scoreGameHome()"), /Lock my free prediction/);
  h.run(
    "scoreResults[9]={event:9,outcomes:{[me.id]:{won:true,amountPence:5000}},scores:{[S.gameweeks[8].matches[0].id]:{homePts:47,awayPts:39}}}",
  );
  assert.match(h.run("scoreGameHome()"), /You won £50.00/);
  h.run("scoreEntries[9]=null;scoreRounds[9].cutoff=Date.now()-1");
  assert.match(h.run("scoreGameHome()"), /CLOSED/);
});
test("matchday renders all six matches and gives the viewer’s fixture priority", () => {
  const h = harness(base);
  h.run("matchdayEvent=8; matchdayRecord={};");
  const html = h.run("vMatchday()");
  assert.equal((html.match(/<article /g) || []).length, 6);
  assert.match(
    html.slice(html.indexOf("<article "), html.indexOf("</article>")),
    /YOUR MATCHUP/,
  );
  assert.match(html, /Waiting for the first matchday score update/);
  assert.doesNotMatch(html, /NaN/);
});
