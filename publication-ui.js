/* Admin-owned publication gates survive stale legacy whole-state saves. */
const PUBLICATION_ROOT = "lennon-lounge-publication";
let publicationState = {},
  publicationListener = null;
function oddsWithdrawn(id) {
  return publicationState[id]?.status === "withdrawn";
}
function startPublicationListener() {
  if (publicationListener) return;
  publicationListener = db.ref(PUBLICATION_ROOT).on(
    "value",
    (snap) => {
      publicationState = snap.val() || {};
      if (me && S) render();
    },
    () => {
      publicationListener = null; // Firebase has dropped it; allow a restart on next login
    },
  );
}
function stopPublicationListener() {
  if (publicationListener)
    db.ref(PUBLICATION_ROOT).off("value", publicationListener);
  publicationListener = null;
  publicationState = {};
}
async function savePublishedGw(g) {
  const gate = { status: "published", at: Date.now(), by: me.id };
  // Leave the bets branch untouched: a player may submit while the admin reviews odds.
  await db.ref().update({
    [ROOT + "/gameweeks"]: S.gameweeks,
    [ROOT + "/promos"]: S.promos,
    [ROOT + "/audit"]: S.audit,
    [ROOT + "/seq"]: S.seq,
    [PUBLICATION_ROOT + "/" + g.id]: gate,
  });
  publicationState[g.id] = gate;
}
async function withdrawOdds(id) {
  if (!requireAdmin()) return;
  const g = gw(id);
  if (!g || g.status !== "open") return;
  if (
    !confirm(
      `Pull back ${g.name} normal odds?\n\nNormal pre-match betting closes and the free game pauses. In-play odds are separate and stay as they are (pull those back on their own card). Existing bets and predictions stay valid.`,
    )
  )
    return;
  const now = Date.now();
  try {
    // In-play is independent (2026-11-07): it is left untouched. If the week already has in-play
    // activity or bets it stays live (normal odds off) so results and settlement still track it.
    const record = (await db.ref(INPLAY_ROOT + "/" + id).once("value")).val();
    const keepLive =
      !!record?.published || S.bets.some((b) => b.gwId === id && b.inplay);
    const gameweeks = structuredClone(S.gameweeks),
      next = gameweeks.find((g) => g.id === id);
    if (!next || next.status !== "open") return;
    if (keepLive) next.normalOff = true;
    else next.status = "draft";
    delete next.oddsReleasedAt;
    delete next.inplayCutoff;
    const promos = S.promos.map((p) =>
      p.gwId === id ? { ...p, active: false } : p,
    );
    const auditLog = [
      ...S.audit,
      {
        at: now,
        by: me.id,
        action: "odds withdrawn",
        detail: g.name + " — existing bets retained",
      },
    ].slice(-500);
    const gate = { status: "withdrawn", at: now, by: me.id };
    const updates = {
      [ROOT + "/gameweeks"]: gameweeks,
      [ROOT + "/promos"]: promos,
      [ROOT + "/audit"]: auditLog,
      [PUBLICATION_ROOT + "/" + id]: gate,
    };
    await db.ref().update(updates);
    S.gameweeks = gameweeks;
    S.promos = promos;
    S.audit = auditLog;
    publicationState[id] = gate;
    slip = slip.filter((l) => l.gwId !== id || l.marketRevision);
    slipBundles = slipBundles.filter((b) => b.gwId !== id);
    render();
    toast("Odds returned to draft. Existing bets remain valid.");
  } catch (e) {
    render();
    toast("Could not withdraw odds: " + e.message, true);
  }
}
