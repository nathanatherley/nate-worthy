// Photo upload/serving via Cloudflare R2 (S3-compatible), replacing the
// base64-in-database approach with real object storage. R2's S3-compatible
// API means the standard AWS SDK works against it directly.
const express = require('express');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();
router.use(requireAuth);

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET_NAME || 'nate-worthy-photos';

// POST /api/photos  body: { dataUrl: "data:image/jpeg;base64,..." }
// Accepts the same compressed base64 data URL the frontend already produces
// (no frontend compression logic needs to change), decodes it server-side,
// and uploads the actual bytes to R2 instead of storing them as text.
router.post('/', async (req, res) => {
  const { dataUrl } = req.body;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return res.status(400).json({ error: 'expected an image data URL' });

  try {
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'malformed data URL' });
    const [, ext, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');
    const key = `photos/${req.userId}/${crypto.randomUUID()}.${ext}`;

    await r2.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: `image/${ext}`,
    }));

    res.json({ key });
  } catch (e) {
    console.error('photo upload failed', e);
    res.status(500).json({ error: 'photo upload failed' });
  }
});

// GET /api/photos/:key(*) — returns a short-lived signed URL to view the photo,
// rather than proxying the bytes through your own server.
router.get('/*', async (req, res) => {
  const key = req.params[0];
  try {
    const url = await getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });
    res.json({ url });
  } catch (e) {
    console.error('photo url failed', e);
    res.status(500).json({ error: 'photo url failed' });
  }
});

// DELETE /api/photos/:key(*)
router.delete('/*', async (req, res) => {
  const key = req.params[0];
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    res.json({ deleted: true });
  } catch (e) {
    console.error('photo delete failed', e);
    res.status(500).json({ error: 'photo delete failed' });
  }
});

module.exports = router;
