/* Autopilot UI (2026-11-27, PROGRESS.md ROUND 22). Two things:
 * (i)  One-tap WhatsApp share: the autopilot's push opens ?share=<outbox id>; this shows the
 *      poster/update with one Share button (image + caption via the phone's share sheet, or the
 *      text straight into WhatsApp) and a "Mark sent" button.
 * (ii) Back Office → 🤖 Autopilot: on/off switch, what it did last, what's next, outbox.
 * Data lives at lennon-lounge-autopilot (admin-only in database.rules.json); the worker is
 * scripts/autopilot.cjs in GitHub Actions. */
const AUTOPILOT_ROOT = "lennon-lounge-autopilot";
let apShare = null; // {id, item, loading, error}
let apInfo = null; // {status, config, outbox, log, gws}
let apLoadedAt = 0; // last background load (for the menu badge)

(function captureShareParam() {
  try {
    const p = new URLSearchParams(location.search);
    const id = (p.get("share") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
    if (!id) return;
    sessionStorage.setItem("ap_share", id);
    p.delete("share");
    const q = p.toString();
    history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
  } catch (e) {}
})();

// Called from render(): opens a pending share once an admin is logged in and data has loaded.
function apMaybeOpenShare() {
  let id = null;
  try {
    id = sessionStorage.getItem("ap_share");
  } catch (e) {}
  if (me && me.admin && S && base && activeTab !== "tower" && Date.now() - apLoadedAt > 5 * 60000) {
    apLoadedAt = Date.now();
    apLoadInfo();
  }
  if (!id || !me || !me.admin || !S || !base || apShare) return;
  try {
    sessionStorage.removeItem("ap_share");
  } catch (e) {}
  apOpenShare(id);
}

// The service worker hands over a tapped notification's link when the app is already open.
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    const url = e.data && e.data.openUrl;
    if (!url) return;
    try {
      const id = new URL(url, location.href).searchParams.get("share");
      if (id) {
        sessionStorage.setItem("ap_share", id);
        apShare = null;
        apMaybeOpenShare();
      }
    } catch (err) {}
  });
}

async function apOpenShare(id) {
  apShare = { id, loading: true };
  apRenderShare();
  try {
    const snap = await db.ref(AUTOPILOT_ROOT + "/outbox/" + id).once("value");
    const item = snap.val();
    if (!item) throw new Error("That item is no longer in the outbox.");
    let blob = null;
    if (item.hasImage) {
      const img = (await db.ref(AUTOPILOT_ROOT + "/images/" + id).once("value")).val();
      if (!img) throw new Error("The image is missing.");
      blob = await (await fetch(img)).blob();
    }
    Object.assign(apShare, { item, blob, url: blob ? URL.createObjectURL(blob) : null, loading: false });
  } catch (e) {
    Object.assign(apShare, { loading: false, error: e.message || String(e) });
  }
  apRenderShare();
}

function apCloseShare() {
  if (apShare && apShare.url) URL.revokeObjectURL(apShare.url);
  apShare = null;
  document.getElementById("posterModal").classList.remove("open");
  document.getElementById("posterModalOverlay").classList.remove("open");
}

function apRenderShare() {
  const panel = document.getElementById("posterModal"),
    overlay = document.getElementById("posterModalOverlay");
  if (!apShare) return apCloseShare();
  const s = apShare,
    it = s.item || {};
  const canShareFile =
    s.blob &&
    navigator.canShare &&
    navigator.canShare({ files: [new File([s.blob], "p.jpg", { type: "image/jpeg" })] });
  const wa = it.caption ? "https://wa.me/?text=" + encodeURIComponent(it.caption) : "";
  let body;
  if (s.loading) body = `<div class="poster-wait">Loading…</div>`;
  else if (s.error) body = `<div class="card"><p><b>Couldn't open it.</b> ${esc(s.error)}</p></div>`;
  else
    body = `
      ${it.sentAt ? `<p class="small" style="color:var(--teal)">✅ Marked sent ${esc(fmtDT(it.sentAt))}</p>` : ""}
      ${s.url ? `<img class="poster-preview" src="${s.url}" alt="${esc(it.title || "")}">` : ""}
      <div class="actions" style="margin-top:12px">
        ${
          s.blob
            ? canShareFile
              ? `<button class="btn" onclick="apShareNow()">📲 Share to WhatsApp</button>`
              : `<button class="btn" onclick="apDownload()">⬇ Save image</button>`
            : `<a class="btn" href="${wa}" target="_blank" rel="noopener" onclick="apMarkSent()">💬 Send in WhatsApp</a>
               <button class="btn secondary" onclick="apShareNow()">📲 Share…</button>`
        }
        <button class="btn secondary" onclick="apCopy()">📋 Copy ${s.blob ? "caption" : "text"}</button>
        ${it.sentAt ? "" : `<button class="btn ghost" onclick="apMarkSent(true)">✅ Mark sent</button>`}
      </div>
      <p class="muted small" style="margin-top:8px">${
        s.blob
          ? "Share opens your phone's share sheet: pick WhatsApp, then the group. The caption is copied too, so paste it if WhatsApp drops it."
          : "Opens WhatsApp with the message typed in: pick the group and send."
      }</p>
      <label style="margin-top:12px;display:block">${s.blob ? "Caption" : "Message"}</label>
      <textarea id="apCaption" readonly rows="${s.blob ? 6 : 14}" style="width:100%">${esc(it.caption || "")}</textarea>`;
  panel.innerHTML = `<div class="betmodal-head">
      <div><h3 style="margin:0">🤖 ${esc(it.title || "Ready to send")}</h3>
        <div class="muted small">Made by the autopilot for the WhatsApp group.</div></div>
      <button class="betmodal-close" onclick="apCloseShare()">✕</button></div>${body}`;
  panel.classList.add("open");
  overlay.classList.add("open");
}

function apCopy() {
  if (!apShare || !apShare.item) return;
  const done = () => toast("Copied 📋");
  try {
    navigator.clipboard.writeText(apShare.item.caption || "").then(done, () => {
      const ta = document.getElementById("apCaption");
      if (ta) {
        ta.focus();
        ta.select();
      }
      toast("Selected. Copy it from the box.");
    });
  } catch (e) {}
}

function apShareNow() {
  if (!apShare || !apShare.item) return;
  const it = apShare.item;
  try {
    navigator.clipboard.writeText(it.caption || "").catch(() => {});
  } catch (e) {}
  const data = apShare.blob
    ? { files: [new File([apShare.blob], (it.id || "lennon-lounge") + ".jpg", { type: "image/jpeg" })], text: it.caption }
    : { text: it.caption };
  if (!navigator.share) return toast("Sharing isn't available here. Use Copy instead.", true);
  navigator
    .share(data)
    .then(() => apMarkSent())
    .catch((e) => {
      if (e && e.name !== "AbortError") toast("Share failed. Use Copy instead.", true);
    });
}

function apDownload() {
  if (!apShare || !apShare.blob) return;
  posterDownload(apShare.blob, (apShare.item.id || "lennon-lounge") + ".jpg");
  apMarkSent();
}

async function apMarkSent(explicit) {
  if (!apShare || !apShare.item || apShare.item.sentAt) return;
  const at = Date.now();
  try {
    await db.ref(AUTOPILOT_ROOT + "/outbox/" + apShare.id + "/sentAt").set(at);
    apShare.item.sentAt = at;
    if (apInfo && apInfo.outbox && apInfo.outbox[apShare.id]) apInfo.outbox[apShare.id].sentAt = at;
    if (explicit) apRenderShare();
  } catch (e) {
    if (explicit) toast("Couldn't mark it sent: " + e.message, true);
  }
}

/* ---------------- Back Office card ---------------- */
async function apLoadInfo() {
  try {
    const [status, config, log, gws] = await Promise.all([
      db.ref(AUTOPILOT_ROOT + "/status").once("value"),
      db.ref(AUTOPILOT_ROOT + "/config").once("value"),
      db.ref(AUTOPILOT_ROOT + "/log").limitToLast(12).once("value"),
      db.ref(AUTOPILOT_ROOT + "/state/gws").limitToLast(6).once("value"),
    ]);
    // Images live separately under /images, so the whole list is small (~5 short items a week).
    const out = await db.ref(AUTOPILOT_ROOT + "/outbox").once("value");
    const outbox = {};
    Object.entries(out.val() || {}).forEach(([k, v]) => {
      if (v) outbox[k] = { ...v, id: k };
    });
    apInfo = { status: status.val(), config: config.val() || {}, log: log.val() || {}, gws: gws.val() || {}, outbox };
  } catch (e) {
    apInfo = { error: e.message };
  }
  const el = document.getElementById("apCardBody");
  if (el) el.innerHTML = apCardBody();
  if (typeof ctRedraw === "function") ctRedraw();
  const n = ctNeedsCount();
  if (n !== apLastNeeds) {
    apLastNeeds = n;
    if (typeof renderTopNav === "function") renderTopNav();
    if (typeof renderNavDrawer === "function") renderNavDrawer();
  }
}
let apLastNeeds = 0;

// Settings, outbox and history, folded under the control tower (which loads the data).
function autopilotCard() {
  return `<div class="card"><details id="autopilotSettings"><summary style="cursor:pointer;font-weight:800">🤖 Autopilot settings, WhatsApp outbox &amp; history</summary><div id="apCardBody" style="margin-top:10px">${apCardBody()}</div></details></div>`;
}

function apCardBody() {
  const intro = `<p class="muted small">Runs the week for you: publishes the recommended odds ~24h before the first kickoff, sends 2–3 bet-tracker updates as games finish, settles once FPL has final scores, and makes the posters. Each WhatsApp item arrives as a push on your phone: tap it, then Share.</p>`;
  if (!apInfo) return intro + `<p class="muted small">Loading…</p>`;
  if (apInfo.error) return intro + `<p class="muted small">Couldn't load: ${esc(apInfo.error)}</p>`;
  const cfg = apInfo.config || {},
    st = apInfo.status || {};
  const on = cfg.enabled !== false;
  const stale = st.checkedAt && Date.now() - st.checkedAt > 8 * 3600000;
  const statusLine = st.checkedAt
    ? `Last check ${esc(fmtDT(st.checkedAt))}${st.active && st.nextCheckAt ? ` · next ~${esc(fmtDT(st.nextCheckAt))}` : " · resting until the next gameweek is near"}${stale ? ' <span class="neg">(a while ago)</span>' : ""}`
    : "Hasn't run yet.";
  const notes = (st.notes || []).map((n) => `<div class="muted small">• ${esc(n)}</div>`).join("");
  const outbox = Object.values(apInfo.outbox || {}).sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);
  const outRows = outbox.length
    ? outbox
        .map(
          (o) => `<tr><td>${o.kind === "trend" ? "📈" : o.kind === "recap" ? "📰" : "📣"} ${esc(o.title || o.id)}</td>
          <td class="small muted">${esc(fmtDT(o.createdAt))}</td>
          <td>${o.sentAt ? '<span class="pill st-accepted">Sent</span>' : '<span class="pill st-pending">To send</span>'}</td>
          <td><button class="btn small" onclick="apOpenShare('${esc(o.id)}')">Open</button></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted small">Nothing yet.</td></tr>`;
  const logRows = Object.values(apInfo.log || {})
    .sort((a, b) => b.at - a.at)
    .map((l) => `<div class="small"><span class="muted">${esc(fmtDT(l.at))}</span> ${esc(l.text)}</div>`)
    .join("");
  return `${intro}
    <div class="formrow" style="align-items:center">
      <div><b>${on ? "✅ On" : "⏸ Paused"}</b></div>
      <button class="btn ${on ? "ghost" : ""} small" onclick="apSetConfig({enabled:${on ? "false" : "true"}})">${on ? "Pause autopilot" : "Turn autopilot on"}</button>
      <div><label>Release odds (hours before first kickoff)</label>
        <input type="number" min="3" max="96" step="1" value="${Number(cfg.releaseHoursBefore || 24)}" style="width:90px" onchange="apSetConfig({releaseHoursBefore:Math.max(3,Math.min(96,Number(this.value)||24))})"></div>
      <div><label>Wait for unreviewed bets before settling (hours)</label>
        <input type="number" min="0" max="72" step="1" value="${Number(cfg.settleGraceHours == null ? 12 : cfg.settleGraceHours)}" style="width:90px" onchange="apSetConfig({settleGraceHours:Math.max(0,Math.min(72,Number(this.value)))})"></div>
    </div>
    <p class="small">${statusLine}</p>${notes}
    ${st.runUrl ? `<p class="muted small"><a href="${esc(st.runUrl)}" target="_blank" rel="noopener">Latest run log ↗</a></p>` : ""}
    <h4 style="margin:14px 0 6px">WhatsApp outbox</h4>
    <div style="overflow-x:auto"><table><tr><th>Item</th><th>Made</th><th>Status</th><th></th></tr>${outRows}</table></div>
    <details style="margin-top:10px"><summary class="small">What it did recently</summary>${logRows || '<p class="muted small">Nothing yet.</p>'}</details>`;
}

async function apSetConfig(patch) {
  if (!requireAdmin()) return;
  try {
    await db.ref(AUTOPILOT_ROOT + "/config").update({ ...patch, updatedAt: Date.now(), updatedBy: me.id });
    if (apInfo) apInfo.config = { ...(apInfo.config || {}), ...patch };
    const el = document.getElementById("apCardBody");
    if (el) el.innerHTML = apCardBody();
    toast("Autopilot updated");
  } catch (e) {
    toast("Couldn't save: " + e.message, true);
  }
}

/* ---------------- 🗼 Control tower (2026-11-27) ----------------
 * One place for the house to run a gameweek: a delivery-style tracker from "odds released" to
 * "recap sent", showing what the autopilot has done, what it will do next (with times) and the
 * few steps that need Dan, each with its button right there. Reads the app's own data (S) plus
 * lennon-lounge-autopilot/{status.timeline, state/gws, outbox}. */
let ctPick = null; // gameweek id the admin chose in the tower's chips
const CT_OPEN_BET = ["pending", "counter_house", "counter_user"];
const CT_WINDOWS = [
  { min: 3, max: 5 },
  { min: 5, max: 7 },
  { min: 8, max: 99 },
];

function ctCss() {
  if (document.getElementById("ctCss")) return "";
  const s = document.createElement("style");
  s.id = "ctCss";
  s.textContent = `
  .ct-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 14px}
  .ct-head h3{margin:0}
  .ct-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}
  .ct-chip{border:1px solid var(--line);background:var(--card2);color:var(--text);border-radius:999px;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
  .ct-chip.on{border-color:var(--teal);color:var(--teal);background:rgba(0,255,135,.10)}
  .ct-chip .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold);margin-left:6px;vertical-align:middle}
  .ct-sum{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin:12px 0 6px}
  .ct-phase{font-family:'Archivo Black',sans-serif;font-size:19px;line-height:1.15}
  .ct-bar{flex:1 1 160px;height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;min-width:120px}
  .ct-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--teal),var(--cyan));border-radius:99px}
  .ct-needs{font-size:12.5px;font-weight:800;color:var(--bg0);background:var(--gold);border-radius:999px;padding:4px 11px}
  .ct-allgood{font-size:12.5px;font-weight:800;color:var(--teal)}
  .ct-list{list-style:none;margin:14px 0 0;padding:0}
  .ct-step{position:relative;display:grid;grid-template-columns:30px 1fr;gap:0 12px;padding-bottom:16px}
  .ct-step:last-child{padding-bottom:0}
  .ct-step::before{content:"";position:absolute;left:14px;top:30px;bottom:0;width:2px;background:rgba(255,255,255,.10)}
  .ct-step:last-child::before{display:none}
  .ct-step.done::before{background:rgba(0,255,135,.45)}
  .ct-dot{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:14px;font-weight:900;border:2px solid rgba(255,255,255,.18);color:var(--muted);background:var(--bg1);position:relative;z-index:1}
  .ct-step.done .ct-dot{background:var(--teal);border-color:var(--teal);color:var(--bg0)}
  .ct-step.skip .ct-dot{border-style:dashed}
  .ct-step.now .ct-dot{border-color:var(--cyan);color:var(--cyan);box-shadow:0 0 0 0 rgba(0,217,255,.5);animation:ctPulse 2s infinite}
  .ct-step.you .ct-dot{background:var(--gold);border-color:var(--gold);color:var(--bg0)}
  .ct-step.bad .ct-dot{background:var(--pink);border-color:var(--pink);color:#fff}
  @keyframes ctPulse{0%{box-shadow:0 0 0 0 rgba(0,217,255,.45)}70%{box-shadow:0 0 0 10px rgba(0,217,255,0)}100%{box-shadow:0 0 0 0 rgba(0,217,255,0)}}
  @media (prefers-reduced-motion:reduce){.ct-step.now .ct-dot{animation:none}}
  .ct-body{min-width:0;padding-top:3px}
  .ct-title{font-weight:800;font-size:14.5px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
  .ct-who{font-size:10.5px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,.07);color:var(--muted)}
  .ct-step.you .ct-who,.ct-who.you{background:rgba(255,201,49,.15);color:var(--gold)}
  .ct-sub{color:var(--muted);font-size:13px;margin-top:2px}
  .ct-sub b{color:var(--text);font-weight:700}
  .ct-step.you .ct-sub b,.ct-step.bad .ct-sub b{color:var(--gold)}
  .ct-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .ct-foot{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--line);font-size:13px}
  `;
  document.head.appendChild(s);
  return "";
}

// Gameweeks worth showing: last settled (recap may still need sending), every open one, next to release.
function ctGameweeks() {
  const list = (S.gameweeks || []).filter((g) => g && g.event);
  const byEv = (a, b) => Number(a.event) - Number(b.event);
  const open = list.filter((g) => g.status === "open").sort(byEv);
  const settled = list.filter((g) => g.status === "settled").sort(byEv);
  const lastEv = Math.max(0, ...open.concat(settled).map((g) => Number(g.event)));
  const next = list.filter((g) => g.status !== "open" && g.status !== "settled" && Number(g.event) > lastEv).sort(byEv)[0];
  const out = [];
  if (settled.length) out.push(settled[settled.length - 1]);
  out.push(...open);
  if (next) out.push(next);
  return out.filter((g, i, a) => a.findIndex((x) => x.event === g.event) === i).sort(byEv);
}

function ctOutItem(id) {
  return id && apInfo && apInfo.outbox ? apInfo.outbox[id] : null;
}

// Estimated time a bet-tracker window opens: the Nth game's kickoff + ~2h.
// Mirrors trendDue() in scripts/autopilot-core.cjs: at least 2 more games than the last update.
function ctTrackerEta(tl, w, prev) {
  if (!tl || !tl.kickoffs || !tl.kickoffs.length) return null;
  const need = Math.max(w.min, prev && prev.finished ? prev.finished + 2 : 0);
  const k = tl.kickoffs[Math.min(need, tl.kickoffs.length) - 1];
  return k ? k + 115 * 60000 : null;
}

const ctWhen = (t) => (t ? fmtDT(t) : "—");

function ctSteps(g) {
  const now = Date.now();
  const ev = Number(g.event);
  const st = (apInfo && apInfo.status) || {};
  const tl = (st.timeline || {})[ev] || null;
  const rec = ((apInfo && apInfo.gws) || {})[ev] || {};
  const cfg = (apInfo && apInfo.config) || {};
  const released = g.status === "open" || g.status === "settled";
  const settled = g.status === "settled";
  const firstKo = tl ? tl.firstKickoff : g.deadline ? g.deadline + 80 * 60000 : null;
  const releaseAt = tl ? tl.releaseAt : firstKo ? firstKo - Number(cfg.releaseHoursBefore || 24) * 3600000 : null;
  const bets = (S.bets || []).filter((b) => b.gwId === g.id);
  const pending = bets.filter((b) => CT_OPEN_BET.includes(b.status));
  const allDone = tl ? tl.total > 0 && tl.finished >= tl.total : settled;
  const games = tl ? `${tl.finished}/${tl.total} games done${tl.live ? ` · ${tl.live} live` : ""}` : "";
  const ticks = ((cfg.ticks || {})[ev]) || {};
  const tickBtn = (key, outId) =>
    `<button class="btn ghost small" onclick="ctTick(${ev},'${key}',${outId ? `'${esc(outId)}'` : "null"})">✓ Mark done</button>`;
  const shareStep = (title, key, outId, manualKind) => {
    const it = ctOutItem(outId);
    const ticked = ticks[key];
    if (it && it.sentAt) return { state: "done", who: "you", title, sub: `Done ${ctWhen(it.sentAt)}`, btns: [`<button class="btn ghost small" onclick="apOpenShare('${esc(outId)}')">Open again</button>`] };
    if (ticked) return { state: "done", who: "you", title, sub: `Marked done ${ctWhen(ticked)}`, btns: [`<button class="btn ghost small" onclick="ctTick(${ev},'${key}',null,true)">↺ Undo</button>`] };
    if (outId) return { state: "you", who: "you", title, sub: `<b>Ready for you to send.</b> It's in your phone notifications too. Sent it another way? Mark it done.`, btns: [`<button class="btn gold small" onclick="apOpenShare('${esc(outId)}')">📲 Send to WhatsApp</button>`, tickBtn(key, outId)] };
    if (manualKind) return { state: "you", who: "you", title, sub: "<b>Not marked as sent.</b> You did the step before it by hand, so there's no queued copy: open the poster to send it, then mark it done.", btns: [`<button class="btn secondary small" onclick="openPoster('${manualKind}','${esc(g.id)}')">🖼 Open poster</button>`, tickBtn(key, null)] };
    return null;
  };
  const steps = [];

  // 1. Odds released
  if (released) {
    const by = rec.released && rec.released.by === "autopilot" ? "by the autopilot" : "by you";
    steps.push({ state: "done", who: "auto", title: "Odds released", sub: `${ctWhen(g.oddsReleasedAt)} · ${by}`, btns: [] });
  } else if (g.normalOff) {
    steps.push({ state: "skip", who: "auto", title: "Odds released", sub: "Skipped: in-play only this week.", btns: [] });
  } else {
    const failed = rec.releaseGaveUp || rec.missedWarned || (rec.releaseFailures || 0) > 0;
    steps.push({
      state: failed ? "bad" : releaseAt && now >= releaseAt - 3600000 ? "now" : "next",
      who: "auto",
      title: "Odds released",
      sub: failed
        ? `<b>Auto-release ${rec.releaseGaveUp || rec.missedWarned ? "didn't happen" : "hit a problem; retrying"}.</b> ${esc(rec.lastError || "")} Release it now with one tap.`
        : `Autopilot releases the recommended odds <b>${ctWhen(releaseAt)}</b>${firstKo ? ` (first kickoff ${ctWhen(firstKo)})` : ""}.`,
      btns: [
        `<button class="btn secondary small" onclick="go('odds')">🎯 Check the odds</button>`,
        `<button class="btn ${failed ? "gold" : "ghost"} small" onclick="ctReleaseNow('${esc(g.id)}')">🚀 Release now</button>`,
      ],
    });
  }

  // 2. Odds poster to WhatsApp
  const oddsShare = released
    ? shareStep("Odds poster to WhatsApp", "odds", rec.released && rec.released.outboxId, !(rec.released && rec.released.outboxId) ? "odds" : null)
    : null;
  steps.push(oddsShare || { state: "next", who: "you", title: "Odds poster to WhatsApp", sub: "Lands on your phone the moment the odds go live: tap it, then Share.", btns: [] });

  // 3. Bets reviewed
  if (pending.length)
    steps.push({ state: "you", who: "you", title: "Review bets", sub: `<b>${pending.length} bet${pending.length === 1 ? "" : "s"} waiting for your call.</b> ${bets.length} placed so far.`, btns: [`<button class="btn gold small" onclick="reviewFilter='all';go('review')">🏠 Review now</button>`] });
  else if (released && !settled && g.deadline && now < g.deadline)
    steps.push({ state: "now", who: "you", title: "Review bets", sub: `${bets.length ? `All ${bets.length} bet${bets.length === 1 ? "" : "s"} reviewed so far.` : "No bets yet."} You get a push for each new one.`, btns: [] });
  else if (released)
    steps.push({ state: "done", who: "you", title: "Review bets", sub: `${bets.filter((b) => !["rejected", "cancelled", "expired"].includes(b.status)).length} bet(s) in the book.`, btns: [] });
  else steps.push({ state: "next", who: "you", title: "Review bets", sub: "Opens once odds are live. You get a push for each new bet.", btns: [] });

  // 4. Betting closes
  steps.push(
    g.deadline && now >= g.deadline
      ? { state: "done", who: "auto", title: "Betting closed", sub: ctWhen(g.deadline), btns: [] }
      : { state: released ? "now" : "next", who: "auto", title: "Betting closes", sub: `${ctWhen(g.deadline)} (80 min before the first kickoff)`, btns: [] },
  );

  // 5–7. Bet trackers
  const upd = rec.updates || {};
  CT_WINDOWS.forEach((w, i) => {
    const u = upd[i];
    const title = `Bet tracker ${i + 1}`;
    const range = w.max < 99 ? `after ${w.min}–${w.max} games` : `after ${w.min}+ games, if any are left`;
    if (u && u.skipped) return steps.push({ state: "skip", who: "auto", title, sub: `Skipped at ${u.finished} games: nobody had a live bet.`, btns: [] });
    if (u && u.outboxId) {
      const s = shareStep(title, "tracker" + (i + 1), u.outboxId);
      s.sub += ` · made at ${u.finished} games`;
      return steps.push(s);
    }
    if (settled || allDone) return i < 2 && !settled ? steps.push({ state: "skip", who: "auto", title, sub: "Not needed: the games finished first.", btns: [] }) : null;
    const eta = ctTrackerEta(tl, w, upd[i - 1]);
    const started = tl && tl.started > 0;
    const when = eta && eta > now ? `, around <b>${ctWhen(eta)}</b>` : started ? ", at the next lull between games" : "";
    steps.push({ state: started && (!i || upd[i - 1]) ? "now" : "next", who: "auto", title, sub: `Autopilot writes it ${range}${when}.${started && games ? ` Now: ${games}.` : ""}`, btns: [] });
  });

  // 8. Settled
  if (settled) {
    const s = rec.settled || {};
    const counts = s.won != null ? ` · ${s.won} won, ${s.lost} lost${s.void ? `, ${s.void} void` : ""}${s.expired ? `, ${s.expired} expired` : ""}` : "";
    steps.push({ state: "done", who: "auto", title: "Settled", sub: `${s.at ? ctWhen(s.at) : "Done"} · ${s.by === "autopilot" ? "by the autopilot" : "by you"}${counts}`, btns: [] });
  } else {
    const ready = typeof fplScoresReady === "function" ? fplScoresReady(g.id) : { ready: false, have: 0, total: 0 };
    const failed = rec.settleGaveUp || (rec.settleFailures || 0) > 0;
    const graceH = Number(cfg.settleGraceHours == null ? 12 : cfg.settleGraceHours);
    let sub, state = "next";
    if (failed) {
      state = "bad";
      sub = `<b>Auto-settle ${rec.settleGaveUp ? "gave up" : "hit a problem; retrying"}.</b> ${esc(rec.lastError || "")}`;
    } else if (!released) sub = "Once every game is final in FPL Draft.";
    else if (!allDone) sub = `After the last game${tl && tl.lastKickoff ? ` (kicks off ${ctWhen(tl.lastKickoff)})` : ""}, once FPL Draft has final scores.`;
    else if (!ready.ready) {
      state = "now";
      sub = `All games over. Waiting for FPL Draft's final scores (${ready.have}/${ready.total} in).`;
    } else if (pending.length && rec.pendingWarnedAt) {
      state = "now";
      sub = `Scores are in. Waiting for your bet reviews; settles automatically <b>${ctWhen(rec.pendingWarnedAt + graceH * 3600000)}</b> (unreviewed bets expire).`;
    } else {
      state = "now";
      sub = "Scores are in. The autopilot settles on its next check (within ~15 min).";
    }
    steps.push({
      state,
      who: "auto",
      title: "Settle",
      sub,
      btns: released && (ready.ready || failed) ? [`<button class="btn ${failed ? "gold" : "ghost"} small" onclick="ctSettleNow('${esc(g.id)}')">⚖️ Settle now</button>`] : [],
    });
  }

  // 9. Recap poster to WhatsApp
  const recapShare = settled ? shareStep("Results poster to WhatsApp", "recap", rec.settled && rec.settled.outboxId, !(rec.settled && rec.settled.outboxId) ? "recap" : null) : null;
  steps.push(recapShare || { state: "next", who: "you", title: "Results poster to WhatsApp", sub: "Lands on your phone after settling: tap it, then Share.", btns: [] });
  return { steps, tl, games, pending };
}

function ctPhase(g, info) {
  const now = Date.now(),
    tl = info.tl;
  if (g.status === "settled") return info.steps.some((s) => s.state === "you") ? "Settled · results to send" : "All done ✅";
  if (g.status !== "open") return g.normalOff ? "In-play only" : "Getting ready";
  if (g.deadline && now < g.deadline) return "Betting open";
  if (tl && tl.total && tl.finished >= tl.total) return "Games over · settling";
  if (tl && tl.started) return `In play · ${info.games}`;
  return "Betting closed · kickoff soon";
}

// Its own section in the house menu (was the top card of Back Office until 27 Nov).
function vTower() {
  return `<h2>🗼 Control Tower</h2><div class="sub">Each gameweek from odds release to results poster: what ran, what's next, and what needs you.</div>
  ${controlTowerCard()}
  ${autopilotCard()}`;
}

// Count of steps that need the house, for the menu badge. 0 until the autopilot data has loaded.
function ctNeedsCount() {
  if (!apInfo || apInfo.error || !S || !S.gameweeks) return 0;
  try {
    return ctGameweeks().reduce((n, g) => n + ctSteps(g).steps.filter((s) => s.state === "you" || s.state === "bad").length, 0);
  } catch (e) {
    return 0;
  }
}

// Tick a manual step done. Queued items record it on the outbox item (as the share screen does);
// steps with no queued copy are kept in the autopilot config under ticks/<event>/<step>.
async function ctTick(ev, key, outId, undo) {
  if (!requireAdmin()) return;
  try {
    if (outId && !undo) {
      const at = Date.now();
      await db.ref(AUTOPILOT_ROOT + "/outbox/" + outId + "/sentAt").set(at);
      if (apInfo && apInfo.outbox && apInfo.outbox[outId]) apInfo.outbox[outId].sentAt = at;
    } else {
      const v = undo ? null : Date.now();
      await db.ref(AUTOPILOT_ROOT + "/config/ticks/" + ev + "/" + key).set(v);
      if (apInfo) {
        const c = (apInfo.config = apInfo.config || {});
        c.ticks = c.ticks || {};
        c.ticks[ev] = { ...(c.ticks[ev] || {}), [key]: v };
        if (v == null) delete c.ticks[ev][key];
      }
    }
    toast(undo ? "Un-ticked" : "Marked done ✓");
    render();
  } catch (e) {
    toast("Couldn't save: " + e.message, true);
  }
}

function controlTowerCard() {
  setTimeout(apLoadInfo, 0);
  return `<div class="card glow" id="controlTower">${ctCss()}<div id="ctBody">${ctBody()}</div></div>`;
}

function ctBody() {
  ctCss();
  const gws = ctGameweeks();
  const head = (extra) => `<div class="ct-head"><h3>🗼 Control tower</h3>${extra || ""}</div>`;
  if (!gws.length) return head() + `<p class="muted small">No gameweeks staged yet. Run FPL Sync below.</p>`;
  const infos = Object.fromEntries(gws.map((g) => [g.id, ctSteps(g)]));
  const needs = (g) => infos[g.id].steps.filter((s) => s.state === "you" || s.state === "bad").length;
  let g = gws.find((x) => x.id === ctPick);
  if (!g) g = gws.find((x) => needs(x)) || gws.find((x) => x.status === "open") || gws[gws.length - 1];
  const info = infos[g.id];
  const doneN = info.steps.filter((s) => s.state === "done" || s.state === "skip").length;
  const n = needs(g);
  const st = (apInfo && apInfo.status) || {};
  const cfg = (apInfo && apInfo.config) || {};
  const on = cfg.enabled !== false;
  const icon = { done: "✓", skip: "–", now: "●", next: "", you: "!", bad: "!" };
  const chips = gws
    .map((x) => `<button class="ct-chip ${x.id === g.id ? "on" : ""}" onclick="ctPick='${esc(x.id)}';ctRedraw()">${esc(x.name)}${needs(x) ? '<span class="dot" title="Needs you"></span>' : ""}</button>`)
    .join("");
  const list = info.steps
    .map(
      (s, i) => `<li class="ct-step ${s.state}"><div class="ct-dot">${icon[s.state] || i + 1}</div><div class="ct-body">
        <div class="ct-title">${esc(s.title)}<span class="ct-who ${s.who === "you" ? "you" : ""}">${s.who === "you" ? "👆 You" : "🤖 Auto"}</span></div>
        <div class="ct-sub">${s.sub}</div>${s.btns && s.btns.length ? `<div class="ct-btns">${s.btns.join("")}</div>` : ""}</div></li>`,
    )
    .join("");
  const health = !apInfo
    ? "Loading autopilot status…"
    : apInfo.error
      ? `Couldn't load autopilot status: ${esc(apInfo.error)}`
      : `${on ? "🤖 Autopilot on" : "⏸ Autopilot paused: nothing happens automatically"}${st.checkedAt ? ` · last check ${esc(fmtDT(st.checkedAt))}` : ""}${on && st.checkedAt && Date.now() - st.checkedAt > 8 * 3600000 ? ' <span class="neg">(a while ago)</span>' : ""}`;
  return `${head(`<span class="muted small">Your gameweek, start to finish</span>`)}
    <div class="ct-chips">${chips}</div>
    <div class="ct-sum"><div class="ct-phase">${esc(g.name)} · ${esc(ctPhase(g, info))}</div>
      ${n ? `<span class="ct-needs">${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} you</span>` : `<span class="ct-allgood">Nothing needs you right now</span>`}
      <div class="ct-bar" title="${doneN} of ${info.steps.length} steps done"><i style="width:${Math.round((doneN / info.steps.length) * 100)}%"></i></div></div>
    <ol class="ct-list">${list}</ol>
    <div class="ct-foot"><span>${health}</span>
      ${apInfo && !apInfo.error ? `<button class="btn ghost small" onclick="apSetConfig({enabled:${on ? "false" : "true"}})">${on ? "⏸ Pause" : "▶ Turn on"}</button>` : ""}
      <a href="#autopilotSettings" class="small" style="color:var(--cyan)" onclick="const d=document.getElementById('autopilotSettings');if(d){d.open=true;}">Settings &amp; history ↓</a></div>`;
}

function ctRedraw() {
  const el = document.getElementById("ctBody");
  if (el) el.innerHTML = ctBody();
}

// One tap instead of Odds Setter: the model's recommended odds, published exactly as the autopilot would.
async function ctReleaseNow(gwId) {
  if (!requireAdmin()) return;
  const g = gw(gwId);
  if (!g || g.status === "open" || g.status === "settled") return toast("Already released.");
  const fixtures = g.matches.filter((m) => m.home && m.away).length,
    expected = Math.floor(S.teams.length / 2);
  if (fixtures < expected) return toast(`${g.name} has ${fixtures} of ${expected} fixtures. Run FPL Sync first.`, true);
  if (!confirm(`Release ${g.name} now at the recommended odds?\n\nPlayers are notified straight away and the poster opens for you to share.`)) return;
  rerecommend(gwId);
  await saveNow();
  await publishGw(gwId);
  ctRedraw();
}

// One tap instead of Bet Settler: pulls the final FPL scores in, then the normal settle (it asks to confirm).
async function ctSettleNow(gwId) {
  if (!requireAdmin()) return;
  const g = gw(gwId);
  if (!g || g.status !== "open") return toast("Nothing to settle.");
  const r = fplScoresReady(gwId);
  if (!r.ready) return toast(`Only ${r.have}/${r.total} final scores synced. Run FPL Sync, or settle by hand in Bet Settler.`, true);
  fillScoresFromFpl(gwId);
  await saveNow();
  settleGw(gwId);
  ctRedraw();
}
