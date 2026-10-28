// Retrospective reconstruction, not an archived forecast: only snapshot inputs known before deadline.
const fs = require("node:fs"),
  path = require("node:path"),
  M = require("../odds-model.js"),
  legacy = require("../tests/legacy-model.cjs");
const input = JSON.parse(fs.readFileSync(process.argv[2])),
  dir = path.join(__dirname, "../backups");
const snaps = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((file) => ({
    file,
    state: JSON.parse(fs.readFileSync(path.join(dir, file))),
  }));
const latest = snaps.sort((a, b) => a.file.localeCompare(b.file)).at(-1).state,
  results = input.details.matches
    .filter((m) => m.finished)
    .map((m) => ({
      event: m.event,
      a: latest.fpl.entryMap[m.league_entry_1],
      b: latest.fpl.entryMap[m.league_entry_2],
      ap: m.league_entry_1_points,
      bp: m.league_entry_2_points,
    }))
    .filter((x) => x.a && x.b);
const keys = ["home", "draw", "away"],
  outcome = (h) => (h.ap > h.bp ? "home" : h.ap === h.bp ? "draw" : "away");
function metric(rows) {
  if (!rows.length) return null;
  const pts = rows.flatMap((x) => x.points || []),
    n = rows.length;
  return {
    matches: n,
    points: pts.length,
    accuracy:
      rows.reduce(
        (s, x) =>
          s + (keys.reduce((a, b) => (x.p[b] > x.p[a] ? b : a)) == x.y ? 1 : 0),
        0,
      ) / n,
    brier:
      rows.reduce(
        (s, x) =>
          s + keys.reduce((z, k) => z + (x.p[k] - (x.y === k ? 1 : 0)) ** 2, 0),
        0,
      ) / n,
    logLoss:
      rows.reduce((s, x) => s - Math.log(Math.max(0.001, x.p[x.y])), 0) / n,
    mae: pts.length
      ? pts.reduce((s, x) => s + Math.abs(x.pred - x.actual), 0) / pts.length
      : null,
    rmse: pts.length
      ? Math.sqrt(
          pts.reduce((s, x) => s + (x.pred - x.actual) ** 2, 0) / pts.length,
        )
      : null,
    within10: pts.length
      ? pts.filter((x) => Math.abs(x.pred - x.actual) <= 10).length / pts.length
      : null,
    meanConfidence: pts.some((x) => x.confidence != null)
      ? pts.reduce((s, x) => s + (x.confidence || 0), 0) / pts.length
      : null,
    bias: pts.length
      ? pts.reduce((s, x) => s + x.pred - x.actual, 0) / pts.length
      : null,
    coverage80: pts.filter((x) => x.low != null).length
      ? pts.filter((x) => x.actual >= x.low && x.actual <= x.high).length /
        pts.length
      : null,
  };
}
const published = [],
  old = [],
  fresh = [],
  detail = [],
  excluded = [];
for (const h of results) {
  const g = latest.gameweeks.find((g) => g.event === h.event),
    m = g?.matches.find(
      (m) =>
        (m.home === h.a && m.away === h.b) ||
        (m.home === h.b && m.away === h.a),
    );
  if (!m) continue;
  const p0 = {
    home: 1 / m.odds[m.home === h.a ? "home" : "away"],
    draw: 1 / m.odds.draw,
    away: 1 / m.odds[m.home === h.a ? "away" : "home"],
  };
  const total = Object.values(p0).reduce((a, b) => a + b);
  keys.forEach((k) => (p0[k] /= total));
  published.push({ y: outcome(h), p: p0 });
}
for (const ev of [...new Set(results.map((h) => h.event))]) {
  const target = latest.gameweeks.find((g) => g.event === ev);
  if (!target) continue;
  const snapshot = snaps
    .filter(
      (x) => x.state.fpl?.squadSync && x.state.fpl.squadSync < target.deadline,
    )
    .sort((a, b) => b.state.fpl.squadSync - a.state.fpl.squadSync)[0];
  if (!snapshot) {
    excluded.push({ event: ev, reason: "No pre-deadline squad snapshot" });
    continue;
  }
  const state = structuredClone(snapshot.state);
  state.history = results.filter((h) => h.event < ev);
  state.gameweeks = state.gameweeks.map((g) => ({
    ...g,
    matches: g.matches.map((m) => {
      const c = { ...m };
      if (g.event >= ev) delete c.result;
      return c;
    }),
  }));
  const prior = legacy.projectTeams(state, ev);
  const enriched = structuredClone(state);
  enriched.fpl.playerHistory = input.playerHistory;
  enriched.fpl.modelData = input.modelData;
  enriched.fpl.plFixtures = { ...state.fpl.plFixtures };
  for (const [e, fsx] of Object.entries(input.plFixtures))
    if (Number(e) < ev)
      enriched.fpl.plFixtures[e] = fsx.filter((f) => f.k < target.deadline);
  // Historical archive has no event-locked picks; treat the last XI as a preference, not leaked certainty.
  const pred = M.forecast(enriched, ev, { samples: 4000, lineupsKnown: false });
  for (const h of results.filter((h) => h.event === ev)) {
    const po = legacy.fairMatchProbs(state, h.a, h.b, ev, prior),
      pn = M.matchProbs(enriched, h.a, h.b, ev, pred),
      rec = M.recommendation(enriched, h.a, h.b, ev, pred);
    const op = [
        { pred: prior[h.a].proj, actual: h.ap },
        { pred: prior[h.b].proj, actual: h.bp },
      ],
      np = [
        {
          pred: pred.teams[h.a].proj,
          actual: h.ap,
          low: pred.teams[h.a].low,
          high: pred.teams[h.a].high,
          confidence: pred.teams[h.a].confidence,
        },
        {
          pred: pred.teams[h.b].proj,
          actual: h.bp,
          low: pred.teams[h.b].low,
          high: pred.teams[h.b].high,
          confidence: pred.teams[h.b].confidence,
        },
      ];
    old.push({ event: ev, y: outcome(h), p: po, points: op });
    fresh.push({ event: ev, y: outcome(h), p: pn, points: np });
    detail.push({
      ...h,
      snapshot: snapshot.file,
      snapshotAt: state.fpl.squadSync,
      oldPoints: op.map((x) => x.pred),
      newPoints: np.map((x) => x.pred),
      newConfidence: [pred.teams[h.a].confidence, pred.teams[h.b].confidence],
      newProbabilities: pn,
      newOdds: rec.odds,
    });
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  version: M.VERSION,
  limitations: [
    "Published odds are final stored base prices: original recommendation, earlier revisions and promotions were not archived.",
    "Old and new points are reconstructions, not recorded pre-match forecasts.",
    "Snapshots can be several days old. Historical lineups, injuries and transfers between snapshot and deadline are unknown.",
    "New inputs use retrospective histories strictly before each target event. Later corrections to past statistics cannot be undone.",
    "Missing histories for no-longer-owned players fall back to the contemporaneous snapshot.",
    "Small in-sample development comparison; not proof of future improvement.",
  ],
  published: metric(published),
  legacy: metric(old),
  updated: metric(fresh),
  excluded,
  byEvent: [...new Set(fresh.map((x) => x.event))].map((event) => ({
    event,
    legacy: metric(old.filter((x) => x.event === event)),
    updated: metric(fresh.filter((x) => x.event === event)),
  })),
  detail,
};
fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, detail: undefined }, null, 2));
