const DividendPool = require('../../models/DividendPool.model');
const DividendAllotment = require('../../models/DividendAllotment.model');
const User = require('../../models/User.model');
const Project = require('../../models/Project.model');
const ClientProfile = require('../../models/ClientProfile.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Seed default dividend pool and allotments if database is empty
 */
const seedMockDividends = async (creatorId) => {
  return; // Disabled seeder
  const mongoose = require('mongoose');
  const SystemConfig = mongoose.models.SystemConfig || mongoose.model('SystemConfig', new mongoose.Schema({
    key: { type: String, unique: true },
    value: Boolean
  }));

  const config = await SystemConfig.findOne({ key: 'dividends_seeded' });
  if (config && config.value) {
    return;
  }

  const poolCount = await DividendPool.countDocuments();
  const allotmentCount = await DividendAllotment.countDocuments();

  if (poolCount > 0 || allotmentCount > 0) {
    await SystemConfig.findOneAndUpdate({ key: 'dividends_seeded' }, { value: true }, { upsert: true });
    return;
  }

  // 1. Seed standard pool of ₹15.00 L
  const defaultPool = await DividendPool.create({
    poolAmount: 1500000, // ₹15.00 L
    name: 'Inaugural Dividend Pool',
    remarks: 'Initial dividend pool for fiscal year 2025-2026.',
    createdBy: creatorId,
  });

  console.log('[Dividend Seeder] Successfully seeded dividend pool of ₹15.00 L.');

  // 2. Fetch clients and projects to assign allotments
  const rajesh = await User.findOne({ clientCode: 'KFPL-1001' });
  const priya = await User.findOne({ clientCode: 'KFPL-1002' });
  const suresh = await User.findOne({ clientCode: 'KFPL-1004' });

  // If suresh doesn't exist, try to find any client to prevent failing
  const anyClients = await User.find({ role: 'client' }).limit(3);
  const client1 = rajesh || anyClients[0];
  const client2 = priya || anyClients[1] || client1;
  const client3 = suresh || anyClients[2] || client2;

  const astra = await Project.findOne({ name: 'Project Astra' });
  const rhythm = await Project.findOne({ name: 'Rhythm Series' });
  const anyProjects = await Project.find().limit(2);
  const project1 = astra || anyProjects[0];
  const project2 = rhythm || anyProjects[1] || project1;

  if (!client1 || !project1) {
    console.log('[Dividend Seeder Warning] Skipping allotments seeding: No client users or projects found in database.');
    return;
  }

  // 3. Seed allotments
  const mockAllotments = [
    {
      clientId: client1._id,
      projectId: project1._id,
      allottedAmount: 150000, // ₹1.50 L
      allotmentDate: new Date('2025-04-15T05:30:00.000Z'),
      remarks: 'Annual performance bonus for exceptional project returns.',
      createdBy: creatorId,
    },
    {
      clientId: client2._id,
      projectId: project1._id,
      allottedAmount: 120000, // ₹1.20 L
      allotmentDate: new Date('2025-04-15T05:30:00.000Z'),
      remarks: 'Annual performance bonus for exceptional project returns.',
      createdBy: creatorId,
    },
    {
      clientId: client3._id,
      projectId: project2._id,
      allottedAmount: 50000, // ₹50,000
      allotmentDate: new Date('2025-05-10T05:30:00.000Z'),
      remarks: 'Streaming milestone bonus for Rhythm catalogue.',
      createdBy: creatorId,
    },
  ];

  await DividendAllotment.create(mockAllotments);
  await SystemConfig.findOneAndUpdate({ key: 'dividends_seeded' }, { value: true }, { upsert: true });
  console.log('[Dividend Seeder] Successfully seeded standard allotments matching screenshot.');
};

/**
 * Configure/Create or Clear a Dividend Pool (Super Admin)
 * POST /api/super-admin/dividends/pools
 */
const createPool = asyncHandler(async (req, res, next) => {
  const { poolAmount, name, remarks, projectId } = req.body;
  const amt = Number(poolAmount || 0);

  let pool = null;
  if (amt === 0 && projectId) {
    // Clear all pool records for this project
    await DividendPool.deleteMany({ projectId });
    await Project.findByIdAndUpdate(projectId, { totalDividendPool: 0 });
  } else {
    pool = await DividendPool.create({
      poolAmount: amt,
      name: name || (amt === 0 ? 'Pool Cleared' : 'General Pool'),
      remarks: remarks || '',
      projectId: projectId || undefined,
      createdBy: req.user.id,
    });

    if (projectId) {
      const allPools = await DividendPool.find({ projectId }).lean();
      const sum = allPools.reduce((s, p) => s + (p.poolAmount || 0), 0);
      await Project.findByIdAndUpdate(projectId, { totalDividendPool: sum });
    }
  }

  res.status(200).json({
    success: true,
    message: amt === 0 ? 'Dividend pool cleared successfully' : 'Dividend pool configured successfully',
    data: pool,
  });
});

/**
 * Allot dividends to a client (Super Admin)
 * POST /api/super-admin/dividends/allotments
 */
const createAllotment = asyncHandler(async (req, res, next) => {
  const { clientId, projectId, allottedAmount, remarks } = req.body;

  // Verify client user exists
  const clientUser = await User.findById(clientId);
  if (!clientUser) {
    return next(new AppError('Target client user not found', 404));
  }

  // Verify project exists
  const project = await Project.findById(projectId);
  if (!project) {
    return next(new AppError('Target project not found', 404));
  }

  const amt = Number(allottedAmount);

  // Validate pool limit (project-specific if projectId is specified)
  const query = projectId ? { projectId } : {};
  const poolSum = await DividendPool.find(query).lean();
  const totalPools = poolSum.reduce((sum, p) => sum + p.poolAmount, 0);

  const allotmentSum = await DividendAllotment.find(query).lean();
  const totalAllotments = allotmentSum.reduce((sum, a) => sum + a.allottedAmount, 0);

  const remainingBalance = totalPools - totalAllotments;
  if (amt > remainingBalance) {
    return next(new AppError(`Insufficient pool balance. Remaining: ₹${(remainingBalance / 100000).toFixed(2)} Lakhs, Requested: ₹${(amt / 100000).toFixed(2)} Lakhs. Please configure a new pool.`, 400));
  }

  const allotment = await DividendAllotment.create({
    clientId,
    projectId,
    allottedAmount: amt,
    remarks: remarks || '',
    createdBy: req.user.id,
  });

  res.status(201).json({
    success: true,
    message: 'Dividend allotted successfully',
    data: allotment,
  });
});

/**
 * Get stats of Dividend Pools (Super Admin & Client)
 * GET /api/super-admin/dividends/stats
 */
const getDividendStats = asyncHandler(async (req, res, next) => {
  const { projectId } = req.query;
  const query = projectId ? { projectId } : {};

  const poolSum = await DividendPool.find(query).lean();
  const totalPoolsConfigured = poolSum.reduce((sum, p) => sum + p.poolAmount, 0);

  const allotmentSum = await DividendAllotment.find(query).lean();
  const dividendsDistributed = allotmentSum.reduce((sum, a) => sum + a.allottedAmount, 0);

  const remainingPoolsBalance = totalPoolsConfigured - dividendsDistributed;

  res.status(200).json({
    success: true,
    data: {
      totalPoolsConfigured,
      dividendsDistributed,
      remainingPoolsBalance,
    },
  });
});

/**
 * Get all allotments (Super Admin - Allotment Ledger list)
 * GET /api/super-admin/dividends/allotments
 */
const getAllAllotments = asyncHandler(async (req, res, next) => {
  let allotments = await DividendAllotment.find()
    .populate('clientId', 'name email clientCode')
    .populate('projectId', 'name segment')
    .sort({ allotmentDate: -1 })
    .lean();

  // Fetch ClientProfiles to resolve real fullName (User.name may differ from display name)
  const mongoose = require('mongoose');
  const rawClientIds = allotments
    .map(a => a.clientId?._id || a.clientId)
    .filter(Boolean);

  const clientUserObjectIds = rawClientIds
    .map(id => {
      try { return new mongoose.Types.ObjectId(String(id)); } catch { return null; }
    })
    .filter(Boolean);

  const clientProfiles = clientUserObjectIds.length > 0
    ? await ClientProfile.find({ userId: { $in: clientUserObjectIds } }).select('userId fullName email').lean()
    : [];

  // Also fetch User emails for fallback
  const clientUsers = clientUserObjectIds.length > 0
    ? await require('../../models/User.model').find({ _id: { $in: clientUserObjectIds } }).select('_id name email').lean()
    : [];

  const userEmailMap = {};
  clientUsers.forEach(u => {
    userEmailMap[String(u._id)] = u;
  });

  const profileMap = {};
  clientProfiles.forEach(p => {
    profileMap[String(p.userId)] = p;
  });

  // Attach resolved name to each allotment
  allotments = allotments.map(a => {
    const userId = String(a.clientId?._id || a.clientId || '');
    const profile = profileMap[userId];
    const userRecord = userEmailMap[userId];
    return {
      ...a,
      _resolvedClientName: profile?.fullName || a.clientId?.name || userRecord?.name || null,
      _resolvedClientCode: a.clientId?.clientCode || null,
    };
  });

  if (req.query.search) {
    const search = req.query.search.toLowerCase();
    allotments = allotments.filter(allot => {
      const clientName = (allot._resolvedClientName || allot.clientId?.name || '').toLowerCase();
      const clientCode = (allot._resolvedClientCode || allot.clientId?.clientCode || '').toLowerCase();
      const projectName = (allot.projectId?.name || '').toLowerCase();
      const projectSegment = (allot.projectId?.segment || '').toLowerCase();
      const remarks = (allot.remarks || '').toLowerCase();

      return (
        clientName.includes(search) ||
        clientCode.includes(search) ||
        projectName.includes(search) ||
        projectSegment.includes(search) ||
        remarks.includes(search)
      );
    });
  }

  // Compute stats for frontend summary cards
  const poolSum = await DividendPool.find().lean();
  const totalPoolsConfigured = poolSum.reduce((sum, p) => sum + p.poolAmount, 0);

  const allAllotmentSum = await DividendAllotment.find().lean();
  const dividendsDistributed = allAllotmentSum.reduce((sum, a) => sum + a.allottedAmount, 0);

  const remainingPoolsBalance = totalPoolsConfigured - dividendsDistributed;

  res.status(200).json({
    success: true,
    count: allotments.length,
    data: {
      allotments,
      totalPoolsConfigured,
      dividendsDistributed,
      remainingPoolsBalance,
      stats: {
        totalPoolsConfigured,
        dividendsDistributed,
        remainingPoolsBalance,
      },
    },
  });
});

/**
 * Get allotments for logged-in client (Client view)
 * GET /api/client/dividends
 */
const getClientAllotments = asyncHandler(async (req, res, next) => {
  const allotments = await DividendAllotment.find({ clientId: req.user.id })
    .populate('projectId', 'name segment')
    .sort({ allotmentDate: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: allotments.length,
    data: {
      allotments,
    },
  });
});

/**
 * Get client specific dividend stats
 * GET /api/client/dividends/stats
 */
const getClientDividendStats = asyncHandler(async (req, res, next) => {
  const allotments = await DividendAllotment.find({ clientId: req.user.id }).lean();
  const totalDividendsReceived = allotments.reduce((sum, a) => sum + a.allottedAmount, 0);

  res.status(200).json({
    success: true,
    data: {
      totalDividendsReceived,
    },
  });
});

/**
 * Delete a Dividend Allotment (Super Admin)
 * DELETE /api/super-admin/dividends/allotments/:id
 */
const deleteAllotment = asyncHandler(async (req, res, next) => {
  const allotment = await DividendAllotment.findByIdAndDelete(req.params.id);
  if (!allotment) {
    return next(new AppError('Target dividend allotment record not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Dividend allotment entry deleted successfully',
  });
});

module.exports = {
  createPool,
  createAllotment,
  getDividendStats,
  getAllAllotments,
  getClientAllotments,
  getClientDividendStats,
  deleteAllotment,
};
