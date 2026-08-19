const Project = require('../../models/Project.model');
const ProjectUpdate = require('../../models/ProjectUpdate.model');
const User = require('../../models/User.model');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../../services/cloudinary.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
/**
 * Seed default mock projects if catalog is empty
 */
const seedMockProjects = async (creatorId) => {
  return; // Disabled mock project seeding
};

/**
 * Create a new Project (Super Admin only)
 * POST /api/super-admin/projects
 */
const createProject = asyncHandler(async (req, res, next) => {
  const {
    name,
    segment,
    status,
    portfolioValue,
    monthlyRoi,
    riskLevel,
    milestoneProgress,
    minInvestment,
    targetFunding,
    fundedAmount,
    totalSlots,
    slotsAvailable,
    health,
    summary,
    currentUpdate,
    allocationFocus,
    horizon,
    totalDividendPool,
  } = req.body;

  let bannerImageUrl = '';
  if (req.file) {
    try {
      console.log('[Project Controller] Uploading project banner image to Cloudinary...');
      bannerImageUrl = await uploadBufferToCloudinary(req.file.buffer, 'kinetoscope/projects');
    } catch (uploadError) {
      return next(new AppError(`Banner image upload failed: ${uploadError.message}`, 500));
    }
  }

  const targetFundingVal = Number(targetFunding) || 0;
  let defaultPortfolioValue = portfolioValue;
  if (!defaultPortfolioValue || defaultPortfolioValue === '₹0.0 Cr' || defaultPortfolioValue === '₹0 Cr') {
    if (targetFundingVal >= 10000000) {
      defaultPortfolioValue = `₹${(targetFundingVal / 10000000).toFixed(1)} Cr`;
    } else if (targetFundingVal >= 100000) {
      defaultPortfolioValue = `₹${(targetFundingVal / 100000).toFixed(1)} L`;
    } else {
      defaultPortfolioValue = `₹${targetFundingVal.toLocaleString('en-IN')}`;
    }
  }

  const project = await Project.create({
    name,
    segment,
    status: status || 'Planning',
    portfolioValue: defaultPortfolioValue,
    monthlyRoi: monthlyRoi || '1.0%',
    riskLevel: riskLevel || 'Medium',
    milestoneProgress: milestoneProgress !== undefined ? Number(milestoneProgress) : 0,
    minInvestment: minInvestment !== undefined ? Number(minInvestment) : 200000,
    targetFunding: targetFunding !== undefined ? Number(targetFunding) : 25000000,
    fundedAmount: fundedAmount !== undefined ? Number(fundedAmount) : 0,
    totalSlots: totalSlots !== undefined ? Number(totalSlots) : 20,
    slotsAvailable: slotsAvailable !== undefined ? Number(slotsAvailable) : 20,
    health: health || 'On Track',
    summary: summary || '',
    currentUpdate: currentUpdate || '',
    allocationFocus: allocationFocus || '',
    horizon: horizon || '12 Months',
    totalDividendPool: totalDividendPool !== undefined ? Number(totalDividendPool) : 0,
    bannerImage: bannerImageUrl,
    createdBy: req.user.id,
  });

  res.status(201).json({
    success: true,
    message: 'Project created successfully',
    data: project,
  });
});

const Investment = require('../../models/Investment.model');

/**
 * Dynamically recompute fundedAmount & slotsAvailable from actual active Investment records
 */
const recalculateProjectFunding = async (projectObj) => {
  if (!projectObj) return projectObj;
  const projId = String(projectObj._id || projectObj.id);
  const projName = String(projectObj.name || '').trim().toLowerCase();
  const projSegment = String(projectObj.segment || '').trim().toLowerCase();

  const allActiveInvestments = await Investment.find({
    status: 'active'
  }).lean();

  let realFundedAmount = 0;
  const uniqueClients = new Set();

  allActiveInvestments.forEach(inv => {
    const baseAmt = Number(inv.investmentAmount || inv.amount || 0);
    const clientIdStr = String(inv.clientId || inv._id);
    let matchedInProject = false;

    if (Array.isArray(inv.segmentAllocation) && inv.segmentAllocation.length > 0) {
      const matchedAlloc = inv.segmentAllocation.find(s => {
        const sProjId = s.projectId ? String(s.projectId) : '';
        const sProjName = s.projectName ? String(s.projectName).trim().toLowerCase() : '';
        const sSegName = s.segmentName ? String(s.segmentName).trim().toLowerCase() : '';
        return (sProjId && sProjId === projId) ||
               (sProjName && sProjName === projName) ||
               (!sProjId && !sProjName && sSegName && sSegName === projSegment);
      });

      if (matchedAlloc) {
        const allocPct = Number(matchedAlloc.allocationPercentage || 0);
        realFundedAmount += Math.round(baseAmt * (allocPct / 100));
        matchedInProject = true;
      }
    } else {
      const invProjId = inv.projectId ? String(inv.projectId) : '';
      const invProjName = inv.projectName ? String(inv.projectName).trim().toLowerCase() : '';
      const invSegment = inv.segment ? String(inv.segment).trim().toLowerCase() : '';

      if ((invProjId && invProjId === projId) ||
          (invProjName && invProjName === projName) ||
          (!invProjId && !invProjName && invSegment && invSegment === projSegment)) {
        realFundedAmount += baseAmt;
        matchedInProject = true;
      }
    }

    if (matchedInProject) {
      uniqueClients.add(clientIdStr);
    }
  });

  const totalSlots = Number(projectObj.totalSlots) > 0 ? Number(projectObj.totalSlots) : 20;
  const usedSlots = uniqueClients.size;
  const realSlotsAvailable = Math.max(0, totalSlots - usedSlots);

  // Sync to database if different
  if (projectObj.fundedAmount !== realFundedAmount || projectObj.slotsAvailable !== realSlotsAvailable) {
    await Project.findByIdAndUpdate(projId, {
      $set: {
        fundedAmount: realFundedAmount,
        slotsAvailable: realSlotsAvailable,
        status: (projectObj.targetFunding > 0 && realFundedAmount >= projectObj.targetFunding) || realSlotsAvailable <= 0
          ? 'Slot Full'
          : (projectObj.status === 'Slot Full' ? 'Open' : projectObj.status)
      }
    });
  }

  return {
    ...projectObj,
    fundedAmount: realFundedAmount,
    slotsAvailable: realSlotsAvailable,
    totalSlots,
    bookedSlots: usedSlots,
  };
};

/**
 * Get all Projects (Supports statistics calculations)
 * GET /api/super-admin/projects
 */
const getAllProjects = asyncHandler(async (req, res, next) => {
  const rawProjects = await Project.find()
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  const projects = await Promise.all(rawProjects.map(p => recalculateProjectFunding(p)));

  // Compute card stats
  const totalProjects = projects.length;
  let avgProgress = 0;
  if (totalProjects > 0) {
    const progressSum = projects.reduce((sum, p) => sum + (p.milestoneProgress || 0), 0);
    avgProgress = Math.round(progressSum / totalProjects);
  }

  res.status(200).json({
    success: true,
    data: {
      projects,
      stats: {
        totalProjects,
        avgProgress,
      },
    },
  });
});

/**
 * Get single Project details
 * GET /api/super-admin/projects/:id
 */
const getProjectById = asyncHandler(async (req, res, next) => {
  const rawProject = await Project.findById(req.params.id).populate('createdBy', 'name email').lean();
  if (!rawProject) {
    return next(new AppError('Project not found', 404));
  }

  const project = await recalculateProjectFunding(rawProject);

  res.status(200).json({
    success: true,
    data: project,
  });
});

/**
 * Update an existing Project (Super Admin only)
 * PATCH /api/super-admin/projects/:id
 */
const updateProject = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);
  if (!project) {
    return next(new AppError('Project not found', 404));
  }

  const updates = {};
  const allowedFields = [
    'name',
    'segment',
    'status',
    'portfolioValue',
    'monthlyRoi',
    'riskLevel',
    'milestoneProgress',
    'minInvestment',
    'targetFunding',
    'fundedAmount',
    'totalSlots',
    'slotsAvailable',
    'health',
    'summary',
    'mediaFiles',
    'currentUpdate',
    'allocationFocus',
    'horizon',
    'totalDividendPool',
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  ['milestoneProgress', 'minInvestment', 'targetFunding', 'fundedAmount', 'totalSlots', 'slotsAvailable', 'totalDividendPool'].forEach(numField => {
    if (updates[numField] !== undefined) {
      updates[numField] = Number(updates[numField]);
    }
  });

  // Handle banner image removal if explicitly set to empty or null
  if (req.body.bannerImage === '' || req.body.bannerImage === null || req.body.bannerImage === 'null') {
    updates.bannerImage = '';
    if (project.bannerImage) {
      try {
        console.log('[Project Controller] Deleting banner image from Cloudinary for removal:', project.bannerImage);
        await deleteFromCloudinary(project.bannerImage);
      } catch (err) {
        console.error('[Project Controller Cleanup] Failed to delete banner image:', err.message);
      }
    }
  }

  // Handle banner image replacement
  if (req.file) {
    // Delete old image if exists
    if (project.bannerImage) {
      try {
        console.log('[Project Controller] Deleting old banner image from Cloudinary:', project.bannerImage);
        await deleteFromCloudinary(project.bannerImage);
      } catch (err) {
        console.error('[Project Controller Cleanup] Failed to delete old banner image:', err.message);
      }
    }

    // Upload new image
    try {
      console.log('[Project Controller] Uploading new banner image to Cloudinary...');
      updates.bannerImage = await uploadBufferToCloudinary(req.file.buffer, 'kinetoscope/projects');
    } catch (uploadError) {
      return next(new AppError(`Banner image upload failed: ${uploadError.message}`, 500));
    }
  }

  const isSegmentWide = req.body.scope === 'segment' || req.body.segmentWide === true || req.body.applySegmentWide === true;

  if (isSegmentWide) {
    const targetSegment = updates.segment || project.segment;
    // Don't change specific project names on a segment-wide update
    const segmentUpdates = { ...updates };
    delete segmentUpdates.name;

    await Project.updateMany(
      { segment: targetSegment },
      { $set: segmentUpdates },
      { runValidators: true }
    );

  const updatedProjects = await Project.find({ segment: targetSegment }).populate('createdBy', 'name email');

    return res.status(200).json({
      success: true,
      message: `Segment-wide updates applied to all projects in ${targetSegment}`,
      segmentWide: true,
      data: updatedProjects,
    });
  }

  const updatedProject = await Project.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  ).populate('createdBy', 'name email');

  res.status(200).json({
    success: true,
    message: 'Project updated successfully',
    data: updatedProject,
  });
});

/**
 * Delete a Project (Super Admin only)
 * DELETE /api/super-admin/projects/:id
 */
const deleteProject = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);
  if (!project) {
    return next(new AppError('Project not found', 404));
  }

  // Delete banner image from Cloudinary
  if (project.bannerImage) {
    try {
      console.log('[Project Controller] Deleting banner image from Cloudinary:', project.bannerImage);
      await deleteFromCloudinary(project.bannerImage);
    } catch (err) {
      console.error('[Project Controller Cleanup] Failed to delete banner image on deletion:', err.message);
    }
  }

  // Cascade delete linked investments and project updates
  try {
    const Investment = require('../../models/Investment.model');
    const ProjectUpdate = require('../../models/ProjectUpdate.model');
    await Promise.all([
      Investment.deleteMany({ projectId: req.params.id }),
      ProjectUpdate.deleteMany({ projectId: req.params.id })
    ]);
  } catch (cleanErr) {
    console.error('Error cleaning up project investments/updates on deletion:', cleanErr);
  }

  await Project.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Project and all associated investment records deleted successfully',
  });
});

/**
 * Get all projects for Client Portal (Read-only view)
 * GET /api/client/projects
 */
const getClientProjects = asyncHandler(async (req, res, next) => {
  const rawProjects = await Project.find()
    .sort({ createdAt: -1 })
    .select('-createdBy -createdAt -updatedAt -__v')
    .lean();

  const projects = await Promise.all(rawProjects.map(p => recalculateProjectFunding(p)));

  res.status(200).json({
    success: true,
    count: projects.length,
    data: {
      projects,
    },
  });
});

/**
 * Upload a media file/image to a Project (Super Admin only)
 * POST /api/super-admin/projects/:id/media
 */
const uploadProjectMedia = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);
  if (!project) {
    return next(new AppError('Project not found', 404));
  }

  const file = req.file || (req.files && req.files[0]);
  if (!file) {
    return next(new AppError('Please upload a file.', 400));
  }

  let mediaUrl = '';
  try {
    console.log('[Project Controller] Uploading project media file to Cloudinary...');
    mediaUrl = await uploadBufferToCloudinary(file.buffer, 'kinetoscope/projects/media', {
      use_filename: true,
      unique_filename: false,
      filename: file.originalname,
    });
  } catch (uploadError) {
    return next(new AppError(`Media upload failed: ${uploadError.message}`, 500));
  }

  // Save the media file directly bypassing any potential document save validation issues
  const updatedProject = await Project.findByIdAndUpdate(
    project._id,
    { $push: { mediaFiles: mediaUrl } },
    { new: true }
  );

  // Auto-log a status update history entry for this file upload
  const timelineUpdate = await ProjectUpdate.create({
    projectId: project._id,
    projectName: project.name,
    segment: project.segment,
    status: project.status,
    progress: project.milestoneProgress,
    notes: `Uploaded file: ${file.originalname || 'attachment'}`,
    attachments: [mediaUrl],
    scope: 'project',
    createdBy: req.user.id,
  });

  res.status(200).json({
    success: true,
    message: 'Media file uploaded successfully',
    data: {
      url: mediaUrl,
      project: updatedProject,
      update: timelineUpdate,
    },
  });
});

/**
 * Delete a media file/image from a Project (Super Admin only)
 * DELETE /api/super-admin/projects/:id/media
 */
const deleteProjectMedia = asyncHandler(async (req, res, next) => {
  const project = await Project.findById(req.params.id);
  if (!project) {
    return next(new AppError('Project not found', 404));
  }

  const url = req.body.url || req.query.url || req.body.mediaUrl || req.query.mediaUrl;
  if (!url) {
    return next(new AppError('Please provide the URL of the media file to delete.', 400));
  }

  if (!project.mediaFiles.includes(url)) {
    return next(new AppError('Media file URL not found in this project.', 404));
  }

  // Delete from Cloudinary
  try {
    console.log('[Project Controller] Deleting media file from Cloudinary:', url);
    await deleteFromCloudinary(url);
  } catch (err) {
    console.error('[Project Controller Cleanup] Failed to delete project media file:', err.message);
  }

  // Use findByIdAndUpdate with $pull to bypass schema validation checks on save
  const updatedProject = await Project.findByIdAndUpdate(
    project._id,
    { $pull: { mediaFiles: url } },
    { new: true }
  );

  res.status(200).json({
    success: true,
    message: 'Media file deleted successfully',
    data: updatedProject,
  });
});

/**
 * Client Apply for Project Investment
 * POST /api/client/projects/:id/apply
 */
const applyForProjectInvestment = asyncHandler(async (req, res, next) => {
  const { amount, paymentMethod, transactionRef, proofAttachment } = req.body;
  const project = await Project.findById(req.params.id);
  if (!project) {
    return next(new AppError('Project not found', 404));
  }

  const numAmount = Number(amount) || project.minInvestment || 5;

  if (project.slotsAvailable <= 0 || project.status === 'Slot Full') {
    return next(new AppError('All investment slots for this project are currently full', 400));
  }

  // Deduct 1 available slot for the project selection request
  project.slotsAvailable = Math.max(0, project.slotsAvailable - 1);
  if (project.slotsAvailable === 0) {
    project.status = 'Slot Full';
  }
  await project.save();

  const user = req.user;
  const Investment = require('../../models/Investment.model');
  const Transaction = require('../../models/Transaction.model');
  const ServiceRequest = require('../../models/ServiceRequest.model');

  // Handle payment proof file upload if provided
  let proofAttachmentUrl = req.body.proofAttachment || proofAttachment || '';
  if (req.file) {
    try {
      const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');
      const cloudUrl = await uploadBufferToCloudinary(req.file.buffer, 'payment-proofs');
      if (cloudUrl) proofAttachmentUrl = cloudUrl;
      console.log('[Apply Project] Successfully uploaded payment proof to Cloudinary:', proofAttachmentUrl);
    } catch (uploadErr) {
      console.error('[Apply Project] Failed to upload payment proof file to Cloudinary:', uploadErr.message);
    }
  }

  // Fetch full user with assignedAgent
  const clientUser = await User.findById(user.id).populate('assignedAgent');
  const assignedAgent = clientUser?.assignedAgent;
  const agentName = assignedAgent ? assignedAgent.name : 'Direct / No Agent';
  const agentCode = assignedAgent ? (assignedAgent.clientCode || assignedAgent.agentCode || 'N/A') : 'N/A';
  const clientCode = user.clientCode || (clientUser && clientUser.clientCode) || 'KFPL-CL-1001';

  // 1) Create Deposit Transaction in Database (Status: Pending Super Admin Approval)
  const newTransaction = await Transaction.create({
    clientId: user.id,
    clientName: user.name,
    clientCode: clientCode,
    type: 'deposit',
    amount: numAmount,
    paymentMethod: paymentMethod || 'Bank Transfer (IMPS/NEFT)',
    referenceNumber: transactionRef || `TXN-${Date.now()}`,
    status: 'pending',
    projectId: project._id,
    projectName: project.name,
    proofAttachment: proofAttachmentUrl,
    remarks: `Deposit request for project selection: "${project.name}" (Ref: ${transactionRef || 'N/A'})`
  });

  // 2) Create Investment Record in Database (Status: Pending Approval)
  const newInvestment = await Investment.create({
    clientId: user.id,
    clientName: user.name,
    clientCode: clientCode,
    projectId: project._id,
    projectName: project.name,
    segment: project.segment || 'General',
    investmentAmount: numAmount,
    roiPercentage: parseFloat(project.monthlyRoi) || 1.5,
    riskLevel: project.riskLevel || 'Medium',
    riskPercentage: 20,
    durationMonths: 24,
    status: 'pending', // PENDING SUPER ADMIN DEPOSIT APPROVAL
    investmentDate: new Date(),
    sourceTransactionId: newTransaction._id,
    createdBy: user.id,
    remarks: `Client ${user.name} submitted deposit payment (${transactionRef || 'N/A'}) for project "${project.name}".`
  });

  // Link Investment to Transaction
  newTransaction.linkedInvestmentId = newInvestment._id;
  await newTransaction.save();

  // 3) Create Detailed Service Request Alert for Super Admin
  const amountStr = `₹${numAmount.toLocaleString('en-IN')}`;
  const serviceReqDescription =
    `CLIENT DEPOSIT & PROJECT INVESTMENT APPLICATION:\n` +
    `• Client: ${user.name} (${user.email}, Code: ${clientCode})\n` +
    `• Assigned Agent: ${agentName} (${agentCode})\n` +
    `• Selected Project: ${project.name}\n` +
    `• Segment: ${project.segment}\n` +
    `• Capital Deposit Amount: ${amountStr}\n` +
    `• Payment Gateway / Method: ${paymentMethod || 'Bank Transfer'}\n` +
    `• Transaction Reference / UTR No: ${transactionRef || 'N/A'}\n` +
    `• Expected ROI Rate: ${project.monthlyRoi || '1.5%'}\n` +
    `• Request Status: PENDING SUPER ADMIN APPROVAL (See Deposit & Withdrawal Requests page).`;

  const serviceReq = await ServiceRequest.create({
    createdBy: user.id,
    category: 'Project Investment Request',
    subject: `Deposit & Investment Request - ${project.name} (${amountStr})`,
    description: serviceReqDescription,
    status: 'OPEN',
  });

  // Alert Super Admins via Email
  try {
    const { sendNewRegistrationAlertToAdmin } = require('../../services/email.service');
    sendNewRegistrationAlertToAdmin({
      name: user.name,
      email: user.email,
      phone: user.phone || 'N/A',
      role: 'Client Deposit & Project Selection',
      clientCode: clientCode,
    });
  } catch (emailErr) {
    console.error('Failed to dispatch admin email alert for deposit request:', emailErr.message);
  }

  res.status(201).json({
    success: true,
    message: `Payment deposit & project application submitted successfully! Pending Super Admin approval.`,
    data: {
      project,
      transaction: newTransaction,
      investment: newInvestment,
      serviceRequest: serviceReq,
    },
  });
});

module.exports = {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
  getClientProjects,
  uploadProjectMedia,
  deleteProjectMedia,
  applyForProjectInvestment,
};
