// Public FPL inputs. Map classic player IDs by stable Opta code, never by numeric ID.
const fs = require("node:fs");
async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw Error(`FPL HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}
async function enrich(bootstrap, ownedIds, fetchJson = get) {
  const [classic, fixtures] = await Promise.all([
    fetchJson("https://fantasy.premierleague.com/api/bootstrap-static/"),
    fetchJson("https://fantasy.premierleague.com/api/fixtures/"),
  ]);
  const byCode = new Map(classic.elements.map((p) => [p.code, p]));
  const history = {},
    errors = [];
  const all = bootstrap.elements.filter((p) => ownedIds.has(p.id));
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < all.length) {
        const p = all[next++],
          cp = byCode.get(p.code);
        if (!cp) {
          errors.push(p.id);
          continue;
        }
        try {
          const r = await fetchJson(
            `https://fantasy.premierleague.com/api/element-summary/${cp.id}/`,
          );
          history[p.id] = (r.history || []).map((h) => ({
            event: h.round,
            fixture: h.fixture,
            minutes: h.minutes,
            starts: h.starts ?? (h.minutes >= 60 ? 1 : 0),
            points: h.total_points,
            goals: h.goals_scored,
            assists: h.assists,
            cs: h.clean_sheets,
            gc: h.goals_conceded,
            bonus: h.bonus,
            saves: h.saves,
            yellow: h.yellow_cards,
            red: h.red_cards,
            own: h.own_goals,
            penMiss: h.penalties_missed,
            penSave: h.penalties_saved,
            xg: Number(h.expected_goals) || 0,
            xa: Number(h.expected_assists) || 0,
            dc: h.defensive_contribution || 0,
            k: Date.parse(h.kickoff_time),
          }));
        } catch (e) {
          errors.push(p.id);
        }
      }
    }),
  );
  const plFixtures = {};
  for (const f of fixtures) {
    if (!f.event) continue;
    (plFixtures[f.event] ??= []).push({
      id: f.id,
      h: f.team_h,
      a: f.team_a,
      hd: f.team_h_difficulty,
      ad: f.team_a_difficulty,
      k: Date.parse(f.kickoff_time) || null,
      started: !!f.started,
      finished: !!f.finished,
      provisional: !!f.finished_provisional,
      minutes: f.minutes || 0,
      hg: f.team_h_score,
      ag: f.team_a_score,
    });
  }
  return {
    playerHistory: history,
    plFixtures,
    modelData: {
      fetchedAt: Date.now(),
      missingPlayers: errors,
      source: "FPL classic history mapped by Opta code; Draft squads",
      historyPlayers: Object.keys(history).length,
    },
  };
}
module.exports = { get, enrich };
if (require.main === module)
  (async () => {
    const state = JSON.parse(fs.readFileSync(process.argv[2]));
    const bootstrap = await get(
      "https://draft.premierleague.com/api/bootstrap-static",
    );
    const details = await get(
      `https://draft.premierleague.com/api/league/${state.fpl.leagueId}/details`,
    );
    const owned = new Set(Object.values(state.fpl.squads).flat().map(Number));
    const enriched = await enrich(bootstrap, owned);
    fs.writeFileSync(
      process.argv[3],
      JSON.stringify({
        fetchedAt: Date.now(),
        bootstrap,
        details,
        ...enriched,
      }),
    );
    console.log(
      `Fetched ${Object.keys(enriched.playerHistory).length} player histories; ${enriched.modelData.missingPlayers.length} unavailable; current event ${bootstrap.events.current}`,
    );
  })().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
