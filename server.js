// Server statis kecil tanpa dependensi.
// Host dan port sengaja tetap: CORS di API dev hanya menerima origin http://localhost:5173.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 5173;
const FILES = {
  "/index.html": "text/html; charset=utf-8",
  "/app.js": "text/javascript; charset=utf-8",
  "/style.css": "text/css; charset=utf-8",
};

http
  .createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = pathname === "/" ? "/index.html" : pathname;
    const type = FILES[file];
    if (!type) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    fs.readFile(path.join(__dirname, file), (err, content) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Gagal membaca file");
        return;
      }
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(content);
    });
  })
  .listen(PORT, "localhost", () => {
    console.log(`Absensi Web berjalan di http://localhost:${PORT}`);
  });
