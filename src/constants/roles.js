const ROLES = {
  SUPER_ADMIN: 'super-admin',
  SUB_ADMIN: 'sub-admin',
  CLIENT: 'client',
  AGENT: 'agent',
};

const ALL_ROLES = Object.values(ROLES);

module.exports = {
  ROLES,
  ALL_ROLES
};
