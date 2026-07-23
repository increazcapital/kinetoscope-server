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

  // premium formatted email layout for client messages
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px; font-size: 18px; font-weight: bold;">
        Message from Client: ${req.user.name} (${req.user.clientCode || 'No Code'})
      </h2>
      <div style="background: #f8fafc; border-radius: 6px; padding: 12px 16px; border-left: 4px solid #3b82f6; margin-bottom: 20px;">
        <span style="font-size: 13px; color: #64748b; font-weight: bold;">From Client:</span><br/>
        <strong style="color: #1e293b;">${req.user.name}</strong> (${req.user.email})
      </div>
      <div style="color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">
        ${body}
      </div>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">
        Sent via Kinetoscope Client Portal
      </p>
    </div>
  `;

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

/**
 * Get in-app notifications/alerts for logged in Client
 * GET /api/client/notifications
 */
const getClientNotifications = asyncHandler(async (req, res) => {
  const clientId = req.user._id;

  const [transactions, investments, roiPayouts, serviceRequests] = await Promise.all([
    Transaction.find({ user: clientId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    Investment.find({ user: clientId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    RoiPayout.find({ user: clientId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
    ServiceRequest.find({ raisedBy: clientId }).sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
  ]);

  const notifications = [];

  // 1. Transactions (Deposit / Withdrawal)
  (transactions || []).forEach((t) => {
    const isApproved = t.status === 'Approved';
    const isRejected = t.status === 'Rejected';
    notifications.push({
      id: `tx-${t._id}`,
      type: 'transaction',
      title: `${t.type || 'Transaction'} ${t.status}`,
      message: `Your ${t.type ? t.type.toLowerCase() : 'transaction'} request of ₹${(t.amount || 0).toLocaleString('en-IN')} is ${t.status.toLowerCase()}.`,
      date: t.createdAt || new Date(),
      link: '/complete-transaction-details',
      category: isApproved ? 'success' : isRejected ? 'danger' : 'info',
    });
  });

  // 2. Investments
  (investments || []).forEach((inv) => {
    notifications.push({
      id: `inv-${inv._id}`,
      type: 'investment',
      title: `Investment Contract Active`,
      message: `Investment contract #${inv.contractNumber || inv.id || 'N/A'} for ₹${(inv.principalAmount || 0).toLocaleString('en-IN')} is active.`,
      date: inv.createdAt || new Date(),
      link: '/investment',
      category: 'success',
    });
  });

  // 3. ROI Payouts
  (roiPayouts || []).forEach((roi) => {
    notifications.push({
      id: `roi-${roi._id}`,
      type: 'roi',
      title: `ROI Payout ${roi.status || 'Processed'}`,
      message: `Monthly ROI payout of ₹${(roi.amount || 0).toLocaleString('en-IN')} for ${roi.monthYear || 'period'} is ${roi.status ? roi.status.toLowerCase() : 'processed'}.`,
      date: roi.payoutDate || roi.createdAt || new Date(),
      link: '/investment',
      category: 'success',
    });
  });

  // 4. Service Requests
  (serviceRequests || []).forEach((sr) => {
    notifications.push({
      id: `sr-${sr._id}`,
      type: 'service_request',
      title: `Service Request Update`,
      message: `Request "${sr.subject || sr.type || 'Query'}" is currently ${sr.status || 'Open'}.`,
      date: sr.updatedAt || sr.createdAt || new Date(),
      link: '/service-requests',
      category: 'info',
    });
  });

  // Sort latest first and slice top 20
  notifications.sort((a, b) => new Date(b.date) - new Date(a.date));
  const result = notifications.slice(0, 20);

  res.status(200).json({
    status: 'success',
    results: result.length,
    notifications: result,
  });
});

module.exports = {
  sendClientNotificationEmail,
  getClientNotifications,
};

