/* Drives the real Lennon Lounge app in headless Chrome as the house (2026-11-27).
 * Publishing and settling reuse the app's own code paths (publishGw/settleGw/openPoster), so the
 * autopilot does exactly what Dan's taps would do: same odds model, promos, free game, gate,
 * notifications and posters. Nothing here re-implements app logic.
 *
 * Login: the service account reads the house PIN and this headless browser registers itself
 * the same way the login screen does. Its membership is removed again when it closes. */
const APP_URL = process.env.APP_URL || "https://dseligman1.github.io/lennon-lounge/";

// Uses the Google Chrome already installed on GitHub's runners (and Dan's Mac), so only the small
// playwright-core package is needed; installed on first use.
function loadChromium() {
  const path = require("node:path"),
    root = path.join(__dirname, "..");
  for (const name of ["playwright-core", "playwright", "@playwright/test"]) {
    try {
      return require(require.resolve(name, { paths: [root] })).chromium;
    } catch {}
  }
  require("node:child_process").execSync(
    "npm install --no-save --no-audit --no-fund --silent playwright-core@1.56.1",
    { stdio: "inherit", cwd: root },
  );
  return require(require.resolve("playwright-core", { paths: [root] })).chromium;
}

async function openHouse({ pin, teamId = "selig", url = APP_URL, launch = {}, prepare } = {}) {
  const chromium = loadChromium();
  const browser = await chromium.launch({ headless: true, channel: "chrome", ...launch });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // settleGw() asks "Settle GW?": the autopilot's answer is yes.
  page.on("dialog", (d) => d.accept().catch(() => {}));
  if (prepare) await prepare(page);
  await page.goto(url + (url.includes("?") ? "&" : "?") + "autopilot=" + Date.now());
  await page.waitForFunction(
    () => window.firebase && firebase.auth().currentUser && typeof switchUser === "function",
    null,
    { timeout: 60000 },
  );
  await page.evaluate(
    async ({ pin, teamId }) => {
      const uid = firebase.auth().currentUser.uid;
      await db.ref(MEMBERS_ROOT + "/" + uid).set({
        team: teamId,
        pin,
        at: firebase.database.ServerValue.TIMESTAMP,
      });
      switchUser(teamId);
      _usageQueue = []; // the robot's visits are not usage
    },
    { pin, teamId },
  );
  await page.waitForFunction(
    () => typeof base !== "undefined" && base && S && S.gameweeks && S.gameweeks.length && S.teams.length,
    null,
    { timeout: 60000 },
  );
  if (prepare && prepare.afterLogin) await prepare.afterLogin(page);
  async function close() {
    try {
      await page.evaluate(async () => {
        _usageQueue = [];
        if (typeof flush === "function") await flush().catch(() => {});
        const u = firebase.auth().currentUser;
        if (u) await db.ref(MEMBERS_ROOT + "/" + u.uid).remove();
      });
    } catch {}
    await browser.close();
  }
  return { page, errors, close };
}

// Waits for the poster the app opened (openPoster) and returns it as a JPEG data URL + caption.
async function collectPoster(page, edition, gwId) {
  await page.waitForFunction(
    ({ edition, gwId }) =>
      posterState && posterState.edition === edition && posterState.gwId === gwId && !posterState.loading,
    { edition, gwId },
    { timeout: 90000 },
  );
  return page.evaluate(async () => {
    if (posterState.error) throw new Error("Poster failed: " + posterState.error);
    const image = posterState.canvas.toDataURL("image/jpeg", 0.8);
    const out = { image, caption: posterState.caption, tag: posterState.tag };
    if (typeof flush === "function") await flush(); // housePick, if set
    return out;
  });
}

// Reset the gameweek's odds to the model and publish it. Returns {gwId, name, poster}.
async function publish(page, ev, { dryRun = false } = {}) {
  const res = await page.evaluate(
    async ({ ev, dryRun }) => {
      let g = S.gameweeks.find((x) => Number(x.event) === ev && x.status !== "settled");
      if (!g && !dryRun) {
        stageAllGameweeks();
        g = S.gameweeks.find((x) => Number(x.event) === ev && x.status !== "settled");
      }
      if (!g) throw new Error(`GW${ev} is not staged in the app`);
      if (g.status === "open") return { gwId: g.id, name: g.name, already: true };
      if (g.normalOff) return { gwId: g.id, name: g.name, skipped: "in-play only" };
      const fixtures = g.matches.filter((m) => m.home && m.away).length;
      const expected = Math.floor(S.teams.length / 2);
      if (fixtures < expected)
        throw new Error(`GW${ev} has ${fixtures} of ${expected} fixtures; check FPL sync`);
      if (dryRun) {
        await buildPosterDom("odds", g.id); // proves the poster can be drawn; nothing saved
        return { gwId: g.id, name: g.name, dryRun: true };
      }
      rerecommend(g.id); // the model's recommended odds, incl. special markets
      await saveNow();
      await publishGw(g.id);
      if (g.status !== "open") throw new Error("Publish did not complete");
      return { gwId: g.id, name: g.name };
    },
    { ev, dryRun },
  );
  if (res.already || res.skipped || res.dryRun) return res;
  res.poster = await collectPoster(page, "odds", res.gwId);
  return res;
}

// Fill final scores from synced FPL results and settle. Returns {gwId, name, summary, poster}.
async function settle(page, ev, { dryRun = false } = {}) {
  const res = await page.evaluate(
    async ({ ev, dryRun }) => {
      const g = S.gameweeks.find((x) => Number(x.event) === ev && x.status === "open");
      if (!g) {
        const done = S.gameweeks.find((x) => Number(x.event) === ev && x.status === "settled");
        if (done) return { gwId: done.id, name: done.name, already: true };
        throw new Error(`GW${ev} is not open in the app`);
      }
      const ready = fplScoresReady(g.id);
      if (!ready.ready) throw new Error(`GW${ev}: only ${ready.have}/${ready.total} final scores synced`);
      if (dryRun) return { gwId: g.id, name: g.name, dryRun: true };
      fillScoresFromFpl(g.id);
      await saveNow();
      const missing = g.matches.filter(
        (m) => m.home && m.away && (!m.result || m.result.homePts == null || m.result.awayPts == null),
      );
      if (missing.length) throw new Error(`GW${ev}: ${missing.length} score(s) missing after fill`);
      settleGw(g.id);
      await flush();
      if (g.status !== "settled") throw new Error("Settle did not complete");
      const bets = S.bets.filter((b) => b.gwId === g.id);
      const count = (s) => bets.filter((b) => b.status === s).length;
      return {
        gwId: g.id,
        name: g.name,
        summary: { won: count("won"), lost: count("lost"), void: count("void"), expired: count("expired") },
      };
    },
    { ev, dryRun },
  );
  if (res.already || res.dryRun) return res;
  res.poster = await collectPoster(page, "recap", res.gwId);
  return res;
}

module.exports = { openHouse, publish, settle, collectPoster, APP_URL };
