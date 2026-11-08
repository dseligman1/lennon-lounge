/* One-off (2026-11-08): converts lists still stored the old way (arrays) into keyed-by-id storage,
 * which change-only saving and the database rules need. Safe to re-run: does nothing once
 * converted. Dry run by default; set MIGRATE_APPLY=true to write. Runs as the service account. */
const St = require("../storage.js"),
  { database, accessToken } = require("./in-play.cjs");
const getAt = (o, p) =>
  p.split("/").reduce((x, k) => (x == null ? x : x[k]), o);
const count = (v) => (v == null ? 0 : Object.keys(v).length);
async function main() {
  const token = await accessToken(JSON.parse(process.env.FIREBASE_SERVICE_KEY)),
    db = database(process.env.FIREBASE_DB_URL, token),
    apply = process.env.MIGRATE_APPLY === "true";
  const raw = await db("lennon-lounge");
  const legacy = St.legacyPaths(raw);
  if (!legacy.length) {
    console.log("Already converted: every list is keyed by id. Nothing to do.");
    return;
  }
  const stored = St.toStored(St.normalise(structuredClone(raw)));
  const patch = {};
  for (const path of legacy) {
    patch[path] = getAt(stored, path);
    const before = count(getAt(raw, path)),
      after = count(patch[path]);
    console.log(`${path}: ${before} item(s) -> ${after} keyed item(s)`);
    if (path === "bets" && after < before)
      console.log(
        `  ${before - after} duplicate bet id(s) merged (same as the app's dedupe)`,
      );
  }
  if (!apply) {
    console.log("Dry run only. Re-run with apply ticked to write.");
    return;
  }
  await db("lennon-lounge", "PATCH", patch);
  const check = St.legacyPaths(await db("lennon-lounge"));
  if (check.length)
    throw Error("Still in the old format after writing: " + check.join(", "));
  console.log("Converted and verified.");
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
