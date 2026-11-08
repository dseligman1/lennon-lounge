// 2026-11-08: change-only saving. A device sends only what it changed; shared lists are keyed by
// id so two people adding at once can't collide; a player's device only sends player paths.
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  St = require("../storage.js"),
  harness = require("./app-harness.cjs"),
  backup = require("../backups/2026-10-26.json");

const bet = (id, extra = {}) => ({
  id,
  teamId: "henry",
  status: "pending",
  stake: 5,
  effOdds: 2,
  placedAt: 1000,
  legs: [{ type: "match", matchId: "m1", pick: "home", odds: 2 }],
  ...extra,
});

test("a stale device sends only its own change, so it cannot undo someone else's newer change", () => {
  const seen = St.normalise({
    bets: [bet("bet_a")],
    gameweeks: [{ id: "gw1", status: "draft" }],
    chat: [],
  });
  // Elsewhere the house published GW1 and accepted the bet; this device never saw it and adds chat.
  const mine = structuredClone(seen);
  mine.chat.push({ id: "chat_x", by: "henry", text: "hi", at: 5 });
  const out = St.diff(mine, seen);
  assert.deepEqual(Object.keys(out), ["chat/chat_x"]);
});

test("new items land on their own id path, even in an empty list, and deletions are per item", () => {
  const prev = St.normalise({ bets: [], rewards: {}, audit: [] });
  const next = structuredClone(prev);
  next.bets.push(bet("bet_new"));
  next.rewards.henry = [
    { id: "rwd_1", kind: "boost", pct: 10, used: false, grantedAt: 1 },
  ];
  next.audit.push({ id: "aud_1", at: 1, by: "henry", action: "x" });
  assert.deepEqual(Object.keys(St.diff(next, prev)).sort(), [
    "audit/aud_1",
    "bets/bet_new",
    "rewards/henry/rwd_1",
  ]);
  const trimmed = structuredClone(next);
  trimmed.audit = [];
  assert.deepEqual(St.diff(trimmed, next), { "audit/aud_1": null });
});

test("a changed field sends just that field; values Firebase can't hold are dropped", () => {
  const prev = St.normalise({ bets: [bet("bet_a")] });
  const next = structuredClone(prev);
  next.bets[0].status = "cancelled";
  next.bets[0].history = [{ at: 2, action: "cancelled", note: undefined }];
  assert.deepEqual(St.diff(next, prev), {
    "bets/bet_a/status": "cancelled",
    "bets/bet_a/history": [{ at: 2, action: "cancelled" }],
  });
  assert.deepEqual(St.diff(structuredClone(prev), prev), {});
});

test("old list storage is detected and converted to keyed storage in one write; ids are stable", () => {
  const raw = {
    bets: [bet("bet_1"), bet("bet_2", { placedAt: 500 })],
    audit: [{ at: 2 }, { at: 1 }],
    usage: { events: { 0: { at: 1 }, ev_x: { id: "ev_x", at: 2 } } },
    chat: { chat_a: { id: "chat_a", at: 1 } },
  };
  assert.deepEqual(St.legacyPaths(raw).sort(), [
    "audit",
    "bets",
    "usage/events",
  ]);
  const a = St.normalise(structuredClone(raw)),
    b = St.normalise(structuredClone(raw));
  assert.deepEqual(a, b, "the same stored data always gets the same ids");
  assert.deepEqual(
    a.bets.map((x) => x.id),
    ["bet_2", "bet_1"],
    "time order",
  );
  assert.deepEqual(
    a.audit.map((x) => x.id),
    ["aud_L1", "aud_L0"],
  );
  const out = St.diff(a, a, St.legacyPaths(raw));
  assert.deepEqual(Object.keys(out).sort(), ["audit", "bets", "usage/events"]);
  assert.deepEqual(Object.keys(out.bets), ["bet_2", "bet_1"]);
  assert.equal(
    St.legacyPaths({ ...raw, ...out, usage: { events: out["usage/events"] } })
      .length,
    0,
  );
});

test("fresh ids are unique and never reuse a stored position id", () => {
  const ids = new Set(Array.from({ length: 2000 }, () => St.newId("bet")));
  assert.equal(ids.size, 2000);
  const s = St.normalise({ audit: [{ at: 1 }] }, { fresh: true });
  assert.match(s.audit[0].id, /^aud_[0-9a-z]{9,}$/);
});

test("player write paths mirror the database rules", () => {
  for (const p of [
    "bets/bet_1",
    "bets/bet_1/status",
    "chat/chat_1",
    "audit/aud_1",
    "rewardGrants/grant_1",
    "rewards/henry/rwd_1/used",
    "usage/daily/2026-11-08/henry/views",
  ])
    assert.ok(St.playerMayWrite(p, "henry"), p);
  for (const p of [
    "gameweeks/0/status",
    "settings/maxPayout",
    "rewards/kapil/rwd_1",
    "rewards/henry",
    "bets",
    "teams/0/name",
    "seq",
  ])
    assert.ok(!St.playerMayWrite(p, "henry"), p);
});

// The real app code, run as a non-admin player through every common action, must only ever send
// paths a player may write, and never the whole tree.
function playerApp() {
  const h = harness(backup);
  h.run(`render=()=>{};toast=(m,e)=>{lastToast=m;};bosh=()=>{};triggerPhoneAlerts=()=>{};pushNotif=async()=>{};
    sent=[];warned=[];console.warn=(...a)=>warned.push(a.join(' '));
    db.ref=()=>({update:async(u)=>{sent.push(u)},set:async()=>{throw Error('whole-tree set')},once:async()=>({val:()=>null}),on(){},off(){},push:()=>({set:async()=>{}})});
    adoptSnapshot(structuredClone(LennonStorage.toStored(input)));
    S.rewardRules=[{id:'rule_1',name:'Acca',active:true,trigger:{kind:'fold_size',minLegs:1},reward:{kind:'boost',pct:10}}];base=structuredClone(S);
    me=TEAMS.find(t=>t.id==='henry');`);
  return h;
}
test("a player's real actions send only player-writable paths, never the whole tree", async () => {
  const h = playerApp();
  h.run(
    `['vHome','vMyBets','vBuilder','vResults','vStandings','vBetFeed','vInsights','vUserSettings'].forEach(f=>{try{globalThis[f]()}catch(e){}});`,
  );
  await h.run("flush()");
  assert.equal(h.run("sent.length"), 0, "viewing pages writes nothing");
  h.run(`g=S.gameweeks.find(g=>g.matches?.length);g.status='open';g.deadline=Date.now()+86400000;
    m=g.matches.find(m=>m.home!=='henry'&&m.away!=='henry');base=structuredClone(S);
    ok=submitBet({gwId:g.id,legs:[{type:'match',gwId:g.id,matchId:m.id,pick:'home',odds:2,label:'x'}],effOdds:2,stake:5,message:''});
    logUsage('view','home');document.getElementById=()=>({value:'banter',focus(){}});sendChat();`);
  assert.equal(
    h.run("ok"),
    true,
    h.run("typeof lastToast==='undefined'?'':lastToast"),
  );
  await h.run("flush()");
  h.run(`b=S.bets.at(-1);cancelBet(b.id);`);
  await h.run("flush()");
  h.run(
    `o=S.bets.find(x=>x.teamId==='henry'&&x.status==='accepted');o.status='counter_house';o.offer={stake:3,effOdds:2.5,by:'house'};base=structuredClone(S);acceptOffer(o.id)`,
  );
  await h.run("flush()");
  const paths = h.run("sent.flatMap(u=>Object.keys(u))");
  assert.ok(paths.length > 5, paths.join());
  for (const p of paths) {
    assert.ok(p.startsWith("lennon-lounge/"), p);
    assert.ok(
      St.playerMayWrite(p.slice("lennon-lounge/".length), "henry"),
      "not player-writable: " + p,
    );
  }
  assert.equal(
    h.run("warned.join()"),
    "",
    "nothing was held back as house-only",
  );
  for (const k of [
    "bets/",
    "chat/",
    "audit/",
    "rewards/henry/",
    "rewardGrants/",
    "usage/",
  ])
    assert.ok(
      paths.some((p) => p.startsWith("lennon-lounge/" + k)),
      k,
    );
});

test("held-back snapshots can't wipe an unsaved change; the save then brings the device up to date", async () => {
  const h = playerApp();
  h.run(`resynced=0;resyncFromServer=()=>{resynced++};logUsage('view','home');
    newer=structuredClone(LennonStorage.toStored(base));newer.settings.maxPayout=1234;`);
  // A snapshot arrives inside the 300ms save window: it's held, so the usage change survives.
  h.run(`dbListener=null;let cb;db.ref=(p)=>({on:(e,f)=>{if(p===ROOT)cb=f},off(){},update:async(u)=>{sent.push(u)},once:async()=>({val:()=>null})});
    startListener();cb({val:()=>structuredClone(newer)});`);
  assert.equal(h.run("S.usage.events.at(-1).tab"), "home");
  await h.run("flush()");
  const paths = h.run("sent.flatMap(u=>Object.keys(u))");
  assert.ok(
    paths.every((p) => p.startsWith("lennon-lounge/usage/")),
    paths.join(),
  );
  assert.equal(
    h.run("resynced"),
    1,
    "then re-reads to pick up the held snapshot",
  );
});
