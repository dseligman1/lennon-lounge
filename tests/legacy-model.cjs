const asArr = (x) => (Array.isArray(x) ? x : Object.values(x || {}));
const MODEL = {
  FORM_DECAY: 0.82,
  FORM_PRIOR_W: 1.5,
  FORM_BLEND: 0.3,
  FDR_SENS: 0.075,
  DOUBLE_MULT: 1.8,
  MIN_MINUTES_SHARE: 0.35,
  SQUAD_W: 0.7,
  FORM_W: 0.3,
  SQUAD_REL_MIN: 0.75,
  SQUAD_REL_MAX: 1.3,
  SQUAD_TRANSFER: 0.45,
  SCORE_SD: 15,
  TALENT_SD_MIN: 2,
  TALENT_SD_MAX: 6,
  BASE_NOISE_VAR: 16,
  PROJ_DEV_MAX: 0.14,
  DRAW_BASE: 0.068,
  DRAW_PRIOR_N: 20,
  DRAW_TILT: 0.1,
  DRAW_SPREAD: 10,
  DRAW_P_MIN: 0.05,
  DRAW_P_MAX: 0.07,
  GAP_SOFTCAP: 4.2,
  XI: 11,
};
const SD = 15;
const SD_DIFF = SD * Math.SQRT2;
const phi = (x) => 1 / (1 + Math.exp(-1.702 * x));
const pOver = (line, avg) => 1 - phi((line - avg) / SD);
const ODDS_EDGE = { MIN: 10, MID: 16.3, MAX: 28 };
const FPL_AVAIL = { a: 1, d: 0.6, i: 0, s: 0, u: 0, n: 0 };

function edgedOdds(fairP, edgePct) {
  const k = 1 - edgePct / 100;
  const pMax = Math.min(0.97, k / 1.05);
  const fair = 1 / Math.min(pMax, Math.max(0.03, fairP));
  return Math.max(1.05, Math.floor(fair * k * 100) / 100);
}
function houseEdgePct(settings) {
  let s = Math.round(Number(settings && settings.oddsCompetitiveness));
  if (isNaN(s)) s = 10;
  s = Math.max(1, Math.min(20, s));
  const e =
    s <= 10
      ? ODDS_EDGE.MAX - ((s - 1) * (ODDS_EDGE.MAX - ODDS_EDGE.MID)) / 9
      : ODDS_EDGE.MID - ((s - 10) * (ODDS_EDGE.MID - ODDS_EDGE.MIN)) / 10;
  return Math.max(
    ODDS_EDGE.MIN,
    Math.min(ODDS_EDGE.MAX, Math.round(e * 10) / 10),
  );
}
function squadIds(state, teamId) {
  return asArr(((state.fpl || {}).squads || {})[teamId]);
}
function lineupIds(state, teamId) {
  return asArr(((state.fpl || {}).lineups || {})[teamId]);
}
function plFixturesFor(state, ev) {
  return asArr(((state.fpl || {}).plFixtures || {})[ev]);
}
function clubFixture(state, plTeamId, ev) {
  if (!plTeamId || !ev) return null;
  const list = plFixturesFor(state, ev).filter(
    (f) => f && (f.h === plTeamId || f.a === plTeamId),
  );
  if (!list.length) return null;
  const f = list[0],
    home = f.h === plTeamId;
  return { home, fdr: Number(home ? f.hd : f.ad) || 0, count: list.length };
}
function teamResults(state, tid, beforeEvent) {
  const out = [];
  const gws = asArr(state.gameweeks);
  const localEvents = new Set(
    gws
      .filter((g) => g && g.event && asArr(g.matches).some((m) => m.result))
      .map((g) => g.event),
  );
  asArr(state.history).forEach((h) => {
    if (localEvents.has(h.event)) return;
    if (h.a === tid) out.push({ event: Number(h.event) || 0, pts: h.ap });
    if (h.b === tid) out.push({ event: Number(h.event) || 0, pts: h.bp });
  });
  gws.forEach((g) =>
    asArr(g.matches).forEach((m) => {
      if (!m.result) return;
      if (m.home === tid)
        out.push({ event: Number(g.event) || 0, pts: m.result.homePts });
      if (m.away === tid)
        out.push({ event: Number(g.event) || 0, pts: m.result.awayPts });
    }),
  );
  const cut = Number(beforeEvent) || 0;
  return out
    .filter((r) => !cut || !r.event || r.event < cut)
    .sort((a, b) => (b.event || 0) - (a.event || 0));
}
function teamFormProj(state, tid, beforeEvent) {
  const res = teamResults(state, tid, beforeEvent);
  const base = (state.stats && state.stats[tid] && state.stats[tid].base) || 50;
  let sw = MODEL.FORM_PRIOR_W,
    sx = base * MODEL.FORM_PRIOR_W,
    w1 = 0,
    w2 = 0;
  res.forEach((r, i) => {
    const wt = Math.pow(MODEL.FORM_DECAY, i);
    sw += wt;
    w1 += wt;
    w2 += wt * wt;
    sx += wt * (Number(r.pts) || 0);
  });
  return {
    proj: sx / sw,
    weight: w1,
    n: res.length,
    neff: w2 > 0 ? (w1 * w1) / w2 : 0,
    att: w1 > 0 ? w1 / (w1 + MODEL.FORM_PRIOR_W) : 0,
  };
}
// Batch 52 — empirical-Bayes/James-Stein shrink on the recency-weighted form deviation.
// Reads the league's own data: observed cross-team variance of form levels minus the mean
// sampling variance of those levels = tau^2 (the REAL spread of manager talent); each
// team's deviation is then believed in the ratio tau^2/(tau^2 + its own sampling
// variance). See index.html's formReliability() header comment for the full derivation —
// ported verbatim, no new tuning constants beyond MODEL.SCORE_SD/TALENT_SD_MIN/MAX/
// BASE_NOISE_VAR already carried across above.
function formReliability(ids, form) {
  const rows = ids.filter((t) => form[t]);
  if (!rows.length)
    return { mu: 50, tau2: MODEL.TALENT_SD_MIN * MODEL.TALENT_SD_MIN, r: {} };
  const mu = rows.reduce((s, t) => s + form[t].proj, 0) / rows.length;
  const varObs =
    rows.reduce((s, t) => s + Math.pow(form[t].proj - mu, 2), 0) / rows.length;
  const noiseOf = (t) => {
    const f = form[t],
      a = f.att;
    const res = f.neff > 0 ? (MODEL.SCORE_SD * MODEL.SCORE_SD) / f.neff : 0;
    return a * a * res + (1 - a) * (1 - a) * MODEL.BASE_NOISE_VAR;
  };
  const meanNoise = rows.reduce((s, t) => s + noiseOf(t), 0) / rows.length;
  const lo = MODEL.TALENT_SD_MIN * MODEL.TALENT_SD_MIN,
    hi = MODEL.TALENT_SD_MAX * MODEL.TALENT_SD_MAX;
  const tau2 = Math.max(lo, Math.min(hi, varObs - meanNoise));
  const r = {};
  rows.forEach((t) => {
    const nv = noiseOf(t);
    r[t] = nv > 0 ? tau2 / (tau2 + nv) : 1;
  });
  return { mu, tau2, r, varObs, meanNoise };
}
function playerAvailability(p) {
  const st = (p && p.st) || "a";
  if (st === "i" || st === "s" || st === "u" || st === "n") return 0;
  const cp = p && p.cp != null ? Number(p.cp) : null;
  if (cp != null && !isNaN(cp)) return Math.max(0, Math.min(1, cp / 100));
  return FPL_AVAIL[st] != null ? FPL_AVAIL[st] : 1;
}
function squadMinutesContext(state) {
  const P = (state.fpl && state.fpl.players) || {};
  let max = 0;
  Object.keys(P).forEach((k) => {
    const m = Number(P[k] && P[k].mn) || 0;
    if (m > max) max = m;
  });
  return {
    maxMinutes: max,
    games: max > 0 ? Math.max(1, Math.round(max / 90)) : 0,
  };
}
function playerStartShare(p, ctx) {
  if (!ctx || !ctx.games) return 1;
  const mn = Number(p && p.mn) || 0;
  return Math.max(MODEL.MIN_MINUTES_SHARE, Math.min(1, mn / (90 * ctx.games)));
}
function playerFixtureMult(state, club, ev) {
  if (!ev) return 1;
  const fx = clubFixture(state, club, ev);
  if (!fx) return 0;
  let m = 1 + (3 - (Number(fx.fdr) || 3)) * MODEL.FDR_SENS;
  if (fx.count > 1) m *= MODEL.DOUBLE_MULT;
  return Math.max(0.5, m);
}
function squadExpected(state, tid, ev) {
  const P = (state.fpl && state.fpl.players) || {};
  const ids = squadIds(state, tid);
  if (!ids.length) return null;
  const ctx = squadMinutesContext(state);
  const haveFx = ev ? plFixturesFor(state, ev).length > 0 : false;
  const named = new Set(lineupIds(state, tid).map(Number));
  const rows = ids
    .map((id) => {
      const p = P[id] || P[String(id)];
      if (!p) return null;
      const form = Number(p.f) || 0,
        ppg = Number(p.ppg) || 0;
      const basePts =
        form > 0 ? MODEL.FORM_BLEND * form + (1 - MODEL.FORM_BLEND) * ppg : ppg;
      const av = playerAvailability(p);
      const fm = haveFx ? playerFixtureMult(state, Number(p.t) || 0, ev) : 1;
      return {
        id: Number(id),
        xp: Math.max(0, basePts * av * playerStartShare(p, ctx) * fm),
        av,
      };
    })
    .filter(Boolean);
  if (!rows.length) return null;
  const namedRows = rows.filter((r) => named.has(r.id));
  const xi =
    namedRows.length >= MODEL.XI
      ? namedRows
      : rows
          .slice()
          .sort((a, b) => b.xp - a.xp)
          .slice(0, MODEL.XI);
  return {
    xp: xi.reduce((s, r) => s + r.xp, 0),
    n: xi.length,
    squadSize: rows.length,
    doubts: rows.filter((r) => r.av > 0 && r.av < 1).length,
    out: rows.filter((r) => r.av === 0).length,
  };
}
function projectTeams(state, ev) {
  const ids = asArr(state.teams).map((t) => t.id);
  const form = {},
    sq = {};
  ids.forEach((tid) => {
    form[tid] = teamFormProj(state, tid, ev);
    sq[tid] = squadExpected(state, tid, ev);
  });
  const REL = formReliability(ids, form);
  const level = REL.mu || 50;
  const withSq = ids.filter((tid) => sq[tid]);
  const sqMean = withSq.length
    ? withSq.reduce((s, tid) => s + sq[tid].xp, 0) / withSq.length
    : 0;
  const cap = MODEL.PROJ_DEV_MAX * level;
  const out = {};
  ids.forEach((tid) => {
    const f = form[tid];
    let rel = 1;
    const haveSq = sqMean > 0 && !!sq[tid];
    if (haveSq)
      rel = Math.max(
        MODEL.SQUAD_REL_MIN,
        Math.min(MODEL.SQUAD_REL_MAX, sq[tid].xp / sqMean),
      );
    const r = REL.r && REL.r[tid] != null ? REL.r[tid] : 0;
    const devSquad = (rel - 1) * MODEL.SQUAD_TRANSFER * level;
    const devForm = (f.proj - level) * r;
    const wS = haveSq ? MODEL.SQUAD_W : 0,
      wF = MODEL.FORM_W,
      wSum = wS + wF;
    const dev = wSum > 0 ? (wS * devSquad + wF * devForm) / wSum : 0;
    out[tid] = {
      proj: Math.max(5, level + Math.max(-cap, Math.min(cap, dev))),
      formProj: f.proj,
      weight: f.weight,
      n: f.n,
      squad: sq[tid] || null,
      squadRel: rel,
      level,
      formRel: r,
      devSquad,
      devForm,
      dev,
    };
  });
  return out;
}
function leagueDrawRate(state) {
  let d = 0,
    n = 0;
  const gws = asArr(state.gameweeks);
  const localEvents = new Set(
    gws
      .filter((g) => g && g.event && asArr(g.matches).some((m) => m.result))
      .map((g) => g.event),
  );
  asArr(state.history).forEach((h) => {
    if (localEvents.has(h.event)) return;
    n++;
    if (h.ap === h.bp) d++;
  });
  gws.forEach((g) =>
    asArr(g.matches).forEach((m) => {
      if (!m.result) return;
      n++;
      if (m.result.homePts === m.result.awayPts) d++;
    }),
  );
  return (d + MODEL.DRAW_BASE * MODEL.DRAW_PRIOR_N) / (n + MODEL.DRAW_PRIOR_N);
}
function fairMatchProbs(state, homeId, awayId, ev, projMap) {
  const P = projMap || projectTeams(state, ev);
  const a = P[homeId] || { proj: 50 },
    b = P[awayId] || { proj: 50 };
  const raw = a.proj - b.proj;
  // Batch 52 — soft cap on the priced gap (the evidence shrink moved into
  // projectTeams()/formReliability() above, where it's measured, not invented; applying
  // it here too would shrink twice). tanh saturates at +-GAP_SOFTCAP so small gaps pass
  // through unchanged and large ones are treated as mostly model error.
  const cap = MODEL.GAP_SOFTCAP;
  const D = cap * Math.tanh(raw / cap);
  // Batch 52 — DRAW_BASE is the house's policy anchor; the league's own measured tie rate
  // (leagueDrawRate) may only tilt it by +-DRAW_TILT, then the taper (DRAW_SPREAD) and the
  // DRAW_P_MIN/MAX clamp keep the published draw inside the house's 12-16 band.
  const anchor = Math.max(
    MODEL.DRAW_BASE * (1 - MODEL.DRAW_TILT),
    Math.min(MODEL.DRAW_BASE * (1 + MODEL.DRAW_TILT), leagueDrawRate(state)),
  );
  const pD = Math.max(
    MODEL.DRAW_P_MIN,
    Math.min(
      MODEL.DRAW_P_MAX,
      anchor * Math.exp(-Math.pow(D / MODEL.DRAW_SPREAD, 2) / 2),
    ),
  );
  const pHrel = phi(D / SD_DIFF);
  return {
    home: (1 - pD) * pHrel,
    draw: pD,
    away: (1 - pD) * (1 - pHrel),
    diff: D,
    rawDiff: raw,
    shrink: raw ? D / raw : 1,
    projHome: a.proj,
    projAway: b.proj,
  };
}
function recOdds(state, homeId, awayId, ev, projMap) {
  const p = fairMatchProbs(state, homeId, awayId, ev, projMap);
  const edge = houseEdgePct(state.settings);
  return {
    home: edgedOdds(p.home, edge),
    draw: edgedOdds(p.draw, edge),
    away: edgedOdds(p.away, edge),
  };
}

module.exports = { projectTeams, recOdds, fairMatchProbs };
