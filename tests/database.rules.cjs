const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  ref,
  set,
  get,
  remove,
  runTransaction,
  serverTimestamp,
} = require("firebase/database");
let env, cutoff;
const root = "lennon-lounge-score-game";
const db = (user) => env.authenticatedContext(user).database();
const entry = () => ({
  matchId: "m_1",
  homePts: 47,
  awayPts: 39,
  enteredAt: serverTimestamp(),
});
const round = () => ({
  event: 9,
  gwId: "gw_1",
  name: "GW 9",
  openedAt: Date.now() - 1000,
  cutoff,
  prizePence: 5000,
  prizeMode: "each",
  status: "open",
  fixtures: { m_1: { home: "player", away: "other" } },
});
async function seed(path, value) {
  await env.withSecurityRulesDisabled((c) =>
    set(ref(c.database(), path || undefined), value),
  );
}
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-lennon-lounge",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: fs.readFileSync("database.rules.json", "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearDatabase();
  cutoff = Date.now() + 3600000;
  await seed("", {
    "lennon-lounge-members": {
      alice: { team: "player" },
      secondDevice: { team: "player" },
      bob: { team: "other" },
      admin: { team: "selig" },
    },
    "lennon-lounge-auth": {
      player: "123456",
      other: "234567",
      selig: "345678",
    },
    "lennon-lounge": { fpl: { events: { 9: { deadline: cutoff } } } },
  });
});
after(async () => {
  if (env) await env.cleanup();
});
test("only house managers can open a fixed £50 round; it cannot be edited or deleted", async () => {
  await assertFails(set(ref(db("alice"), root + "/rounds/9"), round()));
  await assertSucceeds(set(ref(db("admin"), root + "/rounds/9"), round()));
  await assertFails(set(ref(db("admin"), root + "/rounds/9/prizePence"), 1));
  await assertFails(remove(ref(db("admin"), root + "/rounds/9")));
});
test("own valid entry succeeds; another device, owner, edit or deletion cannot bypass one entry", async () => {
  await seed(root + "/rounds/9", round());
  const path = root + "/entries/9/player";
  await assertSucceeds(set(ref(db("alice"), path), entry()));
  await assertFails(set(ref(db("secondDevice"), path), entry()));
  await assertFails(set(ref(db("bob"), path), entry()));
  await assertFails(set(ref(db("alice"), path + "/homePts"), 12));
  await assertFails(remove(ref(db("alice"), path)));
  await assertFails(remove(ref(db("admin"), path)));
});
test("two simultaneous submissions from two devices commit exactly one entry", async () => {
  await seed(root + "/rounds/9", round());
  const path = root + "/entries/9/player";
  const attempts = await Promise.allSettled(
    ["alice", "secondDevice"].map((u, i) =>
      runTransaction(
        ref(db(u), path),
        (old) => (old ? undefined : { ...entry(), homePts: 47 + i }),
        { applyLocally: false },
      ),
    ),
  );
  assert.equal(
    attempts.filter((r) => r.status === "fulfilled" && r.value.committed)
      .length,
    1,
  );
  assert.ok(
    [47, 48].includes((await get(ref(db("alice"), path))).val().homePts),
  );
});
test("unpublished, expired, fake fixture, fractional scores and forged timestamps are rejected", async () => {
  const path = root + "/entries/9/player";
  await assertFails(set(ref(db("alice"), path), entry()));
  await seed(root + "/rounds/9", round());
  for (const value of [
    { ...entry(), matchId: "bogus" },
    { ...entry(), homePts: 1.5 },
    { ...entry(), enteredAt: Date.now() - 60000 },
    { ...entry(), amountPence: 5000 },
  ])
    await assertFails(set(ref(db("alice"), path), value));
  await seed(root + "/rounds/9/cutoff", Date.now() - 1);
  await assertFails(set(ref(db("alice"), path), entry()));
});
test("entries stay private until the cutoff; house can inspect participation", async () => {
  await seed(root + "/rounds/9", round());
  await assertSucceeds(
    set(ref(db("alice"), root + "/entries/9/player"), entry()),
  );
  await assertSucceeds(get(ref(db("alice"), root + "/entries/9/player")));
  await assertFails(get(ref(db("bob"), root + "/entries/9/player")));
  await assertSucceeds(get(ref(db("admin"), root + "/entries")));
  await seed(root + "/rounds/9/cutoff", Date.now() - 1);
  await assertSucceeds(get(ref(db("bob"), root + "/entries/9")));
});
test("a new week permits another entry but does not unlock the previous one", async () => {
  await seed(root + "/rounds/9", round());
  await seed(root + "/rounds/10", { ...round(), event: 10 });
  await assertSucceeds(
    set(ref(db("alice"), root + "/entries/9/player"), entry()),
  );
  await assertSucceeds(
    set(ref(db("alice"), root + "/entries/10/player"), entry()),
  );
  await assertFails(set(ref(db("alice"), root + "/entries/9/player"), entry()));
});
test("clients cannot forge results or matchday data; only a house manager can record an actual winner as paid", async () => {
  for (const user of ["alice", "admin"]) {
    await assertFails(
      set(ref(db(user), root + "/results/9"), {
        outcomes: { player: { won: true, amountPence: 5000 } },
      }),
    );
    await assertFails(
      set(ref(db(user), "lennon-lounge-matchday/9"), { current: {} }),
    );
  }
  const path = root + "/paid/9/player",
    paid = { paidAt: serverTimestamp(), paidBy: "selig" };
  await assertFails(set(ref(db("admin"), path), paid));
  await seed(root + "/results/9/outcomes/player", {
    won: true,
    amountPence: 5000,
  });
  await assertFails(set(ref(db("alice"), path), paid));
  await assertSucceeds(set(ref(db("admin"), path), paid));
  await assertFails(remove(ref(db("admin"), path)));
  await assertFails(set(ref(db("admin"), path), paid));
});
