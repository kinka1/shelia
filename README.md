# Shelia test site

Situs uji (dev-only) di belakang Cloudflare Access. Isinya: check-in/check-out Shelia, log harian MagangHub,
riwayat, dan API log. Semua dilayani dari satu aplikasi React di `/`.

## Struktur

- `web-app/`: aplikasi React (Vite + TypeScript), dibuild ke `web-app/dist`
- `nginx.conf`: melayani SPA dan mem-proxy `/api/` (Shelia) dan `/maganghub-api/` (MagangHub, hanya baca)
- `docker-compose.yml`: container `web` (nginx)
- `deploy.sh`: build, sync ke VPS, validasi nginx, recreate container
- `docs/`: catatan desain dan rencana (riwayat)

## Pengembangan

```
cd web-app && npm i && npm run dev
```

## Tes

```
cd web-app && npx vitest run
```

## Deploy

```
./deploy.sh
```

Skrip ini build `web-app` di Mac, mengirim `web-app/dist/`, `nginx.conf` dan `docker-compose.yml` ke VPS lewat tar,
menjalankan `nginx -t` di container sementara, lalu recreate `web`.
Direktori `app/` di VPS tidak pernah disentuh.
