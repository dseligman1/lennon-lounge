/* In-play state is isolated from the legacy app's whole-state saves. */
let inPlayState = {},
  inPlayListener = null,
  // Cutoffs an admin picked for an unpublished draft, kept apart so a live update doesn't wipe them.
  inPlayPickedCutoff = {};
const INPLAY_ROOT = "lennon-lounge-inplay";
function inPlayPublished(id) {
  // Independent of the normal board: pulling back normal odds leaves in-play alone.
  return inPlayState[id]?.published || null;
}
function startInPlayListener() {
  if (inPlayListener) return;
  inPlayListener = db.ref(INPLAY_ROOT).on(
    "value",
    (snap) => {
      inPlayState = snap.val() || {};
      for (const [id, pick] of Object.entries(inPlayPickedCutoff)) {
        const d = inPlayState[id]?.draft;
        if (d && d.revision === pick.revision) d.cutoff = pick.ts;
        else delete inPlayPickedCutoff[id];
      }
      if (me && S) {
        render();
        inPlayAutoPublish();
      }
    },
    (err) => {
      inPlayState = {};
      inPlayListener = null; // Firebase has dropped it; allow a restart on next login
      inPlayPickedCutoff = {};
      toast("In-play feed unavailable: " + err.message, true);
    },
  );
}
function stopInPlayListener() {
  if (inPlayListener) db.ref(INPLAY_ROOT).off("value", inPlayListener);
  inPlayListener = null;
  inPlayState = {};
  inPlayPickedCutoff = {};
}
async function refreshInPlay(id) {
  const snap = await db.ref(INPLAY_ROOT + "/" + id).once("value");
  inPlayState[id] = snap.val() || {};
  return inPlayPublished(id);
}
function inPlayBetError(b) {
  if (!b?.inplay && !b?.legs?.some((l) => l.marketRevision)) return null;
  const g = gw(b.gwId);
  if (!g || g.status === "settled") return "This gameweek is closed.";
  return (
    (b.legs || [])
      .map((l) => LennonInPlay.legError(inPlayPublished(b.gwId), l, Date.now()))
      .find(Boolean) || null
  );
}
const IP_REFRESH_TIMEOUT = 3 * 60000,
  IP_COLOURS = {
    green: "var(--teal)",
    amber: "var(--orange)",
    red: "var(--pink)",
    grey: "var(--muted)",
  };
let inPlayAutoRequests = new Set(),
  inPlayHealthTimer = null;
function inPlayAgo(t) {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return m < 1
    ? "just now"
    : m < 60
      ? `${m} min ago`
      : `${Math.floor(m / 60)} hr ${m % 60} min ago`;
}
// Red / amber / green status for the latest in-play refresh, shared by admin and player views.
function inPlayHealth(g, viewer = "admin") {
  const r = inPlayState[g.id] || {},
    req = r.request,
    data =
      viewer === "admin"
        ? r.draft || inPlayPublished(g.id)
        : inPlayPublished(g.id),
    now = Date.now();
  if (viewer === "admin" && req && ["queued", "running"].includes(req.status)) {
    const age = now - req.requestedAt;
    if (req.dispatch && !req.dispatch.ok)
      return {
        level: "red",
        text: `Refresh couldn't start (GitHub replied ${req.dispatch.code}). The instant-refresh token in Back Office → 📲 Phone alerts is missing or expired; until it's fixed the request waits for GitHub's slow schedule.`,
      };
    if (age > IP_REFRESH_TIMEOUT)
      return {
        level: "red",
        text: `Refresh requested ${inPlayAgo(req.requestedAt)} but no result yet. GitHub may be delayed; try again.`,
      };
    return {
      level: "amber",
      text:
        req.status === "running"
          ? "Pulling the latest FPL scores and repricing…"
          : "Refresh requested, starting…",
    };
  }
  if (viewer === "admin" && req?.status === "error")
    return {
      level: "red",
      text: "Last refresh failed: " + (req.error || "unknown error"),
    };
  if (!data)
    return {
      level: "grey",
      text:
        viewer === "admin"
          ? "Not refreshed yet this gameweek."
          : "No in-play odds yet.",
    };
  const src = data.source || {},
    fx = src.fixtures || {},
    fetched = src.fetchedAt || data.generatedAt;
  if (viewer === "admin" && data.blockedReasons?.length)
    return {
      level: "red",
      text: "Can't publish: " + data.blockedReasons.join(" "),
    };
  const games = fx.total
    ? ` · ${fx.finished} of ${fx.total} PL games finished${fx.live ? `, ${fx.live} in play` : ""}`
    : "";
  const base = `Scores from FPL at ${fmtDT(fetched)} (${inPlayAgo(fetched)})${games}`;
  if (data.preStart)
    return {
      level: now < data.startsAt ? "green" : "red",
      text:
        now < data.startsAt
          ? `Pre-gameweek prices, checked ${fmtDT(fetched)}. Live scores start after ${fmtDT(data.startsAt)}.`
          : "Gameweek has started: refresh for live scores.",
    };
  // Between matches nothing changes until the next kickoff, so an older pull is still current.
  const quiet = !data.active && (!fx.nextKickoff || now < fx.nextKickoff);
  const age = now - fetched;
  if (quiet || age <= 10 * 60000)
    return {
      level: "green",
      text:
        base +
        (quiet && !fx.live ? " · up to date: no games in play since" : ""),
    };
  if (age <= 30 * 60000)
    return { level: "amber", text: base + " · games in play, refresh soon" };
  return { level: "red", text: base + " · out of date, refresh now" };
}
function inPlayHealthHtml(g, viewer = "admin") {
  const h = inPlayHealth(g, viewer);
  return `<p class="small ip-health" data-gw="${g.id}" data-viewer="${viewer}" style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><span title="${h.level}" style="flex:0 0 auto;width:10px;height:10px;margin-top:4px;border-radius:50%;background:${IP_COLOURS[h.level]};box-shadow:0 0 8px ${IP_COLOURS[h.level]}"></span><span>${esc(h.text)}</span></p>`;
}
// Keeps dots and "x min ago" current without a full re-render.
function startInPlayHealthTimer() {
  if (inPlayHealthTimer) return;
  inPlayHealthTimer = setInterval(() => {
    document.querySelectorAll(".ip-health").forEach((el) => {
      const g = typeof gw === "function" ? gw(el.dataset.gw) : null;
      if (g) el.outerHTML = inPlayHealthHtml(g, el.dataset.viewer);
    });
  }, 15000);
}
function inPlaySourceHtml(m, g) {
  if (m.preStart)
    return `${g ? inPlayHealthHtml(g, "player") : ""}<p class="muted small">Prices match the normal board exactly, including boosts.</p>`;
  return `${g ? inPlayHealthHtml(g, "player") : ""}<details><summary class="muted small">Data freshness and limitations</summary>${(m.source.warnings || []).map((w) => `<p class="muted small">${esc(w)}</p>`).join("")}</details>`;
}
function inPlayBoard(g, preview = false) {
  const m = preview ? inPlayState[g.id]?.draft : inPlayPublished(g.id);
  if (!m) return "";
  const open = LennonInPlay.isOpen(m, Date.now()) && g.status !== "settled";
  return `<div class="card"><div class="gwhead"><h3>🔴 ${esc(g.name)} · In-play${preview ? " preview" : ""}</h3><span class="deadline ${open ? "" : "passed"}">${preview ? "Proposed cutoff" : open ? "Bets close" : "Closed"} ${fmtDT(m.cutoff)}</span></div>${inPlaySourceHtml(m, preview ? null : g)}${Object.values(
    m.matches || {},
  )
    .map((f) => {
      const own = f.home === me.id ? "home" : f.away === me.id ? "away" : null;
      const t = m.forecast.teams;
      return `<div class="match"><div class="names">${teamLink(f.home)} <b class="mono" style="color:var(--teal)">${f.currentHome}–${f.currentAway}</b> ${teamLink(f.away)}</div><div class="muted small">Predicted finish ${(t[f.home].priceProj ?? t[f.home].proj).toFixed(0)}–${(t[f.away].priceProj ?? t[f.away].proj).toFixed(0)} · confidence ±10 pts: ${Math.round(t[f.home].confidence)}% / ${Math.round(t[f.away].confidence)}%${f.suspended ? " · Suspended: result is decided" : ["home", "draw", "away"].some((p) => f.odds[p] == null) ? " · OFF = too likely to price" : ""}</div><div class="oddsbtns">${["home", "draw", "away"].map((p) => `<button class="oddbtn ${slip.some((l) => l.marketRevision === m.revision && l.matchId === f.id && l.pick === p) ? "sel" : ""}" ${!open || preview || f.suspended || f.odds[p] == null || (own && p !== own) ? "disabled" : ""} onclick="addInPlayLeg('${g.id}','${f.id}','${p}')">${p.toUpperCase()}<b>${m.originalOdds?.[f.id]?.[p] !== f.odds[p] ? `<s class="muted small">${fmtOdds(m.originalOdds?.[f.id]?.[p])}</s> ` : ""}${f.odds[p] == null ? "OFF" : fmtOdds(f.odds[p])}</b></button>`).join("")}</div><details><summary class="muted small">Why these in-play odds?</summary><p class="muted small">${m.preStart ? "Normal board prices are reused before the gameweek starts. This confirms price consistency; live scoring is checked once play begins." : "Points already scored are locked in. Only players in each manager's starting XI count, with automatic bench substitutes for anyone who doesn't play; injured or doubtful players are less likely to feature. Remaining Premier League games are simulated together. Unconfirmed bonus is estimated from live BPS. Player forecasts show full gameweek totals."}</p>${forecastTable({ ...t[f.home], name: team(f.home).name })}${forecastTable({ ...t[f.away], name: team(f.away).name })}</details></div>`;
    })
    .join("")}</div>`;
}
function inPlayAdminCard(g) {
  startInPlayHealthTimer();
  const r = inPlayState[g.id] || {},
    d = r.draft,
    req = r.request,
    p = inPlayPublished(g.id);
  // In-play follows the real FPL gameweek start, not the normal board's cutoff.
  const fplStart = Number(S.fpl?.events?.[g.event]?.deadline) || null;
  const beforeStart = fplStart && fplStart > Date.now();
  const busy =
    req &&
    ["queued", "running"].includes(req.status) &&
    Date.now() - req.requestedAt < IP_REFRESH_TIMEOUT;
  const draftIsLive = d && p && d.revision === p.revision;
  const picker = (ts, max) =>
    `<div class="formrow"><div><label>${draftIsLive ? "Change live in-play cutoff (UK)" : "In-play betting cutoff (UK)"}</label>${dtPicker("inplay_" + g.id, ts, { label: "Set in-play cutoff", onConfirm: `dtPickConfirm('inplay_${g.id}',v=>setInPlayCutoff('${g.id}',v))` })}</div><div class="muted small">Latest allowed: ${fmtDT(max)}</div></div>`;
  const normalNote =
    g.status === "draft"
      ? "Normal odds aren't published. Publishing in-play alone makes this an in-play-only week; you can still release normal odds later before their cutoff."
      : g.normalOff
        ? "In-play only this week: normal odds are off."
        : "";
  return `<div class="card" id="inplay-admin-${g.id}"><h3>🔴 ${esc(g.name)} · In-play odds</h3>${inPlayHealthHtml(g)}<button class="btn" onclick="requestInPlay('${g.id}')" ${busy ? "disabled" : ""}>${busy ? "⏳ Refreshing…" : "🔄 Refresh in-play odds"}</button>${p ? ` <button class="btn danger" onclick="withdrawInPlay('${g.id}')">↩ Pull back in-play odds</button> <button class="btn secondary" onclick="openPoster('inplay','${g.id}')">In-play poster</button>` : ""}<p class="muted small">Pulls the latest scores straight from FPL (about a minute), reprices every match and publishes the new odds automatically if nothing is blocking them. Works on its own until this gameweek is settled. ${fplStart ? `<b>FPL gameweek starts: ${fmtDT(fplStart)}</b>. ` : ""}${beforeStart ? "Until then prices copy this week's board odds." : "While games are in play, odds stay open for up to 15 minutes (you still approve each bet); between games, until the next kickoff."}${normalNote ? `<br>${normalNote}` : ""}</p>${p ? `<p class="muted small"><b>Live for players</b> until ${fmtDT(p.cutoff)}${draftIsLive ? "" : " · a newer draft is below"}</p>` : ""}${draftIsLive ? picker(p.cutoff, p.maxCutoff) : ""}${d && !draftIsLive ? `${picker(d.cutoff, d.maxCutoff)}<button class="btn" onclick="publishInPlay('${g.id}')" ${g.status === "settled" ? "disabled" : ""}>Publish these in-play odds</button>` : ""}${d ? inPlayBoard(g, true) : ""}</div>`;
}
// The date picker hands back UK local text ("2026-11-07T15:00"), not a timestamp — the old
// handler compared that text with a number, so every chosen cutoff was silently rejected.
async function setInPlayCutoff(id, value) {
  const ts = typeof value === "number" ? value : parseDTLocal(value);
  const d = inPlayState[id]?.draft,
    p = inPlayPublished(id);
  const live = !!(p && (!d || p.revision === d.revision));
  const target = live ? p : d;
  if (!target) return;
  if (!ts || ts <= Date.now() || ts > target.maxCutoff) {
    toast(
      "Choose a future cutoff no later than " + fmtDT(target.maxCutoff),
      true,
    );
    return;
  }
  if (live) {
    if (!requireAdmin()) return;
    try {
      const res = await db.ref(INPLAY_ROOT + "/" + id).transaction((rec) => {
        if (!rec?.published || rec.published.revision !== p.revision) return;
        rec.published.cutoff = ts;
        if (rec.draft?.revision === p.revision) rec.draft.cutoff = ts;
        return rec;
      });
      if (!res.committed) throw Error("the market changed; try again");
      inPlayState[id] = res.snapshot.val();
      toast("In-play bets now close " + fmtDT(ts));
    } catch (e) {
      toast("Could not change the cutoff: " + e.message, true);
    }
  } else {
    d.cutoff = ts;
    inPlayPickedCutoff[id] = { revision: d.revision, ts };
    toast("Cutoff set to " + fmtDT(ts) + ". Publish to apply it.");
  }
  render();
}
// Publishing in-play on an unpublished week turns it into a live, in-play-only week so results,
// settlement and Matchday all track it. Writes only the gameweek list, never the bets branch.
async function markInPlayOnly(id) {
  const g = gw(id);
  if (!g || g.status !== "draft") return;
  const gameweeks = structuredClone(S.gameweeks),
    next = gameweeks.find((x) => x.id === id);
  next.status = "open";
  next.normalOff = true;
  next.inPlayOnlyAt = Date.now();
  const auditLog = [
    ...S.audit,
    {
      at: Date.now(),
      by: me.id,
      action: "in-play only",
      detail: g.name + ": in-play published without normal odds",
    },
  ].slice(-500);
  await db
    .ref()
    .update({ [ROOT + "/gameweeks"]: gameweeks, [ROOT + "/audit"]: auditLog });
  S.gameweeks = gameweeks;
  S.audit = auditLog;
}
async function requestInPlay(id) {
  if (!requireAdmin()) return;
  const g = gw(id);
  if (!g || g.status === "settled") return;
  const request = {
    id: "ip_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    requestedAt: Date.now(),
    requestedBy: me.id,
    status: "queued",
  };
  const ref = db.ref(INPLAY_ROOT + "/" + id + "/request");
  try {
    await ref.set(request);
    inPlayAutoRequests.add(request.id);
  } catch (e) {
    toast("Could not request a refresh: " + e.message, true);
    return;
  }
  // Start the GitHub worker now rather than waiting for its schedule (which GitHub often delays by hours).
  let dispatch;
  try {
    const cfg = (await db.ref(ALERTS_ROOT + "/config").once("value")).val();
    if (!cfg?.dispatchToken) dispatch = { ok: false, code: "no token" };
    else {
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
      dispatch = { ok: res.status === 204, code: res.status };
    }
  } catch (e) {
    dispatch = { ok: false, code: "network" };
  }
  await db
    .ref(INPLAY_ROOT + "/" + id + "/request")
    .transaction((cur) =>
      cur?.id === request.id ? { ...cur, dispatch } : undefined,
    )
    .catch(() => {});
  toast(
    dispatch.ok
      ? "Refreshing: pulling the latest FPL scores. New odds in about a minute."
      : "Couldn't start the refresh instantly (" +
          dispatch.code +
          "). Check the token in Back Office → 📲 Phone alerts.",
    !dispatch.ok,
  );
}
// After a Refresh by this admin, publish the fresh odds as soon as they land and pass every check.
function inPlayAutoPublish() {
  for (const [id, r] of Object.entries(inPlayState)) {
    const d = r?.draft;
    if (
      !d ||
      !inPlayAutoRequests.has(d.requestId) ||
      r.request?.status !== "ready"
    )
      continue;
    inPlayAutoRequests.delete(d.requestId);
    if (inPlayPublished(id)?.revision === d.revision) continue;
    const error =
      LennonInPlay.publishError(d, d.cutoff, Date.now()) ||
      LennonInPlay.baselineError(d, S, gw(id), Date.now());
    if (error) {
      toast("New odds ready but not published: " + error, true);
      continue;
    }
    publishInPlay(id, { auto: true });
  }
}
async function publishInPlay(id, { auto = false } = {}) {
  if (!requireAdmin()) return;
  const chosen = inPlayState[id]?.draft;
  if (!chosen) return;
  const cutoff = chosen.cutoff;
  const baselineError = LennonInPlay.baselineError(
    chosen,
    S,
    gw(id),
    Date.now(),
  );
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
    await markInPlayOnly(id).catch((e) =>
      toast(
        "In-play is live, but marking the week in-play only failed: " +
          e.message,
        true,
      ),
    );
    await db
      .ref("lennon-lounge-inplay-history/" + id + "/" + saved.revision)
      .set(saved)
      .catch((e) => console.error("Published market archive failed:", e));
    await refreshInPlay(id);
    render();
    toast(auto ? "Fresh in-play odds are live" : "In-play odds published");
    if (!auto) openPoster("inplay", id);
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
      return `<div class="pst-row"><div class="pst-names"><div class="pst-h"><b>${esc(team(f.home).name)}</b> ${f.currentHome}</div><div class="pst-a"><b>${esc(team(f.away).name)}</b> ${f.currentAway}</div></div>${["home", "draw", "away"].map((p) => `<span class="pst-o${p === "draw" ? " dr" : ""}"><small><s>${fmtOdds(m.originalOdds[f.id][p])}</s></small> ${f.suspended || f.odds[p] == null ? "OFF" : fmtOdds(f.odds[p])}</span>`).join("")}<p class="pst-roast">Predicted finish ${(a.priceProj ?? a.proj).toFixed(0)}–${(b.priceProj ?? b.proj).toFixed(0)} · confidence ±10: ${Math.round(a.confidence)}% / ${Math.round(b.confidence)}%</p></div>`;
    })
    .join(
      "",
    )}</div><p style="padding:20px 36px;font-size:20px">Scores as fetched ${esc(fmtDT(m.source.fetchedAt))}. Provisional: FPL reporting lag is unknown and bonus points may change. Odds expire at the cutoff above.</p>${posterCta("ip" + g.event + "-" + m.revision, "TAP FOR CURRENT IN-PLAY ODDS", "Check the live market before betting.")}<div class="pst-fine">Confidence is an estimated chance of finishing within ±10 points. Existing bets retain their original prices.</div></div>`;
}
