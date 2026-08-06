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
        durationMonths: 24,
        contractEndDate: new Date('2026-01-10T00:00:00Z'),
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
        durationMonths: 24,
        contractEndDate: new Date('2026-01-15T00:00:00Z'),
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
        durationMonths: 24,
        contractEndDate: new Date('2026-01-20T00:00:00Z'),
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

  const investmentData = {
    ...req.body,
    investmentAmount: req.body.investmentAmount || req.body.amount,
    roiPercentage: req.body.roiPercentage !== undefined ? req.body.roiPercentage : req.body.roi,
    clientId: clientUser._id,
    clientName: clientUser.name,
    clientCode: clientUser.clientCode,
    createdBy: req.user.id,
  };

  const investment = await Investment.create(investmentData);

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
  const limit = parseInt(req.query.limit, 10) || 500;
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
  if (req.query.status) {
    queryObj.status = req.query.status;
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

  // Recalculate client total investment in profile
  if (investment.clientId) {
    try {
      const remainingInvestments = await Investment.find({ clientId: investment.clientId });
      const newTotal = remainingInvestments.reduce((sum, inv) => sum + (inv.investmentAmount || 0), 0);
      const ClientProfile = require('../../models/ClientProfile.model');
      await ClientProfile.findOneAndUpdate(
        { userId: investment.clientId },
        { $set: { totalInvestment: newTotal } }
      );
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

  res.status(200).json({
    success: true,
    message: `All investment records (${result.deletedCount}) have been cleared successfully.`,
    count: result.deletedCount
  });
});

module.exports = {
  createInvestment,
  getAllInvestments,
  getInvestmentById,
  extendInvestmentContract,
  deleteInvestment,
  clearAllInvestments,
};
