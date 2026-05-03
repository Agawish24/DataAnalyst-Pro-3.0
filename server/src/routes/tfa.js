const express = require('express');
const pool = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { generateSecret, generateURI, generate, verify } = require('otplib');
const QRCode = require('qrcode');

const router = express.Router();

const doSetup = async (req, res) => {
  try {
    const secret = await generateSecret();
    const user = await pool.query('SELECT email FROM users WHERE id=$1', [req.user.id]);
    const email = user.rows[0]?.email || req.user.email;
    const otpauth = await generateURI({ secret, label: email, issuer: 'DataAnalysisSuite' });
    const qrCode = await QRCode.toDataURL(otpauth);
    await pool.query(
      'INSERT INTO tfa_secrets (user_id, secret) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET secret=$2, is_verified=false',
      [req.user.id, secret]
    );
    res.json({ secret, qrCode, otpauth, message: 'Scan QR code with Google Authenticator or Authy' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

router.get('/setup', authenticate, doSetup);
router.post('/setup', authenticate, doSetup);

router.post('/verify', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    const r = await pool.query('SELECT * FROM tfa_secrets WHERE user_id=$1', [req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: '2FA not set up' });
    const result = await verify({ token, secret: r.rows[0].secret });
    const isValid = result?.valid ?? result;
    if (!isValid) return res.status(401).json({ error: 'Invalid token' });
    await pool.query('UPDATE tfa_secrets SET is_verified=true WHERE user_id=$1', [req.user.id]);
    res.json({ verified: true, message: '2FA enabled successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/validate', authenticate, async (req, res) => {
  try {
    const { token } = req.body;
    const r = await pool.query('SELECT * FROM tfa_secrets WHERE user_id=$1 AND is_verified=true', [req.user.id]);
    if (!r.rows.length) return res.json({ required: false });
    if (!token) return res.status(400).json({ required: true, error: 'token required' });
    const result = await verify({ token, secret: r.rows[0].secret });
    const isValid = result?.valid ?? result;
    res.json({ valid: isValid, required: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/disable', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM tfa_secrets WHERE user_id=$1', [req.user.id]);
    res.json({ message: '2FA disabled' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/status', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT is_verified, created_at FROM tfa_secrets WHERE user_id=$1', [req.user.id]);
    res.json({ enabled: r.rows.length > 0 && r.rows[0].is_verified, setup: r.rows.length > 0, setupAt: r.rows[0]?.created_at });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
