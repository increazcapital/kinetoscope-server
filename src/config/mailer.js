const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER || 'info@yieldiq.online';
const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || 'Yieldiq@0077';
const isSecure = process.env.SMTP_SECURE === 'true' || (process.env.SMTP_SECURE === undefined && smtpPort === 465);

console.log(`[SMTP Transporter Init] Host: ${smtpHost}, Port: ${smtpPort}, Secure: ${isSecure}, User: ${smtpUser}`);

/**
 * Hostinger SMTP Transporter with connection pooling
 */
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: isSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

/**
 * Verify transporter configuration on startup
 */
transporter.verify((error, success) => {
  if (error) {
    console.error(`[SMTP Connection/Auth Error] Failed to connect/authenticate with ${smtpHost}:${smtpPort} as ${smtpUser}:`, error.message);
  } else {
    console.log(`[SMTP Transporter Verified] Connection to ${smtpHost}:${smtpPort} (${smtpUser}) established successfully.`);
  }
});

module.exports = transporter;
