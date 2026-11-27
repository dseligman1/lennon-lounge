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
    await page.evaluate(() => { apCloseShare(); go("office"); });
    await page.waitForSelector("#apCardBody table");
    await page.screenshot({ path: path.join(out, "office-autopilot.png"), fullPage: false });
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
