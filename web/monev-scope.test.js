const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// monev.js is injected after Shelia's app.js: it must not collide with Shelia's globals.
test("monev.js does not clobber Shelia's top-level bindings", () => {
  const fake = () => new Proxy(function () {}, { get: (_, k) => (k === "value" ? "" : fake()), set: () => true, apply: () => fake() });
  const ctx = vm.createContext({
    document: { getElementById: fake },
    localStorage: { getItem: () => null },
    fetch: () => new Promise(() => {}),
    Date, console,
  });
  ctx.window = ctx;
  vm.runInContext('const $ = () => "shelia"; function api(){ return "shelia-api"; } function render(){ return "shelia-render"; }', ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "monev.js"), "utf8"), ctx);
  assert.strictEqual(vm.runInContext("api()", ctx), "shelia-api");
  assert.strictEqual(vm.runInContext("render()", ctx), "shelia-render");
  assert.strictEqual(vm.runInContext("$()", ctx), "shelia");
  assert.strictEqual(vm.runInContext("typeof monevRefresh", ctx), "function");
});
