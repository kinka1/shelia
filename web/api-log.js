(function () {
  var SECRET = /^(password|token|access_token|face_token|bypass_token|face_bypass_token)$/i;
  var MAX = 50;

  function redactJson(v) {
    if (Array.isArray(v)) return v.map(redactJson);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = SECRET.test(k) ? "***" : redactJson(v[k]); });
      return o;
    }
    return v;
  }

  function redactHeaders(init) {
    var o = {};
    if (!init) return o;
    if (typeof init.forEach === "function" && !Array.isArray(init)) init.forEach(function (v, k) { o[k] = v; });
    else if (Array.isArray(init)) init.forEach(function (p) { o[p[0]] = p[1]; });
    else Object.keys(init).forEach(function (k) { o[k] = init[k]; });
    Object.keys(o).forEach(function (k) { if (k.toLowerCase() === "authorization") o[k] = "Bearer ***"; });
    return o;
  }

  function describeBody(body) {
    if (body == null) return null;
    if (typeof body === "string") {
      try { return redactJson(JSON.parse(body)); } catch (e) { return body; }
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      var o = {};
      body.forEach(function (v, k) {
        o[k] = SECRET.test(k) ? "***"
          : typeof v === "string" ? v
          : "[file " + (v.name || "blob") + ", " + Math.ceil(v.size / 1024) + " KB]";
      });
      return o;
    }
    if (typeof Blob !== "undefined" && body instanceof Blob) return "[file " + (body.name || "blob") + ", " + Math.ceil(body.size / 1024) + " KB]";
    return String(body);
  }

  // "/api/x?token=a&page=2" -> "/api/x?token=***&page=2" (pathname untouched)
  function redactPath(u) {
    var i = u.indexOf("?");
    if (i < 0) return u;
    return u.slice(0, i + 1) + u.slice(i + 1).split("&").map(function (kv) {
      var j = kv.indexOf("=");
      if (j < 0) return kv;
      var k = kv.slice(0, j);
      try { k = decodeURIComponent(k); } catch (e) { /* keep raw */ }
      return SECRET.test(k) ? kv.slice(0, j) + "=***" : kv;
    }).join("&");
  }

  var api = { redactJson: redactJson, redactHeaders: redactHeaders, describeBody: describeBody, redactPath: redactPath };
  if (typeof module !== "undefined") module.exports = api;
  if (typeof window === "undefined") return;
  window.apiLog = api;

  // ---- UI ----
  var list = null;
  function mount() {
    list = document.createElement("div");
    var host = document.querySelector("main.container") || document.body;
    var sec = document.createElement("section");
    sec.id = "shelia-log";
    sec.className = "card";
    var h = document.createElement("h2");
    h.textContent = "Shelia API log";
    var clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Bersihkan";
    clear.addEventListener("click", function () { list.textContent = ""; });
    sec.append(h, clear, list);
    host.appendChild(sec);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  function pre(obj) {
    var p = document.createElement("pre");
    p.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    return p;
  }

  function render(e) {
    if (!list) return;
    var d = document.createElement("details");
    var s = document.createElement("summary");
    s.className = "small";
    s.textContent = e.method + " " + e.path + " " + (e.error ? "error" : e.status) + " " + e.ms + "ms";
    d.append(s, pre({ request: e.request }), pre({ response: e.error ? e.error : e.response }));
    list.insertBefore(d, list.firstChild);
    while (list.children.length > MAX) list.removeChild(list.lastChild);
  }

  // ---- fetch wrapper ----
  var orig = window.fetch;
  window.fetch = function (input, init) {
    var started = Date.now();
    var entry = null;
    try {
      var isReq = typeof Request !== "undefined" && input instanceof Request;
      var url = new URL(isReq ? input.url : String(input), location.href);
      if (url.origin === location.origin && url.pathname.indexOf("/api/") === 0) {
        init = init || {};
        entry = {
          at: new Date().toISOString(),
          method: String(init.method || (isReq && input.method) || "GET").toUpperCase(),
          path: redactPath(url.pathname + url.search),
          request: { headers: redactHeaders(init.headers || (isReq && input.headers)), body: describeBody(init.body) },
        };
      }
    } catch (e) { entry = null; }

    var p = orig.apply(this, arguments);
    if (!entry) return p;

    function done() {
      entry.ms = Date.now() - started;
      try { render(entry); } catch (e) { /* never break the app */ }
      try { window.dispatchEvent(new CustomEvent("api-log", { detail: entry })); } catch (e) { /* ditto */ }
    }
    p.then(function (res) {
      entry.status = res.status;
      return res.clone().text().then(function (t) {
        try { entry.response = redactJson(JSON.parse(t)); } catch (e) { entry.response = t ? t.slice(0, 2000) : "(empty)"; }
      });
    }, function (err) {
      entry.error = String(err && err.message || err);
    }).catch(function (e) { entry.response = "(unreadable: " + e + ")"; }).then(done).catch(function () {});
    return p;
  };
})();
