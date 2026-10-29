/* Admin-owned publication gates survive stale legacy whole-state saves. */
const PUBLICATION_ROOT = "lennon-lounge-publication";
let publicationState = {},
  publicationListener = null;
function oddsWithdrawn(id) {
  return publicationState[id]?.status === "withdrawn";
}
function startPublicationListener() {
  if (publicationListener) return;
  publicationListener = db.ref(PUBLICATION_ROOT).on("value", (snap) => {
    publicationState = snap.val() || {};
    if (me && S) render();
  });
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
  await db
    .ref()
    .update({
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
      `Pull back ${g.name} odds?\n\nNormal and in-play betting will close, and the free game will pause. Existing bets and predictions stay valid. Prices return to draft for review and re-release.`,
    )
  )
    return;
  const now = Date.now();
  try {
    // Read the latest in-play draft before returning it to review.
    const record = (await db.ref(INPLAY_ROOT + "/" + id).once("value")).val();
    const gameweeks = structuredClone(S.gameweeks),
      next = gameweeks.find((g) => g.id === id);
    if (!next || next.status !== "open") return;
    next.status = "draft";
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
    if (record)
      updates[INPLAY_ROOT + "/" + id] = LennonInPlay.withdrawRecord(
        record,
        now,
        me.id,
      );
    await db.ref().update(updates);
    S.gameweeks = gameweeks;
    S.promos = promos;
    S.audit = auditLog;
    publicationState[id] = gate;
    if (record) inPlayState[id] = updates[INPLAY_ROOT + "/" + id];
    slip = slip.filter((l) => l.gwId !== id);
    slipBundles = slipBundles.filter((b) => b.gwId !== id);
    render();
    toast("Odds returned to draft. Existing bets remain valid.");
  } catch (e) {
    render();
    toast("Could not withdraw odds: " + e.message, true);
  }
}
