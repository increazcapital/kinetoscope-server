const User = require('../../models/User.model');
const { sendEmail } = require('../../services/email.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { ROLES } = require('../../constants/roles');

/**
 * Client sends a notification email to their assigned Agent or Super Admin
 * POST /api/client/notifications/send-email
 */
const sendClientNotificationEmail = asyncHandler(async (req, res, next) => {
  const { to, subject, body } = req.body;

  if (!to || !subject || !body) {
    return next(new AppError('Recipient target (to), subject, and body are required.', 400));
  }

  if (!['agent', 'admin'].includes(to)) {
    return next(new AppError("Recipient target (to) must be either 'agent' or 'admin'.", 400));
  }

  let recipientEmails = [];
  let targetLabel = '';

  if (to === 'agent') {
    if (!req.user.assignedAgent) {
      return next(new AppError('You do not have an assigned agent to contact.', 400));
    }

    const agent = await User.findById(req.user.assignedAgent);
    if (!agent || !agent.email || !agent.isActive) {
      return next(new AppError('Your assigned agent is currently unavailable.', 404));
    }

    recipientEmails.push(agent.email);
    targetLabel = `Assigned Agent (${agent.name})`;
  } else if (to === 'admin') {
    const admins = await User.find({ role: ROLES.SUPER_ADMIN, isActive: true }, { email: 1 });
    recipientEmails = admins.map((admin) => admin.email).filter(Boolean);

    if (recipientEmails.length === 0) {
      return next(new AppError('Super Admin contact details are not available.', 404));
    }
    targetLabel = 'Super Admins';
  }

  const { buildLightEmailTemplate } = require('../../services/email.service');

  const contentHtml = `
    <div style="background-color: #F8FAFC; border-radius: 8px; padding: 14px 16px; border-left: 4px solid #0284C7; margin-bottom: 20px; border: 1px solid #E2E8F0; border-left-width: 4px;">
      <span style="font-size: 12px; color: #64748B; font-weight: 700; text-transform: uppercase;">From Client:</span><br/>
      <strong style="color: #0F172A; font-size: 15px;">${req.user.name}</strong> <span style="color: #0284C7; font-family: monospace; font-weight: 700;">(${req.user.clientCode || req.user.email})</span>
    </div>
    <div style="color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">
      ${body}
    </div>
  `;

  const html = buildLightEmailTemplate({
    title: `Client Portal Message: ${req.user.name}`,
    subtitle: `Subject: ${subject}`,
    contentHtml,
    bannerAccent: '#0284C7'
  });

  // Dispatch email
  await Promise.allSettled(
    recipientEmails.map((email) =>
      sendEmail({
        to: email,
        subject: `[Client Portal Message] ${subject}`,
        text: body,
        html,
      })
    )
  );

  res.status(200).json({
    success: true,
    message: `Message sent successfully to ${targetLabel}.`,
  });
});

const Transaction = require('../../models/Transaction.model');
const Investment = require('../../models/Investment.model');
const RoiPayout = require('../../models/RoiPayout.model');
const ServiceRequest = require('../../models/ServiceRequest.model');
const Project = require('../../models/Project.model');
const Article = require('../../models/Article.model');
const Perk = require('../../models/Perk.model');
const PerformanceReward = require('../../models/PerformanceReward.model');
const ClientProfile = require('../../models/ClientProfile.model');

/**
 * Get in-app notifications/alerts for logged in Client
 * GET /api/client/notifications
 */
const getClientNotifications = asyncHandler(async (req, res) => {
  const clientId = req.user._id;

  const [
    transactions,
    investments,
    roiPayouts,
    serviceRequests,
    projects,
    articles,
    perks,
    rewards,
    profile
  ] = await Promise.all([
    Transaction.find({ clientId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    Investment.find({ clientId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    RoiPayout.find({ clientId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    ServiceRequest.find({ createdBy: clientId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    Project.find({ isPublished: true }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    Article.find({ isPublished: true }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    Perk.find({ isActive: true }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    PerformanceReward.find({ $or: [{ userId: clientId }, { clientId }] }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    ClientProfile.findOne({ userId: clientId }).lean().catch(() => null),
  ]);

  const notifications = [];

  // 1. Transactions (Deposit / Withdrawal)
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
      link: '/complete-transaction-details',
      category: isApproved ? 'success' : isRejected ? 'danger' : 'info',
    });
  });

  // 2. Investments
  (investments || []).forEach((inv) => {
    const rawSeg = inv.segment;
    const segName = (!rawSeg || rawSeg === 'General' || rawSeg === 'General Capital Pool' || rawSeg === 'Unallocated' || rawSeg === 'Unallocated Pool') ? 'Capital Deposit' : rawSeg;
    notifications.push({
      id: `inv-${inv._id}`,
      type: 'investment',
      title: `Investment Active (${segName})`,
      message: `Investment contract for ₹${(inv.investmentAmount || inv.amount || 0).toLocaleString('en-IN')} is active.`,
      date: inv.createdAt || inv.investmentDate || new Date(),
      link: '/portfolio',
      category: 'success',
    });
  });

  // 3. ROI Payouts
  (roiPayouts || []).forEach((roi) => {
    notifications.push({
      id: `roi-${roi._id}`,
      type: 'roi',
      title: `ROI Payout ${roi.status || 'Processed'}`,
      message: `Monthly ROI payout of ₹${(roi.amount || 0).toLocaleString('en-IN')} for ${roi.payoutMonth || 'period'} is ${roi.status ? roi.status.toLowerCase() : 'processed'}.`,
      date: roi.processedDate || roi.createdAt || new Date(),
      link: '/complete-transaction-details',
      category: 'success',
    });
  });

  // 4. Service Requests
  (serviceRequests || []).forEach((sr) => {
    notifications.push({
      id: `sr-${sr._id}`,
      type: 'service_request',
      title: `Service Request: ${sr.category || sr.subject || 'Query'}`,
      message: `Request #${sr.requestId || sr._id} status is ${sr.status || 'Open'}.`,
      date: sr.updatedAt || sr.createdAt || new Date(),
      link: '/service-requests',
      category: sr.status === 'Resolved' || sr.status === 'Closed' ? 'success' : 'info',
    });
  });

  // 5. New Published Projects
  (projects || []).forEach((p) => {
    notifications.push({
      id: `proj-${p._id}`,
      type: 'project',
      title: `New Project Listed: ${p.name}`,
      message: `Project "${p.name}" (${p.segment || 'Film Fund'}) is now open for investment.`,
      date: p.createdAt || new Date(),
      link: '/projects',
      category: 'info',
    });
  });

  // 6. News & Media Articles
  (articles || []).forEach((art) => {
    notifications.push({
      id: `art-${art._id}`,
      type: 'news',
      title: `News & Media: ${art.title}`,
      message: art.summary || art.title || 'New press release published by Kinetoscope Films.',
      date: art.createdAt || new Date(),
      link: '/media',
      category: 'info',
    });
  });

  // 7. Perks & Recognition
  (perks || []).forEach((pk) => {
    notifications.push({
      id: `pk-${pk._id}`,
      type: 'perk',
      title: `Perk Unlocked: ${pk.title}`,
      message: pk.description || `Exclusive perk "${pk.title}" is available for your tier.`,
      date: pk.createdAt || new Date(),
      link: '/perks',
      category: 'success',
    });
  });

  // 8. Performance Rewards
  (rewards || []).forEach((rw) => {
    notifications.push({
      id: `rw-${rw._id}`,
      type: 'reward',
      title: `Reward Credited: ${rw.rewardTitle || rw.title || 'Bonus Credit'}`,
      message: `Performance reward of ₹${(rw.amount || 0).toLocaleString('en-IN')} has been credited.`,
      date: rw.createdAt || new Date(),
      link: '/perks',
      category: 'success',
    });
  });

  // 9. KYC Status
  const bankDocMissing = !profile || !profile.bankProofDocument || profile.bankProofDocument.trim() === '';
  if (profile && profile.kycStatus) {
    const kycSt = bankDocMissing ? 'PENDING' : String(profile.kycStatus).toUpperCase();
    notifications.push({
      id: `kyc-${profile._id}`,
      type: 'kyc',
      title: `KYC Status: ${kycSt}`,
      message: kycSt === 'VERIFIED' ? 'Your KYC documents & agreement are verified.' : kycSt === 'REJECTED' ? 'Your KYC verification requires re-upload.' : 'Your KYC documents are under review. Please ensure all required documents are uploaded.',
      date: profile.updatedAt || profile.createdAt || new Date(),
      link: '/profile',
      category: kycSt === 'VERIFIED' ? 'success' : kycSt === 'REJECTED' ? 'danger' : 'warning',
    });
  }

  // 10. Persistent Bank Document Reminder (un-dismissable — stays until uploaded)
  if (bankDocMissing) {
    notifications.unshift({
      id: 'bank-doc-required-persistent',
      type: 'bank_doc_required',
      title: '⚠️ Action Required: Upload Bank Document',
      message: 'Please upload your bank proof document (cancelled cheque / bank statement) to complete your KYC verification. Your KYC cannot be approved without this document.',
      date: new Date(),
      link: '/profile',
      category: 'danger',
      persistent: true,
    });
  }

  // Sort latest first (but persistent notifications stay at the top)
  notifications.sort((a, b) => {
    if (a.persistent && !b.persistent) return -1;
    if (!a.persistent && b.persistent) return 1;
    return new Date(b.date) - new Date(a.date);
  });

  // User persistent status filter
  const UserNotificationStatus = require('../../models/UserNotificationStatus.model');
  const userStatus = await UserNotificationStatus.findOne({ userId: clientId }).lean().catch(() => null);
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
    .filter((n) => n.persistent || !isDeleted(n.id))
    .map((n) => ({
      ...n,
      read: n.persistent ? false : (isRead(n.id) || n.read || false),
      isRead: n.persistent ? false : (isRead(n.id) || n.read || false),
    }))
    .slice(0, 25);

  res.status(200).json({
    success: true,
    notifications: processedList,
    data: processedList,
  });
});

/**
 * Mark Client Notification as Read
 * PATCH /api/client/notifications/:id/read
 */
const markClientNotificationRead = asyncHandler(async (req, res) => {
  const clientId = req.user._id;
  const { id } = req.params;
  const { ids } = req.body || {};
  const UserNotificationStatus = require('../../models/UserNotificationStatus.model');

  let status = await UserNotificationStatus.findOne({ userId: clientId });
  if (!status) {
    status = await UserNotificationStatus.create({ userId: clientId, readIds: [], deletedIds: [] });
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
 * Delete Client Notification
 * DELETE /api/client/notifications/:id
 */
const deleteClientNotification = asyncHandler(async (req, res) => {
  const clientId = req.user._id;
  const { id } = req.params;
  const { ids } = req.body || {};
  const UserNotificationStatus = require('../../models/UserNotificationStatus.model');

  let status = await UserNotificationStatus.findOne({ userId: clientId });
  if (!status) {
    status = await UserNotificationStatus.create({ userId: clientId, readIds: [], deletedIds: [] });
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
  sendClientNotificationEmail,
  getClientNotifications,
  markClientNotificationRead,
  deleteClientNotification,
};

