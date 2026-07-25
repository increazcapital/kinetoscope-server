const transporter = require('../config/mailer');

/**
 * Premium Dark Obsidian OTP Email HTML Template Generator
 */
const buildOtpEmailHtml = ({ title, subtitle, otp, expiryMinutes = 5, note }) => {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; background-color: #0F172A; border-radius: 16px; overflow: hidden; border: 1px solid #1E293B; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #0F172A 0%, #061D13 50%, #0F172A 100%); padding: 32px 24px; text-align: center; border-bottom: 2px solid #10B981;">
        <div style="font-size: 22px; font-weight: 900; color: #FFFFFF; letter-spacing: 4px; text-transform: uppercase;">
          KINETOSCOPE
        </div>
        <div style="font-size: 10px; font-weight: 700; color: #10B981; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">
          Film Production Pvt Ltd
        </div>
      </div>

      <!-- Main Body -->
      <div style="padding: 32px 28px; background-color: #1E293B; color: #F8FAFC;">
        <h2 style="color: #FFFFFF; font-size: 18px; font-weight: 800; margin: 0 0 8px 0; text-align: center;">
          ${title}
        </h2>
        <p style="color: #94A3B8; font-size: 14px; text-align: center; margin: 0 0 24px 0; line-height: 1.5;">
          ${subtitle}
        </p>

        <!-- OTP Display Box -->
        <div style="background: linear-gradient(135deg, #0F172A 0%, #1A2E26 100%); border: 2px solid #10B981; border-radius: 14px; padding: 24px; text-align: center; margin: 0 0 24px 0; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.15);">
          <div style="font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">
            SECURE VERIFICATION CODE
          </div>
          <div style="font-size: 38px; font-weight: 900; letter-spacing: 12px; color: #10B981; font-family: 'Courier New', Consolas, monospace; margin-left: 12px; text-shadow: 0 0 12px rgba(16,185,129,0.3);">
            ${otp}
          </div>
        </div>

        <div style="background: rgba(16, 185, 129, 0.08); border-left: 3.5px solid #10B981; padding: 14px 16px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #CBD5E1; font-size: 12.5px; line-height: 1.5;">
            🔒 This verification code expires in <strong>${expiryMinutes} minutes</strong>. Never share this OTP with anyone.
          </p>
        </div>

        ${note ? `<p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0 0 8px 0;">${note}</p>` : ''}
        <p style="color: #64748B; font-size: 11.5px; text-align: center; margin: 0;">
          If you did not request this OTP, please secure your account immediately.
        </p>
      </div>

      <!-- Footer -->
      <div style="padding: 20px 28px; background-color: #0F172A; border-top: 1px solid #334155; text-align: center;">
        <p style="margin: 0; font-size: 11px; font-weight: 700; color: #E2E8F0; text-transform: uppercase; letter-spacing: 1px;">
          Kinetoscope Film Production Pvt Ltd
        </p>
        <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748B;">
          Official Security Notification • Please do not reply to this automated email.
        </p>
      </div>
    </div>
  `;
};

/**
 * Dispatch templates or custom messages using mailer configuration
 */
const sendEmail = async (options) => {
  const mailOptions = {
    from: process.env.EMAIL_USER || process.env.SMTP_FROM || 'noreply@kinetoscopefilmproduction.com',
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email dispatched successfully to ${options.to}. MessageID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`Email dispatch error to ${options.to}:`, error.message);
    throw error;
  }
};

/**
 * Send a formatted OTP email for email change verification.
 */
const sendChangeEmailOtp = async (toEmail, otp, newEmail) => {
  const subject = 'Kinetoscope – Email Change OTP Verification';
  const text = `Your OTP for email address change is: ${otp}\nRequested new email: ${newEmail}\nValid for 5 minutes. Do not share it with anyone. — Kinetoscope Film Production Pvt Ltd`;

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
  const text = `Your OTP for password change is: ${otp}\nValid for 5 minutes. Do not share it with anyone. — Kinetoscope Film Production Pvt Ltd`;

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

  const text = `Hello ${clientName},\n\nWelcome to Kinetoscope Film Production Pvt Ltd.\nClient Code: ${clientCode}\nEmail: ${toEmail}\nTemporary Password: ${tempPassword}\nLogin URL: ${loginUrl}\n\nBest regards,\nKinetoscope Film Production Pvt Ltd`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: auto; padding: 0; background-color: #0F172A; border-radius: 16px; overflow: hidden; border: 1.5px solid #1E293B; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
      <div style="background: linear-gradient(135deg, #0F172A 0%, #061D13 50%, #0F172A 100%); padding: 32px 24px; text-align: center; border-bottom: 2px solid #10B981;">
        <div style="font-size: 22px; font-weight: 900; color: #FFFFFF; letter-spacing: 4px; text-transform: uppercase;">KINETOSCOPE</div>
        <div style="font-size: 10px; font-weight: 700; color: #10B981; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Film Production Pvt Ltd</div>
      </div>
      <div style="padding: 32px 28px; background-color: #1E293B; color: #F8FAFC;">
        <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 800; margin: 0 0 12px 0;">Welcome aboard, ${clientName}!</h2>
        <p style="color: #94A3B8; font-size: 14px; margin: 0 0 20px 0;">Your official Client Portal account has been configured successfully. Below are your secure login credentials:</p>
        
        <div style="background: #0F172A; border-radius: 12px; padding: 20px; border: 1px solid #334155; margin: 20px 0;">
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #94A3B8; font-weight: 600; width: 140px;">Client Code:</td>
              <td style="padding: 8px 0; color: #10B981; font-family: monospace; font-size: 16px; font-weight: 800;">${clientCode}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94A3B8; font-weight: 600;">Email:</td>
              <td style="padding: 8px 0; color: #F8FAFC; font-weight: 600;">${toEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94A3B8; font-weight: 600;">Temp Password:</td>
              <td style="padding: 8px 0; color: #F59E0B; font-family: monospace; font-size: 16px; font-weight: 800;">${tempPassword}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 28px 0 20px 0;">
          <a href="${loginUrl}" style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #FFFFFF; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 14px; display: inline-block; box-shadow: 0 4px 16px rgba(16,185,129,0.3);">Access Portal Dashboard</a>
        </div>

        <p style="color: #64748B; font-size: 12px; text-align: center; margin: 0;">Please change your temporary password immediately upon first sign in.</p>
      </div>
      <div style="padding: 20px 28px; background-color: #0F172A; border-top: 1px solid #334155; text-align: center;">
        <p style="margin: 0; font-size: 11px; font-weight: 700; color: #E2E8F0; text-transform: uppercase; letter-spacing: 1px;">Kinetoscope Film Production Pvt Ltd</p>
      </div>
    </div>
  `;

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

  const text = `Hello ${clientName},\n\nYour login credentials for Kinetoscope Film Production Pvt Ltd have been updated.\nClient Code: ${clientCode}\nNew Password: ${tempPassword}\n\nBest regards,\nKinetoscope Film Production Pvt Ltd`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: auto; padding: 0; background-color: #0F172A; border-radius: 16px; overflow: hidden; border: 1.5px solid #1E293B;">
      <div style="background: linear-gradient(135deg, #0F172A 0%, #061D13 50%, #0F172A 100%); padding: 32px 24px; text-align: center; border-bottom: 2px solid #10B981;">
        <div style="font-size: 22px; font-weight: 900; color: #FFFFFF; letter-spacing: 4px; text-transform: uppercase;">KINETOSCOPE</div>
        <div style="font-size: 10px; font-weight: 700; color: #10B981; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Film Production Pvt Ltd</div>
      </div>
      <div style="padding: 32px 28px; background-color: #1E293B; color: #F8FAFC;">
        <h2 style="color: #FFFFFF; font-size: 18px; font-weight: 800; margin: 0 0 12px 0;">Updated Credentials</h2>
        <p style="color: #94A3B8; font-size: 14px;">Hello <strong>${clientName}</strong>, your account credentials have been updated:</p>
        <div style="background: #0F172A; border-radius: 12px; padding: 20px; border: 1px solid #334155; margin: 20px 0;">
          <p style="margin: 4px 0; color: #CBD5E1; font-size: 14px;">Client Code: <strong style="color: #10B981;">${clientCode}</strong></p>
          <p style="margin: 4px 0; color: #CBD5E1; font-size: 14px;">New Password: <strong style="color: #F59E0B;">${tempPassword}</strong></p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${loginUrl}" style="background: #10B981; color: #FFFFFF; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 800; font-size: 14px; display: inline-block;">Login to Portal</a>
        </div>
      </div>
      <div style="padding: 16px 28px; background-color: #0F172A; text-align: center;">
        <p style="margin: 0; font-size: 11px; font-weight: 700; color: #CBD5E1; text-transform: uppercase;">Kinetoscope Film Production Pvt Ltd</p>
      </div>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, text, html });
};

const sendTransactionRequestAlertToAdmin = async (superAdminEmails, clientName, clientCode, transactionDetails) => {
  if (!superAdminEmails || superAdminEmails.length === 0) return;
  const typeLabel = transactionDetails.type.toUpperCase();
  const subject = `Kinetoscope – New Pending ${typeLabel} Request from ${clientName} (${clientCode})`;

  const text = `New ${transactionDetails.type} request from ${clientName} (${clientCode}). Amount: INR ${transactionDetails.amount}.\n— Kinetoscope Film Production Pvt Ltd`;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: auto; background: #0F172A; border-radius: 14px; padding: 28px; color: #F8FAFC; border: 1px solid #334155;">
      <h3 style="color: #10B981; margin-top: 0;">Pending ${typeLabel} Action Required</h3>
      <p style="color: #CBD5E1;">Client <strong>${clientName}</strong> (${clientCode}) requested <strong>INR ${transactionDetails.amount.toLocaleString('en-IN')}</strong>.</p>
      <p style="color: #94A3B8; font-size: 12px;">Please process in Super Admin Panel.</p>
      <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
      <p style="color: #64748B; font-size: 11px; text-align: center;">Kinetoscope Film Production Pvt Ltd</p>
    </div>
  `;

  await Promise.allSettled(
    superAdminEmails.map((email) => sendEmail({ to: email, subject, text, html }))
  );
};

const sendTransactionStatusNotification = async (toEmail, clientName, transactionDetails, status, rejectionReason) => {
  const isApproved = status === 'approved';
  const actionLabel = isApproved ? 'Approved' : 'Rejected';
  const typeLabel = transactionDetails.type.toUpperCase();
  const subject = `Kinetoscope – Your ${typeLabel} Request has been ${actionLabel}`;

  const text = `Hello ${clientName}, Your ${transactionDetails.type} of INR ${transactionDetails.amount} has been ${actionLabel}.\n— Kinetoscope Film Production Pvt Ltd`;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: auto; background: #0F172A; border-radius: 14px; padding: 28px; color: #F8FAFC; border: 1px solid #334155;">
      <h3 style="color: ${isApproved ? '#10B981' : '#EF4444'}; margin-top: 0;">Transaction ${actionLabel}</h3>
      <p style="color: #CBD5E1;">Hello <strong>${clientName}</strong>, your ${transactionDetails.type} request of <strong>INR ${transactionDetails.amount.toLocaleString('en-IN')}</strong> is ${actionLabel}.</p>
      ${!isApproved && rejectionReason ? `<p style="color: #EF4444; font-size: 13px;">Reason: ${rejectionReason}</p>` : ''}
      <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
      <p style="color: #64748B; font-size: 11px; text-align: center;">Kinetoscope Film Production Pvt Ltd</p>
    </div>
  `;

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
  const text = `Hello ${clientName}, KYC status: ${kycStatus}.\n— Kinetoscope Film Production Pvt Ltd`;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: auto; background: #0F172A; border-radius: 14px; padding: 28px; color: #F8FAFC; border: 1px solid #334155;">
      <h3 style="color: #10B981; margin-top: 0;">KYC Update</h3>
      <p style="color: #CBD5E1;">Hello <strong>${clientName}</strong>, ${isFullyVerified ? 'your KYC is fully verified!' : `document (${documentField}) is verified.`}</p>
      <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
      <p style="color: #64748B; font-size: 11px; text-align: center;">Kinetoscope Film Production Pvt Ltd</p>
    </div>
  `;

  await sendEmail({ to: clientEmail, subject, text, html });

  if (agentEmail) {
    await sendEmail({ to: agentEmail, subject: `[Agent Copy] KYC Update – ${clientName}`, text, html });
  }
};

const sendInvestmentAssignmentNotification = async (clientEmail, clientName, agentEmail, investmentDetails) => {
  const subject = `Kinetoscope – Investment Assigned (${investmentDetails.segment})`;
  const text = `Hello ${clientName}, investment of INR ${investmentDetails.investmentAmount} assigned.\n— Kinetoscope Film Production Pvt Ltd`;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: auto; background: #0F172A; border-radius: 14px; padding: 28px; color: #F8FAFC; border: 1px solid #334155;">
      <h3 style="color: #10B981; margin-top: 0;">New Investment Assigned</h3>
      <p style="color: #CBD5E1;">Segment: <strong>${investmentDetails.segment}</strong> | Amount: <strong>INR ${investmentDetails.investmentAmount.toLocaleString('en-IN')}</strong></p>
      <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
      <p style="color: #64748B; font-size: 11px; text-align: center;">Kinetoscope Film Production Pvt Ltd</p>
    </div>
  `;

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
  const text = `Hello ${clientName}, ROI Payout for ${payoutDetails.payoutMonth} of INR ${payoutDetails.amount} is PAID.\n— Kinetoscope Film Production Pvt Ltd`;

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: auto; background: #0F172A; border-radius: 14px; padding: 28px; color: #F8FAFC; border: 1px solid #334155;">
      <h3 style="color: #10B981; margin-top: 0;">ROI Payout Receipt</h3>
      <p style="color: #CBD5E1;">ROI Payout for <strong>${payoutDetails.payoutMonth}</strong>: <strong style="color: #10B981;">INR ${payoutDetails.amount.toLocaleString('en-IN')}</strong> (PAID).</p>
      <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
      <p style="color: #64748B; font-size: 11px; text-align: center;">Kinetoscope Film Production Pvt Ltd</p>
    </div>
  `;

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
  const text = `Hello,\nA new article has been published on Kinetoscope Insights.\nTitle: ${article.title}\n\nBest regards,\nKinetoscope Film Production Pvt Ltd`;
  
  const html = `
    <div style="font-family: sans-serif; max-width: 580px; margin: auto; background: #0F172A; border-radius: 14px; padding: 28px; color: #F8FAFC; border: 1px solid #334155;">
      <h3 style="color: #10B981;">${article.title}</h3>
      <p style="color: #CBD5E1;">${article.excerpt}</p>
      <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
      <p style="color: #64748B; font-size: 11px; text-align: center;">Kinetoscope Film Production Pvt Ltd</p>
    </div>
  `;

  return sendEmail({ to: recipientEmail, subject, text, html });
};

const sendSubscriptionConfirmationEmail = async (recipientEmail) => {
  const subject = `Welcome to Kinetoscope Insights - Subscription Confirmed`;
  const text = `Hello,\nThank you for subscribing to Kinetoscope Insights.\n\nBest regards,\nKinetoscope Film Production Pvt Ltd`;

  const html = `
    <div style="font-family: sans-serif; max-width: 580px; margin: auto; background: #0F172A; border-radius: 14px; padding: 28px; color: #F8FAFC; border: 1px solid #334155;">
      <h3 style="color: #10B981;">Subscription Confirmed</h3>
      <p style="color: #CBD5E1;">Thank you for subscribing to Kinetoscope Insights.</p>
      <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
      <p style="color: #64748B; font-size: 11px; text-align: center;">Kinetoscope Film Production Pvt Ltd</p>
    </div>
  `;

  return sendEmail({ to: recipientEmail, subject, text, html });
};

module.exports = {
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
};
