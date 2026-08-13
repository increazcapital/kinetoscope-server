const User = require('../../models/User.model');
const { sendEmail } = require('../../services/email.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { ROLES } = require('../../constants/roles');

/**
 * Agent sends a notification email to their assigned Client(s) or Super Admin
 * POST /api/agent/notifications/send-email
 */
const sendAgentNotificationEmail = asyncHandler(async (req, res, next) => {
  const { recipientEmails, recipientIds, allClients, toAdmin, subject, body } = req.body;

  if (!subject || !body) {
    return next(new AppError('Subject and body are required.', 400));
  }

  const emailsSet = new Set();
  let targetLabel = '';

  if (toAdmin === true) {
    // 1. Send to all active Super Admins
    const admins = await User.find({ role: ROLES.SUPER_ADMIN, isActive: true }, { email: 1 });
    admins.forEach((admin) => {
      if (admin.email) {
        emailsSet.add(admin.email.trim().toLowerCase());
      }
    });
    targetLabel = 'Super Admins';
  } else {
    // 2. Target assigned clients
    if (allClients === true) {
      // Find all active clients assigned to this agent
      const clients = await User.find(
        { role: ROLES.CLIENT, assignedAgent: req.user._id, isActive: true },
        { email: 1 }
      );
      clients.forEach((c) => {
        if (c.email) {
          emailsSet.add(c.email.trim().toLowerCase());
        }
      });
      targetLabel = 'All Assigned Clients';
    } else {
      // Resolve client emails from provided emails or IDs, enforcing that they are assigned to this agent
      const clientQuery = {
        role: ROLES.CLIENT,
        assignedAgent: req.user._id,
        isActive: true,
      };

      const filterIds = [];
      const filterEmails = [];

      // Collect IDs
      if (Array.isArray(recipientIds)) {
        recipientIds.forEach((id) => {
          if (id && typeof id === 'string') filterIds.push(id);
        });
      } else if (typeof recipientIds === 'string' && recipientIds) {
        filterIds.push(recipientIds);
      }

      // Collect emails (support comma-separation)
      const parseEmail = (emailStr) => {
        if (emailStr && typeof emailStr === 'string') {
          emailStr.split(',').forEach((email) => {
            const cleaned = email.trim().toLowerCase();
            if (cleaned) {
              filterEmails.push(cleaned);
            }
          });
        }
      };

      if (Array.isArray(recipientEmails)) {
        recipientEmails.forEach(parseEmail);
      } else if (typeof recipientEmails === 'string' && recipientEmails) {
        parseEmail(recipientEmails);
      }

      // Construct query matching either the emails or user IDs
      const matches = [];
      if (filterIds.length > 0) {
        matches.push({ _id: { $in: filterIds } });
      }
      if (filterEmails.length > 0) {
        matches.push({ email: { $in: filterEmails } });
      }

      if (matches.length > 0) {
        clientQuery.$or = matches;
        const clients = await User.find(clientQuery, { email: 1 });
        clients.forEach((c) => {
          if (c.email) {
            emailsSet.add(c.email.trim().toLowerCase());
          }
        });
      }
      targetLabel = 'Selected Clients';
    }
  }

  const targetEmails = Array.from(emailsSet);

  if (targetEmails.length === 0) {
    return next(
      new AppError(
        'No valid assigned client recipients found. Ensure the clients are assigned to you and active.',
        400
      )
    );
  }

  const { buildLightEmailTemplate } = require('../../services/email.service');

  const contentHtml = `
    <div style="background-color: #F8FAFC; border-radius: 8px; padding: 14px 16px; border-left: 4px solid #059669; margin-bottom: 20px; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <span style="font-size: 12px; color: #64748B; font-weight: 700; text-transform: uppercase;">From Agent:</span><br/>
      <strong style="color: #0F172A; font-size: 15px;">${req.user.name}</strong> <span style="color: #059669; font-family: monospace; font-weight: 700;">(${req.user.clientCode || req.user.email})</span>
    </div>
    <div style="color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">
      ${body}
    </div>
  `;

  const html = buildLightEmailTemplate({
    title: `Agent Portal Message: ${req.user.name}`,
    subtitle: `Subject: ${subject}`,
    contentHtml,
    bannerAccent: '#059669'
  });

  // Send emails
  const results = await Promise.allSettled(
    targetEmails.map((email) =>
      sendEmail({
        to: email,
        subject: `[Agent Portal Message] ${subject}`,
        text: body,
        html,
      })
    )
  );

  const successfulSends = results.filter((r) => r.status === 'fulfilled').length;
  const failedSends = results.length - successfulSends;

  res.status(200).json({
    success: true,
    message: `Message sent successfully to ${targetLabel}.`,
    data: {
      totalRecipientsCount: targetEmails.length,
      successfulSends,
      failedSends,
      recipients: targetEmails,
    },
  });
});

const AgentCommission = require('../../models/AgentCommission.model');
const Transaction = require('../../models/Transaction.model');
const ServiceRequest = require('../../models/ServiceRequest.model');
const Project = require('../../models/Project.model');
const Article = require('../../models/Article.model');
const Perk = require('../../models/Perk.model');
const PerformanceReward = require('../../models/PerformanceReward.model');
const AgentProfile = require('../../models/AgentProfile.model');

/**
 * Get in-app notifications/alerts for logged in Agent
 * GET /api/agent/notifications
 */
const getAgentNotifications = asyncHandler(async (req, res) => {
  const agentId = req.user._id;

  const [
    assignedClients,
    transactions,
    commissions,
    serviceRequests,
    projects,
    articles,
    perks,
    rewards,
    profile
  ] = await Promise.all([
    User.find({ role: ROLES.CLIENT, assignedAgent: agentId }).select('name email createdAt clientCode').lean().catch(() => []),
    Transaction.find({ agentId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    AgentCommission.find({ agentId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    ServiceRequest.find({ createdBy: agentId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    Project.find({ isPublished: true }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    Article.find({ isPublished: true }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    Perk.find({ isActive: true }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    PerformanceReward.find({ $or: [{ userId: agentId }, { agentId }] }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    AgentProfile.findOne({ userId: agentId }).lean().catch(() => null),
  ]);

  const notifications = [];

  // 1. Assigned Clients onboarded
  (assignedClients || []).forEach((c) => {
    notifications.push({
      id: `client-${c._id}`,
      type: 'client_onboarded',
      title: 'New Client Assigned',
      message: `${c.name || 'Client'} (${c.email}) has been assigned to your portal.`,
      date: c.createdAt || new Date(),
      link: '/clients',
      category: 'onboarding',
    });
  });

  // 2. Transactions (Deposit / Withdrawal)
  (transactions || []).forEach((t) => {
    const rawSt = (t.status || 'pending').toLowerCase();
    const isApproved = rawSt === 'approved';
    const isRejected = rawSt === 'rejected';
    notifications.push({
      id: `tx-${t._id}`,
      type: 'transaction',
      title: `${t.type ? t.type.toUpperCase() : 'TRANSACTION'} ${(t.status || 'PENDING').toUpperCase()}`,
      message: `Your ${t.type ? t.type.toLowerCase() : 'transaction'} request of ₹${(t.amount || 0).toLocaleString('en-IN')} is ${(t.status || 'pending').toLowerCase()}.`,
      date: t.updatedAt || t.actionAt || t.createdAt || new Date(),
      link: '/withdrawal',
      category: isApproved ? 'success' : isRejected ? 'danger' : 'info',
    });
  });

  // 3. Agent Commissions
  (commissions || []).forEach((cm) => {
    notifications.push({
      id: `cm-${cm._id}`,
      type: 'commission',
      title: `Commission ${cm.status || 'Updated'}`,
      message: `Commission of ₹${(cm.amount || 0).toLocaleString('en-IN')} for ${cm.period || 'payout'} is marked as ${cm.status || 'processed'}.`,
      date: cm.date || cm.createdAt || new Date(),
      link: '/commission',
      category: 'success',
    });
  });

  // 4. Service Requests
  (serviceRequests || []).forEach((reqItem) => {
    notifications.push({
      id: `sr-${reqItem._id}`,
      type: 'service_request',
      title: `Service Request: ${reqItem.category || reqItem.subject || 'Query'}`,
      message: `Request #${reqItem.requestId || reqItem._id} status is ${reqItem.status || 'OPEN'}.`,
      date: reqItem.updatedAt || reqItem.createdAt || new Date(),
      link: '/support',
      category: reqItem.status === 'Resolved' || reqItem.status === 'Closed' ? 'success' : 'info',
    });
  });

  // 5. New Published Projects
  (projects || []).forEach((p) => {
    notifications.push({
      id: `proj-${p._id}`,
      type: 'project',
      title: `New Project Listed: ${p.name}`,
      message: `Project "${p.name}" (${p.segment || 'Film Fund'}) is now active.`,
      date: p.createdAt || new Date(),
      link: '/portfolio',
      category: 'info',
    });
  });

  // 6. News & Media Articles
  (articles || []).forEach((art) => {
    notifications.push({
      id: `art-${art._id}`,
      type: 'news',
      title: `News & Media: ${art.title}`,
      message: art.summary || art.title || 'New press release published.',
      date: art.createdAt || new Date(),
      link: '/media',
      category: 'info',
    });
  });

  // 7. Perks
  (perks || []).forEach((pk) => {
    notifications.push({
      id: `pk-${pk._id}`,
      type: 'perk',
      title: `Perk Unlocked: ${pk.title}`,
      message: pk.description || `Perk "${pk.title}" is available for agents.`,
      date: pk.createdAt || new Date(),
      link: '/rewards',
      category: 'success',
    });
  });

  // 8. Performance Rewards
  (rewards || []).forEach((rw) => {
    notifications.push({
      id: `rw-${rw._id}`,
      type: 'reward',
      title: `Reward Credited: ${rw.rewardTitle || rw.title || 'Agent Bonus'}`,
      message: `Performance reward of ₹${(rw.amount || 0).toLocaleString('en-IN')} has been credited.`,
      date: rw.createdAt || new Date(),
      link: '/rewards',
      category: 'success',
    });
  });

  // 9. KYC Status
  if (profile && profile.kycStatus) {
    const kycSt = String(profile.kycStatus).toUpperCase();
    notifications.push({
      id: `kyc-${profile._id}`,
      type: 'kyc',
      title: `KYC Status: ${kycSt}`,
      message: kycSt === 'VERIFIED' ? 'Your agent KYC agreement is verified.' : kycSt === 'REJECTED' ? 'Your KYC verification requires re-upload.' : 'Your agent KYC is under review.',
      date: profile.updatedAt || profile.createdAt || new Date(),
      link: '/profile',
      category: kycSt === 'VERIFIED' ? 'success' : kycSt === 'REJECTED' ? 'danger' : 'warning',
    });
  }

  notifications.sort((a, b) => new Date(b.date) - new Date(a.date));

  // User persistent status filter
  const UserNotificationStatus = require('../../models/UserNotificationStatus.model');
  const userStatus = await UserNotificationStatus.findOne({ userId: agentId }).lean().catch(() => null);
  const readIds = new Set(userStatus?.readIds || []);
  const deletedIds = new Set(userStatus?.deletedIds || []);

  const isDeleted = (nId) => {
    if (!nId) return false;
    if (deletedIds.has(nId)) return true;
    const baseId = String(nId).split('-').slice(0, 2).join('-');
    return deletedIds.has(baseId) || Array.from(deletedIds).some(d => d.startsWith(baseId));
  };

  const isRead = (nId) => {
    if (!nId) return false;
    if (readIds.has(nId)) return true;
    const baseId = String(nId).split('-').slice(0, 2).join('-');
    return readIds.has(baseId) || Array.from(readIds).some(r => r.startsWith(baseId));
  };

  const processedList = notifications
    .filter((n) => !isDeleted(n.id))
    .map((n) => ({
      ...n,
      read: isRead(n.id) || n.read || false,
      isRead: isRead(n.id) || n.read || false,
    }))
    .slice(0, 25);

  res.status(200).json({
    success: true,
    notifications: processedList,
    data: processedList,
  });
});

/**
 * Mark Agent Notification as Read
 * PATCH /api/agent/notifications/:id/read
 */
const markAgentNotificationRead = asyncHandler(async (req, res) => {
  const agentId = req.user._id;
  const { id } = req.params;
  const { ids } = req.body || {};
  const UserNotificationStatus = require('../../models/UserNotificationStatus.model');

  let status = await UserNotificationStatus.findOne({ userId: agentId });
  if (!status) {
    status = await UserNotificationStatus.create({ userId: agentId, readIds: [], deletedIds: [] });
  }

  const toAdd = id === 'all' || !id ? (Array.isArray(ids) ? ids : []) : [id];
  toAdd.forEach((item) => {
    if (item) {
      if (!status.readIds.includes(item)) status.readIds.push(item);
      const baseId = String(item).split('-').slice(0, 2).join('-');
      if (baseId && !status.readIds.includes(baseId)) status.readIds.push(baseId);
    }
  });

  await status.save();
  res.status(200).json({ success: true, message: 'Notification marked as read.' });
});

/**
 * Delete Agent Notification
 * DELETE /api/agent/notifications/:id
 */
const deleteAgentNotification = asyncHandler(async (req, res) => {
  const agentId = req.user._id;
  const { id } = req.params;
  const { ids } = req.body || {};
  const UserNotificationStatus = require('../../models/UserNotificationStatus.model');

  let status = await UserNotificationStatus.findOne({ userId: agentId });
  if (!status) {
    status = await UserNotificationStatus.create({ userId: agentId, readIds: [], deletedIds: [] });
  }

  const toAdd = id === 'all' || !id ? (Array.isArray(ids) ? ids : []) : [id];
  toAdd.forEach((item) => {
    if (item) {
      if (!status.deletedIds.includes(item)) status.deletedIds.push(item);
      const baseId = String(item).split('-').slice(0, 2).join('-');
      if (baseId && !status.deletedIds.includes(baseId)) status.deletedIds.push(baseId);
    }
  });

  await status.save();
  res.status(200).json({ success: true, message: 'Notification deleted.' });
});

module.exports = {
  sendAgentNotificationEmail,
  getAgentNotifications,
  markAgentNotificationRead,
  deleteAgentNotification,
};

