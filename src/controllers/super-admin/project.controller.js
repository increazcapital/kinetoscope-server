const Project = require('../../models/Project.model');
const ProjectUpdate = require('../../models/ProjectUpdate.model');
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

  const project = await Project.create({
    name,
    segment,
    status: status || 'Planning',
    portfolioValue: portfolioValue || `₹${((Number(targetFunding) || 25000000) / 10000000).toFixed(1)} Cr`,
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

/**
 * Get all Projects (Supports statistics calculations)
 * GET /api/super-admin/projects
 */
const getAllProjects = asyncHandler(async (req, res, next) => {
  const projects = await Project.find()
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

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
  const project = await Project.findById(req.params.id).populate('createdBy', 'name email');
  if (!project) {
    return next(new AppError('Project not found', 404));
  }

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

  await Project.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Project deleted successfully',
  });
});

/**
 * Get all projects for Client Portal (Read-only view)
 * GET /api/client/projects
 */
const getClientProjects = asyncHandler(async (req, res, next) => {
  const projects = await Project.find()
    .sort({ createdAt: -1 })
    .select('-createdBy -createdAt -updatedAt -__v')
    .lean();

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
  const { amount } = req.body;
  const numAmount = Number(amount);

  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    return next(new AppError('Please enter a valid investment amount', 400));
  }

  const project = await Project.findById(req.params.id);
  if (!project) {
    return next(new AppError('Project not found', 404));
  }

  const minInvestment = project.minInvestment || 200000;
  if (numAmount < minInvestment) {
    return next(new AppError(`Investment amount must be at least ₹${minInvestment.toLocaleString('en-IN')}`, 400));
  }

  if (project.slotsAvailable <= 0 || project.status === 'Slot Full') {
    return next(new AppError('All investment slots for this project are currently full', 400));
  }

  // Update funding & slots
  project.fundedAmount = (project.fundedAmount || 0) + numAmount;
  if (project.slotsAvailable > 0) {
    project.slotsAvailable = project.slotsAvailable - 1;
  }
  if (project.targetFunding > 0 && project.fundedAmount >= project.targetFunding) {
    project.status = 'Slot Full';
  } else if (project.slotsAvailable <= 0) {
    project.status = 'Slot Full';
  }
  await project.save();

  // Create Service Request Alert for Super Admin
  const ServiceRequest = require('../../models/ServiceRequest.model');
  const user = req.user;

  const serviceReq = await ServiceRequest.create({
    createdBy: user.id,
    category: 'Investment Query',
    subject: `New Investment Application - ${project.name}`,
    description: `Client ${user.name} (${user.email}, Code: ${user.clientCode || 'N/A'}) applied for project "${project.name}" (${project.segment}) with investment amount ₹${numAmount.toLocaleString('en-IN')}. Target Funding: ₹${(project.targetFunding || 25000000).toLocaleString('en-IN')}, Current Total Funded: ₹${project.fundedAmount.toLocaleString('en-IN')}.`,
    status: 'OPEN',
  });

  // Alert Super Admins via Email
  try {
    const { sendNewRegistrationAlertToAdmin } = require('../../services/email.service');
    sendNewRegistrationAlertToAdmin({
      name: user.name,
      email: user.email,
      clientCode: user.clientCode || 'N/A'
    }, `Investment Application for ${project.name} (Amount: ₹${numAmount.toLocaleString('en-IN')})`).catch(e => console.error('[Email Alert Error]:', e.message));
  } catch (emailErr) {
    console.error('[Email Alert Exception]:', emailErr.message);
  }

  res.status(200).json({
    success: true,
    message: `Application for ${project.name} submitted successfully! Super Admin has been notified.`,
    data: {
      project,
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
