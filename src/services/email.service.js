const transporter = require('../config/mailer');

const LOGO_URL = 'https://res.cloudinary.com/j8ksidlp/image/upload/v1785908914/kinetoscope/branding/kfpl_logo.jpg';
const COMPANY_NAME = 'Kinetoscope Films Pvt Ltd';
const TAGLINE = 'A GLOBAL MEDIA FUND';

/**
 * Universal Master Light Theme Email HTML Wrapper Generator
 */
const buildLightEmailTemplate = ({ title, subtitle, contentHtml, bannerAccent = '#059669', actionButton }) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      </head>
      <body style="margin: 0; padding: 24px 12px; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 10px 30px rgba(0,0,0,0.06);">
          
          <!-- Header Bar -->
          <div style="background-color: #FFFFFF; padding: 28px 24px 20px 24px; text-align: center; border-bottom: 3px solid ${bannerAccent};">
            <div style="display: inline-block; background-color: #F8FAFC; padding: 4px; border-radius: 12px; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-bottom: 12px;">
              <img src="${LOGO_URL}" alt="KFPL Logo" style="width: 48px; height: 48px; border-radius: 8px; object-fit: contain; display: block;" />
            </div>
            <div style="font-size: 18px; font-weight: 800; color: #0F172A; letter-spacing: 0.5px; margin: 0;">
              ${COMPANY_NAME}
            </div>
            <div style="font-size: 10px; font-weight: 700; color: #059669; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 3px;">
              ${TAGLINE}
            </div>
          </div>

          <!-- Email Content Body -->
          <div style="padding: 32px 28px; background-color: #FFFFFF; color: #1E293B;">
            ${title ? `<h2 style="color: #0F172A; font-size: 20px; font-weight: 800; margin: 0 0 8px 0; text-align: center; letter-spacing: -0.3px;">${title}</h2>` : ''}
            ${subtitle ? `<p style="color: #64748B; font-size: 14px; text-align: center; margin: 0 0 24px 0; line-height: 1.5;">${subtitle}</p>` : ''}

            ${contentHtml}

            ${actionButton ? `
              <div style="text-align: center; margin: 28px 0 16px 0;">
                <a href="${actionButton.url}" style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #FFFFFF; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 14px; display: inline-block; box-shadow: 0 4px 16px rgba(5, 150, 105, 0.25); border: 1px solid #047857;">${actionButton.text}</a>
              </div>
            ` : ''}
          </div>

          <!-- Footer -->
          <div style="padding: 20px 24px; background-color: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center;">
            <div style="font-size: 12px; font-weight: 800; color: #0F172A; letter-spacing: 0.5px; margin: 0;">
              ${COMPANY_NAME}
            </div>
            <div style="font-size: 9px; font-weight: 700; color: #059669; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px;">
              ${TAGLINE}
            </div>
            <p style="margin: 8px 0 0 0; font-size: 10.5px; color: #94A3B8; line-height: 1.4;">
              Official Notification • ${COMPANY_NAME}. All rights reserved.<br/>Please do not reply directly to this automated system email.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Premium Light Theme OTP Email HTML Template Generator
 */
const buildOtpEmailHtml = ({ title, subtitle, otp, expiryMinutes = 5, note }) => {
  const contentHtml = `
    <!-- OTP Display Box -->
    <div style="background-color: #F0FDF4; border: 2px solid #10B981; border-radius: 14px; padding: 22px 16px; text-align: center; margin: 0 0 20px 0; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.1);">
      <div style="font-size: 10px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">
        SECURE VERIFICATION CODE
      </div>
      <div style="font-size: 38px; font-weight: 900; letter-spacing: 12px; color: #059669; font-family: 'Courier New', Consolas, monospace; margin-left: 12px;">
        ${otp}
      </div>
    </div>

    <div style="background-color: #F8FAFC; border-left: 4px solid #10B981; padding: 14px 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <p style="margin: 0; color: #334155; font-size: 13px; line-height: 1.5;">
        🔒 This verification code is valid for <strong>${expiryMinutes} minutes</strong>. Never share this OTP with anyone.
      </p>
    </div>

    ${note ? `<p style="color: #64748B; font-size: 13px; text-align: center; margin: 0 0 12px 0;">${note}</p>` : ''}
    <p style="color: #94A3B8; font-size: 11.5px; text-align: center; margin: 0;">
      If you did not request this OTP, please secure your account or contact support immediately.
    </p>
  `;

  return buildLightEmailTemplate({
    title,
    subtitle,
    contentHtml,
    bannerAccent: '#10B981'
  });
};

/**
 * Dispatch templates or custom messages using mailer configuration
 */
const sendEmail = async (options) => {
  const defaultFrom = process.env.EMAIL_FROM || 'Kinetoscope Films Pvt Ltd <info@kinetoscopefilms.com>';
  const mailOptions = {
    from: options.from || defaultFrom,
    replyTo: options.replyTo || 'info@kinetoscopefilms.com',
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments,
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
  const subject = 'Kinetoscope – Email Change OTP Verification';
  const text = `Your OTP for email address change is: ${otp}\nRequested new email: ${newEmail}\nValid for 5 minutes. Do not share it with anyone. — ${COMPANY_NAME}`;

  const html = buildOtpEmailHtml({
    title: 'Email Address Change Verification',
    subtitle: `You requested to update your registered email to <strong>${newEmail}</strong>.`,
    otp,
    expiryMinutes: 5,
    note: 'Enter this 6-digit code in your portal to confirm your new email.'
  });

  return sendEmail({ to: toEmail, subject, text, html });
};

/**
 * Send OTP email for password change verification.
 */
const sendChangePasswordOtp = async (toEmail, otp) => {
  const subject = 'Kinetoscope – Password Change OTP Verification';
  const text = `Your OTP for password change is: ${otp}\nValid for 5 minutes. Do not share it with anyone. — ${COMPANY_NAME}`;

  const html = buildOtpEmailHtml({
    title: 'Password Reset Verification',
    subtitle: 'You requested a password change for your account. Use the code below to authorize this request.',
    otp,
    expiryMinutes: 5
  });

  return sendEmail({ to: toEmail, subject, text, html });
};

/**
 * Dispatch a welcome email with credentials to onboarding clients
 */
const sendWelcomeEmail = async (toEmail, clientName, clientCode, tempPassword, loginUrl) => {
  const subject = 'Welcome to Kinetoscope – Your Client Account Details';

  const text = `Hello ${clientName},\n\nWelcome to ${COMPANY_NAME}.\nClient Code: ${clientCode}\nEmail: ${toEmail}\nTemporary Password: ${tempPassword}\nLogin URL: ${loginUrl}\n\nBest regards,\n${COMPANY_NAME}`;

  const contentHtml = `
    <div style="background-color: #F8FAFC; border-radius: 12px; padding: 20px; border: 1px solid #E2E8F0; margin: 20px 0;">
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #64748B; font-weight: 600; width: 140px;">Client Code:</td>
          <td style="padding: 8px 0; color: #059669; font-family: monospace; font-size: 16px; font-weight: 800;">${clientCode}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748B; font-weight: 600;">Registered Email:</td>
          <td style="padding: 8px 0; color: #0F172A; font-weight: 700;">${toEmail}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748B; font-weight: 600;">Temp Password:</td>
          <td style="padding: 8px 0; color: #D97706; font-family: monospace; font-size: 16px; font-weight: 800;">${tempPassword}</td>
        </tr>
      </table>
    </div>
    <p style="color: #64748B; font-size: 12px; text-align: center; margin-top: 16px;">Please change your temporary password immediately upon first sign in.</p>
  `;

  const html = buildLightEmailTemplate({
    title: `Welcome aboard, ${clientName}!`,
    subtitle: 'Your official Client Portal account has been configured successfully. Below are your secure login credentials:',
    contentHtml,
    actionButton: { text: 'Access Client Portal Dashboard', url: loginUrl },
    bannerAccent: '#059669'
  });

  const isAgent = clientCode && clientCode.toString().toUpperCase().includes('AGT');
  if (isAgent) {
    return sendEmail({ to: toEmail, subject, text, html });
  }

  return trackAndSendSystemEmail('new_investor_onboarded', {
    to: toEmail,
    subject,
    text,
    html,
    recipientGroup: 'Individual',
    targetSummary: `${clientName} (${clientCode})`,
    templateName: 'Welcome Investor Kit'
  });
};

/**
 * Send credentials email for password reset or resend credentials scenarios.
 */
const sendCredentialsEmail = async (toEmail, clientName, clientCode, tempPassword, loginUrl) => {
  const subject = 'Kinetoscope – Your Updated Login Credentials';

  const text = `Hello ${clientName},\n\nYour login credentials for ${COMPANY_NAME} have been updated.\nClient Code: ${clientCode}\nNew Password: ${tempPassword}\n\nBest regards,\n${COMPANY_NAME}`;

  const contentHtml = `
    <div style="background-color: #F8FAFC; border-radius: 12px; padding: 20px; border: 1px solid #E2E8F0; margin: 20px 0;">
      <p style="margin: 4px 0; color: #334155; font-size: 14px;">Client Code: <strong style="color: #059669; font-family: monospace;">${clientCode}</strong></p>
      <p style="margin: 8px 0 4px 0; color: #334155; font-size: 14px;">New Password: <strong style="color: #D97706; font-family: monospace;">${tempPassword}</strong></p>
    </div>
  `;

  const html = buildLightEmailTemplate({
    title: 'Updated Login Credentials',
    subtitle: `Hello <strong>${clientName}</strong>, your portal login credentials have been updated by administration:`,
    contentHtml,
    actionButton: { text: 'Login to Portal Dashboard', url: loginUrl },
    bannerAccent: '#059669'
  });

  return sendEmail({ to: toEmail, subject, text, html });
};

const sendTransactionRequestAlertToAdmin = async (superAdminEmails, clientName, clientCode, transactionDetails) => {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'info@kinetoscopefilms.com';
  const targetEmails = Array.from(new Set([...(superAdminEmails || []), adminEmail])).filter(Boolean);
  const typeLabel = transactionDetails.type.toUpperCase();
  const subject = `Kinetoscope – New Pending ${typeLabel} Request from ${clientName} (${clientCode})`;

  const text = `New ${transactionDetails.type} request from ${clientName} (${clientCode}). Amount: INR ${transactionDetails.amount}.\n— ${COMPANY_NAME}`;

  const contentHtml = `
    <div style="background-color: #F8FAFC; border-left: 4px solid #D97706; border-radius: 8px; padding: 16px; margin: 16px 0; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 15px; font-weight: 700;">Client: ${clientName} (${clientCode})</p>
      <p style="margin: 0; color: #334155; font-size: 14px;">Requested Amount: <strong style="color: #059669; font-size: 16px;">₹${transactionDetails.amount.toLocaleString('en-IN')}</strong></p>
    </div>
    <p style="color: #64748B; font-size: 13px; text-align: center; margin-top: 16px;">Please process this request in your Super Admin Panel.</p>
  `;

  const html = buildLightEmailTemplate({
    title: `Pending ${typeLabel} Action Required`,
    subtitle: 'A new financial transaction request requires Super Admin approval.',
    contentHtml,
    bannerAccent: '#D97706'
  });

  await Promise.allSettled(
    targetEmails.map((email) => sendEmail({ to: email, subject, text, html }))
  );
};

const sendTransactionStatusNotification = async (toEmail, clientName, transactionDetails, status, rejectionReason) => {
  const isApproved = status === 'approved';
  const actionLabel = isApproved ? 'Approved' : 'Rejected';
  const typeLabel = transactionDetails.type.toUpperCase();
  const subject = `Kinetoscope – Your ${typeLabel} Request has been ${actionLabel}`;

  const text = `Hello ${clientName}, Your ${transactionDetails.type} of INR ${transactionDetails.amount} has been ${actionLabel}.\n— ${COMPANY_NAME}`;

  const contentHtml = `
    <div style="background-color: ${isApproved ? '#F0FDF4' : '#FEF2F2'}; border-left: 4px solid ${isApproved ? '#10B981' : '#EF4444'}; border-radius: 8px; padding: 18px; margin: 16px 0; border: 1px solid ${isApproved ? '#BBF7D0' : '#FCA5A5'}; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 15px; font-weight: 700;">Request: ${transactionDetails.type}</p>
      <p style="margin: 0 0 6px 0; color: #334155; font-size: 14px;">Amount: <strong style="color: ${isApproved ? '#059669' : '#DC2626'}; font-size: 16px;">₹${transactionDetails.amount.toLocaleString('en-IN')}</strong></p>
      <p style="margin: 0; color: #334155; font-size: 14px;">Status: <strong style="color: ${isApproved ? '#059669' : '#DC2626'}; text-transform: uppercase;">${actionLabel}</strong></p>
      ${!isApproved && rejectionReason ? `<p style="margin: 10px 0 0 0; color: #DC2626; font-size: 13px; font-weight: 600;">Reason: ${rejectionReason}</p>` : ''}
    </div>
  `;

  const html = buildLightEmailTemplate({
    title: `Transaction ${actionLabel}`,
    subtitle: `Hello <strong>${clientName}</strong>, your ${transactionDetails.type} request status has been updated.`,
    contentHtml,
    bannerAccent: isApproved ? '#10B981' : '#EF4444'
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
  const isFullyVerified = kycStatus === 'VERIFIED';
  const subject = isFullyVerified ? 'Kinetoscope – KYC Verification Complete' : `Kinetoscope – Document Verified: ${documentField}`;
  const text = `Hello ${clientName}, KYC status: ${kycStatus}.\n— ${COMPANY_NAME}`;

  const contentHtml = `
    <div style="background-color: #F0FDF4; border-left: 4px solid #10B981; border-radius: 8px; padding: 18px; margin: 16px 0; border: 1px solid #BBF7D0; border-left-width: 4px;">
      <p style="margin: 0; color: #0F172A; font-size: 15px; font-weight: 700;">
        ${isFullyVerified ? '🎉 Your KYC is fully verified and active!' : `Document Verified: <strong>${documentField}</strong>`}
      </p>
    </div>
  `;

  const html = buildLightEmailTemplate({
    title: 'KYC Document Verification Update',
    subtitle: `Hello <strong>${clientName}</strong>, your profile compliance verification status has been updated.`,
    contentHtml,
    bannerAccent: '#10B981'
  });

  await sendEmail({ to: clientEmail, subject, text, html });

  if (agentEmail) {
    await sendEmail({ to: agentEmail, subject: `[Agent Copy] KYC Update – ${clientName}`, text, html });
  }
};

const sendInvestmentAssignmentNotification = async (clientEmail, clientName, agentEmail, investmentDetails) => {
  const subject = `Kinetoscope – Investment Assigned (${investmentDetails.segment})`;
  const text = `Hello ${clientName}, investment of INR ${investmentDetails.investmentAmount} assigned.\n— ${COMPANY_NAME}`;

  const contentHtml = `
    <div style="background-color: #F8FAFC; border-left: 4px solid #059669; border-radius: 8px; padding: 18px; margin: 16px 0; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 15px; font-weight: 700;">Segment: ${investmentDetails.segment}</p>
      <p style="margin: 0; color: #334155; font-size: 14px;">Assigned Amount: <strong style="color: #059669; font-size: 16px;">₹${investmentDetails.investmentAmount.toLocaleString('en-IN')}</strong></p>
    </div>
  `;

  const html = buildLightEmailTemplate({
    title: 'New Investment Portfolio Assigned',
    subtitle: `Hello <strong>${clientName}</strong>, a new investment segment allocation has been activated on your account.`,
    contentHtml,
    bannerAccent: '#059669'
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
  const subject = `Kinetoscope – ROI Payout Paid (${payoutDetails.payoutMonth})`;
  const text = `Hello ${clientName}, ROI Payout for ${payoutDetails.payoutMonth} of INR ${payoutDetails.amount} is PAID.\n— ${COMPANY_NAME}`;

  const contentHtml = `
    <div style="background-color: #F0FDF4; border-left: 4px solid #10B981; border-radius: 8px; padding: 18px; margin: 16px 0; border: 1px solid #BBF7D0; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 15px; font-weight: 700;">Month: ${payoutDetails.payoutMonth}</p>
      <p style="margin: 0 0 6px 0; color: #334155; font-size: 14px;">Payout Amount: <strong style="color: #059669; font-size: 18px;">₹${payoutDetails.amount.toLocaleString('en-IN')}</strong></p>
      <p style="margin: 0; color: #047857; font-size: 13px; font-weight: 700;">Status: PAID</p>
    </div>
  `;

  const html = buildLightEmailTemplate({
    title: 'Monthly ROI Payout Processed',
    subtitle: `Hello <strong>${clientName}</strong>, your monthly ROI payout receipt has been generated.`,
    contentHtml,
    bannerAccent: '#10B981'
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
  const subject = `Kinetoscope Insights: New Article Released – ${article.title}`;
  const text = `Hello,\nA new article has been published on Kinetoscope Insights.\nTitle: ${article.title}\n\nBest regards,\n${COMPANY_NAME}`;
  
  const contentHtml = `
    <div style="background-color: #F8FAFC; border-left: 4px solid #059669; border-radius: 8px; padding: 18px; margin: 16px 0; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <h3 style="color: #0F172A; margin: 0 0 8px 0; font-size: 17px;">${article.title}</h3>
      <p style="color: #475569; margin: 0; font-size: 14px; line-height: 1.5;">${article.excerpt}</p>
    </div>
  `;

  const html = buildLightEmailTemplate({
    title: 'Kinetoscope Insights',
    subtitle: 'A new article has been published on Kinetoscope Insights.',
    contentHtml,
    bannerAccent: '#059669'
  });

  return sendEmail({ to: recipientEmail, subject, text, html });
};

const sendSubscriptionConfirmationEmail = async (recipientEmail) => {
  const subject = `Welcome to Kinetoscope Insights - Subscription Confirmed`;
  const text = `Hello,\nThank you for subscribing to Kinetoscope Insights.\n\nBest regards,\n${COMPANY_NAME}`;

  const contentHtml = `
    <div style="background-color: #F0FDF4; border-left: 4px solid #10B981; border-radius: 8px; padding: 18px; margin: 16px 0; border: 1px solid #BBF7D0; border-left-width: 4px;">
      <p style="margin: 0; color: #047857; font-size: 15px; font-weight: 700;">Thank you for subscribing to Kinetoscope Insights!</p>
    </div>
  `;

  const html = buildLightEmailTemplate({
    title: 'Subscription Confirmed',
    subtitle: 'You will now receive our latest production market insights and financial updates.',
    contentHtml,
    bannerAccent: '#10B981'
  });

  return sendEmail({ to: recipientEmail, subject, text, html });
};

const sendServiceRequestAlertToAdmin = async (reqUser, category, subject, description) => {
  try {
    const User = require('../models/User.model');
    const admins = await User.find({ role: { $in: ['super-admin', 'SUPER_ADMIN'] }, isActive: true }, { email: 1 }).lean();
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'info@kinetoscopefilms.com';
    const rawEmails = [...admins.map(a => a.email), adminEmail].filter(Boolean);
    const targetEmails = Array.from(new Set(rawEmails.filter(e => !e.includes('@kfpl.com') && !e.includes('@example.com'))));
    if (!targetEmails.includes('info@kinetoscopefilms.com')) {
      targetEmails.push('info@kinetoscopefilms.com');
    }

    const roleLabel = (reqUser?.role || 'user').toUpperCase();
    const userName = reqUser?.name || reqUser?.fullName || 'Portal User';
    const userEmail = reqUser?.email || 'N/A';
    const mailSubject = `Kinetoscope – New ${roleLabel} Support Ticket: ${subject}`;
    const text = `New support request submitted by ${userName} (${userEmail}).\nCategory: ${category}\nSubject: ${subject}\nDescription: ${description}\n— ${COMPANY_NAME}`;

    const contentHtml = `
      <div style="background-color: #F8FAFC; border-left: 4px solid #0284C7; border-radius: 8px; padding: 18px; margin: 16px 0; border: 1px solid #E2E8F0; border-left-width: 4px;">
        <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 15px; font-weight: 700;">From: ${userName} (${userEmail}) [${roleLabel}]</p>
        <p style="margin: 0 0 6px 0; color: #334155; font-size: 14px;">Category: <strong>${category}</strong></p>
        <p style="margin: 0 0 6px 0; color: #334155; font-size: 14px;">Subject: <strong>${subject}</strong></p>
        <div style="margin-top: 10px; padding: 12px; background: #FFFFFF; border-radius: 6px; border: 1px solid #E2E8F0; font-size: 13px; color: #334155; white-space: pre-wrap;">${description}</div>
      </div>
      <p style="color: #64748B; font-size: 13px; text-align: center; margin-top: 16px;">Log in to Super Admin Control Center to review and respond.</p>
    `;

    const html = buildLightEmailTemplate({
      title: `New ${roleLabel} Service Request`,
      subtitle: `A new support request has been submitted by ${userName}.`,
      contentHtml,
      bannerAccent: '#0284C7'
    });

    await Promise.allSettled(
      targetEmails.map((email) => sendEmail({ to: email, subject: mailSubject, text, html }))
    );
  } catch (err) {
    console.error('[Service Request Email Alert Error]:', err.message);
  }
};

const sendNewRegistrationAlertToAdmin = async (user, roleLabel) => {
  const User = require('../models/User.model');
  const admins = await User.find({ role: { $in: ['super-admin', 'SUPER_ADMIN'] }, isActive: true }, { email: 1 }).lean();
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'info@kinetoscopefilms.com';
  const rawEmails = [...admins.map(a => a.email), adminEmail].filter(Boolean);
  const targetEmails = Array.from(new Set(rawEmails.filter(e => !e.includes('@kfpl.com') && !e.includes('@example.com'))));
  if (!targetEmails.includes('info@kinetoscopefilms.com')) {
    targetEmails.push('info@kinetoscopefilms.com');
  }

  const code = user.clientCode || 'N/A';
  const subject = `Kinetoscope – New ${roleLabel} Registration (${user.name})`;
  const text = `A new ${roleLabel} has registered on the portal.\nName: ${user.name}\nEmail: ${user.email}\nCode: ${code}\n— ${COMPANY_NAME}`;

  const contentHtml = `
    <div style="background-color: #F8FAFC; border-left: 4px solid #0284C7; border-radius: 8px; padding: 18px; margin: 16px 0; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <p style="margin: 0 0 6px 0; color: #0F172A; font-size: 15px; font-weight: 700;">Name: ${user.name}</p>
      <p style="margin: 0 0 6px 0; color: #334155; font-size: 14px;">Email: <strong>${user.email}</strong></p>
      <p style="margin: 0; color: #334155; font-size: 14px;">ID Code: <strong style="color: #0284C7; font-family: monospace;">${code}</strong></p>
    </div>
    <p style="color: #64748B; font-size: 13px; text-align: center; margin-top: 16px;">Please review and complete KYC verification in Super Admin Panel.</p>
  `;

  const html = buildLightEmailTemplate({
    title: `New ${roleLabel} Portal Self-Registration`,
    subtitle: `A new user registered via the ${roleLabel} Portal.`,
    contentHtml,
    bannerAccent: '#0284C7'
  });

  await Promise.allSettled(
    targetEmails.map((email) => sendEmail({ to: email, subject, text, html }))
  );
};

/**
 * Send email to Client or Agent when Super Admin deletes/clears a document or requests a re-upload.
 */
const sendDocumentReuploadRequiredEmail = async ({ toEmail, userName, userRole, missingDocs = [] }) => {
  if (!toEmail) return;

  const subject = `Action Required: Document Verification & Re-upload Request — Kinetoscope Films Team`;
  const portalUrl = userRole === 'Agent' 
    ? (process.env.AGENT_PORTAL_URL || 'http://localhost:5175/profile') 
    : (process.env.CLIENT_PORTAL_URL || 'http://localhost:5174/profile');

  const contentHtml = `
    <p style="font-size: 14.5px; color: #334155; line-height: 1.6; margin-top: 0;">
      Dear <strong>${userName}</strong>,
    </p>
    <p style="font-size: 14px; color: #334155; line-height: 1.6;">
      During our verification review, our compliance team noted that the following document(s) require re-upload for verification:
    </p>
    
    <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 18px; margin: 18px 0;">
      <div style="font-size: 12px; font-weight: 800; color: #991B1B; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
        ⚠️ Required Re-upload Document(s):
      </div>
      <ul style="margin: 0; padding-left: 20px; color: #7F1D1D; font-size: 14px; font-weight: 700; line-height: 1.8;">
        ${missingDocs.map(d => `<li>${d}</li>`).join('')}
      </ul>
    </div>

    <div style="background-color: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
      <div style="font-size: 12.5px; font-weight: 800; color: #334155; margin-bottom: 6px;">
        💡 Guidelines for Fast Document Approval:
      </div>
      <ul style="margin: 0; padding-left: 18px; color: #64748B; font-size: 12.5px; line-height: 1.6;">
        <li>Ensure documents are clear, legible, and un-cropped (HD quality).</li>
        <li>Accepted file formats: PDF, PNG, JPG, or DOCX.</li>
        <li>Ensure all text (Name, ID Numbers, Account details) match your registered details.</li>
      </ul>
    </div>

    <p style="font-size: 13.5px; color: #475569; line-height: 1.5;">
      Please log in to your <strong>${userRole} Portal</strong> and navigate to your <strong>My Profile</strong> or <strong>Dashboard</strong> screen to re-upload the document(s).
    </p>
  `;

  const html = buildLightEmailTemplate({
    title: 'Document Action Required',
    subtitle: `Action needed for your ${userRole} account verification.`,
    contentHtml,
    bannerAccent: '#DC2626',
    actionButton: {
      url: portalUrl,
      text: `Log In to ${userRole} Portal & Re-upload`
    }
  });

  const text = `Dear ${userName},\n\nPlease re-upload the following document(s) for verification:\n${missingDocs.join(', ')}\n\nLog in to your portal: ${portalUrl}\n\nKinetoscope Films Team`;

  try {
    await sendEmail({ to: toEmail, subject, text, html });
  } catch (err) {
    console.error(`[Email Error] Failed to send document re-upload email to ${toEmail}:`, err.message);
  }
};

/**
 * Send email notification to Super Admin when a Client or Agent re-uploads a document.
 */
const sendDocumentUploadedAdminNotification = async ({ userEmail, userName, userRole, userCode, uploadedDocLabels = [] }) => {
  const adminEmail = process.env.SUPERADMIN_NOTIFY_EMAIL || process.env.SMTP_USER || 'admin@kinetoscopefilms.com';
  const superAdminUrl = process.env.SUPER_ADMIN_PORTAL_URL || 'http://localhost:5173/investors';

  const subject = `[Notification] New Document Re-uploaded by ${userRole}: ${userName} (${userCode || 'N/A'})`;

  const contentHtml = `
    <p style="font-size: 14.5px; color: #334155; line-height: 1.6; margin-top: 0;">
      Hello Super Admin,
    </p>
    <p style="font-size: 14px; color: #334155; line-height: 1.6;">
      <strong>${userName}</strong> (${userRole} — Code: <code>${userCode || 'N/A'}</code>, Email: ${userEmail}) has uploaded/re-uploaded the following document(s):
    </p>

    <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 12px; padding: 18px; margin: 18px 0;">
      <div style="font-size: 12px; font-weight: 800; color: #1E40AF; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
        📄 Uploaded Document(s):
      </div>
      <ul style="margin: 0; padding-left: 20px; color: #1E3A8A; font-size: 14px; font-weight: 700; line-height: 1.8;">
        ${uploadedDocLabels.map(d => `<li>${d}</li>`).join('')}
      </ul>
    </div>

    <p style="font-size: 13.5px; color: #475569; line-height: 1.5;">
      Please log in to the Super Admin Portal to inspect and verify the newly submitted document(s).
    </p>
  `;

  const html = buildLightEmailTemplate({
    title: 'New Document Uploaded for Review',
    subtitle: `${userRole} ${userName} has submitted document(s) for verification.`,
    contentHtml,
    bannerAccent: '#2563EB',
    actionButton: {
      url: superAdminUrl,
      text: 'Open Super Admin Portal'
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
};
