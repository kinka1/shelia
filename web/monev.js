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

let loading = false;

function setNav(pages) {
  $("prev-btn").disabled = loading || page <= 1;
  $("next-btn").disabled = loading || page >= pages;
}

async function loadList(target = page) {
  if (loading) return;
  loading = true;
  setNav(0);
  $("list-err").hidden = true;
  try {
    const r = await api("/daily-logs?page=" + target);
    if (!r) return;
    if (r.status !== 200) {
      if (r.status !== 401) {
        $("list-err").textContent = (r.body && r.body.message) || "HTTP " + r.status;
        $("list-err").hidden = false;
      }
      return;
    }
    page = target;
    render(r.body);
  } catch (e) {
    $("list-err").textContent = "Gagal memuat daftar: " + e.message;
    $("list-err").hidden = false;
  } finally {
    loading = false;
    setNav(lastPages);
  }
}

let lastPages = 1;

function render(body) {
  const { data, total } = body;
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
  lastPages = pages;
}

$("monev-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const body = {
    date: $("f-date").value,
    status: $("f-status").value,
    latitude: Number($("f-lat").value.trim()),
    longitude: Number($("f-lng").value.trim()),
    location: $("f-location").value,
    activity_log: $("f-activity").value,
    lesson_learned: $("f-lesson").value,
    obstacles: $("f-obstacles").value,
  };
  if (!$("f-lat").value.trim() || !$("f-lng").value.trim() || !Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
    $("res-out").textContent = "Latitude/longitude harus berupa angka.";
    return;
  }
  $("req-out").textContent = JSON.stringify(body, null, 2);
  $("res-out").textContent = "...";
  $("submit-btn").disabled = true;
  try {
    const r = await api("/attendances/with-daily-log", { method: "POST", body: JSON.stringify(body) });
    if (!r) { $("res-out").textContent = "Tidak ada token."; return; }
    $("res-out").textContent = `HTTP ${r.status}\n` + JSON.stringify(r.body, null, 2);
    await loadList(1);
  } catch (e) {
    $("res-out").textContent = "Gagal: " + e.message;
  } finally {
    $("submit-btn").disabled = false;
  }
});

$("prev-btn").addEventListener("click", () => loadList(page - 1));
$("next-btn").addEventListener("click", () => loadList(page + 1));
const syncRequired = () => {
  for (const id of ["f-activity", "f-lesson", "f-obstacles"]) $(id).required = $("f-status").value === "PRESENT";
};
$("f-status").addEventListener("change", syncRequired);

if (token()) loadList(); else noAuth();

// Used by compare.js after Shelia login/logout changes the token.
window.monevRefresh = () => {
  $("auth-msg").hidden = true;
  if (token()) { page = 1; loadList(1); } else { $("list").replaceChildren(); noAuth(); }
};
