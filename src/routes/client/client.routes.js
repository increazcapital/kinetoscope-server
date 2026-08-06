const express = require('express');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const { ROLES } = require('../../constants/roles');
const { memoryUpload } = require('../../middlewares/upload.middleware');

const {
  login,
  verify2FA,
  logout,
  getMe,
  registerClient,
  toggleClientSelf2FA,
} = require('../../controllers/client/client-auth.controller');


const {
  getClientDashboard,
  getClientInvestments,
  getClientInvestmentById,
  getClientProfile,
  updateClientProfile,
  getClientDocuments,
  getClientPayouts,
  getClientWealthAdvisor,
} = require('../../controllers/client/client-dashboard.controller');

const {
  getPublishedArticles,
  getPublishedArticleById,
  subscribeToNewsletter,
} = require('../../controllers/super-admin/article.controller');

const {
  getMyPerks,
} = require('../../controllers/super-admin/perk.controller');

const {
  getClientProjects,
} = require('../../controllers/super-admin/project.controller');

const {
  getClientAllotments,
  getClientDividendStats,
} = require('../../controllers/super-admin/dividend.controller');

const {
  updateClientProfileRules,
} = require('../../validations/client/client.validation');

const {
  sendChangePasswordOtpRules,
  verifyChangePasswordOtpRules,
} = require('../../validations/super-admin/change-password.validation');

const {
  sendChangePasswordOtpHandler,
  verifyChangePasswordOtp,
} = require('../../controllers/super-admin/change-password.controller');

const router = express.Router();

// --- PUBLIC CLIENT PORTAL AUTHENTICATION FLOW ---
const clientRegisterUpload = memoryUpload.fields([
  { name: 'panDocument', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'aadhaarDocument', maxCount: 1 },
  { name: 'aadhaarCard', maxCount: 1 },
  { name: 'bankProofDocument', maxCount: 1 },
  { name: 'bankStatementProof', maxCount: 1 },
  { name: 'bankProof', maxCount: 1 },
  { name: 'nomineeProofDocument', maxCount: 1 },
  { name: 'nomineeProof', maxCount: 1 },
]);

router.post('/auth/register', clientRegisterUpload, registerClient);
router.post('/auth/login', login);
router.post('/auth/verify-2fa', verify2FA);
router.post('/auth/logout', logout);

// --- PROTECTED CLIENT PORTAL ENDPOINTS (Restricted to client role only) ---
router.use(protect);
router.use(restrictTo(ROLES.CLIENT));

// 1. Session Information
router.get('/auth/me', getMe);
router.patch('/profile/2fa', toggleClientSelf2FA);


// 2. Client Dashboard Stats
router.get('/dashboard', getClientDashboard);
router.get('/wealth-advisor', getClientWealthAdvisor);

// 3. Client Investment Management
router.get('/investments', getClientInvestments);
router.get('/investments/:id', getClientInvestmentById);
router.get('/payouts', getClientPayouts);

// 4. Client Profile Info
router.get('/profile', getClientProfile);
router.patch('/profile', updateClientProfileRules, updateClientProfile);

// 5. Client Documents Retrieval & Uploads
const { uploadAgreementDocument } = require('../../controllers/client/client-dashboard.controller');
router.get('/documents', getClientDocuments);
router.post('/documents/agreement', memoryUpload.single('file'), uploadAgreementDocument);

// 6. Settings - Change Password Flow (OTP verified)
router.post('/settings/change-password/send-otp', sendChangePasswordOtpRules, sendChangePasswordOtpHandler);
router.post('/settings/change-password/verify-otp', verifyChangePasswordOtpRules, verifyChangePasswordOtp);

// 7. News & Articles (Reader)
router.get('/articles', getPublishedArticles);
router.get('/articles/:id', getPublishedArticleById);
router.get('/news/:id', getPublishedArticleById);
router.post('/articles/subscribe', subscribeToNewsletter);

// 8. Assigned Perks (Client view)
router.get('/perks', getMyPerks);

// 9. Portfolio Projects & Segments (Client view)
const { getUpdateHistory } = require('../../controllers/super-admin/project-update.controller');
const { getAllSegments } = require('../../controllers/super-admin/segment.controller');
const { applyForProjectInvestment } = require('../../controllers/super-admin/project.controller');
router.get('/projects', getClientProjects);
router.post('/projects/:id/apply', memoryUpload.single('file'), applyForProjectInvestment);
router.get('/segments', getAllSegments);
router.get('/projects/updates/history', getUpdateHistory);

// 10. Dividends & Allotment Ledger (Client view)
router.get('/dividends', getClientAllotments);
router.get('/dividends/stats', getClientDividendStats);
router.get('/stats', getClientDashboard);

// 11. Transaction requests (deposit / withdrawal)
const {
  requestTransaction,
  getClientTransactions,
} = require('../../controllers/client/transaction.controller');

router.route('/transactions')
  .get(getClientTransactions)
  .post(memoryUpload.single('file'), requestTransaction);

// 12. Client direct messaging/notifications
const { sendClientNotificationEmail, getClientNotifications } = require('../../controllers/client/notification.controller');
router.get('/notifications', getClientNotifications);
router.post('/notifications/send-email', sendClientNotificationEmail);


// 13. Service Requests (Client view)
const { createRequestRules } = require('../../validations/super-admin/service-request.validation');
const { createServiceRequest, getMyServiceRequests } = require('../../controllers/super-admin/service-request.controller');

router.route('/service-requests')
  .get(getMyServiceRequests)
  .post(memoryUpload.single('attachment'), createRequestRules, createServiceRequest);

// 14. FAQ Management
const { getClientFaqs } = require('../../controllers/client/client-faq.controller');
router.get('/faqs', getClientFaqs);

// 15. Client Perks Management
router.get('/perks/my-perks', getMyPerks);

module.exports = router;
