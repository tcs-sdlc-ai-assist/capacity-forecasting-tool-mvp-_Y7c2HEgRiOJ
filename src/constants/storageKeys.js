export const STORAGE_PREFIX = 'cft.';

export const STORAGE_KEYS = Object.freeze({
  DEMO_USERS: `${STORAGE_PREFIX}demoUsers`,
  SESSION: `${STORAGE_PREFIX}session`,
  DATASET_METADATA: `${STORAGE_PREFIX}dataset.meta`,
  DATASET_CONTENT: `${STORAGE_PREFIX}dataset.content`,
  IMPORT_LAST_SUMMARY: `${STORAGE_PREFIX}import.lastSummary`,
  PERSISTENCE_STATUS: `${STORAGE_PREFIX}persistence.status`,
  NOTICES: `${STORAGE_PREFIX}notices`,
  FILTERS: `${STORAGE_PREFIX}filters`,
  THRESHOLDS: `${STORAGE_PREFIX}thresholds`,
  SCENARIOS: `${STORAGE_PREFIX}scenarios`,
});

export const CFT_STORAGE_KEYS = Object.freeze(Object.values(STORAGE_KEYS));

export const isCftStorageKey = (key) => (
  typeof key === 'string' && key.startsWith(STORAGE_PREFIX)
);

export default STORAGE_KEYS;