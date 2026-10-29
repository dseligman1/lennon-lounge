/* In-play state is isolated from the legacy app's whole-state saves. */
let inPlayState = {},
  inPlayListener = null;
const INPLAY_ROOT = "lennon-lounge-inplay";
function inPlayPublished(id) {
  return oddsWithdrawn(id) ? null : inPlayState[id]?.published || null;
}
function startInPlayListener() {
  if (inPlayListener) return;
  inPlayListener = db.ref(INPLAY_ROOT).on(
    "value",
    (snap) => {
      inPlayState = snap.val() || {};
      if (me && S) render();
    },
    (err) => {
      inPlayState = {};
      toast("In-play feed unavailable: " + err.message, true);
    },
  );
}
function stopInPlayListener() {
  if (inPlayListener) db.ref(INPLAY_ROOT).off("value", inPlayListener);
  inPlayListener = null;
  inPlayState = {};
}
async function refreshInPlay(id) {
  const snap = await db.ref(INPLAY_ROOT + "/" + id).once("value");
  inPlayState[id] = snap.val() || {};
  return inPlayPublished(id);
}
function inPlayBetError(b) {
  if (!b?.inplay && !b?.legs?.some((l) => l.marketRevision)) return null;
  const g = gw(b.gwId);
  if (!g || g.status !== "open" || oddsWithdrawn(g.id))
    return "This gameweek is closed.";
  return (
    (b.legs || [])
      .map((l) => LennonInPlay.legError(inPlayPublished(b.gwId), l, Date.now()))
      .find(Boolean) || null
  );
}
function inPlaySourceHtml(m) {
  if (m.preStart)
    return `<p class="muted small">Pre-gameweek preview · prices match the normal board exactly, including boosts. Checked ${esc(fmtDT(m.source.fetchedAt))}. Live scoring starts after ${esc(fmtDT(m.startsAt))}.</p>`;
  return `<p class="muted small">Scores fetched ${esc(fmtDT(m.source.fetchedAt))} · ${Math.max(0, Math.floor((Date.now() - m.source.fetchedAt) / 60000))} min ago · provisional. FPL publication lag is unknown.</p><details><summary class="muted small">Data freshness and limitations</summary>${(m.source.warnings || []).map((w) => `<p class="muted small">${esc(w)}</p>`).join("")}</details>`;
}
function inPlayBoard(g, preview = false) {
  const m = preview ? inPlayState[g.id]?.draft : inPlayPublished(g.id);
  if (!m) return "";
  const open =
    LennonInPlay.isOpen(m, Date.now()) &&
    g.status === "open" &&
    !oddsWithdrawn(g.id);
  return `<div class="card"><div class="gwhead"><h3>🔴 ${esc(g.name)} · In-play${preview ? " preview" : ""}</h3><span class="deadline ${open ? "" : "passed"}">${preview ? "Proposed cutoff" : open ? "Bets close" : "Closed"} ${fmtDT(m.cutoff)}</span></div>${inPlaySourceHtml(m)}${Object.values(
    m.matches || {},
  )
    .map((f) => {
      const own = f.home === me.id ? "home" : f.away === me.id ? "away" : null;
      const t = m.forecast.teams;
      return `<div class="match"><div class="names">${teamLink(f.home)} <b class="mono" style="color:var(--teal)">${f.currentHome}–${f.currentAway}</b> ${teamLink(f.away)}</div><div class="muted small">Predicted finish ${t[f.home].proj.toFixed(1)}–${t[f.away].proj.toFixed(1)} · confidence ±10 pts: ${Math.round(t[f.home].confidence)}% / ${Math.round(t[f.away].confidence)}%${f.suspended ? " · Suspended: too certain to offer at the house margin" : ""}</div><div class="oddsbtns">${["home", "draw", "away"].map((p) => `<button class="oddbtn ${slip.some((l) => l.marketRevision === m.revision && l.matchId === f.id && l.pick === p) ? "sel" : ""}" ${!open || preview || f.suspended || (own && p !== own) ? "disabled" : ""} onclick="addInPlayLeg('${g.id}','${f.id}','${p}')">${p.toUpperCase()}<b>${m.originalOdds?.[f.id]?.[p] !== f.odds[p] ? `<s class="muted small">${fmtOdds(m.originalOdds?.[f.id]?.[p])}</s> ` : ""}${fmtOdds(f.odds[p])}</b></button>`).join("")}</div><details><summary class="muted small">Why these in-play odds?</summary><p class="muted small">${m.preStart ? "Normal board prices are reused before the gameweek starts. This confirms price consistency; live scoring is checked once play begins." : "Current points are retained; remaining fixtures are simulated together. Bonus and substitutions are provisional. Player forecasts show full gameweek totals."}</p>${forecastTable({ ...t[f.home], name: team(f.home).name })}${forecastTable({ ...t[f.away], name: team(f.away).name })}</details></div>`;
    })
    .join("")}</div>`;
}
function inPlayAdminCard(g) {
  const r = inPlayState[g.id] || {},
    d = r.draft,
    req = r.request,
    p = r.published;
  const deadline = Math.min(
    g.deadline || Infinity,
    S.fpl?.events?.[g.event]?.deadline || Infinity,
  );
  const beforeStart = deadline > Date.now() && Number.isFinite(deadline);
  return `<div class="card" id="inplay-admin-${g.id}"><h3>🔴 ${esc(g.name)} · Generate in-play odds</h3><p class="muted small">Generate and review any time, including before the gameweek starts. Pre-gameweek prices match the normal board exactly. Publish when ready.</p><p class="muted small"><b>Gameweek cutoff: ${Number.isFinite(deadline) ? fmtDT(deadline) : "Awaiting FPL deadline"}</b><br>${beforeStart ? "Pre-gameweek previews close by this cutoff." : "During play, prices last up to two minutes; otherwise they close before the next kickoff."}</p><button class="btn" onclick="requestInPlay('${g.id}')">${req?.status === "queued" ? "Generate newer snapshot" : "Generate in-play odds"}</button>${p ? ` <button class="btn danger" onclick="withdrawInPlay('${g.id}')">↩ Pull back in-play odds</button> <button class="btn secondary" onclick="openPoster('inplay','${g.id}')">In-play poster</button><p class="muted small">Published market cutoff: ${fmtDT(p.cutoff)}</p>` : ""}${req ? `<p class="muted small">Request: ${esc(req.status)}${req.error ? " · " + esc(req.error) : ""}${req.status === "queued" ? " · Waiting for the workflow; usually around five minutes (GitHub can delay it)." : ""}</p>` : ""}${d ? `${d.blockedReasons?.length ? `<p style="color:var(--pink)">${d.blockedReasons.map(esc).join(" ")}</p>` : ""}<div class="formrow"><div><label>In-play betting cutoff (UK)</label>${dtPicker("inplay_" + g.id, d.cutoff, { label: "Set in-play cutoff", onConfirm: `dtPickConfirm('inplay_${g.id}',v=>setInPlayCutoff('${g.id}',v))` })}</div><div class="muted small">Latest allowed: ${fmtDT(d.maxCutoff)}<br>${d.preStart ? "Closes by the gameweek cutoff." : "Active games: two-minute maximum. Otherwise closes before the next kickoff."}</div></div>${g.status !== "open" || oddsWithdrawn(g.id) ? '<p class="muted small">Publish the normal odds first to release this preview.</p>' : ""}<button class="btn" onclick="publishInPlay('${g.id}')" ${g.status !== "open" || oddsWithdrawn(g.id) ? "disabled" : ""}>Publish these in-play odds</button>${inPlayBoard(g, true)}` : ""}</div>`;
}
function setInPlayCutoff(id, ts) {
  const d = inPlayState[id]?.draft;
  if (!d) return;
  if (ts > Date.now() && ts <= d.maxCutoff) {
    d.cutoff = ts;
    render();
  } else
    toast("Choose a future cutoff no later than " + fmtDT(d.maxCutoff), true);
}
async function requestInPlay(id) {
  if (!requireAdmin()) return;
  const g = gw(id);
  if (!g || !["open", "draft"].includes(g.status)) return;
  const request = {
    id: "ip_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    requestedAt: Date.now(),
    requestedBy: me.id,
    status: "queued",
  };
  try {
    await db.ref(INPLAY_ROOT + "/" + id + "/request").set(request);
    let instant = false;
    try {
      const cfg = (await db.ref(ALERTS_ROOT + "/config").once("value")).val();
      if (cfg?.dispatchToken) {
        const res = await fetch(
          "https://api.github.com/repos/dseligman1/lennon-lounge/actions/workflows/in-play.yml/dispatches",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + cfg.dispatchToken,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ref: "main" }),
          },
        );
        instant = res.ok;
      }
    } catch {}
    toast(
      instant
        ? "In-play workflow started. The draft will appear here."
        : "Request queued for the next workflow tick.",
    );
  } catch (e) {
    toast("Could not queue odds: " + e.message, true);
  }
}
async function publishInPlay(id) {
  if (!requireAdmin()) return;
  const chosen = inPlayState[id]?.draft;
  if (!chosen) return;
  const cutoff = chosen.cutoff;
  const baselineError = oddsWithdrawn(id)
    ? "Normal odds have been pulled back."
    : LennonInPlay.baselineError(chosen, S, gw(id), Date.now());
  if (baselineError) {
    toast(baselineError, true);
    return;
  }
  try {
    const result = await db
      .ref(INPLAY_ROOT + "/" + id)
      .transaction((record) => {
        if (!record?.draft || record.draft.revision !== chosen.revision) return;
        const error = LennonInPlay.publishError(
          record.draft,
          cutoff,
          Date.now(),
        );
        if (
          error ||
          oddsWithdrawn(id) ||
          LennonInPlay.baselineError(record.draft, S, gw(id), Date.now())
        )
          return;
        const published = LennonInPlay.publishRecord(
          record.draft,
          cutoff,
          Date.now(),
          me.id,
          record.published,
        );
        return {
          ...record,
          published,
        };
      });
    if (!result.committed) {
      toast(
        LennonInPlay.publishError(chosen, cutoff, Date.now()) ||
          "The draft changed. Review the latest recommendation.",
        true,
      );
      return;
    }
    const saved = result.snapshot.val().published;
    await db
      .ref("lennon-lounge-inplay-history/" + id + "/" + saved.revision)
      .set(saved)
      .catch((e) => console.error("Published market archive failed:", e));
    await refreshInPlay(id);
    render();
    toast("In-play odds published");
    openPoster("inplay", id);
  } catch (e) {
    toast("Publish failed: " + e.message, true);
  }
}
async function withdrawInPlay(id) {
  if (!requireAdmin()) return;
  if (
    !confirm(
      "Pull back these in-play odds? Existing bets stay valid. The prices return to draft and new bets stop until you publish again.",
    )
  )
    return;
  try {
    const result = await db
      .ref(INPLAY_ROOT + "/" + id)
      .transaction((record) =>
        record
          ? LennonInPlay.withdrawRecord(record, Date.now(), me.id)
          : undefined,
      );
    if (!result.committed) return;
    inPlayState[id] = result.snapshot.val();
    slip = slip.filter((l) => !(l.gwId === id && l.marketRevision));
    render();
    toast("In-play odds returned to draft. Existing bets remain valid.");
  } catch (e) {
    toast(e.message, true);
  }
}
function addInPlayLeg(id, matchId, pick) {
  const market = inPlayPublished(id),
    m = market?.matches?.[matchId];
  if (!m) return;
  const leg = {
    type: "match",
    gwId: id,
    matchId,
    pick,
    odds: m.odds[pick],
    marketRevision: market.revision,
    marketCutoff: market.cutoff,
    label:
      "IN-PLAY · " +
      (pick === "draw"
        ? `Draw: ${team(m.home).name} v ${team(m.away).name}`
        : `${team(pick === "home" ? m.home : m.away).name} to WIN`),
  };
  const error = LennonInPlay.legError(market, leg, Date.now());
  if (error) {
    toast(error, true);
    return;
  }
  if (slipViolatesIntegrity([leg], me.id)) {
    toast("You can only back your own team to win.", true);
    return;
  }
  if (
    slip.some((l) => !l.marketRevision || l.marketRevision !== market.revision)
  ) {
    slip = [];
  }
  const i = slip.findIndex((l) => l.matchId === matchId);
  if (i >= 0) {
    if (slip[i].pick === pick) slip.splice(i, 1);
    else slip[i] = leg;
  } else slip.push(leg);
  slipDuplicateOf = null;
  render();
}
function inPlayPosterHtml(g) {
  const m = inPlayPublished(g.id);
  if (!m) throw Error("No published in-play market");
  return `<div class="pst pst-odds">${posterTop()}<div class="pst-hero"><div class="pst-gw">${esc(g.name)}</div><div class="pst-live">IN-PLAY<br>ODDS</div><div class="pst-dl"><span>BETTING CUTOFF</span><b>${esc(fmtDT(m.cutoff))}</b></div></div><div class="pst-coupon">${Object.values(
    m.matches,
  )
    .map((f) => {
      const a = m.forecast.teams[f.home],
        b = m.forecast.teams[f.away];
      return `<div class="pst-row"><div class="pst-names"><div class="pst-h"><b>${esc(team(f.home).name)}</b> ${f.currentHome}</div><div class="pst-a"><b>${esc(team(f.away).name)}</b> ${f.currentAway}</div></div>${["home", "draw", "away"].map((p) => `<span class="pst-o${p === "draw" ? " dr" : ""}"><small><s>${fmtOdds(m.originalOdds[f.id][p])}</s></small> ${f.suspended ? "OFF" : fmtOdds(f.odds[p])}</span>`).join("")}<p class="pst-roast">Predicted finish ${a.proj.toFixed(0)}–${b.proj.toFixed(0)} · confidence ±10: ${Math.round(a.confidence)}% / ${Math.round(b.confidence)}%</p></div>`;
    })
    .join(
      "",
    )}</div><p style="padding:20px 36px;font-size:20px">Scores as fetched ${esc(fmtDT(m.source.fetchedAt))}. Provisional: FPL reporting lag is unknown and bonus points may change. Odds expire at the cutoff above.</p>${posterCta("ip" + g.event + "-" + m.revision, "TAP FOR CURRENT IN-PLAY ODDS", "Check the live market before betting.")}<div class="pst-fine">Confidence is an estimated chance of finishing within ±10 points. Existing bets retain their original prices.</div></div>`;
}
