/* Shared free-score-game and matchday policy. No network or browser dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LennonGames = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const PRIZE_PENCE = 5000,
    PRIZE_MODE = "each";
  const arr = (x) =>
    Array.isArray(x) ? x.filter(Boolean) : Object.values(x || {});
  function entryError(round, entry, existing, now) {
    if (existing)
      return "You have already entered this gameweek. Your next go opens with next week’s odds.";
    if (
      !round ||
      round.status !== "open" ||
      now < round.openedAt ||
      now >= round.cutoff
    )
      return "Entries are closed for this gameweek.";
    if (!round.fixtures?.[entry.matchId])
      return "Choose a fixture from this gameweek.";
    if (
      ![entry.homePts, entry.awayPts].every(
        (n) => Number.isInteger(n) && n >= -100 && n <= 999,
      )
    )
      return "Enter a whole FPL points total for each team (−100 to 999).";
    return null;
  }
  function makeRound(state, g, now) {
    if (!g || g.status !== "open" || !Number.isInteger(Number(g.event)))
      return null;
    const officialDeadline = Number(state.fpl?.events?.[g.event]?.deadline);
    const dates = [
      Number(g.deadline),
      officialDeadline,
      Number(g.kickoff),
      ...arr(state.fpl?.plFixtures?.[g.event]).map((f) => Number(f.k)),
    ].filter((n) => n > 0);
    if (!officialDeadline || !dates.length) return null;
    const cutoff = Math.min(...dates);
    if (cutoff <= now) return null;
    const fixtures = Object.fromEntries(
      arr(g.matches)
        .filter((m) => m.home && m.away)
        .map((m) => [m.id, { home: m.home, away: m.away }]),
    );
    if (!Object.keys(fixtures).length) return null;
    return {
      event: Number(g.event),
      gwId: g.id,
      name: g.name,
      openedAt: now,
      cutoff,
      prizePence: PRIZE_PENCE,
      prizeMode: PRIZE_MODE,
      status: "open",
      fixtures,
    };
  }
  function settleRound(round, entries, matches, entryMap, now) {
    if (!round || now < round.cutoff) return null;
    const official = arr(matches).filter(
      (m) => Number(m.event) === Number(round.event),
    );
    const scores = {};
    for (const [id, f] of Object.entries(round.fixtures || {})) {
      const m = official.find((m) => {
        const a = entryMap[m.league_entry_1],
          b = entryMap[m.league_entry_2];
        return (a === f.home && b === f.away) || (a === f.away && b === f.home);
      });
      if (
        !m?.finished ||
        !Number.isInteger(m.league_entry_1_points) ||
        !Number.isInteger(m.league_entry_2_points)
      )
        return null;
      const forward = entryMap[m.league_entry_1] === f.home;
      scores[id] = {
        homePts: forward ? m.league_entry_1_points : m.league_entry_2_points,
        awayPts: forward ? m.league_entry_2_points : m.league_entry_1_points,
      };
    }
    if (!Object.keys(scores).length) return null;
    const outcomes = {},
      winnerIds = [];
    for (const [tid, entry] of Object.entries(entries || {})) {
      const score = scores[entry.matchId];
      const valid =
        !entryError(round, entry, null, entry.enteredAt) &&
        Number.isFinite(entry.enteredAt) &&
        entry.enteredAt < round.cutoff;
      const won = !!(
        valid &&
        score &&
        entry.homePts === score.homePts &&
        entry.awayPts === score.awayPts
      );
      outcomes[tid] = { won, amountPence: 0, matchId: entry.matchId };
      if (won) winnerIds.push(tid);
    }
    winnerIds.sort();
    winnerIds.forEach((tid, i) => {
      outcomes[tid].amountPence =
        round.prizeMode === "shared"
          ? Math.floor(round.prizePence / winnerIds.length) +
            (i < round.prizePence % winnerIds.length ? 1 : 0)
          : round.prizePence;
    });
    return {
      event: round.event,
      settledAt: now,
      source: "Official FPL Draft final results",
      scores,
      outcomes,
      winnerCount: winnerIds.length,
      totalPrizePence: Object.values(outcomes).reduce(
        (sum, o) => sum + o.amountPence,
        0,
      ),
    };
  }
  function selectGameweek(state, now, selectedEvent) {
    const weeks = arr(state.gameweeks)
      .filter((g) => g.event && g.status !== "draft")
      .sort((a, b) => Number(a.event) - Number(b.event));
    return (
      weeks.find((g) => Number(g.event) === Number(selectedEvent)) ||
      weeks.find((g) => g.status === "open" && Number(g.deadline) <= now) ||
      weeks.find((g) => g.status === "open") ||
      weeks.at(-1) ||
      null
    );
  }
  function appendTimeline(history, current) {
    const rows = arr(history),
      previous = rows.at(-1);
    const matches = Object.fromEntries(
      Object.entries(current.matches || {}).map(([id, m]) => [
        id,
        {
          home: m.home,
          away: m.away,
          homePts: m.currentHome,
          awayPts: m.currentAway,
          homeChance:
            current.reconciled === false
              ? null
              : (m.probabilities?.home ?? null),
          awayChance:
            current.reconciled === false
              ? null
              : (m.probabilities?.away ?? null),
        },
      ]),
    );
    const changed =
      !previous ||
      Object.entries(matches).some(([id, m]) => {
        const old = previous.matches?.[id];
        return (
          !old ||
          old.homePts !== m.homePts ||
          old.awayPts !== m.awayPts ||
          Math.abs((old.homeChance || 0) - (m.homeChance || 0)) >= 0.02
        );
      });
    if (changed) rows.push({ at: current.source.fetchedAt, matches });
    return rows.slice(-144);
  }
  return {
    PRIZE_PENCE,
    PRIZE_MODE,
    arr,
    entryError,
    makeRound,
    settleRound,
    selectGameweek,
    appendTimeline,
  };
});
