const { test } = require("node:test"),
  assert = require("node:assert/strict");
const source = require("./fixtures/in-play-source.cjs");
const { run } = require("../scripts/engagement.cjs");
function memory(data) {
  const writes = [];
  async function db(path, method = "GET", value) {
    const keys = path.split("/");
    const read = () => keys.reduce((o, k) => o?.[k], data) ?? null;
    if (method === "GET") return structuredClone(read());
    if (method === "CREATE" && read() !== null) return null;
    writes.push({ path, method, value: structuredClone(value) });
    let parent = data;
    for (const k of keys.slice(0, -1)) parent = parent[k] ||= {};
    parent[keys.at(-1)] =
      method === "PATCH"
        ? { ...parent[keys.at(-1)], ...structuredClone(value) }
        : structuredClone(value);
    return structuredClone(read());
  }
  return { db, writes, data };
}
test("scheduled matchday updates all six games without publishing betting markets", async () => {
  const { s, g, now, fetch } = source();
  s.gameweeks = [{ ...g, status: "open" }];
  const mem = memory({ "lennon-lounge": s });
  await run(mem.db, fetch, () => now);
  const record = mem.data["lennon-lounge-matchday"][8];
  assert.equal(Object.keys(record.current.matches).length, 6);
  assert.equal(record.current.reconciled, true);
  assert.equal(Object.keys(record.current.teams).length, 12);
  assert.ok(
    Object.values(record.current.teams).every(
      (t) => t.players.length === 15 && t.remainingPlayers === 11,
    ),
  );
  assert.equal(record.history.length, 1);
  assert.ok(
    mem.writes.every((w) => w.path.startsWith("lennon-lounge-matchday/")),
  );
  const count = mem.writes.length;
  await run(mem.db, fetch, () => now + 1000);
  assert.equal(mem.writes.length, count, "no immediate duplicate refresh");
});
test("read-only verification generates the scoreboard but writes nothing", async () => {
  const { s, g, now, fetch } = source();
  s.gameweeks = [{ ...g, status: "open" }];
  const mem = memory({ "lennon-lounge": s });
  await run(mem.db, fetch, () => now, true);
  assert.equal(mem.writes.length, 0);
});
test("unreconciled scores are visible but their probabilities are not recorded in the timeline", async () => {
  const { s, g, now, fetch } = source(true);
  s.gameweeks = [{ ...g, status: "open" }];
  const mem = memory({ "lennon-lounge": s });
  await run(mem.db, fetch, () => now);
  const record = mem.data["lennon-lounge-matchday"][8];
  assert.equal(record.current.reconciled, false);
  assert.ok(
    Object.values(record.history[0].matches).every(
      (m) => m.homeChance === null,
    ),
  );
});
test("a failed refresh retains the last successful snapshot and marks it delayed", async () => {
  const { s, g, now, fetch } = source();
  s.gameweeks = [{ ...g, status: "open" }];
  const old = { source: { fetchedAt: now - 3600000 }, matches: { old: true } };
  const mem = memory({
    "lennon-lounge": s,
    "lennon-lounge-matchday": { 8: { current: old } },
  });
  await assert.rejects(
    run(
      mem.db,
      async (url) => {
        if (url.endsWith("/live")) throw Error("upstream unavailable");
        return fetch(url);
      },
      () => now,
    ),
    /upstream unavailable/,
  );
  assert.deepEqual(mem.data["lennon-lounge-matchday"][8].current, old);
  assert.equal(mem.data["lennon-lounge-matchday"][8].health.ok, false);
});
test("official final results grade exact prizes once and do not alter bets or payment records", async () => {
  const now = Date.now(),
    round = {
      event: 8,
      name: "GW8",
      status: "open",
      prizePence: 5000,
      prizeMode: "each",
      openedAt: now - 3600000,
      cutoff: now - 1800000,
      fixtures: { m: { home: "selig", away: "rowez" } },
    };
  const entry = {
    matchId: "m",
    homePts: 47,
    awayPts: 39,
    enteredAt: now - 3000000,
  };
  const mem = memory({
    "lennon-lounge": {
      gameweeks: [],
      fpl: { leagueId: 1, entryMap: { 1: "forged", 2: "mapping" } },
    },
    "lennon-lounge-score-game": {
      rounds: { 8: round },
      entries: { 8: { alice: entry, bob: entry } },
    },
  });
  const fetch = async (url) =>
    url.endsWith("bootstrap-static")
      ? {
          events: [
            { id: 8, deadline_time: new Date(round.cutoff).toISOString() },
          ],
        }
      : {
          league_entries: [
            {
              id: 1,
              entry_id: 1,
              player_first_name: "Daniel",
              player_last_name: "Seligman",
            },
            {
              id: 2,
              entry_id: 2,
              player_first_name: "Jack",
              player_last_name: "Rowe",
            },
          ],
          matches: [
            {
              event: 8,
              finished: true,
              league_entry_1: 1,
              league_entry_2: 2,
              league_entry_1_points: 47,
              league_entry_2_points: 39,
            },
          ],
        };
  await run(mem.db, fetch, () => now);
  assert.equal(
    mem.data["lennon-lounge-score-game"].results[8].totalPrizePence,
    10000,
  );
  const count = mem.writes.length;
  await run(mem.db, fetch, () => now + 60000);
  assert.equal(mem.writes.length, count);
  assert.equal(mem.writes[0].method, "CREATE");
});
