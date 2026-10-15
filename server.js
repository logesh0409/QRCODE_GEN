const express = require("express");
const QRCode = require("qrcode");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const DB_FILE = path.join(__dirname, "data", "certificates.json");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const ALLOWED = { ".png": 1, ".jpg": 1, ".jpeg": 1, ".webp": 1, ".pdf": 1 };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(8).toString("hex") + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, !!ALLOWED[path.extname(file.originalname).toLowerCase()]),
});

app.use(express.urlencoded({ extended: true }));
app.use("/files", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));

const load = () => (fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : []);
const save = (rows) => fs.writeFileSync(DB_FILE, JSON.stringify(rows, null, 2));
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const baseUrl = (req) => process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
const newId = () => crypto.randomBytes(6).toString("hex").toUpperCase(); // e.g. 9F3A1C7B20D4

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const [u, p] = Buffer.from(h.split(" ")[1] || "", "base64").toString().split(":");
  if (u === ADMIN_USER && p === ADMIN_PASSWORD) return next();
  res.set("WWW-Authenticate", 'Basic realm="Admin"').status(401).send("Login required");
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="/style.css"></head><body>${body}</body></html>`;

// ---- Public: what the QR code opens ----
app.get("/c/:id", (req, res) => {
  const c = load().find((x) => x.id === req.params.id.toUpperCase());
  if (!c) return res.status(404).send(page("Not found", `<main class="wrap"><div class="bad"><h1>Certificate not found</h1></div></main>`));
  const url = `/files/${c.file}`;
  const isPdf = c.file.endsWith(".pdf");
  res.send(page(c.title, `<main class="wrap"><h2>${esc(c.title)}</h2>
    ${isPdf ? `<iframe src="${url}" class="pdf"></iframe><p><a href="${url}">Open PDF</a></p>` : `<img src="${url}" class="full" alt="${esc(c.title)}">`}
    <p><a href="${url}" download>Download certificate</a></p></main>`));
});

app.get("/qr/:id.png", async (req, res) => {
  const png = await QRCode.toBuffer(`${baseUrl(req)}/c/${req.params.id}`, { width: 500, margin: 2 });
  res.type("png").send(png);
});

// ---- Admin: upload certificate + get QR ----
app.get("/admin", auth, (req, res) => {
  const rows = load().map((c) => `<tr><td>${esc(c.title)}</td><td><a href="/c/${c.id}" target="_blank">View</a></td>
    <td><a href="/qr/${c.id}.png" download="${c.id}.png">Download QR</a></td>
    <td><form method="post" action="/admin/delete/${c.id}" onsubmit="return confirm('Delete?')"><button class="del">Delete</button></form></td></tr>`).join("");
  res.send(page("Admin", `<main class="wrap"><h1>Upload certificate</h1>
    <form method="post" action="/admin/upload" enctype="multipart/form-data" class="form">
      <input name="title" placeholder="Title (e.g. Power Plant Engineering - NPTEL)" required>
      <input type="file" name="file" accept=".png,.jpg,.jpeg,.webp,.pdf" required>
      <button>Upload &amp; generate QR</button>
    </form>
    <h2>My certificates</h2><table><tr><th>Title</th><th>Page</th><th>QR</th><th></th></tr>${rows}</table></main>`));
});

app.post("/admin/upload", auth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).send(page("Error", `<main class="wrap"><p>Upload a PNG, JPG, WEBP or PDF (max 10 MB). <a href="/admin">Back</a></p></main>`));
  const c = { id: newId(), title: (req.body.title || "Certificate").trim(), file: req.file.filename };
  const rows = load(); rows.push(c); save(rows);
  res.redirect(`/admin/done/${c.id}`);
});

app.post("/admin/delete/:id", auth, (req, res) => {
  const rows = load(); const c = rows.find((x) => x.id === req.params.id);
  if (c) { fs.rmSync(path.join(UPLOAD_DIR, c.file), { force: true }); save(rows.filter((x) => x !== c)); }
  res.redirect("/admin");
});

app.get("/admin/done/:id", auth, (req, res) => {
  const url = `${baseUrl(req)}/c/${req.params.id}`;
  res.send(page("Done", `<main class="wrap"><h1>Uploaded ✅</h1><p>Scan this QR to see your certificate:</p>
    <img src="/qr/${req.params.id}.png" width="260" alt="QR"><p><a href="${esc(url)}">${esc(url)}</a></p>
    <p><a href="/qr/${req.params.id}.png" download="${req.params.id}.png">Download QR (PNG)</a> · <a href="/admin">Back</a></p></main>`));
});

app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}  (admin: /admin)`));
