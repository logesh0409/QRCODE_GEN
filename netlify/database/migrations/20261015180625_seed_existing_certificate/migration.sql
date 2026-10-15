-- Carry over the certificate uploaded with the original Express version so its printed QR code keeps working.
INSERT INTO "certificates" ("id", "title", "file", "content_type")
VALUES ('86C3533A0D81', 'POWER PLANT ENGINEERING', 'legacy/e1a12fca909e4b84.jpeg', 'image/jpeg')
ON CONFLICT ("id") DO NOTHING;
