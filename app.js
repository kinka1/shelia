"use strict";

const CONFIG = {
  API_BASE: "https://dev-shelia.shelterapp2.co.id/api",
  // Koordinat tetap yang dikirim ke user/today, check-in, dan check-out (menggantikan GPS browser).
  LAT: -7.308430344545027,
  LNG: 112.785199930883,
  // CORS di API dev hanya mengizinkan origin ini.
  EXPECTED_ORIGIN: "http://localhost:5173",
};

const STORAGE = { token: "absen.token", employee: "absen.employee" };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const STATUS_LABEL = {
  not_checked_in: "Belum check-in",
  checked_in: "Sudah check-in",
  late: "Terlambat",
};
const STATE_LABEL = {
  open: "Terbuka",
  on_break: "Istirahat",
  closed: "Selesai",
  expired: "Kedaluwarsa",
  rejected: "Ditolak",
};
const REVIEW_REASON_LABEL = {
  face_recognition_bypass: "bypass verifikasi wajah",
  outside_location: "di luar area",
  location_missing: "lokasi kosong",
  app_unverified: "aplikasi tidak terverifikasi",
};
// Error yang berarti status di server sudah berubah: muat ulang user/today.
const RELOAD_CODES = new Set([
  "ERR-HR-019", "ERR-HR-074", "ERR-HR-075",
  "ERR-HR-020", "ERR-HR-041", "ERR-HR-076",
  "ERR-HR-027",
]);

const $ = (id) => document.getElementById(id);
const els = {
  loginView: $("login-view"),
  originWarning: $("origin-warning"),
  loginForm: $("login-form"),
  loginBtn: $("login-btn"),
  loginError: $("login-error"),
  mainView: $("main-view"),
  empName: $("emp-name"),
  empSub: $("emp-sub"),
  logoutBtn: $("logout-btn"),
  flash: $("flash"),
  refreshBtn: $("refresh-btn"),
  todayMessage: $("today-message"),
  workDate: $("work-date"),
  todayStatus: $("today-status"),
  locCoords: $("loc-coords"),
  locSite: $("loc-site"),
  locDistance: $("loc-distance"),
  missedWarning: $("missed-warning"),
  faceWarning: $("face-warning"),
  attendForm: $("attend-form"),
  attendTitle: $("attend-title"),
  shiftField: $("shift-field"),
  shiftSelect: $("shift-select"),
  photoField: $("photo-field"),
  camVideo: $("cam-video"),
  photoPreview: $("photo-preview"),
  camPlaceholder: $("cam-placeholder"),
  camOpen: $("cam-open"),
  camShot: $("cam-shot"),
  photoFile: $("photo-file"),
  reasonField: $("reason-field"),
  reason: $("reason"),
  recentReasons: $("recent-reasons"),
  outsideBlock: $("outside-block"),
  bypassNote: $("bypass-note"),
  attendBtn: $("attend-btn"),
  sessionsCard: $("sessions-card"),
  sessions: $("sessions"),
};

const state = {
  today: null,      // data dari user/today
  shifts: [],       // shift tersedia (hanya saat next_action = check_in)
  photo: null,      // Blob/File selfie
  photoUrl: null,
  stream: null,     // MediaStream kamera
  faceToken: null,  // { token, expiresAt }
  bypass: null,     // { token, expiresAt }
  busy: false,
};

// ---------- Storage ----------

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* abaikan */ }
}
function storageDel(key) {
  try { localStorage.removeItem(key); } catch { /* abaikan */ }
}
function getToken() {
  return storageGet(STORAGE.token);
}
function getEmployee() {
  try { return JSON.parse(storageGet(STORAGE.employee) || "null"); } catch { return null; }
}

// ---------- API ----------

class ApiError extends Error {
  constructor(message, info = {}) {
    super(message);
    Object.assign(this, info);
  }
}

async function api(path, { method = "GET", json, form, auth = true } = {}) {
  const headers = { Accept: "application/json", "Accept-Language": "id" };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }

  let res;
  try {
    res = await fetch(CONFIG.API_BASE + path, { method, headers, body });
  } catch {
    throw new ApiError(
      `Tidak bisa terhubung ke server. Periksa koneksi internet, dan pastikan website dibuka dari ${CONFIG.EXPECTED_ORIGIN}.`,
      { code: "NETWORK" },
    );
  }

  let data = null;
  try { data = await res.json(); } catch { /* respons bukan JSON */ }

  if (!res.ok || (data && data.status === "error")) {
    const err = new ApiError(
      (data && typeof data.message === "string" && data.message) || `Permintaan gagal (HTTP ${res.status}).`,
      {
        status: res.status,
        code: data?.error_code,
        meta: data?.meta,
        errors: data?.errors,
        retryAfter: res.headers.get("Retry-After"),
      },
    );
    if (res.status === 401 && auth) {
      clearSession();
      showLogin("Sesi berakhir. Silakan login lagi.");
    }
    throw err;
  }
  return data || {};
}

function errorText(err) {
  let msg = err.message || "Terjadi kesalahan.";
  if (err.code && err.code !== "NETWORK") msg += ` (${err.code})`;
  if (err.errors && typeof err.errors === "object") {
    const lines = Object.values(err.errors)
      .flat()
      .map((e) => (typeof e === "string" ? e : e?.message))
      .filter(Boolean);
    if (lines.length) msg += "\n" + lines.join("\n");
  }
  if (err.meta && err.meta.attempts_remaining != null) {
    msg += `\nSisa percobaan verifikasi wajah: ${err.meta.attempts_remaining}.`;
  }
  if (err.retryAfter) msg += `\nCoba lagi dalam ${err.retryAfter} detik.`;
  return msg;
}

// ---------- Helper UI ----------

function toggleAlert(el, text, type) {
  el.hidden = !text;
  el.textContent = text || "";
  if (type) el.className = `alert ${type}`;
}

function flash(type, text) {
  toggleAlert(els.flash, text, type);
  if (text) els.flash.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function setButtonBusy(btn, busy, text) {
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
  } else {
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
    btn.disabled = false;
  }
}

function fmtMeters(m) {
  const n = Number(m);
  if (!Number.isFinite(n)) return "-";
  return n >= 1000 ? `${(n / 1000).toFixed(2)} km` : `${Math.round(n)} m`;
}

// "2026-11-16 07:52:00" -> "07:52", atau "17/11 01:10" bila beda tanggal dengan workDate.
function fmtTime(value, workDate) {
  if (!value || typeof value !== "string") return "-";
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  if (workDate && date !== workDate) return `${date.slice(8, 10)}/${date.slice(5, 7)} ${time}`;
  return time;
}

function shiftLabel(s) {
  const hhmm = (t) => (typeof t === "string" ? t.slice(0, 5) : "?");
  return `${s.name} (masuk ${hhmm(s.check_in_start)}–${hhmm(s.check_in_end)}, pulang ${hhmm(s.check_out_start)}–${hhmm(s.check_out_end)})`;
}

function reviewReasons(value) {
  if (!value) return "-";
  return String(value)
    .split(",")
    .map((r) => REVIEW_REASON_LABEL[r.trim()] || r.trim())
    .join(", ");
}

// ---------- Sesi login ----------

function clearSession() {
  storageDel(STORAGE.token);
  storageDel(STORAGE.employee);
  stopCamera();
  setPhoto(null);
  state.today = null;
  state.shifts = [];
  state.faceToken = null;
  state.bypass = null;
}

function showLogin(message) {
  els.mainView.hidden = true;
  els.loginView.hidden = false;
  toggleAlert(els.loginError, message || "", "info");
  if (location.origin !== CONFIG.EXPECTED_ORIGIN) {
    toggleAlert(
      els.originWarning,
      `Website ini dibuka dari ${location.origin}. API hanya menerima request dari ${CONFIG.EXPECTED_ORIGIN}. Jalankan "node server.js" lalu buka alamat itu.`,
    );
  }
}

function showMain() {
  const emp = getEmployee();
  els.empName.textContent = emp?.full_name || "Karyawan";
  els.empSub.textContent = [emp?.nik, emp?.branch_name].filter(Boolean).join(" · ");
  els.locCoords.textContent = `${CONFIG.LAT}, ${CONFIG.LNG}`;
  els.loginView.hidden = true;
  els.mainView.hidden = false;
  flash(null, "");
  loadToday();
}

async function onLogin(event) {
  event.preventDefault();
  const fd = new FormData(els.loginForm);
  const username = String(fd.get("username") || "").trim();
  const password = String(fd.get("password") || "");
  if (!username || !password) {
    toggleAlert(els.loginError, "NIK dan password wajib diisi.", "error");
    return;
  }

  toggleAlert(els.loginError, "");
  setButtonBusy(els.loginBtn, true, "Memproses…");
  try {
    const res = await api("/auth/login", { method: "POST", json: { username, password }, auth: false });
    const emp = res.data?.employee || {};
    storageSet(STORAGE.token, res.data?.token || "");
    storageSet(STORAGE.employee, JSON.stringify({
      full_name: emp.full_name,
      nik: emp.nik,
      branch_name: emp.branch_name,
    }));
    els.loginForm.reset();
    showMain();
  } catch (err) {
    toggleAlert(els.loginError, errorText(err), "error");
  } finally {
    setButtonBusy(els.loginBtn, false);
  }
}

async function onLogout() {
  setButtonBusy(els.logoutBtn, true, "Keluar…");
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    // Token tetap dihapus di sisi website walau request gagal.
  } finally {
    setButtonBusy(els.logoutBtn, false);
  }
  clearSession();
  showLogin();
}

// ---------- Status hari ini ----------

async function loadToday() {
  setButtonBusy(els.refreshBtn, true, "Memuat…");
  try {
    const res = await api("/attendance-integration/user/today", {
      method: "POST",
      json: { lat: CONFIG.LAT, lng: CONFIG.LNG },
    });
    state.today = res.data || {};
    state.shifts = [];
    if (state.today.next_action === "check_in") {
      try {
        const s = await api("/v2/attendance/shifts/available");
        state.shifts = Array.isArray(s.data) ? s.data : [];
      } catch (err) {
        if (err.status !== 401) flash("error", errorText(err));
      }
    }
    render();
  } catch (err) {
    if (err.status !== 401) flash("error", errorText(err));
  } finally {
    setButtonBusy(els.refreshBtn, false);
  }
}

function render() {
  const t = state.today;
  if (!t) return;

  els.todayMessage.textContent = t.message || "-";
  els.workDate.textContent = t.work_date || "-";
  els.todayStatus.textContent = STATUS_LABEL[t.status] || t.status || "-";

  if (t.site) {
    const extra = t.site.business_site_name && t.site.business_site_name !== t.site.name
      ? ` (${t.site.business_site_name})` : "";
    els.locSite.textContent = (t.site.name || "-") + extra;
  } else {
    els.locSite.textContent = t.setup?.geofence_configured === null ? "Pengecekan lokasi tidak aktif" : "-";
  }

  if (t.distance_meters != null) {
    const radius = t.site?.radius_meters ? ` (radius ${fmtMeters(t.site.radius_meters)})` : "";
    const area = t.is_outside_location ? "di luar area" : "di dalam area";
    els.locDistance.textContent = `${fmtMeters(t.distance_meters)}${radius} · ${area}`;
  } else {
    els.locDistance.textContent = "-";
  }

  const missed = t.missed_check_out;
  toggleAlert(
    els.missedWarning,
    missed
      ? `Sesi ${missed.session_no ?? ""} tanggal ${missed.work_date || "-"} belum di-check-out dan sudah lewat batasnya. Ajukan koreksi absen.`
      : "",
  );

  toggleAlert(
    els.faceWarning,
    t.setup?.face_enrolled === false
      ? "Foto wajah di HRIS belum ada atau tidak bisa dipakai. Perbarui foto profil di HRIS agar bisa absen."
      : "",
  );

  renderAttendForm();
  renderSessions();
}

// ---------- Form check-in / check-out ----------

function isFaceOn() {
  return state.today?.setup?.face_enrolled === true;
}

function validFaceToken() {
  const t = state.faceToken;
  return !!t && t.expiresAt - Date.now() > 15_000;
}

function activeBypass() {
  const b = state.bypass;
  if (b && b.expiresAt - Date.now() > 15_000) return b;
  state.bypass = null;
  return null;
}

function renderAttendForm() {
  const t = state.today;
  const kind = t?.next_action;
  const show = kind === "check_in" || kind === "check_out";
  els.attendForm.hidden = !show;
  if (!show) {
    stopCamera();
    return;
  }

  const isIn = kind === "check_in";
  els.attendTitle.textContent = isIn ? "Check-in" : "Check-out";

  const needShift = isIn && state.shifts.length > 0;
  els.shiftField.hidden = !needShift;
  if (needShift) fillShiftOptions();

  els.photoField.hidden = !isFaceOn();
  if (!isFaceOn()) stopCamera();

  els.reasonField.hidden = !t.required_note;
  renderRecentReasons(t.required_note ? t.recent_reasons : []);

  const blockedOutside = !!t.is_outside_location && t.allow_outside_site === false;
  toggleAlert(
    els.outsideBlock,
    blockedOutside
      ? `Koordinat absen berada di luar area site (${fmtMeters(t.distance_meters)}), dan site ini tidak mengizinkan absen dari luar area.`
      : "",
  );

  const bypass = isFaceOn() ? activeBypass() : null;
  toggleAlert(
    els.bypassNote,
    bypass
      ? "Verifikasi wajah gagal 3 kali. Absen tetap bisa dikirim dengan foto ini, tetapi akan diperiksa HR."
      : "",
  );

  const faceBroken = t.setup?.face_enrolled === false;
  els.attendBtn.disabled = state.busy || blockedOutside || faceBroken;
  if (!state.busy) {
    els.attendBtn.textContent = (isIn ? "Check-in" : "Check-out") + (bypass ? " (HR review)" : "");
  }
}

function fillShiftOptions() {
  const prev = els.shiftSelect.value;
  els.shiftSelect.replaceChildren(
    new Option("-- Pilih shift --", ""),
    ...state.shifts.map((s) => new Option(shiftLabel(s), s.id)),
  );
  if (state.shifts.some((s) => s.id === prev)) els.shiftSelect.value = prev;
  else if (state.shifts.length === 1) els.shiftSelect.value = state.shifts[0].id;
}

function renderRecentReasons(list) {
  const items = Array.isArray(list) ? list.filter(Boolean).map(String) : [];
  els.recentReasons.replaceChildren(
    ...items.map((reason) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = reason;
      b.addEventListener("click", () => { els.reason.value = reason; });
      return b;
    }),
  );
  els.recentReasons.hidden = items.length === 0;
}

function renderSessions() {
  const list = Array.isArray(state.today?.sessions) ? state.today.sessions : [];
  els.sessionsCard.hidden = list.length === 0;
  els.sessions.replaceChildren(...list.map(sessionItem));
}

function sessionItem(s) {
  const li = document.createElement("li");

  const head = document.createElement("div");
  head.className = "row between";
  const title = document.createElement("strong");
  title.textContent = `Sesi ${s.session_no ?? "-"}${s.shift?.name ? " · " + s.shift.name : ""}`;
  const badge = document.createElement("span");
  badge.className = `badge ${s.state || ""}`;
  badge.textContent = STATE_LABEL[s.state] || s.state || "-";
  head.append(title, badge);

  const times = document.createElement("div");
  times.className = "small muted";
  times.textContent = `Masuk ${fmtTime(s.check_in_time, s.work_date)} · Pulang ${fmtTime(s.check_out_time, s.work_date)}`;
  li.append(head, times);

  if (s.state === "open" && s.shift?.check_out_start_at) {
    const win = document.createElement("div");
    win.className = "small muted";
    win.textContent = `Check-out mulai ${fmtTime(s.shift.check_out_start_at, s.work_date)} sampai ${fmtTime(s.shift.check_out_end_at, s.work_date)}`;
    li.append(win);
  }
  if (s.needs_hr_review) {
    const review = document.createElement("div");
    review.className = "small warn-text";
    review.textContent = `Menunggu pemeriksaan HR${s.hr_review_status ? ` (${s.hr_review_status})` : ""}`;
    li.append(review);
  }
  return li;
}

// ---------- Kamera & foto ----------

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    flash("error", "Browser ini tidak bisa membuka kamera di halaman ini. Pakai tombol \"Pilih file\".");
    return;
  }
  try {
    stopCamera();
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    els.camVideo.srcObject = state.stream;
    await els.camVideo.play();
    els.camVideo.hidden = false;
    els.photoPreview.hidden = true;
    els.camPlaceholder.hidden = true;
    els.camShot.hidden = false;
    els.camOpen.hidden = true;
  } catch (err) {
    stopCamera();
    flash("error", `Kamera tidak bisa dibuka (${err.name || err.message}). Pakai tombol "Pilih file".`);
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  els.camVideo.srcObject = null;
  els.camVideo.hidden = true;
  els.camShot.hidden = true;
  els.camOpen.hidden = false;
  renderPhoto();
}

function capturePhoto() {
  const video = els.camVideo;
  if (!video.videoWidth) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.toBlob((blob) => {
    if (blob) setPhoto(blob);
    stopCamera();
  }, "image/jpeg", 0.9);
}

function onPhotoFile() {
  const file = els.photoFile.files?.[0];
  els.photoFile.value = "";
  if (!file) return;
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    flash("error", "Foto harus berformat jpg, jpeg, atau png.");
    return;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    flash("error", "Ukuran foto maksimal 10 MB.");
    return;
  }
  stopCamera();
  setPhoto(file);
}

function setPhoto(blob) {
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photo = blob || null;
  state.photoUrl = blob ? URL.createObjectURL(blob) : null;
  renderPhoto();
}

function renderPhoto() {
  const showPreview = !!state.photoUrl && !state.stream;
  els.photoPreview.hidden = !showPreview;
  if (showPreview) els.photoPreview.src = state.photoUrl;
  else els.photoPreview.removeAttribute("src");
  els.camPlaceholder.hidden = showPreview || !!state.stream;
  els.camOpen.textContent = state.photo ? "Foto ulang" : "Buka kamera";
}

function photoName() {
  if (state.photo instanceof File && state.photo.name) return state.photo.name;
  return state.photo?.type === "image/png" ? "selfie.png" : "selfie.jpg";
}

async function verifyFace() {
  const form = new FormData();
  form.append("file_photo", state.photo, photoName());
  try {
    const res = await api("/v2/attendance/face/verify", { method: "POST", form });
    const expiresAt = Date.parse(res.data?.expires_at);
    state.faceToken = {
      token: res.data?.face_token,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 9 * 60 * 1000,
    };
  } catch (err) {
    if (err.meta?.bypass_allowed && err.meta?.bypass_token) {
      const expiresAt = Date.parse(err.meta.bypass_expires_at);
      state.bypass = {
        token: err.meta.bypass_token,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 25 * 60 * 1000,
      };
    }
    throw err;
  }
}

// ---------- Kirim check-in / check-out ----------

function successText(isIn, res) {
  const d = res.data || {};
  const part = isIn ? d.check_in : d.check_out;
  const time = isIn ? part?.check_in_time : part?.check_out_time;
  const fallback = isIn ? "Check-in berhasil" : "Check-out berhasil";
  let msg = `${typeof res.message === "string" ? res.message : fallback}${time ? ` (${time})` : ""}.`;
  if (part?.status === "late") msg += "\nStatus: terlambat.";
  if (part?.status === "early") msg += "\nStatus: pulang lebih awal.";
  if (d.needs_hr_review) msg += `\nAbsen ini menunggu pemeriksaan HR: ${reviewReasons(d.hr_review_reason)}.`;
  return msg;
}

async function onAttend(event) {
  event.preventDefault();
  if (state.busy) return;

  const t = state.today;
  const kind = t?.next_action;
  if (kind !== "check_in" && kind !== "check_out") return;
  const isIn = kind === "check_in";

  const shiftId = isIn && state.shifts.length ? els.shiftSelect.value : "";
  if (isIn && state.shifts.length && !shiftId) {
    flash("error", "Pilih shift dulu.");
    return;
  }

  const reason = els.reason.value.trim();
  if (t.required_note && (reason.length < 10 || reason.length > 255)) {
    flash("error", "Alasan wajib diisi, 10 sampai 255 karakter.");
    return;
  }

  const faceOn = isFaceOn();
  const bypass = faceOn ? activeBypass() : null;
  if (faceOn && !state.photo && (bypass || !validFaceToken())) {
    flash("error", "Ambil foto wajah dulu.");
    return;
  }

  flash(null, "");
  state.busy = true;
  els.attendBtn.disabled = true;

  try {
    const form = new FormData();
    form.append("lat", String(CONFIG.LAT));
    form.append("lng", String(CONFIG.LNG));
    form.append("platform", "web");
    if (shiftId) form.append("shift_id", shiftId);
    if (!isIn && t.active_session?.attendance_id) form.append("attendance_id", t.active_session.attendance_id);
    if (t.required_note) form.append("reason", reason);

    if (faceOn) {
      if (bypass) {
        form.append("face_bypass_token", bypass.token);
        form.append("file_photo", state.photo, photoName());
      } else {
        if (!validFaceToken()) {
          els.attendBtn.textContent = "Memverifikasi wajah…";
          await verifyFace();
        }
        form.append("face_token", state.faceToken.token);
      }
    }

    els.attendBtn.textContent = isIn ? "Mengirim check-in…" : "Mengirim check-out…";
    const res = await api(`/v2/attendance/${isIn ? "check-in" : "check-out"}`, { method: "POST", form });

    // face_token hanya sekali pakai; check-out butuh verifikasi wajah baru.
    state.faceToken = null;
    state.bypass = null;
    setPhoto(null);
    els.reason.value = "";
    flash("success", successText(isIn, res));
    await loadToday();
  } catch (err) {
    if (err.status === 401) return;
    if (err.code === "ERR-HR-028") state.faceToken = null;
    flash("error", errorText(err));
    if (RELOAD_CODES.has(err.code)) loadToday();
  } finally {
    state.busy = false;
    renderAttendForm();
  }
}

// ---------- Mulai ----------

function init() {
  els.loginForm.addEventListener("submit", onLogin);
  els.logoutBtn.addEventListener("click", onLogout);
  els.refreshBtn.addEventListener("click", () => {
    flash(null, "");
    loadToday();
  });
  els.attendForm.addEventListener("submit", onAttend);
  els.camOpen.addEventListener("click", openCamera);
  els.camShot.addEventListener("click", capturePhoto);
  els.photoFile.addEventListener("change", onPhotoFile);

  if (getToken()) showMain();
  else showLogin();
}

init();
