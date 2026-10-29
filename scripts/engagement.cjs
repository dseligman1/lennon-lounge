/* Matchday scores and final prize grading. Service-account credentials stay in Actions. */
const Games = require("../lounge-games.js");
const { generate, accessToken, database } = require("./in-play.cjs");
const { get } = require("./fpl-data.cjs");
const { matchTeamName } = require("./sync-fpl.cjs");
async function run(db, fetchJson = get, clock = Date.now, dryRun = false) {
  const [state, savedRounds, settled] = await Promise.all([
    db("lennon-lounge"),
    db("lennon-lounge-score-game/rounds"),
    db("lennon-lounge-score-game/results"),
  ]);
  if (!state?.fpl?.leagueId) throw Error("No FPL league configured.");
  const rounds = savedRounds || {},
    results = settled || {};
  const leagueId = process.env.FPL_LEAGUE_ID || state.fpl.leagueId;
  const [boot, details] = await Promise.all([
    fetchJson("https://draft.premierleague.com/api/bootstrap-static"),
    fetchJson(`https://draft.premierleague.com/api/league/${leagueId}/details`),
  ]);
  // Identity and prize results must not depend on the member-editable legacy cache.
  const entryMap = {},
    entryIdMap = {};
  for (const en of Games.arr(details.league_entries)) {
    const name =
      `${en.player_first_name || ""} ${en.player_last_name || ""}`.trim();
    const tid = matchTeamName(name);
    if (tid) {
      entryMap[en.id] = tid;
      entryIdMap[en.entry_id] = tid;
    }
  }
  state.fpl.leagueId = leagueId;
  state.fpl.entryMap = entryMap;
  state.fpl.entryIdMap = entryIdMap;
  const events = Games.arr(boot.events?.data || boot.events);
  // Use the current official deadline even if a browser's cached state is stale.
  for (const ev of events) {
    const deadline = Date.parse(ev.deadline_time);
    if (Number.isFinite(deadline)) {
      state.fpl.events ||= {};
      state.fpl.events[ev.id] = { ...state.fpl.events[ev.id], deadline };
    }
  }
  // Only an authenticated house manager can open a prize round through the publication flow.
  // Never create financial commitments from the legacy cache's writable gameweek status.
  const outstanding = Games.arr(rounds).filter(
    (r) => !results[r.event] && r.cutoff <= clock(),
  );
  for (const round of outstanding) {
    const entries = await db(`lennon-lounge-score-game/entries/${round.event}`);
    const officialDeadline = state.fpl.events?.[round.event]?.deadline;
    if (!officialDeadline)
      throw Error(`Missing official deadline for prize round ${round.event}`);
    const result = Games.settleRound(
      { ...round, cutoff: Math.min(round.cutoff, officialDeadline) },
      entries,
      details.matches,
      entryMap,
      clock(),
    );
    if (!result) continue;
    // This worker is serialized by the workflow; a stable event key makes retries idempotent.
    if (!dryRun)
      await db(
        `lennon-lounge-score-game/results/${round.event}`,
        "CREATE",
        result,
      );
    console.log(
      `Score game GW${round.event}: ${result.winnerCount} winners, £${(result.totalPrizePence / 100).toFixed(2)} ${dryRun ? "(dry run)" : "recorded"}`,
    );
  }
  const candidates = Games.arr(state.gameweeks)
    .filter(
      (g) =>
        g.status !== "draft" &&
        g.event &&
        Date.parse(
          events.find((e) => Number(e.id) === Number(g.event))?.deadline_time,
        ) <= clock(),
    )
    .sort((a, b) => b.event - a.event);
  // Refresh the current event, including the first final snapshot; stop once officially finished.
  const g = candidates[0];
  if (!g) return;
  const path = `lennon-lounge-matchday/${g.event}`;
  const previous = (await db(path)) || {};
  if (previous.current?.officiallyFinished && !dryRun) return;
  if (previous.current?.source?.fetchedAt > clock() - 4 * 60000 && !dryRun)
    return;
  try {
    const draft = await generate(
      state,
      { ...g, status: "open" },
      { id: `matchday-${clock()}` },
      fetchJson,
      clock,
      { cachedHistories: true },
    );
    const league = await fetchJson(
      `https://draft.premierleague.com/api/league/${leagueId}/details`,
    );
    const official = Games.arr(league.matches).filter(
      (m) => Number(m.event) === Number(g.event),
    );
    const officialScoresMatch = Object.values(draft.matches).every((m) =>
      official.some((o) => {
        const home = state.fpl.entryMap[o.league_entry_1],
          away = state.fpl.entryMap[o.league_entry_2];
        return (
          (home === m.home &&
            away === m.away &&
            o.league_entry_1_points === m.currentHome &&
            o.league_entry_2_points === m.currentAway) ||
          (home === m.away &&
            away === m.home &&
            o.league_entry_1_points === m.currentAway &&
            o.league_entry_2_points === m.currentHome)
        );
      }),
    );
    const current = {
      event: Number(g.event),
      gwId: g.id,
      source: draft.source,
      active: draft.active,
      matches: draft.matches,
      forecast: draft.forecast,
      teams: draft.matchday.teams,
      reconciled: draft.matchday.reconciled,
      finished: draft.matchday.finished,
      officiallyFinished:
        official.length > 0 &&
        official.every((m) => m.finished) &&
        draft.matchday.reconciled &&
        officialScoresMatch,
    };
    // Betting-only expiry and completed-market blockers do not suppress a spectator scoreboard.
    const history = Games.appendTimeline(previous.history, current);
    if (!dryRun)
      await db(path, "PATCH", {
        current,
        history,
        health: { checkedAt: clock(), ok: true },
      });
    console.log(
      `Matchday GW${g.event}: ${Object.keys(current.matches).length} fixtures, reconciled=${current.reconciled}, final=${current.officiallyFinished}${dryRun ? " (dry run)" : ""}`,
    );
  } catch (err) {
    if (!dryRun)
      await db(path + "/health", "PUT", {
        checkedAt: clock(),
        ok: false,
        message:
          "The latest FPL refresh failed. Showing the last successful snapshot.",
      });
    throw err;
  }
}
async function main() {
  if (!process.env.FPL_LEAGUE_ID)
    throw Error(
      "FPL_LEAGUE_ID must be configured for official prize verification.",
    );
  const token = await accessToken(JSON.parse(process.env.FIREBASE_SERVICE_KEY));
  await run(
    database(process.env.FIREBASE_DB_URL, token),
    get,
    Date.now,
    process.env.ENGAGEMENT_DRY_RUN === "true",
  );
}
module.exports = { run };
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
