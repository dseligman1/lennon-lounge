// 2026-11-07: in-play independent of normal odds, working cutoff picker, late approval and
// free game opening automatically for the next gameweek.
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  G = require("../lounge-games.js"),
  IP = require("../in-play-market.js"),
  harness = require("./app-harness.cjs"),
  base = require("../backups/2026-10-26.json");

function setup() {
  const h = harness(base);
  h.run(`render=()=>{};toast=(m,e)=>{lastToast=m;};me=TEAMS.find(t=>t.admin);S.audit=[];g=gw('gw_74');
    market=(extra={})=>({revision:'r1',status:'published',publishedAt:Date.now()-1000,cutoff:Date.now()+600000,maxCutoff:Date.now()+900000,
      blockedReasons:[],source:{fetchedAt:Date.now(),warnings:[],fixtures:{total:10,finished:1,live:0}},forecast:{teams:{}},
      matches:{[g.matches[1].id]:{id:g.matches[1].id,home:g.matches[1].home,away:g.matches[1].away,odds:{home:2,draw:14,away:1.8},suspended:false}},...extra});`);
  return h;
}

test("in-play is bettable on a week whose normal odds were never published or were pulled back", () => {
  const h = setup();
  h.run("g.status='draft';inPlayState[g.id]={published:market()}");
  assert.equal(h.run("bettableNow(g)"), "inplay");
  assert.ok(h.run("inPlayWeeks().some(x=>x.id===g.id)"));
  assert.equal(
    h.run(
      "inPlayBetError({gwId:g.id,legs:[{type:'match',gwId:g.id,matchId:g.matches[1].id,pick:'home',odds:2,marketRevision:'r1'}],inplay:true})",
    ),
    null,
  );
  h.run(
    "g.status='open';g.deadline=Date.now()+3600000;publicationState[g.id]={status:'withdrawn'}",
  );
  assert.equal(
    h.run("bettableNow(g)"),
    "inplay",
    "normal pull-back leaves in-play live",
  );
  assert.ok(!h.run("publishedGws().some(x=>x.id===g.id)"));
  h.run("g.status='settled'");
  assert.equal(h.run("bettableNow(g)"), null);
});

test("in-play-only weeks hide the normal board but keep settlement-tracked status", () => {
  const h = setup();
  h.run(
    "g.status='open';g.normalOff=true;g.deadline=Date.now()+3600000;inPlayState[g.id]={}",
  );
  assert.equal(h.run("bettableNow(g)"), null);
  assert.ok(!h.run("publishedGws().some(x=>x.id===g.id)"));
  assert.ok(h.run("normalOffCard(g)").includes("IN-PLAY ONLY"));
  assert.ok(h.run("vOddSetter()").includes("IN-PLAY ONLY"));
  h.run("g.status='draft';delete g.normalOff");
  assert.ok(h.run("oddsCard(g,true)").includes("skipNormalOdds"));
});

test("the in-play cutoff picker accepts the date picker's text value and updates a live market", async () => {
  const h = setup();
  h.run(`g.status='open';inPlayState[g.id]={draft:market({status:'draft'}),published:market()};
    db.ref=()=>({transaction:async(fn)=>{const v=fn(structuredClone(inPlayState[g.id]));return {committed:!!v,snapshot:{val:()=>v}};}});
    requireAdmin=()=>true;
    target=Date.now()+5*60000;txt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(target)).replace(' ','T');`);
  await h.run("setInPlayCutoff(g.id, txt)");
  const cutoff = h.run("inPlayState[g.id].published.cutoff"),
    target = h.run("target");
  assert.ok(Math.abs(cutoff - target) < 60000, `${cutoff} vs ${target}`);
  h.run("txt2='1999-01-01T10:00'");
  await h.run("setInPlayCutoff(g.id, txt2)");
  assert.match(h.run("lastToast"), /future cutoff/);
});

test("an in-play bet can be approved after its window closed, but not if placed after the cutoff", () => {
  const g = { id: "g", status: "open" },
    leg = { marketRevision: "r1", odds: 2, marketCutoff: 1000 };
  assert.equal(IP.acceptError({ placedAt: 900, legs: [leg] }, g), null);
  assert.match(
    IP.acceptError({ placedAt: 9000, legs: [leg] }, g),
    /after the in-play cutoff/,
  );
  assert.match(
    IP.acceptError({ placedAt: 900, legs: [leg] }, { status: "settled" }),
    /settled/,
  );
});

test("the free game opens for the next unstarted gameweek only, whether or not odds are published", () => {
  const now = 1800000000000,
    state = {
      fpl: {
        events: {
          10: { deadline: now - 1000 },
          11: { deadline: now + 86400000 },
          12: { deadline: now + 7 * 86400000 },
        },
      },
      gameweeks: [10, 11, 12].map((event) => ({
        id: "gw" + event,
        name: "GW " + event,
        event,
        status: event === 10 ? "open" : "draft",
        deadline: now + event * 1000,
        matches: [{ id: "m" + event, home: "a", away: "b" }],
      })),
    };
  const r = G.nextRound(state, { 10: { event: 10 } }, now);
  assert.equal(r.event, 11, "GW10 has started, GW12 waits its turn");
  assert.equal(r.cutoff, now + 11000);
  assert.equal(
    G.nextRound(state, { 11: { event: 11 } }, now),
    null,
    "already open",
  );
  assert.equal(
    G.nextRound(state, {}, now, (id) => id === "gw11"),
    null,
    "paused while withdrawn",
  );
});

// 2026-11-08 sweep: a draft cutoff picked before publishing must survive unrelated live updates.
test("a picked draft cutoff survives a live in-play update for the same draft", () => {
  const h = setup();
  h.run(`stopInPlayListener();let ipCb;db.ref=()=>({on:(e,cb)=>(ipCb=cb),off(){},once:async()=>({val:()=>null})});
    startInPlayListener();rec={draft:market({status:'draft'})};ipCb({val:()=>structuredClone({[g.id]:rec})});
    requireAdmin=()=>true;picked=Date.now()+4*60000;`);
  h.run("setInPlayCutoff(g.id, picked)");
  h.run(
    "ipCb({val:()=>structuredClone({[g.id]:{...rec,request:{status:'ready'}}})})",
  );
  assert.equal(h.run("inPlayState[g.id].draft.cutoff"), h.run("picked"));
  h.run(
    "ipCb({val:()=>structuredClone({[g.id]:{draft:market({status:'draft',revision:'r2'})}})})",
  );
  assert.notEqual(
    h.run("inPlayState[g.id].draft.cutoff"),
    h.run("picked"),
    "a new draft keeps its own cutoff",
  );
});

// 2026-11-08 sweep: extending a live cutoff keeps the revision, so a leg added earlier carried the
// old cutoff and the bet could never be approved.
test("placing an in-play bet records the market's current cutoff, so an extended cutoff can still be approved", async () => {
  const h = setup();
  h.run(`me=TEAMS.find(t=>!t.admin&&!g.matches[1].home.includes(t.id)&&g.matches[1].home!==t.id&&g.matches[1].away!==t.id)||TEAMS[1];
    g.status='open';const ext=market({cutoff:Date.now()+600000});inPlayState[g.id]={published:ext};
    db.ref=()=>({once:async()=>({val:()=>structuredClone({published:ext})}),set:async()=>{},update:async()=>{},push:()=>({set:async()=>{}}),on(){},off(){}});
    slip=[{type:'match',gwId:g.id,matchId:g.matches[1].id,pick:'home',odds:2,marketRevision:'r1',marketCutoff:Date.now()-60000,label:'x'}];
    document.getElementById=(id)=>id==='stakeInput'?{value:'5'}:id==='betMsg'?{value:''}:document.createElement('div');before=S.bets.length;`);
  await h.run("placeBet()");
  assert.equal(
    h.run("S.bets.length"),
    h.run("before") + 1,
    h.run("typeof lastToast==='undefined'?'':lastToast"),
  );
  assert.equal(
    h.run("S.bets.at(-1).legs[0].marketCutoff"),
    h.run("inPlayState[g.id].published.cutoff"),
  );
  assert.equal(h.run("LennonInPlay.acceptError(S.bets.at(-1),g)"), null);
});
