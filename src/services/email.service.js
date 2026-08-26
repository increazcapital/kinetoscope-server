const transporter = require('../config/mailer');
const SystemSetting = require('../models/SystemSetting.model');

const SUPPORT_EMAIL = process.env.SMTP_USER || process.env.EMAIL_USER || 'info@yieldiq.online';
const DEFAULT_LOGO_URL = 'https://res.cloudinary.com/j8ksidlp/image/upload/v1787742111/yieldiq/branding/plj7gxzrff24hn1dfhkq.png';

/**
 * Fetch dynamic branding directly from MongoDB SystemSetting
 */
async function getBranding() {
  try {
    const setting = await SystemSetting.findOne({ key: 'system_config' }).lean();
    return {
      companyName: (setting && setting.companyName) ? setting.companyName.trim() : 'YieldIQ',
      tagline: (setting && setting.tagline) ? setting.tagline.trim() : '',
      logoUrl: (setting && setting.logoUrl) ? setting.logoUrl.trim() : DEFAULT_LOGO_URL,
    };
  } catch (_) {
    return {
      companyName: 'YieldIQ',
      tagline: '',
      logoUrl: DEFAULT_LOGO_URL,
    };
  }
}

/**
 * Universal Master Responsive Luxury Light Email Template Generator
 * YieldIQ Clean High-End Financial Luxury Aesthetic
 */
const buildLightEmailTemplate = async ({
  title,
  subtitle,
  contentHtml,
  bannerAccent = '#F5A800',
  actionButton,
  companyName,
  tagline,
  logoSrc
}) => {
  const branding = await getBranding();
  const effectiveCompanyName = companyName || branding.companyName || 'YieldIQ';
  const effectiveTagline = tagline !== undefined ? tagline : branding.tagline;
  const effectiveLogoSrc = logoSrc || branding.logoUrl || DEFAULT_LOGO_URL;

  return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
        <title>${title || effectiveCompanyName}</title>
        <style type="text/css">
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');
          
          body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
          img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
          
          body {
            margin: 0 !important;
            padding: 32px 12px !important;
            background-color: #F8FAFC !important;
            font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
            -webkit-font-smoothing: antialiased;
            color: #1E293B;
          }
          
          @media only screen and (max-width: 600px) {
            .email-wrapper {
              width: 100% !important;
              max-width: 100% !important;
            }
            .content-box {
              padding: 24px 18px !important;
            }
            .header-box {
              padding: 24px 18px !important;
            }
            .action-btn {
              width: 100% !important;
              display: block !important;
              box-sizing: border-box !important;
              text-align: center !important;
            }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 32px 12px; background-color: #F8FAFC; font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <center>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 580px; margin: 0 auto;" class="email-wrapper">
            <tr>
              <td style="background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 24px rgba(11, 31, 77, 0.06);">
                
                <!-- Gold Top Brand Accent Strip -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="background: linear-gradient(90deg, #0B1F4D 0%, #123A78 50%, #F5A800 100%); height: 4px; line-height: 4px; font-size: 4px;">&nbsp;</td>
                  </tr>
                </table>

                <!-- Clean, Sleek, Luxury White Header with Large Prominent Logo -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td class="header-box" style="background-color: #FFFFFF; padding: 32px 24px 22px 24px; text-align: center; border-bottom: 1px solid #F1F5F9;">
                      
                      <!-- Prominent Logo -->
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto;">
                        <tr>
                          <td align="center">
                            <img src="${effectiveLogoSrc}" alt="${effectiveCompanyName}" width="220" style="height: 56px; max-height: 56px; width: auto; max-width: 240px; object-fit: contain; display: block; margin: 0 auto; border: 0;" />
                          </td>
                        </tr>
                      </table>

                      ${effectiveTagline ? `
                        <div style="font-size: 11px; font-weight: 700; color: #123A78; letter-spacing: 2px; text-transform: uppercase; margin-top: 14px; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;">
                          ${effectiveTagline}
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                </table>

                <!-- Main Content Area -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td class="content-box" style="padding: 32px 36px 28px 36px; background-color: #FFFFFF;">
                      ${title ? `
                        <h1 style="color: #0B1F4D; font-size: 21px; font-weight: 800; margin: 0 0 8px 0; text-align: center; letter-spacing: -0.4px; line-height: 1.35; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;">
                          ${title}
                        </h1>
                      ` : ''}

                      ${subtitle ? `
                        <p style="color: #64748B; font-size: 14px; text-align: center; margin: 0 0 24px 0; line-height: 1.55; font-weight: 400;">
                          ${subtitle}
                        </p>
                      ` : ''}

                      ${contentHtml}

                      ${actionButton ? `
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 28px auto 8px auto;">
                          <tr>
                            <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #F5A800 0%, #E09800 100%); box-shadow: 0 4px 16px rgba(245, 168, 0, 0.35);">
                              <a href="${actionButton.url}" class="action-btn" target="_blank" style="background: linear-gradient(135deg, #F5A800 0%, #E09800 100%); color: #0B1F4D; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 14px; display: inline-block; letter-spacing: 0.3px; border: 1px solid #E09800; font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;">
                                ${actionButton.text} &rarr;
                              </a>
                            </td>
                          </tr>
                        </table>
                      ` : ''}
                    </td>
                  </tr>
                </table>

                <!-- Professional Footer -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="padding: 22px 24px; background-color: #F8FAFC; border-top: 1px solid #EDF2F7; text-align: center;">
                      <div style="font-size: 12px; font-weight: 800; color: #0B1F4D; margin: 0; letter-spacing: 0.2px;">
                        ${effectiveCompanyName} &bull; Official Account Notification
                      </div>
                      <p style="margin: 6px 0 0 0; font-size: 11px; color: #64748B; line-height: 1.6;">
                        Need assistance? Contact our team at <a href="mailto:${SUPPORT_EMAIL}" style="color: #D97706; text-decoration: none; font-weight: 700;">${SUPPORT_EMAIL}</a><br/>
                        This is an automated system notification. Please do not reply directly to this email.
                      </p>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>
          </table>
        </center>
      </body>
    </html>
  `;
};

/**
 * Premium Light Theme OTP Email HTML Template Generator
 */
const buildOtpEmailHtml = async ({ title, subtitle, otp, expiryMinutes = 5, note, companyName, tagline, logoSrc }) => {
  const contentHtml = `
    <div style="background: #FFFDF5; border: 1.5px solid #F5A800; border-radius: 12px; padding: 20px 16px; text-align: center; margin: 0 0 20px 0; box-shadow: 0 2px 10px rgba(245, 168, 0, 0.08);">
      <div style="font-size: 10px; font-weight: 800; color: #123A78; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px;">
        SECURE VERIFICATION CODE
      </div>
      <div style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0B1F4D; font-family: 'Plus Jakarta Sans', monospace; margin-left: 10px;">
        ${otp}
      </div>
    </div>

    <div style="background-color: #F8FAFC; border-left: 3px solid #F5A800; padding: 12px 16px; border-radius: 8px; margin-bottom: 18px; border: 1px solid #E2E8F0; border-left-width: 3px;">
      <p style="margin: 0; color: #334155; font-size: 12.5px; line-height: 1.5;">
        🔒 This verification code is valid for <strong>${expiryMinutes} minutes</strong>. Never share this OTP with anyone.
      </p>
    </div>

    ${note ? `<p style="color: #64748B; font-size: 12.5px; text-align: center; margin: 0 0 10px 0;">${note}</p>` : ''}
    <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
      If you did not request this OTP, please secure your account or contact support immediately.
    </p>
  `;

  return await buildLightEmailTemplate({
    title,
    subtitle,
    contentHtml,
    bannerAccent: '#F5A800',
    companyName,
    tagline,
    logoSrc
  });
};

/**
 * Dispatch templates or custom messages using mailer configuration
 */
const sendEmail = async (options) => {
  const defaultFrom = process.env.EMAIL_FROM || `YieldIQ <${SUPPORT_EMAIL}>`;

  const mailOptions = {
    from: options.from || defaultFrom,
    replyTo: options.replyTo || SUPPORT_EMAIL,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments || [],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP sendMail Response] To: ${options.to} | MessageID: ${info.messageId} | Server Response: ${info.response || 'OK'}`);
    if (info.rejected && info.rejected.length > 0) {
      console.warn(`[SMTP Warning] Email was rejected by server for recipients:`, info.rejected);
    }
    return info;
  } catch (error) {
    console.error(`[SMTP sendMail Error] Failed to deliver email to ${options.to}:`, error.message);
    throw error;
  }
};

/**
 * Send a formatted OTP email for email change verification.
 */
const sendChangeEmailOtp = async (toEmail, otp, newEmail) => {
  const branding = await getBranding();
  const subject = `${branding.companyName} – Email Change OTP Verification`;
  const text = `Your OTP for email address change is: ${otp}\nRequested new email: ${newEmail}\nValid for 5 minutes. Do not share it with anyone. — ${branding.companyName}`;

  const html = await buildOtpEmailHtml({
    title: 'Email Address Change Verification',
    subtitle: `You requested to update your registered email to <strong>${newEmail}</strong>.`,
    otp,
    expiryMinutes: 5,
    note: 'Enter this 6-digit code in your portal to confirm your new email.',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  return sendEmail({ to: toEmail, subject, text, html });
};

/**
 * Send OTP email for password change verification.
 */
const sendChangePasswordOtp = async (toEmail, otp) => {
  const branding = await getBranding();
  const subject = `${branding.companyName} – Password Change OTP Verification`;
  const text = `Your OTP for password change is: ${otp}\nValid for 5 minutes. Do not share it with anyone. — ${branding.companyName}`;

  const html = await buildOtpEmailHtml({
    title: 'Password Reset Verification',
    subtitle: 'You requested a password change for your account. Use the code below to authorize this request.',
    otp,
    expiryMinutes: 5,
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  return sendEmail({ to: toEmail, subject, text, html });
};

/**
 * Dispatch a sleek, professional welcome email with credentials to onboarding Clients and Agents
 */
const sendWelcomeEmail = async (toEmail, name, code, tempPassword, customLoginUrl) => {
  const branding = await getBranding();
  const isAgent = code && (code.toString().toUpperCase().includes('AGT') || code.toString().toUpperCase().includes('AG-') || code.toString().toUpperCase().includes('AGENT'));

  const clientLoginUrl = process.env.CLIENT_PORTAL_URL || 'https://cp.kinetoscopefilms.com/login';
  const agentLoginUrl = process.env.AGENT_PORTAL_URL || 'https://partner.kinetoscopefilms.com';
  
  const loginUrl = customLoginUrl || (isAgent ? agentLoginUrl : clientLoginUrl);
  const portalName = isAgent ? 'Agent Partner Portal' : 'Investor Portal';
  const subject = isAgent 
    ? `${branding.companyName} – Welcome to Partner Portal (Your Account Details)`
    : `${branding.companyName} – Welcome to Your Investor Portal (Account Credentials)`;

  const text = `Hello ${name},\n\nWelcome to ${branding.companyName}.\n${isAgent ? 'Agent Code' : 'Client Code'}: ${code}\nEmail: ${toEmail}\nPassword: ${tempPassword}\nPortal Login URL: ${loginUrl}\n\nBest regards,\n${branding.companyName}`;

  const contentHtml = `
    <div style="background: #F8FAFC; border-radius: 12px; padding: 20px 22px; border: 1px solid #E2E8F0; margin: 18px 0;">
      <table style="width: 100%; font-size: 13.5px; border-collapse: collapse; font-family: 'Plus Jakarta Sans', sans-serif;">
        <tr style="border-bottom: 1px solid #EDF2F7;">
          <td style="padding: 10px 0; color: #64748B; font-weight: 600; width: 140px;">${isAgent ? 'Agent Code:' : 'Client Code:'}</td>
          <td style="padding: 10px 0; color: #0B1F4D; font-family: 'Plus Jakarta Sans', monospace; font-size: 15px; font-weight: 800;">${code}</td>
        </tr>
        <tr style="border-bottom: 1px solid #EDF2F7;">
          <td style="padding: 10px 0; color: #64748B; font-weight: 600;">Login Email:</td>
          <td style="padding: 10px 0; color: #0F172A; font-weight: 700;">${toEmail}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #64748B; font-weight: 600;">Temporary Password:</td>
          <td style="padding: 10px 0; color: #0B1F4D; font-family: 'Plus Jakarta Sans', monospace; font-size: 15px; font-weight: 800;">${tempPassword}</td>
        </tr>
      </table>
    </div>
  `;

  const html = await buildLightEmailTemplate({
    title: `Welcome aboard, ${name}!`,
    subtitle: `Your official ${portalName} account has been activated. Use your credentials below to access your dashboard:`,
    contentHtml,
    actionButton: { text: `Log In to ${portalName}`, url: loginUrl },
    bannerAccent: '#F5A800',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  if (isAgent) {
    return sendEmail({ to: toEmail, subject, text, html });
  }

  return trackAndSendSystemEmail('new_investor_onboarded', {
    to: toEmail,
    subject,
    text,
    html,
    recipientGroup: 'Individual',
    targetSummary: `${name} (${code})`,
    templateName: 'Welcome Investor Kit'
  });
};

/**
 * Send credentials email for password reset or resend credentials scenarios.
 */
const sendCredentialsEmail = async (toEmail, clientName, clientCode, tempPassword, customLoginUrl) => {
  const branding = await getBranding();
  const isAgent = clientCode && (clientCode.toString().toUpperCase().includes('AGT') || clientCode.toString().toUpperCase().includes('AG-') || clientCode.toString().toUpperCase().includes('AGENT'));
  const clientLoginUrl = process.env.CLIENT_PORTAL_URL || 'https://cp.kinetoscopefilms.com/login';
  const agentLoginUrl = process.env.AGENT_PORTAL_URL || 'https://partner.kinetoscopefilms.com';
  const loginUrl = customLoginUrl || (isAgent ? agentLoginUrl : clientLoginUrl);
  const portalName = isAgent ? 'Agent Partner Portal' : 'Investor Portal';

  const subject = `${branding.companyName} – Your Sign-in Credentials`;
  const text = `Hello ${clientName},\n\nYour sign-in credentials for ${branding.companyName} are:\nCode: ${clientCode}\nEmail: ${toEmail}\nPassword: ${tempPassword}\nPortal Login URL: ${loginUrl}\n\nBest regards,\n${branding.companyName}`;

  const contentHtml = `
    <div style="background: #F8FAFC; border-radius: 12px; padding: 20px 22px; border: 1px solid #E2E8F0; margin: 18px 0;">
      <table style="width: 100%; font-size: 13.5px; border-collapse: collapse; font-family: 'Plus Jakarta Sans', sans-serif;">
        <tr style="border-bottom: 1px solid #EDF2F7;">
          <td style="padding: 10px 0; color: #64748B; font-weight: 600; width: 140px;">Account Code:</td>
          <td style="padding: 10px 0; color: #0B1F4D; font-family: 'Plus Jakarta Sans', monospace; font-size: 15px; font-weight: 800;">${clientCode}</td>
        </tr>
        <tr style="border-bottom: 1px solid #EDF2F7;">
          <td style="padding: 10px 0; color: #64748B; font-weight: 600;">Login Email:</td>
          <td style="padding: 10px 0; color: #0F172A; font-weight: 700;">${toEmail}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #64748B; font-weight: 600;">Password:</td>
          <td style="padding: 10px 0; color: #0B1F4D; font-family: 'Plus Jakarta Sans', monospace; font-size: 15px; font-weight: 800;">${tempPassword}</td>
        </tr>
      </table>
    </div>
  `;

  const html = await buildLightEmailTemplate({
    title: 'Your Account Credentials',
    subtitle: `Hello <strong>${clientName}</strong>, below are your verified account credentials:`,
    contentHtml,
    actionButton: { text: `Log in to ${portalName}`, url: loginUrl },
    bannerAccent: '#F5A800',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  return sendEmail({ to: toEmail, subject, text, html });
};

const sendTransactionRequestAlertToAdmin = async (superAdminEmails, clientName, clientCode, transactionDetails) => {
  const branding = await getBranding();
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || SUPPORT_EMAIL;
  const targetEmails = Array.from(new Set([...(superAdminEmails || []), adminEmail])).filter(Boolean);
  const typeLabel = transactionDetails.type.toUpperCase();
  const subject = `${branding.companyName} – Pending ${typeLabel} Request: ${clientName} (${clientCode})`;

  const text = `New ${transactionDetails.type} request from ${clientName} (${clientCode}). Amount: INR ${transactionDetails.amount}.\n— ${branding.companyName}`;

  const contentHtml = `
    <div style="background: #FFFDF5; border-left: 4px solid #F5A800; border-radius: 10px; padding: 18px; margin: 16px 0; border: 1px solid #FDE68A; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 14px; font-weight: 700;">Client: ${clientName} (${clientCode})</p>
      <p style="margin: 0; color: #334155; font-size: 14px;">Requested Amount: <strong style="color: #0B1F4D; font-size: 16px;">₹${Number(transactionDetails.amount || 0).toLocaleString('en-IN')}</strong></p>
    </div>
    <p style="color: #64748B; font-size: 12.5px; text-align: center; margin-top: 14px;">Please review and process this request in your Super Admin Control Center.</p>
  `;

  const html = await buildLightEmailTemplate({
    title: `Pending ${typeLabel} Action Required`,
    subtitle: 'A new financial transaction request requires Super Admin approval.',
    contentHtml,
    bannerAccent: '#F5A800',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  await Promise.allSettled(
    targetEmails.map((email) => sendEmail({ to: email, subject, text, html }))
  );
};

const sendTransactionStatusNotification = async (toEmail, clientName, transactionDetails, status, rejectionReason) => {
  const branding = await getBranding();
  const isApproved = status === 'approved';
  const actionLabel = isApproved ? 'Approved' : 'Rejected';
  const typeLabel = transactionDetails.type.toUpperCase();
  const subject = `${branding.companyName} – Your ${typeLabel} Request has been ${actionLabel}`;

  const text = `Hello ${clientName}, Your ${transactionDetails.type} of INR ${transactionDetails.amount} has been ${actionLabel}.\n— ${branding.companyName}`;

  const contentHtml = `
    <div style="background: ${isApproved ? '#F0FDF4' : '#FEF2F2'}; border-left: 4px solid ${isApproved ? '#10B981' : '#EF4444'}; border-radius: 10px; padding: 18px; margin: 16px 0; border: 1px solid ${isApproved ? '#BBF7D0' : '#FECACA'}; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 14px; font-weight: 700;">Request Type: ${transactionDetails.type}</p>
      <p style="margin: 0 0 6px 0; color: #334155; font-size: 14px;">Amount: <strong style="color: ${isApproved ? '#0B1F4D' : '#DC2626'}; font-size: 16px;">₹${Number(transactionDetails.amount || 0).toLocaleString('en-IN')}</strong></p>
      <p style="margin: 0; color: #334155; font-size: 14px;">Status: <strong style="color: ${isApproved ? '#059669' : '#DC2626'}; text-transform: uppercase;">${actionLabel}</strong></p>
      ${!isApproved && rejectionReason ? `<p style="margin: 10px 0 0 0; color: #DC2626; font-size: 13px; font-weight: 600;">Reason: ${rejectionReason}</p>` : ''}
    </div>
  `;

  const html = await buildLightEmailTemplate({
    title: `Transaction ${actionLabel}`,
    subtitle: `Hello <strong>${clientName}</strong>, your ${transactionDetails.type} request status has been updated.`,
    contentHtml,
    bannerAccent: isApproved ? '#10B981' : '#EF4444',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  const typeKey = transactionDetails.type.trim().toLowerCase() === 'deposit' ? 'deposit' : 'withdrawal';
  const statusKey = status.trim().toLowerCase() === 'approved' ? 'approved' : 'rejected';
  const triggerKey = `${typeKey}_${statusKey}`;

  return trackAndSendSystemEmail(triggerKey, {
    to: toEmail,
    subject,
    text,
    html,
    recipientGroup: 'Individual',
    targetSummary: `${clientName}`,
    templateName: 'Account Security Alert'
  });
};

const sendKycVerificationNotification = async (clientEmail, clientName, agentEmail, documentField, kycStatus) => {
  const branding = await getBranding();
  const isFullyVerified = kycStatus === 'VERIFIED';
  const subject = isFullyVerified ? `${branding.companyName} – KYC Verification Complete` : `${branding.companyName} – Document Verified: ${documentField}`;
  const text = `Hello ${clientName}, KYC status: ${kycStatus}.\n— ${branding.companyName}`;

  const contentHtml = `
    <div style="background: #F0FDF4; border-left: 4px solid #10B981; border-radius: 10px; padding: 18px; margin: 16px 0; border: 1px solid #BBF7D0; border-left-width: 4px;">
      <p style="margin: 0; color: #065F46; font-size: 14.5px; font-weight: 700;">
        ${isFullyVerified ? '🎉 Your KYC is fully verified and active!' : `Document Verified: <strong>${documentField}</strong>`}
      </p>
    </div>
  `;

  const html = await buildLightEmailTemplate({
    title: 'Compliance Verification Status Update',
    subtitle: `Hello <strong>${clientName}</strong>, your profile compliance verification status has been updated.`,
    contentHtml,
    bannerAccent: '#10B981',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  await sendEmail({ to: clientEmail, subject, text, html });

  if (agentEmail) {
    await sendEmail({ to: agentEmail, subject: `[Agent Copy] KYC Update – ${clientName}`, text, html });
  }
};

const sendInvestmentAssignmentNotification = async (clientEmail, clientName, agentEmail, investmentDetails) => {
  const branding = await getBranding();
  const projectOrSegment = investmentDetails.projectName || investmentDetails.segment || 'Investment Portfolio';
  const subject = `${branding.companyName} – Investment Portfolio Assigned (${projectOrSegment})`;
  const text = `Hello ${clientName}, investment of INR ${investmentDetails.investmentAmount} assigned.\n— ${branding.companyName}`;

  const contentHtml = `
    <div style="background: #F8FAFC; border-left: 4px solid #0B1F4D; border-radius: 10px; padding: 18px; margin: 16px 0; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 14px; font-weight: 700;">Portfolio / Project: ${projectOrSegment}</p>
      <p style="margin: 0 0 6px 0; color: #334155; font-size: 14px;">Assigned Capital: <strong style="color: #0B1F4D; font-size: 16px;">₹${Number(investmentDetails.investmentAmount || 0).toLocaleString('en-IN')}</strong></p>
      <p style="margin: 0; color: #334155; font-size: 13.5px;">Expected Monthly ROI: <strong style="color: #F5A800; font-size: 14px;">${investmentDetails.roiPercentage || 1.5}%</strong></p>
    </div>
    <p style="font-size: 13.5px; color: #475569; line-height: 1.6;">
      Your portfolio allocation has been configured. You can monitor your investment performance, payouts, and certificate statements in your Investor Portal.
    </p>
  `;

  const html = await buildLightEmailTemplate({
    title: 'New Investment Portfolio Activated',
    subtitle: `Hello <strong>${clientName}</strong>, a new investment segment allocation has been activated on your account.`,
    contentHtml,
    bannerAccent: '#F5A800',
    companyName: branding.companyName,
    tagline: branding.tagline,
    actionButton: {
      url: process.env.CLIENT_PORTAL_URL || 'https://cp.kinetoscopefilms.com/login',
      text: 'View Portfolio in Investor Portal'
    }
  });

  await trackAndSendSystemEmail('investment_assigned', {
    to: clientEmail,
    subject,
    text,
    html,
    recipientGroup: 'Individual',
    targetSummary: `${clientName}`,
    templateName: 'Welcome Investor Kit'
  });

  if (agentEmail) {
    await sendEmail({ to: agentEmail, subject: `[Agent Copy] Investment Assigned – ${clientName}`, text, html });
  }
};

const sendRoiPayoutNotification = async (clientEmail, clientName, agentEmail, payoutDetails) => {
  const branding = await getBranding();
  const subject = `${branding.companyName} – Monthly ROI Payout Credited (${payoutDetails.payoutMonth})`;
  const text = `Hello ${clientName}, ROI Payout for ${payoutDetails.payoutMonth} of INR ${payoutDetails.amount} is PAID.\n— ${branding.companyName}`;

  const contentHtml = `
    <div style="background: #FFFDF5; border-left: 4px solid #F5A800; border-radius: 10px; padding: 18px; margin: 16px 0; border: 1px solid #FFE7A3; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 14px; font-weight: 700;">Payout Month: ${payoutDetails.payoutMonth}</p>
      <p style="margin: 0 0 6px 0; color: #334155; font-size: 14px;">Payout Amount: <strong style="color: #0B1F4D; font-size: 17px;">₹${Number(payoutDetails.amount || 0).toLocaleString('en-IN')}</strong></p>
      <p style="margin: 0; color: #047857; font-size: 13px; font-weight: 800;">STATUS: CREDITED / PAID</p>
    </div>
  `;

  const html = await buildLightEmailTemplate({
    title: 'Monthly ROI Payout Processed',
    subtitle: `Hello <strong>${clientName}</strong>, your monthly ROI payout receipt has been generated successfully.`,
    contentHtml,
    bannerAccent: '#F5A800',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  await trackAndSendSystemEmail('roi_paid', {
    to: clientEmail,
    subject,
    text,
    html,
    recipientGroup: 'Individual',
    targetSummary: `${clientName}`,
    templateName: 'Quarterly Statement Notice'
  });

  if (agentEmail) {
    await sendEmail({ to: agentEmail, subject: `[Agent Copy] ROI Paid – ${clientName}`, text, html });
  }
};

const trackAndSendSystemEmail = async (triggerKey, sendOptions) => {
  const AutoTriggerConfig = require('../models/AutoTriggerConfig.model');
  const EmailLog = require('../models/EmailLog.model');

  try {
    const config = await AutoTriggerConfig.findOne({ triggerKey });
    if (config && !config.isEnabled) {
      console.log(`[Auto Trigger] Skipped sending. Trigger '${triggerKey}' is currently disabled.`);
      return { skipped: true };
    }

    const info = await sendEmail({
      to: sendOptions.to,
      subject: sendOptions.subject,
      text: sendOptions.text,
      html: sendOptions.html,
      attachments: sendOptions.attachments
    });

    if (config) {
      config.totalEmailsSent += 1;
      config.lastExecuted = new Date();
      await config.save();
    } else {
      const friendlyTriggers = {
        new_investor_onboarded: { systemEventTrigger: 'New Investor Onboarded', recipientPortal: 'Client' },
        agreement_uploaded: { systemEventTrigger: 'Agreement Uploaded', recipientPortal: 'Client' },
        investment_assigned: { systemEventTrigger: 'Investment Assigned / Modified', recipientPortal: 'Client' },
        roi_paid: { systemEventTrigger: 'ROI Marked as Paid', recipientPortal: 'Client' },
        deposit_approved: { systemEventTrigger: 'Deposit Approved', recipientPortal: 'Client / Agent' },
        deposit_rejected: { systemEventTrigger: 'Deposit Rejected', recipientPortal: 'Client / Agent' },
        withdrawal_approved: { systemEventTrigger: 'Withdrawal Approved', recipientPortal: 'Client / Agent' },
        withdrawal_rejected: { systemEventTrigger: 'Withdrawal Rejected', recipientPortal: 'Client / Agent' },
        commission_paid: { systemEventTrigger: 'Commission Marked as Paid', recipientPortal: 'Agent' },
        perk_assigned: { systemEventTrigger: 'Perk Assigned', recipientPortal: 'Client' }
      };

      const meta = friendlyTriggers[triggerKey] || { systemEventTrigger: triggerKey, recipientPortal: 'System' };
      await AutoTriggerConfig.create({
        triggerKey,
        systemEventTrigger: meta.systemEventTrigger,
        recipientPortal: meta.recipientPortal,
        isEnabled: true,
        totalEmailsSent: 1,
        lastExecuted: new Date()
      });
    }

    await EmailLog.create({
      subject: sendOptions.subject,
      recipientGroup: sendOptions.recipientGroup || 'Individual',
      targetSummary: sendOptions.targetSummary || sendOptions.to,
      templateName: sendOptions.templateName || 'System Auto Notification',
      attachmentsCount: sendOptions.attachments ? sendOptions.attachments.length : 0,
      recipientEmails: [sendOptions.to]
    });

    return info;
  } catch (error) {
    console.error(`[Auto Trigger Error] Failed to process/send email for trigger '${triggerKey}':`, error.message);
    throw error;
  }
};

const sendNewArticleNotification = async (recipientEmail, article) => {
  const branding = await getBranding();
  const subject = `${branding.companyName} Insights: New Article Released – ${article.title}`;
  const text = `Hello,\nA new article has been published on ${branding.companyName} Insights.\nTitle: ${article.title}\n\nBest regards,\n${branding.companyName}`;
  
  const contentHtml = `
    <div style="background: #F8FAFC; border-left: 4px solid #0B1F4D; border-radius: 10px; padding: 18px; margin: 16px 0; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <h3 style="color: #0B1F4D; margin: 0 0 8px 0; font-size: 16px;">${article.title}</h3>
      <p style="color: #475569; margin: 0; font-size: 13.5px; line-height: 1.6;">${article.excerpt}</p>
    </div>
  `;

  const html = await buildLightEmailTemplate({
    title: `${branding.companyName} Market Insights`,
    subtitle: 'A new article has been published in our investment intelligence library.',
    contentHtml,
    bannerAccent: '#F5A800',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  return sendEmail({ to: recipientEmail, subject, text, html });
};

const sendSubscriptionConfirmationEmail = async (recipientEmail) => {
  const branding = await getBranding();
  const subject = `Welcome to ${branding.companyName} Insights - Subscription Confirmed`;
  const text = `Hello,\nThank you for subscribing to ${branding.companyName} Insights.\n\nBest regards,\n${branding.companyName}`;

  const contentHtml = `
    <div style="background: #FFFDF5; border-left: 4px solid #F5A800; border-radius: 10px; padding: 18px; margin: 16px 0; border: 1px solid #FFE7A3; border-left-width: 4px;">
      <p style="margin: 0; color: #0B1F4D; font-size: 14.5px; font-weight: 700;">Thank you for subscribing to ${branding.companyName} Insights!</p>
    </div>
  `;

  const html = await buildLightEmailTemplate({
    title: 'Subscription Confirmed',
    subtitle: 'You will now receive our exclusive market insights and financial updates.',
    contentHtml,
    bannerAccent: '#F5A800',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  return sendEmail({ to: recipientEmail, subject, text, html });
};

const sendServiceRequestAlertToAdmin = async (reqUser, category, subject, description) => {
  try {
    const branding = await getBranding();
    const User = require('../models/User.model');
    const admins = await User.find({ role: { $in: ['super-admin', 'SUPER_ADMIN'] }, isActive: true }, { email: 1 }).lean();
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || SUPPORT_EMAIL;
    const rawEmails = [...admins.map(a => a.email), adminEmail].filter(Boolean);
    const targetEmails = Array.from(new Set(rawEmails.filter(e => !e.includes('@kfpl.com') && !e.includes('@example.com'))));
    if (!targetEmails.includes(SUPPORT_EMAIL)) {
      targetEmails.push(SUPPORT_EMAIL);
    }

    const roleLabel = (reqUser?.role || 'user').toUpperCase();
    const userName = reqUser?.name || reqUser?.fullName || 'Portal User';
    const userEmail = reqUser?.email || 'N/A';
    const mailSubject = `${branding.companyName} – New ${roleLabel} Support Ticket: ${subject}`;
    const text = `New support request submitted by ${userName} (${userEmail}).\nCategory: ${category}\nSubject: ${subject}\nDescription: ${description}\n— ${branding.companyName}`;

    const contentHtml = `
      <div style="background: #F8FAFC; border-left: 4px solid #0B1F4D; border-radius: 10px; padding: 18px; margin: 16px 0; border: 1px solid #E2E8F0; border-left-width: 4px;">
        <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 14px; font-weight: 700;">From: ${userName} (${userEmail}) [${roleLabel}]</p>
        <p style="margin: 0 0 6px 0; color: #334155; font-size: 13.5px;">Category: <strong>${category}</strong></p>
        <p style="margin: 0 0 6px 0; color: #334155; font-size: 13.5px;">Subject: <strong>${subject}</strong></p>
        <div style="margin-top: 10px; padding: 12px; background: #FFFFFF; border-radius: 8px; border: 1px solid #E2E8F0; font-size: 13px; color: #334155; white-space: pre-wrap;">${description}</div>
      </div>
      <p style="color: #64748B; font-size: 12px; text-align: center; margin-top: 14px;">Log in to Super Admin Control Center to review and respond.</p>
    `;

    const html = await buildLightEmailTemplate({
      title: `New ${roleLabel} Service Ticket`,
      subtitle: `A new support ticket has been submitted by ${userName}.`,
      contentHtml,
      bannerAccent: '#F5A800',
      companyName: branding.companyName,
      tagline: branding.tagline,
    });

    await Promise.allSettled(
      targetEmails.map((email) => sendEmail({ to: email, subject: mailSubject, text, html }))
    );
  } catch (err) {
    console.error('[Service Request Email Alert Error]:', err.message);
  }
};

const sendNewRegistrationAlertToAdmin = async (user, roleLabel) => {
  const branding = await getBranding();
  const User = require('../models/User.model');
  const admins = await User.find({ role: { $in: ['super-admin', 'SUPER_ADMIN'] }, isActive: true }, { email: 1 }).lean();
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || SUPPORT_EMAIL;
  const rawEmails = [...admins.map(a => a.email), adminEmail].filter(Boolean);
  const targetEmails = Array.from(new Set(rawEmails.filter(e => !e.includes('@kfpl.com') && !e.includes('@example.com'))));
  if (!targetEmails.includes(SUPPORT_EMAIL)) {
    targetEmails.push(SUPPORT_EMAIL);
  }

  const code = user.clientCode || 'N/A';
  const subject = `${branding.companyName} – New ${roleLabel} Registration (${user.name})`;
  const text = `A new ${roleLabel} has registered on the portal.\nName: ${user.name}\nEmail: ${user.email}\nCode: ${code}\n— ${branding.companyName}`;

  const contentHtml = `
    <div style="background: #F8FAFC; border-left: 4px solid #0B1F4D; border-radius: 10px; padding: 18px; margin: 16px 0; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 14px; font-weight: 700;">Name: ${user.name}</p>
      <p style="margin: 0 0 6px 0; color: #334155; font-size: 13.5px;">Email: <strong>${user.email}</strong></p>
      <p style="margin: 0; color: #334155; font-size: 13.5px;">ID Code: <strong style="color: #0B1F4D; font-family: 'Plus Jakarta Sans', monospace;">${code}</strong></p>
    </div>
    <p style="color: #64748B; font-size: 12px; text-align: center; margin-top: 14px;">Please review and complete KYC verification in Super Admin Panel.</p>
  `;

  const html = await buildLightEmailTemplate({
    title: `New ${roleLabel} Self-Registration`,
    subtitle: `A new user has registered via the ${roleLabel} Portal.`,
    contentHtml,
    bannerAccent: '#F5A800',
    companyName: branding.companyName,
    tagline: branding.tagline,
  });

  await Promise.allSettled(
    targetEmails.map((email) => sendEmail({ to: email, subject, text, html }))
  );
};

const sendDocumentReuploadRequiredEmail = async ({ toEmail, userName, userRole, missingDocs = [] }) => {
  if (!toEmail) return;

  const branding = await getBranding();
  const subject = `${branding.companyName} – Action Required: Document Re-upload Request`;
  const portalUrl = userRole === 'Agent' 
    ? (process.env.AGENT_PORTAL_URL || 'https://partner.kinetoscopefilms.com') 
    : (process.env.CLIENT_PORTAL_URL || 'https://cp.kinetoscopefilms.com/login');

  const contentHtml = `
    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin-top: 0;">
      Dear <strong>${userName}</strong>,
    </p>
    <p style="font-size: 13.5px; color: #334155; line-height: 1.6;">
      During our compliance verification review, our team noted that the following document(s) require re-upload:
    </p>
    
    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 11.5px; font-weight: 700; color: #991B1B; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
        ⚠️ Required Re-upload Document(s):
      </div>
      <ul style="margin: 0; padding-left: 18px; color: #7F1D1D; font-size: 13.5px; font-weight: 600; line-height: 1.7;">
        ${missingDocs.map(d => `<li>${d}</li>`).join('')}
      </ul>
    </div>

    <div style="background-color: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 10px; padding: 14px; margin-bottom: 18px;">
      <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 4px;">
        💡 Guidelines for Fast Document Approval:
      </div>
      <ul style="margin: 0; padding-left: 16px; color: #64748B; font-size: 12px; line-height: 1.5;">
        <li>Ensure documents are clear, legible, and un-cropped.</li>
        <li>Accepted file formats: PDF, PNG, JPG.</li>
        <li>Ensure all text matches your registered account details.</li>
      </ul>
    </div>

    <p style="font-size: 13px; color: #475569; line-height: 1.5;">
      Please log in to your <strong>${userRole} Portal</strong> and navigate to your <strong>My Profile</strong> screen to re-upload.
    </p>
  `;

  const html = await buildLightEmailTemplate({
    title: 'Document Action Required',
    subtitle: `Action needed for your ${userRole} account verification.`,
    contentHtml,
    bannerAccent: '#DC2626',
    companyName: branding.companyName,
    tagline: branding.tagline,
    actionButton: {
      url: portalUrl,
      text: `Log In to ${userRole} Portal`
    }
  });

  const text = `Dear ${userName},\n\nPlease re-upload the following document(s) for verification:\n${missingDocs.join(', ')}\n\nLog in to your portal: ${portalUrl}\n\n${branding.companyName} Team`;

  try {
    await sendEmail({ to: toEmail, subject, text, html });
  } catch (err) {
    console.error(`[Email Error] Failed to send document re-upload email to ${toEmail}:`, err.message);
  }
};

const sendDocumentUploadedAdminNotification = async ({ userEmail, userName, userRole, userCode, uploadedDocLabels = [] }) => {
  const branding = await getBranding();
  const adminEmail = process.env.SUPERADMIN_NOTIFY_EMAIL || process.env.SMTP_USER || SUPPORT_EMAIL;
  const superAdminUrl = process.env.SUPER_ADMIN_PORTAL_URL || 'https://superadmin.kinetoscopefilms.com';

  const subject = `[Notification] New Document Uploaded by ${userRole}: ${userName} (${userCode || 'N/A'})`;

  const contentHtml = `
    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin-top: 0;">
      Hello Super Admin,
    </p>
    <p style="font-size: 13.5px; color: #334155; line-height: 1.6;">
      <strong>${userName}</strong> (${userRole} — Code: <code>${userCode || 'N/A'}</code>, Email: ${userEmail}) has uploaded the following document(s):
    </p>

    <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 11.5px; font-weight: 700; color: #1E40AF; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
        📄 Uploaded Document(s):
      </div>
      <ul style="margin: 0; padding-left: 18px; color: #1E3A8A; font-size: 13.5px; font-weight: 600; line-height: 1.7;">
        ${uploadedDocLabels.map(d => `<li>${d}</li>`).join('')}
      </ul>
    </div>

    <p style="font-size: 13px; color: #475569; line-height: 1.5;">
      Please log in to the Super Admin Portal to inspect and verify the newly submitted document(s).
    </p>
  `;

  const html = await buildLightEmailTemplate({
    title: 'New Document Uploaded for Review',
    subtitle: `${userRole} ${userName} has submitted document(s) for verification.`,
    contentHtml,
    bannerAccent: '#2563EB',
    companyName: branding.companyName,
    tagline: branding.tagline,
    actionButton: {
      url: superAdminUrl,
      text: 'Open Super Admin Control Center'
    }
  });

  const text = `New Document Uploaded by ${userRole} ${userName} (${userCode}):\n${uploadedDocLabels.join(', ')}\n\nReview at: ${superAdminUrl}`;

  try {
    await sendEmail({ to: adminEmail, subject, text, html });
  } catch (err) {
    console.error(`[Email Error] Failed to send document upload notification to admin:`, err.message);
  }
};

module.exports = {
  buildLightEmailTemplate,
  buildOtpEmailHtml,
  sendEmail,
  sendChangeEmailOtp,
  sendChangePasswordOtp,
  sendWelcomeEmail,
  sendCredentialsEmail,
  sendTransactionRequestAlertToAdmin,
  sendTransactionStatusNotification,
  sendKycVerificationNotification,
  sendInvestmentAssignmentNotification,
  sendRoiPayoutNotification,
  trackAndSendSystemEmail,
  sendNewArticleNotification,
  sendSubscriptionConfirmationEmail,
  sendNewRegistrationAlertToAdmin,
  sendServiceRequestAlertToAdmin,
  sendDocumentReuploadRequiredEmail,
  sendDocumentUploadedAdminNotification,
  getBranding
};
