const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("./server");

const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${s.address().port}`)));
const now = () => new Date("2026-11-16T03:00:00Z"); // Mon 10:00 WIB
const body = (o = {}) => ({
  date: "2026-11-16", status: "PRESENT", latitude: -6.2, longitude: 106.8, location: "Jakarta",
  activity_log: "a", lesson_learned: "b", obstacles: "c", ...o,
});

let stub, stubUrl, mock, base, dataFile;
before(async () => {
  stub = http.createServer((req, res) => {
    const a = req.headers.authorization;
    res.statusCode = a === "Bearer good" ? 200 : a === "Bearer boom" ? 500 : 401;
    res.end("{}");
  });
  stubUrl = await listen(stub);
  dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "monev-")), "sub", "monev.json");
  mock = createServer({ authUrl: stubUrl, dataFile, now });
  base = await listen(mock);
});
after(() => { stub.close(); mock.close(); });

const call = (method, p, { token = "good", email = "a@x.id", raw, json } = {}) =>
  fetch(base + p, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(email && { "cf-access-authenticated-user-email": email }),
    },
    body: raw ?? (json && JSON.stringify(json)),
  }).then(async (r) => ({ status: r.status, text: await r.text() })).then((r) => {
    try { r.json = JSON.parse(r.text); } catch {}
    return r;
  });
const post = (json, o) => call("POST", "/attendances/with-daily-log", { json, ...o });

test("health needs no auth", async () => {
  const r = await call("GET", "/health", { token: null, email: null });
  assert.deepStrictEqual([r.status, r.text], [200, "ok"]);
});

test("rejects missing token", async () => {
  assert.strictEqual((await call("GET", "/daily-logs", { token: null })).status, 401);
});

test("rejects missing access email", async () => {
  assert.strictEqual((await call("GET", "/daily-logs", { email: null })).status, 401);
});

test("fails closed when shelia errors", async () => {
  assert.strictEqual((await post(body({ date: "2026-11-17" }), { token: "boom" })).status, 502);
  assert.strictEqual((await call("GET", "/daily-logs")).json.total, 0);
});

test("502 when shelia never answers", async () => {
  const hang = http.createServer(() => {});
  const m = createServer({ authUrl: await listen(hang), dataFile: path.join(os.tmpdir(), "monev-hang.json"), now, authTimeoutMs: 100 });
  const t = Date.now();
  const r = await fetch((await listen(m)) + "/daily-logs", { headers: { Authorization: "Bearer slow", "cf-access-authenticated-user-email": "a@x.id" } });
  assert.strictEqual(r.status, 502);
  assert.ok(Date.now() - t < 2000);
  m.close(); hang.closeAllConnections(); hang.close();
});

test("failed save leaves nothing behind", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "monev-ro-"));
  const m = createServer({ authUrl: stubUrl, dataFile: path.join(dir, "monev.json"), now });
  const b = await listen(m);
  const h = { Authorization: "Bearer good", "cf-access-authenticated-user-email": "a@x.id" };
  const get = () => fetch(b + "/daily-logs", { headers: h }).then((r) => r.json());
  const put = () => fetch(b + "/attendances/with-daily-log", { method: "POST", headers: h, body: JSON.stringify(body()) });
  await get();
  fs.chmodSync(dir, 0o500);
  try {
    assert.strictEqual((await put()).status, 500);
    assert.strictEqual((await get()).total, 0);
    fs.chmodSync(dir, 0o700);
    assert.strictEqual((await put()).status, 201);
  } finally { fs.chmodSync(dir, 0o700); m.close(); }
});

test("stores present entry", async () => {
  const r = await post(body());
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.json.message, "Absensi berhasil disimpan");
  assert.strictEqual(r.json.data.clock_in, "10:00");
  assert.deepStrictEqual(r.json.data.anomalies, []);
});

test("duplicate date is 409", async () => {
  const r = await post(body());
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.json.message, "Absensi untuk tanggal ini sudah ada");
});

test("flags anomalies", async () => {
  assert.deepStrictEqual((await post(body({ date: "2026-11-14" }))).json.data.anomalies, ["weekend", "backdated"]);
  assert.deepStrictEqual((await post(body({ date: "2026-12-25" }))).json.data.anomalies, ["holiday", "future"]);
});

test("validates", async () => {
  assert.strictEqual((await post(undefined, { raw: "{nope" })).status, 400);
  assert.strictEqual((await post(undefined, { raw: "[1]" })).status, 400);
  assert.strictEqual((await post(body({ date: "2026-02-30" }))).status, 422);
  assert.strictEqual((await post(body({ date: "2026-11-18", activity_log: "  " }))).status, 422);
  assert.strictEqual((await post(body({ date: "2026-11-18", status: "NOPE" }))).status, 422);
  const sick = await post({ date: "2026-11-18", status: "SICK", latitude: 0, longitude: 0, location: "x" });
  assert.strictEqual(sick.status, 201);
  assert.strictEqual((await post(undefined, { raw: "x".repeat(70000) })).status, 413);
});

test("partitions by email", async () => {
  assert.strictEqual((await call("GET", "/daily-logs", { email: "b@x.id" })).json.total, 0);
});

test("lists newest first", async () => {
  const r = await call("GET", "/daily-logs?page=1");
  assert.strictEqual(r.json.page, 1);
  assert.strictEqual(r.json.data[0].date, "2026-12-25");
});

test("persists", async () => {
  const m2 = createServer({ authUrl: stubUrl, dataFile, now });
  const r = await fetch((await listen(m2)) + "/daily-logs", { headers: { Authorization: "Bearer good", "cf-access-authenticated-user-email": "a@x.id" } });
  assert.ok((await r.json()).data.some((e) => e.date === "2026-11-16"));
  m2.close();
});

test("holidays lists 2026-12-25", async () => {
  const r = await call("GET", "/holidays?page=1&limit=100");
  assert.ok(r.json.data.some((h) => h.date === "2026-12-25" && h.type === "NATIONAL" && h.scope === "NATIONAL"));
  assert.ok(r.json.total >= 16);
});
