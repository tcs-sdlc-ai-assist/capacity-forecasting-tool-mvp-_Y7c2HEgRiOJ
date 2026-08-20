export const SUPPORTED_FILE_FORMATS = Object.freeze({
  CSV: 'csv',
  JSON: 'json',
});

export const SUPPORTED_FILE_EXTENSIONS = Object.freeze([
  '.csv',
  '.json',
]);

export const SUPPORTED_MIME_TYPES = Object.freeze([
  'text/csv',
  'application/csv',
  'application/json',
  'text/json',
]);

export const SOURCE_FIELDS = Object.freeze({
  SCHEMA_VERSION: 'schemaVersion',
  DATE: 'date',
  TEAM: 'team',
  ROLE: 'role',
  LOCATION: 'location',
  CAPACITY: 'capacity',
  DEMAND: 'demand',
});

export const HEADER_ALIASES = Object.freeze({
  [SOURCE_FIELDS.SCHEMA_VERSION]: Object.freeze([
    'schemaVersion',
    'schema_version',
    'schema version',
    'version',
  ]),
  [SOURCE_FIELDS.DATE]: Object.freeze([
    'date',
    'month',
    'period',
    'forecastDate',
    'forecast_date',
    'forecast date',
  ]),
  [SOURCE_FIELDS.TEAM]: Object.freeze([
    'team',
    'teamName',
    'team_name',
    'team name',
    'squad',
  ]),
  [SOURCE_FIELDS.ROLE]: Object.freeze([
    'role',
    'roleName',
    'role_name',
    'role name',
    'discipline',
    'jobTitle',
    'job_title',
    'job title',
  ]),
  [SOURCE_FIELDS.LOCATION]: Object.freeze([
    'location',
    'region',
    'office',
    'site',
  ]),
  [SOURCE_FIELDS.CAPACITY]: Object.freeze([
    'capacity',
    'availableCapacity',
    'available_capacity',
    'available capacity',
    'capacityFte',
    'capacity_fte',
    'capacity fte',
    'supply',
  ]),
  [SOURCE_FIELDS.DEMAND]: Object.freeze([
    'demand',
    'requiredCapacity',
    'required_capacity',
    'required capacity',
    'demandFte',
    'demand_fte',
    'demand fte',
    'requirement',
  ]),
});

export const SOURCE_ALIASES = HEADER_ALIASES;

export const REQUIRED_COLUMNS = Object.freeze([
  SOURCE_FIELDS.DATE,
  SOURCE_FIELDS.TEAM,
  SOURCE_FIELDS.ROLE,
  SOURCE_FIELDS.CAPACITY,
  SOURCE_FIELDS.DEMAND,
]);

export const OPTIONAL_COLUMNS = Object.freeze([
  SOURCE_FIELDS.SCHEMA_VERSION,
  SOURCE_FIELDS.LOCATION,
]);

export const IDENTITY_COLUMNS = Object.freeze([
  SOURCE_FIELDS.DATE,
  SOURCE_FIELDS.TEAM,
  SOURCE_FIELDS.ROLE,
  SOURCE_FIELDS.LOCATION,
]);

export const IMPORT_STATUSES = Object.freeze({
  IDLE: 'idle',
  READING: 'reading',
  VALIDATING: 'validating',
  READY: 'ready',
  IMPORTING: 'importing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
});

export const CAPACITY_STATES = Object.freeze({
  AVAILABLE: 'available',
  HEALTHY: 'healthy',
  CONSTRAINED: 'constrained',
  WARNING: 'warning',
  EXCEEDED: 'exceeded',
  CRITICAL: 'critical',
  UNAVAILABLE: 'unavailable',
});

export const DEFAULT_THRESHOLDS = Object.freeze({
  constrained: 80,
  exceeded: 100,
});

export const THRESHOLD_LIMITS = Object.freeze({
  minimum: 0,
  maximum: 1000,
});

export const DATE_RULES = Object.freeze({
  FORMAT: 'YYYY-MM',
  ISO_DATE_FORMAT: 'YYYY-MM-DD',
  PERIOD_PATTERN: '^\\d{4}-(0[1-9]|1[0-2])$',
  ISO_DATE_PATTERN: '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$',
  MIN_YEAR: 2000,
  MAX_YEAR: 2100,
  START_DAY: 1,
});

export const NOTICE_CODES = Object.freeze({
  IMPORT_STARTED: 'IMPORT_STARTED',
  IMPORT_SUCCEEDED: 'IMPORT_SUCCEEDED',
  IMPORT_COMPLETED_WITH_WARNINGS: 'IMPORT_COMPLETED_WITH_WARNINGS',
  DATASET_REPLACED: 'DATASET_REPLACED',
  DUPLICATE_ROWS_MERGED: 'DUPLICATE_ROWS_MERGED',
  EMPTY_ROWS_SKIPPED: 'EMPTY_ROWS_SKIPPED',
  UNSAVED_CHANGES: 'UNSAVED_CHANGES',
  LOCAL_ONLY: 'LOCAL_ONLY',
});

export const ERROR_CODES = Object.freeze({
  FILE_REQUIRED: 'FILE_REQUIRED',
  FILE_EMPTY: 'FILE_EMPTY',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_FORMAT: 'UNSUPPORTED_FILE_FORMAT',
  FILE_READ_FAILED: 'FILE_READ_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_CSV: 'INVALID_CSV',
  INVALID_DATASET_SHAPE: 'INVALID_DATASET_SHAPE',
  MISSING_REQUIRED_COLUMN: 'MISSING_REQUIRED_COLUMN',
  DUPLICATE_COLUMN: 'DUPLICATE_COLUMN',
  INVALID_SCHEMA_VERSION: 'INVALID_SCHEMA_VERSION',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_NUMBER: 'INVALID_NUMBER',
  NEGATIVE_VALUE: 'NEGATIVE_VALUE',
  MISSING_IDENTITY_VALUE: 'MISSING_IDENTITY_VALUE',
  DUPLICATE_IDENTITY: 'DUPLICATE_IDENTITY',
  NO_VALID_ROWS: 'NO_VALID_ROWS',
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_QUOTA_EXCEEDED',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
  UNKNOWN_IMPORT_ERROR: 'UNKNOWN_IMPORT_ERROR',
});

export const IMPORT_POLICY = Object.freeze({
  supportedFormats: SUPPORTED_FILE_FORMATS,
  supportedExtensions: SUPPORTED_FILE_EXTENSIONS,
  supportedMimeTypes: SUPPORTED_MIME_TYPES,
  maximumFileSizeBytes: 10 * 1024 * 1024,
  maximumRows: 100000,
  allowMultipleFiles: false,
  replaceExistingDataset: true,
  trimHeaders: true,
  trimValues: true,
  ignoreEmptyRows: true,
  caseInsensitiveHeaders: true,
  rejectUnknownColumns: false,
  rejectDuplicateIdentity: true,
  requireNonNegativeValues: true,
});

const domainConstants = Object.freeze({
  supportedFileFormats: SUPPORTED_FILE_FORMATS,
  supportedFileExtensions: SUPPORTED_FILE_EXTENSIONS,
  supportedMimeTypes: SUPPORTED_MIME_TYPES,
  sourceFields: SOURCE_FIELDS,
  sourceAliases: SOURCE_ALIASES,
  headerAliases: HEADER_ALIASES,
  requiredColumns: REQUIRED_COLUMNS,
  optionalColumns: OPTIONAL_COLUMNS,
  identityColumns: IDENTITY_COLUMNS,
  importStatuses: IMPORT_STATUSES,
  capacityStates: CAPACITY_STATES,
  defaultThresholds: DEFAULT_THRESHOLDS,
  thresholdLimits: THRESHOLD_LIMITS,
  dateRules: DATE_RULES,
  noticeCodes: NOTICE_CODES,
  errorCodes: ERROR_CODES,
  importPolicy: IMPORT_POLICY,
});

export default domainConstants;