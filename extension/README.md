# Phoenix MagangHub (ekstensi Chrome)

Mengirim log harian dan mengambil token MagangHub dari test-shelia dengan satu klik.
Semua permintaan dibuat di halaman MagangHub sendiri, dari browser Anda; tidak lewat server.

## Pasang
1. Unduh `shelia-maganghub.zip` dari tombol **Pasang ekstensi** di kartu MagangHub (test-shelia), lalu ekstrak.
2. Buka `chrome://extensions`, nyalakan **Developer mode**.
3. Klik **Load unpacked**, pilih folder hasil ekstrak.

Setelah terpasang, tab test-shelia yang terbuka dimuat ulang otomatis.

ID ekstensi: `fiagillffjfgpckjfblgknnhhcahecdj` (tetap, dari `key` di manifest).

## Pengingat absen (1.2.0)
Senin–Jumat, 15 menit sebelum absen masuk ditutup dan 15 menit sebelum absen pulang dibuka (jam dari
shift yang dipilih di test-shelia; awalnya 08:00 / 17:00). Pengingat tidak muncul untuk yang sudah
selesai hari ini. Klik notifikasi membuka halaman Absen; kalau log belum dikirim, Generate berjalan
otomatis bila Pengaturan Generate sudah diisi. Hanya jam dan status selesai/belum yang disimpan di
ekstensi, tidak ada token. Chrome harus menyala agar pengingat muncul.

Setiap kali ekstensi dipasang atau di-reload, muncul satu notifikasi "Pengingat absen aktif" berisi
jadwal pengingat berikutnya. Kalau notifikasi itu tidak muncul, buka System Settings → Notifications →
Google Chrome di Mac: nyalakan Allow notifications, dan pilih gaya Persistent (di macOS lama: Alerts) supaya
notifikasi tetap di layar sampai ditutup. Cek juga Focus / Do Not Disturb tidak sedang aktif.
