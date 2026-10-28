/* Pure in-play policy shared by app, worker and tests. All times are UTC milliseconds. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LennonInPlay = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_PUBLISH_AGE = 5 * 60000,
    ACTIVE_LIFE = 2 * 60000,
    BETWEEN_LIFE = 24 * 3600000;
  const arr = (x) =>
    Array.isArray(x) ? x.filter(Boolean) : Object.values(x || {});
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
  };
});
