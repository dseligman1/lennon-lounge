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
  update,
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

test("only admins can withdraw odds; free entries pause and resume without resetting existing entries", async () => {
  await seed(root + "/rounds/9", round());
  await assertSucceeds(
    set(ref(db("alice"), root + "/entries/9/player"), entry()),
  );
  const gate = "lennon-lounge-publication/gw_1";
  await assertFails(set(ref(db("alice"), gate), { status: "withdrawn" }));
  await assertSucceeds(set(ref(db("admin"), gate), { status: "withdrawn" }));
  await assertFails(set(ref(db("bob"), root + "/entries/9/other"), entry()));
  assert.ok((await get(ref(db("alice"), root + "/entries/9/player"))).exists());
  await assertSucceeds(set(ref(db("admin"), gate), { status: "published" }));
  await assertSucceeds(set(ref(db("bob"), root + "/entries/9/other"), entry()));
  await assertFails(set(ref(db("alice"), root + "/entries/9/player"), entry()));
});
test("withdrawal blocks new normal bets and acceptance while retaining existing accepted bets and settlement", async () => {
  const bet = {
    gwId: "gw_1",
    teamId: "player",
    status: "accepted",
    stake: 10,
    placedAt: Date.now(),
    legs: [
      { gwId: "gw_1", type: "match", matchId: "m_1", pick: "home", odds: 2 },
    ],
  };
  await seed("lennon-lounge/bets", {
    a: { ...bet, id: "a" },
    pending: { ...bet, id: "pending", status: "pending" },
  });
  await seed("lennon-lounge-publication/gw_1", { status: "withdrawn" });
  await assertFails(
    set(ref(db("alice"), "lennon-lounge/bets/b"), {
      ...bet,
      id: "b",
      status: "pending",
    }),
  );
  await assertFails(
    set(ref(db("admin"), "lennon-lounge/bets/pending"), {
      ...bet,
      id: "pending",
    }),
  );
  await assertSucceeds(
    set(ref(db("alice"), "lennon-lounge/bets/a"), { ...bet, id: "a" }),
  );
  await assertSucceeds(
    set(ref(db("admin"), "lennon-lounge/bets/a"), {
      ...bet,
      id: "a",
      status: "won",
    }),
  );
  // 2026-11-08: players can no longer write shared data such as the gameweek list at all.
  await assertFails(
    set(ref(db("alice"), "lennon-lounge/gameweeks"), [
      { id: "gw_1", status: "open" },
    ]),
  );
  await assertFails(
    set(ref(db("alice"), "lennon-lounge/bets/b"), { ...bet, id: "b" }),
  );
  await assertSucceeds(
    set(ref(db("admin"), "lennon-lounge-publication/gw_1"), {
      status: "published",
    }),
  );
  await assertSucceeds(
    set(ref(db("alice"), "lennon-lounge/bets/b"), {
      ...bet,
      id: "b",
      status: "pending",
    }),
  );
});
test("withdrawing in-play prices blocks stale submissions; bets placed while live can still be approved later", async () => {
  const market = {
    status: "published",
    revision: "r1",
    cutoff: Date.now() + 60000,
    matches: { m_1: { suspended: false, odds: { home: 2 } } },
  };
  const bet = {
    gwId: "gw_1",
    teamId: "player",
    stake: 5,
    placedAt: Date.now(),
    inplay: true,
    status: "accepted",
    legs: [
      {
        gwId: "gw_1",
        marketRevision: "r1",
        type: "match",
        matchId: "m_1",
        pick: "home",
        odds: 2,
      },
    ],
  };
  const as = (id, extra = {}) => ({ ...bet, id, ...extra });
  await seed("lennon-lounge-inplay/gw_1/published", market);
  await assertFails(set(ref(db("alice"), "lennon-lounge/bets/a"), as("a")));
  for (const id of ["a", "b"])
    await assertSucceeds(
      set(
        ref(db("alice"), "lennon-lounge/bets/" + id),
        as(id, { status: "pending" }),
      ),
    );
  await assertSucceeds(set(ref(db("admin"), "lennon-lounge/bets/a"), as("a")));
  await assertSucceeds(
    remove(ref(db("admin"), "lennon-lounge-inplay/gw_1/published")),
  );
  await assertFails(
    set(
      ref(db("alice"), "lennon-lounge/bets/c"),
      as("c", { status: "pending" }),
    ),
  );
  // 2026-11-07: the house approves every bet, so one placed while the market was live stays approvable.
  await assertSucceeds(set(ref(db("admin"), "lennon-lounge/bets/b"), as("b")));
  await assertSucceeds(set(ref(db("alice"), "lennon-lounge/bets/a"), as("a")));
  await assertSucceeds(
    set(ref(db("admin"), "lennon-lounge/bets/a"), as("a", { status: "won" })),
  );
});

test("admin publication update is atomic across the gameweek and protected gate without touching bets", async () => {
  const bet = { gwId: "gw_1", status: "accepted", stake: 10 };
  await seed("lennon-lounge/bets/a", bet);
  const patch = {
    "lennon-lounge/gameweeks/0": { id: "gw_1", status: "draft" },
    "lennon-lounge-publication/gw_1": { status: "withdrawn" },
  };
  await assertFails(update(ref(db("alice")), patch));
  assert.equal(
    (await get(ref(db("alice"), "lennon-lounge/gameweeks"))).exists(),
    false,
  );
  await assertSucceeds(update(ref(db("admin")), patch));
  assert.deepEqual(
    (await get(ref(db("alice"), "lennon-lounge/bets/a"))).val(),
    bet,
  );
  await assertSucceeds(
    update(ref(db("admin")), {
      "lennon-lounge/gameweeks/0/status": "open",
      "lennon-lounge-publication/gw_1/status": "published",
    }),
  );
});

test("in-play bets are independent of a pulled-back normal board", async () => {
  await seed("lennon-lounge-publication/gw_1", { status: "withdrawn" });
  await seed("lennon-lounge-inplay/gw_1/published", {
    status: "published",
    revision: "r1",
    cutoff: Date.now() + 60000,
    matches: { m_1: { suspended: false, odds: { home: 2 } } },
  });
  const leg = {
    gwId: "gw_1",
    marketRevision: "r1",
    type: "match",
    matchId: "m_1",
    pick: "home",
    odds: 2,
  };
  await assertSucceeds(
    set(ref(db("alice"), "lennon-lounge/bets/ip"), {
      id: "ip",
      teamId: "player",
      stake: 5,
      placedAt: Date.now(),
      gwId: "gw_1",
      inplay: true,
      status: "pending",
      legs: [leg],
    }),
  );
  await assertFails(
    set(ref(db("alice"), "lennon-lounge/bets/normal"), {
      id: "normal",
      teamId: "player",
      stake: 5,
      placedAt: Date.now(),
      gwId: "gw_1",
      status: "pending",
      legs: [{ type: "match", matchId: "m_1", pick: "home", odds: 2 }],
    }),
  );
});

// 2026-11-08: players can change only their own bets (within strict limits), their own reward
// tokens, and add chat/log entries. Everything else is house-only.
const L = "lennon-lounge";
const myBet = (id, extra = {}) => ({
  id,
  teamId: "player",
  gwId: "gw_1",
  status: "pending",
  stake: 10,
  effOdds: 2,
  placedAt: Date.now(),
  legs: [
    { gwId: "gw_1", type: "match", matchId: "m_1", pick: "home", odds: 2 },
  ],
  history: [{ by: "player", action: "placed", at: Date.now() }],
  limitFlags: ["over"],
  ...extra,
});
test("players cannot write shared data or the whole tree; house managers can", async () => {
  for (const [path, value] of [
    [L, { gameweeks: [] }],
    [L + "/gameweeks/0/status", "open"],
    [L + "/settings/maxPayout", 99999],
    [L + "/teams/0/name", "Hacked"],
    [L + "/promos/0/odds", 50],
    [L + "/seq", 1],
    [L + "/bets", { b1: myBet("b1") }],
  ])
    await assertFails(set(ref(db("alice"), path), value));
  await assertSucceeds(set(ref(db("admin"), L + "/settings/maxPayout"), 2000));
  await assertSucceeds(
    set(ref(db("admin"), L + "/gameweeks/0/status"), "open"),
  );
});
test("a player creates only their own pending bet and cannot edit price, legs, result or others' bets", async () => {
  const B = (id) => ref(db("alice"), L + "/bets/" + id);
  await assertFails(set(B("x1"), myBet("x1", { teamId: "other" })));
  await assertFails(set(B("x2"), myBet("x2", { status: "accepted" })));
  await assertFails(set(B("x3"), myBet("x3", { settledPayout: 500 })));
  await assertFails(set(B("x4"), myBet("wrong-key")));
  await assertFails(
    set(B("x5"), myBet("x5", { placedAt: Date.now() - 86400000 })),
  );
  await assertSucceeds(set(B("b1"), myBet("b1")));
  await assertFails(set(ref(db("bob"), L + "/bets/b1/status"), "cancelled"));
  await assertFails(set(B("b1/stake"), 100));
  await assertFails(set(B("b1/effOdds"), 9));
  await assertFails(set(B("b1/legs/0/odds"), 9));
  await assertFails(set(B("b1/legs/0/pick"), "away"));
  await assertFails(
    set(B("b1/legs/1"), {
      type: "match",
      matchId: "m_2",
      pick: "home",
      odds: 2,
    }),
  );
  await assertFails(set(B("b1/status"), "accepted"));
  await assertFails(set(B("b1/status"), "won"));
  await assertFails(set(B("b1/limitFlags"), null));
  await assertFails(set(B("b1/history"), null));
  await assertFails(remove(B("b1")));
  await assertSucceeds(
    set(B("b1/history/1"), {
      by: "player",
      action: "message",
      message: "go on",
      at: Date.now(),
    }),
  );
  await assertSucceeds(set(B("b1/status"), "cancelled"));
  // The house accepts and settles.
  await assertSucceeds(
    set(ref(db("admin"), L + "/bets/b2"), myBet("b2", { status: "accepted" })),
  );
  await assertFails(set(B("b2/status"), "won"));
  await assertSucceeds(
    update(ref(db("admin"), L + "/bets/b2"), {
      status: "won",
      settledPayout: 20,
    }),
  );
  await assertFails(set(B("b2/settledPayout"), 2000));
});
test("counter-offers: a player accepts only the house's exact terms and cannot rewrite the offer", async () => {
  const offer = { stake: 3, effOdds: 2.5, by: "house" };
  await seed(L + "/bets", {
    c1: myBet("c1", { status: "counter_house", offer }),
    c2: myBet("c2", { status: "counter_house", offer }),
    c3: myBet("c3", { status: "counter_house", offer }),
  });
  const B = (id) => ref(db("alice"), L + "/bets/" + id);
  await assertFails(set(B("c1/offer/effOdds"), 10));
  await assertFails(
    update(B("c1"), { status: "accepted", offer: null, stake: 3, effOdds: 10 }),
  );
  await assertSucceeds(
    update(B("c1"), {
      status: "accepted",
      offer: null,
      stake: 3,
      effOdds: 2.5,
    }),
  );
  await assertSucceeds(update(B("c2"), { status: "rejected", offer: null }));
  await assertFails(
    update(B("c3"), {
      status: "counter_user",
      offer: { stake: 50, effOdds: 3, by: "house" },
    }),
  );
  await assertSucceeds(
    update(B("c3"), {
      status: "counter_user",
      offer: { stake: 50, effOdds: 3, by: "player" },
    }),
  );
  await assertFails(
    update(B("c3"), { status: "accepted", stake: 50, effOdds: 3 }),
  );
});
test("chat, activity log and promo grants are add-only for players and keyed by id", async () => {
  for (const [list, item] of [
    ["chat", { by: "player", text: "hi", at: 1 }],
    ["audit", { by: "player", action: "x", at: 1 }],
    [
      "rewardGrants",
      { teamId: "player", ruleId: "r", eventKey: "bet:1", at: 1 },
    ],
  ]) {
    const P = (u, id) => ref(db(u), `${L}/${list}/${id}`);
    await assertSucceeds(set(P("alice", "i1"), { ...item, id: "i1" }));
    await assertFails(set(P("alice", "i2"), { ...item, id: "other-key" }));
    await assertFails(set(P("bob", "i3"), { ...item, id: "i3" }));
    await assertFails(set(P("alice", "i1"), { ...item, id: "i1", at: 2 }));
    await assertFails(remove(P("alice", "i1")));
    await assertSucceeds(remove(P("admin", "i1")));
  }
  await assertFails(
    set(ref(db("alice"), L + "/chat/long"), {
      id: "long",
      by: "player",
      text: "x".repeat(301),
      at: 1,
    }),
  );
});
test("reward tokens: a player adds or uses their own, but cannot un-use, resize or touch another team's", async () => {
  const R = (u, tid, id) => ref(db(u), `${L}/rewards/${tid}/${id}`);
  const tok = {
    id: "t1",
    kind: "freebet",
    amount: 5,
    used: false,
    grantedAt: 1,
  };
  await assertSucceeds(set(R("alice", "player", "t1"), tok));
  await assertFails(set(R("alice", "other", "t1"), tok));
  await assertFails(
    set(R("alice", "player", "t2"), { ...tok, id: "t2", used: true }),
  );
  await assertFails(set(R("alice", "player", "t1/amount"), 500));
  await assertSucceeds(set(R("alice", "player", "t1/used"), true));
  await assertFails(set(R("alice", "player", "t1/used"), false));
  await assertFails(remove(R("alice", "player", "t1")));
  await assertSucceeds(set(R("admin", "player", "t1/used"), false));
});
test("usage stats stay writable by players; old list-shaped bets are refused even from the house", async () => {
  await assertSucceeds(
    update(ref(db("alice"), L + "/usage"), {
      "events/ev_1": { id: "ev_1", at: 1, team: "player", type: "view" },
      "daily/2026-11-08/player/views": 3,
    }),
  );
  await assertFails(set(ref(db("admin"), L + "/bets"), [myBet("b1")]));
  await assertFails(set(ref(db("admin"), L), { bets: [myBet("b1")] }));
});
test("two players adding bets at the same moment both keep their bet", async () => {
  await Promise.all([
    assertSucceeds(set(ref(db("alice"), L + "/bets/bet_a"), myBet("bet_a"))),
    assertSucceeds(
      set(
        ref(db("bob"), L + "/bets/bet_b"),
        myBet("bet_b", { teamId: "other" }),
      ),
    ),
  ]);
  const bets = (await get(ref(db("admin"), L + "/bets"))).val();
  assert.deepEqual(Object.keys(bets).sort(), ["bet_a", "bet_b"]);
});
