const express = require('express');
const { getAdminDashboard } = require('../../controllers/super-admin/dashboard.controller');
const { protect, restrictTo, requirePermission } = require('../../middlewares/auth.middleware');
const { ROLES } = require('../../constants/roles');
const {
  recordPayout,
  getPayouts,
  markPayoutPaid,
  bulkUploadPayouts,
  clearAllPayouts,
  deletePayout
} = require('../../controllers/super-admin/payout.controller');
const {
  createInvestment,
  getAllInvestments,
  getInvestmentById,
  approveInvestment,
  extendInvestmentContract,
  deleteInvestment,
  clearAllInvestments,
} = require('../../controllers/super-admin/investment.controller');
const {
  createInvestmentValidationRules,
  extendContractValidationRules,
} = require('../../validations/super-admin/investment.validation');
const {
  getSettings,
  toggle2FA,
  toggleClient2FA,
  toggleAgent2FA,
  getSupportSettings,
  updateSupportSettings,
} = require('../../controllers/super-admin/settings.controller');
const {
  sendChangeEmailOtpHandler,
  verifyChangeEmailOtp,
} = require('../../controllers/super-admin/change-email.controller');
const {
  sendChangePasswordOtpHandler,
  verifyChangePasswordOtp,
} = require('../../controllers/super-admin/change-password.controller');
const {
  sendChangeEmailOtpRules,
  verifyChangeEmailOtpRules,
} = require('../../validations/super-admin/change-email.validation');
const {
  sendChangePasswordOtpRules,
  verifyChangePasswordOtpRules,
} = require('../../validations/super-admin/change-password.validation');

// Client management controllers and validations
const {
  createClient,
  getAllClients,
  getClientById,
  updateClient,
  deleteClient,
  clearAllClients,
  previewClientDashboard,
  updateClientRoiRate,
  verifyDocument,
} = require('../../controllers/super-admin/client-management.controller');

// Agent management controllers and validations
const {
  createAgent,
  getAllAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  clearAllAgents,
  getAgentClients,
  getAgentCommissions,
  updateAgentStatus,
  verifyAgentDocument,
  updateAgentKycStatus,
  payAgentCommission,
} = require('../../controllers/super-admin/agent-management.controller');

const {
  createAgentValidationRules,
  updateAgentRulesByAdmin,
} = require('../../validations/super-admin/agent.validation');

const {
  getManageClients,
  exportClientsCSV,
} = require('../../controllers/super-admin/client-reporting.controller');

const {
  getClientInvestmentsTab,
  getClientRoiTab,
  markRoiPaid,
  getClientDocumentsTab,
  getClientPerksTab,
} = require('../../controllers/super-admin/client-financials.controller');

const {
  createClientValidationRules,
  updateClientRulesByAdmin,
} = require('../../validations/client/client.validation');

// Client portal management controllers and validations
const {
  listClientAccounts,
  getClientAccountDetails,
  updateClientStatus,
} = require('../../controllers/super-admin/client-portal.controller');

const {
  updateClientStatusRules,
} = require('../../validations/super-admin/client-portal.validation');

const { upload, memoryUpload, rewardsUpload, anyUpload } = require('../../middlewares/upload.middleware');

const {
  createArticle,
  getAllArticles,
  getArticleById,
  updateArticle,
  deleteArticle,
} = require('../../controllers/super-admin/article.controller');

const {
  createPerk,
  getAllPerks,
  updatePerk,
  deletePerk,
  assignPerkToClients,
  getAssignedPerks,
  unassignPerk,
} = require('../../controllers/super-admin/perk.controller');

const {
  createPerkValidationRules,
  updatePerkValidationRules,
  assignPerkValidationRules,
} = require('../../validations/super-admin/perk.validation');

const {
  createArticleValidationRules,
  updateArticleValidationRules,
} = require('../../validations/super-admin/article.validation');

const {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
  uploadProjectMedia,
  deleteProjectMedia,
} = require('../../controllers/super-admin/project.controller');

const {
  createProjectValidationRules,
  updateProjectValidationRules,
} = require('../../validations/super-admin/project.validation');

const {
  getAllSegments,
  createSegment,
  updateSegment,
  deleteSegment,
} = require('../../controllers/super-admin/segment.controller');

const {
  createSegmentValidationRules,
  updateSegmentValidationRules,
} = require('../../validations/super-admin/segment.validation');

const {
  createPool,
  createAllotment,
  getDividendStats,
  getAllAllotments,
  deleteAllotment,
} = require('../../controllers/super-admin/dividend.controller');

const {
  createPoolValidationRules,
  createAllotmentValidationRules,
} = require('../../validations/super-admin/dividend.validation');

const {
  getRewardsConfig,
  updateRewardsConfig,
} = require('../../controllers/super-admin/rewards-config.controller');

const {
  updateRewardsConfigRules,
} = require('../../validations/super-admin/rewards-config.validation');

const {
  createPerformanceReward,
  getAllPerformanceRewards,
  getPerformanceRewardById,
  updatePerformanceReward,
  deletePerformanceReward,
} = require('../../controllers/super-admin/performance-reward.controller');

const {
  createRewardValidationRules,
  updateRewardValidationRules,
} = require('../../validations/super-admin/performance-reward.validation');

// Configure Multer field parsing for client onboarding documents
const clientOnboardingUpload = upload.fields([
  { name: 'panDocument', maxCount: 1 },
  { name: 'aadhaarDocument', maxCount: 1 },
  { name: 'bankProofDocument', maxCount: 1 },
  { name: 'agreementDocument', maxCount: 1 },
  { name: 'nomineeProofDocument', maxCount: 1 },
]);

// Configure Multer field parsing for client onboarding documents (Memory storage for parallel serverless safe upload)
const memoryClientOnboardingUpload = memoryUpload.fields([
  { name: 'panDocument', maxCount: 1 },
  { name: 'aadhaarDocument', maxCount: 1 },
  { name: 'bankProofDocument', maxCount: 1 },
  { name: 'agreementDocument', maxCount: 1 },
  { name: 'nomineeProofDocument', maxCount: 1 },
]);

// Configure Multer field parsing for agent onboarding documents
const agentOnboardingUpload = upload.fields([
  { name: 'panDocument', maxCount: 1 },
  { name: 'idProofDocument', maxCount: 1 },
  { name: 'bankProofDocument', maxCount: 1 },
  { name: 'nomineeProofDocument', maxCount: 1 },
]);

// Configure Multer field parsing for agent onboarding documents (Memory storage for parallel serverless safe upload)
const memoryAgentOnboardingUpload = memoryUpload.fields([
  { name: 'panDocument', maxCount: 1 },
  { name: 'idProofDocument', maxCount: 1 },
  { name: 'bankProofDocument', maxCount: 1 },
  { name: 'nomineeProofDocument', maxCount: 1 },
]);

const {
  slabValidationRules,
  updateSlabValidationRules,
  overrideValidationRules,
  updateOverrideValidationRules,
} = require('../../validations/super-admin/commission-slab.validation');

const {
  getAllSlabs,
  createSlab,
  updateSlab,
  deleteSlab,
  getAllOverrides,
  createOverride,
  updateOverride,
  deleteOverride,
  calculateCommission,
} = require('../../controllers/super-admin/commission-slab.controller');

const router = express.Router();

// Apply Auth and Role Guard to all Super Admin endpoints
router.use(protect);

// Shared routes accessible by Super Admin, Sub Admin, Agent, and Client
router.get('/clients/:id', restrictTo(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.AGENT, ROLES.CLIENT), getClientById);
router.get('/clients/:id/documents', restrictTo(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.AGENT, ROLES.CLIENT), getClientDocumentsTab);
router.get('/clients/:id/investments', restrictTo(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.AGENT, ROLES.CLIENT), getClientInvestmentsTab);
router.get('/clients/:id/roi', restrictTo(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.AGENT, ROLES.CLIENT), getClientRoiTab);
router.get('/clients/:id/perks', restrictTo(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.AGENT, ROLES.CLIENT), getClientPerksTab);
router.get('/roi/payouts', restrictTo(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.AGENT, ROLES.CLIENT), getPayouts);
router.get('/settings/support', restrictTo(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN, ROLES.AGENT, ROLES.CLIENT), getSupportSettings);

router.use(restrictTo(ROLES.SUPER_ADMIN, ROLES.SUB_ADMIN));

// 1. Dashboard Analytics
router.get('/dashboard', getAdminDashboard);

// 2. Client / Investor Management
router.route('/clients')
  .get(requirePermission(['manageClients', 'clientPortal'], 'view'), getAllClients)
  .post(requirePermission(['manageClients', 'clientPortal'], 'create'), memoryClientOnboardingUpload, createClientValidationRules, createClient);

router.get('/clients/manage', requirePermission(['manageClients', 'clientPortal'], 'view'), getManageClients);
router.get('/clients/manage/export', requirePermission(['manageClients', 'clientPortal'], 'view'), exportClientsCSV);

router.delete('/clients/clear', requirePermission(['manageClients', 'clientPortal'], 'delete'), clearAllClients);

router.route('/clients/:id')
  .patch(requirePermission(['manageClients', 'clientPortal'], 'edit'), memoryClientOnboardingUpload, updateClientRulesByAdmin, updateClient)
  .delete(requirePermission(['manageClients', 'clientPortal'], 'delete'), deleteClient);

router.patch('/clients/:id/roi/:payoutId/pay', requirePermission(['manageClients', 'clientPortal'], 'edit'), markRoiPaid);
router.patch('/clients/:id/roi-rate', requirePermission(['manageClients', 'clientPortal'], 'edit'), updateClientRoiRate);
router.patch('/clients/:id/verify-document', requirePermission(['manageClients', 'clientPortal'], 'edit'), verifyDocument);

// Client dashboard preview
router.get('/client-dashboard/:clientId', requirePermission(['manageClients', 'clientPortal'], 'view'), previewClientDashboard);

// 3. Investment Management — Read-only after assignment (immutable financial records)
router.route('/investments')
  .get(requirePermission('manageInvestments', 'view'), getAllInvestments)
  .post(requirePermission('manageInvestments', 'create'), createInvestmentValidationRules, createInvestment);

router.delete('/investments/clear', requirePermission('manageInvestments', 'delete'), clearAllInvestments);

router.route('/investments/:id')
  .get(requirePermission('manageInvestments', 'view'), getInvestmentById)
  .delete(requirePermission('manageInvestments', 'delete'), deleteInvestment);

router.patch('/investments/:id/approve', requirePermission('manageInvestments', 'edit'), approveInvestment);
router.patch('/investments/:id/extend', requirePermission('manageInvestments', 'edit'), extendContractValidationRules, extendInvestmentContract);

// 4. ROI & Payouts Management (Complete Transaction Details)

router.route('/roi/payouts')
  .post(requirePermission('transactionDetails', 'create'), recordPayout);

router.delete('/roi/payouts/clear', requirePermission('transactionDetails', 'delete'), clearAllPayouts);
router.delete('/roi/payouts/:id', requirePermission('transactionDetails', 'delete'), deletePayout);

router.post('/roi/payouts/bulk', requirePermission('transactionDetails', 'create'), memoryUpload.single('file'), bulkUploadPayouts);

router.patch('/roi/payouts/:id/pay', requirePermission('transactionDetails', 'edit'), markRoiPaid);

// 5. Agent Management
router.delete('/agents/clear', requirePermission(['manageAgents', 'agentPortal'], 'delete'), clearAllAgents);

router.route('/agents')
  .get(requirePermission(['manageAgents', 'agentPortal'], 'view'), getAllAgents)
  .post(requirePermission(['manageAgents', 'agentPortal'], 'create'), memoryAgentOnboardingUpload, createAgentValidationRules, createAgent);

router.route('/agents/:id')
  .get(requirePermission('manageAgents', 'view'), getAgentById)
  .patch(requirePermission('manageAgents', 'edit'), memoryAgentOnboardingUpload, updateAgentRulesByAdmin, updateAgent)
  .delete(requirePermission('manageAgents', 'delete'), deleteAgent);

router.get('/agents/:id/clients', requirePermission('manageAgents', 'view'), getAgentClients);
router.get('/agents/:id/commissions', requirePermission('manageAgents', 'view'), getAgentCommissions);
router.patch('/agents/commissions/:commissionId/pay', requirePermission('manageAgents', 'edit'), payAgentCommission);
router.patch('/agents/:id/status', requirePermission('manageAgents', 'edit'), updateAgentStatus);
router.patch('/agents/:id/verify-document', requirePermission('manageAgents', 'edit'), verifyAgentDocument);
router.patch('/agents/:id/kyc', requirePermission('manageAgents', 'edit'), updateAgentKycStatus);
router.patch('/agents/:id/verify-kyc', requirePermission('manageAgents', 'edit'), updateAgentKycStatus);
router.patch('/agents/:id/kyc-status', requirePermission('manageAgents', 'edit'), updateAgentKycStatus);

// 6. Deposit & Withdrawal Approvals
const {
  getPendingApprovals,
  approveRejectTransaction,
  getApprovalsHistory,
  getTransactionById,
  clearAllHistory,
  backfillApprovedDeposits,
} = require('../../controllers/super-admin/transaction.controller');

router.route('/transactions/approvals')
  .get(requirePermission('depositWithdrawal', 'view'), getPendingApprovals);

router.get('/transactions/history', requirePermission('depositWithdrawal', 'view'), getApprovalsHistory);
router.delete('/transactions/history/clear', requirePermission('depositWithdrawal', 'delete'), clearAllHistory);
router.post('/transactions/backfill-investments', requirePermission('depositWithdrawal', 'edit'), backfillApprovedDeposits);
router.get('/transactions/:id', requirePermission('depositWithdrawal', 'view'), getTransactionById);
router.patch('/transactions/:id/action', requirePermission('depositWithdrawal', 'edit'), approveRejectTransaction);
router.patch('/transactions/:id/approve', requirePermission('depositWithdrawal', 'edit'), approveRejectTransaction);

// 7. Perks & Recognition Management
router.route('/perks')
  .get(requirePermission('perksRecognition', 'view'), getAllPerks)
  .post(requirePermission('perksRecognition', 'create'), createPerkValidationRules, createPerk);

router.route('/perks/assign')
  .post(requirePermission('perksRecognition', 'create'), assignPerkValidationRules, assignPerkToClients);

router.route('/perks/assignments')
  .get(requirePermission('perksRecognition', 'view'), getAssignedPerks)
  .post(requirePermission('perksRecognition', 'create'), assignPerkValidationRules, assignPerkToClients);

router.route('/perks/assignments/:id')
  .delete(requirePermission('perksRecognition', 'delete'), unassignPerk);

router.route('/perks/assigned')
  .get(requirePermission('perksRecognition', 'view'), getAssignedPerks)
  .post(requirePermission('perksRecognition', 'create'), assignPerkValidationRules, assignPerkToClients);

router.route('/perks/assigned/:id')
  .delete(requirePermission('perksRecognition', 'delete'), unassignPerk);

router.route('/perks/:id')
  .patch(requirePermission('perksRecognition', 'edit'), updatePerkValidationRules, updatePerk)
  .put(requirePermission('perksRecognition', 'edit'), updatePerkValidationRules, updatePerk)
  .delete(requirePermission('perksRecognition', 'delete'), deletePerk);

// 8. Activity Logs
router.get('/activity-logs', (req, res) => {
  res.status(200).json({ status: 'success', message: 'List System Activity Logs placeholder' });
});

// 18. Custom Email Broadcasts & Direct Notifications
const {
  sendDirectEmail,
  triggerScheduledEmailsProcess,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTriggers,
  toggleTrigger,
  getLogs,
  getMetrics
} = require('../../controllers/super-admin/notification.controller');

router.post('/notifications/send-email', requirePermission('emailNotifications', 'create'), anyUpload.any(), sendDirectEmail);
router.post('/notifications/process-scheduled', requirePermission('emailNotifications', 'create'), triggerScheduledEmailsProcess);

// Custom Templates CRUD
router.get('/notifications/templates', requirePermission('emailNotifications', 'view'), getTemplates);
router.post('/notifications/templates', requirePermission('emailNotifications', 'create'), createTemplate);
router.patch('/notifications/templates/:id', requirePermission('emailNotifications', 'edit'), updateTemplate);
router.delete('/notifications/templates/:id', requirePermission('emailNotifications', 'delete'), deleteTemplate);

// Auto Trigger Config
router.get('/notifications/triggers', requirePermission('emailNotifications', 'view'), getTriggers);
router.patch('/notifications/triggers/:id/toggle', requirePermission('emailNotifications', 'edit'), toggleTrigger);

// History Logs & Dashboard Metrics
router.get('/notifications/logs', requirePermission('emailNotifications', 'view'), getLogs);
router.get('/notifications/metrics', requirePermission('emailNotifications', 'view'), getMetrics);

// 9. Agreement Uploads
router.route('/agreements')
  .get((req, res) => res.status(200).json({ status: 'success', message: 'List Agreements placeholder' }))
  .post(require('../../utils/asyncHandler')(async (req, res, next) => {
    const User = require('../../models/User.model');
    const AppError = require('../../utils/AppError');
    const { trackAndSendSystemEmail } = require('../../services/email.service');

    const { clientId, agreementTitle } = req.body;
    if (!clientId) {
      return next(new AppError('Please provide a client ID.', 400));
    }

    const client = await User.findById(clientId);
    if (!client || client.role !== 'client') {
      return next(new AppError('Client not found.', 404));
    }

    const title = agreementTitle || 'Investment Agreement';
    const subject = `Kinetoscope – New Agreement Uploaded: ${title}`;
    const text = `Hello ${client.name},\n\nA new agreement document (${title}) has been uploaded to your portal for review.\n\nBest regards,\nKinetoscope Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 540px; margin: auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #1e3a8a; margin-bottom: 16px;">New Agreement Uploaded</h2>
        <p style="color: #4b5563; font-size: 14px;">Hello <strong>${client.name}</strong>,</p>
        <p style="color: #4b5563; font-size: 14px;">A new agreement document has been uploaded to your profile:</p>
        <div style="background: #f8fafc; border-radius: 6px; padding: 20px; border: 1px solid #e2e8f0; margin: 20px 0;">
          <strong style="color: #0f172a; font-size: 15px;">${title}</strong>
        </div>
        <p style="color: #4b5563; font-size: 14px;">Please log in to the Client Portal to review, sign, or download your agreement.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kinetoscope Films Production Pvt Ltd</p>
      </div>
    `;

    try {
      await trackAndSendSystemEmail('agreement_uploaded', {
        to: client.email,
        subject,
        text,
        html,
        recipientGroup: 'Individual',
        targetSummary: `${client.name}`,
        templateName: 'Welcome Investor Kit'
      });
    } catch (err) {
      console.error('Failed to send agreement uploaded notification:', err.message);
    }

    res.status(201).json({ status: 'success', message: 'Agreement uploaded successfully and notification sent.' });
  }));
// 10. Settings — 2FA and profile preferences
router.get('/settings', requirePermission('settings', 'view'), getSettings);
router.patch('/settings/2fa', requirePermission('settings', 'edit'), toggle2FA);
router.patch('/settings/client-2fa', requirePermission('settings', 'edit'), toggleClient2FA);
router.patch('/settings/agent-2fa', requirePermission('settings', 'edit'), toggleAgent2FA);
router.get('/settings/support', requirePermission('settings', 'view'), getSupportSettings);
router.put('/settings/support', requirePermission('settings', 'edit'), updateSupportSettings);

// 11. Settings — Change Email Address (OTP-based)
router.post('/settings/change-email/send-otp', requirePermission('settings', 'edit'), sendChangeEmailOtpRules, sendChangeEmailOtpHandler);
router.post('/settings/change-email/verify-otp', requirePermission('settings', 'edit'), verifyChangeEmailOtpRules, verifyChangeEmailOtp);

// 12. Settings — Change Password (OTP-based)
router.post('/settings/change-password/send-otp', requirePermission('settings', 'edit'), sendChangePasswordOtpRules, sendChangePasswordOtpHandler);
router.post('/settings/change-password/verify-otp', requirePermission('settings', 'edit'), verifyChangePasswordOtpRules, verifyChangePasswordOtp);

// 13. Client Portal Management — Account listing, details, status
router.get('/client-portal', requirePermission('manageClients', 'view'), listClientAccounts);
router.get('/client-portal/:clientId', requirePermission('manageClients', 'view'), getClientAccountDetails);
router.patch('/client-portal/:clientId/status', requirePermission('manageClients', 'edit'), updateClientStatusRules, updateClientStatus);

// 14. News & Media Articles Management
router.route('/articles')
  .get(requirePermission('newsMedia', 'view'), getAllArticles)
  .post(requirePermission('newsMedia', 'create'), memoryUpload.single('featuredImage'), createArticleValidationRules, createArticle);

router.route('/articles/:id')
  .get(requirePermission('newsMedia', 'view'), getArticleById)
  .patch(requirePermission('newsMedia', 'edit'), memoryUpload.single('featuredImage'), updateArticleValidationRules, updateArticle)
  .delete(requirePermission('newsMedia', 'delete'), deleteArticle);

// 15. Portfolio Management (Project Catalog)
router.route('/projects')
  .get(requirePermission('portfolio', 'view'), getAllProjects)
  .post(requirePermission('portfolio', 'create'), memoryUpload.single('bannerImage'), createProjectValidationRules, createProject);

router.route('/projects/:id')
  .get(requirePermission('portfolio', 'view'), getProjectById)
  .patch(requirePermission('portfolio', 'edit'), memoryUpload.single('bannerImage'), updateProjectValidationRules, updateProject)
  .delete(requirePermission('portfolio', 'delete'), deleteProject);

router.route('/projects/:id/media')
  .post(requirePermission('portfolio', 'create'), memoryUpload.any(), uploadProjectMedia)
  .delete(requirePermission('portfolio', 'delete'), deleteProjectMedia);

// 15b. Project Update History & Status Updates (Investment Status views)
const { publishProjectUpdate, getUpdateHistory, uploadUpdateAttachment } = require('../../controllers/super-admin/project-update.controller');
const { publishUpdateValidationRules } = require('../../validations/super-admin/project-update.validation');

router.get('/projects/updates/history', requirePermission('portfolio', 'view'), getUpdateHistory);
router.post('/projects/:id/updates', requirePermission('portfolio', 'create'), publishUpdateValidationRules, publishProjectUpdate);
router.post('/projects/:id/updates/attachments', requirePermission('portfolio', 'create'), memoryUpload.single('file'), uploadUpdateAttachment);

// 16. Segment & Status Management
router.route('/segments')
  .get(requirePermission('settings', 'view'), getAllSegments)
  .post(requirePermission('settings', 'create'), createSegmentValidationRules, createSegment);

router.route('/segments/:id')
  .patch(requirePermission('settings', 'edit'), updateSegmentValidationRules, updateSegment)
  .delete(requirePermission('settings', 'delete'), deleteSegment);

// 17. Dividend Pool & Allotment Ledger Management
router.get('/dividends/stats', requirePermission('manageInvestments', 'view'), getDividendStats);
router.get('/dividends/allotments', requirePermission('manageInvestments', 'view'), getAllAllotments);
router.post('/dividends/pools', requirePermission('manageInvestments', 'create'), createPoolValidationRules, createPool);
router.post('/dividends/allotments', requirePermission('manageInvestments', 'create'), createAllotmentValidationRules, createAllotment);
router.delete('/dividends/allotments/:id', requirePermission('manageInvestments', 'delete'), deleteAllotment);

// 18. Rewards & Withdrawal Configuration
router.route('/rewards-config')
  .get(requirePermission('rewardsConfig', 'view'), getRewardsConfig)
  .patch(requirePermission('rewardsConfig', 'edit'), updateRewardsConfigRules, updateRewardsConfig);

// Configure Multer fields parsing for performance reward media uploads
const rewardMediaUpload = rewardsUpload.fields([
  { name: 'rewardImage', maxCount: 1 },
  { name: 'rewardVideo', maxCount: 1 },
]);

// 19. Performance Reward Catalog Management
router.route('/rewards')
  .get(requirePermission('rewardsConfig', 'view'), getAllPerformanceRewards)
  .post(requirePermission('rewardsConfig', 'create'), rewardMediaUpload, createRewardValidationRules, createPerformanceReward);

router.route('/rewards/:id')
  .get(requirePermission('rewardsConfig', 'view'), getPerformanceRewardById)
  .patch(requirePermission('rewardsConfig', 'edit'), rewardMediaUpload, updateRewardValidationRules, updatePerformanceReward)
  .delete(requirePermission('rewardsConfig', 'delete'), deletePerformanceReward);

// 20. Commission Slab & Override Configurations
router.route('/commission-slabs')
  .get(requirePermission('commissionSlabs', 'view'), getAllSlabs)
  .post(requirePermission('commissionSlabs', 'create'), slabValidationRules, createSlab);

router.route('/commission-slabs/overrides')
  .get(requirePermission('commissionSlabs', 'view'), getAllOverrides)
  .post(requirePermission('commissionSlabs', 'create'), overrideValidationRules, createOverride);

router.post('/commission-slabs/calculate', requirePermission('commissionSlabs', 'view'), calculateCommission);

router.route('/commission-slabs/overrides/:id')
  .patch(requirePermission('commissionSlabs', 'edit'), updateOverrideValidationRules, updateOverride)
  .delete(requirePermission('commissionSlabs', 'delete'), deleteOverride);

router.route('/commission-slabs/:id')
  .patch(requirePermission('commissionSlabs', 'edit'), updateSlabValidationRules, updateSlab)
  .delete(deleteSlab);

// 21. Service Requests Management (Super Admin view)
const { updateRequestStatusRules } = require('../../validations/super-admin/service-request.validation');
const { getAllServiceRequests, getServiceRequestById, updateServiceRequestStatus, deleteServiceRequest } = require('../../controllers/super-admin/service-request.controller');

router.route('/service-requests')
  .get(requirePermission('serviceRequests', 'view'), getAllServiceRequests);

router.route('/service-requests/:id/status')
  .patch(requirePermission('serviceRequests', 'edit'), updateRequestStatusRules, updateServiceRequestStatus);

router.route('/service-requests/:id')
  .get(requirePermission('serviceRequests', 'view'), getServiceRequestById)
  .delete(requirePermission('serviceRequests', 'delete'), deleteServiceRequest);

// 22. FAQ Management
const { createFaq, getAllFaqs, updateFaq, deleteFaq } = require('../../controllers/super-admin/faq.controller');

router.route('/faqs')
  .get(requirePermission('faqManagement', 'view'), getAllFaqs)
  .post(requirePermission('faqManagement', 'create'), createFaq);

router.route('/faqs/:id')
  .patch(requirePermission('faqManagement', 'edit'), updateFaq)
  .delete(requirePermission('faqManagement', 'delete'), deleteFaq);

// 23. Sub Admin Management
const {
  createSubAdmin,
  getAllSubAdmins,
  getSubAdminById,
  updateSubAdmin,
  deleteSubAdmin,
  toggleSubAdminStatus,
} = require('../../controllers/super-admin/sub-admin.controller');

router.route('/sub-admins')
  .get(requirePermission('subAdmins', 'view'), getAllSubAdmins)
  .post(requirePermission('subAdmins', 'create'), createSubAdmin);

router.route('/sub-admins/:id')
  .get(requirePermission('subAdmins', 'view'), getSubAdminById)
  .patch(requirePermission('subAdmins', 'edit'), updateSubAdmin)
  .delete(requirePermission('subAdmins', 'delete'), deleteSubAdmin);

router.route('/sub-admins/:id/status')
  .patch(requirePermission('subAdmins', 'edit'), toggleSubAdminStatus);


module.exports = router;
