const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST || 'smtp.titan.email';
const smtpPort = parseInt(process.env.SMTP_PORT || '465', 10);
const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER || 'info@kinetoscopefilms.com';
const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || 'Euorskm@4321';
const isSecure = process.env.SMTP_SECURE === 'true' || (process.env.SMTP_SECURE === undefined && smtpPort === 465);

console.log(`[SMTP Transporter Init] Host: ${smtpHost}, Port: ${smtpPort}, Secure: ${isSecure}, User: ${smtpUser}`);

/**
 * Titan Mail (BigRock) SMTP Transporter
 */
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: isSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
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
