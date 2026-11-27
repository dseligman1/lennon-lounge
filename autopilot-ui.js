/* Autopilot UI (2026-11-27, PROGRESS.md ROUND 22). Two things:
 * (i)  One-tap WhatsApp share: the autopilot's push opens ?share=<outbox id>; this shows the
 *      poster/update with one Share button (image + caption via the phone's share sheet, or the
 *      text straight into WhatsApp) and a "Mark sent" button.
 * (ii) Back Office → 🤖 Autopilot: on/off switch, what it did last, what's next, outbox.
 * Data lives at lennon-lounge-autopilot (admin-only in database.rules.json); the worker is
 * scripts/autopilot.cjs in GitHub Actions. */
const AUTOPILOT_ROOT = "lennon-lounge-autopilot";
let apShare = null; // {id, item, loading, error}
let apInfo = null; // {status, config, outbox, log}

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
    const [status, config, log] = await Promise.all([
      db.ref(AUTOPILOT_ROOT + "/status").once("value"),
      db.ref(AUTOPILOT_ROOT + "/config").once("value"),
      db.ref(AUTOPILOT_ROOT + "/log").limitToLast(12).once("value"),
    ]);
    // Images live separately under /images, so this stays small.
    const out = await db.ref(AUTOPILOT_ROOT + "/outbox").limitToLast(12).once("value");
    const outbox = {};
    Object.entries(out.val() || {}).forEach(([k, v]) => {
      if (v) outbox[k] = { ...v, id: k };
    });
    apInfo = { status: status.val(), config: config.val() || {}, log: log.val() || {}, outbox };
  } catch (e) {
    apInfo = { error: e.message };
  }
  const el = document.getElementById("apCardBody");
  if (el) el.innerHTML = apCardBody();
}

function autopilotCard() {
  setTimeout(apLoadInfo, 0);
  return `<div class="card"><h3>🤖 Autopilot</h3><div id="apCardBody">${apCardBody()}</div></div>`;
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
  const outbox = Object.values(apInfo.outbox || {}).sort((a, b) => b.createdAt - a.createdAt);
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
