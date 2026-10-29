const base = require("../../backups/2026-10-26.json");
function source(mismatch = false) {
  const s = structuredClone(base),
    g = s.gameweeks.find((g) => g.event === 8),
    now = Date.now(),
    elements = Object.entries(s.fpl.players).map(([id, p]) => ({
      id: Number(id),
      code: Number(id) + 1000,
      web_name: p.n,
      team: p.t,
      element_type: p.p,
      form: p.f,
      points_per_game: p.ppg,
      minutes: p.mn,
      status: "a",
    }));
  const entries = Object.entries(s.fpl.entryIdMap).map(([entry_id, tid]) => ({
    player_first_name: s.teams.find((t) => t.id === tid).fplName.split(" ")[0],
    player_last_name: s.teams
      .find((t) => t.id === tid)
      .fplName.split(" ")
      .slice(1)
      .join(" "),
    entry_id: Number(entry_id),
    id: Number(
      Object.keys(s.fpl.entryMap).find((k) => s.fpl.entryMap[k] === tid),
    ),
  }));
  const fixtures = s.fpl.plFixtures[8].map((f, i) => ({
    id: 71 + i,
    event: 8,
    team_h: f.h,
    team_a: f.a,
    team_h_difficulty: f.hd,
    team_a_difficulty: f.ad,
    kickoff_time: new Date(now - 60 * 60000).toISOString(),
    started: true,
    finished: false,
    finished_provisional: false,
    minutes: 60,
    team_h_score: 1,
    team_a_score: 1,
  }));
  const live = { fixtures, elements: {} };
  for (const p of elements) {
    const f = fixtures.find((f) => [f.team_h, f.team_a].includes(p.team));
    live.elements[p.id] = {
      stats: {
        minutes: 60,
        total_points: 2,
        goals_conceded: 1,
        clean_sheets: 0,
      },
      explain: [[[{ stat: "minutes", value: 60, points: 2 }], f.id]],
    };
  }
  const details = {
    league_entries: entries,
    matches: g.matches.map((m) => ({
      event: 8,
      league_entry_1: Number(
        Object.keys(s.fpl.entryMap).find((k) => s.fpl.entryMap[k] === m.home),
      ),
      league_entry_2: Number(
        Object.keys(s.fpl.entryMap).find((k) => s.fpl.entryMap[k] === m.away),
      ),
      league_entry_1_points: mismatch ? 99 : 22,
      league_entry_2_points: 22,
    })),
  };
  const fetch = async (url) => {
    if (url.includes("draft.") && url.endsWith("bootstrap-static"))
      return {
        elements,
        events: {
          current: 8,
          data: [
            { id: 8, deadline_time: new Date(now - 3600000).toISOString() },
          ],
        },
      };
    if (url.endsWith("/details")) return details;
    if (url.endsWith("/live")) return live;
    if (url.includes("/entry/")) {
      const id = url.match(/entry\/(\d+)/)[1],
        tid = s.fpl.entryIdMap[id],
        xi = s.fpl.lineups[tid],
        ids = [...xi, ...s.fpl.squads[tid].filter((x) => !xi.includes(x))];
      return { picks: ids.map((element, i) => ({ element, position: i + 1 })) };
    }
    if (url.includes("element-summary"))
      return {
        history: [1, 2, 3, 4, 5, 6, 7].map((round) => ({
          round,
          minutes: 90,
          starts: 1,
          total_points: 3,
          goals_scored: 0,
          assists: 0,
          clean_sheets: 0,
          goals_conceded: 1,
          kickoff_time: new Date(now - round * 86400000).toISOString(),
        })),
      };
    if (url.endsWith("/fixtures/")) return fixtures;
    if (url.endsWith("/bootstrap-static/")) return { elements };
    throw Error("Unexpected request " + url);
  };
  return { s, g, now, fetch };
}
module.exports = source;
