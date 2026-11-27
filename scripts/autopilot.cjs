/* Lennon Lounge autopilot runner (2026-11-27, PROGRESS.md ROUND 22).
 *
 * Runs in GitHub Actions (autopilot.yml). Each tick: read FPL fixtures + the app's data, decide
 * (autopilot-core.cjs), act. While a gameweek is in play or a release is near it stays running and
 * checks every 5-15 minutes, then restarts itself before GitHub's 6-hour job limit. This replaces
 * GitHub's own schedule for anything time-sensitive: that ran hourly jobs every 3-7 hours in
 * Nov 2026. Outside those windows it exits and the hourly schedule wakes it again.
 *
 * Modes (env): AUTOPILOT_MODE=watch (default) | once | status. AUTOPILOT_DRY_RUN=true makes no
 * writes and sends nothing (the browser checks it can log in and draw a poster).
 *
 * Storage: lennon-lounge-autopilot/{config,state,status,outbox,log}. Admin-readable; the app's
 * Back Office → 🤖 Autopilot card shows status, the pause switch and the WhatsApp outbox. */
const { execFileSync, execSync } = require("node:child_process");
const path = require("node:path");
const Core = require("./autopilot-core.cjs");
const Notify = require("./notify.cjs");
const { accessToken, database } = require("./in-play.cjs");
const { get } = require("./fpl-data.cjs");

const ROOT = "lennon-lounge-autopilot";
const APP_URL = "https://dseligman1.github.io/lennon-lounge/";
const MIN = 60000,
  H = 60 * MIN;
const DRY = process.env.AUTOPILOT_DRY_RUN === "true";
const MODE = process.env.AUTOPILOT_MODE || "watch";
// Restart before GitHub's 6h job limit (timeout-minutes in autopilot.yml is 350).
const RUN_BUDGET_MS = Number(process.env.AUTOPILOT_BUDGET_MIN || 320) * MIN;
const started = Date.now();
const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
const log = (...a) => console.log(stamp(), ...a);

let db;
async function connect() {
  const token = await accessToken(JSON.parse(process.env.FIREBASE_SERVICE_KEY));
  db = database(process.env.FIREBASE_DB_URL, token);
  db.tokenAt = Date.now();
}
async function fresh() {
  if (!db || Date.now() - db.tokenAt > 45 * MIN) await connect();
  return db;
}
const write = async (path, method, value) => {
  if (DRY) {
    log(`[dry run] would ${method} ${path}`);
    return null;
  }
  return (await fresh())(path, method, value);
};

async function journal(text) {
  log(text);
  if (DRY) return;
  await write(`${ROOT}/log/${Date.now()}`, "PUT", { at: Date.now(), text });
}

async function pushHouse(cfg, msg) {
  if (DRY) return log(`[dry run] would push: ${msg.title}: ${msg.body}`);
  try {
    const r = await Notify.pushTo(await fresh(), cfg.shareTeams, msg, log);
    if (!r.sent) log("No phone received the alert (no registered devices?).");
  } catch (e) {
    log("Push failed:", e.message);
  }
}

// A WhatsApp-ready item: Dan taps the push, the app opens it with one Share button.
async function queueShare(cfg, item, pushTitle, pushBody) {
  const id = `${item.kind}-gw${item.ev}-${Date.now()}`;
  const { image, ...meta } = item;
  // Images are stored apart from the outbox list so the Back Office card loads quickly.
  if (image) await write(`${ROOT}/images/${id}`, "PUT", image);
  await write(`${ROOT}/outbox/${id}`, "PUT", { ...meta, id, hasImage: !!image, createdAt: Date.now(), sentAt: null });
  await pushHouse(cfg, {
    title: pushTitle,
    body: pushBody,
    tag: "share-" + id,
    url: `${APP_URL}?share=${encodeURIComponent(id)}`,
  });
  return id;
}

let _pin = null;
async function housePin(cfg) {
  if (_pin) return _pin;
  const team = cfg.houseTeam || "selig";
  _pin = await (await fresh())(`lennon-lounge-auth/${team}`);
  if (!_pin) throw Error(`No PIN found for ${team}`);
  return _pin;
}

async function withHouse(cfg, fn) {
  const House = require("./house-browser.cjs");
  const h = await House.openHouse({ pin: await housePin(cfg), teamId: cfg.houseTeam || "selig" });
  try {
    return await fn(h.page, House);
  } finally {
    if (h.errors.length) log("Page errors:", h.errors.slice(0, 5).join(" | "));
    await h.close();
  }
}

function runScript(file, env) {
  execFileSync(process.execPath, [path.join(__dirname, file)], {
    stdio: "inherit",
    env: { ...process.env, ...env },
    timeout: 10 * MIN,
  });
}

/* ---------------- actions ---------------- */
async function setRec(ev, patch) {
  await write(`${ROOT}/state/gws/${ev}`, "PATCH", patch);
}

async function act(a, ctx) {
  const { cfg, rec, state } = ctx;
  const r = rec(a.ev);
  switch (a.type) {
    case "note-released":
      await setRec(a.ev, { released: { at: Date.now(), gwId: a.gwId, by: a.by } });
      return journal(`GW${a.ev}: already ${a.by === "manual" ? "published by hand" : "set to in-play only"}; no release needed.`);

    case "release": {
      if (!DRY) {
        try {
          runScript("sync-fpl.cjs", { TRIGGER_EVENT: "workflow_dispatch" });
        } catch (e) {
          log("FPL sync before release failed (continuing with last synced data):", e.message);
        }
      }
      try {
        const out = await withHouse(cfg, (page, House) => House.publish(page, a.ev, { dryRun: DRY }));
        if (out.dryRun) return journal(`[dry run] GW${a.ev} would be published now (${out.name}); poster drew OK.`);
        if (out.already) {
          await setRec(a.ev, { released: { at: Date.now(), gwId: out.gwId, by: "manual" } });
          return journal(`GW${a.ev}: already published; nothing to do.`);
        }
        if (out.skipped) {
          await setRec(a.ev, { releaseSkipped: out.skipped });
          return journal(`GW${a.ev}: skipped (${out.skipped}).`);
        }
        const check = await (await fresh())(`lennon-lounge-publication/${out.gwId}`);
        if (!check || check.status !== "published") throw Error("publication gate not set after publish");
        const id = await queueShare(
          cfg,
          { kind: "odds", ev: a.ev, gwId: out.gwId, title: `${out.name} odds poster`, caption: out.poster.caption, image: out.poster.image },
          `📣 ${out.name} odds are LIVE`,
          "Published at the recommended odds. Tap to send the poster to the WhatsApp group.",
        );
        await setRec(a.ev, { released: { at: Date.now(), gwId: out.gwId, by: "autopilot", outboxId: id } });
        return journal(`GW${a.ev}: published at the model's odds; poster queued for WhatsApp (${id}).`);
      } catch (e) {
        await setRec(a.ev, { releaseFailures: (r.releaseFailures || 0) + 1, lastError: e.message });
        await pushHouse(cfg, { title: `⚠️ GW${a.ev} auto-publish failed`, body: `${e.message}. I'll retry; or publish it in Odds Setter.`, tag: "ap-err" });
        return journal(`GW${a.ev}: publish failed: ${e.message}`);
      }
    }

    case "release-missed":
      await setRec(a.ev, { missedWarned: Date.now() });
      await pushHouse(cfg, {
        title: `⚠️ GW${a.ev} odds weren't released`,
        body: `First kickoff is ${new Date(a.kickoff).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit" })}. Publish by hand in Odds Setter if you still want a market.`,
        tag: "ap-missed",
      });
      return journal(`GW${a.ev}: release window missed; Dan alerted.`);

    case "release-gave-up":
      await setRec(a.ev, { releaseGaveUp: Date.now() });
      await pushHouse(cfg, { title: `⚠️ GW${a.ev}: autopilot gave up publishing`, body: "Three attempts failed. Please publish in Odds Setter.", tag: "ap-err" });
      return journal(`GW${a.ev}: gave up publishing after 3 attempts.`);

    case "trend": {
      const snap = await (await fresh())(`lennon-lounge-matchday/${a.ev}/current`);
      const g = state.gameweeks.find((x) => x.id === a.gwId);
      const text = Core.trendText({
        g,
        bets: state.bets,
        teams: state.teams,
        snap,
        update: a,
        link: `${APP_URL}?from=gw${a.ev}-up${a.index + 1}-wa`,
      });
      const entry = { at: Date.now(), finished: a.finished, index: a.index };
      if (!text) {
        await write(`${ROOT}/state/gws/${a.ev}/updates/${a.index}`, "PUT", { ...entry, skipped: "no live bets" });
        return journal(`GW${a.ev}: update ${a.index + 1} skipped (no live bets) at ${a.finished}/${a.total} games.`);
      }
      const id = await queueShare(
        cfg,
        { kind: "trend", ev: a.ev, gwId: a.gwId, title: `${g.name} bet tracker ${a.index + 1}`, caption: text },
        `📈 ${g.name} bet update ${a.index + 1} ready`,
        `${a.finished}/${a.total} games done. Tap to send it to the WhatsApp group.`,
      );
      await write(`${ROOT}/state/gws/${a.ev}/updates/${a.index}`, "PUT", { ...entry, outboxId: id });
      return journal(`GW${a.ev}: bet update ${a.index + 1} queued at ${a.finished}/${a.total} games (${id}).`);
    }

    case "sync-fpl":
      await write(`${ROOT}/state/lastSyncAt`, "PUT", Date.now());
      if (DRY) return log("[dry run] would run FPL sync");
      try {
        runScript("sync-fpl.cjs", { TRIGGER_EVENT: "workflow_dispatch" });
      } catch (e) {
        log("FPL sync failed:", e.message);
      }
      return;

    case "warn-pending":
      await setRec(a.ev, { pendingWarnedAt: Date.now() });
      await pushHouse(cfg, {
        title: `⏳ GW${a.ev} ready to settle: ${a.count} bet(s) unreviewed`,
        body: `Review them in Bet Review. Settling automatically in ${cfg.settleGraceHours}h; anything still unreviewed then expires.`,
        tag: "ap-pending",
      });
      return journal(`GW${a.ev}: final scores in, ${a.count} bet(s) still awaiting review; settling in ${cfg.settleGraceHours}h.`);

    case "settle": {
      try {
        const out = await withHouse(cfg, (page, House) => House.settle(page, a.ev, { dryRun: DRY }));
        if (out.dryRun) return journal(`[dry run] GW${a.ev} would be settled now (${out.name}).`);
        if (out.already) {
          await setRec(a.ev, { settled: { at: Date.now(), by: "manual" } });
          return journal(`GW${a.ev}: already settled by hand.`);
        }
        await new Promise((res) => setTimeout(res, 3000));
        const gws = await (await fresh())("lennon-lounge/gameweeks");
        const g = Object.values(gws || {}).find((x) => x && x.id === out.gwId);
        if (!g || g.status !== "settled") throw Error("gameweek not settled in the database after settling");
        const s = out.summary;
        const id = await queueShare(
          cfg,
          { kind: "recap", ev: a.ev, gwId: out.gwId, title: `${out.name} recap poster`, caption: out.poster.caption, image: out.poster.image },
          `⚖️ ${out.name} settled`,
          `${s.won} won, ${s.lost} lost${s.void ? `, ${s.void} void` : ""}${s.expired ? `, ${s.expired} expired` : ""}. Tap to send the recap to the WhatsApp group.`,
        );
        await setRec(a.ev, { settled: { at: Date.now(), by: "autopilot", outboxId: id, ...s } });
        return journal(`GW${a.ev}: settled (${s.won} won, ${s.lost} lost, ${s.void} void, ${s.expired} expired); recap queued (${id}).`);
      } catch (e) {
        await setRec(a.ev, { settleFailures: (r.settleFailures || 0) + 1, lastError: e.message });
        await pushHouse(cfg, { title: `⚠️ GW${a.ev} auto-settle failed`, body: `${e.message}. I'll retry; or settle it in Bet Settler.`, tag: "ap-err" });
        return journal(`GW${a.ev}: settle failed: ${e.message}`);
      }
    }

    case "settle-gave-up":
      await setRec(a.ev, { settleGaveUp: Date.now() });
      await pushHouse(cfg, { title: `⚠️ GW${a.ev}: autopilot gave up settling`, body: "Three attempts failed. Please settle in Bet Settler.", tag: "ap-err" });
      return journal(`GW${a.ev}: gave up settling after 3 attempts.`);
  }
}

/* ---------------- tick ---------------- */
async function tick() {
  const d = await fresh();
  const [savedCfg, ap, state, fixtures] = await Promise.all([
    d(`${ROOT}/config`),
    d(`${ROOT}/state`),
    d("lennon-lounge"),
    get("https://fantasy.premierleague.com/api/fixtures/"),
  ]);
  const cfg = Core.config(savedCfg);
  const now = Date.now();
  const fixturesByEvent = {};
  for (const f of fixtures || []) if (f.event) (fixturesByEvent[f.event] ||= []).push(f);
  const arr = (x) => (Array.isArray(x) ? x.filter(Boolean) : Object.values(x || {}).filter(Boolean));
  const st = { gameweeks: arr(state?.gameweeks), bets: arr(state?.bets), history: arr(state?.history), teams: arr(state?.teams) };
  const apState = ap || {};
  const plan = Core.decide({ now, config: cfg, fixturesByEvent, state: st, ap: apState });
  const rec = (ev) => (apState.gws || {})[ev] || {};

  // Keep Matchday Live (and the trend numbers) fresh while games are on.
  const liveEv = st.gameweeks.find((g) => g.status === "open" && Core.fixtureSummary(fixturesByEvent[g.event]).live > 0);
  const anyAction = plan.actions.some((a) => a.type === "trend");
  if (cfg.enabled && (liveEv || anyAction)) {
    try {
      const { run } = require("./engagement.cjs");
      await run(await fresh(), get, Date.now, DRY);
    } catch (e) {
      log("Matchday refresh failed:", e.message);
    }
  }
  // Safety net for new-bet alerts (the app normally triggers notify.yml within a minute).
  if (cfg.enabled && !DRY) {
    try {
      await Notify.run(await fresh(), { log: () => {} });
    } catch (e) {
      log("Bet alert check failed:", e.message);
    }
  }

  for (const a of plan.actions) {
    try {
      await act(a, { cfg, rec, state: st });
    } catch (e) {
      log(`Action ${a.type} GW${a.ev} crashed:`, e.stack || e.message);
    }
  }
  const status = {
    checkedAt: now,
    enabled: cfg.enabled,
    active: plan.active,
    nextCheckAt: plan.nextCheckAt,
    notes: plan.notes,
    actions: plan.actions.map((a) => `${a.type} GW${a.ev}`),
    runStartedAt: started,
    runUrl: process.env.RUN_URL || null,
  };
  if (!DRY) await d(`${ROOT}/status`, "PUT", status);
  log(`Tick: ${status.actions.join(", ") || "nothing due"}${plan.notes.length ? " · " + plan.notes.join(" · ") : ""} · next ${new Date(plan.nextCheckAt).toISOString()}`);
  return plan;
}

function chain() {
  if (DRY || !process.env.GITHUB_REPOSITORY) return log("Not chaining (dry run or local).");
  try {
    execSync(`gh workflow run autopilot.yml --repo ${process.env.GITHUB_REPOSITORY} --ref main -f mode=watch`, { stdio: "inherit" });
    log("Started the next autopilot run.");
  } catch (e) {
    log("Could not start the next run (the hourly schedule will pick up):", e.message);
  }
}

async function main() {
  await connect();
  if (MODE === "status") {
    const [cfg, ap, status, alerts] = await Promise.all([
      db(`${ROOT}/config`),
      db(`${ROOT}/state`),
      db(`${ROOT}/status`),
      db("lennon-lounge-alerts"),
    ]);
    const subs = alerts?.subs || {};
    console.log(JSON.stringify({ config: Core.config(cfg), state: ap, status, phones: Object.fromEntries(Object.entries(subs).map(([t, d]) => [t, Object.keys(d || {}).length])), alertTokenSaved: !!alerts?.config?.dispatchToken, queue: Object.keys(alerts?.queue || {}).length }, null, 2));
    const state = await db("lennon-lounge");
    const gws = Object.values(state?.gameweeks || {}).filter(Boolean);
    console.log(gws.filter((g) => g.status !== "draft" || g.event <= 14).map((g) => `${g.name} ev${g.event} ${g.status}${g.normalOff ? " normalOff" : ""}`).join("\n"));
    const bets = Object.values(state?.bets || {}).filter(Boolean);
    console.log(bets.filter((b) => !["settled", "won", "lost", "void", "expired", "cancelled", "rejected"].includes(b.status)).map((b) => `${b.teamId} ${b.gwId} ${b.status} £${b.stake} @${b.effOdds}`).join("\n"));
    return;
  }
  if (MODE === "test-share") {
    // Sends Dan a sample bet tracker (latest settled gameweek) to try the one-tap share flow.
    const cfg = Core.config(await db(`${ROOT}/config`));
    const state = await db("lennon-lounge");
    const arr = (x) => Object.values(x || {}).filter(Boolean);
    const g = arr(state.gameweeks).filter((x) => x.status === "settled" && arr(state.bets).some((b) => b.gwId === x.id && ["won", "lost"].includes(b.status))).sort((a, b) => b.event - a.event)[0];
    if (!g) return log("No settled gameweek with bets to sample.");
    const snap = await db(`lennon-lounge-matchday/${g.event}/current`);
    const bets = arr(state.bets).filter((b) => b.gwId === g.id && ["won", "lost"].includes(b.status)).map((b) => ({ ...b, status: "accepted" }));
    const text = Core.trendText({ g, bets, teams: arr(state.teams), snap, update: { index: 0, finished: 5, total: 10 }, link: `${APP_URL}?from=test-wa` });
    const id = await queueShare(cfg, { kind: "trend", ev: g.event, gwId: g.id, title: `TEST · ${g.name} bet tracker sample`, caption: "🧪 TEST (don't send to the group)\n" + text }, "🧪 Test: bet update ready", "Tap to try the one-tap WhatsApp share. It's a sample, so send it to yourself, not the group.");
    return log(`Test item queued and pushed: ${id}`);
  }
  if (MODE === "check") {
    // Read-only proof that the house browser works here: log in, draw the next draft
    // gameweek's odds poster without saving anything, log out.
    const cfg = Core.config(await db(`${ROOT}/config`));
    const gws = Object.values((await db("lennon-lounge/gameweeks")) || {}).filter(Boolean);
    const next = gws.filter((g) => g.status === "draft" && g.event).sort((a, b) => a.event - b.event)[0];
    if (!next) return log("No draft gameweek to check against.");
    const out = await withHouse(cfg, (page, House) => House.publish(page, Number(next.event), { dryRun: true }));
    return log(`Check passed: logged in as the house and drew the ${out.name} odds poster (nothing saved).`);
  }
  for (;;) {
    let plan;
    try {
      plan = await tick();
    } catch (e) {
      log("Tick failed:", e.stack || e.message);
      plan = { active: true, nextCheckAt: Date.now() + 5 * MIN };
    }
    if (MODE === "once") return;
    if (!plan.active) return log("Nothing due in the next 30h; exiting until the hourly schedule wakes me.");
    const wait = Math.max(MIN, plan.nextCheckAt - Date.now());
    if (Date.now() - started + wait > RUN_BUDGET_MS) {
      chain();
      return;
    }
    await new Promise((res) => setTimeout(res, wait));
  }
}

module.exports = { act, tick };
if (require.main === module)
  main().catch((e) => {
    console.error("Autopilot failed:", e.stack || e.message);
    process.exit(1);
  });
