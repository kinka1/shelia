const test = require("node:test");
const assert = require("node:assert");

const events = [];
let impl;
globalThis.window = globalThis;
globalThis.location = new URL("http://localhost/");
globalThis.document = { readyState: "loading", addEventListener() {} }; // UI never mounts
globalThis.CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o.detail; } };
globalThis.dispatchEvent = (e) => events.push(e);
globalThis.fetch = (...a) => impl(...a);
require("./api-log.js");
const wrapped = globalThis.fetch;
const tick = () => new Promise((r) => setTimeout(r, 20));

test("app-shaped call: same response, logged and redacted", async () => {
  events.length = 0;
  impl = async () => new Response(JSON.stringify({ data: { token: "t" } }), { status: 200 });
  const res = await wrapped("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "a", password: "p" }) });
  assert.deepStrictEqual(await res.json(), { data: { token: "t" } });
  await tick();
  assert.strictEqual(events.length, 1);
  const d = events[0].detail;
  assert.strictEqual(d.path, "/api/auth/login");
  assert.strictEqual(d.request.body.password, "***");
  assert.strictEqual(d.response.data.token, "***");
  assert.strictEqual(d.status, 200);
});

test("rejection propagates and is logged", async () => {
  events.length = 0;
  const err = new TypeError("boom");
  impl = () => Promise.reject(err);
  await assert.rejects(wrapped("/api/x"), (e) => e === err);
  await tick();
  assert.strictEqual(events.length, 1);
  assert.ok(events[0].detail.error);
});

test("non-JSON response stays readable", async () => {
  events.length = 0;
  impl = async () => new Response("<html>", { status: 502 });
  const res = await wrapped("/api/x");
  assert.strictEqual(await res.text(), "<html>");
  await tick();
  assert.strictEqual(events[0].detail.response, "<html>");
  assert.strictEqual(events[0].detail.status, 502);
});

test("non-api and Request/URL inputs pass through", async () => {
  events.length = 0;
  impl = async () => new Response("ok");
  await wrapped("/other");
  await wrapped(new URL("http://localhost/api/y"));
  await wrapped(new Request("http://localhost/api/z", { method: "POST", body: "{}" }));
  await tick();
  assert.deepStrictEqual(events.map((e) => e.detail.path), ["/api/y", "/api/z"]);
});
