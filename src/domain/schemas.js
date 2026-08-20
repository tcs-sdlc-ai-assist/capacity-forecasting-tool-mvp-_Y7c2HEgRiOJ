import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';
import {
  DEFAULT_THRESHOLDS,
  THRESHOLD_LIMITS,
} from '../constants/domainConstants.js';

export const PERSISTENCE_MODES = Object.freeze({
  LOCAL_STORAGE: 'localStorage',
  MEMORY: 'memory',
});

export const DATASET_SOURCE_TYPES = Object.freeze([
  'mock',
  'import',
  'recovered-mock',
]);

export const CONFIDENCE_LEVELS = Object.freeze([
  'High',
  'Medium',
  'Low',
  'Unknown',
]);

export const NOTICE_SEVERITIES = Object.freeze([
  'info',
  'warning',
  'error',
  'success',
]);

const DIMENSION_KEYS = Object.freeze([
  'planningLevels',
  'programs',
  'owners',
  'teams',
  'arts',
  'statuses',
  'workTypes',
]);

const DEFAULT_RECORD_COUNTS = Object.freeze({
  workItems: 0,
  capacityRecords: 0,
  warnings: 0,
  rejected: 0,
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const isString = (value) => typeof value === 'string';

const isNonEmptyString = (value) => (
  isString(value) && value.trim().length > 0
);

const isBoundedString = (value, minimum, maximum) => (
  isString(value)
  && value.length >= minimum
  && value.length <= maximum
);

const isFiniteNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value)
);

const isNonNegativeNumber = (value) => (
  isFiniteNumber(value) && value >= 0
);

const isNonNegativeInteger = (value) => (
  Number.isInteger(value) && value >= 0
);

const isPersistenceMode = (value) => (
  Object.values(PERSISTENCE_MODES).includes(value)
);

const normalizeString = (value, fallback = '') => (
  typeof value === 'string' ? value.trim() : fallback
);

const normalizeNullableString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = normalizeString(value);
  return normalized || null;
};

const normalizeNumber = (value, fallback = 0) => {
  if (typeof value === 'string' && value.trim() === '') {
    return fallback;
  }

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : Number.NaN;
};

const normalizeInteger = (value, fallback = 0) => {
  const normalized = normalizeNumber(value, fallback);
  return Number.isInteger(normalized) ? normalized : Number.NaN;
};

const normalizeStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((item) => normalizeString(item))
      .filter(Boolean),
  )];
};

const normalizeDateTime = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return normalizeString(value);
};

const isIsoDate = (value) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
};

const isIsoDateTime = (value) => {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

const isNullableIsoDate = (value) => (
  value === null || (isString(value) && isIsoDate(value))
);

const hasUniqueStrings = (value) => (
  Array.isArray(value)
  && value.every(isString)
  && new Set(value).size === value.length
);

const isJsonSafe = (value, visited = new Set()) => {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || isFiniteNumber(value)
  ) {
    return true;
  }

  if (typeof value !== 'object' || visited.has(value)) {
    return false;
  }

  visited.add(value);

  const valid = Array.isArray(value)
    ? value.every((item) => isJsonSafe(item, visited))
    : Object.values(value).every((item) => isJsonSafe(item, visited));

  visited.delete(value);
  return valid;
};

const normalizeJsonValue = (value, fallback) => (
  isJsonSafe(value) ? JSON.parse(JSON.stringify(value)) : fallback
);

const schemaError = (schemaName) => (
  new TypeError(`Invalid ${schemaName} schema.`)
);

const assertSchema = (value, guard, schemaName) => {
  if (!guard(value)) {
    throw schemaError(schemaName);
  }

  return value;
};

const createValidationResult = (value, guard, schemaName) => {
  if (guard(value)) {
    return {
      ok: true,
      data: value,
      error: null,
    };
  }

  return {
    ok: false,
    data: null,
    error: {
      code: 'INVALID_SCHEMA',
      message: `Invalid ${schemaName} schema.`,
      schema: schemaName,
    },
  };
};

const canonicalSchemaVersion = (value) => (
  normalizeString(value, SUPPORTED_SCHEMA_VERSION)
);

const isCurrentSchemaVersion = (value) => (
  value === SUPPORTED_SCHEMA_VERSION
);

const normalizeAllocations = (value) => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, allocation]) => [
        normalizeString(key),
        normalizeNumber(allocation),
      ])
      .filter(([key]) => Boolean(key)),
  );
};

const isAllocations = (value) => (
  isRecord(value)
  && Object.keys(value).length > 0
  && Object.entries(value).every(([key, allocation]) => (
    isNonEmptyString(key) && isNonNegativeNumber(allocation)
  ))
);

/**
 * Determines whether a value is a canonical normalized work item.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the work-item contract.
 */
export const isWorkItem = (value) => (
  isRecord(value)
  && isBoundedString(value.recordId, 1, 128)
  && isBoundedString(value.planningLevel, 1, 128)
  && isBoundedString(value.program, 1, 256)
  && isBoundedString(value.epic, 0, 256)
  && isBoundedString(value.itemId, 0, 128)
  && isBoundedString(value.feature, 1, 512)
  && isBoundedString(value.featureWorkType, 1, 128)
  && isBoundedString(value.owner, 0, 128)
  && isNonNegativeNumber(value.estimatedPoints)
  && Array.isArray(value.team)
  && value.team.length > 0
  && value.team.every((team) => isBoundedString(team, 1, 128))
  && new Set(value.team).size === value.team.length
  && isBoundedString(value.art, 0, 128)
  && isBoundedString(value.status, 0, 64)
  && isNullableIsoDate(value.startDate)
  && isNullableIsoDate(value.endDate)
  && isAllocations(value.allocations)
);

/**
 * Creates a canonical normalized work item.
 *
 * @param {object} input Work-item fields.
 * @returns {object} Canonical work item.
 */
export const createWorkItem = (input = {}) => {
  const workItem = {
    recordId: normalizeString(input.recordId),
    planningLevel: normalizeString(input.planningLevel),
    program: normalizeString(input.program),
    epic: normalizeString(input.epic),
    itemId: normalizeString(input.itemId),
    feature: normalizeString(input.feature),
    featureWorkType: normalizeString(input.featureWorkType),
    owner: normalizeString(input.owner),
    estimatedPoints: normalizeNumber(input.estimatedPoints),
    team: normalizeStringArray(input.team),
    art: normalizeString(input.art),
    status: normalizeString(input.status),
    startDate: normalizeNullableString(input.startDate),
    endDate: normalizeNullableString(input.endDate),
    allocations: normalizeAllocations(input.allocations),
  };

  return assertSchema(workItem, isWorkItem, 'work item');
};

export const validateWorkItem = (value) => (
  createValidationResult(value, isWorkItem, 'work item')
);

/**
 * Determines whether a value is a capacity record.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the capacity contract.
 */
export const isCapacityRecord = (value) => (
  isRecord(value)
  && isBoundedString(value.planningLevel, 1, 128)
  && isBoundedString(value.team, 1, 128)
  && isNonNegativeNumber(value.capacityPoints)
  && isFiniteNumber(value.reservedSupportPercent)
  && value.reservedSupportPercent >= 0
  && value.reservedSupportPercent <= 100
  && isNonNegativeNumber(value.ptoImpactPoints)
  && isNonNegativeNumber(value.holidayImpactPoints)
  && CONFIDENCE_LEVELS.includes(value.confidence)
);

/**
 * Creates a canonical capacity record.
 *
 * @param {object} input Capacity fields.
 * @returns {object} Canonical capacity record.
 */
export const createCapacityRecord = (input = {}) => {
  const capacityRecord = {
    planningLevel: normalizeString(input.planningLevel),
    team: normalizeString(input.team),
    capacityPoints: normalizeNumber(input.capacityPoints),
    reservedSupportPercent: normalizeNumber(
      input.reservedSupportPercent,
      0,
    ),
    ptoImpactPoints: normalizeNumber(input.ptoImpactPoints, 0),
    holidayImpactPoints: normalizeNumber(input.holidayImpactPoints, 0),
    confidence: normalizeString(input.confidence, 'Unknown'),
  };

  return assertSchema(
    capacityRecord,
    isCapacityRecord,
    'capacity record',
  );
};

export const createCapacity = createCapacityRecord;
export const isCapacity = isCapacityRecord;

export const validateCapacityRecord = (value) => (
  createValidationResult(value, isCapacityRecord, 'capacity record')
);

const isRecordCounts = (value) => (
  isRecord(value)
  && isNonNegativeInteger(value.workItems)
  && isNonNegativeInteger(value.capacityRecords)
  && isNonNegativeInteger(value.warnings)
  && isNonNegativeInteger(value.rejected)
);

const createRecordCounts = (input = {}) => ({
  workItems: normalizeInteger(
    input.workItems,
    DEFAULT_RECORD_COUNTS.workItems,
  ),
  capacityRecords: normalizeInteger(
    input.capacityRecords,
    DEFAULT_RECORD_COUNTS.capacityRecords,
  ),
  warnings: normalizeInteger(
    input.warnings,
    DEFAULT_RECORD_COUNTS.warnings,
  ),
  rejected: normalizeInteger(
    input.rejected,
    DEFAULT_RECORD_COUNTS.rejected,
  ),
});

/**
 * Determines whether a value is dataset metadata.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the metadata contract.
 */
export const isDatasetMetadata = (value) => (
  isRecord(value)
  && isCurrentSchemaVersion(value.schemaVersion)
  && isBoundedString(value.datasetId, 1, 128)
  && isBoundedString(value.name, 1, 256)
  && DATASET_SOURCE_TYPES.includes(value.sourceType)
  && isIsoDateTime(value.importedAt)
  && (value.sourceUpdatedAt === null || isIsoDateTime(value.sourceUpdatedAt))
  && isRecordCounts(value.recordCounts)
  && isPersistenceMode(value.persistenceMode)
);

/**
 * Creates canonical dataset metadata.
 *
 * @param {object} input Metadata fields.
 * @returns {object} Canonical dataset metadata.
 */
export const createDatasetMetadata = (input = {}) => {
  const metadata = {
    schemaVersion: canonicalSchemaVersion(input.schemaVersion),
    datasetId: normalizeString(input.datasetId),
    name: normalizeString(input.name),
    sourceType: normalizeString(input.sourceType, 'import'),
    importedAt: normalizeDateTime(input.importedAt),
    sourceUpdatedAt: normalizeDateTime(input.sourceUpdatedAt),
    recordCounts: createRecordCounts(input.recordCounts),
    persistenceMode: normalizeString(
      input.persistenceMode,
      PERSISTENCE_MODES.LOCAL_STORAGE,
    ),
  };

  return assertSchema(metadata, isDatasetMetadata, 'dataset metadata');
};

export const validateDatasetMetadata = (value) => (
  createValidationResult(value, isDatasetMetadata, 'dataset metadata')
);

const deriveDimensions = (workItems) => ({
  planningLevels: normalizeStringArray(
    workItems.map((item) => item.planningLevel),
  ).sort(),
  programs: normalizeStringArray(
    workItems.map((item) => item.program),
  ).sort(),
  owners: normalizeStringArray(
    workItems.map((item) => item.owner),
  ).sort(),
  teams: normalizeStringArray(
    workItems.flatMap((item) => item.team),
  ).sort(),
  arts: normalizeStringArray(
    workItems.map((item) => item.art),
  ).sort(),
  statuses: normalizeStringArray(
    workItems.map((item) => item.status),
  ).sort(),
  workTypes: normalizeStringArray(
    workItems.map((item) => item.featureWorkType),
  ).sort(),
});

const createDimensions = (input, workItems) => {
  if (!isRecord(input)) {
    return deriveDimensions(workItems);
  }

  return Object.fromEntries(
    DIMENSION_KEYS.map((key) => [
      key,
      normalizeStringArray(input[key]),
    ]),
  );
};

const isDimensions = (value) => (
  isRecord(value)
  && DIMENSION_KEYS.every((key) => hasUniqueStrings(value[key]))
);

/**
 * Determines whether a value is a normalized dataset envelope.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the dataset contract.
 */
export const isNormalizedDataset = (value) => (
  isRecord(value)
  && isCurrentSchemaVersion(value.schemaVersion)
  && Array.isArray(value.workItems)
  && value.workItems.every(isWorkItem)
  && Array.isArray(value.capacityRecords)
  && value.capacityRecords.every(isCapacityRecord)
  && isDimensions(value.dimensions)
);

/**
 * Creates a canonical normalized dataset envelope.
 *
 * @param {object} input Dataset fields.
 * @returns {object} Canonical normalized dataset.
 */
export const createNormalizedDataset = (input = {}) => {
  const workItems = Array.isArray(input.workItems)
    ? input.workItems.map(createWorkItem)
    : [];
  const capacityRecords = Array.isArray(input.capacityRecords)
    ? input.capacityRecords.map(createCapacityRecord)
    : [];

  const dataset = {
    schemaVersion: canonicalSchemaVersion(input.schemaVersion),
    workItems,
    capacityRecords,
    dimensions: createDimensions(input.dimensions, workItems),
  };

  return assertSchema(dataset, isNormalizedDataset, 'normalized dataset');
};

export const createDataset = createNormalizedDataset;
export const isDataset = isNormalizedDataset;

export const validateNormalizedDataset = (value) => (
  createValidationResult(value, isNormalizedDataset, 'normalized dataset')
);

/**
 * Determines whether a value is an active session envelope.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the session contract.
 */
export const isSession = (value) => (
  isRecord(value)
  && isCurrentSchemaVersion(value.schemaVersion)
  && isBoundedString(value.sessionId, 8, 128)
  && isBoundedString(value.username, 1, 64)
  && isBoundedString(value.displayName, 1, 128)
  && isIsoDateTime(value.issuedAt)
  && isIsoDateTime(value.expiresAt)
  && Date.parse(value.expiresAt) > Date.parse(value.issuedAt)
  && value.authMode === 'demo-local'
);

/**
 * Creates a canonical session envelope.
 *
 * @param {object} input Session fields.
 * @returns {object} Canonical session.
 */
export const createSession = (input = {}) => {
  const session = {
    schemaVersion: canonicalSchemaVersion(input.schemaVersion),
    sessionId: normalizeString(input.sessionId),
    username: normalizeString(input.username),
    displayName: normalizeString(input.displayName),
    issuedAt: normalizeDateTime(input.issuedAt),
    expiresAt: normalizeDateTime(input.expiresAt),
    authMode: normalizeString(input.authMode, 'demo-local'),
  };

  return assertSchema(session, isSession, 'session');
};

export const validateSession = (value) => (
  createValidationResult(value, isSession, 'session')
);

/**
 * Determines whether threshold settings are valid.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the threshold contract.
 */
export const isThresholds = (value) => (
  isRecord(value)
  && isFiniteNumber(value.constrained)
  && isFiniteNumber(value.exceeded)
  && value.constrained >= THRESHOLD_LIMITS.minimum
  && value.exceeded <= THRESHOLD_LIMITS.maximum
  && value.constrained <= value.exceeded
);

/**
 * Creates canonical capacity thresholds.
 *
 * @param {object} input Threshold values.
 * @returns {object} Canonical thresholds.
 */
export const createThresholds = (input = {}) => {
  const thresholds = {
    constrained: normalizeNumber(
      input.constrained,
      DEFAULT_THRESHOLDS.constrained,
    ),
    exceeded: normalizeNumber(
      input.exceeded,
      DEFAULT_THRESHOLDS.exceeded,
    ),
  };

  return assertSchema(thresholds, isThresholds, 'thresholds');
};

export const validateThresholds = (value) => (
  createValidationResult(value, isThresholds, 'thresholds')
);

const isImportWarning = (value) => (
  isRecord(value)
  && isBoundedString(value.code, 1, 64)
  && isBoundedString(value.message, 1, 512)
  && (
    value.rowRefs === undefined
    || (
      Array.isArray(value.rowRefs)
      && value.rowRefs.every((rowRef) => (
        Number.isInteger(rowRef) && rowRef >= 1
      ))
    )
  )
);

const createImportWarning = (input = {}) => {
  const warning = {
    code: normalizeString(input.code),
    message: normalizeString(input.message),
  };

  if (input.rowRefs !== undefined) {
    warning.rowRefs = Array.isArray(input.rowRefs)
      ? [...new Set(input.rowRefs.map((rowRef) => normalizeInteger(rowRef)))]
      : [];
  }

  return assertSchema(warning, isImportWarning, 'import warning');
};

/**
 * Determines whether a value is an import summary envelope.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the summary contract.
 */
export const isImportSummary = (value) => (
  isRecord(value)
  && isCurrentSchemaVersion(value.schemaVersion)
  && isNonNegativeInteger(value.acceptedRows)
  && isNonNegativeInteger(value.rejectedRows)
  && isNonNegativeInteger(value.warningCount)
  && Array.isArray(value.warnings)
  && value.warnings.every(isImportWarning)
  && value.warningCount === value.warnings.length
  && isIsoDateTime(value.createdAt)
);

/**
 * Creates a canonical import summary envelope.
 *
 * @param {object} input Import summary fields.
 * @returns {object} Canonical import summary.
 */
export const createImportSummary = (input = {}) => {
  const warnings = Array.isArray(input.warnings)
    ? input.warnings.map(createImportWarning)
    : [];

  const summary = {
    schemaVersion: canonicalSchemaVersion(input.schemaVersion),
    acceptedRows: normalizeInteger(input.acceptedRows, 0),
    rejectedRows: normalizeInteger(input.rejectedRows, 0),
    warningCount: input.warningCount === undefined
      ? warnings.length
      : normalizeInteger(input.warningCount),
    warnings,
    createdAt: normalizeDateTime(input.createdAt),
  };

  return assertSchema(summary, isImportSummary, 'import summary');
};

export const validateImportSummary = (value) => (
  createValidationResult(value, isImportSummary, 'import summary')
);

const isPersistenceError = (value) => (
  value === null
  || (
    isRecord(value)
    && isBoundedString(value.code, 1, 64)
    && isBoundedString(value.message, 1, 256)
  )
);

/**
 * Determines whether a value is a persistence status envelope.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the status contract.
 */
export const isPersistenceStatus = (value) => (
  isRecord(value)
  && isCurrentSchemaVersion(value.schemaVersion)
  && isPersistenceMode(value.mode)
  && isIsoDateTime(value.updatedAt)
  && isPersistenceError(value.lastError)
);

/**
 * Creates a canonical persistence status envelope.
 *
 * @param {object} input Persistence fields.
 * @returns {object} Canonical persistence status.
 */
export const createPersistenceStatus = (input = {}) => {
  const rawError = input.lastError;
  const lastError = rawError === null || rawError === undefined
    ? null
    : {
      code: normalizeString(rawError.code),
      message: normalizeString(rawError.message),
    };

  const status = {
    schemaVersion: canonicalSchemaVersion(input.schemaVersion),
    mode: normalizeString(
      input.mode,
      PERSISTENCE_MODES.LOCAL_STORAGE,
    ),
    updatedAt: normalizeDateTime(input.updatedAt),
    lastError,
  };

  return assertSchema(
    status,
    isPersistenceStatus,
    'persistence status',
  );
};

export const validatePersistenceStatus = (value) => (
  createValidationResult(
    value,
    isPersistenceStatus,
    'persistence status',
  )
);

const isScenarioAdjustments = (value) => (
  (Array.isArray(value) || isRecord(value)) && isJsonSafe(value)
);

/**
 * Determines whether a value is a saved scenario.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the scenario contract.
 */
export const isScenario = (value) => (
  isRecord(value)
  && isCurrentSchemaVersion(value.schemaVersion)
  && isBoundedString(value.scenarioId, 1, 128)
  && isBoundedString(value.name, 1, 256)
  && isBoundedString(value.description, 0, 512)
  && isIsoDateTime(value.createdAt)
  && isIsoDateTime(value.updatedAt)
  && Date.parse(value.updatedAt) >= Date.parse(value.createdAt)
  && isScenarioAdjustments(value.adjustments)
);

/**
 * Creates a canonical saved scenario.
 *
 * @param {object} input Scenario fields.
 * @returns {object} Canonical scenario.
 */
export const createScenario = (input = {}) => {
  const scenario = {
    schemaVersion: canonicalSchemaVersion(input.schemaVersion),
    scenarioId: normalizeString(input.scenarioId ?? input.id),
    name: normalizeString(input.name),
    description: normalizeString(input.description),
    createdAt: normalizeDateTime(input.createdAt),
    updatedAt: normalizeDateTime(input.updatedAt, input.createdAt),
    adjustments: normalizeJsonValue(input.adjustments, {}),
  };

  return assertSchema(scenario, isScenario, 'scenario');
};

export const validateScenario = (value) => (
  createValidationResult(value, isScenario, 'scenario')
);

/**
 * Determines whether a value is a system notice.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the notice contract.
 */
export const isNotice = (value) => (
  isRecord(value)
  && isBoundedString(value.id, 1, 128)
  && isBoundedString(value.code, 1, 64)
  && NOTICE_SEVERITIES.includes(value.severity)
  && isBoundedString(value.message, 1, 512)
  && typeof value.dismissible === 'boolean'
  && isIsoDateTime(value.createdAt)
);

/**
 * Creates a canonical system notice.
 *
 * @param {object} input Notice fields.
 * @returns {object} Canonical notice.
 */
export const createNotice = (input = {}) => {
  const notice = {
    id: normalizeString(input.id),
    code: normalizeString(input.code),
    severity: normalizeString(input.severity, 'info'),
    message: normalizeString(input.message),
    dismissible: input.dismissible === undefined
      ? true
      : Boolean(input.dismissible),
    createdAt: normalizeDateTime(input.createdAt),
  };

  return assertSchema(notice, isNotice, 'notice');
};

export const validateNotice = (value) => (
  createValidationResult(value, isNotice, 'notice')
);

export const SCHEMA_GUARDS = Object.freeze({
  workItem: isWorkItem,
  capacityRecord: isCapacityRecord,
  datasetMetadata: isDatasetMetadata,
  normalizedDataset: isNormalizedDataset,
  session: isSession,
  thresholds: isThresholds,
  importSummary: isImportSummary,
  persistenceStatus: isPersistenceStatus,
  scenario: isScenario,
  notice: isNotice,
});

/**
 * Validates a value using a registered schema name.
 *
 * @param {string} schemaName Registered schema name.
 * @param {*} value Value to validate.
 * @returns {{ok: boolean, data: *|null, error: object|null}} Validation result.
 */
export const validateSchema = (schemaName, value) => {
  const guard = SCHEMA_GUARDS[schemaName];

  if (!guard) {
    return {
      ok: false,
      data: null,
      error: {
        code: 'UNKNOWN_SCHEMA',
        message: `Unknown schema: ${schemaName}.`,
        schema: schemaName,
      },
    };
  }

  return createValidationResult(value, guard, schemaName);
};

const schemas = Object.freeze({
  guards: SCHEMA_GUARDS,
  createWorkItem,
  createCapacityRecord,
  createDatasetMetadata,
  createNormalizedDataset,
  createSession,
  createThresholds,
  createImportSummary,
  createPersistenceStatus,
  createScenario,
  createNotice,
  validateSchema,
});

export default schemas;