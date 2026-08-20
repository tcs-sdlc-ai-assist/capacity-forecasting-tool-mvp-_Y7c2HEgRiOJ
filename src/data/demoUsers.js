const DEMO_USER_RECORDS = [
  {
    username: 'planner',
    password: 'Planner@123',
    displayName: 'Capacity Planner',
  },
  {
    username: 'manager',
    password: 'Manager@123',
    displayName: 'Portfolio Manager',
  },
  {
    username: 'viewer',
    password: 'Viewer@123',
    displayName: 'Forecast Viewer',
  },
];

export const DEMO_USERS = Object.freeze(
  DEMO_USER_RECORDS.map((user) => Object.freeze({ ...user })),
);

/**
 * Returns independent copies of the synthetic demo user records.
 *
 * @returns {Array<{username: string, password: string, displayName: string}>}
 * Demo users safe for callers to modify without mutating the seed data.
 */
export const getDemoUsers = () => (
  DEMO_USERS.map((user) => ({ ...user }))
);

const DEMO_USER_PROFILE_RECORDS = {
  planner: {
    role: 'Planner',
    email: 'planner@cft.demo',
    description: 'Creates capacity plans, imports datasets, and manages utilization thresholds.',
  },
  manager: {
    role: 'Manager',
    email: 'manager@cft.demo',
    description: 'Reviews portfolio capacity, compares scenarios, and tracks planning outcomes.',
  },
  viewer: {
    role: 'Viewer',
    email: 'viewer@cft.demo',
    description: 'Views the capacity forecast and scenario comparisons in read-only demo mode.',
  },
};

export const DEMO_USER_PROFILES = Object.freeze(
  Object.fromEntries(
    Object.entries(DEMO_USER_PROFILE_RECORDS).map(([username, profile]) => (
      [username, Object.freeze({ username, ...profile })]
    )),
  ),
);

const DEFAULT_USER_PROFILE = Object.freeze({
  role: 'Demo user',
  email: '',
  description: 'Signed-in demo account for this browser.',
});

/**
 * Returns profile details for a demo username.
 *
 * @param {string} username Demo username.
 * @returns {{
 *   username?: string,
 *   role: string,
 *   email: string,
 *   description: string
 * }} Profile details for the account.
 */
export const getDemoUserProfile = (username) => {
  const normalizedUsername = typeof username === 'string'
    ? username.trim().toLowerCase()
    : '';

  return DEMO_USER_PROFILES[normalizedUsername] ?? DEFAULT_USER_PROFILE;
};

export default DEMO_USERS;