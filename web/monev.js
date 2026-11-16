"use strict";
const API = "/monev-api/v1";
const LABELS = { weekend: "akhir pekan", holiday: "hari libur", backdated: "mundur tanggal", future: "tanggal ke depan" };
const PER_PAGE = 10;
const $ = (id) => document.getElementById(id);
let page = 1;

const token = () => localStorage.getItem("absen.token");

function noAuth() {
  $("auth-msg").hidden = false;
}

// Today in WIB (UTC+7), independent of the browser zone.
$("f-date").value = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

async function api(path, opts) {
  const t = token();
  if (!t) { noAuth(); return null; }
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
  });
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON body */ }
  if (res.status === 401) noAuth();
  return { status: res.status, body };
}

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

async function loadList() {
  const r = await api("/daily-logs?page=" + page);
  if (!r || r.status !== 200) return;
  const { data, total } = r.body;
  const list = $("list");
  list.replaceChildren();
  if (!data.length) list.append(el("li", "Belum ada data.", "muted"));
  for (const e of data) {
    const li = el("li");
    const head = el("div", null, "row between");
    head.append(el("strong", `${e.date} ${e.status} ${e.clock_in}`));
    const badges = el("span", null, "chips");
    for (const a of e.anomalies || []) badges.append(el("span", LABELS[a] || a, "badge rejected"));
    head.append(badges);
    li.append(head, el("div", `${e.location} (${e.latitude}, ${e.longitude})`, "small muted"));
    for (const [k, v] of [["Aktivitas", e.activity_log], ["Pembelajaran", e.lesson_learned], ["Kendala", e.obstacles]]) {
      if (v) li.append(el("div", `${k}: ${v}`, "small"));
    }
    list.append(li);
  }
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  $("page-info").textContent = `Halaman ${page} / ${pages} (${total})`;
  $("prev-btn").disabled = page <= 1;
  $("next-btn").disabled = page >= pages;
}

$("monev-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const body = {
    date: $("f-date").value,
    status: $("f-status").value,
    latitude: parseFloat($("f-lat").value),
    longitude: parseFloat($("f-lng").value),
    location: $("f-location").value,
    activity_log: $("f-activity").value,
    lesson_learned: $("f-lesson").value,
    obstacles: $("f-obstacles").value,
  };
  $("req-out").textContent = JSON.stringify(body, null, 2);
  $("res-out").textContent = "...";
  $("submit-btn").disabled = true;
  try {
    const r = await api("/attendances/with-daily-log", { method: "POST", body: JSON.stringify(body) });
    if (!r) { $("res-out").textContent = "Tidak ada token."; return; }
    $("res-out").textContent = `HTTP ${r.status}\n` + JSON.stringify(r.body, null, 2);
    page = 1;
    await loadList();
  } catch (e) {
    $("res-out").textContent = "Gagal: " + e.message;
  } finally {
    $("submit-btn").disabled = false;
  }
});

$("prev-btn").addEventListener("click", () => { page--; loadList(); });
$("next-btn").addEventListener("click", () => { page++; loadList(); });

if (token()) loadList(); else noAuth();
