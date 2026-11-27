/* Player Home + Bet Builder, "Your week" redesign (2026-11-27, PROGRESS.md ROUND 23).
 * Why: Home was ~5 phone screens and Bet Builder ~5.5, with a promo pop-up over every page, and
 * only 2 of 10 players had ever bet. Dan chose option B from
 * outputs/2026-11-27-player-redesign/ with two tweaks (a Build a bet button in step 2, and
 * copy-a-mate's-bet ahead of the quick-bet prices).
 *
 * Home:  hero tracker for the gameweek (① free Score Shot ② your bet ③ follow it live) →
 *        mates' slips with one-tap Copy (re-priced at today's odds) → quick-bet prices →
 *        one tabbed Lounge panel (Bets / Table / Chat / Me).
 * Bet Builder: tabbed coupon (Matches / Specials / The Algo / Ask the house / Season & later)
 *        with "👥 N" backed counts on prices and a sticky slip bar on phones.
 * The previous pages stay in index.html as vHomeClassic()/vBuilderClassic(); In-Play still uses
 * vBuilderClassic(). Everything here calls the app's existing functions. */
let pwShotOpen = false, // Score Shot opened from step 1
  pwLoungeTab = "bets", // bets | table | chat | me
  pwCoupon = "matches"; // matches | specials | algo | ask | more

const PW_LIVE = ["pending", "accepted", "counter_house", "counter_user"];
const PW_GONE = ["cancelled", "rejected", "expired"];

function pwCss() {
  if (typeof document === "undefined" || !document.head || document.getElementById("pwCss")) return;
  const s = document.createElement("style");
  s.id = "pwCss";
  s.textContent = `
  .pw-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 14px}
  .pw-chip{background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:12.5px;color:var(--muted)}
  .pw-chip b{color:var(--text)}
  .pw-alert{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;margin:0 0 12px;background:rgba(255,201,49,.13);border:1px solid rgba(255,201,49,.5);font-size:13.5px}
  .pw-hero{border-radius:20px;padding:16px;margin:0 0 16px;background:radial-gradient(120% 90% at 0% 0%,rgba(155,92,255,.28),rgba(22,0,38,.92) 60%);border:1px solid rgba(155,92,255,.45)}
  .pw-hero .top{display:flex;justify-content:space-between;align-items:baseline;gap:6px 10px;flex-wrap:wrap}
  .pw-hero h3{font-family:'Archivo Black',sans-serif;font-size:22px;margin:0}
  .pw-hero .cd{font-size:12.5px;color:var(--muted)} .pw-hero .cd b{color:var(--gold)}
  .pw-steps{list-style:none;margin:14px 0 0;padding:0}
  .pw-step{position:relative;display:grid;grid-template-columns:34px 1fr;gap:0 12px;padding-bottom:14px}
  .pw-step:last-child{padding-bottom:0}
  .pw-step::before{content:"";position:absolute;left:16px;top:34px;bottom:0;width:2px;background:rgba(255,255,255,.12)}
  .pw-step:last-child::before{display:none}
  .pw-step.done::before{background:rgba(0,255,135,.45)}
  .pw-dot{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:var(--bg1);border:2px solid rgba(255,255,255,.2);color:var(--muted);position:relative;z-index:1}
  .pw-step.done .pw-dot{background:var(--teal);border-color:var(--teal);color:var(--bg0)}
  .pw-step.todo .pw-dot{border-color:var(--gold);color:var(--gold)}
  .pw-step.live .pw-dot{border-color:var(--pink);color:var(--pink)}
  .pw-step .t{display:block;font-weight:800;font-size:15px;margin-top:6px}
  .pw-step p{margin:2px 0 8px;color:var(--muted);font-size:13px}
  .pw-step p b{color:var(--text)}
  .pw-row{display:flex;gap:6px;flex-wrap:wrap}
  .pw-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:20px 0 10px}
  .pw-h h4{font-family:'Archivo Black',sans-serif;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0}
  .pw-h span{font-size:12px;color:var(--muted)}
  .pw-copy{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 8px;margin:0 -2px;scroll-snap-type:x mandatory}
  .pw-slipcard{flex:0 0 min(78%,300px);scroll-snap-align:start;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px;display:grid;gap:8px;align-content:space-between}
  .pw-slipcard .who{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted)} .pw-slipcard .who b{color:var(--text)}
  .pw-slipcard .legs{font-size:13px;line-height:1.45;margin:0;padding-left:16px}
  .pw-slipcard .px{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .pw-slipcard .px .o{font-family:'Archivo Black',sans-serif;font-size:19px;color:var(--gold)}
  .pw-slipcard .px .o small{display:block;font-family:Inter,sans-serif;font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  .pw-promo{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px 14px;border-radius:14px;margin:0 0 10px;background:linear-gradient(90deg,rgba(255,157,0,.16),rgba(255,45,120,.14));border:1px solid rgba(255,157,0,.45);font-size:13px}
  .pw-promo b{color:var(--orange)}
  .pw-fx{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;margin-bottom:8px}
  .pw-fx .nm{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-weight:800;font-size:14px;margin-bottom:8px}
  .pw-fx .nm .vs{color:var(--muted);font-weight:500}
  .pw-fx .oddsbtns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  .pw-fx .oddbtn{min-width:0;width:100%}
  .pw-backed{display:block;font-size:10.5px;font-weight:700;color:var(--cyan);margin-top:2px}
  .pw-seg{display:flex;gap:4px;padding:4px;border-radius:14px;background:rgba(255,255,255,.06);margin:0 0 12px;overflow-x:auto}
  .pw-seg button{flex:1 0 auto;border:0;background:transparent;color:var(--muted);font:inherit;font-weight:800;font-size:13px;padding:9px 12px;border-radius:10px;cursor:pointer;white-space:nowrap}
  .pw-seg button.on{background:var(--bg2);color:var(--text);box-shadow:0 0 0 1px var(--line)}
  .pw-panel{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:12px}
  .pw-panel table td{padding:7px 4px;font-size:13.5px}
  .pw-panel .livebet-card{margin:0;border:0;background:none;padding:0}
  .pw-slipbar{position:fixed;left:12px;right:12px;bottom:calc(70px + env(safe-area-inset-bottom, 0px));z-index:45;display:flex;align-items:center;justify-content:space-between;gap:10px;
    padding:12px 16px;border-radius:16px;background:linear-gradient(90deg,var(--teal),var(--cyan));color:var(--bg0);font-weight:900;box-shadow:0 10px 30px rgba(0,0,0,.5);cursor:pointer;border:0;font-family:inherit;font-size:14px;text-align:left}
  .pw-slipbar span{font-weight:700;font-size:13px}
  .pw-slipbar:focus-visible{outline:2px solid var(--text);outline-offset:2px}
  `;
  document.head.appendChild(s);
}

/* ---------- shared helpers ---------- */
function pwOpenGw() {
  return publishedGws().filter((g) => bettableNow(g) === "pre").sort((a, b) => a.deadline - b.deadline)[0] || null;
}
function pwKickoff(g) {
  return g ? g.kickoff || (g.deadline ? g.deadline + 80 * 60000 : null) : null;
}
// How many players (any team) back each match pick this gameweek: {"matchId:pick": n}.
function pwBacked(g) {
  const who = {};
  S.bets
    .filter((b) => b.gwId === g.id && !PW_GONE.includes(b.status) && !b.inplay)
    .forEach((b) =>
      (b.legs || []).forEach((l) => {
        if (l.type !== "match") return;
        (who[l.matchId + ":" + l.pick] = who[l.matchId + ":" + l.pick] || new Set()).add(b.teamId);
      }),
    );
  const out = {};
  Object.entries(who).forEach(([k, s]) => (out[k] = s.size));
  return out;
}
// Today's price for a pick, exactly as the board shows it (promo or week boost first).
function pwPrice(g, m, pick) {
  return promoPrice(g.id, m.id, pick) ?? weekBoostPrice(g, m, pick) ?? m.odds[pick];
}
function pwOddBtn(g, m, pick, lab, backed) {
  const boosted = promoPrice(g.id, m.id, pick) ?? weekBoostPrice(g, m, pick);
  const price = boosted ?? m.odds[pick];
  const n = backed && backed[m.id + ":" + pick];
  const tag = n ? `<span class="pw-backed">👥 ${n}</span>` : "";
  const mine = m.home === me.id ? "home" : m.away === me.id ? "away" : null;
  if (mine && pick !== mine)
    return `<button class="oddbtn locked" disabled title="🔒 Your own match: you can only back your team to win">🔒 ${lab}<b>${fmtOdds(price)}</b></button>`;
  const sel = slip.some((l) => l.type === "match" && l.matchId === m.id && l.pick === pick) ? "sel" : "";
  return `<button class="oddbtn ${sel} ${boosted ? "boost" : ""}" onclick="addMatchLeg('${g.id}','${m.id}','${pick}')">${boosted ? '<span class="fire">🔥</span>' : ""}${lab}<b>${boosted ? `<span class="was">${fmtOdds(m.odds[pick])}</span>` : ""}${fmtOdds(price)}</b>${tag}</button>`;
}
function pwFixtures(g, { chips = false } = {}) {
  const backed = pwBacked(g);
  return g.matches
    .filter((m) => m.home && m.away)
    .map(
      (m) => `<div class="pw-fx"><div class="nm">${chips ? teamLink(m.home) + formDot(m.home) : esc(team(m.home).name)}<span class="vs">v</span>${chips ? teamLink(m.away) + formDot(m.away) : esc(team(m.away).name)}${chips ? squadCompareBtn(g.id, m.id) + whyOddsBtn(g.id, m.id) : ""}</div>
      <div class="oddsbtns">${pwOddBtn(g, m, "home", "HOME", backed)}${pwOddBtn(g, m, "draw", "DRAW", backed)}${pwOddBtn(g, m, "away", "AWAY", backed)}</div></div>`,
    )
    .join("");
}
function pwPromoStrip(g) {
  const p = g && S.promos.find((p) => p.active && p.gwId === g.id);
  if (!p) return "";
  return `<div class="pw-promo"><span>🔥 <b>${esc(String(p.title || "").replace(/^\S+\s*/, ""))}</b> ${esc(p.text)}</span><button class="btn gold small" onclick="claimPromo('${p.id}')">Add</button></div>`;
}
// Sticky summary above the bottom menu (phones only), once something is in the slip.
function pwSlipBar() {
  if (!slip.length || !isMobileLayout()) return "";
  return `<button class="pw-slipbar" type="button" onclick="pwToSlip()"><span>🎫 <b>${slip.length} pick${slip.length === 1 ? "" : "s"}</b> @ ${fmtOdds(slipOddsFinal())}</span><b>Review &amp; place ↓</b></button>`;
}
function pwToSlip() {
  if (activeTab !== "builder") {
    pwCoupon = "matches";
    go("builder");
  }
  setTimeout(() => {
    const el = document.getElementById("pwSlip");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 60);
}

/* ---------- copy a mate's bet, at today's prices ---------- */
// Legs of someone else's bet that this player can back now, re-priced from the live board.
// Skips legs on markets that are gone or that the own-team rule blocks for this player.
function pwCopyLegs(b) {
  const g = gw(b.gwId);
  if (!g || bettableNow(g) !== "pre") return [];
  const out = [];
  for (const l of b.legs || []) {
    if (l.type === "match") {
      const m = g.matches.find((x) => x.id === l.matchId);
      if (!m || !m.odds || m.odds[l.pick] == null) continue;
      const price = pwPrice(g, m, l.pick);
      const label = l.pick === "draw" ? `Draw — ${team(m.home).name} v ${team(m.away).name}` : `${team(l.pick === "home" ? m.home : m.away).name} to WIN v ${team(l.pick === "home" ? m.away : m.home).name}`;
      const leg = { type: "match", gwId: g.id, matchId: m.id, pick: l.pick, odds: price, label };
      if (!slipViolatesIntegrity([leg], me.id)) out.push(leg);
    } else if (l.type === "special") {
      const mk = (g.specialMarkets || []).find((x) => x.id === l.marketId);
      if (!mk) continue;
      const leg = { type: "special", gwId: g.id, marketId: mk.id, kind: mk.kind, teamId: mk.teamId || undefined, matchId: mk.matchId || undefined, line: mk.line, dir: mk.dir, odds: mk.odds, label: mk.label };
      if (!slipViolatesIntegrity([leg], me.id)) out.push(leg);
    }
  }
  return out;
}
function pwCopyBet(id) {
  const b = getBet(id);
  if (!b) return;
  const legs = pwCopyLegs(b);
  if (!legs.length) return toast("Nothing in that bet you can back right now.", true);
  slip = legs;
  slipBundles = [];
  slipDuplicateOf = id;
  algoCurrent = null;
  builderSec = "pre";
  pwCoupon = "matches";
  if (typeof logUsage === "function") logUsage("copy_bet");
  const dropped = (b.legs || []).length - legs.length;
  go("builder");
  toast(`Copied at today's prices${dropped ? ` (${dropped} leg${dropped === 1 ? "" : "s"} left out)` : ""}. Set your stake 📋`);
  setTimeout(() => {
    const el = document.getElementById("stakeInput");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    }
  }, 120);
}
function pwCopyCards(g) {
  const bets = S.bets
    .filter((b) => b.gwId === g.id && b.teamId !== me.id && ["accepted", "pending"].includes(b.status) && !b.inplay)
    .sort((a, b) => b.placedAt - a.placedAt);
  const cards = [];
  for (const b of bets) {
    const legs = pwCopyLegs(b);
    if (!legs.length) continue;
    const t = team(b.teamId);
    const now = legs.length === 1 ? legs[0].odds : combinedOdds(legs.map((l) => l.odds), S.settings);
    const shown = legs.slice(0, 3);
    cards.push(`<div class="pw-slipcard"><div class="who"><span><b>${esc(t ? t.owner : "?")}</b> · ${esc(t ? t.name : "")}</span><span>${timeAgo(b.placedAt)}</span></div>
      <ul class="legs">${shown.map((l) => `<li>${esc(l.label)}</li>`).join("")}${legs.length > 3 ? `<li class="muted">+${legs.length - 3} more</li>` : ""}</ul>
      <div class="px"><span class="o"><small>Now</small>${fmtOdds(now)}</span><button class="btn small" onclick="pwCopyBet('${b.id}')">📋 Copy bet</button></div></div>`);
    if (cards.length >= 8) break;
  }
  return cards;
}

/* ---------- Home ---------- */
function vHome() {
  pwCss();
  const g = pwOpenGw();
  const live = !g ? S.gameweeks.filter((x) => x.status === "open" && !bettableNow(x) && x.deadline && x.deadline < Date.now()).sort((a, b) => b.deadline - a.deadline)[0] : null;
  const focus = g || live;
  const mine = S.bets.filter((b) => b.teamId === me.id);
  const settled = mine.filter((b) => ["won", "lost"].includes(b.status));
  const w = settled.filter((b) => b.status === "won").length;
  const openN = [...mine, ...(typeof scoreBets === "function" ? scoreBets() : [])].filter((b) => PW_LIVE.includes(b.status)).length;
  const u = urgentActions();

  // Alerts that need the player (or the house) right now.
  const alerts = [];
  if (u.counterOffers.length)
    alerts.push(`<div class="pw-alert"><span>📨 <b>The house countered your bet.</b> It's waiting on you.</span><button class="btn gold small" onclick="myBetsSec='auto';go('mybets')">Respond</button></div>`);
  if (me.admin && u.adminNeeds.length)
    alerts.push(`<div class="pw-alert"><span>🏠 <b>${u.adminNeeds.length} bet${u.adminNeeds.length === 1 ? "" : "s"}</b> waiting for your call</span><button class="btn gold small" onclick="go('review')">Review</button></div>`);
  const tower = me.admin && typeof ctNeedsCount === "function" ? ctNeedsCount() : 0;
  if (tower)
    alerts.push(`<div class="pw-alert"><span>🗼 <b>${tower} step${tower === 1 ? "" : "s"}</b> need you in Control Tower</span><button class="btn gold small" onclick="go('tower')">Open</button></div>`);

  // ① Score Shot
  const r = typeof currentScoreRound === "function" ? currentScoreRound() : null;
  const shotReady = typeof scoreReady !== "undefined" && scoreReady && r && scoreEntryReady[r.event];
  const entered = r && typeof scoreEntries !== "undefined" && scoreEntries[r.event];
  const shotOpenNow = r && r.status === "open" && gamesNow() < r.cutoff && !oddsWithdrawn(r.gwId);
  let s1;
  if (entered) s1 = { cls: "done", dot: "✓", t: "Free £50 Score Shot", p: `You're in for ${esc(r.name)}. Nothing else to do.`, btn: `<button class="btn secondary small" onclick="pwShotOpen=!pwShotOpen;render()">${pwShotOpen ? "Hide" : "See my entry"}</button>` };
  else if (!shotReady) s1 = { cls: "", dot: "1", t: "Free £50 Score Shot", p: r ? "Checking your entry…" : "Opens here for the next gameweek, before its FPL deadline.", btn: "" };
  else if (shotOpenNow) s1 = { cls: "todo", dot: "1", t: "Free £50 Score Shot", p: `Guess one matchup's exact score for ${esc(r.name)}. Free, closes ${fmtDT(r.cutoff)}.`, btn: `<button class="btn gold small" onclick="pwShotOpen=!pwShotOpen;render();if(pwShotOpen)setTimeout(()=>document.getElementById('pwShot')?.scrollIntoView({behavior:'smooth',block:'start'}),60)">${pwShotOpen ? "Hide" : "Play free →"}</button>` };
  else s1 = { cls: "", dot: "1", t: "Free £50 Score Shot", p: `Closed for ${esc(r.name)}. The next one opens automatically.`, btn: "" };

  // ② Your bet
  let s2;
  const algoBtn = `<button class="btn secondary small" onclick="pwCoupon='algo';go('builder');setTimeout(spinAlgo,80)">🎰 The Algo</button>`;
  if (g) {
    const onG = mine.filter((b) => b.gwId === g.id && !PW_GONE.includes(b.status));
    const ret = onG.reduce((t, b) => t + (b.stake || 0) * (b.effOdds || 0), 0);
    s2 = onG.length
      ? { cls: "done", dot: "✓", t: `You've got ${onG.length} bet${onG.length === 1 ? "" : "s"} on`, p: `Could return <b style="color:var(--teal)">${GBP(ret)}</b> if ${onG.length === 1 ? "it lands" : "they all land"}.`, btn: `<button class="btn small" onclick="pwCoupon='matches';go('builder')">⚽ Build another</button><button class="btn secondary small" onclick="myBetsSec='active';go('mybets')">My bets</button>` }
      : { cls: "todo", dot: "2", t: "Get a bet on", p: "Copy a mate's bet, tap a price below, or build your own.", btn: `<button class="btn small" onclick="pwCoupon='matches';go('builder')">⚽ Build a bet</button>${algoBtn}` };
  } else if (live) s2 = { cls: "done", dot: "✓", t: "Betting's closed", p: `${esc(live.name)} is under way. In-Play may have prices.`, btn: `<button class="btn secondary small" onclick="builderSec='inplay';go('builder')">🔴 In-Play</button>` };
  else s2 = { cls: "", dot: "2", t: "Get a bet on", p: "The odds land about 24 hours before the first kick-off. You'll get a notification.", btn: "" };

  // ③ Follow it live
  const ko = pwKickoff(focus);
  const inPlayNow = !!live || (ko && Date.now() >= ko);
  const s3 = inPlayNow
    ? { cls: "live", dot: "●", t: "Follow it live", p: "Games are on: live scores and win chances.", btn: `<button class="btn hot small" onclick="go('matchday')">📺 Matchday Live</button>` }
    : { cls: "", dot: "3", t: "Follow it live", p: `Matchday Live shows live scores and win chances${ko ? ` from kick-off, <b>${fmtDT(ko)}</b>` : ""}.`, btn: `<button class="btn secondary small" onclick="go('matchday')">📺 Matchday</button>` };

  const step = (s) => `<li class="pw-step ${s.cls}"><div class="pw-dot">${s.dot}</div><div><span class="t">${s.t}</span><p>${s.p}</p>${s.btn ? `<div class="pw-row">${s.btn}</div>` : ""}</div></li>`;
  const cdId = g && u.soonestGw && u.soonestGw.id === g.id ? ' id="heroCountdown"' : "";
  const hero = `<div class="pw-hero"><div class="top"><h3>${focus ? esc(focus.name) : "Next gameweek"}</h3>${g ? `<span class="cd">Betting closes in <b${cdId} class="mono">${fmtCountdown(g.deadline - Date.now())}</b></span>` : live ? `<span class="cd"><b>In play</b></span>` : ""}</div>
    <ol class="pw-steps">${step(s1)}${step(s2)}${step(s3)}</ol></div>`;

  const copy = g ? pwCopyCards(g) : [];
  const { pnl } = computePnl(S);
  const rows = S.teams.map((t) => ({ t, p: pnl[t.id] || 0 })).sort((a, b) => b.p - a.p);
  let panel;
  if (pwLoungeTab === "table")
    panel = `<table>${rows.map((x, i) => `<tr${x.t.id === me.id ? ' style="color:var(--teal)"' : ""}><td>${i + 1}</td><td><b>${teamLink(x.t.id)}</b> <span class="muted small">${esc(x.t.owner)}</span></td><td style="text-align:right" class="mono ${x.p > 0 ? "pos" : x.p < 0 ? "neg" : ""}">${GBP(x.p)}</td></tr>`).join("")}</table>
      <button class="btn ghost small" style="margin-top:10px" onclick="resultsSec='standings';go('results')">Full standings →</button>`;
  else if (pwLoungeTab === "chat") {
    const chat = S.chat.slice(-(homeChatExpanded ? 150 : 30));
    panel = `<div class="chatbox" id="chatBox">${chat.length ? chat.map((c) => { const t = team(c.by); return `<div class="chatmsg ${t && t.admin ? "h" : ""}"><span class="cwho">${t ? esc(t.owner) : "?"}${t && t.admin ? " 🏠" : ""} <span class="muted" style="font-weight:400">· ${fmtDT(c.at)}</span></span><div>${esc(c.text)}</div></div>`; }).join("") : '<p class="muted">Dead quiet in here. Start the trash talk.</p>'}</div>
      <div class="chatrow"><input id="chatInp" placeholder="Say something regrettable…" maxlength="300" onkeydown="if(event.key==='Enter')sendChat()"><button class="btn" onclick="sendChat()">Send</button></div>
      <button class="btn ghost small" style="margin-top:8px" onclick="homeChatExpanded=!homeChatExpanded;render()">${homeChatExpanded ? "Show fewer" : "Show older messages"}</button>`;
  } else if (pwLoungeTab === "me") {
    const my = personalStats(S, me.id);
    const spark = homePnlExpanded ? pnlSparklineSvg(me.id) : "";
    panel = `<div class="pnlgrid">
        <div class="pnlstat"><div class="l">Total P&amp;L</div><div class="v mono ${my.pnl > 0 ? "pos" : my.pnl < 0 ? "neg" : ""}">${GBP(my.pnl)}</div></div>
        <div class="pnlstat"><div class="l">Wagered this week</div><div class="v mono">${GBP(my.wageredThisWeek)}</div></div>
        <div class="pnlstat"><div class="l">Record</div><div class="v">${my.wins}W–${my.losses}L</div></div>
        <div class="pnlstat"><div class="l">Potential winnings</div><div class="v mono" style="color:var(--teal)">${GBP(my.potentialWinnings)}</div></div></div>
      <button class="btn ghost small" style="margin:10px 0" onclick="homePnlExpanded=!homePnlExpanded;render()">${homePnlExpanded ? "Hide P&amp;L trend" : "Show P&amp;L trend"}</button>
      ${homePnlExpanded ? `<div class="pnl-spark-wrap">${spark || '<p class="muted small">Not enough settled bets yet for a trend line: need at least 2.</p>'}</div>` : ""}
      ${rewardsTrackerWidget(me.id)}${seasonBetsSummaryCard()}
      <div class="pw-row" style="margin-top:10px"><button class="btn secondary small" onclick="openSquadModal('${me.id}')">👥 Squads</button><button class="btn secondary small" onclick="resultsSec='feed';go('results')">🏆 Results</button></div>`;
  } else {
    const feed = S.bets.slice().sort((a, b) => b.placedAt - a.placedAt).slice(0, 8);
    panel = liveBetTable(feed, S.bets.length);
  }
  const tabs = [["bets", "🎫 Bets"], ["table", "💷 Table"], ["chat", "💬 Chat"], ["me", "🧮 Me"]];

  return `<h2>Alright, ${esc(me.owner)}</h2>
    <div class="pw-chips"><span class="pw-chip"><b>${openN}</b> open bet${openN === 1 ? "" : "s"}</span><span class="pw-chip">Record <b>${w}W–${settled.length - w}L</b></span></div>
    ${alerts.join("")}${hero}
    ${pwShotOpen ? `<div id="pwShot">${scoreGameHome()}</div>` : ""}
    ${copy.length ? `<div class="pw-h"><h4>📋 Copy a mate's bet</h4><span>at today's prices</span></div><div class="pw-copy">${copy.join("")}</div>` : ""}
    ${g ? `<div class="pw-h"><h4>⚽ Quick bet · ${esc(g.name)}</h4><span>👥 = players on it</span></div>${pwPromoStrip(g)}${pwFixtures(g)}
      <button class="btn secondary small" style="margin:4px 0 0" onclick="pwCoupon='matches';go('builder')">Specials, The Algo &amp; more in Bet Builder →</button>` : ""}
    <div class="pw-h"><h4>The Lounge</h4></div>
    <div class="pw-seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${pwLoungeTab === k}" class="${pwLoungeTab === k ? "on" : ""}" onclick="pwLoungeTab='${k}';render()">${l}</button>`).join("")}</div>
    <div class="pw-panel">${panel}</div>
    ${pwSlipBar()}`;
}

/* ---------- Bet Builder ---------- */
function vBuilder() {
  pwCss();
  if (builderSec === "inplay") return vBuilderClassic();
  const pre = publishedGws().filter((g) => bettableNow(g) === "pre").sort((a, b) => a.deadline - b.deadline);
  const paused = publishedGws().filter((g) => !bettableNow(g));
  const g = pre[0] || null;
  const hasSpecials = pre.some((x) => x.specialMarkets && x.specialMarkets.length);
  if (pwCoupon === "specials" && !hasSpecials) pwCoupon = "matches";
  const tabs = [["matches", "⚽ Matches"], ...(hasSpecials ? [["specials", "🎲 Specials"]] : []), ["algo", "🎰 The Algo"], ["ask", "📝 Ask the house"], ["more", "🏆 Season & later"]];
  const upcoming = S.gameweeks.filter((x) => (x.status === "draft" || oddsWithdrawn(x.id)) && !x.normalOff).sort((a, b) => (a.event || 0) - (b.event || 0));
  let body;
  if (pwCoupon === "matches") {
    body =
      pre.map((x) => `<div class="pw-h" style="margin-top:4px"><h4>📅 ${esc(x.name)}</h4><span>Cutoff ${fmtDT(x.deadline)}</span></div>${pwPromoStrip(x)}${pwFixtures(x, { chips: true })}`).join("") +
      paused.map((x) => `<div class="card"><h3>⏸ ${esc(x.name)}</h3><p class="muted">Cutoff passed. Betting is paused until the first kick-off${x.kickoff ? " (" + fmtDT(x.kickoff) + ")" : ""}, then In-Play opens.</p></div>`).join("") +
      (!pre.length && !paused.length ? `<div class="card"><h3>😴 No odds out yet</h3><p class="muted">They land about 24 hours before the first kick-off, and you'll get a notification. See the fixtures under “Season &amp; later”.</p></div>` : "") +
      `<button class="btn ghost small" style="margin-top:4px" onclick="openSquadModal('${me.id}')">👥 Squads &amp; fixture difficulty</button>`;
  } else if (pwCoupon === "specials") body = pre.filter((x) => x.specialMarkets && x.specialMarkets.length).map((x) => `<div class="card"><h3 style="margin:0">📅 ${esc(x.name)}</h3>${specialMarketsBoard(x, false)}</div>`).join("");
  else if (pwCoupon === "algo") body = vAlgoZone();
  else if (pwCoupon === "ask") body = bespokeRequestCard();
  else
    body =
      seasonBetsSummaryCard() +
      (upcoming.length
        ? `<div class="pw-h"><h4>Later gameweeks</h4><span>Not bettable yet</span></div>${upcoming.slice(0, 3).map((x) => vGwBoard(x, false, "upcoming")).join("")}${upcoming.length > 3 ? `<p class="muted small">${upcoming.length - 3} more gameweeks have fixtures; their odds appear once the house publishes them.</p>` : ""}`
        : "");
  const mobile = isMobileLayout();
  const slipHtml = vSlip();
  return `<div class="grid2"><div>
    <h2>Bet Builder</h2>
    <div class="sectabs">
      <button class="active" onclick="builderSec='pre';render()">📅 Pre-match<span class="cnt">${pre.length}</span></button>
      <button onclick="builderSec='inplay';render()">🔴 In-Play</button>
    </div>
    <div class="pw-seg" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${pwCoupon === k}" class="${pwCoupon === k ? "on" : ""}" onclick="pwCoupon='${k}';render()">${l}</button>`).join("")}</div>
    ${body}
    ${mobile ? `<div id="pwSlip" class="slip" style="position:static;margin:14px 0">${slipHtml}</div>` : ""}
  </div>
  ${mobile ? "" : `<div class="slip" id="pwSlip">${slipHtml}</div>`}</div>
  ${pwSlipBar()}`;
}
