const ServiceRequest = require('../../models/ServiceRequest.model');
const User = require('../../models/User.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');
const { sendEmail } = require('../../services/email.service');
const { ROLES } = require('../../constants/roles');

// Mock seeding logic disabled by request

/**
 * Create a new Service Request (Agents / Clients)
 * POST /api/super-admin/service-requests
 */
const createServiceRequest = asyncHandler(async (req, res, next) => {
  const { category, subject, description } = req.body;

  let attachmentUrl = '';
  if (req.file) {
    try {
      console.log(`[Service Request] Uploading attachment file to Cloudinary...`);
      attachmentUrl = await uploadBufferToCloudinary(req.file.buffer);
    } catch (err) {
      return next(new AppError(`Failed to upload attachment to Cloudinary: ${err.message}`, 500));
    }
  }

  const newRequest = await ServiceRequest.create({
    createdBy: req.user.id,
    category,
    subject,
    description,
    attachment: attachmentUrl,
  });

  // Dispatch Email Notification to info@kinetoscopefilms.com asynchronously
  try {
    const { sendServiceRequestAlertToAdmin } = require('../../services/email.service');
    sendServiceRequestAlertToAdmin(req.user, category, subject, description).catch(e => console.error('[Service Request Email Error]:', e.message));
  } catch (emailErr) {
    console.error('[Service Request Email Trigger Error]:', emailErr.message);
  }

  res.status(201).json({
    success: true,
    message: 'Service request submitted successfully.',
    data: newRequest,
  });
});

/**
 * Get Service Requests submitted by the logged-in agent/client
 * GET /api/super-admin/service-requests/my-requests
 */
const getMyServiceRequests = asyncHandler(async (req, res, next) => {

  const requests = await ServiceRequest.find({ createdBy: req.user.id })
    .sort({ createdAt: -1 })
    .lean();

  const openCount = requests.filter(r => r.status === 'OPEN').length;
  const inProgressCount = requests.filter(r => r.status === 'IN PROGRESS').length;
  const resolvedCount = requests.filter(r => r.status === 'RESOLVED').length;

  res.status(200).json({
    success: true,
    count: requests.length,
    data: {
      requests,
      stats: {
        open: openCount,
        inProgress: inProgressCount,
        resolved: resolvedCount,
      },
    },
  });
});

/**
 * Get All Service Requests (Super Admin View with Filters)
 * GET /api/super-admin/service-requests
 */
const getAllServiceRequests = asyncHandler(async (req, res, next) => {

  const { status, raiserType, startDate, endDate } = req.query;
  const query = {};

  // Filter by Status
  if (status && status !== 'All Statuses') {
    query.status = status.toUpperCase();
  }

  // Filter by Raiser Type (Client or Agent)
  if (raiserType && raiserType !== 'All Raisers') {
    const role = raiserType.toLowerCase();
    const users = await User.find({ role }).select('_id');
    const userIds = users.map(u => u._id);
    query.createdBy = { $in: userIds };
  }

  // Filter by Date Range
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const requests = await ServiceRequest.find(query)
    .populate('createdBy', 'name email role clientCode')
    .sort({ createdAt: -1 })
    .lean();

  // Dynamically calculate overall unresolved requests (OPEN or IN PROGRESS)
  const unresolvedCount = await ServiceRequest.countDocuments({
    status: { $in: ['OPEN', 'IN PROGRESS'] },
  });

  res.status(200).json({
    success: true,
    unresolvedCount,
    count: requests.length,
    data: {
      requests,
    },
  });
});

/**
 * Update Service Request Status / Remarks (Super Admin View)
 * PATCH /api/super-admin/service-requests/:id/status
 */
const updateServiceRequestStatus = asyncHandler(async (req, res, next) => {
  const { status, adminRemarks, notifyUser } = req.body;

  const request = await ServiceRequest.findById(req.params.id).populate('createdBy', 'name email role');
  if (!request) {
    return next(new AppError('Service request not found', 404));
  }

  const updates = {};
  if (status !== undefined) updates.status = status.toUpperCase();
  if (adminRemarks !== undefined) {
    updates.adminRemarks = adminRemarks;
    updates.adminNote = adminRemarks;
    updates.remarks = adminRemarks;
  }

  const updatedRequest = await ServiceRequest.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  ).populate('createdBy', 'name email role clientCode');

  // Trigger real email notification unless explicitly disabled (notifyUser === false)
  const creator = updatedRequest.createdBy || request.createdBy;
  const shouldNotify = notifyUser !== false;

  if (shouldNotify && creator && creator.email) {
    try {
      const { buildLightEmailTemplate, sendEmail } = require('../../services/email.service');
      const reqId = updatedRequest.requestId || request.requestId || 'Ticket';
      const reqSubject = updatedRequest.subject || request.subject || 'Support Ticket';
      const currentStatus = (updatedRequest.status || status || 'UPDATED').toUpperCase();
      const remarksText = adminRemarks || updatedRequest.adminRemarks || updatedRequest.remarks || 'Your request has been reviewed.';

      const contentHtml = `
        <p style="font-size: 15px; color: #1E293B;">Hello <strong>${creator.name || 'Valued Client'}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">Your service request <strong>${reqId}</strong> ("${reqSubject}") has been updated by Super Admin.</p>
        <div style="margin: 20px 0; padding: 16px; background-color: #F8FAFC; border-left: 4px solid #059669; border-radius: 8px; border: 1px solid #E2E8F0; border-left-width: 4px;">
          <p style="margin: 0; color: #0F172A; font-weight: 700; font-size: 14px;">Status: <span style="color: #059669; text-transform: uppercase;">${currentStatus}</span></p>
          <p style="margin: 8px 0 0 0; color: #334155; font-size: 13.5px;"><strong>Admin Response / Remarks:</strong> ${remarksText}</p>
        </div>
        <p style="font-size: 13px; color: #64748B; margin-top: 16px;">You can view the complete status update by logging into your portal dashboard.</p>
      `;

      const html = buildLightEmailTemplate({
        title: 'Support Ticket Response Received',
        subtitle: `Request ID: ${reqId}`,
        contentHtml,
        bannerAccent: '#059669'
      });

      await sendEmail({
        to: creator.email,
        subject: `Kinetoscope – Response on Ticket ${reqId} (${currentStatus})`,
        text: `Hello ${creator.name || 'Client'},\n\nYour service request ${reqId} ("${reqSubject}") has been updated to status: ${currentStatus}.\n\nAdmin Remarks: ${remarksText}\n\n— Kinetoscope Support Team`,
        html,
      });
      console.log(`[Service Request Response Email] Sent email successfully to ${creator.email}`);
    } catch (err) {
      console.error(`[Service Request Response Email Error] Failed to send email to ${creator?.email}:`, err.message);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Service request status updated successfully.',
    data: updatedRequest,
  });
});

/**
 * Get a single Service Request by ID (For Review Modal)
 * GET /api/super-admin/service-requests/:id
 */
const getServiceRequestById = asyncHandler(async (req, res, next) => {
  const request = await ServiceRequest.findById(req.params.id)
    .populate('createdBy', 'name email role clientCode');

  if (!request) {
    return next(new AppError('Service request not found', 404));
  }

  res.status(200).json({
    success: true,
    data: {
      request,
    },
  });
});

/**
 * Delete a Service Request
 * DELETE /api/super-admin/service-requests/:id
 */
const deleteServiceRequest = asyncHandler(async (req, res, next) => {
  const request = await ServiceRequest.findById(req.params.id);
  if (!request) {
    return next(new AppError('Service request not found', 404));
  }

  await ServiceRequest.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Service request deleted successfully.',
  });
});

module.exports = {
  createServiceRequest,
  getMyServiceRequests,
  getAllServiceRequests,
  getServiceRequestById,
  updateServiceRequestStatus,
  deleteServiceRequest,
};
