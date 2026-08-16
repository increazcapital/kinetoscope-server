const { decrypt } = require('./crypto');

const { ROLES } = require('../constants/roles');

/**
 * Mask Bank Account Number (e.g., ******1234)
 */
function maskAccountNumber(acc) {
  if (!acc) return '';
  const str = String(acc).trim();
  if (str.length <= 4) return '*'.repeat(str.length);
  return '*'.repeat(str.length - 4) + str.slice(-4);
}

/**
 * Mask PAN Number (e.g., ABXXXXXX1A)
 */
function maskPAN(pan) {
  if (!pan) return '';
  const str = String(pan).trim().toUpperCase();
  if (str.length !== 10) return 'XXXXX' + str.slice(-4);
  return str.slice(0, 2) + 'XXXXXX' + str.slice(-2);
}

/**
 * Mask Aadhaar / Passport Number (e.g., ********1234)
 */
function maskAadhaar(aadhaar) {
  if (!aadhaar) return '';
  const str = String(aadhaar).trim();
  if (str.length <= 4) return '*'.repeat(str.length);
  return '*'.repeat(str.length - 4) + str.slice(-4);
}

/**
 * Mask Phone Number (e.g., ******1234)
 */
function maskPhone(phone) {
  if (!phone) return '';
  const str = String(phone).trim();
  if (str.length <= 4) return '*'.repeat(str.length);
  return '*'.repeat(str.length - 4) + str.slice(-4);
}

/**
 * Mask Email Address (e.g., m***d@example.com)
 */
function maskEmail(email) {
  if (!email) return '';
  const str = String(email).trim().toLowerCase();
  const parts = str.split('@');
  if (parts.length !== 2) return '***@***.com';
  const [username, domain] = parts;
  if (username.length <= 2) return `${username[0]}*@${domain}`;
  return `${username[0]}${'*'.repeat(username.length - 2)}${username.slice(-1)}@${domain}`;
}

/**
 * Mask Address details
 */
function maskAddress(address) {
  if (!address) return '';
  return '*** Address Hidden ***';
}

/**
 * Mask Document Cloudinary URLs
 */
function maskDocumentUrl(url) {
  if (!url) return '';
  return '*** Document Hidden ***';
}

// Configured mapping of sensitive fields to their classification and masking functions
const SENSITIVE_FIELDS = {
  // Level 1: Highly Sensitive
  accountNumber: { level: 1, mask: maskAccountNumber },
  panNumber: { level: 1, mask: maskPAN },
  aadhaarNumber: { level: 1, mask: maskAadhaar },
  portalPassword: { level: 1, mask: () => '********' },
  password: { level: 1, mask: () => '********' },
  otpHash: { level: 1, mask: () => '********' },

  // Level 2: Moderately Sensitive
  phone: { level: 2, mask: maskPhone },
  email: { level: 2, mask: maskEmail },
  address: { level: 2, mask: maskAddress },
  dob: { level: 2, mask: () => '****-**-**' },
  emergencyContact: { level: 2, mask: maskPhone },
  nomineeName: { level: 2, mask: (val) => val ? val[0] + '*'.repeat(val.length - 1) : '' },
  nomineeRelation: { level: 2, mask: () => '***' },
  nomineePhone: { level: 2, mask: maskPhone },
  nomineeEmail: { level: 2, mask: maskEmail },
  panDocument: { level: 2, mask: maskDocumentUrl },
  aadhaarDocument: { level: 2, mask: maskDocumentUrl },
  idProofDocument: { level: 2, mask: maskDocumentUrl },
  bankProofDocument: { level: 2, mask: maskDocumentUrl },
  agreementDocument: { level: 2, mask: maskDocumentUrl },
  nomineeProofDocument: { level: 2, mask: maskDocumentUrl },
  attachment: { level: 2, mask: maskDocumentUrl },

  // Level 3: Internal Metadata / Super Admin Only Remarks
  adminRemarks: { level: 3 }
};

/**
 * Recursively checks if an object belongs to the authenticated user.
 */
function checkIsOwner(obj, user) {
  if (!user) return false;
  
  const userIdStr = String(user.id || user._id || '');
  if (!userIdStr) return false;

  // 1) Direct User matching
  if (obj._id && String(obj._id) === userIdStr) {
    return true;
  }

  // 2) Profile or relation matching via userId / clientId / agentId / createdBy
  const matchKeys = ['userId', 'clientId', 'agentId', 'createdBy'];
  for (const key of matchKeys) {
    if (obj[key]) {
      const val = obj[key];
      if (typeof val === 'object' && val._id) {
        if (String(val._id) === userIdStr) return true;
      } else if (String(val) === userIdStr) {
        return true;
      }
    }
  }

  // 3) Client/Agent Code matching (for models storing code directly)
  if (user.clientCode) {
    const userCode = String(user.clientCode).toUpperCase();
    
    if (obj.clientCode && String(obj.clientCode).toUpperCase() === userCode) {
      return true;
    }
    if (obj.recipientId && String(obj.recipientId).toUpperCase() === userCode) {
      return true;
    }
    if (obj.recipientCode && String(obj.recipientCode).toUpperCase() === userCode) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively scans and sanitizes response payloads.
 * @param {*} data - The JSON response payload
 * @param {object} user - The req.user context
 * @returns {*} Sanitized payload
 */
function maskResponseData(data, user) {
  if (data === null || data === undefined) return data;

  // Recurse into arrays
  if (Array.isArray(data)) {
    return data.map(item => maskResponseData(item, user));
  }

  // If it's a date or other special non-plain objects, return as-is
  if (data instanceof Date) return data;

  // Traverse objects
  if (typeof data === 'object') {
    // If it's a Mongoose document, convert to plain object
    let obj = data;
    if (typeof data.toObject === 'function') {
      obj = data.toObject({ getters: true });
    }

    const isOwner = checkIsOwner(obj, user);
    const role = user ? user.role : null;
    const result = {};

    for (const key of Object.keys(obj)) {
      let val = obj[key];

      // Auto-decrypt ciphertext if present (e.g. when database queries use .lean())
      if (typeof val === 'string' && val.includes(':')) {
        val = decrypt(val);
      }

      if (SENSITIVE_FIELDS[key] !== undefined) {
        const rule = SENSITIVE_FIELDS[key];

        if (role === ROLES.SUPER_ADMIN) {
          // Super Admin gets complete visibility
          result[key] = val;
        } else if (role === ROLES.AGENT) {
          // Agent gets complete visibility of all fields (same as Super Admin)
          result[key] = val;
        } else if (role === ROLES.CLIENT) {
          // Client:
          // Level 1 & 2: Full Access to own data, Masked for others
          // Level 3: Completely hidden/removed
          if (rule.level === 3) {
            continue;
          }
          if (isOwner) {
            result[key] = val;
          } else {
            result[key] = rule.mask ? rule.mask(val) : '***';
          }
        } else {
          // Unauthenticated/Public views: Mask Level 1 & 2, Hide Level 3
          if (rule.level === 3) {
            continue;
          }
          result[key] = rule.mask ? rule.mask(val) : '***';
        }
      } else {
        // Regular non-sensitive field: recurse
        result[key] = maskResponseData(val, user);
      }
    }
    return result;
  }

  return data;
}

module.exports = {
  maskResponseData,
};
