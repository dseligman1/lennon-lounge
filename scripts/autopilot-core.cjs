/* Lennon Lounge autopilot: pure decisions and message text. No network, no browser.
 *
 * The weekly cycle (2026-11-27, PROGRESS.md ROUND 22):
 *   1. release  ~24h before the gameweek's first Premier League kickoff: odds reset to the
 *               model's recommendation, published, odds poster made and queued for WhatsApp.
 *   2. trends   2-3 "how the bets are doing" updates as Premier League games finish
 *               (after ~3-5, ~5-7 and optionally ~8-9 games, waiting for a lull in live games).
 *   3. settle   once every Draft match has its final score: accepted bets graded, unreviewed
 *               bets expire (after a warning and a grace period), recap poster queued.
 * Every WhatsApp item goes into an outbox; Dan gets a push and sends it with one tap.
 */
const MIN = 60000,
  H = 60 * MIN;

const DEFAULTS = {
  enabled: true,
  releaseHoursBefore: 24,
  settleGraceHours: 12,
  trendUpdates: true,
  shareTeams: ["selig"],
};

// Update k fires once at least `min` games are done (and 2 more than the last update), at a
// lull with no game in progress, or straight away once `max` games are done.
const TREND_WINDOWS = [
  { min: 3, max: 5 },
  { min: 5, max: 7 },
  { min: 8, max: 99, gapHours: 2 },
];

const arr = (x) =>
  Array.isArray(x) ? x.filter(Boolean) : Object.values(x || {}).filter(Boolean);

const OPEN_BET = ["pending", "counter_house", "counter_user"];

function config(saved) {
  return { ...DEFAULTS, ...(saved || {}) };
}

// fixtures: classic FPL /api/fixtures rows for one event.
function fixtureSummary(fixtures) {
  const rows = arr(fixtures).filter((f) => f.kickoff_time);
  const done = (f) => !!(f.finished_provisional || f.finished);
  const kicks = rows.map((f) => Date.parse(f.kickoff_time));
  return {
    total: rows.length,
    finished: rows.filter(done).length,
    live: rows.filter((f) => f.started && !done(f)).length,
    started: rows.filter((f) => f.started).length,
    firstKickoff: kicks.length ? Math.min(...kicks) : null,
    lastKickoff: kicks.length ? Math.max(...kicks) : null,
    allFinished: rows.length > 0 && rows.every(done),
  };
}

function appGw(gameweeks, ev) {
  const list = arr(gameweeks).filter((g) => Number(g.event) === Number(ev));
  // Prefer the live/settled copy if a stray duplicate draft exists.
  return (
    list.find((g) => g.status === "open") ||
    list.find((g) => g.status === "settled") ||
    list[0] ||
    null
  );
}

// Mirrors fplScoresReady() in index.html / gwScoresReady() in sync-fpl.cjs: every real match in
// the gameweek has a final Draft result in synced history.
function scoresReady(history, g) {
  const real = arr(g.matches).filter((m) => m.home && m.away);
  if (!real.length) return false;
  const hs = arr(history).filter((h) => Number(h.event) === Number(g.event));
  return real.every((m) =>
    hs.some(
      (h) =>
        (h.a === m.home && h.b === m.away) || (h.a === m.away && h.b === m.home),
    ),
  );
}

function trendDue(rec, s, now) {
  const sent = arr(rec.updates);
  const k = sent.length;
  if (k >= TREND_WINDOWS.length || s.allFinished || s.finished >= s.total)
    return null;
  const w = TREND_WINDOWS[k],
    last = sent[k - 1];
  const need = Math.max(w.min, (last ? last.finished : 0) + 2);
  if (s.finished < need) return null;
  if (s.live > 0 && s.finished < w.max) return null;
  if (w.gapHours && last && now - last.at < w.gapHours * H) return null;
  return { index: k, finished: s.finished, total: s.total };
}

/* input: {now, config, fixturesByEvent:{ev:[rows]}, state:{gameweeks,bets,history}, ap:{gws:{ev:rec}, lastSyncAt}}
 * returns {actions:[...], active, nextCheckAt, notes:[]} */
function decide(input) {
  const { now, fixturesByEvent } = input;
  const cfg = config(input.config);
  const state = input.state || {};
  const ap = input.ap || {};
  const recs = ap.gws || {};
  const rec = (ev) => recs[ev] || {};
  const actions = [],
    notes = [];
  let nextCheckAt = now + 15 * MIN;
  const soon = (t) => {
    if (t && t > now) nextCheckAt = Math.min(nextCheckAt, t);
  };
  let active = false;

  if (!cfg.enabled) {
    return { actions, active: false, nextCheckAt: now + H, notes: ["paused"] };
  }

  const events = Object.keys(fixturesByEvent || {})
    .map(Number)
    .sort((a, b) => a - b);
  const sums = Object.fromEntries(
    events.map((ev) => [ev, fixtureSummary(fixturesByEvent[ev])]),
  );

  // 1. Release: the first event that hasn't kicked off yet.
  const nextEv = events.find(
    (ev) => sums[ev].total && sums[ev].started === 0 && sums[ev].firstKickoff > now,
  );
  if (nextEv != null) {
    const s = sums[nextEv],
      r = rec(nextEv),
      g = appGw(state.gameweeks, nextEv);
    const releaseAt = s.firstKickoff - cfg.releaseHoursBefore * H;
    // The app's own cutoff is 80 min before kickoff; leave at least two hours of betting.
    const lastChance = s.firstKickoff - 3 * H;
    if (releaseAt - now <= 30 * H) active = true;
    if (!r.released && !r.releaseSkipped) {
      if (g && (g.status === "open" || g.status === "settled")) {
        actions.push({ type: "note-released", ev: nextEv, gwId: g.id, by: "manual" });
      } else if (g && g.normalOff) {
        actions.push({ type: "note-released", ev: nextEv, gwId: g.id, by: "in-play-only" });
      } else if (now >= releaseAt && now < lastChance) {
        if ((r.releaseFailures || 0) < 3)
          actions.push({ type: "release", ev: nextEv, gwId: g ? g.id : null, kickoff: s.firstKickoff });
        else if (!r.releaseGaveUp) actions.push({ type: "release-gave-up", ev: nextEv });
      } else if (now >= lastChance && !r.missedWarned) {
        actions.push({ type: "release-missed", ev: nextEv, kickoff: s.firstKickoff });
      } else {
        soon(releaseAt);
        notes.push(
          `GW${nextEv} release due ${new Date(releaseAt).toISOString()}`,
        );
      }
    }
  }

  // 2 & 3. Every published, unsettled gameweek linked to an FPL event.
  for (const g of arr(state.gameweeks)) {
    if (g.status !== "open" || !g.event) continue;
    const s = sums[g.event];
    if (!s || !s.total) continue;
    const r = rec(g.event);
    if (s.started === 0) continue; // published, waiting for kickoff
    active = true;
    if (s.live > 0) soon(now + 5 * MIN);
    if (!s.allFinished) {
      if (cfg.trendUpdates) {
        const due = trendDue(r, s, now);
        if (due) actions.push({ type: "trend", ev: g.event, gwId: g.id, ...due, live: s.live });
      }
      // Fixtures still to start: look again shortly after the next kickoff.
      const upcoming = arr(fixturesByEvent[g.event])
        .map((f) => Date.parse(f.kickoff_time))
        .filter((t) => t > now);
      if (upcoming.length) soon(Math.min(...upcoming) + 100 * MIN);
      continue;
    }
    // All Premier League games finished: settle once Draft has every final score.
    if (r.settled) continue;
    if (!scoresReady(state.history, g)) {
      if (!ap.lastSyncAt || now - ap.lastSyncAt >= 20 * MIN)
        actions.push({ type: "sync-fpl", ev: g.event });
      soon(now + 10 * MIN);
      continue;
    }
    const pending = arr(state.bets).filter(
      (b) => b.gwId === g.id && OPEN_BET.includes(b.status),
    );
    if (pending.length && !r.pendingWarnedAt) {
      actions.push({ type: "warn-pending", ev: g.event, gwId: g.id, count: pending.length });
      soon(now + cfg.settleGraceHours * H);
    } else if (
      pending.length &&
      now - r.pendingWarnedAt < cfg.settleGraceHours * H
    ) {
      soon(r.pendingWarnedAt + cfg.settleGraceHours * H);
      notes.push(`GW${g.event}: ${pending.length} bet(s) awaiting review before settling`);
    } else if ((r.settleFailures || 0) < 3) {
      actions.push({ type: "settle", ev: g.event, gwId: g.id, expiring: pending.length });
    } else if (!r.settleGaveUp) {
      actions.push({ type: "settle-gave-up", ev: g.event });
    }
  }

  return { actions, active, nextCheckAt: Math.max(nextCheckAt, now + MIN), notes };
}

/* ---------------- Trend message ---------------- */

const money = (n) => "£" + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const pct = (p) => Math.round(p * 100) + "%";

// Live status of one leg from the Matchday snapshot (current points + model probabilities).
// Returns {icon, p, text}: p is the model's chance of the leg landing (null when unknown).
function legTrend(leg, g, snap) {
  const out = { icon: "⏳", p: null, text: leg.label || "Leg" };
  if (!snap || !snap.matches) return out;
  const byId = snap.matches;
  const teams = snap.teams || {};
  const doneTeam = (tid) => teams[tid] && teams[tid].remainingPlayers === 0;
  const findMatch = (tid) =>
    Object.values(byId).find((m) => m.home === tid || m.away === tid);
  const ptsOf = (tid) => {
    const m = findMatch(tid);
    if (!m) return null;
    return m.home === tid ? m.currentHome : m.currentAway;
  };
  if (leg.type === "match" || (!leg.kind && leg.matchId && leg.pick)) {
    const m = byId[leg.matchId];
    if (!m || m.currentHome == null) return out;
    const final = doneTeam(m.home) && doneTeam(m.away);
    const lead =
      m.currentHome === m.currentAway
        ? "draw"
        : m.currentHome > m.currentAway
          ? "home"
          : "away";
    const p = m.probabilities ? Number(m.probabilities[leg.pick]) : null;
    out.text += ` (${m.currentHome}–${m.currentAway})`;
    if (final) {
      out.icon = lead === leg.pick ? "✅" : "❌";
      out.p = lead === leg.pick ? 1 : 0;
    } else {
      out.icon = lead === leg.pick ? "🟢" : "🟠";
      out.p = Number.isFinite(p) ? p : null;
    }
    return out;
  }
  if (leg.kind === "team_pts" || leg.kind === "haul") {
    const pts = ptsOf(leg.teamId);
    if (pts == null) return out;
    out.text += ` (${pts} pts)`;
    const final = doneTeam(leg.teamId);
    const over = leg.kind === "haul" || leg.dir === "over";
    const hit = leg.kind === "haul" ? pts >= leg.line : pts > leg.line;
    if (over && hit) Object.assign(out, { icon: "✅", p: 1 });
    else if (!over && pts >= leg.line) Object.assign(out, { icon: "❌", p: 0 });
    else if (final) Object.assign(out, over ? { icon: "❌", p: 0 } : { icon: "✅", p: 1 });
    else out.icon = over ? "🟠" : "🟢";
    return out;
  }
  if (leg.kind === "match_total") {
    const m = byId[leg.matchId];
    if (!m || m.currentHome == null) return out;
    const tot = m.currentHome + m.currentAway;
    out.text += ` (${tot} so far)`;
    const final = doneTeam(m.home) && doneTeam(m.away);
    if (leg.dir === "over" && tot > leg.line) Object.assign(out, { icon: "✅", p: 1 });
    else if (leg.dir !== "over" && tot >= leg.line) Object.assign(out, { icon: "❌", p: 0 });
    else if (final) Object.assign(out, leg.dir === "over" ? { icon: "❌", p: 0 } : { icon: "✅", p: 1 });
    else out.icon = leg.dir === "over" ? "🟠" : "🟢";
    return out;
  }
  if (leg.kind === "top_score" || leg.kind === "bottom_score") {
    const all = Object.values(byId).flatMap((m) => [
      [m.home, m.currentHome],
      [m.away, m.currentAway],
    ]);
    if (!all.length || all.some(([, p]) => p == null)) return out;
    const target =
      leg.kind === "top_score"
        ? Math.max(...all.map((x) => x[1]))
        : Math.min(...all.map((x) => x[1]));
    const mine = all.find(([t]) => t === leg.teamId);
    if (mine) out.text += ` (${mine[1]} pts)`;
    out.icon = mine && mine[1] === target ? "🟢" : "🟠";
    return out;
  }
  return out;
}

function betTrend(bet, g, snap) {
  const legs = arr(bet.legs).map((l) => legTrend(l, g, snap));
  const dead = legs.some((l) => l.p === 0);
  const won = legs.length && legs.every((l) => l.p === 1);
  const known = legs.every((l) => l.p != null);
  const chance = dead ? 0 : known ? legs.reduce((a, l) => a * l.p, 1) : null;
  const returns =
    Math.round(Number(bet.stake || 0) * Number(bet.effOdds || 0) * 100) / 100;
  const icon = dead ? "🔴" : won ? "✅" : chance == null ? "🟡" : chance >= 0.5 ? "🟢" : "🟠";
  return { bet, legs, dead, won, chance, returns, icon };
}

function teamLabel(teams, id) {
  const t = arr(teams).find((x) => x.id === id);
  if (!t) return id;
  return t.owner ? `${t.owner} (${t.name})` : t.name;
}

/* {g, bets, teams, snap, update:{index, finished, total}, link} -> WhatsApp text */
function trendText({ g, bets, teams, snap, update, link }) {
  const live = arr(bets).filter(
    (b) => b.gwId === g.id && (b.status === "accepted" || b.status === "pending"),
  );
  if (!live.length) return null;
  const rows = live
    .map((b) => betTrend(b, g, snap))
    .sort(
      (a, b) =>
        (b.chance == null ? 0.5 : b.chance) - (a.chance == null ? 0.5 : a.chance) ||
        b.returns - a.returns,
    );
  const alive = rows.filter((r) => !r.dead).length;
  const head = [
    `📈 ${String(g.name || "GW" + g.event).toUpperCase()} BET TRACKER · update ${update.index + 1}`,
    `⚽ ${update.finished}/${update.total} Premier League games done · ${alive}/${rows.length} slips still alive`,
    "",
  ];
  const body = rows.flatMap((r) => {
    const legs = r.legs.length;
    const kind = legs === 1 ? "single" : legs === 2 ? "double" : legs === 3 ? "treble" : `${legs}-fold`;
    const top = `${r.icon} ${teamLabel(teams, r.bet.teamId)}: ${money(r.bet.stake)} ${kind} @ ${Number(r.bet.effOdds).toFixed(2)} → ${money(r.returns)}`;
    const detail = r.legs.map((l) => `    ${l.icon} ${l.text}${l.p != null && l.p > 0 && l.p < 1 ? ` · ${pct(l.p)}` : ""}`);
    const status = r.dead
      ? "    💀 Dead and buried"
      : r.won
        ? "    💰 Landed, just needs the whistle"
        : r.chance != null
          ? `    📊 ~${pct(r.chance)} to land`
          : "";
    return [top, ...detail, ...(status ? [status] : []), ""];
  });
  const atRisk = rows
    .filter((r) => !r.dead && r.bet.status === "accepted")
    .reduce((a, r) => a + r.returns, 0);
  const foot = [
    `🏦 House sweating on ${money(atRisk)} of live returns`,
    "🟢 ahead · 🟠 behind · ✅ landed · ❌ gone. Chances are the Algo's live estimates.",
    link ? `👉 ${link}` : "",
  ].filter(Boolean);
  return [...head, ...body, ...foot].join("\n");
}

/* ---------------- Control tower feed ----------------
 * The browser can't reach the classic FPL API, so each tick saves a small per-gameweek summary
 * (kickoffs, games done/live, release time) for Back Office → 🗼 Control tower to draw its tracker.
 * Covers every published-but-unsettled gameweek, the next one to release, and the one before it. */
function timeline({ now, config: saved, fixturesByEvent, state }) {
  const cfg = config(saved);
  const events = Object.keys(fixturesByEvent || {}).map(Number).sort((a, b) => a - b);
  const sums = Object.fromEntries(events.map((ev) => [ev, fixtureSummary(fixturesByEvent[ev])]));
  const nextEv = events.find((ev) => sums[ev].total && sums[ev].started === 0 && sums[ev].firstKickoff > now);
  const want = new Set();
  arr(state && state.gameweeks).forEach((g) => {
    if (g.status === "open" && g.event) want.add(Number(g.event));
  });
  if (nextEv != null) {
    want.add(nextEv);
    if (sums[nextEv - 1]) want.add(nextEv - 1);
  }
  const out = {};
  for (const ev of want) {
    const s = sums[ev];
    if (!s || !s.total) continue;
    const kickoffs = arr(fixturesByEvent[ev])
      .map((f) => Date.parse(f.kickoff_time))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    out[ev] = {
      total: s.total,
      finished: s.finished,
      live: s.live,
      started: s.started,
      firstKickoff: s.firstKickoff,
      lastKickoff: s.lastKickoff,
      releaseAt: s.firstKickoff - cfg.releaseHoursBefore * H,
      kickoffs,
    };
  }
  return out;
}

module.exports = {
  timeline,
  DEFAULTS,
  TREND_WINDOWS,
  config,
  fixtureSummary,
  appGw,
  scoresReady,
  trendDue,
  decide,
  legTrend,
  betTrend,
  trendText,
};
