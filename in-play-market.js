/* Pure in-play policy shared by app, worker and tests. All times are UTC milliseconds. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LennonInPlay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_PUBLISH_AGE = 5 * 60000,
    ACTIVE_LIFE = 15 * 60000, // Dan approves every bet, so a 15-minute live window is acceptable (2026-11-07)
    BETWEEN_LIFE = 24 * 3600000;
  const arr = (x) =>
    Array.isArray(x) ? x.filter(Boolean) : Object.values(x || {});
  // Same prices as the normal board, including house boosts and flash promos.
  function normalOdds(state, g) {
    return Object.fromEntries(
      arr(g.matches).map((m) => [
        m.id,
        Object.fromEntries(
          ["home", "draw", "away"].map((pick) => {
            const promo = arr(state.promos).find(
              (p) =>
                p.active &&
                p.gwId === g.id &&
                p.matchId === m.id &&
                p.pick === pick,
            );
            const side =
              pick === "home" ? m.home : pick === "away" ? m.away : null;
            const boost =
              m.boostSide === pick
                ? 2
                : side && side === g.favBoostTeamId
                  ? 0.1
                  : 0;
            return [
              pick,
              promo?.odds ??
                (boost
                  ? Math.round((m.odds[pick] + boost) * 100) / 100
                  : m.odds[pick]),
            ];
          }),
        ),
      ]),
    );
  }
  function baselineError(draft, state, g, now) {
    if (!g || g.status !== "open")
      return "Publish the normal gameweek odds first. You can still preview this draft.";
    if (!draft?.preStart) return null;
    if (now >= draft.startsAt)
      return "The gameweek has started. Generate fresh in-play odds.";
    if (draft.maxCutoff > (g.deadline || Infinity))
      return "The gameweek cutoff changed. Generate a new preview.";
    const current = normalOdds(state, g);
    if (
      Object.keys(current).length !==
        Object.keys(draft.originalOdds || {}).length ||
      Object.entries(current).some(([id, odds]) =>
        ["home", "draw", "away"].some(
          (p) => odds[p] !== draft.originalOdds?.[id]?.[p],
        ),
      )
    )
      return "Normal odds changed. Generate a new preview to match them.";
    return null;
  }
  function withdrawRecord(record, now, by) {
    const d = record?.draft || record?.published;
    return {
      ...record,
      published: null,
      request: null,
      ...(d
        ? {
            draft: {
              ...d,
              status: "draft",
              revision: d.revision + "_recall_" + now,
            },
          }
        : {}),
      withdrawnAt: now,
      withdrawnBy: by,
    };
  }
  function windowFor(fixtures, now) {
    const fs = arr(fixtures),
      remaining = fs.filter((f) => !f.finished),
      active = remaining.some((f) => f.started),
      next = remaining
        .filter((f) => !f.started && Number.isFinite(f.k) && f.k > now)
        .map((f) => f.k);
    const maxCutoff = Math.min(
      now + (active ? ACTIVE_LIFE : BETWEEN_LIFE),
      ...next,
    );
    const reasons = [];
    if (!fs.length) reasons.push("No verified Premier League fixtures.");
    if (!remaining.length) reasons.push("All gameweek fixtures have finished.");
    if (remaining.some((f) => !f.started && (!f.k || f.k <= now)))
      reasons.push(
        "A fixture has an unknown or overdue kickoff; refresh the FPL feed.",
      );
    return { active, maxCutoff, cutoff: maxCutoff, reasons };
  }
  function publishError(draft, cutoff, now) {
    if (!draft) return "Generate an in-play recommendation first.";
    if (draft.preStart && (now >= draft.startsAt || cutoff > draft.startsAt))
      return "Pre-gameweek prices must close by the gameweek cutoff. Generate fresh odds after it starts.";
    if (draft.blockedReasons?.length) return draft.blockedReasons.join(" ");
    if (
      !draft.source?.fetchedAt ||
      now - draft.source.fetchedAt > MAX_PUBLISH_AGE ||
      draft.source.fetchedAt > now + 10000
    )
      return "The score snapshot is too old to publish. Generate fresh odds.";
    if (!Number.isFinite(cutoff) || cutoff <= now)
      return "Choose a future cutoff.";
    if (cutoff > draft.maxCutoff)
      return "Cutoff cannot pass the next kickoff or the market validity limit.";
    if (!Object.values(draft.matches || {}).some((m) => !m.suspended))
      return "Every match is decided or too certain to offer at the house margin.";
    return null;
  }
  function isOpen(market, now) {
    return (
      !!market &&
      market.status === "published" &&
      market.cutoff > now &&
      market.publishedAt <= now &&
      !market.blockedReasons?.length
    );
  }
  function legError(market, leg, now) {
    if (!isOpen(market, now))
      return "The in-play market has expired or is closed.";
    if (leg.type !== "match")
      return "Only match-result markets are available in-play.";
    if (leg.marketRevision !== market.revision)
      return "The odds changed. Remove the old selection and choose the new price.";
    const m = market.matches?.[leg.matchId];
    if (!m || m.suspended) return "This match is suspended.";
    if (m.odds?.[leg.pick] == null)
      return "That result is too likely to price in-play. Choose another.";
    if (
      !Number.isFinite(Number(leg.odds)) ||
      !Number.isFinite(Number(m.odds?.[leg.pick])) ||
      !["home", "draw", "away"].includes(leg.pick) ||
      Math.abs(Number(leg.odds) - Number(m.odds[leg.pick])) > 0.00001
    )
      return "The selected odds no longer match the published market.";
    return null;
  }
  function publishRecord(draft, cutoff, now, by, previous) {
    const error = publishError(draft, cutoff, now);
    if (error) throw Error(error);
    return {
      ...draft,
      status: "published",
      publishedAt: now,
      publishedBy: by,
      cutoff,
      originalOdds: previous?.originalOdds || draft.originalOdds,
    };
  }
  // FPL bonus (3/2/1 by BPS rank, ties share) appears in points only after confirmation. For a
  // started fixture with no bonus recorded yet, estimate it from live BPS, weighted by how much of
  // the match has been played (a full-time BPS lead is almost always kept).
  function provisionalBonus(fixture, elapsed) {
    const stats = arr(fixture?.stats),
      bonus = stats.find((s) => s.s === "bonus"),
      bps = stats.find((s) => s.s === "bps");
    if (!fixture?.started || fixture.finished || !bps) return {};
    if (bonus && [...arr(bonus.h), ...arr(bonus.a)].length) return {};
    const rows = [...arr(bps.h), ...arr(bps.a)]
      .map((r) => ({ id: Number(r.element), v: Number(r.value) }))
      .filter((r) => Number.isFinite(r.id) && Number.isFinite(r.v));
    const weight = fixture.finished_provisional
      ? 1
      : Math.max(0, Math.min(1, (Number(elapsed) || 0) / 90));
    const out = {};
    for (const r of rows) {
      const rank = 1 + rows.filter((x) => x.v > r.v).length,
        pts = rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0;
      if (pts && weight) out[r.id] = pts * weight;
    }
    return out;
  }
  function parsePlayerLive(element) {
    if (
      !element ||
      !element.stats ||
      !Number.isFinite(element.stats.total_points) ||
      !Number.isFinite(element.stats.minutes)
    )
      throw Error("Missing Draft live points or minutes.");
    const fixtures = {};
    for (const item of element.explain || []) {
      const rows = Array.isArray(item) ? item[0] : item.stats;
      const id = Array.isArray(item) ? item[1] : item.fixture;
      if (!id || !Array.isArray(rows)) continue;
      const f = { minutes: 0, clean_sheets: 0, goals_conceded: 0 };
      for (const s of rows) f[s.stat || s.identifier] = Number(s.value) || 0;
      fixtures[id] = f;
    }
    const keys = Object.keys(fixtures);
    if (keys.length === 1) {
      fixtures[keys[0]] = {
        ...element.stats,
        ...fixtures[keys[0]],
        minutes: element.stats.minutes,
        clean_sheets: element.stats.clean_sheets || 0,
        goals_conceded: element.stats.goals_conceded || 0,
      };
    }
    return {
      points: element.stats.total_points,
      minutes: element.stats.minutes,
      fixtures,
    };
  }
  return {
    MAX_PUBLISH_AGE,
    ACTIVE_LIFE,
    BETWEEN_LIFE,
    windowFor,
    publishError,
    isOpen,
    legError,
    publishRecord,
    parsePlayerLive,
    provisionalBonus,
    normalOdds,
    baselineError,
    withdrawRecord,
  };
});
