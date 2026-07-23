const transporter = require('../config/mailer');

/**
 * Dispatch templates or custom messages using mailer configuration
 * @param {object} options - Mail options config
 * @param {string} options.to - Recipient email addresses
 * @param {string} options.subject - Email subject line
 * @param {string} options.text - Raw text body content
 * @param {string} [options.html] - HTML body payload
 * @returns {Promise<object>} SMTP delivery receipts info
 */
const sendEmail = async (options) => {
  const mailOptions = {
    from: process.env.EMAIL_USER || process.env.SMTP_FROM || 'noreply@krossfilmproductions.com',
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
 * @param {string} toEmail - Recipient email (current admin email)
 * @param {string} otp - Plain-text 6-digit OTP to include in mail
 * @param {string} newEmail - The new email the admin wants to switch to
 * @returns {Promise<object>} SMTP delivery info
 */
const sendChangeEmailOtp = async (toEmail, otp, newEmail) => {
  const subject = 'Kinetoscope – Email Change OTP Verification';

  const text = `
Your OTP for email address change is: ${otp}

You requested to change your admin email to: ${newEmail}

This OTP is valid for 5 minutes. Do not share it with anyone.

If you did not make this request, please secure your account immediately.

— Kinetoscope Super Admin Panel
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Email Change Verification</h2>
      <p style="color: #4b5563; font-size: 14px;">You requested to change your admin email address to:</p>
      <p style="font-weight: bold; color: #1a1a2e;">${newEmail}</p>
      <p style="color: #4b5563; font-size: 14px; margin-top: 16px;">Use the OTP below to confirm this change:</p>
      <div style="background: #f3f4f6; border-radius: 6px; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #1a1a2e;">${otp}</span>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">This OTP expires in <strong>5 minutes</strong> and can only be used once.</p>
      <p style="color: #9ca3af; font-size: 12px;">If you did not request this change, please secure your account immediately.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 11px; text-align: center;">Kinetoscope Super Admin Panel</p>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, text, html });
};

/**
 * Send OTP email for password change verification.
 * @param {string} toEmail - Current admin email
 * @param {string} otp - Plain-text 6-digit OTP
 * @returns {Promise<object>} SMTP delivery info
 */
const sendChangePasswordOtp = async (toEmail, otp) => {
  const subject = 'Kinetoscope – Password Change OTP Verification';

  const text = `
Your OTP for password change is: ${otp}

This OTP is valid for 5 minutes. Do not share it with anyone.

If you did not request this change, please secure your account immediately.

— Kinetoscope Super Admin Panel
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1a1a2e; margin-bottom: 8px;">Password Change Verification</h2>
      <p style="color: #4b5563; font-size: 14px;">You requested to change your admin account password. Use the OTP below to confirm:</p>
      <div style="background: #f3f4f6; border-radius: 6px; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #1a1a2e;">${otp}</span>
      </div>
      <p style="color: #9ca3af; font-size: 12px;">This OTP expires in <strong>5 minutes</strong> and can only be used once.</p>
      <p style="color: #9ca3af; font-size: 12px;">If you did not request this change, please secure your account immediately.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 11px; text-align: center;">Kinetoscope Super Admin Panel</p>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, text, html });
};

/**
 * Dispatch a welcome email with credentials to onboarding clients
 * @param {string} toEmail - Recipient client email
 * @param {string} clientName - Client's full name
 * @param {string} clientCode - Sequential unique client ID (e.g. KFPL-1001)
 * @param {string} tempPassword - System auto-generated temporary password
 * @param {string} loginUrl - URL route to client portal login page
 * @returns {Promise<object>} SMTP delivery receipts info
 */
const sendWelcomeEmail = async (toEmail, clientName, clientCode, tempPassword, loginUrl) => {
  const subject = 'Welcome to Kinetoscope – Your Client Account Details';

  const text = `
Hello ${clientName},

Welcome to Kinetoscope. An account has been created for you.

Here are your credential details to log in to the Client Portal:
Client Code: ${clientCode}
Email Address: ${toEmail}
Temporary Password: ${tempPassword}

Please log in using the portal link below and update your password immediately:
${loginUrl}

Best regards,
Kinetoscope Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #1a1a2e; margin-bottom: 16px;">Welcome to Kinetoscope</h2>
      <p style="color: #4b5563; font-size: 14px;">Hello <strong>${clientName}</strong>,</p>
      <p style="color: #4b5563; font-size: 14px;">Your client portal account has been configured successfully. Use the credentials below to access your dashboard:</p>
      
      <div style="background: #f8fafc; border-radius: 6px; padding: 20px; border: 1px solid #e2e8f0; margin: 20px 0;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 140px;">Client Code:</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-size: 15px; font-weight: bold;">${clientCode}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Email:</td>
            <td style="padding: 6px 0; color: #0f172a;">${toEmail}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Temporary Password:</td>
            <td style="padding: 6px 0; color: #e11d48; font-family: monospace; font-size: 15px; font-weight: bold;">${tempPassword}</td>
          </tr>
        </table>
      </div>

      <p style="color: #4b5563; font-size: 14px; margin-top: 16px;">Click the button below to sign in:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${loginUrl}" style="background-color: #1e293b; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Login to Client Portal</a>
      </div>

      <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">For security, we recommend that you change this temporary password immediately after logging in for the first time.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kinetoscope Film Productions Ltd. (KFPL)</p>
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
 * @param {string} toEmail - Recipient client email
 * @param {string} clientName - Client's full name
 * @param {string} clientCode - Sequential unique client ID (e.g. KFPL-1001)
 * @param {string} tempPassword - System auto-generated temporary password
 * @param {string} loginUrl - URL route to client portal login page
 * @returns {Promise<object>} SMTP delivery receipts info
 */
const sendCredentialsEmail = async (toEmail, clientName, clientCode, tempPassword, loginUrl) => {
  const subject = 'Kinetoscope – Your Updated Login Credentials';

  const text = `
Hello ${clientName},

Your login credentials for the Kinetoscope Client Portal have been updated by the administrator.

Here are your new login details:
Client Code: ${clientCode}
Email Address: ${toEmail}
New Password: ${tempPassword}

Please log in using the portal link below and change your password immediately:
${loginUrl}

If you did not request this change, please contact your account administrator immediately.

Best regards,
Kinetoscope Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #1a1a2e; margin-bottom: 16px;">Updated Login Credentials</h2>
      <p style="color: #4b5563; font-size: 14px;">Hello <strong>${clientName}</strong>,</p>
      <p style="color: #4b5563; font-size: 14px;">Your login credentials for the Kinetoscope Client Portal have been updated by the administrator. Please use the details below to access your dashboard:</p>
      
      <div style="background: #f8fafc; border-radius: 6px; padding: 20px; border: 1px solid #e2e8f0; margin: 20px 0;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 140px;">Client Code:</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-size: 15px; font-weight: bold;">${clientCode}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Email:</td>
            <td style="padding: 6px 0; color: #0f172a;">${toEmail}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">New Password:</td>
            <td style="padding: 6px 0; color: #e11d48; font-family: monospace; font-size: 15px; font-weight: bold;">${tempPassword}</td>
          </tr>
        </table>
      </div>

      <p style="color: #4b5563; font-size: 14px; margin-top: 16px;">Click the button below to sign in:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${loginUrl}" style="background-color: #1e293b; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Login to Client Portal</a>
      </div>

      <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">For security, we recommend that you change this password immediately after logging in.</p>
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">If you did not request this change, please contact your account administrator immediately.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kinetoscope Film Productions Ltd. (KFPL)</p>
    </div>
  `;

  return sendEmail({ to: toEmail, subject, text, html });
};

const sendTransactionRequestAlertToAdmin = async (superAdminEmails, clientName, clientCode, transactionDetails) => {
  if (!superAdminEmails || superAdminEmails.length === 0) return;

  const typeLabel = transactionDetails.type.toUpperCase();
  const subject = `Kinetoscope – New Pending ${typeLabel} Request from ${clientName} (${clientCode})`;

  const text = `
Hello Admin,

A new ${transactionDetails.type} request has been submitted and is pending your approval.

Details:
Client Name: ${clientName}
Client Code: ${clientCode}
Transaction Type: ${typeLabel}
Amount: INR ${transactionDetails.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
Payment Method: ${transactionDetails.paymentMethod || 'N/A'}
Reference/Receipt ID: ${transactionDetails.referenceNumber || 'N/A'}

Please log in to the Super Admin Panel to review and action this request.

— Kinetoscope Notification System
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #1e293b; margin-bottom: 16px;">Pending Approval Action Required</h2>
      <p style="color: #4b5563; font-size: 14px;">Hello Admin,</p>
      <p style="color: #4b5563; font-size: 14px;">A new <strong>${transactionDetails.type} request</strong> is pending your review and authorization:</p>
      
      <div style="background: #f8fafc; border-radius: 6px; padding: 20px; border: 1px solid #e2e8f0; margin: 20px 0;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 150px;">Client:</td>
            <td style="padding: 6px 0; color: #0f172a;">${clientName} (${clientCode})</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Type:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: bold; text-transform: uppercase;">${transactionDetails.type}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Amount:</td>
            <td style="padding: 6px 0; color: #1e3a8a; font-size: 16px; font-weight: bold;">INR ${transactionDetails.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Method:</td>
            <td style="padding: 6px 0; color: #0f172a;">${transactionDetails.paymentMethod || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Reference No:</td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${transactionDetails.referenceNumber || 'N/A'}</td>
          </tr>
        </table>
      </div>
      
      <p style="color: #4b5563; font-size: 14px; margin-top: 16px;">Please open the Super Admin portal and navigate to <strong>Deposit & Withdrawal Approvals</strong> to authorize or decline this transaction.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kinetoscope Film Productions Ltd. (KFPL)</p>
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

  const text = `
Hello ${clientName},

Your requested ${transactionDetails.type} has been ${actionLabel.toUpperCase()}.

Transaction Details:
Type: ${typeLabel}
Amount: INR ${transactionDetails.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
Status: ${actionLabel.toUpperCase()}
${!isApproved && rejectionReason ? `Reason for Rejection: ${rejectionReason}` : ''}

If you have any questions, please reach out to your assigned account advisor or agent.

Best regards,
Kinetoscope Team
  `.trim();

  const statusBg = isApproved ? '#f0fdf4' : '#fef2f2';
  const statusBorder = isApproved ? '#bbf7d0' : '#fecaca';
  const statusColor = isApproved ? '#15803d' : '#b91c1c';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #1e293b; margin-bottom: 16px;">Transaction Status Update</h2>
      <p style="color: #4b5563; font-size: 14px;">Hello <strong>${clientName}</strong>,</p>
      <p style="color: #4b5563; font-size: 14px;">Your requested <strong>${transactionDetails.type}</strong> has been processed by the administrator.</p>
      
      <div style="background: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 6px; padding: 16px; margin: 20px 0; text-align: center;">
        <span style="font-size: 16px; font-weight: bold; color: ${statusColor}; text-transform: uppercase;">
          Status: ${actionLabel}
        </span>
      </div>

      <div style="background: #f8fafc; border-radius: 6px; padding: 20px; border: 1px solid #e2e8f0; margin: 20px 0;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 140px;">Type:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: bold; text-transform: uppercase;">${transactionDetails.type}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Amount:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: bold;">INR ${transactionDetails.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
          ${!isApproved && rejectionReason ? `
          <tr>
            <td style="padding: 6px 0; color: #b91c1c; font-weight: bold;">Reason:</td>
            <td style="padding: 6px 0; color: #b91c1c; font-weight: bold;">${rejectionReason}</td>
          </tr>
          ` : ''}
        </table>
      </div>
      
      <p style="color: #4b5563; font-size: 14px; margin-top: 16px;">If you did not expect this update or have further questions, please contact your account advisor immediately.</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kinetoscope Film Productions Ltd. (KFPL)</p>
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
  const subject = isFullyVerified
    ? 'Kinetoscope – Your KYC Verification is complete!'
    : `Kinetoscope – Document Verified: ${documentField}`;

  const text = isFullyVerified
    ? `Hello ${clientName},\n\nGreat news! Your KYC verification has been completed successfully. Your profile is now fully active.\n\nBest regards,\nKinetoscope Team`
    : `Hello ${clientName},\n\nYour uploaded document (${documentField}) has been reviewed and verified by our team.\n\nBest regards,\nKinetoscope Team`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #1a1a2e; margin-bottom: 16px;">KYC Status Update</h2>
      <p style="color: #4b5563; font-size: 14px;">Hello <strong>${clientName}</strong>,</p>
      
      ${isFullyVerified ? `
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 16px; margin: 20px 0; text-align: center;">
        <span style="font-size: 16px; font-weight: bold; color: #15803d;">
          KYC STATUS: FULLY VERIFIED
        </span>
      </div>
      <p style="color: #4b5563; font-size: 14px;">Congratulations! All your submitted documents have been approved. Your account is now fully active and ready for operations.</p>
      ` : `
      <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px; padding: 16px; margin: 20px 0; text-align: center;">
        <span style="font-size: 15px; font-weight: bold; color: #0d9488;">
          Document Verified: ${documentField}
        </span>
      </div>
      <p style="color: #4b5563; font-size: 14px;">Your document has been successfully verified. We are processing the remaining documents.</p>
      `}
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kinetoscope Film Productions Ltd. (KFPL)</p>
    </div>
  `;

  await sendEmail({ to: clientEmail, subject, text, html });

  if (agentEmail) {
    const agentSubject = `[Agent Copy] Client KYC Update – ${clientName}`;
    const agentText = `Hello Agent,\n\nYour client ${clientName}'s document (${documentField}) is verified. Current KYC status: ${kycStatus}.\n\nBest regards,\nKinetoscope Team`;
    await sendEmail({ to: agentEmail, subject: agentSubject, text: agentText, html });
  }
};

const sendInvestmentAssignmentNotification = async (clientEmail, clientName, agentEmail, investmentDetails) => {
  const subject = `Kinetoscope – New Investment Assigned (${investmentDetails.segment})`;
  
  const text = `
Hello ${clientName},

A new investment has been assigned to your account.

Details:
Segment: ${investmentDetails.segment}
Investment Amount: INR ${investmentDetails.investmentAmount.toLocaleString('en-IN')}
ROI Percentage: ${investmentDetails.roiPercentage}% monthly
Risk Percentage: ${investmentDetails.riskPercentage}%
Investment Date: ${new Date(investmentDetails.investmentDate).toLocaleDateString()}

Best regards,
Kinetoscope Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #1a1a2e; margin-bottom: 16px;">New Investment Portfolio Assignment</h2>
      <p style="color: #4b5563; font-size: 14px;">Hello <strong>${clientName}</strong>,</p>
      <p style="color: #4b5563; font-size: 14px;">An investment record has been created and assigned to your portfolio:</p>
      
      <div style="background: #f8fafc; border-radius: 6px; padding: 20px; border: 1px solid #e2e8f0; margin: 20px 0;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 155px;">Segment / Project:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: bold;">${investmentDetails.segment}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Amount:</td>
            <td style="padding: 6px 0; color: #1e3a8a; font-size: 15px; font-weight: bold;">INR ${investmentDetails.investmentAmount.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Monthly ROI:</td>
            <td style="padding: 6px 0; color: #0f172a;">${investmentDetails.roiPercentage}%</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Risk Level:</td>
            <td style="padding: 6px 0; color: #0f172a;">${investmentDetails.riskPercentage}%</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Allocation Date:</td>
            <td style="padding: 6px 0; color: #0f172a;">${new Date(investmentDetails.investmentDate).toLocaleDateString()}</td>
          </tr>
        </table>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kinetoscope Film Productions Ltd. (KFPL)</p>
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
    const agentSubject = `[Agent Copy] New Investment Assigned to Client – ${clientName}`;
    const agentText = `Hello Agent,\n\nA new investment has been assigned to your client ${clientName} under segment ${investmentDetails.segment} with amount INR ${investmentDetails.investmentAmount}.\n\nBest regards,\nKinetoscope Team`;
    await sendEmail({ to: agentEmail, subject: agentSubject, text: agentText, html });
  }
};

const sendRoiPayoutNotification = async (clientEmail, clientName, agentEmail, payoutDetails) => {
  const subject = `Kinetoscope – ROI Payout Paid (${payoutDetails.payoutMonth})`;
  
  const text = `
Hello ${clientName},

Your ROI payout for the month of ${payoutDetails.payoutMonth} has been marked as PAID by the administrator.

Payout Details:
Month: ${payoutDetails.payoutMonth}
Amount: INR ${payoutDetails.amount.toLocaleString('en-IN')}
Status: PAID

Best regards,
Kinetoscope Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #1a1a2e; margin-bottom: 16px;">ROI Payout Receipt</h2>
      <p style="color: #4b5563; font-size: 14px;">Hello <strong>${clientName}</strong>,</p>
      <p style="color: #4b5563; font-size: 14px;">Your ROI payout for the month of <strong>${payoutDetails.payoutMonth}</strong> has been successfully processed and marked as paid:</p>
      
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 20px; margin: 20px 0;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold; width: 140px;">Month:</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: bold;">${payoutDetails.payoutMonth}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Amount:</td>
            <td style="padding: 6px 0; color: #16a34a; font-size: 16px; font-weight: bold;">INR ${payoutDetails.amount.toLocaleString('en-IN')}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b; font-weight: bold;">Status:</td>
            <td style="padding: 6px 0; color: #16a34a; font-weight: bold;">PAID</td>
          </tr>
        </table>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kinetoscope Film Productions Ltd. (KFPL)</p>
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
    const agentSubject = `[Agent Copy] Client ROI Paid – ${clientName}`;
    const agentText = `Hello Agent,\n\nThe ROI payout for your client ${clientName} for the month of ${payoutDetails.payoutMonth} (Amount: INR ${payoutDetails.amount}) has been marked as paid.\n\nBest regards,\nKinetoscope Team`;
    await sendEmail({ to: agentEmail, subject: agentSubject, text: agentText, html });
  }
};

const trackAndSendSystemEmail = async (triggerKey, sendOptions) => {
  const AutoTriggerConfig = require('../models/AutoTriggerConfig.model');
  const EmailLog = require('../models/EmailLog.model');

  try {
    // 1. Check if trigger is configured and enabled
    const config = await AutoTriggerConfig.findOne({ triggerKey });
    
    // If config exists and is disabled, we skip sending
    if (config && !config.isEnabled) {
      console.log(`[Auto Trigger] Skipped sending. Trigger '${triggerKey}' is currently disabled.`);
      return { skipped: true };
    }

    // 2. Perform email dispatch
    const info = await sendEmail({
      to: sendOptions.to,
      subject: sendOptions.subject,
      text: sendOptions.text,
      html: sendOptions.html,
      attachments: sendOptions.attachments
    });

    // 3. Update stats if config is found
    if (config) {
      config.totalEmailsSent += 1;
      config.lastExecuted = new Date();
      await config.save();
    } else {
      // Create trigger config if it doesn't exist yet (automatic self-healing)
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

    // 4. Create log history
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
  const subject = `KFPL Insights: New Article Released – ${article.title}`;
  const text = `Hello,\n\nA new article has been published on KFPL Insights.\n\nTitle: ${article.title}\nCategory: ${article.category}\nExcerpt: ${article.excerpt}\n\nRead more details in your portal feed.\n\nBest regards,\nKinetoscope Film Productions Ltd. (KFPL)`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 12px; font-weight: bold; color: #10b981; text-transform: uppercase; letter-spacing: 1.5px;">KFPL Insights</span>
      </div>
      <h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px; font-size: 22px; font-weight: bold; line-height: 1.3;">
        ${article.title}
      </h2>
      <div style="margin-bottom: 20px; color: #64748b; font-size: 13px;">
        <span>Category: <strong>${article.category || 'General'}</strong></span> &bull; 
        <span>Author: <strong>${article.author || 'KFPL Team'}</strong></span>
      </div>
      
      ${article.featuredImage ? `
        <div style="margin-bottom: 24px; text-align: center;">
          <img src="${article.featuredImage}" alt="${article.title}" style="max-width: 100%; border-radius: 6px; height: auto;" />
        </div>
      ` : ''}
      
      <div style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        <p style="font-style: italic; color: #475569; border-left: 3px solid #cbd5e1; padding-left: 12px; margin-bottom: 16px;">
          ${article.excerpt}
        </p>
        <p>${article.content ? article.content.substring(0, 300) : ''}...</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.CLIENT_PORTAL_URL || 'http://localhost:5173'}/media/${article._id}" style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">Read Full Article</a>
      </div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; line-height: 1.4;">
        You received this email because you subscribed to updates on KFPL Insights.<br/>
        Kinetoscope Film Productions Ltd. (KFPL)
      </p>
    </div>
  `;

  return sendEmail({ to: recipientEmail, subject, text, html });
};

const sendSubscriptionConfirmationEmail = async (recipientEmail) => {
  const subject = `Welcome to KFPL Insights - Subscription Confirmed`;
  const text = `Hello,\n\nThank you for subscribing to KFPL Insights.\n\nYou will now receive automatic email notifications whenever new media releases, production announcements, and investor articles are published.\n\nBest regards,\nKinetoscope Film Productions Ltd. (KFPL)`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 12px; font-weight: bold; color: #10b981; text-transform: uppercase; letter-spacing: 1.5px;">KFPL Insights</span>
      </div>
      <h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px; font-size: 20px; font-weight: bold;">
        Subscription Confirmed!
      </h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">
        Thank you for subscribing to <strong>KFPL Insights</strong>.
      </p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; background-color: #f8fafc; padding: 16px; border-radius: 6px; border-left: 4px solid #10b981;">
        You will now automatically receive email notifications directly in your inbox whenever new media releases, quarterly fiscal summaries, or entertainment pipeline articles are published by Kinetoscope.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center; line-height: 1.4;">
        You received this email because <strong>${recipientEmail}</strong> was subscribed to KFPL Insights.<br/>
        Kinetoscope Film Productions Ltd. (KFPL)
      </p>
    </div>
  `;

  return sendEmail({ to: recipientEmail, subject, text, html });
};

module.exports = {
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
