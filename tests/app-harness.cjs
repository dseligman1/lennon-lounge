const fs = require("node:fs"),
  vm = require("node:vm");
module.exports = function (state) {
  const html = fs.readFileSync(require.resolve("../index.html"), "utf8"),
    src = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const noop = () => {},
    node = () => ({
      style: {},
      classList: {
        add: noop,
        remove: noop,
        toggle: noop,
        contains: () => false,
      },
      addEventListener: noop,
      querySelectorAll: () => [],
      appendChild: noop,
      remove: noop,
      setAttribute: noop,
      innerHTML: "",
      value: "",
      getBoundingClientRect: () => ({ width: 1000, height: 1414 }),
    });
  const store = { getItem: () => null, setItem: noop, removeItem: noop },
    ref = () => ({
      on: noop,
      off: noop,
      set: async () => {},
      update: async () => {},
      once: async () => ({ val: () => null }),
      push: () => ({ set: async () => {} }),
    });
  const ctx = {
    console,
    URL,
    URLSearchParams,
    Date,
    Math,
    JSON,
    Map,
    Set,
    WeakMap,
    Promise,
    Number,
    String,
    Array,
    Object,
    Intl,
    Blob,
    TextEncoder,
    Uint8Array,
    structuredClone,
    LennonModel: require("../odds-model.js"),
    LennonInPlay: require("../in-play-market.js"),
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
    alert: noop,
    confirm: () => true,
    location: { href: "https://example.test/", search: "", pathname: "/" },
    navigator: { userAgent: "test" },
    localStorage: store,
    sessionStorage: store,
    history: { replaceState: noop },
    document: {
      readyState: "loading",
      addEventListener: noop,
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: node,
      body: node(),
      head: node(),
    },
    firebase: {
      initializeApp: noop,
      database: () => ({ ref }),
      auth: () => ({ currentUser: null, onAuthStateChanged: noop }),
    },
  };
  ctx.window = ctx;
  ctx.window.addEventListener = noop;
  ctx.window.matchMedia = () => ({ matches: false, addEventListener: noop });
  ctx.screen = { width: 390 };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(require.resolve("../in-play-ui.js"), "utf8"),
    ctx,
  );
  vm.runInContext(src, ctx);
  ctx.input = structuredClone(state);
  vm.runInContext(
    "S={...freshState(),...input}; S.settings={...DEFAULT_SETTINGS,...input.settings}; S.sim={events:{},...S.sim}; me=TEAMS[0];",
    ctx,
  );
  return { ctx, run: (code) => vm.runInContext(code, ctx), html };
};
