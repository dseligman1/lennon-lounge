const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  harness = require("./app-harness.cjs");
const state = JSON.parse(fs.readFileSync(require.resolve("../backups/2026-10-26.json")));

// One open gameweek with a future cutoff, and a mate's 2-leg bet placed at old prices: one leg on
// someone else's match, one against the viewer's own team.
function setup() {
  const h = harness(state);
  h.run(`
    G=S.gameweeks.find(g=>g.matches.filter(m=>m.home&&m.away).length>=3);
    G.status='open'; delete G.normalOff; G.deadline=Date.now()+86400000;
    S.gameweeks.forEach(g=>{ if(g!==G && g.status==='open') g.status='settled'; });
    OWN=G.matches.find(m=>m.home===me.id||m.away===me.id);
    OTHER=G.matches.find(m=>m.home&&m.away&&m.home!==me.id&&m.away!==me.id);
    MATE=S.teams.find(t=>t.id!==me.id&&OWN&&t.id!==OWN.home&&t.id!==OWN.away).id;
    against=OWN.home===me.id?'away':'home';
    S.bets.push({id:'mate1',teamId:MATE,gwId:G.id,status:'accepted',stake:5,effOdds:9,placedAt:Date.now()-60000,inplay:false,
      legs:[{type:'match',gwId:G.id,matchId:OTHER.id,pick:'home',odds:9.99,label:'old'},{type:'match',gwId:G.id,matchId:OWN.id,pick:against,odds:9.99,label:'old'}]});
  `);
  return h;
}

test("copy a mate's bet: today's prices, never a leg against your own team", () => {
  const h = setup();
  const legs = h.run("pwCopyLegs(getBet('mate1'))");
  assert.equal(legs.length, 1, "the leg against the viewer's own team is left out");
  assert.equal(legs[0].matchId, h.run("OTHER.id"));
  assert.equal(legs[0].odds, h.run("pwPrice(G,OTHER,'home')"), "re-priced from the board, not the mate's 9.99");
  assert.notEqual(legs[0].odds, 9.99);
  h.run("window.scrollTo=()=>{}; globalThis.scrollTo=()=>{}");
  h.run("pwCopyBet('mate1')");
  assert.equal(h.run("slip.length"), 1);
  assert.equal(h.run("slipDuplicateOf"), "mate1");
});

test("nothing to copy once betting has closed", () => {
  const h = setup();
  h.run("G.deadline=Date.now()-1000");
  assert.equal(h.run("pwCopyLegs(getBet('mate1')).length"), 0);
});

test("Home shows the 3-step week, copy cards, quick-bet prices with backed counts", () => {
  const h = setup();
  const html = h.run("vHome()");
  for (const s of ["Free £50 Score Shot", "Get a bet on", "Follow it live", "Copy a mate's bet", "Quick bet", "⚽ Build a bet", "The Lounge"]) assert.ok(html.includes(s), s);
  assert.ok(html.includes("👥 1"), "a backed count on the mate's pick");
  assert.ok(!html.includes("NaN"));
  h.run("pwLoungeTab='me'");
  assert.ok(h.run("vHome()").includes("Potential winnings"), "P&L breakdown kept under Me");
});

test("Bet Builder: coupon tabs, own-team lock kept, In-Play falls back to the classic page", () => {
  const h = setup();
  const html = h.run("vBuilder()");
  assert.ok(html.includes("⚽ Matches") && html.includes("🎰 The Algo") && html.includes("📝 Ask the house"));
  assert.ok(html.includes("🔒"), "own-team lock still shown");
  for (const t of ["algo", "ask", "more"]) assert.equal(typeof h.run(`pwCoupon='${t}';vBuilder()`), "string");
  h.run("builderSec='inplay'");
  assert.equal(h.run("vBuilder()"), h.run("vBuilderClassic()"));
});
