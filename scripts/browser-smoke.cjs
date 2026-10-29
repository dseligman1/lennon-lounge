// Isolated headless browser: Firebase is stubbed, all production data writes are blocked.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { chromium } = require("@playwright/test");
(async () => {
  const root = path.join(__dirname, ".."),
    out = path.join(root, "../outputs/2026-10-29-publication-check");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    ...(process.platform === "darwin"
      ? {
          executablePath:
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        }
      : {}),
    headless: true,
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (process.argv.includes("--production")) {
      await page.goto(
        "https://dseligman1.github.io/lennon-lounge/?verify=" + Date.now(),
      );
      await page.waitForFunction(
        () => document.querySelectorAll("#teamGrid .team-chip").length === 12,
        { timeout: 30000 },
      );
      assert.equal(
        await page.evaluate(() => LennonModel.VERSION),
        "2026.10-player-v1",
      );
      assert.equal(
        await page.evaluate(() => typeof LennonInPlay.publishError),
        "function",
      );
      assert.equal(await page.evaluate(() => typeof requestInPlay), "function");
      assert.equal(
        await page.evaluate(() => typeof LennonGames.entryError),
        "function",
      );
      assert.equal(await page.evaluate(() => typeof vMatchday), "function");
      assert.equal(await page.evaluate(() => typeof withdrawOdds), "function");
      assert.equal(
        await page.evaluate(() => typeof LennonInPlay.normalOdds),
        "function",
      );
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(out, "production-login.png") });
      console.log(
        "PASS: production page loads all three model/in-play modules and all 12 login choices without JavaScript errors. No member login or app data writes.",
      );
      return;
    }
    let html = fs
      .readFileSync(path.join(root, "index.html"), "utf8")
      .replace(/<script src="https:\/\/www.gstatic.com[^>]+><\/script>/g, "");
    html = html.replace(
      "if(document.readyState==='loading'){\n  document.addEventListener('DOMContentLoaded',initApp);\n} else {\n  initApp();\n}",
      "",
    );
    const stub = `<script>const testRef=()=>({on:()=>{},off:()=>{},set:async()=>{},update:async()=>{},once:async()=>({val:()=>null}),push:()=>({set:async()=>{}})});window.firebase={initializeApp:()=>{},database:()=>({ref:testRef}),auth:()=>({currentUser:null})};</script>`;
    html = html.replace(
      '<script src="odds-model',
      stub + '<script src="odds-model',
    );
    await page.route("**/*", async (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === "lennon.test") {
        const name = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
        return route.fulfill({
          status: 200,
          contentType: name.endsWith(".js")
            ? "text/javascript"
            : name.endsWith(".css")
              ? "text/css"
              : "text/html",
          body:
            name === "index.html"
              ? html
              : fs.readFileSync(path.join(root, name)),
        });
      }
      return route.abort();
    });
    await page.goto("http://lennon.test/");
    const state = JSON.parse(
      fs.readFileSync(path.join(root, "backups/2026-10-26.json")),
    );
    const inputs = JSON.parse(
      fs.readFileSync(path.join(root, "../data/2026-10-28-model-inputs.json")),
    );
    Object.assign(state.fpl, {
      playerHistory: inputs.playerHistory,
      modelData: inputs.modelData,
      plFixtures: inputs.plFixtures,
    });
    await page.evaluate((state) => {
      S = migrate(state);
      me = TEAMS[0];
      document.getElementById("login").style.display = "none";
      document.getElementById("app").style.display = "block";
      render();
    }, state);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of ["home", "builder", "odds", "office", "settler"]) {
        await page.evaluate((tab) => go(tab), tab);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        assert.equal(overflow, false, `${tab} overflow at ${width}`);
      }
      await page.evaluate(() => go("odds"));
      await page.screenshot({
        path: path.join(out, `odds-${width}.png`),
        fullPage: true,
      });
    }
    await require("./games-browser-check.cjs")(page, out);
    await require("./publication-browser-check.cjs")(page, out);
    await page.evaluate(() => {
      const g = gw("gw_74"),
        pred = modelForecast(S, 8),
        now = Date.now(),
        matches = {};
      g.matches.forEach((m, i) => {
        matches[m.id] = {
          ...m,
          currentHome: 20 + i,
          currentAway: 18 + i,
          odds: { home: 1.65, draw: 14, away: 2.1 },
          suspended: false,
        };
      });
      const d = {
        status: "published",
        revision: "test-v1",
        gwId: g.id,
        event: g.event,
        source: {
          fetchedAt: now,
          warnings: ["Test snapshot: no live writes."],
        },
        publishedAt: now,
        cutoff: now + 3600000,
        maxCutoff: now + 3600000,
        blockedReasons: [],
        matches,
        forecast: LennonModel.snapshot(pred),
        originalOdds: Object.fromEntries(g.matches.map((m) => [m.id, m.odds])),
      };
      inPlayState[g.id] = {
        published: d,
        draft: { ...d, status: "draft" },
        request: { status: "ready" },
      };
      builderSec = "inplay";
      go("builder");
    });
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => render());
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      await page.screenshot({
        path: path.join(out, `inplay-${width}.png`),
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: /HOME/ }).first().click();
    assert.ok(await page.locator("#slipPlaceBtn").count());
    for (const edition of ["odds", "inplay", "recap"]) {
      await page.evaluate((edition) => {
        const stage = document.getElementById("posterStage");
        stage.style.left = "0";
        stage.style.top = "0";
        stage.style.zIndex = "9999";
        stage.style.position = "absolute";
        stage.innerHTML =
          edition === "inplay"
            ? inPlayPosterHtml(gw("gw_74"))
            : edition === "odds"
              ? posterOddsHtml(gw("gw_74"))
              : posterRecapHtml(gw("gw_67"));
        const root = stage.firstElementChild;
        for (
          let i = 1;
          i <= 3 && root.scrollHeight > root.clientHeight + 1;
          i++
        )
          root.classList.add("pst-fit" + i);
      }, edition);
      assert.equal(
        await page
          .locator("#posterStage .pst")
          .evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
        true,
        edition + " poster overflow",
      );
      await page
        .locator("#posterStage .pst")
        .screenshot({ path: path.join(out, edition + "-poster.png") });
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: desktop/mobile pages, in-play selection, three poster layouts, no JavaScript errors. Screenshots: " +
        out,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
