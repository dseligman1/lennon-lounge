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
  // Change-only save plus the gate in one atomic update; only what changed is sent, so a player's
  // bet placed while the admin reviews odds is never touched.
  await saveNow({ [PUBLICATION_ROOT + "/" + g.id]: gate });
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
    const next = S.gameweeks.find((g) => g.id === id);
    if (!next || next.status !== "open") return;
    if (keepLive) next.normalOff = true;
    else next.status = "draft";
    delete next.oddsReleasedAt;
    delete next.inplayCutoff;
    S.promos.forEach((p) => {
      if (p.gwId === id) p.active = false;
    });
    audit("odds withdrawn", g.name + " — existing bets retained");
    const gate = { status: "withdrawn", at: now, by: me.id };
    await saveNow({ [PUBLICATION_ROOT + "/" + id]: gate });
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
