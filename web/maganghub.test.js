const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "maganghub.js"), "utf8");
const fake = () => new Proxy(function () {}, { get: (_, k) => (k === "value" ? "" : fake()), set: () => true, apply: () => fake() });
const { takeTokenFromHash, bookmarkletHref } = (() => {
  const m = { exports: {} };
  vm.runInNewContext(SRC, { module: m, document: { getElementById: fake }, location: { hash: "", hostname: "x" }, localStorage: { getItem: () => null }, fetch: () => new Promise(() => {}), console });
  return m.exports;
})();

const ORIGIN = "https://test-shelia.holo.my.id";
function runBookmarklet(token) {
  const calls = { open: [], alert: [] };
  const ctx = vm.createContext({
    sessionStorage: { getItem: (k) => (k === "monev_access_token" ? token : null) },
    window: { open: (...a) => calls.open.push(a) },
    alert: (m) => calls.alert.push(m),
    encodeURIComponent,
  });
  const href = bookmarkletHref(ORIGIN);
  assert.ok(href.startsWith("javascript:"));
  vm.runInContext(decodeURIComponent(href.slice(11)), ctx);
  return calls;
}

test("takes token from hash", () => {
  assert.strictEqual(takeTokenFromHash("#mh=abc%2B1"), "abc+1");
  assert.strictEqual(takeTokenFromHash(""), null);
  assert.strictEqual(takeTokenFromHash("#x=1"), null);
});

test("bookmarklet reads monev_access_token and opens fragment URL", () => {
  const c = runBookmarklet("tok/1");
  assert.deepStrictEqual(c.open, [[ORIGIN + "/#mh=tok%2F1", "_blank", "noopener"]]);
  assert.strictEqual(c.alert.length, 0);
});

test("bookmarklet alerts when logged out", () => {
  const c = runBookmarklet(null);
  assert.strictEqual(c.open.length, 0);
  assert.deepStrictEqual(c.alert, ["Login MagangHub dulu"]);
});

test("maganghub.js does not clobber Shelia's top-level bindings", () => {
  const ctx = vm.createContext({
    document: { getElementById: fake },
    location: { hash: "", hostname: "x", pathname: "/", search: "" },
    history: { replaceState() {} },
    localStorage: { getItem: () => null },
    fetch: () => new Promise(() => {}),
    console,
  });
  ctx.window = ctx;
  vm.runInContext('const $ = () => "shelia"; function api(){ return "shelia-api"; } function render(){ return "shelia-render"; }', ctx);
  vm.runInContext(SRC, ctx);
  assert.strictEqual(vm.runInContext("api()", ctx), "shelia-api");
  assert.strictEqual(vm.runInContext("render()", ctx), "shelia-render");
  assert.strictEqual(vm.runInContext("$()", ctx), "shelia");
});
