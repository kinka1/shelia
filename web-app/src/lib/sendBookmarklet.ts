// "→ Kirim log": the daily log is sent from MagangHub's own page in the user's browser, not from our server.
// Our site packs the log into the URL fragment (never sent to any server); the bookmark, clicked on MagangHub,
// checks it, asks for confirmation and makes the same POST MagangHub's own form makes.

export const MH_SITE = 'https://monev.maganghub.kemnaker.go.id'
const KEY = '#shelia-log='

export type SendLog = { date: string; activity_log: string; lesson_learned: string; obstacles: string; latitude?: number; longitude?: number }

/** MagangHub's create payload: date, status, the three texts, coordinates only when present. */
export function sendUrl(v: SendLog): string {
  const body: Record<string, unknown> = {
    date: v.date, status: 'PRESENT', activity_log: v.activity_log, lesson_learned: v.lesson_learned, obstacles: v.obstacles,
  }
  if (Number.isFinite(v.latitude) && Number.isFinite(v.longitude)) { body.latitude = v.latitude; body.longitude = v.longitude }
  return `${MH_SITE}/dashboard${KEY}${encodeURIComponent(JSON.stringify(body))}`
}

// Plain ES5 so it runs as a bookmark on any browser. Only the whitelisted fields are ever sent.
const CODE = `(function(){
if(location.hostname!=='monev.maganghub.kemnaker.go.id'){alert('Buka halaman MagangHub dulu');return}
var p=${JSON.stringify(KEY)};
if(location.hash.indexOf(p)!==0){alert('Data log tidak ditemukan. Klik "Buka MagangHub" di Shelia dulu.');return}
var d;try{d=JSON.parse(decodeURIComponent(location.hash.slice(p.length)))}catch(e){alert('Data log rusak. Buka lagi dari Shelia.');return}
var T=['activity_log','lesson_learned','obstacles'];
if(!d||!/^\\d{4}-\\d{2}-\\d{2}$/.test(d.date)||d.status!=='PRESENT'||!T.every(function(k){return typeof d[k]==='string'&&d[k].trim().length>=100})){alert('Data log tidak valid. Buka lagi dari Shelia.');return}
var b={date:d.date,status:'PRESENT',activity_log:d.activity_log,lesson_learned:d.lesson_learned,obstacles:d.obstacles};
var loc=typeof d.latitude==='number'&&typeof d.longitude==='number'&&isFinite(d.latitude)&&isFinite(d.longitude);
if(loc){b.latitude=d.latitude;b.longitude=d.longitude}
var t=sessionStorage.getItem('monev_access_token');if(!t){alert('Login MagangHub dulu');return}
if(!confirm('Kirim ke MagangHub?\\n\\nTanggal: '+b.date+'\\nKehadiran: Hadir\\nTitik: '+(loc?b.latitude+', '+b.longitude:'tidak dikirim')+'\\n\\nAktivitas:\\n'+b.activity_log+'\\n\\nPembelajaran:\\n'+b.lesson_learned+'\\n\\nKendala:\\n'+b.obstacles))return;
var c=(window.__NUXT__&&window.__NUXT__.config&&window.__NUXT__.config.public)||{};
var h={'Content-Type':'application/json',Authorization:'Bearer '+t};if(c.buildId)h['X-Frontend-Build-ID']=c.buildId;
fetch('https://monev-api.maganghub.kemnaker.go.id/api/v1/attendances',{method:'POST',credentials:'include',headers:h,body:JSON.stringify(b)}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){
if(r.ok){history.replaceState(null,'',location.pathname+location.search);alert('Terkirim ke MagangHub.');location.reload();return}
alert('Gagal mengirim (HTTP '+r.status+'): '+(j.message||j.error||'')+(r.status===401?'\\nMuat ulang halaman MagangHub, lalu klik bookmark ini lagi.':''))})}).catch(function(){alert('Gagal terhubung ke MagangHub.')})
})();`

export function sendBookmarkletHref(): string {
  return 'javascript:' + encodeURI(CODE.replace(/\n/g, '')).replace(/#/g, '%23') // a raw # would truncate a saved bookmark
}
