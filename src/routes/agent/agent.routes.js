const express = require('express');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const { ROLES } = require('../../constants/roles');
const { memoryUpload } = require('../../middlewares/upload.middleware');

const {
  login,
  verify2FA,
  logout,
  getMe,
  registerAgent,
  toggleAgentSelf2FA,
} = require('../../controllers/agent/agent-auth.controller');


const {
  getAgentDashboard,
  getAgentClients,
  getAgentCommissions,
  getAgentProfile,
  updateAgentProfile,
  removeAgentAvatar,
  getAgentDocuments,
  uploadAgentAgreementDocument,
  getAgentClientById,
} = require('../../controllers/agent/agent-dashboard.controller');

const {
  getAgentPerformanceRewards,
  claimReward,
} = require('../../controllers/super-admin/performance-reward.controller');

const {
  getPublishedArticles,
  getPublishedArticleById,
  subscribeToNewsletter,
} = require('../../controllers/super-admin/article.controller');

const router = express.Router();

// --- PUBLIC AGENT PORTAL AUTHENTICATION FLOW ---
const agentRegisterUpload = memoryUpload.fields([
  { name: 'panDocument', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'idProofDocument', maxCount: 1 },
  { name: 'idProof', maxCount: 1 },
  { name: 'idProofBackDocument', maxCount: 1 },
  { name: 'idProofBack', maxCount: 1 },
  { name: 'aadhaarBackDocument', maxCount: 1 },
  { name: 'bankProofDocument', maxCount: 1 },
  { name: 'bankStatementProof', maxCount: 1 },
  { name: 'bankProof', maxCount: 1 },
  { name: 'nomineeProofDocument', maxCount: 1 },
  { name: 'nomineeProof', maxCount: 1 },
]);

router.post('/auth/register', agentRegisterUpload, registerAgent);
router.post('/auth/login', login);
router.post('/auth/verify-2fa', verify2FA);
router.post('/auth/logout', logout);

// --- PROTECTED AGENT PORTAL ENDPOINTS (Restricted to agent role only) ---
router.use(protect);
router.use(restrictTo(ROLES.AGENT));

// 1. Session Information
router.get('/auth/me', getMe);
router.patch('/profile/2fa', toggleAgentSelf2FA);


// 2. Agent Dashboard Stats
router.get('/dashboard', getAgentDashboard);

const {
  getClientInvestmentsTab,
  getClientRoiTab,
  getClientDocumentsTab,
  getClientPerksTab,
} = require('../../controllers/super-admin/client-financials.controller');

const { createClient } = require('../../controllers/super-admin/client-management.controller');
const { createClientValidationRules } = require('../../validations/client/client.validation');

const memoryClientOnboardingUpload = memoryUpload.fields([
  { name: 'panDocument', maxCount: 1 },
  { name: 'aadhaarDocument', maxCount: 1 },
  { name: 'aadhaarBackDocument', maxCount: 1 },
  { name: 'bankProofDocument', maxCount: 1 },
  { name: 'agreementDocument', maxCount: 1 },
  { name: 'nomineeProofDocument', maxCount: 1 },
]);

// 3. Agent Client List & Client Sub-tabs
router.route('/clients')
  .get(getAgentClients)
  .post(memoryClientOnboardingUpload, createClientValidationRules, createClient);

router.get('/clients/:id', getAgentClientById);
router.get('/clients/:id/investments', getClientInvestmentsTab);
router.get('/clients/:id/roi/payouts', getClientRoiTab);
router.get('/clients/:id/payouts', getClientRoiTab);
router.get('/clients/:id/roi', getClientRoiTab);
router.get('/clients/:id/documents', getClientDocumentsTab);
router.get('/clients/:id/perks', getClientPerksTab);

const { getAllSlabs } = require('../../controllers/super-admin/commission-slab.controller');

// 4. Agent Commission History
router.get('/commissions', getAgentCommissions);
router.get('/commission-slabs', getAllSlabs);

// 5. Agent Profile Info
router.get('/profile', getAgentProfile);
router.patch('/profile', updateAgentProfile);
router.delete('/profile/avatar', removeAgentAvatar);

// 6. Agent Documents Retrieval & Uploads
const { uploadKycDocument } = require('../../controllers/agent/agent-dashboard.controller');
router.get('/documents', getAgentDocuments);
router.post('/documents/agreement', memoryUpload.any(), uploadAgentAgreementDocument);
router.post('/documents/kyc', memoryUpload.any(), uploadKycDocument);

// 7. Settings - Change Password Flow (OTP verified)
const {
  sendChangePasswordOtpRules,
  verifyChangePasswordOtpRules,
} = require('../../validations/super-admin/change-password.validation');

const {
  sendChangePasswordOtpHandler,
  verifyChangePasswordOtp,
} = require('../../controllers/super-admin/change-password.controller');

router.post('/settings/change-password/send-otp', sendChangePasswordOtpRules, sendChangePasswordOtpHandler);
router.post('/settings/change-password/verify-otp', verifyChangePasswordOtpRules, verifyChangePasswordOtp);

// 8. News & Articles (Reader)
router.get('/articles', getPublishedArticles);
router.get('/articles/:id', getPublishedArticleById);
router.get('/news/:id', getPublishedArticleById);
router.post('/articles/subscribe', subscribeToNewsletter);

// 9. Transaction requests (deposit / withdrawal on behalf of assigned client)
const {
  requestAgentTransaction,
  getAgentTransactions,
  requestAgentWithdrawal,
  getAgentWithdrawals,
} = require('../../controllers/agent/transaction.controller');

router.route('/transactions')
  .get(getAgentTransactions)
  .post(requestAgentTransaction);

router.route('/withdrawal')
  .get(getAgentWithdrawals)
  .post(requestAgentWithdrawal);
router.route('/withdrawals')
  .get(getAgentWithdrawals)
  .post(requestAgentWithdrawal);

// 10. Agent direct messaging/notifications
const { sendAgentNotificationEmail, getAgentNotifications, markAgentNotificationRead, deleteAgentNotification } = require('../../controllers/agent/notification.controller');
router.get('/notifications', getAgentNotifications);
router.patch('/notifications/:id/read', markAgentNotificationRead);
router.delete('/notifications/:id', deleteAgentNotification);
router.post('/notifications/send-email', sendAgentNotificationEmail);


// 11. Performance Rewards Catalog (Agent view)
router.get('/rewards', getAgentPerformanceRewards);
router.post('/rewards/claim', claimReward);

// 12. Service Requests (Agent view)
const { createRequestRules } = require('../../validations/super-admin/service-request.validation');
const { createServiceRequest, getMyServiceRequests } = require('../../controllers/super-admin/service-request.controller');

router.route('/service-requests')
  .get(getMyServiceRequests)
  .post(memoryUpload.single('attachment'), createRequestRules, createServiceRequest);

// 13. FAQ Management
const { getAgentFaqs } = require('../../controllers/agent/agent-faq.controller');
router.get('/faqs', getAgentFaqs);

module.exports = router;
