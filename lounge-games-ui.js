/* Isolated Firebase branches: entries never travel through legacy whole-state saves. */
const SCORE_ROOT = "lennon-lounge-score-game",
  MATCHDAY_ROOT = "lennon-lounge-matchday";
let scoreRounds = {},
  scoreEntries = {},
  scoreResults = {},
  scorePaid = {},
  scoreAllEntries = {};
let scoreReady = false,
  scoreEntryReady = {},
  scoreDrafts = {},
  scoreBusy = false,
  scoreError = "";
let gamesListeners = [],
  gamesEntryListeners = {},
  gamesOffset = 0;
let matchdayEvent = null,
  matchdayFocus = null,
  matchdayRecord = {},
  matchdayListening = null;
const gamesNow = () => Date.now() + gamesOffset;
const gamesName = (id) => team(id)?.name || id;
function gamesListen(path, cb, error) {
  const ref = db.ref(path),
    fn = ref.on(
      "value",
      cb,
      error ||
        ((e) => {
          scoreError = "Connection unavailable. Please refresh to try again.";
          if (me && S) render();
        }),
    );
  gamesListeners.push({ ref, fn });
}
function startGamesListeners() {
  if (gamesListeners.length) return;
  gamesListen(".info/serverTimeOffset", (snap) => {
    gamesOffset = Number(snap.val()) || 0;
  });
  gamesListen(SCORE_ROOT + "/rounds", (snap) => {
    scoreRounds = snap.val() || {};
    scoreReady = true;
    scoreError = "";
    Object.keys(scoreRounds)
      .filter((event) => scoreRounds[event])
      .forEach((event) => {
        if (gamesEntryListeners[event] || !me) return;
        gamesEntryListeners[event] = true;
        gamesListen(`${SCORE_ROOT}/entries/${event}/${me.id}`, (s) => {
          scoreEntries[event] = s.val();
          scoreEntryReady[event] = true;
          if (me && S) render();
        });
      });
    if (me && S) render();
  });
  gamesListen(SCORE_ROOT + "/results", (snap) => {
    scoreResults = snap.val() || {};
    if (me && S) render();
  });
  gamesListen(SCORE_ROOT + "/paid", (snap) => {
    scorePaid = snap.val() || {};
    if (me && S) render();
  });
  if (me?.admin)
    gamesListen(SCORE_ROOT + "/entries", (snap) => {
      scoreAllEntries = snap.val() || {};
      if (me && S) render();
    });
}
function stopGamesListeners() {
  gamesListeners.forEach(({ ref, fn }) => ref.off("value", fn));
  gamesListeners = [];
  gamesEntryListeners = {};
  if (matchdayListening)
    matchdayListening.ref.off("value", matchdayListening.fn);
  matchdayListening = null;
  matchdayRecord = {};
  matchdayEvent = null;
  matchdayFocus = null;
  scoreRounds = {};
  scoreEntries = {};
  scoreResults = {};
  scorePaid = {};
  scoreAllEntries = {};
  scoreReady = false;
  scoreEntryReady = {};
  scoreDrafts = {};
  scoreBusy = false;
  scoreError = "";
}
function ensureMatchdayListener() {
  if (!me || !S || !gamesListeners.length) return;
  const g = LennonGames.selectGameweek(S, gamesNow(), matchdayEvent);
  if (!g || Number(matchdayListening?.event) === Number(g.event)) return;
  if (matchdayListening)
    matchdayListening.ref.off("value", matchdayListening.fn);
  matchdayRecord = {};
  const ref = db.ref(`${MATCHDAY_ROOT}/${g.event}`);
  const record = { ref, event: g.event, fn: null };
  matchdayListening = record;
  record.fn = ref.on(
    "value",
    (snap) => {
      if (matchdayListening !== record) return;
      matchdayRecord = snap.val() || {};
      if (me && S) render();
    },
    () => {
      matchdayRecord = { health: { ok: false } };
      if (me && S) render();
    },
  );
}
async function openScoreRound(g) {
  const round = LennonGames.makeRound(S, g, gamesNow());
  if (!round) return;
  await db
    .ref(`${SCORE_ROOT}/rounds/${g.event}`)
    .transaction((old) => (old ? undefined : round), undefined, false);
}
async function retryScoreRound(id) {
  if (!requireAdmin()) return;
  try {
    await openScoreRound(gw(id));
    toast("Free score game is ready.");
  } catch {
    toast("Could not open the free game. Please retry.", true);
  }
}
function currentScoreRound() {
  return (
    LennonGames.arr(scoreRounds).sort((a, b) => b.event - a.event)[0] || null
  );
}
function scoreDraft(event) {
  return (scoreDrafts[event] ||= { matchId: "", homePts: "", awayPts: "" });
}
function setScoreDraft(event, key, value) {
  scoreDraft(event)[key] = value;
  if (key === "matchId") render();
}
async function submitScorePrediction(event) {
  if (scoreBusy || !me || !scoreEntryReady[event]) return;
  const round = scoreRounds[event],
    draft = scoreDraft(event);
  if (round && oddsWithdrawn(round.gwId)) {
    toast(
      "Odds have been pulled back. The free game will reopen when they are released.",
      true,
    );
    return;
  }
  const entry = {
    matchId: draft.matchId,
    homePts: draft.homePts.trim() === "" ? NaN : Number(draft.homePts),
    awayPts: draft.awayPts.trim() === "" ? NaN : Number(draft.awayPts),
  };
  const error = LennonGames.entryError(
    round,
    entry,
    scoreEntries[event],
    gamesNow(),
  );
  if (error) {
    toast(error, true);
    return;
  }
  const fixture = round.fixtures[entry.matchId];
  if (
    !confirm(
      `Lock your free ${round.name} prediction?\n\n${gamesName(fixture.home)} ${entry.homePts} – ${entry.awayPts} ${gamesName(fixture.away)}\n\nThese are final FPL points. One entry per gameweek; you cannot change it. Both totals exactly right wins £50.`,
    )
  )
    return;
  scoreBusy = true;
  render();
  try {
    const ref = db.ref(`${SCORE_ROOT}/entries/${event}/${me.id}`);
    const saved = await ref.transaction(
      (old) =>
        old
          ? undefined
          : { ...entry, enteredAt: firebase.database.ServerValue.TIMESTAMP },
      undefined,
      false,
    );
    if (!saved.committed) {
      scoreEntries[event] = saved.snapshot.val();
      toast("Your prediction is already locked for this gameweek.", true);
    } else {
      scoreEntries[event] = saved.snapshot.val();
      delete scoreDrafts[event];
      toast("Prediction accepted — it’s in My Bets. Good luck! 🎯");
    }
  } catch {
    toast(
      "Entry was not confirmed. The deadline may have passed or you may already have entered. Refresh to check your entry.",
      true,
    );
  } finally {
    scoreBusy = false;
    render();
  }
}
// Render protected entries in the usual bet tabs; never duplicate them in mutable S.bets.
function scoreBets() {
  if (!me) return [];
  return LennonGames.arr(scoreRounds).flatMap((r) => {
    const entry = scoreEntries[r.event];
    if (!entry) return [];
    const outcome = scoreResults[r.event]?.outcomes?.[me.id];
    return [
      {
        id: "score_" + r.event + "_" + me.id,
        scoreGame: true,
        event: r.event,
        gwId: r.gwId,
        teamId: me.id,
        stake: 0,
        placedAt: entry.enteredAt,
        status: outcome ? (outcome.won ? "won" : "lost") : "accepted",
        round: r,
        entry,
        outcome,
      },
    ];
  });
}
function scoreBetCard(b) {
  const { round: r, entry: e, outcome: o } = b,
    f = r.fixtures[e.matchId],
    actual = scoreResults[r.event]?.scores?.[e.matchId],
    paid = scorePaid[r.event]?.[b.teamId];
  return `<div class="bet"><div class="top"><div><b>${teamLink(b.teamId)}</b> <span class="muted small">· ${esc(r.name)} · 🎯 £50 Score Shot</span><span class="flag limit">FREE ENTRY</span></div><span class="pill st-${b.status}">${o ? (o.won ? "WON 🎉" : "LOST") : "Accepted ✓"}</span></div><ul class="legs"><li>${esc(gamesName(f.home))} <b class="mono">${e.homePts}–${e.awayPts}</b> ${esc(gamesName(f.away))} · exact final FPL points${actual ? `<div class="legresult">Final: ${actual.homePts}–${actual.awayPts}</div>` : ""}</li></ul><div class="nums"><span>Stake<b class="mono">£0.00</b></span><span>${o ? "Prize won" : "Potential prize"}<b class="mono" style="color:var(--teal)">${GBP(o ? o.amountPence / 100 : r.prizePence / 100)}</b></span><span>Placed<b>${fmtDT(e.enteredAt)}</b></span>${o?.won ? `<span>Payout<b>${paid ? "Paid" : "Awaiting payout"}</b></span>` : ""}</div><p class="muted small">Automatically accepted before the cutoff. One locked entry per gameweek. £50 for every exact winner.</p><button class="btn secondary small" onclick="openMatchday(${r.event})">Follow on Matchday Live →</button></div>`;
}
function scoreOutcomeHtml(round, entry) {
  const outcome = scoreResults[round.event]?.outcomes?.[me.id];
  const f = round.fixtures[entry.matchId];
  const actual = scoreResults[round.event]?.scores?.[entry.matchId];
  return `<div class="sg-locked" role="status"><span class="sg-eyebrow">${outcome ? (outcome.won ? "BOTH SCORES. BANG ON." : "FINAL RESULT") : "YOUR PREDICTION IS LOCKED"}</span><div class="sg-score"><span>${esc(gamesName(f.home))}</span><strong>${entry.homePts}<i>–</i>${entry.awayPts}</strong><span>${esc(gamesName(f.away))}</span></div>${outcome ? `<p>${outcome.won ? `<b class="sg-win">You won ${GBP(outcome.amountPence / 100)}!</b> ${scorePaid[round.event]?.[me.id] ? "Paid by the house." : "The house will arrange your payout."}` : `Final score: <b>${actual.homePts}–${actual.awayPts}</b>. Another shot next gameweek.`}</p>` : "<p>Accepted ✓ · Saved in My Bets. Your next free entry opens when next gameweek’s odds go live.</p>"}<button class="btn secondary small" onclick="myBetsSec='${outcome ? (outcome.won ? "won" : "lost") : "active"}';go('mybets')">View in My Bets →</button> <button class="btn secondary small" onclick="openMatchday(${round.event})">Follow it on Matchday Live →</button></div>`;
}
function scoreHistoryHtml() {
  const rows = LennonGames.arr(scoreResults)
    .sort((a, b) => b.event - a.event)
    .filter((r) => r.outcomes?.[me.id]);
  if (!rows.length) return "";
  return `<details class="sg-history"><summary>Your previous predictions & prizes</summary>${rows
    .map((r) => {
      const o = r.outcomes[me.id];
      return `<p>GW ${r.event} · ${o.won ? `<b class="sg-win">${GBP(o.amountPence / 100)} won</b> · ${scorePaid[r.event]?.[me.id] ? "Paid" : "Awaiting payout"}` : "No exact score this week"}</p>`;
    })
    .join("")}</details>`;
}
function scoreGameHome() {
  const r = currentScoreRound(),
    now = gamesNow();
  let content;
  if (scoreError) content = `<p role="status">${esc(scoreError)}</p>`;
  else if (!scoreReady)
    content = '<p role="status">Checking your free entry…</p>';
  else if (!r)
    content =
      '<div class="sg-locked"><span class="sg-eyebrow">NEXT ROUND</span><h3>Your free shot is coming.</h3><p>It opens here as soon as the next gameweek’s odds are published.</p></div>';
  else if (!scoreEntryReady[r.event])
    content = '<p role="status">Checking your entry…</p>';
  else if (scoreEntries[r.event])
    content = scoreOutcomeHtml(r, scoreEntries[r.event]);
  else if (oddsWithdrawn(r.gwId))
    content =
      '<div class="sg-locked"><span class="sg-eyebrow">AWAITING ODDS</span><h3>This round is on hold.</h3><p>Your free shot reopens when the house releases the odds again.</p></div>';
  else if (r.status !== "open" || now >= r.cutoff)
    content = `<div class="sg-locked"><span class="sg-eyebrow">${esc(r.name)} · CLOSED</span><h3>The teams are in.</h3><p>You didn’t enter this round. Your next free shot opens when next gameweek’s odds go live.</p><button class="btn secondary small" onclick="openMatchday(${r.event})">Open Matchday Live →</button></div>`;
  else {
    const d = scoreDraft(r.event),
      f = r.fixtures[d.matchId];
    content = `<form class="sg-form" onsubmit="event.preventDefault();submitScorePrediction(${r.event})"><div class="sg-form-head"><b>${esc(r.name)}</b><span>Closes ${esc(fmtDT(r.cutoff))}</span></div><label for="sg-fixture">1. Pick your fixture</label><select id="sg-fixture" required onchange="setScoreDraft(${r.event},'matchId',this.value)"><option value="">Choose a matchup…</option>${Object.entries(
      r.fixtures,
    )
      .map(
        ([id, m]) =>
          `<option value="${esc(id)}" ${d.matchId === id ? "selected" : ""}>${esc(gamesName(m.home))} v ${esc(gamesName(m.away))}</option>`,
      )
      .join(
        "",
      )}</select><label>2. Guess both final FPL points totals</label><div class="sg-inputs"><div><label for="sg-home">${f ? esc(gamesName(f.home)) : "Home team"}</label><input id="sg-home" type="number" inputmode="numeric" step="1" min="-100" max="999" required placeholder="47" value="${esc(d.homePts)}" oninput="setScoreDraft(${r.event},'homePts',this.value)"></div><span>–</span><div><label for="sg-away">${f ? esc(gamesName(f.away)) : "Away team"}</label><input id="sg-away" type="number" inputmode="numeric" step="1" min="-100" max="999" required placeholder="39" value="${esc(d.awayPts)}" oninput="setScoreDraft(${r.event},'awayPts',this.value)"></div></div><p class="small muted">FPL points, not football goals. Both totals must be exactly right.</p><button type="submit" class="btn gold big" ${scoreBusy ? "disabled" : ""}>${scoreBusy ? "Locking your entry…" : "Lock my free prediction →"}</button><p class="small muted">One entry per manager, per gameweek. No edits after submission.</p></form>`;
  }
  return `<section class="sg-hero" aria-label="Free £50 score predictor"><div class="sg-pitch"><span class="sg-eyebrow">THE LENNON SCORE SHOT · FREE TO PLAY</span><h2>CALL THE SCORE.<br><span>TAKE THE £50.</span></h2><p>One fixture. Two FPL points totals.<br>Get both spot on and win <b>£50 cash.</b></p><div class="sg-tags"><span>No stake needed</span><span>£50 per exact winner</span><span>Every gameweek</span></div></div><div class="sg-panel">${content}</div><div class="sg-footer">Everyone gets one shot, including house managers. Final official FPL Draft scores decide the result. No winner? A fresh £50-per-winner game next week.${scoreHistoryHtml()}</div></section>`;
}
function scoreAdminHtml() {
  if (!me?.admin) return "";
  const missing = S.gameweeks.filter(
    (g) =>
      g.status === "open" &&
      !scoreRounds[g.event] &&
      LennonGames.makeRound(S, g, gamesNow()),
  );
  const rounds = LennonGames.arr(scoreRounds).sort((a, b) => b.event - a.event);
  return `<div class="card"><h3>🎯 Free £50 score game</h3><p class="muted small">One entry per manager per gameweek. Every exact winner receives £50 cash. Winners are graded automatically from official final FPL scores; prizes are separate from betting P&L.</p>${missing.map((g) => `<p>${esc(g.name)} odds are published but the free game needs opening. <button class="btn gold small" onclick="retryScoreRound('${g.id}')">Open free game</button></p>`).join("")}${
    rounds
      .map((r) => {
        const result = scoreResults[r.event],
          entries = scoreAllEntries[r.event] || {};
        return `<details class="sg-history"><summary>${esc(r.name)} · ${Object.keys(entries).length} entries · ${result ? result.winnerCount + " winners" : gamesNow() < r.cutoff ? "Open" : "Awaiting official final scores"}</summary>${
          Object.entries(entries)
            .map(([tid, e]) => {
              const f = r.fixtures[e.matchId],
                o = result?.outcomes?.[tid],
                paid = scorePaid[r.event]?.[tid];
              return `<div class="sg-admin-row"><div><b>${esc(gamesName(tid))}</b><p class="small muted">${esc(gamesName(f.home))} ${e.homePts}–${e.awayPts} ${esc(gamesName(f.away))}</p></div><div>${o?.won ? `<b class="sg-win">${GBP(o.amountPence / 100)}</b> ${paid ? '<span class="pill st-accepted">Paid</span>' : `<button class="btn gold small" onclick="markScorePrizePaid(${r.event},'${tid}')">Mark paid</button>`}` : o ? "No win" : "Locked"}</div></div>`;
            })
            .join("") || '<p class="muted small">No entries yet.</p>'
        }</details>`;
      })
      .join("") ||
    '<p class="muted small">The first round opens when odds are published.</p>'
  }</div>`;
}
async function markScorePrizePaid(event, tid) {
  if (!requireAdmin()) return;
  const o = scoreResults[event]?.outcomes?.[tid];
  if (!o?.won || scorePaid[event]?.[tid]) return;
  if (
    !confirm(
      `Confirm you have paid ${GBP(o.amountPence / 100)} to ${gamesName(tid)} for GW${event}? This records the payment; it does not send money.`,
    )
  )
    return;
  try {
    await db.ref(`${SCORE_ROOT}/paid/${event}/${tid}`).transaction(
      (old) =>
        old
          ? undefined
          : {
              paidAt: firebase.database.ServerValue.TIMESTAMP,
              paidBy: me.id,
            },
      undefined,
      false,
    );
    toast("Prize marked as paid.");
  } catch {
    toast("Payment could not be recorded. Please refresh and retry.", true);
  }
}
function openMatchday(event) {
  matchdayEvent = event || null;
  matchdayFocus = null;
  ensureMatchdayListener();
  go("matchday");
}
function matchdayHome() {
  const g = LennonGames.selectGameweek(S, gamesNow(), null);
  return `<section class="md-home"><div><span class="sg-eyebrow">YOUR WEEKEND, ALL IN ONE PLACE</span><h3>📺 Matchday Live</h3><p class="muted">All six matchups. Every score swing. Your players still to come.</p></div><button class="btn" onclick="openMatchday(${g ? g.event : "null"})">${g ? esc(g.name) + " · " : ""}Follow the action →</button></section>`;
}
function matchdayCard(g, m, current, forecast) {
  const live = current?.matches?.[m.id],
    h = forecast?.teams?.[m.home],
    a = forecast?.teams?.[m.away];
  const own = m.home === me.id || m.away === me.id;
  const probs =
    current && !current.reconciled
      ? null
      : live?.probabilities || forecast?.recommendations?.[m.id]?.probabilities;
  const ht = current?.teams?.[m.home],
    at = current?.teams?.[m.away];
  const status = current?.officiallyFinished
    ? "FINAL"
    : live
      ? current.active
        ? "IN PLAY"
        : "BETWEEN MATCHES"
      : "PREVIEW";
  const details = [
    [m.home, ht],
    [m.away, at],
  ]
    .map(([id, t]) =>
      t
        ? `<div><h4>${esc(gamesName(id))}</h4><table><tr><th>Player</th><th>Pts</th><th>Fixtures left</th></tr>${t.players.map((p) => `<tr class="${p.selected ? "" : "muted"}"><td>${esc(p.name)}${p.selected ? "" : " · bench"}</td><td>${p.points}</td><td>${p.remaining}${p.active ? " · playing" : ""}</td></tr>`).join("")}</table></div>`
        : "",
    )
    .join("");
  return `<article class="md-match ${own ? "md-own" : ""}"><div class="md-match-top"><span class="sg-eyebrow">${own ? "★ YOUR MATCHUP" : "THE LOUNGE"}</span><span class="md-status">${status}</span></div><div class="md-scoreline"><div><b>${esc(gamesName(m.home))}</b><span>${ht ? ht.remainingPlayers + " players with fixtures left" : "Home"}</span></div><strong>${live ? live.currentHome : "—"}<i>:</i>${live ? live.currentAway : "—"}</strong><div><b>${esc(gamesName(m.away))}</b><span>${at ? at.remainingPlayers + " players with fixtures left" : "Away"}</span></div></div>${h && a && (!current || current.reconciled) && !current?.officiallyFinished ? `<p class="md-projection">Projected finish <b>${h.proj.toFixed(1)} – ${a.proj.toFixed(1)}</b></p>` : ""}${probs ? `<div class="md-prob" aria-hidden="true"><span style="width:${probs.home * 100}%"></span><span style="width:${probs.draw * 100}%"></span><span style="width:${probs.away * 100}%"></span></div><div class="md-prob-label"><span>Home ${Math.round(probs.home * 100)}%</span><span>Draw ${Math.round(probs.draw * 100)}%</span><span>Away ${Math.round(probs.away * 100)}%</span></div>` : '<p class="muted small">Win probabilities unavailable until scores reconcile.</p>'}<div class="md-card-actions"><button class="btn secondary small" onclick="matchdayFocus='${m.id}';render();document.getElementById('md-timeline').scrollIntoView({behavior:'smooth'})">Score timeline ↗</button>${details ? `<details><summary>Players & points</summary><div class="md-player-tables">${details}</div></details>` : '<span class="small muted">Players appear after the first matchday refresh.</span>'}</div></article>`;
}
function matchdayTimeline(g, current) {
  const m =
    g.matches.find((m) => m.id === matchdayFocus) ||
    g.matches.find((m) => m.home === me.id || m.away === me.id) ||
    g.matches[0];
  if (!m) return "";
  const history = LennonGames.arr(matchdayRecord.history);
  const changes = history
    .map((row, i) => {
      const x = row.matches?.[m.id],
        prev = history[i - 1]?.matches?.[m.id];
      if (
        !x ||
        (prev &&
          x.homePts === prev.homePts &&
          x.awayPts === prev.awayPts &&
          Math.abs((x.homeChance || 0) - (prev.homeChance || 0)) < 0.02)
      )
        return "";
      const delta =
        prev && x.homeChance !== null && prev.homeChance !== null
          ? Math.round((x.homeChance - prev.homeChance) * 100)
          : null;
      return `<li><time>${esc(new Date(row.at).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit" }))}</time><div><b>${x.homePts} – ${x.awayPts}</b><p>${!prev ? "First recorded snapshot" : x.homePts !== prev.homePts || x.awayPts !== prev.awayPts ? "Score update" : "Forecast update"}${x.homeChance !== null ? ` · Home win ${Math.round(x.homeChance * 100)}%${delta ? ` (${delta > 0 ? "+" : ""}${delta} percentage points)` : ""}` : ""}</p></div></li>`;
    })
    .filter(Boolean)
    .reverse()
    .slice(0, 24);
  return `<section id="md-timeline" class="card md-timeline"><span class="sg-eyebrow">HOW THE MATCH TURNED</span><h3>Score timeline</h3><label for="md-focus" class="muted small">Follow a fixture</label><select id="md-focus" onchange="matchdayFocus=this.value;render()">${g.matches.map((f) => `<option value="${f.id}" ${f.id === m.id ? "selected" : ""}>${esc(gamesName(f.home))} v ${esc(gamesName(f.away))}</option>`).join("")}</select>${changes.length ? `<ol>${changes.join("")}</ol>` : '<p class="muted">The timeline starts with the first matchday snapshot. Score changes will appear here as FPL updates.</p>'}<p class="small muted">Recorded snapshots, not a goal-by-goal feed. Times show when scores were fetched.</p></section>`;
}
function vMatchday() {
  const g = LennonGames.selectGameweek(S, gamesNow(), matchdayEvent);
  const weeks = S.gameweeks
    .filter((g) => g.event && g.status !== "draft")
    .sort((a, b) => b.event - a.event);
  if (!g)
    return '<h2>Matchday Live</h2><div class="card"><p>The matchups appear when odds are published. Come back for the next gameweek.</p></div>';
  const current =
    Number(matchdayRecord.current?.event) === Number(g.event)
      ? matchdayRecord.current
      : null;
  const forecast = current?.forecast || g.forecast || modelForecast(S, g.event);
  const stale =
    current &&
    !current.officiallyFinished &&
    gamesNow() - current.source.fetchedAt > 15 * 60000;
  const matches = [...g.matches].sort(
    (a, b) =>
      Number(b.home === me.id || b.away === me.id) -
      Number(a.home === me.id || a.away === me.id),
  );
  return `<div class="md-heading"><div><span class="sg-eyebrow">THE WEEKEND BELONGS TO THE LOUNGE</span><h2>Matchday Live<span class="md-dot"></span></h2><p class="muted">Six matchups. One place to follow it all.</p></div><div><label for="md-event" class="small muted">Gameweek</label><select id="md-event" onchange="openMatchday(Number(this.value))">${weeks.map((w) => `<option value="${w.event}" ${w.event === g.event ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select></div></div><div class="md-fresh ${stale || matchdayRecord.health?.ok === false ? "md-stale" : ""}">${current ? `${current.officiallyFinished ? "Final FPL results" : "Provisional FPL scores"} · Fetched ${esc(fmtDT(current.source.fetchedAt))}${stale ? " · UPDATE DELAYED" : ""}` : "Waiting for the first matchday score update. Pre-match forecasts are shown below."}${matchdayRecord.health?.ok === false ? "<br>Latest refresh failed. The last successful snapshot is retained." : ""}${current && !current.reconciled ? "<br>Team and player totals are still reconciling. Updated forecasts are temporarily hidden." : ""}<span>Refreshes are scheduled around every five minutes during a gameweek; FPL and scheduling delays are possible.</span></div><div class="md-grid">${matches.map((m) => matchdayCard(g, m, current, forecast)).join("")}</div>${matchdayTimeline(g, current)}<p class="muted small md-note">Players left counts the current fantasy XI, including expected automatic substitutes, with unfinished Premier League fixtures. Selections and bonus points can change. Win probabilities are model estimates, not betting prices.</p>`;
}
