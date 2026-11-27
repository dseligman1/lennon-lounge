/* Phone alerts (web push) for house managers. Used by notify.yml and the autopilot.
 * Moved out of notify.yml on 2026-11-27 so the autopilot can send its own alerts and run the
 * new-bet check on every tick (GitHub's 5-minute schedule actually runs every few hours).
 * Each bet alerts once: sent ids are recorded in lennon-lounge-alerts/sent. */
const { execSync } = require("node:child_process");
const path = require("node:path");

// Public half of the VAPID pair; must match VAPID_PUBLIC_KEY in index.html.
const VAPID_PUBLIC_KEY =
  "BAtAq2_Wqv2tBbwhA531XMhGZyIjK9XPO84q2B19Z7FP3PP2U1Sk7Xm0wpZCTnlxPEQGvk0WbfARBP_vtJNZNJI";
const APP_URL = "https://dseligman1.github.io/lennon-lounge/";
const ALERTS = "lennon-lounge-alerts";
const asArr = (x) =>
  Array.isArray(x) ? x.filter(Boolean) : x ? Object.values(x).filter(Boolean) : [];

let _webpush = null;
function webpush() {
  if (_webpush) return _webpush;
  const root = path.join(__dirname, "..");
  try {
    _webpush = require(require.resolve("web-push", { paths: [root] }));
  } catch {
    execSync(
      "npm install --no-save --no-audit --no-fund --silent web-push@3.6.7",
      { stdio: "inherit", cwd: root },
    );
    _webpush = require(require.resolve("web-push", { paths: [root] }));
  }
  _webpush.setVapidDetails(APP_URL, VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return _webpush;
}

// outbox: [{teamId, msg:{title, body, tag, url?}}]. Returns {sent, failed, dead:{teamId/key}}.
async function send(subs, outbox, log = console.log) {
  const result = { sent: 0, failed: 0, dead: [] };
  if (!outbox.length) return result;
  if (!process.env.VAPID_PRIVATE_KEY) {
    log("VAPID_PRIVATE_KEY missing: cannot send phone alerts.");
    result.failed = outbox.length;
    return result;
  }
  const wp = webpush();
  for (const { teamId, msg } of outbox) {
    const devices = Object.entries((subs || {})[teamId] || {});
    if (!devices.length) log(`No devices registered for ${teamId}.`);
    for (const [key, sub] of devices) {
      try {
        await wp.sendNotification(
          sub,
          JSON.stringify({ ...msg, url: msg.url || APP_URL }),
          { TTL: 6 * 3600, urgency: "high" },
        );
        result.sent++;
        log(`Sent "${msg.title}" to ${teamId}/${key}.`);
      } catch (e) {
        result.failed++;
        log(`Send to ${teamId}/${key} failed: HTTP ${e.statusCode} ${e.body || e.message}`);
        if (e.statusCode === 404 || e.statusCode === 410) result.dead.push(`${teamId}/${key}`);
      }
    }
  }
  return result;
}

// Sends a message straight to the given teams' phones (autopilot use).
async function pushTo(db, teamIds, msg, log = console.log) {
  const subs = (await db(`${ALERTS}/subs`)) || {};
  const res = await send(subs, teamIds.map((teamId) => ({ teamId, msg })), log);
  if (res.dead.length)
    await db(ALERTS, "PATCH", Object.fromEntries(res.dead.map((k) => [`subs/${k}`, null])));
  return res;
}

// The notify.yml job: new pending bets + queued messages (+ optional test).
async function run(db, { testTeam = "", log = console.log } = {}) {
  const alerts = (await db(ALERTS)) || {};
  const subs = alerts.subs || {};
  const sentBets = (alerts.sent && alerts.sent.bets) || {};
  const queue = alerts.queue || {};
  const outbox = [];
  const sentUpdate = {};
  if (testTeam) {
    outbox.push({
      teamId: testTeam,
      msg: { title: "🔔 Lennon Lounge test", body: "Phone alerts are working.", tag: "test" },
    });
  } else {
    const [bets, teams] = await Promise.all([
      db("lennon-lounge/bets"),
      db("lennon-lounge/teams"),
    ]);
    const teamName = (id) => (asArr(teams).find((t) => t.id === id) || {}).name || id;
    const unseen = asArr(bets).filter((b) => b.id && !sentBets[b.id]);
    if (!alerts.sent || !alerts.sent.since) {
      unseen.forEach((b) => (sentUpdate[`sent/bets/${b.id}`] = Date.now()));
      sentUpdate["sent/since"] = Date.now();
      log(`First run: marked ${unseen.length} existing bet(s) as seen.`);
    } else {
      // Only bets still waiting for the house; one already accepted/rejected needs no review.
      const fresh = unseen.filter((b) => b.status === "pending");
      for (const teamId of Object.keys(subs)) {
        const forMe = fresh.filter((b) => b.teamId !== teamId);
        if (forMe.length === 1) {
          const b = forMe[0];
          outbox.push({
            teamId,
            msg: {
              title: `🎰 New bet — ${teamName(b.teamId)}`,
              body: `${asArr(b.legs).length} leg(s) @ ${Number(b.effOdds).toFixed(2)} · £${b.stake}. Tap to review.`,
              tag: "bet-" + b.id,
            },
          });
        } else if (forMe.length > 1) {
          const names = [...new Set(forMe.map((b) => teamName(b.teamId)))].join(", ");
          outbox.push({
            teamId,
            msg: { title: `🎰 ${forMe.length} new bets`, body: `From ${names}. Tap to review.`, tag: "bets" },
          });
        }
      }
      unseen.forEach((b) => (sentUpdate[`sent/bets/${b.id}`] = Date.now()));
    }
    for (const [key, q] of Object.entries(queue)) {
      const targets = Array.isArray(q.teams) && q.teams.length ? q.teams : Object.keys(subs);
      for (const teamId of targets)
        outbox.push({ teamId, msg: { title: q.title, body: q.body, tag: "q-" + key, url: q.url } });
      sentUpdate[`queue/${key}`] = null;
    }
  }
  // Record before sending so an overlapping run can't double-alert the same bet.
  if (Object.keys(sentUpdate).length) await db(ALERTS, "PATCH", sentUpdate);
  if (!outbox.length) {
    log("Nothing new to send.");
    return { sent: 0 };
  }
  const res = await send(subs, outbox, log);
  if (res.dead.length)
    await db(ALERTS, "PATCH", Object.fromEntries(res.dead.map((k) => [`subs/${k}`, null])));
  return res;
}

module.exports = { run, send, pushTo, APP_URL };

if (require.main === module) {
  const { accessToken, database } = require("./in-play.cjs");
  (async () => {
    const token = await accessToken(JSON.parse(process.env.FIREBASE_SERVICE_KEY));
    await run(database(process.env.FIREBASE_DB_URL, token), {
      testTeam: (process.env.TEST_TEAM || "").trim(),
    });
  })().catch((e) => {
    console.error("Phone alerts failed:", e.message || e);
    process.exit(1);
  });
}
