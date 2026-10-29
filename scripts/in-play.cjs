/* Generates a draft only. Firebase service account stays in Actions secrets. */
const { createSign } = require("node:crypto"),
  M = require("../odds-model.js"),
  IP = require("../in-play-market.js"),
  { get, enrich } = require("./fpl-data.cjs");
const arr = (x) =>
  Array.isArray(x) ? x.filter(Boolean) : Object.values(x || {});
async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000),
    head = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
      "base64url",
    ),
    body = Buffer.from(
      JSON.stringify({
        iss: key.client_email,
        sub: key.client_email,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
        scope:
          "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
      }),
    ).toString("base64url");
  const sig = createSign("RSA-SHA256")
    .update(`${head}.${body}`)
    .sign(key.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${body}.${sig}`,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error("Firebase authentication failed");
  const data = await r.json();
  if (!data.access_token) throw Error("Missing Firebase access token");
  return data.access_token;
}
function database(url, token) {
  return async (path, method = "GET", data) => {
    const r = await fetch(`${url.replace(/\/$/, "")}/${path}.json`, {
      method: method === "CREATE" ? "PUT" : method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...(method === "CREATE" ? { "if-match": "null_etag" } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal: AbortSignal.timeout(20000),
    });
    if (method === "CREATE" && r.status === 412) return null;
    if (!r.ok) throw Error(`Firebase ${method} failed (${r.status})`);
    return r.json();
  };
}
async function generate(
  state,
  g,
  request,
  fetchJson = get,
  clock = Date.now,
  options = {},
) {
  const startedAt = clock(),
    event = Number(g.event);
  if (g.status !== "open" || !event)
    throw Error(
      "Only an open FPL-linked gameweek can generate an in-play market.",
    );
  const [boot, details, live] = await Promise.all([
    fetchJson("https://draft.premierleague.com/api/bootstrap-static"),
    fetchJson(
      `https://draft.premierleague.com/api/league/${state.fpl.leagueId}/details`,
    ),
    fetchJson(`https://draft.premierleague.com/api/event/${event}/live`),
  ]);
  const evs = arr(boot.events?.data || boot.events),
    ev = evs.find((x) => Number(x.id) === event);
  if (!ev || Date.parse(ev.deadline_time) > clock())
    throw Error("The FPL gameweek has not started.");
  const entries = arr(details.league_entries),
    entryMap = state.fpl.entryMap || {},
    wanted = new Set(arr(g.matches).flatMap((m) => [m.home, m.away]));
  const picks = {},
    squads = {},
    lineups = {},
    teamPoints = {},
    playerPoints = {},
    blockedReasons = [],
    warnings = [
      "FPL does not expose a reliable publication timestamp. Fetch age is known; upstream points latency is unknown. Bonus points and corrections may change these scores.",
    ];
  for (const en of entries) {
    const tid = entryMap[en.id];
    if (!wanted.has(tid)) continue;
    const p = await fetchJson(
      `https://draft.premierleague.com/api/entry/${en.entry_id}/event/${event}`,
    );
    if (!Array.isArray(p.picks) || p.picks.length !== 15)
      throw Error(`Incomplete event picks for ${tid}`);
    picks[tid] = p.picks.slice().sort((a, b) => a.position - b.position);
    squads[tid] = picks[tid].map((x) => x.element);
    lineups[tid] = picks[tid]
      .filter((x) => x.position <= 11)
      .map((x) => x.element);
  }
  for (const tid of wanted)
    if (!picks[tid]) throw Error(`No verified event picks for ${tid}`);
  const owned = new Set(Object.values(squads).flat().map(Number)),
    cached =
      options.cachedHistories &&
      state.fpl.modelData?.fetchedAt > clock() - 36 * 3600000 &&
      state.fpl.plFixtures?.[event] &&
      [...owned].every((id) => state.fpl.playerHistory?.[id]),
    extra = cached
      ? {
          modelData: state.fpl.modelData,
          playerHistory: state.fpl.playerHistory,
          plFixtures: state.fpl.plFixtures,
          plTeams: state.fpl.plTeams,
        }
      : await enrich(boot, owned, fetchJson),
    players = {};
  for (const p of boot.elements || [])
    if (owned.has(p.id))
      players[p.id] = {
        n: p.web_name,
        t: p.team,
        p: p.element_type,
        code: p.code,
        f: Number(p.form) || 0,
        ppg: Number(p.points_per_game) || 0,
        mn: p.minutes,
        st: p.status,
        cp: p.chance_of_playing_this_round,
        cpn: p.chance_of_playing_next_round,
      };
  // Re-fetch live points and league scores after history enrichment so they form one tight snapshot.
  const [currentLive, currentDetails] = await Promise.all([
    fetchJson(`https://draft.premierleague.com/api/event/${event}/live`),
    fetchJson(
      `https://draft.premierleague.com/api/league/${state.fpl.leagueId}/details`,
    ),
  ]);
  const fetchedAt = clock();
  for (const id of owned) {
    if (!players[id]) throw Error(`Missing owned player ${id}`);
    playerPoints[id] = IP.parsePlayerLive(currentLive.elements?.[id]);
  }
  const draftFixtures = arr(currentLive.fixtures).filter(
    (f) => Number(f.event) === event,
  );
  if (!draftFixtures.length) throw Error("No live fixture statuses.");
  const fx = arr(extra.plFixtures[event]).map((f) => {
    const d = draftFixtures.find(
      (d) => d.id === f.id || (d.team_h === f.h && d.team_a === f.a),
    );
    if (!d) throw Error("Draft and classic fixtures disagree.");
    let minutes = Number(d.minutes) || 0;
    const active = d.started && !d.finished && !d.finished_provisional;
    if (active && minutes === 0) {
      minutes = Math.max(
        0,
        ...Object.values(playerPoints).map(
          (p) => p.fixtures[d.id]?.minutes || 0,
        ),
      );
      if (!minutes) {
        minutes = Math.min(
          90,
          Math.max(
            0,
            Math.floor((fetchedAt - Date.parse(d.kickoff_time)) / 60000) -
              (fetchedAt - Date.parse(d.kickoff_time) > 60 * 60000 ? 15 : 0),
          ),
        );
        warnings.push(
          "Live match clock is estimated from kickoff; substitution estimates are provisional.",
        );
      }
    }
    for (const p of Object.values(playerPoints)) {
      if (d.id !== f.id && p.fixtures[d.id]) {
        p.fixtures[f.id] = p.fixtures[d.id];
        delete p.fixtures[d.id];
      }
    }
    return {
      ...f,
      started: !!d.started,
      finished: !!(d.finished || d.finished_provisional),
      provisional: !!d.finished_provisional && !d.finished,
      minutes,
      hg: d.team_h_score,
      ag: d.team_a_score,
    };
  });
  for (const f of fx.filter((f) => f.started && !f.finished)) {
    if (!Number.isFinite(f.hg) || !Number.isFinite(f.ag))
      blockedReasons.push("Live fixture score unavailable.");
    for (const id of owned) {
      if (players[id].t === f.h || players[id].t === f.a) {
        if (!playerPoints[id].fixtures[f.id])
          playerPoints[id].fixtures[f.id] = {
            minutes: 0,
            clean_sheets: 0,
            goals_conceded: 0,
          };
      }
    }
  }
  for (const match of arr(currentDetails.matches).filter(
    (m) => Number(m.event) === event,
  )) {
    const a = entryMap[match.league_entry_1],
      b = entryMap[match.league_entry_2];
    if (wanted.has(a)) teamPoints[a] = match.league_entry_1_points;
    if (wanted.has(b)) teamPoints[b] = match.league_entry_2_points;
  }
  for (const tid of wanted) {
    if (!Number.isFinite(teamPoints[tid]))
      throw Error(`Missing current score for ${tid}`);
    const raw = lineups[tid].reduce(
      (sum, id) => sum + playerPoints[id].points,
      0,
    );
    const rows = picks[tid].map((x) => ({
      id: x.element,
      pos: players[x.element].p,
    }));
    const potential = {};
    for (const row of rows) {
      const club = players[row.id].t;
      potential[row.id] =
        playerPoints[row.id].minutes > 0 ||
        fx.some((f) => (f.h === club || f.a === club) && !f.finished);
    }
    const auto = M.autoXI(rows.slice(0, 11), rows.slice(11), potential).reduce(
      (sum, p) => sum + playerPoints[p.id].points,
      0,
    );
    if (teamPoints[tid] !== raw && teamPoints[tid] !== auto)
      blockedReasons.push(
        `${tid}: Draft score ${teamPoints[tid]} disagrees with player totals (${raw}, or ${auto} after substitutions).`,
      );
  }
  const window = IP.windowFor(fx, fetchedAt);
  blockedReasons.push(...window.reasons);
  if (window.active)
    warnings.push(
      "Games are active: goals, substitutions and bonus updates can invalidate a price. This revision expires in at most two minutes.",
    );
  if (clock() - fetchedAt > IP.MAX_PUBLISH_AGE)
    blockedReasons.push("Source collection exceeded the freshness limit.");
  const nextState = {
    ...state,
    fpl: {
      ...state.fpl,
      ...extra,
      players,
      squads,
      lineups,
      benchOrder: Object.fromEntries(
        Object.entries(picks).map(([tid, rows]) => [
          tid,
          rows.filter((x) => x.position > 11).map((x) => x.element),
        ]),
      ),
      lineupEvent: event,
      lineupsPublished: true,
      squadEvent: event,
      plFixtures: { ...extra.plFixtures, [event]: fx },
    },
  };
  const pred = M.forecast(nextState, event, {
    live: { teamPoints, playerPoints },
    samples: 4000,
  });
  const matches = {};
  for (const m of arr(g.matches)) {
    if (!m.home || !m.away) continue;
    const rec = M.recommendation(nextState, m.home, m.away, event, pred, {
      inPlay: true,
    });
    matches[m.id] = {
      id: m.id,
      home: m.home,
      away: m.away,
      ...rec,
      currentHome: teamPoints[m.home],
      currentAway: teamPoints[m.away],
    };
  }
  const matchdayTeams = {};
  for (const tid of wanted) {
    const rows = picks[tid].map((x) => ({
      id: x.element,
      pos: players[x.element].p,
    }));
    const potential = Object.fromEntries(
      rows.map((p) => [
        p.id,
        playerPoints[p.id].minutes > 0 ||
          fx.some(
            (f) =>
              (f.h === players[p.id].t || f.a === players[p.id].t) &&
              !f.finished,
          ),
      ]),
    );
    const selected = new Set(
      M.autoXI(rows.slice(0, 11), rows.slice(11), potential).map((p) => p.id),
    );
    const ps = rows.map((p) => {
      const fs = fx.filter(
        (f) =>
          (f.h === players[p.id].t || f.a === players[p.id].t) && !f.finished,
      );
      return {
        id: p.id,
        name: players[p.id].n,
        points: playerPoints[p.id].points,
        selected: selected.has(p.id),
        remaining: fs.length,
        active: fs.some((f) => f.started),
      };
    });
    matchdayTeams[tid] = {
      players: ps,
      remainingPlayers: ps.filter((p) => p.selected && p.remaining > 0).length,
      activePlayers: ps.filter((p) => p.selected && p.active).length,
    };
  }
  return {
    requestId: request.id,
    revision: request.id,
    event,
    gwId: g.id,
    generatedAt: clock(),
    source: {
      fetchedAt,
      startedAt,
      collectionMs: fetchedAt - startedAt,
      publicationLagMs: null,
      provisional: true,
      warnings: [...new Set(warnings)],
    },
    active: window.active,
    cutoff: window.cutoff,
    maxCutoff: window.maxCutoff,
    blockedReasons: [...new Set(blockedReasons)],
    matches,
    forecast: M.snapshot(pred),
    matchday: {
      teams: matchdayTeams,
      finished: fx.every((f) => f.finished),
      reconciled: !blockedReasons.some(
        (r) => r.includes("disagrees") || r.includes("score unavailable"),
      ),
    },
    originalOdds: Object.fromEntries(arr(g.matches).map((m) => [m.id, m.odds])),
    status: "draft",
  };
}
async function main() {
  const token = await accessToken(JSON.parse(process.env.FIREBASE_SERVICE_KEY)),
    db = database(process.env.FIREBASE_DB_URL, token);
  if (process.env.INPLAY_DRY_RUN === "true") {
    const state = await db("lennon-lounge");
    const g = arr(state.gameweeks)
      .filter((g) => g.deadline < Date.now() && Number(g.event) > 0)
      .sort((a, b) => b.event - a.event)[0];
    if (!g) {
      console.log("Dry run: no started gameweek available");
      return;
    }
    const draft = await generate(
      state,
      { ...g, status: "open" },
      { id: "dry-run" },
    );
    console.log(
      JSON.stringify({
        dryRun: true,
        originalStatus: g.status,
        event: g.event,
        matches: Object.keys(draft.matches).length,
        source: draft.source,
        blockedReasons: draft.blockedReasons,
        version: draft.forecast.version,
      }),
    );
    return;
  }
  const queues = (await db("lennon-lounge-inplay")) || {};
  for (const [gwId, record] of Object.entries(queues)) {
    const req = record.request;
    if (!req || req.status !== "queued") continue;
    try {
      if (Date.now() - req.requestedAt > 30 * 60000)
        throw Error("Request expired; generate again.");
      const state = await db("lennon-lounge"),
        g = arr(state.gameweeks).find((g) => g.id === gwId);
      if (!g) throw Error("Gameweek no longer exists.");
      const draft = await generate(state, g, req);
      const current = await db(`lennon-lounge-inplay/${gwId}/request`);
      if (current?.id !== req.id) {
        console.log("Superseded request skipped");
        continue;
      }
      await db(`lennon-lounge-inplay/${gwId}`, "PATCH", {
        draft,
        request: { ...req, status: "ready", completedAt: Date.now() },
      });
      console.log(`Generated ${gwId}: ${draft.blockedReasons.length} blockers`);
    } catch (e) {
      const current = await db(`lennon-lounge-inplay/${gwId}/request`);
      if (current?.id === req.id)
        await db(`lennon-lounge-inplay/${gwId}/request`, "PATCH", {
          status: "error",
          error: e.message,
          completedAt: Date.now(),
        });
      console.error(`In-play ${gwId}: ${e.message}`);
    }
  }
}
module.exports = { generate, database, accessToken, main };
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
