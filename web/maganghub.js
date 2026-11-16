(() => {
"use strict";
const API = "/maganghub-api/v1";
const KEY = "maganghub.token";
const HOST = "monev.maganghub.kemnaker.go.id";

function takeTokenFromHash(hash) {
  const m = /^#mh=(.+)$/.exec(hash || "");
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (e) { return null; }
}

// Runs on MagangHub's own page: hands the token over in the URL fragment (never sent to a server).
function bookmarkletHref(origin) {
  const code = "(function(){var t=sessionStorage.getItem('monev_access_token');" +
    "if(!t){alert('Login MagangHub dulu');return}" +
    "window.open(" + JSON.stringify(origin + "/#mh=") + "+encodeURIComponent(t),'_blank','noopener')})();";
  return "javascript:" + encodeURI(code).replace(/#/g, "%23"); // a raw # would truncate a saved bookmark
}

if (typeof module !== "undefined") module.exports = { takeTokenFromHash, bookmarkletHref };

// Token intake first: take it and drop the fragment from the address bar before anything else.
const incoming = takeTokenFromHash(location.hash);
if (incoming) {
  try { localStorage.setItem(KEY, incoming); } catch (e) { /* storage blocked */ }
  history.replaceState(null, "", location.pathname + location.search);
}

const $ = (id) => document.getElementById(id);
const card = $("mh-card");
if (!card || card.dataset.ready) return;
card.dataset.ready = "1";

let page = 1;
let pageSize = 0;
const token = () => localStorage.getItem(KEY);

function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function status(msg, isError) {
  const m = $("mh-msg");
  m.textContent = msg || "";
  m.hidden = !msg;
  m.className = isError ? "alert error" : "muted small";
}

function reset() {
  $("mh-list").replaceChildren();
  $("mh-nav").hidden = true;
  $("mh-out").hidden = !token();
}

function show(data) {
  const list = $("mh-list");
  list.replaceChildren();
  if (!data.length) list.append(el("li", "Belum ada log.", "muted"));
  for (const e of data) {
    const it = (e && typeof e === "object") ? e : {};
    const li = el("li");
    li.append(el("strong", `${it.date ?? "-"} ${it.clock_in ?? "-"} ${it.status ?? "-"}`));
    for (const [k, v] of [["Aktivitas", it.activity_log], ["Pembelajaran", it.lesson_learned], ["Kendala", it.obstacles]]) {
      li.append(el("div", `${k}: ${v == null || v === "" ? "-" : v}`, "small"));
    }
    list.append(li);
  }
}

async function load() {
  const t = token();
  reset();
  if (!t) { status(""); return; }
  status("Memuat...");
  let res;
  try {
    res = await fetch(`${API}/daily-logs?page=${page}`, { headers: { Authorization: "Bearer " + t } });
  } catch (e) { status("Gagal terhubung", true); return; }
  if (res.status === 401) {
    status("Token kedaluwarsa atau tidak valid. Buka MagangHub, lalu klik tombol → Shelia lagi.", true);
    return;
  }
  if (!res.ok) { status(`Gagal memuat (HTTP ${res.status})`, true); return; }
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON body */ }
  const data = Array.isArray(body && body.data) ? body.data : [];
  const total = body && typeof body.total === "number" ? body.total : null;
  if (page === 1 && data.length) pageSize = data.length;
  status("");
  show(data);
  $("mh-prev").disabled = page <= 1;
  if (total != null) {
    const pages = Math.max(1, Math.ceil(total / (pageSize || 10)));
    $("mh-info").textContent = `Halaman ${page} / ${pages} (${total})`;
    $("mh-next").disabled = page >= pages;
  } else {
    $("mh-info").textContent = `Halaman ${page}`;
    $("mh-next").disabled = data.length === 0;
  }
  $("mh-nav").hidden = false;
}

const bm = $("mh-bm");
bm.href = bookmarkletHref(location.origin);
bm.addEventListener("click", (ev) => {
  if (location.hostname !== HOST) {
    ev.preventDefault();
    alert("Seret tombol ini ke bookmark bar, lalu klik di halaman MagangHub");
  }
});
$("mh-prev").addEventListener("click", () => { page--; load(); });
$("mh-next").addEventListener("click", () => { page++; load(); });
$("mh-out").addEventListener("click", () => {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
  page = 1; pageSize = 0;
  status("");
  reset();
});
load();
})();
