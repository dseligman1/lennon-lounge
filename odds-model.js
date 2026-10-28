/* Shared browser/Node forecasting engine. No network, DOM, clock or mutable global state.
 * Forecast probabilities are separate from unchanged house pricing policy.
 * Confidence = simulation P(within ±2 player / ±10 team points), not P(exact score).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LennonModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "2026.10-player-v1",
    arr = (x) =>
      Array.isArray(x) ? x.filter(Boolean) : Object.values(x || {}),
    clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  const phi = (x) => 1 / (1 + Math.exp(-1.702 * x));
  function rng(seed) {
    let x = seed >>> 0;
    return () => {
      x += 0x6d2b79f5;
      let t = Math.imul(x ^ (x >>> 15), 1 | x);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poisson(mu, r) {
    let n = 0,
      p = 1,
      l = Math.exp(-Math.max(0, mu));
    do {
      n++;
      p *= r();
    } while (p > l && n < 40);
    return n - 1;
  }
  function houseEdgePct(settings) {
    let s = Math.round(Number(settings && settings.oddsCompetitiveness));
    if (!Number.isFinite(s)) s = 10;
    s = clamp(s, 1, 20);
    return (
      Math.round(
        clamp(
          s <= 10
            ? 28 - ((s - 1) * (28 - 16.3)) / 9
            : 16.3 - ((s - 10) * (16.3 - 10)) / 10,
          10,
          28,
        ) * 10,
      ) / 10
    );
  }
  function edgedOdds(p, edge) {
    const k = 1 - edge / 100;
    return Math.max(
      1.05,
      Math.floor((k / clamp(p, 0.03, Math.min(0.97, k / 1.05))) * 100) / 100,
    );
  }
  function teamResults(state, tid, ev) {
    const by = new Map();
    for (const h of arr(state.history)) {
      if (h.event > 0 && h.event < ev) {
        if (h.a === tid) by.set(h.event, Number(h.ap));
        if (h.b === tid) by.set(h.event, Number(h.bp));
      }
    }
    for (const g of arr(state.gameweeks)) {
      if (g.event > 0 && g.event < ev)
        for (const m of arr(g.matches)) {
          if (m.result) {
            if (m.home === tid) by.set(g.event, Number(m.result.homePts));
            if (m.away === tid) by.set(g.event, Number(m.result.awayPts));
          }
        }
    }
    return [...by]
      .sort((a, b) => b[0] - a[0])
      .map(([event, pts]) => ({ event, pts }));
  }
  function fixtures(state, ev) {
    return arr((state.fpl || {}).plFixtures?.[ev]);
  }
  function clubRates(state, ev) {
    const past = Object.entries((state.fpl || {}).plFixtures || {})
      .filter(([n]) => Number(n) < ev)
      .flatMap(([, f]) => arr(f))
      .filter(
        (f) => f.finished && Number.isFinite(f.hg) && Number.isFinite(f.ag),
      )
      .sort((a, b) => (b.k || 0) - (a.k || 0));
    const out = {};
    for (const id of new Set(past.flatMap((f) => [f.h, f.a]))) {
      const fs = past.filter((f) => f.h === id || f.a === id).slice(0, 10);
      let w = 3,
        gf = 3 * 1.4,
        ga = 3 * 1.4;
      fs.forEach((f, i) => {
        const k = 0.84 ** i;
        w += k;
        gf += k * (f.h === id ? f.hg : f.ag);
        ga += k * (f.h === id ? f.ag : f.hg);
      });
      out[id] = { attack: gf / w, defence: ga / w, n: fs.length };
    }
    return out;
  }
  function fixtureRates(f, clubs) {
    const h = clubs[f.h],
      a = clubs[f.a];
    return {
      home: clamp(
        h && a
          ? 1.55 * (h.attack / 1.4) * (a.defence / 1.4)
          : 1.55 * (1 + (3 - (f.hd || 3)) * 0.15),
        0.25,
        3.8,
      ),
      away: clamp(
        h && a
          ? 1.25 * (a.attack / 1.4) * (h.defence / 1.4)
          : 1.25 * (1 + (3 - (f.ad || 3)) * 0.15),
        0.2,
        3.5,
      ),
    };
  }
  function profile(state, id, ev) {
    const fpl = state.fpl || {},
      p = fpl.players[id] || {},
      pos = Number(p.p) || 3;
    const hs = arr(fpl.playerHistory?.[id])
      .filter((h) => h.event < ev)
      .sort((a, b) => (b.k || b.event) - (a.k || a.event))
      .slice(0, 12);
    const games = Math.max(1, ev - 1);
    let w = 2,
      st =
        2 *
        clamp(
          p.mn != null
            ? Number(p.mn) / (90 * games)
            : hs.length
              ? avg(hs.map((h) => (h.starts ? 1 : 0)))
              : 0.8,
          0.15,
          0.95,
        ),
      appear = st,
      mins = st * 80;
    let exposure = 2,
      goals = 2 * [0, 0, 0.06, 0.2, 0.35][pos],
      assists = 2 * [0, 0, 0.08, 0.16, 0.12][pos],
      other = 2 * 0.6;
    const goalPts = pos === 1 ? 10 : pos === 2 ? 6 : pos === 3 ? 5 : 4,
      csPts = pos <= 2 ? 4 : pos === 3 ? 1 : 0;
    hs.forEach((h, i) => {
      const k = 0.85 ** i,
        m = Number(h.minutes) || 0;
      w += k;
      st += k * (h.starts ? 1 : 0);
      appear += k * (m > 0 ? 1 : 0);
      mins += k * m;
      exposure += (k * m) / 90;
      goals += k * (0.65 * (Number(h.xg) || 0) + 0.35 * (Number(h.goals) || 0));
      assists +=
        k * (0.65 * (Number(h.xa) || 0) + 0.35 * (Number(h.assists) || 0));
      const core =
        (m >= 60 ? 2 : m > 0 ? 1 : 0) +
        (h.goals || 0) * goalPts +
        (h.assists || 0) * 3 +
        (h.cs || 0) * csPts -
        (pos <= 2 ? Math.floor((h.gc || 0) / 2) : 0);
      other += k * ((Number(h.points) || 0) - core);
    });
    let av = { a: 1, d: 0.6, i: 0, s: 0, u: 0, n: 0 }[p.st || "a"] ?? 1;
    const cp = ev === Number(fpl.squadEvent) ? p.cp : p.cpn;
    if (!["i", "s", "u", "n"].includes(p.st) && cp != null)
      av = clamp(Number(cp) / 100, 0, 1);
    const start = clamp(st / w, 0.02, 0.99) * av,
      play = clamp(appear / w, start, 0.995) * av;
    return {
      id: Number(id),
      name: p.n || String(id),
      club: Number(p.t),
      pos,
      start,
      play: Math.max(start, play),
      minutes: clamp(mins / Math.max(0.01, appear), 15, 90),
      goalRate: goals / exposure,
      assistRate: assists / exposure,
      otherRate: clamp(other / exposure, -1, 3),
      goalPts,
      csPts,
      historyN: hs.length,
      availability: av,
      fallback: !hs.length,
      ppg: Number(p.ppg) || 2,
    };
  }
  // Legal Draft XI: one keeper, >=3 defenders, >=2 midfielders and >=1 forward.
  function bestXI(rows, value) {
    let best = [],
      bestV = -Infinity;
    for (let d = 3; d <= 5; d++)
      for (let m = 2; m <= 5; m++) {
        const f = 10 - d - m;
        if (f < 1 || f > 3) continue;
        const counts = { 1: 1, 2: d, 3: m, 4: f };
        let xi = [];
        for (let p = 1; p <= 4; p++)
          xi.push(
            ...rows
              .filter((x) => x.pos === p)
              .sort((a, b) => value(b) - value(a))
              .slice(0, counts[p]),
          );
        if (xi.length !== 11) continue;
        const v = xi.reduce((s, x) => s + value(x), 0);
        if (v > bestV) {
          bestV = v;
          best = xi;
        }
      }
    return best;
  }
  function legal(rows) {
    const c = (p) => rows.filter((x) => x.pos === p).length;
    return (
      rows.length === 11 && c(1) === 1 && c(2) >= 3 && c(3) >= 2 && c(4) >= 1
    );
  }
  function autoXI(selected, bench, played) {
    const xi = selected.slice();
    for (let i = 0; i < xi.length; i++) {
      if (played[xi[i].id]) continue;
      for (let j = 0; j < bench.length; j++) {
        const b = bench[j];
        if (!played[b.id] || xi.some((x) => x.id === b.id)) continue;
        const trial = xi.slice();
        trial[i] = b;
        if (legal(trial)) {
          xi[i] = b;
          break;
        }
      }
    }
    return xi;
  }
  function summary(xs, tol) {
    const mu = avg(xs),
      sorted = xs.slice().sort((a, b) => a - b);
    return {
      proj: mu,
      sd: Math.sqrt(avg(xs.map((x) => (x - mu) ** 2))),
      low: sorted[Math.floor(xs.length * 0.1)] || 0,
      high: sorted[Math.min(xs.length - 1, Math.floor(xs.length * 0.9))] || 0,
      confidence:
        (100 * xs.filter((x) => Math.abs(x - mu) <= tol).length) / xs.length,
      tolerance: tol,
    };
  }
  function forecast(state, ev, options = {}) {
    const fpl = state.fpl || {},
      N = options.samples || 2500,
      r = rng(options.seed ?? 84217 + Number(ev)),
      clubs = clubRates(state, ev),
      fx = fixtures(state, ev),
      ids = [
        ...new Set(
          Object.values(fpl.squads || {})
            .flatMap(arr)
            .map(Number),
        ),
      ];
    const ps = ids
        .filter((id) => fpl.players?.[id])
        .map((id) => profile(state, id, ev)),
      by = Object.fromEntries(ps.map((p) => [p.id, p]));
    const live = options.live || null,
      current = live?.teamPoints || {},
      livePlayers = live?.playerPoints || {},
      remaining = fx.filter((f) => !live || !f.finished);
    const expected = (p) => {
      const fs = fx.filter((f) => f.h === p.club || f.a === p.club);
      if (!fx.length) return p.ppg * p.play;
      return fs.reduce((s, f) => {
        const q = fixtureRates(f, clubs),
          gf = f.h === p.club ? q.home : q.away,
          ga = f.h === p.club ? q.away : q.home;
        return (
          s +
          p.play *
            (1 +
              p.start / Math.max(0.01, p.play) +
              ((p.goalRate * gf) / 1.4) * p.goalPts +
              ((p.assistRate * gf) / 1.4) * 3 +
              (p.csPts * Math.exp(-ga) * p.start) / Math.max(0.01, p.play) +
              p.otherRate)
        );
      }, 0);
    };
    ps.forEach((p) => (p.xp = expected(p)));
    const configs = {};
    for (const t of arr(state.teams)) {
      const rows = arr(fpl.squads?.[t.id])
        .map((id) => by[id])
        .filter(Boolean);
      const named = new Set(arr(fpl.lineups?.[t.id]).map(Number));
      const locked =
        Number(fpl.lineupEvent ?? fpl.squadEvent) === Number(ev) &&
        options.lineupsKnown !== false &&
        !!fpl.lineupsPublished;
      const validLocked = locked && legal(rows.filter((p) => named.has(p.id)));
      const selected = validLocked
        ? rows.filter((p) => named.has(p.id))
        : bestXI(rows, (p) => p.xp + (named.has(p.id) ? 0.4 : 0));
      configs[t.id] = {
        rows,
        selected,
        locked: validLocked,
        bench: rows
          .filter((p) => !selected.includes(p))
          .sort((a, b) => b.xp - a.xp),
      };
    }
    const teamSamples = Object.fromEntries(
        arr(state.teams).map((t) => [t.id, []]),
      ),
      playerSamples = Object.fromEntries(ps.map((p) => [p.id, []])),
      selectedCount = {},
      contribution = {};
    for (let n = 0; n < N; n++) {
      const scores = {},
        played = {};
      ps.forEach((p) => {
        scores[p.id] = Number(livePlayers[p.id]?.points) || 0;
        played[p.id] = (livePlayers[p.id]?.minutes || 0) > 0;
      });
      for (const f of remaining) {
        const rates = fixtureRates(f, clubs);
        const fraction =
          live && f.started
            ? clamp((90 - (Number(f.minutes) || 0)) / 90, 0, 1)
            : 1;
        const hg = poisson(rates.home * fraction, r),
          ag = poisson(rates.away * fraction, r);
        for (const [club, gf, ga, priorConceded] of [
          [f.h, hg, ag, f.ag || 0],
          [f.a, ag, hg, f.hg || 0],
        ]) {
          const rows = ps.filter((p) => p.club === club);
          const active = [];
          for (const p of rows) {
            const running = !!(live && f.started),
              known = livePlayers[p.id]?.fixtures?.[f.id];
            let on = r() < p.play,
              full = r() < p.start / Math.max(0.001, p.play),
              exposure = full ? clamp(p.minutes / 90, 0.67, 1) : 0.2;
            if (running) {
              // Per-fixture stats are required by the workflow: event totals cannot disambiguate doubles.
              const minutes = Number(known?.minutes) || 0,
                elapsed = Number(f.minutes) || 0;
              const subbed = minutes > 0 && minutes < elapsed - 3;
              on = minutes > 0 ? !subbed : r() < 0.2 * fraction;
              if (!on) continue;
              full = minutes + 90 * fraction >= 60;
              exposure = minutes > 0 ? 1 : 0.2;
              scores[p.id] +=
                (full && minutes < 60 ? 1 : 0) + (minutes === 0 ? 1 : 0);
              const oldCS = Number(known?.clean_sheets) || 0;
              const conceded = Number(known?.goals_conceded) || 0;
              scores[p.id] +=
                (full && ga + priorConceded === 0 ? p.csPts : 0) -
                oldCS * p.csPts;
              if (p.pos <= 2)
                scores[p.id] -=
                  Math.floor((conceded + ga) / 2) - Math.floor(conceded / 2);
            } else {
              if (!on) continue;
              scores[p.id] +=
                (full ? 2 : 1) +
                (full && ga === 0 ? p.csPts : 0) -
                (p.pos <= 2 ? Math.floor(ga / 2) : 0);
            }
            played[p.id] = true;
            // Residual covers bonus, saves, cards, defensive contribution; learned from points history.
            // During a match only the remaining fraction is added; accrued stats stay frozen.
            scores[p.id] +=
              poisson(Math.max(0, p.otherRate) * exposure * fraction, r) -
              (p.otherRate < 0 && r() < -p.otherRate * exposure * fraction
                ? 1
                : 0);
            active.push({ p, exposure });
          }
          // Shared goal events: no clean sheet can coexist with an opposing goal in this draw.
          for (let goal = 0; goal < gf; goal++) {
            const choose = (key, exclude) => {
              const weights = active.map((x) =>
                x.p.id === exclude ? 0 : x.p[key] * x.exposure,
              );
              const total = weights.reduce((a, b) => a + b, 0);
              let draw = r() * Math.max(1.4, total);
              for (let i = 0; i < active.length; i++) {
                draw -= weights[i];
                if (draw < 0) return active[i].p;
              }
              return null;
            };
            const scorer = choose("goalRate");
            if (scorer) scores[scorer.id] += scorer.goalPts;
            const assister =
              r() < 0.8 ? choose("assistRate", scorer?.id) : null;
            if (assister) scores[assister.id] += 3;
          }
        }
      }
      if (!fx.length && !live)
        for (const p of ps) {
          played[p.id] = r() < p.play;
          scores[p.id] = played[p.id] ? poisson(p.ppg, r) : 0;
        }
      for (const p of ps) playerSamples[p.id].push(scores[p.id]);
      for (const t of arr(state.teams)) {
        const c = configs[t.id];
        let selected = c.selected;
        if (!c.locked && c.rows.length >= 11) {
          const preference = Object.fromEntries(
            c.rows.map((p) => [
              p.id,
              p.xp + 0.7 * (r() - 0.5) + (selected.includes(p) ? 0.35 : 0),
            ]),
          );
          selected = bestXI(c.rows, (p) => preference[p.id]);
        }
        const bench = c.rows.filter((p) => !selected.includes(p));
        if (c.locked) {
          const order = arr(fpl.benchOrder?.[t.id]).map(Number);
          if (order.length)
            bench.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
        } else bench.sort((a, b) => b.xp - a.xp);
        const xi = autoXI(selected, bench, played);
        let total = xi.reduce((s, p) => s + scores[p.id], 0);
        if (
          live &&
          Number.isFinite(current[t.id]) &&
          !c.rows.every((p) => Number.isFinite(livePlayers[p.id]?.points))
        ) {
          const accrued = xi.reduce(
            (s, p) => s + (Number(livePlayers[p.id]?.points) || 0),
            0,
          );
          total = current[t.id] + total - accrued;
        }
        if (!c.rows.length) {
          const hist = teamResults(state, t.id, ev);
          const level = hist.length
            ? avg(hist.slice(0, 6).map((h) => h.pts))
            : 50;
          total = Math.round(
            level +
              15 *
                Math.sqrt(-2 * Math.log(Math.max(1e-8, r()))) *
                Math.cos(2 * Math.PI * r()),
          );
        }
        teamSamples[t.id].push(total);
        for (const p of xi) {
          const key = t.id + ":" + p.id;
          selectedCount[key] = (selectedCount[key] || 0) + 1;
          contribution[key] = (contribution[key] || 0) + scores[p.id];
        }
      }
    }
    const teams = {},
      players = {};
    for (const p of ps)
      players[p.id] = {
        ...summary(playerSamples[p.id], 2),
        id: p.id,
        name: p.name,
        club: p.club,
        position: p.pos,
        startProbability: p.start * 100,
        playProbability: p.play * 100,
        historyN: p.historyN,
      };
    for (const t of arr(state.teams)) {
      const c = configs[t.id],
        sum = summary(teamSamples[t.id], 10);
      teams[t.id] = {
        ...sum,
        current: Number.isFinite(current[t.id]) ? current[t.id] : null,
        n: teamResults(state, t.id, ev).length,
        squadRel: 1,
        formRel: 0,
        formProj: sum.proj,
        level: sum.proj,
        squad: {
          xp: sum.proj,
          n: c.selected.length,
          squadSize: c.rows.length,
          out: c.rows.filter((p) => p.availability === 0).length,
          doubts: c.rows.filter((p) => p.availability > 0 && p.availability < 1)
            .length,
        },
        players: c.rows.map((p) => ({
          ...players[p.id],
          selectionProbability:
            (100 * (selectedCount[t.id + ":" + p.id] || 0)) / N,
          contribution: (contribution[t.id + ":" + p.id] || 0) / N,
        })),
        lineupKnown: c.locked,
      };
    }
    const mean = avg(Object.values(teams).map((t) => t.proj));
    Object.values(teams).forEach((t) => {
      t.squadRel = mean ? t.proj / mean : 1;
      t.level = mean;
    });
    const warnings = [];
    if (!fpl.modelData)
      warnings.push(
        "Recent player histories unavailable; using season-rate fallback.",
      );
    if (fpl.modelData?.missingPlayers?.length)
      warnings.push(
        `${fpl.modelData.missingPlayers.length} player histories unavailable.`,
      );
    if (!fx.length)
      warnings.push("Fixture data unavailable; neutral fixture fallback.");
    const result = {
      version: VERSION,
      event: Number(ev),
      inPlay: !!live,
      samples: N,
      teams,
      players,
      warnings,
      sourceAt: fpl.modelData?.fetchedAt || fpl.squadSync || null,
      ...(options.includePlayerSamples ? { playerSamples } : {}),
      teamSamples,
    };
    result.recommendations = {};
    for (const g of arr(state.gameweeks).filter(
      (g) => Number(g.event) === Number(ev),
    ))
      for (const m of arr(g.matches)) {
        if (teams[m.home] && teams[m.away])
          result.recommendations[m.id] = recommendation(
            state,
            m.home,
            m.away,
            ev,
            result,
            { inPlay: !!live },
          );
      }
    return result;
  }
  function matchProbs(state, home, away, ev, pred) {
    const a = pred.teams[home],
      b = pred.teams[away],
      as = pred.teamSamples?.[home],
      bs = pred.teamSamples?.[away];
    let h = 0,
      d = 0,
      w = 0;
    if (as && bs)
      for (let i = 0; i < as.length; i++) {
        if (as[i] > bs[i]) h++;
        else if (as[i] === bs[i]) d++;
        else w++;
      }
    const total = h + d + w;
    const rawH = total ? h / total : phi((a.proj - b.proj) / 21.21),
      rawD = total ? d / total : 0.03;
    // Small-sample probability shrink: ten games of neutral prior evidence. Observed in-play scores are not shrunk.
    const evidence = avg(
      [...(a.players || []), ...(b.players || [])].map((p) => p.historyN),
    );
    const reliability = pred.inPlay ? 1 : evidence / (evidence + 10);
    const draw = rawD * reliability + 0.03 * (1 - reliability);
    const homeP = rawH * reliability + 0.485 * (1 - reliability);
    return {
      home: homeP,
      draw,
      away: 1 - homeP - draw,
      projHome: a.proj,
      projAway: b.proj,
      rawDiff: a.proj - b.proj,
    };
  }
  function recommendation(
    state,
    home,
    away,
    ev,
    pred,
    { inPlay = false } = {},
  ) {
    const p = matchProbs(state, home, away, ev, pred);
    let priced = p;
    if (!inPlay) {
      const diff = 4.2 * Math.tanh(p.rawDiff / 4.2);
      const anchor = clamp(p.draw, 0.068 * 0.9, 0.068 * 1.1);
      const draw = clamp(
        anchor * Math.exp(-0.5 * (diff / 10) ** 2),
        0.05,
        0.07,
      );
      const xs = pred.teamSamples?.[home],
        ys = pred.teamSamples?.[away];
      const sd = xs
        ? Math.max(
            15 * Math.SQRT2,
            Math.sqrt(avg(xs.map((v, i) => (v - ys[i] - p.rawDiff) ** 2))),
          )
        : Math.SQRT2 * 15;
      const rel = phi(diff / sd);
      priced = { home: (1 - draw) * rel, draw, away: (1 - draw) * (1 - rel) };
    }
    const edge = houseEdgePct(state.settings),
      max = (1 - edge / 100) / 1.05;
    // Decline nearly certain in-play outcomes; clamping them would pretend the margin survived.
    const suspended = inPlay && Math.max(p.home, p.draw, p.away) > max;
    return {
      odds: {
        home: edgedOdds(priced.home, edge),
        draw: edgedOdds(priced.draw, edge),
        away: edgedOdds(priced.away, edge),
      },
      probabilities: p,
      pricedProbabilities: priced,
      edge,
      suspended,
    };
  }
  function snapshot(pred) {
    const { teamSamples, ...rest } = pred;
    return rest;
  }
  return {
    VERSION,
    forecast,
    matchProbs,
    recommendation,
    snapshot,
    houseEdgePct,
    edgedOdds,
    profile,
    clubRates,
    fixtureRates,
    bestXI,
    autoXI,
    fixtures,
    teamResults,
  };
});
