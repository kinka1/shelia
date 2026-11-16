const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// ponytail: mock data, 2026 only; edit the list when the year changes.
const HOLIDAYS = [
  ["2026-01-01", "Tahun Baru Masehi"], ["2026-01-16", "Isra Mikraj Nabi Muhammad SAW"],
  ["2026-02-17", "Tahun Baru Imlek"], ["2026-03-19", "Hari Suci Nyepi"],
  ["2026-03-20", "Idul Fitri"], ["2026-03-21", "Idul Fitri"], ["2026-04-03", "Wafat Yesus Kristus"],
  ["2026-05-01", "Hari Buruh Internasional"], ["2026-05-14", "Kenaikan Yesus Kristus"],
  ["2026-05-27", "Idul Adha"], ["2026-05-31", "Hari Raya Waisak"], ["2026-06-01", "Hari Lahir Pancasila"],
  ["2026-06-16", "Tahun Baru Islam"], ["2026-08-17", "Hari Kemerdekaan RI"],
  ["2026-08-25", "Maulid Nabi Muhammad SAW"], ["2026-12-25", "Hari Raya Natal"],
].map(([date, name], i) => ({ id: i + 1, date, name, type: "NATIONAL", scope: "NATIONAL" }));

const STATUSES = ["PRESENT", "PERMIT", "SICK"];
const TEXT_FIELDS = ["activity_log", "lesson_learned", "obstacles"];
const MAX_BODY = 64 * 1024;
const TOKEN_TTL_MS = 60_000;
const WIB_MS = 7 * 3600_000;

class HttpError extends Error {
  constructor(status, message, errors) { super(message); this.status = status; this.errors = errors; }
}

const validDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === s;
};

function createServer({ authUrl, dataFile, now = () => new Date() }) {
  let db;
  const load = () => {
    if (db) return db;
    try { db = JSON.parse(fs.readFileSync(dataFile, "utf8")); } catch (e) {
      if (e.code !== "ENOENT") throw e;
      db = { users: {}, nextId: 1 };
    }
    return db;
  };
  const save = () => {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(`${dataFile}.tmp`, JSON.stringify(db));
    fs.renameSync(`${dataFile}.tmp`, dataFile);
  };

  const tokens = new Map(); // Authorization header -> expiry ms
  async function checkToken(auth) {
    if (!auth) throw new HttpError(401, "Unauthorized");
    if ((tokens.get(auth) ?? 0) > Date.now()) return;
    let res;
    try { res = await fetch(authUrl, { headers: { Authorization: auth, Accept: "application/json" } }); }
    catch { throw new HttpError(502, "Tidak dapat memverifikasi token"); }
    if (res.status === 401 || res.status === 403) throw new HttpError(401, "Unauthorized");
    if (!res.ok) throw new HttpError(502, "Tidak dapat memverifikasi token");
    tokens.set(auth, Date.now() + TOKEN_TTL_MS);
  }

  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, "Request terlalu besar")); req.resume(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      let v;
      try { v = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reject(new HttpError(400, "Body bukan JSON valid")); }
      if (!v || typeof v !== "object" || Array.isArray(v)) return reject(new HttpError(400, "Body harus berupa objek JSON"));
      resolve(v);
    });
    req.on("error", reject);
  });

  function createEntry(email, b) {
    const errors = {};
    if (!validDate(b.date)) errors.date = "Tanggal tidak valid (YYYY-MM-DD)";
    if (!STATUSES.includes(b.status)) errors.status = "Status harus PRESENT, PERMIT, atau SICK";
    if (b.status === "PRESENT") {
      for (const f of TEXT_FIELDS) if (typeof b[f] !== "string" || !b[f].trim()) errors[f] = `${f} wajib diisi`;
    }
    if (Object.keys(errors).length) throw new HttpError(422, "Data tidak valid", errors);

    const list = (load().users[email] ??= []);
    if (list.some((e) => e.date === b.date)) throw new HttpError(409, "Absensi untuk tanggal ini sudah ada");

    const wib = new Date(now().getTime() + WIB_MS);
    const today = wib.toISOString().slice(0, 10);
    const dow = new Date(`${b.date}T00:00:00Z`).getUTCDay();
    const anomalies = [
      [dow === 0 || dow === 6, "weekend"],
      [HOLIDAYS.some((h) => h.date === b.date), "holiday"],
      [b.date < today, "backdated"],
      [b.date > today, "future"],
    ].filter(([on]) => on).map(([, n]) => n);

    const entry = {
      id: db.nextId++, date: b.date, status: b.status,
      latitude: b.latitude, longitude: b.longitude, location: b.location,
      activity_log: b.activity_log, lesson_learned: b.lesson_learned, obstacles: b.obstacles,
      clock_in: wib.toISOString().slice(11, 16), created_at: now().toISOString(), anomalies,
    };
    list.push(entry);
    save();
    return entry;
  }

  return http.createServer(async (req, res) => {
    const send = (status, obj) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    try {
      const url = new URL(req.url, "http://x");
      const route = `${req.method} ${url.pathname}`;
      if (route === "GET /health") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
      if (!["POST /attendances/with-daily-log", "GET /daily-logs", "GET /holidays"].includes(route)) {
        return send(404, { message: "Not found" });
      }
      await checkToken(req.headers.authorization);
      const email = req.headers["cf-access-authenticated-user-email"];
      if (!email) throw new HttpError(401, "Unauthorized");

      if (route.startsWith("POST")) {
        const entry = createEntry(email, await readBody(req));
        return send(201, { message: "Absensi berhasil disimpan", data: entry });
      }
      const page = Math.max(1, parseInt(url.searchParams.get("page"), 10) || 1);
      if (route === "GET /holidays") {
        const limit = Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 10);
        return send(200, { data: HOLIDAYS.slice((page - 1) * limit, page * limit), total: HOLIDAYS.length });
      }
      const all = [...(load().users[email] ?? [])].sort((a, b) => b.date.localeCompare(a.date));
      send(200, { data: all.slice((page - 1) * 10, page * 10), total: all.length, page });
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { message: e.message, ...(e.errors && { errors: e.errors }) });
      console.error(e);
      send(500, { message: "Internal error" });
    }
  });
}

module.exports = { createServer };

if (require.main === module) {
  createServer({
    authUrl: process.env.SHELIA_AUTH_URL,
    dataFile: process.env.DATA_FILE || "/data/monev.json",
  }).listen(process.env.PORT || 8080);
}
