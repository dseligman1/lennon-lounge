// Offline end-to-end check of the autopilot's browser actions (2026-11-27).
// Runs the real app (local files) in headless Chrome against an in-memory copy of a backup:
// Firebase is replaced by a tiny fake, so nothing reaches production. Proves that
// scripts/house-browser.cjs can log in as the house, publish a gameweek at the model's odds,
// settle a finished gameweek, and capture both posters.
//   node scripts/autopilot-browser-check.cjs [backup.json] [publishEvent] [settleEvent]
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const House = require("./house-browser.cjs");

const root = path.join(__dirname, "..");
// Default: the 16 Nov backup, where GW10 had all final scores but was still open.
const backup = process.argv[2] || path.join(root, "backups/2026-11-16.json");
const publishEv = Number(process.argv[3] || 12);
const settleEv = Number(process.argv[4] || 10);
const out = path.join(root, "../outputs/2026-11-27-autopilot-check");

const FAKE_FIREBASE = `(function(){
  const data = window.__SEED__ || {}; const writes = window.__WRITES__ = [];
  const listeners = []; let n = 0;
  const split = p => String(p||'').split('/').filter(Boolean);
  const get = p => split(p).reduce((o,k)=>o==null?undefined:o[k], data);
  const clone = v => v===undefined?null:JSON.parse(JSON.stringify(v));
  const sv = v => { if(v&&typeof v==='object'){ if(v['.sv']==='timestamp') return Date.now(); const o=Array.isArray(v)?[]:{}; for(const k in v) o[k]=sv(v[k]); return o; } return v; };
  const setAt = (p,v) => { const ks=split(p); let o=data; for(const k of ks.slice(0,-1)){ if(o[k]==null||typeof o[k]!=='object') o[k]={}; o=o[k]; } if(v==null) delete o[ks.at(-1)]; else o[ks.at(-1)]=v; };
  const snap = (p,v) => ({ val:()=>clone(v), exists:()=>v!=null, key:split(p).at(-1)||null });
  const related = (a,b) => a===b||a.startsWith(b+'/')||b.startsWith(a+'/')||!a||!b;
  const notify = ps => listeners.forEach(l => { if(ps.some(p=>related(p,l.path))) setTimeout(()=>l.cb(snap(l.path,get(l.path))),0); });
  function ref(p){ const path=split(p).join('/');
    const r = { key: split(path).at(-1)||null, child: c=>ref(path+'/'+c),
      on(ev,cb){ if(path==='.info/connected'){ setTimeout(()=>cb(snap(path,true)),0); return cb; } listeners.push({path,cb}); setTimeout(()=>cb(snap(path,get(path))),0); return cb; },
      off(ev,cb){ for(let i=listeners.length-1;i>=0;i--) if(listeners[i].path===path&&(!cb||listeners[i].cb===cb)) listeners.splice(i,1); },
      once: async()=>snap(path, path==='.info/connected'?true:get(path)),
      set: async v=>{ v=sv(clone(v)); writes.push({op:'set',path}); setAt(path,v); notify([path]); },
      update: async o=>{ const ps=[]; for(const [k,v] of Object.entries(o)){ const q=split(path+'/'+k).join('/'); writes.push({op:'update',path:q}); setAt(q,sv(clone(v))); ps.push(q); } notify(ps); },
      remove: async()=>{ writes.push({op:'remove',path}); setAt(path,null); notify([path]); },
      push(v){ const c=ref(path+'/-k'+Date.now()+(n++)); if(v!==undefined) c.set(v); return c; },
      transaction: async fn=>{ const cur=clone(get(path)); const nv=fn(cur); if(nv===undefined) return {committed:false,snapshot:snap(path,cur)}; const v=sv(clone(nv)); writes.push({op:'tx',path}); setAt(path,v); notify([path]); return {committed:true,snapshot:snap(path,v)}; },
      limitToLast(k){ return { on:r.on, off:r.off, once: async()=>{ const v=get(path)||{}; const o={}; Object.keys(v).sort().slice(-k).forEach(x=>o[x]=v[x]); return snap(path,Object.keys(o).length?o:null); } }; } };
    return r; }
  const user = { uid: 'house-bot-test' };
  window.firebase = { initializeApp(){}, database: Object.assign(()=>({ref}), {ServerValue:{TIMESTAMP:{'.sv':'timestamp'}}}),
    auth: ()=>({ currentUser:user, onAuthStateChanged(cb){ setTimeout(()=>cb(user),0); return ()=>{}; }, signInAnonymously: async()=>({user}) }) };
})();`;

function seed() {
  const state = JSON.parse(fs.readFileSync(backup, "utf8"));
  const inputsPath = path.join(root, "../data/2026-10-28-model-inputs.json");
  if (fs.existsSync(inputsPath) && !state.fpl.playerHistory) {
    const inputs = JSON.parse(fs.readFileSync(inputsPath, "utf8"));
    Object.assign(state.fpl, { playerHistory: inputs.playerHistory, modelData: inputs.modelData, plFixtures: inputs.plFixtures });
  }
  // Two test bets on the gameweek being settled: one accepted (must be graded), one never
  // reviewed (must expire), so settlement is exercised even on a quiet week.
  const g = Object.values(state.gameweeks).find((x) => x && Number(x.event) === settleEv);
  const m = Object.values(g.matches).find((x) => x && x.home);
  const leg = { type: "match", gwId: g.id, matchId: m.id, pick: "home", odds: 2, label: "test leg" };
  const bet = (id, status) => ({ id, teamId: "henry", gwId: g.id, status, stake: 5, effOdds: 2, legs: [leg], placedAt: g.deadline - 3600000, inplay: false });
  state.bets = { ...state.bets, bet_check_a: bet("bet_check_a", "accepted"), bet_check_p: bet("bet_check_p", "pending") };
  return { "lennon-lounge": state, "lennon-lounge-auth": { selig: "424242", rowez: "434343" } };
}

async function prepare(page) {
  let html = fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .replace(/<script src="https:\/\/www.gstatic.com[^>]+><\/script>/g, "");
  html = html.replace("<head>", "<head><script>" + `window.__SEED__=${JSON.stringify(seed())};` + FAKE_FIREBASE + "</script>");
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "lennon.test") {
      const name = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
      const type = name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html";
      return route.fulfill({ status: 200, contentType: type, body: name === "index.html" ? html : fs.readFileSync(path.join(root, name)) });
    }
    // Poster libraries and fonts only; nothing else (and never Firebase) leaves the machine.
    if (["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"].includes(u.hostname)) return route.continue();
    return route.abort();
  });
}

// SCREENS=1: phone-width screenshots of every autopilot screen, with an illustrative bet
// tracker (synthetic bets and live scores on the published gameweek's real fixtures).
async function phoneScreens(page, pub, set) {
  const Core = require("./autopilot-core.cjs");
  const st = await page.evaluate((id) => ({ g: gw(id), teams: S.teams }), pub.gwId);
  const ms = st.g.matches.filter((m) => m.home && m.away);
  const scores = [[48, 31], [22, 37], [41, 40], [55, 29], [30, 30], [19, 44]];
  const snap = { matches: {}, teams: {} };
  ms.forEach((m, i) => {
    const [h, a] = scores[i % scores.length];
    const lead = h > a ? 0.78 : h < a ? 0.2 : 0.45;
    snap.matches[m.id] = { id: m.id, home: m.home, away: m.away, currentHome: h, currentAway: a, probabilities: { home: lead, draw: 0.03, away: 0.97 - lead } };
    snap.teams[m.home] = { remainingPlayers: i < 2 ? 0 : 4 };
    snap.teams[m.away] = { remainingPlayers: i < 2 ? 0 : 3 };
  });
  const nm = (id) => st.teams.find((t) => t.id === id).name;
  const leg = (m, pick) => ({ type: "match", matchId: m.id, pick, label: pick === "draw" ? `Draw — ${nm(m.home)} v ${nm(m.away)}` : `${nm(m[pick])} to WIN v ${nm(m[pick === "home" ? "away" : "home"])}` });
  const bets = [
    { teamId: "henry", gwId: st.g.id, status: "accepted", stake: 10, effOdds: 3.61, legs: [leg(ms[0], "home"), leg(ms[3], "home")] },
    { teamId: "fride", gwId: st.g.id, status: "accepted", stake: 5, effOdds: 6.9, legs: [leg(ms[1], "home"), leg(ms[2], "home"), leg(ms[5], "away")] },
    { teamId: "kapil", gwId: st.g.id, status: "accepted", stake: 2, effOdds: 13.5, legs: [leg(ms[4], "draw")] },
  ];
  const text = Core.trendText({ g: st.g, bets, teams: st.teams, snap, update: { index: 0, finished: 5, total: 10 }, link: "https://dseligman1.github.io/lennon-lounge/?from=gw12-up1-wa" });
  fs.writeFileSync(path.join(out, "sample-bet-tracker.txt"), text);
  const now = Date.now();
  await page.setViewportSize({ width: 390, height: 844 });
  // Show what an iPhone shows: headless Chrome can't share files, a phone can.
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async () => {};
    const t = document.getElementById("toast");
    if (t) t.style.visibility = "hidden";
  });
  await page.evaluate(({ text, odds, recap, now, oddsName, recapName }) => {
    __SEED__["lennon-lounge-autopilot"] = {
      config: { enabled: true },
      status: { checkedAt: now - 4 * 60000, active: true, nextCheckAt: now + 6 * 60000, notes: [] },
      outbox: {
        "odds-1": { id: "odds-1", kind: "odds", title: oddsName + " odds poster", caption: odds.caption, hasImage: true, createdAt: now - 26 * 3600000, sentAt: now - 25.9 * 3600000 },
        "trend-1": { id: "trend-1", kind: "trend", title: oddsName + " bet tracker 1", caption: text, hasImage: false, createdAt: now - 3600000, sentAt: null },
        "recap-1": { id: "recap-1", kind: "recap", title: recapName + " recap poster", caption: recap.caption, hasImage: true, createdAt: now - 60000, sentAt: null },
      },
      images: { "odds-1": odds.image, "recap-1": recap.image },
      log: {
        [now - 26 * 3600000]: { at: now - 26 * 3600000, text: oddsName.replace(" ", "") + ": published at the model's odds; poster queued for WhatsApp." },
        [now - 3600000]: { at: now - 3600000, text: oddsName.replace(" ", "") + ": bet update 1 queued at 5/10 games." },
        [now - 60000]: { at: now - 60000, text: recapName.replace(" ", "") + ": settled (1 won, 0 lost, 0 void, 1 expired); recap queued." },
      },
    };
  }, { text, odds: pub.poster, recap: set.poster, now, oddsName: pub.name, recapName: set.name });
  const shot = async (id, file, full) => {
    await page.evaluate(async (id) => { apShare = null; await apOpenShare(id); }, id);
    await page.waitForSelector("#posterModal.open #apCaption");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, file), fullPage: !!full });
  };
  await shot("odds-1", "phone-share-odds.png");
  await shot("trend-1", "phone-share-tracker.png");
  await shot("recap-1", "phone-share-recap.png");
  // Control tower: GW in play (5/10 games, tracker 1 waiting, one bet to review), last week settled
  // with its results poster unsent, and next week waiting to release. Screen-only changes.
  await page.evaluate(({ now, pubId, setId, pubEv, setEv }) => {
    const g = gw(pubId);
    g.deadline = now - 5 * 3600000;
    g.oddsReleasedAt = now - 29 * 3600000;
    const ko0 = g.deadline + 80 * 60000;
    const kick = [0, 2.5, 2.5, 2.5, 2.5, 5, 7.5, 25.5, 25.5, 28].map((h) => ko0 + h * 3600000);
    const next = S.gameweeks.filter((x) => x.event > pubEv && x.status !== "open" && x.status !== "settled").sort((a, b) => a.event - b.event)[0];
    const A = __SEED__["lennon-lounge-autopilot"];
    A.status.timeline = {
      [pubEv]: { total: 10, finished: 5, live: 1, started: 6, firstKickoff: ko0, lastKickoff: kick[9], releaseAt: ko0 - 24 * 3600000, kickoffs: kick },
    };
    if (next) {
      next.deadline = ko0 + 7 * 86400000 - 80 * 60000;
      A.status.timeline[next.event] = { total: 10, finished: 0, live: 0, started: 0, firstKickoff: ko0 + 7 * 86400000, lastKickoff: ko0 + 8 * 86400000, releaseAt: ko0 + 6 * 86400000, kickoffs: [ko0 + 7 * 86400000] };
    }
    A.state = { gws: {
      [setEv]: { released: { at: now - 9 * 86400000, by: "autopilot", outboxId: null }, updates: { 0: { at: now - 7 * 86400000, finished: 4, outboxId: null, skipped: "no live bets" } }, settled: { at: now - 60000, by: "autopilot", outboxId: "recap-1", won: 1, lost: 0, void: 0, expired: 1 } },
      [pubEv]: { released: { at: now - 29 * 3600000, by: "autopilot", outboxId: "odds-1" }, updates: { 0: { at: now - 3600000, finished: 5, index: 0, outboxId: "trend-1" } } },
    } };
    apCloseShare();
    ctPick = pubId;
    go("tower");
  }, { now, pubId: pub.gwId, setId: set.gwId, pubEv: Number(publishEv), setEv: Number(settleEv) });
  await page.waitForSelector("#ctBody .ct-list");
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById("controlTower").scrollIntoView());
  await page.screenshot({ path: path.join(out, "phone-tower-inplay.png"), fullPage: false });
  const towerShot = async (file, pick) => {
    await page.evaluate((pick) => {
      ctPick = pick;
      ctRedraw();
      document.querySelectorAll("header, #bottomNav").forEach((e) => (e.style.display = "none"));
      document.getElementById("controlTower").scrollIntoView();
    }, pick);
    await page.waitForTimeout(200);
    const box = await page.evaluate(() => { const r = document.getElementById("controlTower").getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; });
    await page.screenshot({ path: path.join(out, file), fullPage: true, clip: { x: 0, y: Math.max(0, box.y - 12), width: 390, height: box.h + 24 } });
  };
  await towerShot("phone-tower-inplay-full.png", pub.gwId);
  await towerShot("phone-tower-settled-full.png", set.gwId);
  // Tick: mark the results poster sent another way, then check it shows as done.
  await page.evaluate(() => {
    const step = [...document.querySelectorAll("#ctBody .ct-step")].find((li) => li.textContent.includes("Results poster"));
    [...step.querySelectorAll("button")].find((b) => b.textContent.includes("Mark done")).click();
  });
  await page.waitForFunction(() => [...document.querySelectorAll("#ctBody .ct-step.done .ct-title")].some((e) => e.textContent.includes("Results poster")));
  assert.ok(await page.evaluate(() => __SEED__["lennon-lounge-autopilot"].outbox["recap-1"].sentAt > 0), "tick recorded on the outbox item");
  // A step with no queued copy: tick goes to config/ticks and can be undone.
  await page.evaluate((ev) => ctTick(ev, "odds", null), Number(settleEv));
  assert.ok(await page.evaluate((ev) => __SEED__["lennon-lounge-autopilot"].config.ticks[ev].odds > 0, Number(settleEv)), "manual tick saved");
  await page.evaluate((ev) => ctTick(ev, "odds", null, true), Number(settleEv));
  assert.equal(await page.evaluate((ev) => (__SEED__["lennon-lounge-autopilot"].config.ticks[ev] || {}).odds ?? null, Number(settleEv)), null, "tick undone");
  await page.evaluate(() => { __SEED__["lennon-lounge-autopilot"].outbox["recap-1"].sentAt = null; apInfo.outbox["recap-1"].sentAt = null; });
  console.log("PASS control tower ticks");
  const nextId = await page.evaluate((ev) => (S.gameweeks.filter((x) => x.event > ev && x.status !== "open" && x.status !== "settled").sort((a, b) => a.event - b.event)[0] || {}).id, Number(publishEv));
  if (nextId) await towerShot("phone-tower-next-full.png", nextId);
  await page.evaluate(() => {
    document.querySelectorAll("header, #bottomNav").forEach((e) => (e.style.display = ""));
    document.getElementById("autopilotSettings").open = true;
  });
  await page.waitForSelector("#apCardBody table");
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector("#apCardBody").closest(".card").scrollIntoView());
  await page.screenshot({ path: path.join(out, "phone-office-autopilot.png") });
  await page.evaluate(() => document.querySelector("#apCardBody table").scrollIntoView({ block: "center" }));
  await page.screenshot({ path: path.join(out, "phone-office-outbox.png") });
  await page.evaluate(() => go("odds"));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, "phone-odds-setter.png") });
  await page.evaluate(() => go("settler"));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, "phone-settler.png") });
  // A sample bet waiting for review (screen only; not saved).
  await page.evaluate(({ gwId, legs }) => {
    S.bets.push({ id: "bet_sample_review", teamId: "henry", gwId, status: "pending", stake: 10, effOdds: 3.61, legs, placedAt: Date.now() - 120000, inplay: false });
  }, { gwId: st.g.id, legs: bets[0].legs.map((l) => ({ ...l, gwId: st.g.id, odds: 1.9 })) });
  await page.evaluate(() => go("review"));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, "phone-bet-review.png") });
  console.log("Phone screenshots written.");
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const h = await House.openHouse({ pin: "424242", url: "http://lennon.test/", prepare });
  try {
    const { page } = h;
    assert.equal(await page.evaluate(() => me && me.id), "selig");

    // Dry run first: draws the odds poster, saves nothing.
    await page.waitForTimeout(3000);
    console.log("writes at login:", JSON.stringify(await page.evaluate(() => __WRITES__)));
    const before = await page.evaluate(() => __WRITES__.length);
    const dry = await House.publish(page, publishEv, { dryRun: true });
    assert.equal(dry.dryRun, true);
    const dryWrites = await page.evaluate((n) => __WRITES__.slice(n), before);
    console.log("writes during dry run:", JSON.stringify(dryWrites));
    assert.equal(dryWrites.filter((w) => !w.path.startsWith("lennon-lounge-members")).length, 0);

    // Publish.
    const pub = await House.publish(page, publishEv);
    const g = await page.evaluate((id) => {
      const g = gw(id);
      const rec = g.matches.map((m) => recOdds(S, m.home, m.away, g.event));
      return { status: g.status, gate: __SEED__["lennon-lounge-publication"]?.[id]?.status, odds: g.matches.map((m) => m.odds), rec, released: !!g.oddsReleasedAt };
    }, pub.gwId);
    assert.equal(g.status, "open");
    assert.equal(g.gate, "published");
    assert.equal(g.released, true);
    assert.deepEqual(g.odds, g.rec, "published odds are the model's recommendation");
    assert.ok(pub.poster.image.startsWith("data:image/jpeg"));
    assert.match(pub.poster.caption, /ODDS ARE LIVE/);
    fs.writeFileSync(path.join(out, `gw${publishEv}-odds.jpg`), Buffer.from(pub.poster.image.split(",")[1], "base64"));
    console.log(`PASS publish GW${publishEv}: open, gate set, odds = model, poster ${Math.round(pub.poster.image.length / 1024)} KB`);
    assert.equal((await House.publish(page, publishEv)).already, true, "second publish is a no-op");

    // Settle.
    const set = await House.settle(page, settleEv);
    const after = await page.evaluate((id) => ({ status: gw(id).status, open: S.bets.filter((b) => b.gwId === id && ["accepted", "pending"].includes(b.status)).length }), set.gwId);
    assert.equal(after.status, "settled");
    assert.equal(after.open, 0);
    const graded = await page.evaluate(() => ["bet_check_a", "bet_check_p"].map((id) => getBet(id).status));
    assert.ok(["won", "lost"].includes(graded[0]), "accepted bet graded");
    assert.equal(graded[1], "expired", "unreviewed bet expired");
    assert.match(set.poster.caption, /RECAP/);
    fs.writeFileSync(path.join(out, `gw${settleEv}-recap.jpg`), Buffer.from(set.poster.image.split(",")[1], "base64"));
    console.log(`PASS settle GW${settleEv}: ${JSON.stringify(set.summary)}, recap poster made`);
    assert.equal((await House.settle(page, settleEv)).already, true, "second settle is a no-op");

    // The one-tap share screen renders an outbox item.
    await page.evaluate(() => {
      __SEED__["lennon-lounge-autopilot"] = { outbox: { "trend-gw12-1": { id: "trend-gw12-1", kind: "trend", title: "GW 12 bet tracker 1", caption: "📈 test", hasImage: false } } };
      apOpenShare("trend-gw12-1");
    });
    await page.waitForSelector("#posterModal.open #apCaption");
    await page.screenshot({ path: path.join(out, "share-text.png") });
    await page.evaluate(() => { apCloseShare(); go("tower"); });
    await page.waitForSelector("#ctBody .ct-list");
    const tower = await page.evaluate(() => [...document.querySelectorAll("#ctBody .ct-title")].map((e) => e.firstChild.textContent));
    assert.ok(tower.includes("Odds released") && tower.some((t) => t.startsWith("Settle")), "control tower lists the gameweek's steps");
    await page.evaluate(() => { document.getElementById("autopilotSettings").open = true; });
    await page.waitForSelector("#apCardBody table");
    await page.screenshot({ path: path.join(out, "office-autopilot.png"), fullPage: false });
    if (process.env.SCREENS) await phoneScreens(page, pub, set);
    if (h.errors.length) console.log("Page errors:", h.errors);
    assert.deepEqual(h.errors, []);
    console.log("PASS share screen + Back Office card. Screenshots: " + out);
  } finally {
    await h.close();
  }
})().catch((e) => {
  console.error("FAIL:", e.stack || e.message);
  process.exit(1);
});
