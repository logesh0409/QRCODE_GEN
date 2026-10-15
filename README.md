# My Certificates + QR code

Upload your certificate (PNG/JPG/WEBP/PDF) in /admin. You get a QR code. Scanning the QR opens
a page that shows your stored certificate.

Runs on Netlify: certificate records live in Netlify Database, uploaded files in Netlify Blobs.

## Setup
In Netlify project settings, add an environment variable `ADMIN_PASSWORD` (optionally `ADMIN_USER`,
default `admin`, and `BASE_URL` if you use a custom domain), then redeploy.
Open https://<your-site>/admin and log in.

## Run locally
    npm install
    ADMIN_PASSWORD=yourpassword npx netlify dev
