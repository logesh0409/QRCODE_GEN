# My Certificates + QR code

Upload your certificate (PNG/JPG/PDF) in /admin. You get a QR code. Scanning the QR opens
a page that shows your stored certificate.

## Run
    npm install
    ADMIN_PASSWORD=yourpassword npm start
Open http://localhost:3000/admin  (user: admin)

## Deploy (needed for QR to work on other phones)
Deploy to Render / Railway / VPS and set BASE_URL=https://your-site.com, then upload
and generate QR codes AFTER deploying. Uploaded files must be on a persistent disk.
