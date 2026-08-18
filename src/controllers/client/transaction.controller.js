const Transaction = require('../../models/Transaction.model');
const User = require('../../models/User.model');
const { uploadBufferToCloudinary } = require('../../services/cloudinary.service');
const { sendTransactionRequestAlertToAdmin } = require('../../services/email.service');
const { TRANSACTION_STATUS, TRANSACTION_TYPES } = require('../../constants/statuses');
const { ROLES } = require('../../constants/roles');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * Request a deposit or withdrawal transaction (Client portal)
 * POST /api/client/transactions
 */
const requestTransaction = asyncHandler(async (req, res, next) => {
  const ClientProfile = require('../../models/ClientProfile.model');
  const { type, amount, paymentMethod, remarks, projectId, projectName, bankDetails } = req.body;
  const referenceNumber = req.body.referenceNumber || req.body.reference || req.body.transactionRef || req.body.referenceId || '';

  // Basic validation
  if (!type || !amount) {
    return next(new AppError('Transaction type and amount are required.', 400));
  }

  if (![TRANSACTION_TYPES.DEPOSIT, TRANSACTION_TYPES.WITHDRAWAL].includes(type)) {
    return next(new AppError('Transaction type must be either deposit or withdrawal.', 400));
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return next(new AppError('Amount must be a positive number.', 400));
  }

  let targetProjectId = null;
  let targetProjectName = projectName || '';

  if (projectId) {
    const Project = require('../../models/Project.model');
    const proj = await Project.findById(projectId);
    if (proj) {
      targetProjectId = proj._id;
      targetProjectName = proj.name;
    }
  }

  // Parse bank details if provided, or fallback to registered client profile
  let parsedBankDetails = {};
  if (bankDetails) {
    parsedBankDetails = typeof bankDetails === 'string' ? JSON.parse(bankDetails) : bankDetails;
  }

  if (type === TRANSACTION_TYPES.WITHDRAWAL && (!parsedBankDetails.accountNumber || !parsedBankDetails.ifscCode)) {
    const profile = await ClientProfile.findOne({ userId: req.user.id || req.user._id }).lean();
    if (profile) {
      parsedBankDetails = {
        accountHolderName: parsedBankDetails.accountHolderName || profile.accountHolderName || profile.fullName || req.user.name,
        bankName: parsedBankDetails.bankName || profile.bankName || '',
        accountNumber: parsedBankDetails.accountNumber || profile.accountNumber || profile.accountNo || '',
        ifscCode: parsedBankDetails.ifscCode || profile.ifscCode || profile.ifsc || '',
        upiId: parsedBankDetails.upiId || profile.upiId || '',
      };
    }
  }

  // File proof receipt handle (specifically required for deposits)
  const file = req.file || (req.files && req.files[0]);
  let proofAttachmentUrl = '';

  if (file) {
    try {
      console.log('[Client Transaction] Uploading proof receipt to Cloudinary...');
      proofAttachmentUrl = await uploadBufferToCloudinary(file.buffer, 'kinetoscope/transactions');
    } catch (uploadError) {
      return next(new AppError(`Proof document upload failed: ${uploadError.message}`, 500));
    }
  } else if (type === TRANSACTION_TYPES.DEPOSIT) {
    return next(new AppError('Proof of Deposit (Receipt/Screenshot) file is required.', 400));
  }

  // Create transaction document
  const transaction = await Transaction.create({
    clientId: req.user.id || req.user._id,
    clientName: req.user.name,
    clientCode: req.user.clientCode,
    type,
    amount: numericAmount,
    paymentMethod,
    referenceNumber,
    remarks,
    proofAttachment: proofAttachmentUrl,
    bankDetails: parsedBankDetails,
    status: TRANSACTION_STATUS.PENDING,
    projectId: targetProjectId,
    projectName: targetProjectName,
  });

  // Notify all active Super Admins via email
  try {
    const superAdmins = await User.find({ role: ROLES.SUPER_ADMIN, isActive: true });
    const superAdminEmails = superAdmins.map((admin) => admin.email);

    if (superAdminEmails.length > 0) {
      await sendTransactionRequestAlertToAdmin(
        superAdminEmails,
        req.user.name,
        req.user.clientCode,
        {
          type,
          amount: numericAmount,
          paymentMethod,
          referenceNumber,
        }
      );
    }
  } catch (emailError) {
    console.error('[Transaction Notification Error] Failed to email super admins:', emailError.message);
  }

  res.status(201).json({
    success: true,
    message: `${type.charAt(0).toUpperCase() + type.slice(1)} request submitted successfully.`,
    data: {
      transaction,
    },
  });
});

/**
 * Get client's transaction history (Client portal)
 * GET /api/client/transactions
 */
const getClientTransactions = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 1000);
  const skip = (page - 1) * limit;

  const clientId = req.user.id || req.user._id;
  const query = { clientId, isAgentWithdrawal: false };

  if (req.query.type) {
    query.type = req.query.type;
  }
  if (req.query.status) {
    query.status = req.query.status;
  }

  // Calculate metrics (Approved Deposits sum, Approved Withdrawals sum, Pending requests count)
  const allUserTx = await Transaction.find({ clientId, isAgentWithdrawal: false }).lean();
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let pendingRequests = 0;

  allUserTx.forEach(tx => {
    if (tx.status === TRANSACTION_STATUS.PENDING) {
      pendingRequests++;
    } else if (tx.status === TRANSACTION_STATUS.APPROVED) {
      if (tx.type === TRANSACTION_TYPES.DEPOSIT) {
        totalDeposits += tx.amount;
      } else if (tx.type === TRANSACTION_TYPES.WITHDRAWAL) {
        totalWithdrawals += tx.amount;
      }
    }
  });

  const total = await Transaction.countDocuments(query);
  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    count: transactions.length,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: {
      stats: {
        totalDeposits,
        totalWithdrawals,
        pendingRequests,
      },
      transactions,
    },
  });
});

module.exports = {
  requestTransaction,
  getClientTransactions,
};
