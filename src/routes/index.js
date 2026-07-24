const express = require('express');
const authRoutes = require('./auth/auth.routes');
const superAdminRoutes = require('./super-admin/super-admin.routes');
const clientRoutes = require('./client/client.routes');
const agentRoutes = require('./agent/agent.routes');

const router = express.Router();

// Register auth-related endpoints
router.use('/auth', authRoutes);

// Register super-admin-related endpoints
router.use('/super-admin', superAdminRoutes);

// Register client portal endpoints
router.use('/client', clientRoutes);

// Register agent portal endpoints
router.use('/agent', agentRoutes);

// Register system settings support endpoint
const { getSupportSettings } = require('../controllers/super-admin/settings.controller');
router.get('/system-settings/support', getSupportSettings);

// Document Proxy to bypass CORS issues when downloading/previewing files from Cloudinary
const https = require('https');
const AppError = require('../utils/AppError');

router.get('/documents/proxy', (req, res, next) => {
  const { url, download } = req.query;

  if (!url) {
    return next(new AppError('URL parameter is required', 400));
  }

  // Ensure it's a Cloudinary URL to prevent SSRF
  if (!url.startsWith('https://res.cloudinary.com/')) {
    return next(new AppError('Access denied. Only Cloudinary URLs can be proxied.', 403));
  }

  https.get(url, (cloudinaryRes) => {
    const contentType = cloudinaryRes.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    const filename = url.split('/').pop().split('?')[0] || 'document.pdf';

    if (download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }

    cloudinaryRes.pipe(res);
  }).on('error', (err) => {
    console.error('[Document Proxy Error]:', err.message);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve the document.'
    });
  });
});

module.exports = router;
