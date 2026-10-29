/* Browser interaction checks with isolated Firebase, including admin publication lifecycle. */
const assert = require("node:assert/strict"),
  path = require("node:path");
const { generate } = require("./in-play.cjs");
module.exports = async (page, out) => {
  const { s, g } = await page.evaluate(() => {
    me = TEAMS.find((t) => t.admin);
    const g = S.gameweeks.find((g) => g.event === 9);
    g.status = "draft";
    window.publicationTestData = {};
    publicationTestData[SCORE_ROOT + "/rounds/9"] = scoreRounds[9];
    window.publicationOldRef = db.ref;
    window.publicationOldPoster = openPoster;
    openPoster = () => {};
    db.ref = (p) => ({
      ...oldTestRef(p),
      once: async () => ({ val: () => publicationTestData[p] || null }),
      set: async (v) => {
        publicationTestData[p] = v;
      },
      update: async (v) => {
        if (!p) Object.assign(publicationTestData, v);
        else publicationTestData[p] = { ...publicationTestData[p], ...v };
      },
      transaction: async (fn) => {
        const v = fn(publicationTestData[p] || null);
        if (v === undefined)
          return {
            committed: false,
            snapshot: { val: () => publicationTestData[p] },
          };
        publicationTestData[p] = v;
        return { committed: true, snapshot: { val: () => v } };
      },
    });
    go("odds");
    return { s: structuredClone(S), g: structuredClone(g) };
  });
  const card = page.locator("#inplay-admin-" + g.id);
  await card.getByText(/Gameweek cutoff:/).waitFor();
  await card
    .getByRole("button", { name: "Generate in-play odds", exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      (id) => publicationTestData[INPLAY_ROOT + "/" + id + "/request"].status,
      g.id,
    ),
    "queued",
  );
  const now = Date.now(),
    d = await generate(
      s,
      g,
      { id: "browser-pre" },
      async () => ({
        events: [
          { id: g.event, deadline_time: new Date(g.deadline).toISOString() },
        ],
      }),
      () => now,
    );
  await page.evaluate(
    ({ d, id }) => {
      inPlayState[id] = { draft: d };
      publicationTestData[INPLAY_ROOT + "/" + id] = inPlayState[id];
      render();
    },
    { d, id: g.id },
  );
  assert.equal(
    await card
      .getByRole("button", { name: "Publish these in-play odds", exact: true })
      .isDisabled(),
    true,
  );
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await card.screenshot({
      path: path.join(out, "prestart-admin-" + width + ".png"),
    });
  }
  await page
    .locator("#odds-" + g.id)
    .getByRole("button", {
      name: "🚀 Publish — release odds & open for betting",
      exact: true,
    })
    .click();
  // Publishing can create a promo: refresh the preview against the released board.
  const current = await page.evaluate(
    (id) => ({ s: structuredClone(S), g: structuredClone(gw(id)) }),
    g.id,
  );
  const fresh = await generate(
    current.s,
    current.g,
    { id: "browser-released" },
    async () => ({
      events: [
        { id: g.event, deadline_time: new Date(g.deadline).toISOString() },
      ],
    }),
    Date.now,
  );
  await page.evaluate(
    ({ d, id }) => {
      inPlayState[id] = { draft: d };
      publicationTestData[INPLAY_ROOT + "/" + id] = inPlayState[id];
      render();
    },
    { d: fresh, id: g.id },
  );
  await card
    .getByRole("button", { name: "Publish these in-play odds", exact: true })
    .click();
  await card
    .getByRole("button", { name: "↩ Pull back in-play odds", exact: true })
    .waitFor();
  const revision = await page.evaluate(
    (id) => inPlayPublished(id).revision,
    g.id,
  );
  await card
    .getByRole("button", { name: "↩ Pull back in-play odds", exact: true })
    .click();
  assert.equal(await page.evaluate((id) => inPlayPublished(id), g.id), null);
  await card
    .getByRole("button", { name: "Publish these in-play odds", exact: true })
    .click();
  assert.notEqual(
    await page.evaluate((id) => inPlayPublished(id).revision, g.id),
    revision,
  );
  await page
    .locator("#odds-" + g.id)
    .getByRole("button", { name: "↩ Pull back odds", exact: true })
    .click();
  assert.equal(await page.evaluate((id) => gw(id).status, g.id), "draft");
  assert.equal(await page.evaluate((id) => inPlayPublished(id), g.id), null);
  await page.evaluate(() => {
    me = TEAMS.find((t) => !t.admin);
    delete scoreRounds[10];
    go("home");
  });
  await page.getByText("You won £50.00!", { exact: true }).waitFor(); // Prior entry retained.
  await page.evaluate(() => {
    me = TEAMS.filter((t) => !t.admin)[1];
    scoreEntries = {};
    go("home");
  });
  await page.getByText("This round is on hold.", { exact: true }).waitFor();
  await page.evaluate(() => {
    me = TEAMS.find((t) => t.admin);
    go("odds");
  });
  await page
    .locator("#odds-" + g.id)
    .getByRole("button", {
      name: "🚀 Publish — release odds & open for betting",
      exact: true,
    })
    .click();
  assert.equal(await page.evaluate((id) => oddsWithdrawn(id), g.id), false);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    db.ref = publicationOldRef;
    openPoster = publicationOldPoster;
  });
  console.log(
    "PASS: pre-start preview, visible cutoff, publish/pull-back/re-release, free-game pause and retained entries; mobile/desktop layouts.",
  );
};
