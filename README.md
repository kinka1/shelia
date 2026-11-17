# Shelia test site

Situs uji (dev-only) di belakang Cloudflare Access. Isinya: check-in/check-out Shelia, log harian MagangHub,
riwayat, dan API log. Semua dilayani dari satu aplikasi React di `/`.

## Struktur

- `web-app/`: aplikasi React (Vite + TypeScript), dibuild ke `web-app/dist`
- `monev-mock/`: server Node kecil untuk log harian yang diposting aplikasi
- `nginx.conf`: melayani SPA dan mem-proxy `/api/`, `/maganghub-api/`, `/monev-api/`
- `docker-compose.yml`: container `web` (nginx) dan `monev-mock`
- `deploy.sh`: build, sync ke VPS, validasi nginx, recreate container
- `docs/`: catatan desain dan rencana (riwayat)

## Pengembangan

```
cd web-app && npm i && npm run dev
```

## Tes

```
node --test monev-mock/
cd web-app && npx vitest run
```

## Deploy

```
./deploy.sh
```

Skrip ini build `web-app` di Mac, rsync `web-app/dist/` (dengan `--delete`), `nginx.conf`, `docker-compose.yml`,
dan `monev-mock/` ke VPS, menjalankan `nginx -t` di container sementara, lalu recreate `web` dan `monev-mock`.
Direktori `app/` di VPS tidak pernah disentuh.
