/* Change-only saving (2026-11-08). The app used to rewrite the whole `lennon-lounge` tree on every
 * save, so a tab holding old data could silently undo newer changes made elsewhere. Now each save
 * sends only the paths this device actually changed, and lists that several people add to at once
 * (bets, chat, the activity log, promo grants and rewards, usage events) are stored keyed by each
 * item's id, so two people adding at the same moment can never land on the same slot.
 * Shared by the app, the one-off conversion script and the tests. No browser or network code. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LennonStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Keyed lists: path inside the state tree, the field used to keep them in time order, id prefix.
  const KEYED = [
    { path: ["bets"], time: "placedAt", prefix: "bet" },
    { path: ["chat"], time: "at", prefix: "chat" },
    { path: ["audit"], time: "at", prefix: "aud" },
    { path: ["rewardGrants"], time: "at", prefix: "grant" },
    { path: ["usage", "events"], time: "at", prefix: "ev" },
    { path: ["rewards", "*"], time: "grantedAt", prefix: "rwd" },
  ];
  const BAD_KEY = /[.#$/[\]]/;
  const toArr = (v) =>
    v == null ? [] : Array.isArray(v) ? v : Object.values(v);
  const isObj = (v) => v !== null && typeof v === "object";
  function newId(prefix, now = Date.now()) {
    return (
      prefix +
      "_" +
      now.toString(36) +
      Math.random().toString(36).slice(2, 7).padEnd(5, "0")
    );
  }
  // Every concrete keyed list in a tree: [{path:[...], spec}], expanding rewards/* per team.
  function lists(state) {
    const out = [];
    for (const spec of KEYED) {
      if (spec.path[1] === "*") {
        const parent = state?.[spec.path[0]];
        if (isObj(parent))
          for (const k of Object.keys(parent))
            out.push({ path: [spec.path[0], k], spec });
      } else out.push({ path: spec.path, spec });
    }
    return out;
  }
  const getAt = (o, path) =>
    path.reduce((x, k) => (isObj(x) ? x[k] : undefined), o);
  function setAt(o, path, v) {
    let x = o;
    for (const k of path.slice(0, -1)) x = x[k];
    x[path.at(-1)] = v;
  }
  // In memory every keyed list is an array in time order with an id on every item.
  // fresh=false (loading): items stored before ids existed get a stable id from their position.
  // fresh=true (saving): new items get a new unique id.
  function normalise(state, { fresh = false } = {}) {
    if (!isObj(state)) return state;
    for (const { path, spec } of lists(state)) {
      if (getAt(state, path) == null) continue;
      const seen = new Map();
      toArr(getAt(state, path)).forEach((item, i) => {
        if (!isObj(item)) return;
        if (typeof item.id !== "string" || !item.id || BAD_KEY.test(item.id))
          item.id = fresh ? newId(spec.prefix) : `${spec.prefix}_L${i}`;
        seen.set(item.id, item); // later duplicates win, as the old dedupe did
      });
      const items = [...seen.values()]
        .map((item, i) => ({ item, i }))
        .sort(
          (a, b) =>
            (Number(a.item[spec.time]) || 0) -
              (Number(b.item[spec.time]) || 0) || a.i - b.i,
        )
        .map((x) => x.item);
      setAt(state, path, items);
    }
    return state;
  }
  // The shape written to Firebase: keyed lists become {id: item}. Shallow copies only.
  function toStored(state) {
    if (!isObj(state)) return state;
    const out = { ...state };
    if (isObj(out.usage)) out.usage = { ...out.usage };
    if (isObj(out.rewards)) out.rewards = { ...out.rewards };
    for (const { path } of lists(out)) {
      const v = getAt(out, path);
      if (v == null) continue;
      setAt(
        out,
        path,
        Object.fromEntries(
          toArr(v)
            .filter((x) => isObj(x) && x.id)
            .map((x) => [x.id, x]),
        ),
      );
    }
    return out;
  }
  // Keyed lists still stored the old way (an array, or keys that aren't the items' ids).
  function legacyPaths(raw) {
    return lists(raw || {})
      .filter(({ path }) => {
        const v = getAt(raw, path);
        if (v == null) return false;
        if (Array.isArray(v)) return v.length > 0;
        return Object.entries(v).some(([k, x]) => !isObj(x) || x.id !== k);
      })
      .map(({ path }) => path.join("/"));
  }
  // Firebase treats null, missing, [] and {} as the same thing.
  function norm(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === "number" && !Number.isFinite(v)) return null;
    if (isObj(v) && !Object.keys(v).some((k) => norm(v[k]) !== null))
      return null;
    return v;
  }
  // Containers that are always written item by item (so a player's write lands on their own
  // item's path, which is what the database rules check), never as a whole.
  const CONTAINER =
    /^(|bets|chat|audit|rewardGrants|usage|usage\/events|rewards|rewards\/[^/]+)$/;
  function walk(next, prev, path, out) {
    const a = norm(next),
      b = norm(prev);
    if (a === b) return;
    const container = CONTAINER.test(path);
    if ((isObj(a) && isObj(b)) || (container && (isObj(a) || isObj(b)))) {
      const keys = new Set([
        ...Object.keys(isObj(a) ? a : {}),
        ...Object.keys(isObj(b) ? b : {}),
      ]);
      for (const k of keys)
        walk(
          isObj(a) ? a[k] : undefined,
          isObj(b) ? b[k] : undefined,
          path ? path + "/" + k : k,
          out,
        );
      return;
    }
    if (!isObj(a) && !isObj(b) && a === b) return;
    out[path] = a === null ? null : clean(a);
  }
  // Drops values Firebase can't store (undefined, NaN, functions) from a value being written.
  function clean(v) {
    if (!isObj(v)) return v;
    const out = Array.isArray(v) ? [] : {};
    for (const [k, x] of Object.entries(v)) {
      const c = norm(x) === null ? null : clean(x);
      if (c !== null) out[k] = c;
    }
    return out;
  }
  // Paths (relative to the state root) whose value differs between two in-memory states.
  // `legacy` lists are rewritten whole in the keyed shape, which converts them.
  function diff(nextState, prevState, legacy = []) {
    const next = toStored(nextState),
      prev = toStored(prevState),
      out = {};
    walk(next, prev, "", out);
    for (const L of legacy) {
      const under = (k) => k === L || k.startsWith(L + "/");
      if (Object.keys(out).some((k) => L.startsWith(k + "/"))) continue;
      for (const k of Object.keys(out)) if (under(k)) delete out[k];
      const v = norm(getAt(next, L.split("/")));
      out[L] = v === null ? null : clean(v);
    }
    return out;
  }
  // What a non-admin's device may send; mirrors database.rules.json. Anything else is shared data
  // only the house can change, so it stays on that device instead of failing the whole save.
  function playerMayWrite(path, teamId) {
    const p = path.split("/");
    if (p[0] === "usage") return true;
    if (["bets", "chat", "audit", "rewardGrants"].includes(p[0]))
      return p.length >= 2;
    if (p[0] === "rewards") return p[1] === teamId && p.length >= 3;
    return false;
  }
  return {
    KEYED,
    newId,
    normalise,
    toStored,
    legacyPaths,
    diff,
    playerMayWrite,
  };
});
