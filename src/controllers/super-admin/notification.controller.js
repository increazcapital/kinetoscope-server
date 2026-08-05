const User = require('../../models/User.model');
const ScheduledEmail = require('../../models/ScheduledEmail.model');
const CustomTemplate = require('../../models/CustomTemplate.model');
const AutoTriggerConfig = require('../../models/AutoTriggerConfig.model');
const EmailLog = require('../../models/EmailLog.model');
const { sendEmail, buildLightEmailTemplate } = require('../../services/email.service');
const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

// Predefined default automatic triggers for auto-seeding
const DEFAULT_TRIGGERS = [
  { triggerKey: 'new_investor_onboarded', systemEventTrigger: 'New Investor Onboarded', recipientPortal: 'Client' },
  { triggerKey: 'agreement_uploaded', systemEventTrigger: 'Agreement Uploaded', recipientPortal: 'Client' },
  { triggerKey: 'investment_assigned', systemEventTrigger: 'Investment Assigned / Modified', recipientPortal: 'Client' },
  { triggerKey: 'roi_paid', systemEventTrigger: 'ROI Marked as Paid', recipientPortal: 'Client' },
  { triggerKey: 'deposit_approved', systemEventTrigger: 'Deposit Approved', recipientPortal: 'Client / Agent' },
  { triggerKey: 'deposit_rejected', systemEventTrigger: 'Deposit Rejected', recipientPortal: 'Client / Agent' },
  { triggerKey: 'withdrawal_approved', systemEventTrigger: 'Withdrawal Approved', recipientPortal: 'Client / Agent' },
  { triggerKey: 'withdrawal_rejected', systemEventTrigger: 'Withdrawal Rejected', recipientPortal: 'Client / Agent' },
  { triggerKey: 'commission_paid', systemEventTrigger: 'Commission Marked as Paid', recipientPortal: 'Agent' },
  { triggerKey: 'perk_assigned', systemEventTrigger: 'Perk Assigned', recipientPortal: 'Client' }
];

/**
 * Format email layout according to the templateType or return custom HTML
 */
const getEmailHtml = (templateType, body, customHtml) => {
  if (customHtml) return customHtml;

  let headerText = 'Important Announcement';
  let accentColor = '#059669';

  switch (templateType) {
    case 'welcome_investor':
      headerText = 'Welcome Investor Kit';
      accentColor = '#0284c7';
      break;
    case 'reward_perk':
      headerText = 'Perk & Reward Announcement';
      accentColor = '#7c3aed';
      break;
    case 'quarterly_statement':
      headerText = 'Quarterly Statement Notice';
      accentColor = '#0d9488';
      break;
    case 'account_security':
      headerText = 'Account Security Alert';
      accentColor = '#dc2626';
      break;
    default:
      headerText = 'Important Announcement';
  }

  const contentHtml = `
    <div style="color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-wrap; margin: 12px 0;">
      ${body}
    </div>
  `;

  return buildLightEmailTemplate({
    title: headerText,
    contentHtml,
    bannerAccent: accentColor
  });
};

/**
 * Send direct emails immediately or schedule them for later
 * POST /api/super-admin/notifications/send-email
 */
const sendDirectEmail = asyncHandler(async (req, res, next) => {
  const {
    recipientEmails,
    recipientIds,
    roles,
    subject,
    body,
    html: customHtml,
    templateType = 'blank',
    attachments,
    sendTiming = 'immediate',
    scheduledAt,
  } = req.body;

  if (!subject) {
    return next(new AppError('Subject is required.', 400));
  }

  if (!body && !customHtml) {
    return next(new AppError('Email body or custom HTML is required.', 400));
  }

  // Parse stringified JSON fields (since multipart form submits fields as strings)
  let parsedRecipientEmails = recipientEmails;
  let parsedRecipientIds = recipientIds;
  let parsedRoles = roles;
  let parsedAttachments = attachments;

  if (typeof recipientEmails === 'string' && recipientEmails.trim().startsWith('[')) {
    try { parsedRecipientEmails = JSON.parse(recipientEmails); } catch (e) {}
  }
  if (typeof recipientIds === 'string' && recipientIds.trim().startsWith('[')) {
    try { parsedRecipientIds = JSON.parse(recipientIds); } catch (e) {}
  }
  if (typeof roles === 'string' && roles.trim().startsWith('[')) {
    try { parsedRoles = JSON.parse(roles); } catch (e) {}
  }
  if (typeof attachments === 'string') {
    try { parsedAttachments = JSON.parse(attachments); } catch (e) {}
  }

  // 1. Validation for roles (only one role targeted at a time)
  if (Array.isArray(parsedRoles) && parsedRoles.length > 0) {
    if (parsedRoles.length > 1) {
      return next(new AppError('Only one role can be targeted at a time.', 400));
    }
  }

  // Compile attachments from multipart files
  const multipartAttachments = [];
  if (req.files && Array.isArray(req.files)) {
    req.files.forEach(file => {
      multipartAttachments.push({
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype
      });
    });
  }

  // Merge with other body-provided attachments
  let bodyAttachments = parsedAttachments;
  if (typeof parsedAttachments === 'string') {
    try { bodyAttachments = JSON.parse(parsedAttachments); } catch (e) { bodyAttachments = []; }
  }
  const finalEmailAttachments = [...multipartAttachments, ...(Array.isArray(bodyAttachments) ? bodyAttachments : [])];

  // 2. Handle Scheduling
  if (sendTiming === 'schedule') {
    if (!scheduledAt) {
      return next(new AppError('Scheduled date/time is required for scheduled send timing.', 400));
    }

    const sendDate = new Date(scheduledAt);
    if (isNaN(sendDate.getTime())) {
      return next(new AppError('Invalid scheduled date format.', 400));
    }

    if (sendDate <= new Date()) {
      return next(new AppError('Scheduled time must be in the future.', 400));
    }

    // For scheduled emails, upload multipart files to Cloudinary and save the URLs
    const scheduledAttachmentsList = [];
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        try {
          const url = await uploadBufferToCloudinary(file.buffer);
          scheduledAttachmentsList.push({
            filename: file.originalname,
            path: url,
            contentType: file.mimetype
          });
        } catch (uploadErr) {
          console.error(`[Upload] Failed to upload attachment ${file.originalname} for scheduled email:`, uploadErr.message);
        }
      }
    }

    const finalScheduledAttachments = [...scheduledAttachmentsList, ...(Array.isArray(bodyAttachments) ? bodyAttachments : [])];

    // Save scheduled campaign/email to database
    const scheduled = await ScheduledEmail.create({
      recipientEmails: Array.isArray(parsedRecipientEmails)
        ? parsedRecipientEmails
        : parsedRecipientEmails
        ? [parsedRecipientEmails]
        : [],
      recipientIds: Array.isArray(parsedRecipientIds)
        ? parsedRecipientIds
        : parsedRecipientIds
        ? [parsedRecipientIds]
        : [],
      roles: Array.isArray(parsedRoles)
        ? parsedRoles
        : parsedRoles
        ? [parsedRoles]
        : [],
      subject,
      body: body || '',
      html: customHtml || '',
      templateType,
      attachments: finalScheduledAttachments,
      sendAt: sendDate,
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      message: `Email campaign scheduled successfully for ${sendDate.toLocaleString()}.`,
      data: {
        id: scheduled._id,
        sendAt: scheduled.sendAt,
        status: scheduled.status,
      },
    });
  }

  // 3. Process immediate send
  const emailsSet = new Set();

  // Process explicit email addresses (string or array, supports comma-separation)
  const addEmail = (emailStr) => {
    if (emailStr && typeof emailStr === 'string') {
      emailStr.split(',').forEach((email) => {
        const cleaned = email.trim().toLowerCase();
        if (cleaned) {
          emailsSet.add(cleaned);
        }
      });
    }
  };

  if (Array.isArray(parsedRecipientEmails)) {
    parsedRecipientEmails.forEach(addEmail);
  } else if (typeof parsedRecipientEmails === 'string' && parsedRecipientEmails) {
    addEmail(parsedRecipientEmails);
  }

  // Process user IDs (string or array)
  if (Array.isArray(parsedRecipientIds) && parsedRecipientIds.length > 0) {
    const users = await User.find({ _id: { $in: parsedRecipientIds } }, { email: 1 });
    users.forEach((user) => {
      if (user.email) {
        emailsSet.add(user.email.trim().toLowerCase());
      }
    });
  } else if (typeof parsedRecipientIds === 'string' && parsedRecipientIds) {
    try {
      const user = await User.findById(parsedRecipientIds, { email: 1 });
      if (user && user.email) {
        emailsSet.add(user.email.trim().toLowerCase());
      }
    } catch (err) {
      // Ignore cast errors for invalid MongoDB IDs
    }
  }

  // Process roles (e.g. 'client', 'agent')
  if (Array.isArray(parsedRoles) && parsedRoles.length > 0) {
    const users = await User.find({ role: { $in: parsedRoles }, isActive: true }, { email: 1 });
    users.forEach((user) => {
      if (user.email) {
        emailsSet.add(user.email.trim().toLowerCase());
      }
    });
  } else if (typeof parsedRoles === 'string' && parsedRoles) {
    const users = await User.find({ role: parsedRoles, isActive: true }, { email: 1 });
    users.forEach((user) => {
      if (user.email) {
        emailsSet.add(user.email.trim().toLowerCase());
      }
    });
  }

  const targetEmails = Array.from(emailsSet);

  if (targetEmails.length === 0) {
    return next(
      new AppError(
        'No valid recipient emails found. Please provide emails, valid user IDs, or roles.',
        400
      )
    );
  }

  // Format email body according to template selection or customHtml
  const html = getEmailHtml(templateType, body, customHtml);

  // Dispatch emails concurrently
  const results = await Promise.allSettled(
    targetEmails.map((email) => sendEmail({ to: email, subject, text: body || '', html, attachments: finalEmailAttachments }))
  );

  const successfulSends = results.filter((r) => r.status === 'fulfilled').length;
  const failedSends = results.length - successfulSends;

  // Log the dispatch in history
  try {
    const templateName = templateType === 'blank' ? 'Custom Email (Blank)' : 
                         templateType === 'welcome_investor' ? 'Welcome Investor Kit' :
                         templateType === 'reward_perk' ? 'Reward / Perk Announcement' :
                         templateType === 'quarterly_statement' ? 'Quarterly Statement Notice' :
                         templateType === 'account_security' ? 'Account Security Alert' : 'Custom Email (Blank)';
                         
    await EmailLog.create({
      subject,
      recipientGroup: parsedRoles && parsedRoles.length > 0 ? 'Bulk Group' : (targetEmails.length > 1 ? 'Bulk Group' : 'Individual'),
      targetSummary: parsedRoles && parsedRoles.length > 0 
        ? `All Registered ${parsedRoles[0] === 'client' ? 'Clients' : 'Agents'} (${targetEmails.length} recipient${targetEmails.length > 1 ? 's' : ''} total)`
        : (targetEmails.length > 1 
            ? `${targetEmails.length} recipients total` 
            : `${targetEmails[0]}`),
      templateName,
      attachmentsCount: finalEmailAttachments ? finalEmailAttachments.length : 0,
      recipientEmails: targetEmails
    });
  } catch (logErr) {
    console.error('Failed to write email dispatch log:', logErr.message);
  }

  res.status(200).json({
    success: true,
    message: `Broadcasting completed. ${successfulSends} emails sent successfully.`,
    data: {
      totalRecipientsCount: targetEmails.length,
      successfulSends,
      failedSends,
      recipients: targetEmails,
    },
  });
});

/**
 * Periodically check and send pending scheduled emails
 */
const processScheduledEmails = async () => {
  const now = new Date();
  const pendingEmails = await ScheduledEmail.find({
    status: 'pending',
    sendAt: { $lte: now },
  });

  if (pendingEmails.length === 0) return { processed: 0 };

  let processedCount = 0;

  for (const scheduled of pendingEmails) {
    try {
      const emailsSet = new Set();

      // 1. Process recipientEmails
      if (Array.isArray(scheduled.recipientEmails)) {
        scheduled.recipientEmails.forEach((email) => {
          if (email) emailsSet.add(email.trim().toLowerCase());
        });
      }

      // 2. Process recipientIds
      if (Array.isArray(scheduled.recipientIds) && scheduled.recipientIds.length > 0) {
        const users = await User.find({ _id: { $in: scheduled.recipientIds } }, { email: 1 });
        users.forEach((user) => {
          if (user.email) emailsSet.add(user.email.trim().toLowerCase());
        });
      }

      // 3. Process roles
      if (Array.isArray(scheduled.roles) && scheduled.roles.length > 0) {
        const users = await User.find({ role: { $in: scheduled.roles }, isActive: true }, { email: 1 });
        users.forEach((user) => {
          if (user.email) emailsSet.add(user.email.trim().toLowerCase());
        });
      }

      const targetEmails = Array.from(emailsSet);

      if (targetEmails.length > 0) {
        const emailHtml = scheduled.html || getEmailHtml(scheduled.templateType, scheduled.body);

        const results = await Promise.allSettled(
          targetEmails.map((email) =>
            sendEmail({
              to: email,
              subject: scheduled.subject,
              text: scheduled.body || '',
              html: emailHtml,
              attachments: scheduled.attachments,
            })
          )
        );

        const successfulSends = results.filter((r) => r.status === 'fulfilled').length;
        console.log(`[Scheduler] Processed scheduled email campaign. Sent ${successfulSends} of ${results.length}.`);

        // Log the dispatch in history
        try {
          const templateName = scheduled.templateType === 'blank' ? 'Custom Email (Blank)' : 
                               scheduled.templateType === 'welcome_investor' ? 'Welcome Investor Kit' :
                               scheduled.templateType === 'reward_perk' ? 'Reward / Perk Announcement' :
                               scheduled.templateType === 'quarterly_statement' ? 'Quarterly Statement Notice' :
                               scheduled.templateType === 'account_security' ? 'Account Security Alert' : 'Custom Email (Blank)';
          
          await EmailLog.create({
            subject: scheduled.subject,
            recipientGroup: scheduled.roles && scheduled.roles.length > 0 ? 'Bulk Group' : (targetEmails.length > 1 ? 'Bulk Group' : 'Individual'),
            targetSummary: scheduled.roles && scheduled.roles.length > 0 
              ? `All Registered ${scheduled.roles[0] === 'client' ? 'Clients' : 'Agents'} (${targetEmails.length} recipient${targetEmails.length > 1 ? 's' : ''} total)`
              : (targetEmails.length > 1 
                  ? `${targetEmails.length} recipients total` 
                  : `${targetEmails[0]}`),
            templateName,
            attachmentsCount: scheduled.attachments ? scheduled.attachments.length : 0,
            recipientEmails: targetEmails
          });
        } catch (logErr) {
          console.error('Failed to write scheduled email dispatch log:', logErr.message);
        }
      }

      scheduled.status = 'sent';
      scheduled.sentAt = new Date();
      await scheduled.save();
      processedCount++;
    } catch (err) {
      console.error(`[Scheduler] Failed processing scheduled email ${scheduled._id}:`, err.message);
      scheduled.status = 'failed';
      scheduled.error = err.message;
      await scheduled.save();
    }
  }

  return { processed: processedCount };
};

/**
 * Trigger scheduled email processing on-demand
 * POST /api/super-admin/notifications/process-scheduled
 */
const triggerScheduledEmailsProcess = asyncHandler(async (req, res, next) => {
  const result = await processScheduledEmails();
  res.status(200).json({
    success: true,
    message: `Scheduled email check completed. Processed ${result.processed} campaigns.`,
  });
});

/**
 * Start periodic scheduler tick (local development / persistent server)
 */
const startScheduledEmailCheck = () => {
  // Check every 1 minute
  setInterval(async () => {
    try {
      await processScheduledEmails();
    } catch (err) {
      console.error('[Scheduler Interval Error]:', err.message);
    }
  }, 60000);
  console.log('[Scheduler] Scheduled email check interval started.');
};

// ==========================================
// 1. CUSTOM TEMPLATES CONTROLLERS (CRUD)
// ==========================================

const getTemplates = asyncHandler(async (req, res, next) => {
  const templates = await CustomTemplate.find().sort({ createdAt: -1 });
  res.status(200).json({
    success: true,
    count: templates.length,
    data: { templates }
  });
});

const createTemplate = asyncHandler(async (req, res, next) => {
  const { name, subject, body } = req.body;

  if (!name || !subject || !body) {
    return next(new AppError('Please provide name, subject and body content for the template.', 400));
  }

  const existing = await CustomTemplate.findOne({ name });
  if (existing) {
    return next(new AppError('A template with this name already exists.', 400));
  }

  const template = await CustomTemplate.create({ name, subject, body });

  res.status(201).json({
    success: true,
    message: 'Custom mail template created successfully.',
    data: { template }
  });
});

const updateTemplate = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { name, subject, body } = req.body;

  const template = await CustomTemplate.findById(id);
  if (!template) {
    return next(new AppError('Template not found.', 404));
  }

  if (name) {
    const existing = await CustomTemplate.findOne({ name, _id: { $ne: id } });
    if (existing) {
      return next(new AppError('A template with this name already exists.', 400));
    }
    template.name = name;
  }

  if (subject) template.subject = subject;
  if (body) template.body = body;

  await template.save();

  res.status(200).json({
    success: true,
    message: 'Custom template updated successfully.',
    data: { template }
  });
});

const deleteTemplate = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const template = await CustomTemplate.findByIdAndDelete(id);
  if (!template) {
    return next(new AppError('Template not found.', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Template deleted successfully.'
  });
});

// ==========================================
// 2. AUTO TRIGGER CONFIG CONTROLLERS
// ==========================================

const getTriggers = asyncHandler(async (req, res, next) => {
  let triggers = await AutoTriggerConfig.find().sort({ createdAt: 1 });

  // Auto-seed triggers if none exist
  if (triggers.length === 0) {
    triggers = await AutoTriggerConfig.insertMany(DEFAULT_TRIGGERS);
  }

  res.status(200).json({
    success: true,
    count: triggers.length,
    data: { triggers }
  });
});

const toggleTrigger = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const trigger = await AutoTriggerConfig.findById(id);

  if (!trigger) {
    return next(new AppError('Trigger configuration not found.', 404));
  }

  trigger.isEnabled = !trigger.isEnabled;
  await trigger.save();

  res.status(200).json({
    success: true,
    message: `Trigger '${trigger.systemEventTrigger}' has been ${trigger.isEnabled ? 'enabled' : 'disabled'}.`,
    data: { trigger }
  });
});

// ==========================================
// 3. SENT HISTORY LOGS & METRICS CONTROLLERS
// ==========================================

const getLogs = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const query = {};

  if (req.query.subject) {
    query.subject = { $regex: req.query.subject, $options: 'i' };
  }

  if (req.query.email) {
    query.recipientEmails = { $regex: req.query.email, $options: 'i' };
  }

  const total = await EmailLog.countDocuments(query);
  const logs = await EmailLog.find(query)
    .sort({ sentAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    count: logs.length,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: { logs }
  });
});

const getMetrics = asyncHandler(async (req, res, next) => {
  // 1) Total Emails Sent: Sum the sizes of recipientEmails array across all logs
  const totalSentAgg = await EmailLog.aggregate([
    { $group: { _id: null, count: { $sum: { $size: "$recipientEmails" } } } }
  ]);
  const totalEmailsSent = totalSentAgg.length > 0 ? totalSentAgg[0].count : 0;

  // 2) Scheduled Deliveries: pending count
  const scheduledDeliveries = await ScheduledEmail.countDocuments({ status: 'pending' });

  // 3) Registered Recipients: clients and agents (active)
  const registeredRecipients = await User.countDocuments({
    role: { $in: ['client', 'agent'] },
    isActive: true
  });

  // 4) System Automations: count of enabled triggers
  let systemAutomations = await AutoTriggerConfig.countDocuments({ isEnabled: true });
  // Seed trigger count if not populated yet
  if (systemAutomations === 0) {
    const triggersCount = await AutoTriggerConfig.countDocuments();
    if (triggersCount === 0) {
      await AutoTriggerConfig.insertMany(DEFAULT_TRIGGERS);
      systemAutomations = DEFAULT_TRIGGERS.length;
    }
  }

  res.status(200).json({
    success: true,
    data: {
      metrics: {
        totalEmailsSent,
        scheduledDeliveries,
        registeredRecipients,
        systemAutomations
      }
    }
  });
});

module.exports = {
  sendDirectEmail,
  triggerScheduledEmailsProcess,
  startScheduledEmailCheck,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTriggers,
  toggleTrigger,
  getLogs,
  getMetrics,
};
