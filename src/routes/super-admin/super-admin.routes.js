const express = require('express');
const { getAdminDashboard } = require('../../controllers/super-admin/dashboard.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
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

// Shared routes accessible by both Super Admin and Agent
router.get('/clients/:id', restrictTo(ROLES.SUPER_ADMIN, ROLES.AGENT), getClientById);
router.get('/clients/:id/documents', restrictTo(ROLES.SUPER_ADMIN, ROLES.AGENT), getClientDocumentsTab);
router.get('/clients/:id/investments', restrictTo(ROLES.SUPER_ADMIN, ROLES.AGENT), getClientInvestmentsTab);
router.get('/clients/:id/roi', restrictTo(ROLES.SUPER_ADMIN, ROLES.AGENT), getClientRoiTab);
router.get('/clients/:id/perks', restrictTo(ROLES.SUPER_ADMIN, ROLES.AGENT), getClientPerksTab);
router.get('/roi/payouts', restrictTo(ROLES.SUPER_ADMIN, ROLES.AGENT), getPayouts);

router.use(restrictTo(ROLES.SUPER_ADMIN));

// 1. Dashboard Analytics
router.get('/dashboard', getAdminDashboard);

// 2. Client / Investor Management
router.route('/clients')
  .get(getAllClients)
  .post(memoryClientOnboardingUpload, createClientValidationRules, createClient);

router.get('/clients/manage', getManageClients);
router.get('/clients/manage/export', exportClientsCSV);

router.delete('/clients/clear', clearAllClients);

router.route('/clients/:id')
  .patch(memoryClientOnboardingUpload, updateClientRulesByAdmin, updateClient)
  .delete(deleteClient);

router.patch('/clients/:id/roi/:payoutId/pay', markRoiPaid);
router.patch('/clients/:id/roi-rate', updateClientRoiRate);
router.patch('/clients/:id/verify-document', verifyDocument);

// Client dashboard preview
router.get('/client-dashboard/:clientId', previewClientDashboard);

// 3. Investment Management — Read-only after assignment (immutable financial records)
router.route('/investments')
  .get(getAllInvestments)
  .post(createInvestmentValidationRules, createInvestment);

router.delete('/investments/clear', clearAllInvestments);

router.route('/investments/:id')
  .get(getInvestmentById)
  .delete(deleteInvestment);

router.patch('/investments/:id/extend', extendContractValidationRules, extendInvestmentContract);

// 4. ROI & Payouts Management (Complete Transaction Details)

router.route('/roi/payouts')
  .post(recordPayout);

router.delete('/roi/payouts/clear', clearAllPayouts);
router.delete('/roi/payouts/:id', deletePayout);

router.post('/roi/payouts/bulk', memoryUpload.single('file'), bulkUploadPayouts);

router.patch('/roi/payouts/:id/pay', markPayoutPaid);

// 5. Agent Management
router.delete('/agents/clear', clearAllAgents);

router.route('/agents')
  .get(getAllAgents)
  .post(memoryAgentOnboardingUpload, createAgentValidationRules, createAgent);

router.route('/agents/:id')
  .get(getAgentById)
  .patch(memoryAgentOnboardingUpload, updateAgentRulesByAdmin, updateAgent)
  .delete(deleteAgent);

router.get('/agents/:id/clients', getAgentClients);
router.get('/agents/:id/commissions', getAgentCommissions);
router.patch('/agents/commissions/:commissionId/pay', payAgentCommission);
router.patch('/agents/:id/status', updateAgentStatus);
router.patch('/agents/:id/verify-document', verifyAgentDocument);

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
  .get(getPendingApprovals);

router.get('/transactions/history', getApprovalsHistory);
router.delete('/transactions/history/clear', clearAllHistory);
router.post('/transactions/backfill-investments', backfillApprovedDeposits);
router.get('/transactions/:id', getTransactionById);
router.patch('/transactions/:id/action', approveRejectTransaction);
router.patch('/transactions/:id/approve', approveRejectTransaction);

// 7. Perks & Recognition Management
router.route('/perks')
  .get(getAllPerks)
  .post(createPerkValidationRules, createPerk);

router.route('/perks/assign')
  .post(assignPerkValidationRules, assignPerkToClients);

router.route('/perks/assignments')
  .get(getAssignedPerks)
  .post(assignPerkValidationRules, assignPerkToClients);

router.route('/perks/assignments/:id')
  .delete(unassignPerk);

router.route('/perks/assigned')
  .get(getAssignedPerks)
  .post(assignPerkValidationRules, assignPerkToClients);

router.route('/perks/assigned/:id')
  .delete(unassignPerk);

router.route('/perks/:id')
  .patch(updatePerkValidationRules, updatePerk)
  .put(updatePerkValidationRules, updatePerk)
  .delete(deletePerk);

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

router.post('/notifications/send-email', anyUpload.any(), sendDirectEmail);
router.post('/notifications/process-scheduled', triggerScheduledEmailsProcess);

// Custom Templates CRUD
router.get('/notifications/templates', getTemplates);
router.post('/notifications/templates', createTemplate);
router.patch('/notifications/templates/:id', updateTemplate);
router.delete('/notifications/templates/:id', deleteTemplate);

// Auto Trigger Config
router.get('/notifications/triggers', getTriggers);
router.patch('/notifications/triggers/:id/toggle', toggleTrigger);

// History Logs & Dashboard Metrics
router.get('/notifications/logs', getLogs);
router.get('/notifications/metrics', getMetrics);

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
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">Kross Film Productions Ltd. (KFPL)</p>
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
router.get('/settings', getSettings);
router.patch('/settings/2fa', toggle2FA);
router.patch('/settings/client-2fa', toggleClient2FA);
router.patch('/settings/agent-2fa', toggleAgent2FA);

// 11. Settings — Change Email Address (OTP-based)
router.post('/settings/change-email/send-otp', sendChangeEmailOtpRules, sendChangeEmailOtpHandler);
router.post('/settings/change-email/verify-otp', verifyChangeEmailOtpRules, verifyChangeEmailOtp);

// 12. Settings — Change Password (OTP-based)
router.post('/settings/change-password/send-otp', sendChangePasswordOtpRules, sendChangePasswordOtpHandler);
router.post('/settings/change-password/verify-otp', verifyChangePasswordOtpRules, verifyChangePasswordOtp);

// 13. Client Portal Management — Account listing, details, status
router.get('/client-portal', listClientAccounts);
router.get('/client-portal/:clientId', getClientAccountDetails);
router.patch('/client-portal/:clientId/status', updateClientStatusRules, updateClientStatus);

// 14. News & Media Articles Management
router.route('/articles')
  .get(getAllArticles)
  .post(memoryUpload.single('featuredImage'), createArticleValidationRules, createArticle);

router.route('/articles/:id')
  .get(getArticleById)
  .patch(memoryUpload.single('featuredImage'), updateArticleValidationRules, updateArticle)
  .delete(deleteArticle);

// 15. Portfolio Management (Project Catalog)
router.route('/projects')
  .get(getAllProjects)
  .post(memoryUpload.single('bannerImage'), createProjectValidationRules, createProject);

router.route('/projects/:id')
  .get(getProjectById)
  .patch(memoryUpload.single('bannerImage'), updateProjectValidationRules, updateProject)
  .delete(deleteProject);

router.route('/projects/:id/media')
  .post(memoryUpload.any(), uploadProjectMedia)
  .delete(deleteProjectMedia);

// 15b. Project Update History & Status Updates (Investment Status views)
const { publishProjectUpdate, getUpdateHistory, uploadUpdateAttachment } = require('../../controllers/super-admin/project-update.controller');
const { publishUpdateValidationRules } = require('../../validations/super-admin/project-update.validation');

router.get('/projects/updates/history', getUpdateHistory);
router.post('/projects/:id/updates', publishUpdateValidationRules, publishProjectUpdate);
router.post('/projects/:id/updates/attachments', memoryUpload.single('file'), uploadUpdateAttachment);

// 16. Segment & Status Management
router.route('/segments')
  .get(getAllSegments)
  .post(createSegmentValidationRules, createSegment);

router.route('/segments/:id')
  .patch(updateSegmentValidationRules, updateSegment)
  .delete(deleteSegment);

// 17. Dividend Pool & Allotment Ledger Management
router.get('/dividends/stats', getDividendStats);
router.get('/dividends/allotments', getAllAllotments);
router.post('/dividends/pools', createPoolValidationRules, createPool);
router.post('/dividends/allotments', createAllotmentValidationRules, createAllotment);

// 18. Rewards & Withdrawal Configuration
router.route('/rewards-config')
  .get(getRewardsConfig)
  .patch(updateRewardsConfigRules, updateRewardsConfig);

// Configure Multer fields parsing for performance reward media uploads
const rewardMediaUpload = rewardsUpload.fields([
  { name: 'rewardImage', maxCount: 1 },
  { name: 'rewardVideo', maxCount: 1 },
]);

// 19. Performance Reward Catalog Management
router.route('/rewards')
  .get(getAllPerformanceRewards)
  .post(rewardMediaUpload, createRewardValidationRules, createPerformanceReward);

router.route('/rewards/:id')
  .get(getPerformanceRewardById)
  .patch(rewardMediaUpload, updateRewardValidationRules, updatePerformanceReward)
  .delete(deletePerformanceReward);

// 20. Commission Slab & Override Configurations
router.route('/commission-slabs')
  .get(getAllSlabs)
  .post(slabValidationRules, createSlab);

router.route('/commission-slabs/overrides')
  .get(getAllOverrides)
  .post(overrideValidationRules, createOverride);

router.post('/commission-slabs/calculate', calculateCommission);

router.route('/commission-slabs/overrides/:id')
  .patch(updateOverrideValidationRules, updateOverride)
  .delete(deleteOverride);

router.route('/commission-slabs/:id')
  .patch(updateSlabValidationRules, updateSlab)
  .delete(deleteSlab);

// 21. Service Requests Management (Super Admin view)
const { updateRequestStatusRules } = require('../../validations/super-admin/service-request.validation');
const { getAllServiceRequests, getServiceRequestById, updateServiceRequestStatus, deleteServiceRequest } = require('../../controllers/super-admin/service-request.controller');

router.route('/service-requests')
  .get(getAllServiceRequests);

router.route('/service-requests/:id/status')
  .patch(updateRequestStatusRules, updateServiceRequestStatus);

router.route('/service-requests/:id')
  .get(getServiceRequestById)
  .delete(deleteServiceRequest);

// 22. FAQ Management
const { createFaq, getAllFaqs, updateFaq, deleteFaq } = require('../../controllers/super-admin/faq.controller');

router.route('/faqs')
  .get(getAllFaqs)
  .post(createFaq);

router.route('/faqs/:id')
  .patch(updateFaq)
  .delete(deleteFaq);


module.exports = router;
