import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { desc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "../../db/index.js";
import { admins, certificates } from "../../db/schema.js";

const ALLOWED: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf",
};
const MAX_SIZE = 10 * 1024 * 1024;

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const newId = () => randomBytes(6).toString("hex").toUpperCase(); // e.g. 9F3A1C7B20D4
const files = () => getStore("certificates");
// Certificates migrated from the original Express app are served as static files from /legacy
const fileUrl = (file: string) => (file.startsWith("legacy/") ? `/${file}` : `/files/${file}`);

const page = (title: string, body: string, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="/style.css"></head><body>${body}</body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });

const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};
const checkPassword = (password: string, stored: string) => {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, "hex"));
};
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The admin login comes from ADMIN_PASSWORD (if set) or the account created on the first-time setup page
async function getAdmin() {
  const password = Netlify.env.get("ADMIN_PASSWORD");
  if (password) return { username: Netlify.env.get("ADMIN_USER") || "admin", check: (p: string) => safeEqual(p, password) };
  const [a] = await db.select().from(admins);
  return a && { username: a.username, check: (p: string) => checkPassword(p, a.passwordHash) };
}

function authorized(req: Request, admin: NonNullable<Awaited<ReturnType<typeof getAdmin>>>) {
  const h = req.headers.get("authorization") || "";
  const decoded = Buffer.from(h.split(" ")[1] || "", "base64").toString();
  const i = decoded.indexOf(":");
  return i > -1 && decoded.slice(0, i) === admin.username && admin.check(decoded.slice(i + 1));
}

const loginRequired = () => new Response("Login required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Admin"' } });

const setupPage = (error = "") => page("Create admin", `<main class="wrap"><h1>Create admin account</h1>
    <p>No admin exists yet. Choose the username and password you'll use to log in to <code>/admin</code>. This page disappears once the account is created.</p>
    ${error ? `<div class="bad"><p>${esc(error)}</p></div>` : ""}
    <form method="post" action="/admin/setup" class="form">
      <input name="username" placeholder="Username" value="admin" required autocomplete="username">
      <input type="password" name="password" placeholder="Password (min 8 characters)" minlength="8" required autocomplete="new-password">
      <input type="password" name="confirm" placeholder="Repeat password" minlength="8" required autocomplete="new-password">
      <button>Create admin</button>
    </form></main>`, error ? 400 : 200);

const redirect = (to: string) => new Response(null, { status: 303, headers: { location: to } });

export default async (req: Request) => {
  const url = new URL(req.url);
  const baseUrl = Netlify.env.get("BASE_URL") || url.origin;
  const p = url.pathname;
  let m: RegExpMatchArray | null;

  // ---- Public: what the QR code opens ----
  if ((m = p.match(/^\/c\/([^/]+)\/?$/))) {
    const [c] = await db.select().from(certificates).where(eq(certificates.id, m[1].toUpperCase()));
    if (!c) return page("Not found", `<main class="wrap"><div class="bad"><h1>Certificate not found</h1></div></main>`, 404);
    const src = fileUrl(c.file);
    const isPdf = c.contentType === "application/pdf";
    return page(c.title, `<main class="wrap"><h2>${esc(c.title)}</h2>
    ${isPdf ? `<iframe src="${src}" class="pdf"></iframe><p><a href="${src}">Open PDF</a></p>` : `<img src="${src}" class="full" alt="${esc(c.title)}">`}
    <p><a href="${src}" download>Download certificate</a></p></main>`);
  }

  if ((m = p.match(/^\/qr\/([^/]+)\.png$/))) {
    const png = await QRCode.toBuffer(`${baseUrl}/c/${m[1]}`, { width: 500, margin: 2 });
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  }

  if ((m = p.match(/^\/files\/([^/]+)$/))) {
    const [c] = await db.select().from(certificates).where(eq(certificates.file, m[1]));
    const data = c && (await files().get(m[1], { type: "arrayBuffer" }));
    if (!data) return new Response("Not found", { status: 404 });
    return new Response(data, { headers: { "content-type": c.contentType } });
  }

  // ---- Admin: upload certificate + get QR ----
  const admin = await getAdmin();
  if (!admin) {
    if (p === "/admin/setup" && req.method === "POST") {
      const form = await req.formData();
      const username = String(form.get("username") || "").trim();
      const password = String(form.get("password") || "");
      if (!username || username.includes(":")) return setupPage("Enter a username (it can't contain \":\").");
      if (password.length < 8) return setupPage("The password must be at least 8 characters.");
      if (password !== form.get("confirm")) return setupPage("The passwords don't match.");
      // id is always 1, so if someone else created the admin first this inserts nothing
      await db.insert(admins).values({ username, passwordHash: hashPassword(password) }).onConflictDoNothing();
      return redirect("/admin");
    }
    return setupPage();
  }
  if (!authorized(req, admin)) return loginRequired();

  if (p === "/admin" || p === "/admin/") {
    const rows = (await db.select().from(certificates).orderBy(desc(certificates.createdAt))).map((c) => `<tr><td>${esc(c.title)}</td><td><a href="/c/${c.id}" target="_blank">View</a></td>
    <td><a href="/qr/${c.id}.png" download="${c.id}.png">Download QR</a></td>
    <td><form method="post" action="/admin/delete/${c.id}" onsubmit="return confirm('Delete?')"><button class="del">Delete</button></form></td></tr>`).join("");
    return page("Admin", `<main class="wrap"><h1>Upload certificate</h1>
    <form method="post" action="/admin/upload" enctype="multipart/form-data" class="form">
      <input name="title" placeholder="Title (e.g. Power Plant Engineering - NPTEL)" required>
      <input type="file" name="file" accept=".png,.jpg,.jpeg,.webp,.pdf" required>
      <button>Upload &amp; generate QR</button>
    </form>
    <h2>My certificates</h2><table><tr><th>Title</th><th>Page</th><th>QR</th><th></th></tr>${rows}</table></main>`);
  }

  if (p === "/admin/upload" && req.method === "POST") {
    const form = await req.formData();
    const file = form.get("file");
    const ext = file instanceof File ? (file.name.match(/\.[^.]+$/)?.[0] || "").toLowerCase() : "";
    if (!(file instanceof File) || !ALLOWED[ext] || file.size > MAX_SIZE) {
      return page("Error", `<main class="wrap"><p>Upload a PNG, JPG, WEBP or PDF (max 10 MB). <a href="/admin">Back</a></p></main>`, 400);
    }
    const key = randomBytes(8).toString("hex") + ext;
    await files().set(key, await file.arrayBuffer());
    const id = newId();
    await db.insert(certificates).values({ id, title: String(form.get("title") || "").trim() || "Certificate", file: key, contentType: ALLOWED[ext] });
    return redirect(`/admin/done/${id}`);
  }

  if ((m = p.match(/^\/admin\/delete\/([^/]+)$/)) && req.method === "POST") {
    const [c] = await db.delete(certificates).where(eq(certificates.id, m[1])).returning();
    if (c && !c.file.startsWith("legacy/")) await files().delete(c.file);
    return redirect("/admin");
  }

  if ((m = p.match(/^\/admin\/done\/([^/]+)$/))) {
    const id = m[1];
    const link = `${baseUrl}/c/${id}`;
    return page("Done", `<main class="wrap"><h1>Uploaded ✅</h1><p>Scan this QR to see your certificate:</p>
    <img src="/qr/${esc(id)}.png" width="260" alt="QR"><p><a href="${esc(link)}">${esc(link)}</a></p>
    <p><a href="/qr/${esc(id)}.png" download="${esc(id)}.png">Download QR (PNG)</a> · <a href="/admin">Back</a></p></main>`);
  }

  return new Response("Not found", { status: 404 });
};

export const config: Config = {
  path: ["/c/*", "/qr/*", "/files/*", "/admin", "/admin/*"],
};
