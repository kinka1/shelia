"use strict";
// Mounts the Monev mock beside the Shelia page and keeps it in sync with Shelia's session.
(async () => {
  const col = document.getElementById("monev-col");
  if (!col) return;
  try {
    const res = await fetch("/monev.html");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const main = doc.querySelector("main.container");
    main.querySelector(".topbar a").remove(); // back link to Shelia is pointless here
    main.querySelector(".topbar h1").textContent = "Mock Monev MagangHub";
    col.append(...main.childNodes);
  } catch (e) {
    col.textContent = "Gagal memuat Monev: " + e.message;
    return;
  }
  const s = document.createElement("script");
  s.src = "/monev.js";
  document.body.append(s);

  // app.js writes/clears localStorage AFTER the response (and after res.json()), i.e. after the
  // api-log event. Poll until the token differs from its value at event time, then refresh;
  // after ~2s refresh anyway (e.g. a 401 or a failed login leaves it unchanged).
  const tok = () => localStorage.getItem("absen.token");
  let timer;
  const refreshSoon = () => {
    clearInterval(timer);
    const before = tok();
    let n = 0;
    timer = setInterval(() => {
      if (tok() !== before || ++n >= 40) {
        clearInterval(timer);
        window.monevRefresh && window.monevRefresh();
      }
    }, 50);
  };
  window.addEventListener("api-log", (ev) => {
    const { method, path, status } = ev.detail;
    if (!path.startsWith("/api/auth/") && status !== 401) return;
    if (path.startsWith("/api/auth/login") && status !== 200) return;
    refreshSoon();
  });
})();
