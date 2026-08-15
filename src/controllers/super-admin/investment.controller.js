const Investment = require('../../models/Investment.model');
const User = require('../../models/User.model');
const ClientProfile = require('../../models/ClientProfile.model');
const Transaction = require('../../models/Transaction.model');
const Project = require('../../models/Project.model');
const { sendInvestmentAssignmentNotification } = require('../../services/email.service');
const { ROLES } = require('../../constants/roles');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Seed default mock investments to align with designs
 */
const seedMockInvestments = async (creatorId) => {
  return; // Disabled seeder
  const count = await Investment.countDocuments();
  if (count === 0) {
    const getOrCreateMockClient = async (name, email, clientCode) => {
      let user = await User.findOne({ clientCode });
      if (!user) {
        user = await User.create({
          name,
          email,
          password: 'password123',
          role: ROLES.CLIENT,
          clientCode,
          isActive: true,
        });
      }
      return user;
    };

    const c1 = await getOrCreateMockClient('Rajesh Kumar', 'rajesh.kumar@kfpl.com', 'KFPL-1001');
    const c2 = await getOrCreateMockClient('Priya Sharma', 'priya.sharma@kfpl.com', 'KFPL-1002');
    const c3 = await getOrCreateMockClient('Anita Desai', 'anita.desai@kfpl.com', 'KFPL-1003');

    const mockInvestments = [
      {
        clientId: c1._id,
        clientName: c1.name,
        clientCode: c1.clientCode,
        segment: 'Film Making',
        investmentAmount: 25000000, // 2.50 Cr
        roiPercentage: 12,
        riskPercentage: 30,
        riskLevel: 'Medium',
        investmentDate: new Date('2024-01-10T00:00:00Z'),
        durationMonths: 18,
        contractEndDate: new Date('2025-07-10T00:00:00Z'),
        status: 'active',
        createdBy: creatorId,
      },
      {
        clientId: c2._id,
        clientName: c2.name,
        clientCode: c2.clientCode,
        segment: 'Film Making',
        investmentAmount: 18000000, // 1.80 Cr
        roiPercentage: 12,
        riskPercentage: 10,
        riskLevel: 'Low',
        investmentDate: new Date('2024-01-15T00:00:00Z'),
        durationMonths: 18,
        contractEndDate: new Date('2025-07-15T00:00:00Z'),
        status: 'active',
        createdBy: creatorId,
      },
      {
        clientId: c3._id,
        clientName: c3.name,
        clientCode: c3.clientCode,
        segment: 'Film Making',
        investmentAmount: 12000000, // 1.20 Cr
        roiPercentage: 12,
        riskPercentage: 75,
        riskLevel: 'High',
        investmentDate: new Date('2024-01-20T00:00:00Z'),
        durationMonths: 18,
        contractEndDate: new Date('2025-07-20T00:00:00Z'),
        status: 'active',
        createdBy: creatorId,
      },
    ];

    await Investment.create(mockInvestments);
    console.log('[Investment Seeder] Seeded 3 standard investments.');
  }
};

/**
 * Assign a new investment record to a client.
 * Investment records are financial records and are immutable once created.
 * POST /api/super-admin/investments
 */
const createInvestment = asyncHandler(async (req, res, next) => {
  const { clientId } = req.body;

  if (!clientId) {
    return next(new AppError('Client ID is required.', 400));
  }

  // Fetch client from database by ID or by clientCode (e.g. KFPL-1001)
  let clientUser;
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(clientId);
  if (isMongoId) {
    clientUser = await User.findOne({ _id: clientId, role: ROLES.CLIENT });
    if (!clientUser) {
      // Fallback: Check if clientId is a ClientProfile _id
      const profile = await ClientProfile.findById(clientId);
      if (profile && profile.userId) {
        clientUser = await User.findOne({ _id: profile.userId, role: ROLES.CLIENT });
      }
    }
  } else {
    clientUser = await User.findOne({ clientCode: clientId.toUpperCase(), role: ROLES.CLIENT });
  }

  if (!clientUser || clientUser.role !== ROLES.CLIENT) {
    return next(new AppError('Client account not found.', 404));
  }

  // Check if client already has an Unallocated or unlinked investment record
  const existingUnallocated = await Investment.findOne({
    clientId: clientUser._id,
    $or: [
      { segment: 'Unallocated' },
      { segment: { $regex: /^unallocated/i } },
      { segment: 'General' },
      { segment: 'General Capital Pool' },
      { segment: 'Capital Deposit' },
      { projectId: null },
      { projectId: { $exists: false } }
    ]
  }).sort({ createdAt: -1 });

  let investment;
  const inputAmount = Number(req.body.investmentAmount || req.body.amount) || 0;
  const inputRoi = req.body.roiPercentage !== undefined ? req.body.roiPercentage : (req.body.roi !== undefined ? req.body.roi : 0);

  if (existingUnallocated) {
    // UPDATE existing unallocated investment record to link selected project & segment without double counting money
    if (req.body.projectId) existingUnallocated.projectId = req.body.projectId;
    if (req.body.segmentAllocation) existingUnallocated.segmentAllocation = req.body.segmentAllocation;
    if (req.body.segment) {
      existingUnallocated.segment = req.body.segment;
    } else if (req.body.projectId) {
      const proj = await Project.findById(req.body.projectId);
      if (proj) existingUnallocated.segment = proj.segment || proj.category || 'Project Allocated';
    }

    if (inputAmount > 0) existingUnallocated.investmentAmount = inputAmount;
    existingUnallocated.roiPercentage = inputRoi;
    if (req.body.riskPercentage !== undefined) existingUnallocated.riskPercentage = req.body.riskPercentage;
    if (req.body.riskLevel) existingUnallocated.riskLevel = req.body.riskLevel;
    if (req.body.contractPeriod || req.body.durationMonths) existingUnallocated.durationMonths = Number(req.body.contractPeriod || req.body.durationMonths) || 18;
    if (req.body.contractEndDate) existingUnallocated.contractEndDate = new Date(req.body.contractEndDate);
    if (req.body.dateOfJoining || req.body.investmentDate) existingUnallocated.investmentDate = new Date(req.body.dateOfJoining || req.body.investmentDate);
    existingUnallocated.status = 'active';

    await existingUnallocated.save();
    investment = existingUnallocated;
    console.log(`[Assign Investment] Updated existing unallocated investment ${investment._id} for client ${clientUser.name}`);
  } else {
    // Create new active investment if no unallocated record exists
    const investmentData = {
      ...req.body,
      investmentAmount: inputAmount,
      roiPercentage: inputRoi,
      clientId: clientUser._id,
      clientName: clientUser.name,
      clientCode: clientUser.clientCode,
      status: 'active',
      createdBy: req.user.id,
    };
    investment = await Investment.create(investmentData);
  }

  // Update Project funded amount if linked
  if (investment.projectId) {
    try {
      const activeInvestments = await Investment.find({ projectId: investment.projectId, status: 'active' });
      const totalFunded = activeInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
      const project = await Project.findById(investment.projectId);
      if (project) {
        project.fundedAmount = totalFunded;
        await project.save();
      }
    } catch (pErr) {
      console.error('[Assign Investment] Project sync error:', pErr);
    }
  }

  // Sync ClientProfile totalInvestment
  try {
    const activeClientInvestments = await Investment.find({ clientId: clientUser._id, status: 'active' });
    const newTotal = activeClientInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
    await ClientProfile.findOneAndUpdate(
      { userId: clientUser._id },
      { $set: { totalInvestment: newTotal } }
    );
  } catch (cpErr) {
    console.error('[Assign Investment] Client profile sync error:', cpErr);
  }

  // Send automated email notification to client and their agent
  try {
    if (clientUser.email) {
      let agentEmail = null;
      if (clientUser.assignedAgent) {
        const agent = await User.findById(clientUser.assignedAgent);
        if (agent) agentEmail = agent.email;
      }

      sendInvestmentAssignmentNotification(
        clientUser.email,
        clientUser.name,
        agentEmail,
        investment
      ).catch((err) =>
        console.error('[Investment Notification Error]:', err.message)
      );
    }
  } catch (error) {
    console.error('[Investment Notification Processing Error]:', error.message);
  }

  res.status(201).json({
    success: true,
    message: 'Investment assigned successfully',
    data: {
      investment,
    },
  });
});

/**
 * Get all investment records.
 * Supports pagination, search by clientName / clientCode, filter by segment and status.
 * GET /api/super-admin/investments
 * Query Params: page, limit, clientName, clientCode, segment, status
 */
const getAllInvestments = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10000;
  const skip = (page - 1) * limit;

  const queryObj = {};

  if (req.query.clientName) {
    queryObj.clientName = { $regex: req.query.clientName, $options: 'i' };
  }
  if (req.query.clientCode) {
    queryObj.clientCode = { $regex: req.query.clientCode, $options: 'i' };
  }
  if (req.query.segment) {
    queryObj.segment = req.query.segment;
  }
  // Auto-migrate legacy General segment records to Unallocated
  await Investment.updateMany(
    { $or: [{ segment: 'General' }, { segment: 'General Capital Pool' }] },
    { $set: { segment: 'Unallocated' } }
  ).catch(e => console.error('[Segment Migration Error]:', e.message));

  // Auto-heal: Ensure all APPROVED deposit transactions have a corresponding Investment record
  try {
    const approvedDeposits = await Transaction.find({ type: 'deposit', status: 'APPROVED' }).lean();
    for (const tx of approvedDeposits) {
      if (!tx.clientId) continue;
      const existing = await Investment.findOne({
        $or: [
          { sourceTransactionId: tx._id },
          ...(tx.linkedInvestmentId ? [{ _id: tx.linkedInvestmentId }] : [])
        ]
      });
      if (!existing) {
        const clientUser = await User.findById(tx.clientId).lean();
        const clientProfile = clientUser ? await ClientProfile.findOne({ userId: tx.clientId }).lean() : null;
        let projectObj = null;
        if (tx.projectId) {
          projectObj = await Project.findById(tx.projectId).lean();
        }
        const roiPct = projectObj?.monthlyRoi ? parseFloat(projectObj.monthlyRoi) : (clientProfile ? (clientProfile.monthlyRoi || 1.5) : 1.5);
        const codeVal = tx.clientCode || (clientUser && clientUser.clientCode ? clientUser.clientCode : '') || (`KFPL-${String(tx.clientId).slice(-6).toUpperCase()}`);

        const createdInv = await Investment.create({
          clientId: tx.clientId,
          clientName: tx.clientName || (clientUser ? clientUser.name : 'Unknown'),
          clientCode: codeVal,
          projectId: tx.projectId || undefined,
          projectName: tx.projectName || projectObj?.name || '',
          segment: projectObj?.segment || tx.segment || tx.category || 'General',
          investmentAmount: Number(tx.amount || 0),
          roiPercentage: roiPct,
          riskPercentage: 0,
          riskLevel: projectObj?.riskLevel || 'Medium',
          investmentDate: tx.actionAt || tx.createdAt || new Date(),
          status: 'active',
          createdBy: req.user?.id || req.user?._id || tx.clientId,
          remarks: `Auto-healed from approved deposit transaction #${tx._id}`,
          sourceTransactionId: tx._id
        });
        await Transaction.findByIdAndUpdate(tx._id, { $set: { linkedInvestmentId: createdInv._id } });
        console.log(`[Investment Auto-Heal] Created missing Investment ${createdInv._id} for approved deposit ${tx._id}`);
      }
    }
  } catch (healErr) {
    console.error('[Investment Auto-Heal Error]:', healErr.message);
  }

  const total = await Investment.countDocuments(queryObj);
  const investments = await Investment.find(queryObj)
    .populate({
      path: 'clientId',
      select: 'name email clientCode assignedAgent',
      populate: { path: 'assignedAgent', select: 'name email clientCode agentCode' }
    })
    .populate('projectId', 'name segment portfolioValue targetFunding minInvestment monthlyRoi riskLevel status bannerImage mediaFiles summary currentUpdate allocationFocus horizon totalSlots slotsAvailable fundedAmount health milestoneProgress')
    .populate('createdBy', 'name email role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    message: 'Investments retrieved successfully',
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: {
      investments,
    },
  });
});

/**
 * Get a single investment record by ID.
 * GET /api/super-admin/investments/:id
 */
const getInvestmentById = asyncHandler(async (req, res, next) => {
  const investment = await Investment.findById(req.params.id)
    .populate('clientId', 'name email')
    .populate('createdBy', 'name email role');

  if (!investment) {
    return next(new AppError('Investment record not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Investment retrieved successfully',
    data: {
      investment,
    },
  });
});

/**
 * Extend an existing investment contract end date.
 * PATCH /api/super-admin/investments/:id/extend
 */
const extendInvestmentContract = asyncHandler(async (req, res, next) => {
  const { newEndDate } = req.body;

  if (!newEndDate) {
    return next(new AppError('New end date is required.', 400));
  }

  const investment = await Investment.findById(req.params.id);
  if (!investment) {
    return next(new AppError('Investment record not found.', 404));
  }

  const start = new Date(investment.investmentDate);
  const end = new Date(newEndDate);

  if (end <= start) {
    return next(new AppError('New end date must be after the investment start date.', 400));
  }

  // Calculate new duration in months dynamically
  const yearsDiff = end.getFullYear() - start.getFullYear();
  const monthsDiff = end.getMonth() - start.getMonth();
  const totalMonths = yearsDiff * 12 + monthsDiff;

  investment.contractEndDate = end;
  investment.durationMonths = totalMonths > 0 ? totalMonths : 1;
  await investment.save();

  res.status(200).json({
    success: true,
    message: 'Investment contract extended successfully.',
    data: {
      investment,
    },
  });
});

/**
 * Delete a single investment record (Super Admin only)
 * DELETE /api/super-admin/investments/:id
 */
const deleteInvestment = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const investment = await Investment.findByIdAndDelete(id);

  if (!investment) {
    return next(new AppError('Investment record not found.', 404));
  }

  // Recalculate Project funding & available slots from actual remaining active investments
  if (investment.projectId) {
    try {
      const remainingInvestments = await Investment.find({ projectId: investment.projectId, status: 'active' }).lean();
      const realFunded = remainingInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
      const project = await Project.findById(investment.projectId);
      if (project) {
        const totalSlots = project.totalSlots || 20;
        const realSlotsAvail = Math.max(0, totalSlots - remainingInvestments.length);
        project.fundedAmount = realFunded;
        project.slotsAvailable = realSlotsAvail;
        if (realSlotsAvail > 0 && project.status === 'Slot Full') {
          project.status = 'Open';
        }
        await project.save();
        console.log(`[Project Funding Recalculated] Project ${project.name} fundedAmount -> ₹${realFunded}, slotsAvailable -> ${realSlotsAvail}`);
      }
    } catch (projErr) {
      console.error('Failed to restore project slots on investment deletion:', projErr);
    }
  }

  // Delete or clean up linked transaction if created from a deposit
  if (investment.sourceTransactionId) {
    try {
      const Transaction = require('../../models/Transaction.model');
      await Transaction.findByIdAndDelete(investment.sourceTransactionId);
    } catch (txErr) {
      console.error('Failed to delete linked transaction on investment deletion:', txErr);
    }
  }

  // Recalculate client total investment in profile & clean up pending AgentCommissions if total is 0
  if (investment.clientId) {
    try {
      const remainingInvestments = await Investment.find({ clientId: investment.clientId, status: 'active' });
      const newTotal = remainingInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
      const ClientProfile = require('../../models/ClientProfile.model');
      await ClientProfile.findOneAndUpdate(
        { userId: investment.clientId },
        { $set: { totalInvestment: newTotal } }
      );

      if (newTotal === 0) {
        const AgentCommission = require('../../models/AgentCommission.model');
        await AgentCommission.deleteMany({ clientId: investment.clientId, status: 'PENDING' });
        const RoiPayout = require('../../models/RoiPayout.model');
        await RoiPayout.deleteMany({ clientId: investment.clientId });
      }
    } catch (profileErr) {
      console.error('Failed to recalculate client total investment:', profileErr);
    }
  }

  res.status(200).json({
    success: true,
    message: 'Investment record deleted successfully.',
    data: investment
  });
});

/**
 * Clear all investment records (Super Admin only)
 * DELETE /api/super-admin/investments/clear
 */
const clearAllInvestments = asyncHandler(async (req, res, next) => {
  const result = await Investment.deleteMany({});

  try {
    const AgentCommission = require('../../models/AgentCommission.model');
    await AgentCommission.deleteMany({ status: 'PENDING' });
  } catch (commErr) {
    console.error('Failed to clear pending agent commissions on clear all investments:', commErr);
  }

  res.status(200).json({
    success: true,
    message: `All investment records (${result.deletedCount}) have been cleared successfully.`,
    count: result.deletedCount
  });
});

/**
 * Approve an Investment Selection Request (Super Admin only)
 * PATCH /api/super-admin/investments/:id/approve
 */
const approveInvestment = asyncHandler(async (req, res, next) => {
  const { investmentAmount } = req.body;
  const investment = await Investment.findById(req.params.id);
  if (!investment) {
    return next(new AppError('Investment record not found.', 404));
  }

  const clientUser = await User.findById(investment.clientId);
  if (!clientUser) {
    return next(new AppError('Client user not found.', 404));
  }

  const approvedAmount = Number(investmentAmount) !== undefined && !isNaN(Number(investmentAmount)) && Number(investmentAmount) >= 0
    ? Number(investmentAmount)
    : (investment.investmentAmount || 0);

  investment.status = 'active';
  if (approvedAmount > 0) {
    investment.investmentAmount = approvedAmount;
  }
  investment.approvedAt = new Date();
  await investment.save();

  // Also approve linked Transaction if present
  if (investment.sourceTransactionId) {
    try {
      const Transaction = require('../../models/Transaction.model');
      await Transaction.findByIdAndUpdate(investment.sourceTransactionId, {
        $set: {
          status: 'approved',
          amount: approvedAmount,
          actionBy: req.user.id || req.user._id,
          actionAt: new Date()
        }
      });
    } catch (txErr) {
      console.error('[Approve Investment] Failed to update linked transaction:', txErr.message);
    }
  }

  // 1) Update Project funded amount if linked
  if (investment.projectId) {
    const project = await Project.findById(investment.projectId);
    if (project) {
      const activeInvestments = await Investment.find({ projectId: project._id, status: 'active' });
      const totalFunded = activeInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
      project.fundedAmount = totalFunded;
      await project.save();
    }
  }

  // 2) Update ClientProfile totalInvestment
  const clientInvestments = await Investment.find({ clientId: clientUser._id, status: 'active' });
  const newClientTotal = clientInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
  await ClientProfile.findOneAndUpdate(
    { userId: clientUser._id },
    { $set: { totalInvestment: newClientTotal } }
  );

  // 3) Resolve any matching open ServiceRequest for this project selection
  try {
    const ServiceRequest = require('../../models/ServiceRequest.model');
    await ServiceRequest.updateMany(
      { createdBy: clientUser._id, category: 'Project Investment Request', status: { $in: ['OPEN', 'IN PROGRESS'] } },
      { $set: { status: 'RESOLVED', adminRemarks: `Approved investment selection for ${approvedAmount > 0 ? `₹${approvedAmount.toLocaleString('en-IN')}` : 'Project deal'}` } }
    );
  } catch (srErr) {
    console.error('[Approve Investment] Failed to resolve open service requests:', srErr.message);
  }

  // 4) Send Email Notification to registered Client email
  if (clientUser.email) {
    try {
      const { sendEmail, buildLightEmailTemplate } = require('../../services/email.service');
      const contentHtml = `
        <p style="font-size: 15px; color: #1E293B;">Hello <strong>${clientUser.name}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">Congratulations! Your project investment selection request for <strong>${investment.projectName || 'your selected project'}</strong> has been officially approved by Super Admin.</p>
        <div style="margin: 20px 0; padding: 18px; background-color: #F0FDF4; border-left: 4px solid #10B981; border-radius: 8px; border: 1px solid #DCFCE7;">
          <p style="margin: 0; color: #166534; font-weight: 700; font-size: 15px;">Status: APPROVED / ACTIVE</p>
          ${approvedAmount > 0 ? `<p style="margin: 8px 0 0 0; color: #15803D; font-size: 14px;"><strong>Approved Investment Amount:</strong> ₹${approvedAmount.toLocaleString('en-IN')}</p>` : ''}
          <p style="margin: 6px 0 0 0; color: #15803D; font-size: 13.5px;"><strong>Expected Monthly ROI:</strong> ${investment.roiPercentage || 1.5}%</p>
        </div>
        <p style="font-size: 14px; color: #475569;">You can view your active portfolio and performance metrics anytime in your Client Portal Dashboard.</p>
      `;
      const html = buildLightEmailTemplate({
        title: '🎉 Investment Request Approved',
        subtitle: `Project: ${investment.projectName || 'Kinetoscope Project'}`,
        contentHtml,
        bannerAccent: '#10B981'
      });

      await sendEmail({
        to: clientUser.email,
        subject: `🎉 Investment Request Approved - ${investment.projectName || 'Kinetoscope'}`,
        text: `Hello ${clientUser.name},\n\nYour project investment selection request for ${investment.projectName || 'your selected project'} has been officially approved by Super Admin.\n\nApproved Amount: ₹${approvedAmount.toLocaleString('en-IN')}\n\n— Kinetoscope Support Team`,
        html,
      });
      console.log(`[Approve Investment] Email sent successfully to ${clientUser.email}`);
    } catch (emailErr) {
      console.error(`[Approve Investment] Failed to send email to ${clientUser.email}:`, emailErr.message);
    }
  }

  res.status(200).json({
    success: true,
    message: `Investment for ${investment.projectName || 'project'} approved successfully! Client has been notified via email & dashboard.`,
    data: investment,
  });
});

module.exports = {
  createInvestment,
  getAllInvestments,
  getInvestmentById,
  approveInvestment,
  extendInvestmentContract,
  deleteInvestment,
  clearAllInvestments,
};
