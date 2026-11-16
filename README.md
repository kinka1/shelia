# Absensi Web

Website sederhana untuk login, logout, check-in, dan check-out ke API absensi dev. Website ini mengikuti dokumentasi
API absensi web (`WEB_ATTENDANCE_API.md`), sebuah dokumen internal yang tidak disertakan di repo ini.

## Menjalankan

```
node server.js
```

Lalu buka **http://localhost:5173**.

Alamatnya harus persis `http://localhost:5173`. CORS di API dev hanya mengizinkan origin itu, jadi bila dibuka dari
`127.0.0.1`, port lain, atau langsung sebagai file, browser akan memblokir request ke API.

## Pengaturan

Ada di bagian `CONFIG` paling atas `app.js`:

- `API_BASE`: `https://dev-shelia.shelterapp2.co.id/api`
- `LAT`, `LNG`: koordinat tetap `-7.308430344545027, 112.785199930883`. Koordinat ini dikirim ke `user/today`,
  check-in, dan check-out. GPS browser tidak dipakai.

## Alur

1. Login dengan NIK dan password HRIS. Token disimpan di `localStorage`.
2. Halaman absen memanggil `user/today`, dan `next_action` menentukan tombol yang tampil.
3. Untuk check-in, pengguna memilih shift (bila site punya shift), mengambil foto wajah (bila face recognition aktif),
   dan mengisi alasan (bila di luar area). Website lalu memanggil `face/verify` dan setelah itu `check-in`.
4. Untuk check-out, langkahnya sama, memakai `attendance_id` dari sesi yang sedang terbuka.
5. Setelah 3 kali gagal verifikasi wajah, absen bisa dikirim lewat jalur bypass. Absen itu masuk HR review.
