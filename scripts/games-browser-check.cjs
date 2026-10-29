/* Isolated interaction checks, called by browser-smoke.cjs. All Firebase writes are mocked. */
const assert = require("node:assert/strict"),
  path = require("node:path");
const source = require("../tests/fixtures/in-play-source.cjs");
const { generate } = require("./in-play.cjs");
module.exports = async function (page, out) {
  page.on("dialog", (dialog) => dialog.accept());
  await page.evaluate(() => {
    me = TEAMS.find((t) => !t.admin);
    scoreReady = true;
    scoreEntryReady = { 9: true };
    const g = S.gameweeks.find((g) => g.event === 9);
    g.status = "open";
    g.deadline = Date.now() + 3600000;
    g.kickoff = Date.now() + 7200000;
    S.fpl.events[9].deadline = g.deadline;
    S.fpl.plFixtures[9] = [];
    scoreRounds = { 9: LennonGames.makeRound(S, g, Date.now()) };
    window.gameTestWrites = {};
    firebase.database.ServerValue = { TIMESTAMP: { ".sv": "timestamp" } };
    window.oldTestRef = db.ref;
    db.ref = (p) => ({
      ...oldTestRef(p),
      transaction: async (update) => {
        const next = update(gameTestWrites[p] || null);
        if (next === undefined)
          return {
            committed: false,
            snapshot: { val: () => gameTestWrites[p] },
          };
        const value = { ...next, enteredAt: Date.now() };
        gameTestWrites[p] = value;
        return { committed: true, snapshot: { val: () => value } };
      },
    });
    go("home");
  });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      clearTimeout(_resizeTimer);
      _wasMobileLayout = isMobileLayout();
      render();
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `predictor overflow ${width}`,
    );
    await page
      .locator(".sg-hero")
      .screenshot({ path: path.join(out, `score-game-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(250);
  const matchId = await page.evaluate(
    () => S.gameweeks.find((g) => g.event === 9).matches[0].id,
  );
  await page.locator("#sg-fixture").selectOption(matchId);
  await page.locator("#sg-home").fill("47");
  await page.locator("#sg-away").fill("39");
  await page.evaluate(() => render());
  assert.equal(
    await page.locator("#sg-home").inputValue(),
    "47",
    "background render preserves typed score",
  );
  assert.equal(await page.locator("#sg-away").inputValue(), "39");
  await page.getByRole("button", { name: "Lock my free prediction" }).click();
  await page.getByText("YOUR PREDICTION IS LOCKED", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => Object.keys(gameTestWrites).length),
    1,
  );
  await page.evaluate(() => render());
  assert.equal(await page.locator("#sg-home").count(), 0, "no second go");
  await page
    .locator(".sg-hero")
    .screenshot({ path: path.join(out, "score-game-locked.png") });
  await page
    .getByRole("button", { name: "View in My Bets →", exact: true })
    .click();
  const freeBet = page.locator(".bet").filter({ hasText: "£50 Score Shot" });
  await freeBet.getByText("Accepted ✓", { exact: true }).waitFor();
  assert.equal(await freeBet.count(), 1);
  await freeBet.screenshot({ path: path.join(out, "score-game-my-bets.png") });
  await page.evaluate(() => go("home"));
  await page.evaluate(() => {
    const entry = scoreEntries[9];
    scoreResults[9] = {
      event: 9,
      outcomes: { [me.id]: { won: true, amountPence: 5000 } },
      scores: { [entry.matchId]: { homePts: 47, awayPts: 39 } },
    };
    render();
  });
  await page.getByText("You won £50.00!", { exact: true }).waitFor();
  await page
    .locator(".sg-hero")
    .screenshot({ path: path.join(out, "score-game-winner.png") });
  await page.evaluate(() => {
    scoreRounds[10] = { ...scoreRounds[9], event: 10, name: "GW 10" };
    scoreEntryReady[10] = true;
    render();
  });
  assert.equal(
    await page.locator("#sg-home").count(),
    1,
    "next week opens a fresh entry",
  );
  await page.evaluate(() => {
    scoreRounds[10].cutoff = Date.now() - 1;
    render();
  });
  assert.equal(
    await page.locator("#sg-home").count(),
    0,
    "expired entry closes",
  );
  const { s, g, now, fetch } = source(),
    draft = await generate(s, g, { id: "browser-matchday" }, fetch, () => now);
  await page.evaluate(
    ({ draft }) => {
      matchdayEvent = 8;
      const current = {
        event: 8,
        matches: draft.matches,
        forecast: draft.forecast,
        teams: draft.matchday.teams,
        active: true,
        reconciled: true,
        source: draft.source,
        officiallyFinished: false,
      };
      const previous = structuredClone(current);
      previous.source.fetchedAt -= 5 * 60000;
      Object.values(previous.matches).forEach((m) => {
        m.currentHome -= 6;
        m.probabilities.home = Math.max(0, m.probabilities.home - 0.15);
      });
      matchdayRecord = {
        current,
        history: LennonGames.appendTimeline(
          LennonGames.appendTimeline([], previous),
          current,
        ),
        health: { ok: true },
      };
      go("matchday");
    },
    { draft },
  );
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      clearTimeout(_resizeTimer);
      _wasMobileLayout = isMobileLayout();
      render();
    });
    assert.equal(await page.locator(".md-match").count(), 6);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `matchday overflow ${width}`,
    );
    await page.screenshot({
      path: path.join(out, `matchday-${width}.png`),
      fullPage: true,
    });
  }
  await page
    .locator(".md-match")
    .first()
    .getByText("Players & points", { exact: true })
    .click();
  assert.equal(
    await page.locator(".md-match").first().locator("tbody tr").count(),
    32,
  );
  await page
    .locator(".md-match")
    .first()
    .getByRole("button", { name: "Score timeline" })
    .click();
  assert.ok(await page.locator(".md-timeline li").count());
  await page.evaluate(() => {
    matchdayRecord.current.source.fetchedAt -= 3600000;
    render();
  });
  assert.ok(await page.getByText(/UPDATE DELAYED/).count());
  await page.evaluate(() => {
    matchdayRecord.current.reconciled = false;
    render();
  });
  assert.equal(await page.locator(".md-prob").count(), 0);
  await page.evaluate(() => {
    db.ref = oldTestRef;
    me = TEAMS[0];
    scoreAllEntries = {
      9: { [TEAMS.find((t) => !t.admin).id]: scoreEntries[9] },
    };
    go("settler");
  });
  await page.locator(".sg-history summary").filter({ hasText: "GW 9" }).click();
  assert.ok(
    await page.getByRole("button", { name: "Mark paid", exact: true }).count(),
  );
  console.log(
    "PASS: free-score entry, draft preservation, immutable UI, next-week reset, £50 winner, six matchday cards, player details, timeline and stale-data states at 320/390/1280px.",
  );
};
