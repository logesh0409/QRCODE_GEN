# My Certificates + QR code

Upload your certificate (PNG/JPG/WEBP/PDF) in /admin. You get a QR code. Scanning the QR opens
a page that shows your stored certificate.

Runs on Netlify: certificate records live in Netlify Database, uploaded files in Netlify Blobs.

## Setup
Open https://<your-site>/admin. The first time, it shows a "Create admin account" page: choose a
username and password. The account is stored in the database (password hashed) and the page then
disappears; from then on /admin asks you to log in with those details.

Alternatively, set `ADMIN_PASSWORD` (and optionally `ADMIN_USER`, default `admin`) as environment
variables in Netlify; they take priority over the stored account. Set `BASE_URL` if you use a custom domain.

## Run locally
    npm install
    ADMIN_PASSWORD=yourpassword npx netlify dev
