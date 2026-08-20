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

export default DEMO_USERS;