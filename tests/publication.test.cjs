const { test } = require("node:test"),
  assert = require("node:assert/strict");
const harness = require("./app-harness.cjs"),
  base = require("../backups/2026-10-26.json");
const IP = require("../in-play-market.js");
function setup() {
  const h = harness(base);
  h.run(`render=()=>{};toast=()=>{};me=TEAMS.find(t=>t.admin);S.audit=[];g=gw('gw_74');g.status='open';g.deadline=Date.now()+3600000;g.oddsReleasedAt=Date.now();
    scoreRounds[8]={event:8,gwId:g.id,name:'GW 8',prizePence:5000,cutoff:g.deadline,fixtures:{[g.matches[0].id]:{home:g.matches[0].home,away:g.matches[0].away}}};
    scoreEntries[8]={matchId:g.matches[0].id,homePts:47,awayPts:39,enteredAt:Date.now()};scoreReady=true;scoreEntryReady[8]=true;`);
  return h;
}
test("free predictions appear once in My Bets as accepted, then won/lost; payouts stay accurately labelled", () => {
  const h = setup(),
    before = h.run("JSON.stringify(S.bets)");
  h.run("myBetsSec='active'");
  let html = h.run("vMyBets()");
  assert.ok(
    html.includes("£50 Score Shot") &&
      html.includes("Accepted ✓") &&
      html.includes("£0.00"),
  );
  assert.ok(!h.run("scoreBetCard(scoreBets()[0])").includes("cancelBet"));
  h.run("scoreRounds[8].cutoff=1;publicationState[g.id]={status:'withdrawn'}");
  assert.equal(h.run("scoreBets()[0].status"), "accepted");
  h.run(
    "scoreResults[8]={scores:{[scoreEntries[8].matchId]:{homePts:47,awayPts:39}},outcomes:{[me.id]:{won:true,amountPence:5000}}};myBetsSec='won'",
  );
  html = h.run("vMyBets()");
  assert.ok(
    html.includes("WON 🎉") &&
      html.includes("£50.00") &&
      html.includes("Awaiting payout"),
  );
  h.run("scorePaid[8]={[me.id]:{paidAt:Date.now()}}");
  assert.ok(h.run("vMyBets()").includes("<b>Paid</b>"));
  h.run(
    "scoreResults[8].outcomes[me.id]={won:false,amountPence:0};myBetsSec='lost'",
  );
  assert.ok(h.run("vMyBets()").includes("£50 Score Shot"));
  assert.equal(h.run("JSON.stringify(S.bets)"), before);
});
test("normal withdrawal atomically closes publication, preserves bets/entries, hides markets and can be re-released", async () => {
  const h = setup();
  h.run(`S.promos=[{gwId:g.id,active:true}];slip=[{gwId:g.id}];slipBundles=[{gwId:g.id}];
    savedBets=JSON.stringify(S.bets);savedEntries=JSON.stringify(scoreEntries);
    db.ref=path=>({once:async()=>({val:()=>null}),update:async value=>{updates=value}});`);
  await h.run("withdrawOdds(g.id)");
  assert.equal(h.run("gw('gw_74').status"), "draft");
  assert.equal(h.run('updates[PUBLICATION_ROOT+"/gw_74"].status'), "withdrawn");
  assert.equal(
    h.run('Object.keys(updates).some(k=>k===ROOT||k.startsWith(ROOT+"/bets"))'),
    false,
  );
  assert.equal(
    h.run(
      "JSON.stringify(S.bets)===savedBets&&JSON.stringify(scoreEntries)===savedEntries",
    ),
    true,
  );
  assert.equal(h.run("S.promos[0].active"), false);
  assert.equal(h.run("slip.length+slipBundles.length"), 0);
  assert.equal(h.run('bettableNow(gw("gw_74"))'), null);
  h.run("gw('gw_74').status='open'"); // A stale tab cannot resurrect it.
  assert.equal(h.run('bettableNow(gw("gw_74"))'), null);
  assert.equal(h.run('inPlayPublished("gw_74")'), null);
  assert.equal(h.run("oddsReleaseBanner()"), "");
  await h.run("savePublishedGw(gw('gw_74'))");
  assert.equal(h.run('bettableNow(gw("gw_74"))'), "pre");
  assert.equal(h.run("scoreBets().length"), 1);
  assert.equal(h.run("scoreBets()[0].status"), "accepted");
});
test("in-play pullback returns prices to draft and invalidates old selections after republishing", () => {
  const now = Date.now(),
    d = {
      revision: "old",
      status: "published",
      cutoff: now + 10000,
      maxCutoff: now + 20000,
      source: { fetchedAt: now },
      matches: { m: { suspended: false, odds: { home: 2 } } },
    };
  const before = structuredClone(d),
    r = IP.withdrawRecord({ published: d }, now, "selig");
  assert.equal(r.published, null);
  assert.equal(r.request, null);
  assert.equal(r.draft.status, "draft");
  assert.deepEqual(r.draft.matches, d.matches);
  assert.deepEqual(d, before);
  const next = IP.publishRecord(r.draft, r.draft.cutoff, now + 1, "selig");
  assert.match(
    IP.legError(
      next,
      {
        type: "match",
        matchId: "m",
        pick: "home",
        odds: 2,
        marketRevision: "old",
      },
      now + 1,
    ),
    /changed/,
  );
});
test("draft gameweeks expose in-play generation and cutoff before the first run", () => {
  const h = setup();
  h.run("g.status='draft'");
  const html = h.run("inPlayAdminCard(g)");
  assert.ok(html.includes("Gameweek cutoff:"));
  assert.ok(html.includes("requestInPlay('gw_74')"));
  assert.ok(!html.includes("Publish these in-play odds"));
});

test("pre-start in-play selections retain their revision and in-play acceptance checks", () => {
  const h = setup();
  h.run(`bosh=()=>{};triggerPhoneAlerts=()=>{};logUsage=()=>{};
    m=g.matches.find(m=>m.home!==me.id&&m.away!==me.id);
    inPlayState[g.id]={published:{revision:'pre1',status:'published',publishedAt:Date.now(),cutoff:Date.now()+60000,matches:{[m.id]:{odds:{home:2},suspended:false}}}};
    chosenLeg={type:'match',gwId:g.id,matchId:m.id,pick:'home',odds:2,marketRevision:'pre1'};`);
  assert.equal(
    h.run("submitBet({gwId:g.id,legs:[chosenLeg],effOdds:2,stake:10})"),
    true,
  );
  assert.equal(h.run("S.bets.at(-1).inplay"), true);
  assert.equal(h.run("S.bets.at(-1).status"), "pending");
});

test("all withdrawn gameweeks remain reviewable, including later drafts", () => {
  const h = setup();
  h.run(
    "S.gameweeks.forEach(g=>{g.status='draft';publicationState[g.id]={status:'withdrawn'}})",
  );
  const html = h.run("vOddSetter()");
  for (const id of h.run("S.gameweeks.map(g=>g.id)"))
    assert.ok(html.includes(`publishGw('${id}')`));
});
