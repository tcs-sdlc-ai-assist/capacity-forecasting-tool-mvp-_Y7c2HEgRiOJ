import { SUPPORTED_SCHEMA_VERSION } from '../../config/appConfig.js';
import {
  ERROR_CODES,
  IMPORT_POLICY,
} from '../../constants/domainConstants.js';
import {
  CONFIDENCE_LEVELS,
  createCapacityRecord,
  createNormalizedDataset,
  createWorkItem,
} from '../../domain/schemas.js';
import deterministicIdGenerator from './deterministicIdGenerator.js';

export const NORMALIZATION_ERROR_CODES = Object.freeze({
  INVALID_PAYLOAD: ERROR_CODES.INVALID_DATASET_SHAPE,
  INVALID_ROW: 'IMPORT_INVALID_ROW',
  MISSING_REQUIRED_FIELD: ERROR_CODES.MISSING_IDENTITY_VALUE,
  INVALID_DATE: ERROR_CODES.INVALID_DATE,
  INVALID_NUMBER: ERROR_CODES.INVALID_NUMBER,
  NEGATIVE_VALUE: ERROR_CODES.NEGATIVE_VALUE,
  INVALID_ALLOCATION: 'IMPORT_INVALID_ALLOCATION',
  INVALID_RECORD_TYPE: 'IMPORT_INVALID_RECORD_TYPE',
  DUPLICATE_IDENTITY: ERROR_CODES.DUPLICATE_IDENTITY,
  ROW_LIMIT_EXCEEDED: 'IMPORT_ROW_LIMIT_EXCEEDED',
  NO_VALID_ROWS: ERROR_CODES.NO_VALID_ROWS,
});

export const NORMALIZATION_WARNING_CODES = Object.freeze({
  OPTIONAL_NUMBER_DEFAULTED: 'OPTIONAL_NUMBER_DEFAULTED',
  CONFIDENCE_DEFAULTED: 'CONFIDENCE_DEFAULTED',
  TEAM_DERIVED_FROM_ALLOCATIONS: 'TEAM_DERIVED_FROM_ALLOCATIONS',
  ALLOCATION_DERIVED_FROM_ESTIMATE: 'ALLOCATION_DERIVED_FROM_ESTIMATE',
});

export const HEADER_ALIAS_MAP = Object.freeze({
  recordType: Object.freeze([
    'recordType',
    'record_type',
    'record type',
    'rowType',
    'row_type',
    'row type',
    'entityType',
    'entity_type',
    'entity type',
    'kind',
  ]),
  recordId: Object.freeze([
    'recordId',
    'record_id',
    'record id',
  ]),
  planningLevel: Object.freeze([
    'planningLevel',
    'planning_level',
    'planning level',
    'pi',
    'program increment',
    'train',
  ]),
  program: Object.freeze([
    'program',
    'programme',
  ]),
  epic: Object.freeze([
    'epic',
  ]),
  itemId: Object.freeze([
    'itemId',
    'itemID',
    'item_id',
    'item id',
    'featureId',
    'feature_id',
    'feature id',
    'id',
  ]),
  feature: Object.freeze([
    'feature',
    'title',
    'name',
  ]),
  featureWorkType: Object.freeze([
    'featureWorkType',
    'feature_work_type',
    'feature work type',
    'workType',
    'work_type',
    'work type',
  ]),
  owner: Object.freeze([
    'owner',
    'assignee',
  ]),
  estimatedPoints: Object.freeze([
    'estimatedPoints',
    'estimated_points',
    'estimated points',
    'storyPoints',
    'story_points',
    'story points',
    'points',
  ]),
  team: Object.freeze([
    'team',
    'teams',
    'teamName',
    'team_name',
    'team name',
  ]),
  art: Object.freeze([
    'art',
    'agileReleaseTrain',
    'agile_release_train',
    'agile release train',
  ]),
  status: Object.freeze([
    'status',
    'state',
  ]),
  startDate: Object.freeze([
    'startDate',
    'start_date',
    'start date',
  ]),
  endDate: Object.freeze([
    'endDate',
    'end_date',
    'end date',
  ]),
  allocations: Object.freeze([
    'allocations',
    'teamAllocations',
    'team_allocations',
    'team allocations',
  ]),
  allocationPoints: Object.freeze([
    'allocationPoints',
    'allocation_points',
    'allocation points',
    'allocatedPoints',
    'allocated_points',
    'allocated points',
    'allocation',
  ]),
  capacityPoints: Object.freeze([
    'capacityPoints',
    'capacity_points',
    'capacity points',
    'capacity',
  ]),
  reservedSupportPercent: Object.freeze([
    'reservedSupportPercent',
    'reserved_support_percent',
    'reserved support percent',
    'supportPercent',
    'support_percent',
    'support percent',
    'support %',
  ]),
  ptoImpactPoints: Object.freeze([
    'ptoImpactPoints',
    'pto_impact_points',
    'pto impact points',
    'ptoImpact',
    'pto impact',
    'pto',
  ]),
  holidayImpactPoints: Object.freeze([
    'holidayImpactPoints',
    'holiday_impact_points',
    'holiday impact points',
    'holidayImpact',
    'holiday impact',
    'holiday',
  ]),
  confidence: Object.freeze([
    'confidence',
    'capacityConfidence',
    'capacity_confidence',
    'capacity confidence',
  ]),
});

const WORK_ITEM_TYPES = new Set([
  'feature',
  'workitem',
  'work',
]);

const CAPACITY_RECORD_TYPES = new Set([
  'capacity',
  'capacityrecord',
  'teamcapacity',
]);

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const normalizeKey = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = typeof value.normalize === 'function'
    ? value.normalize('NFKC')
    : value;

  return normalized
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const normalizeString = (value) => {
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'boolean'
  ) {
    return '';
  }

  const stringValue = String(value);
  const normalized = typeof stringValue.normalize === 'function'
    ? stringValue.normalize('NFKC')
    : stringValue;

  return normalized
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeRecordType = (value) => (
  normalizeKey(normalizeString(value))
);

const normalizeRowRef = (value, fallback = 1) => {
  const candidate = isRecord(value)
    ? value.rowRef ?? value.sourceRowNumber ?? value.rowNumber
    : value;
  const normalized = Number(candidate);

  return Number.isInteger(normalized) && normalized >= 1
    ? normalized
    : fallback;
};

const createError = (code, message, rowRef, field) => {
  const error = {
    code,
    message,
  };

  if (Number.isInteger(rowRef) && rowRef >= 1) {
    error.rowRef = rowRef;
    error.rowRefs = [rowRef];
  }

  if (typeof field === 'string' && field) {
    error.field = field;
  }

  return error;
};

const createFailureResult = (
  code,
  message,
  rowRef,
  field,
  warnings = [],
) => ({
  ok: false,
  data: null,
  error: createError(code, message, rowRef, field),
  warnings: warnings.map((warning) => ({ ...warning })),
});

const createWarning = (code, message, rowRef, field) => {
  const warning = {
    code,
    message,
  };

  if (Number.isInteger(rowRef) && rowRef >= 1) {
    warning.rowRefs = [rowRef];
  }

  if (typeof field === 'string' && field) {
    warning.field = field;
  }

  return warning;
};

const mergeAliasMap = (aliasMap) => {
  const source = isRecord(aliasMap) ? aliasMap : {};
  const fields = new Set([
    ...Object.keys(HEADER_ALIAS_MAP),
    ...Object.keys(source),
  ]);

  return Object.freeze(Object.fromEntries(
    Array.from(fields).map((field) => {
      const configuredAliases = Array.isArray(source[field])
        ? source[field]
        : [];
      const defaultAliases = HEADER_ALIAS_MAP[field] ?? [];
      const aliases = [
        field,
        ...configuredAliases,
        ...defaultAliases,
      ]
        .map(normalizeString)
        .filter(Boolean);

      return [
        field,
        Object.freeze([...new Set(aliases)]),
      ];
    }),
  ));
};

const createRecordReader = (record, aliasMap) => {
  const normalizedEntries = new Map();

  Object.entries(record).forEach(([key, value]) => {
    const normalizedKey = normalizeKey(key);

    if (normalizedKey && !normalizedEntries.has(normalizedKey)) {
      normalizedEntries.set(normalizedKey, value);
    }
  });

  return (field) => {
    const aliases = aliasMap[field] ?? [field];

    for (const alias of aliases) {
      const key = normalizeKey(alias);

      if (normalizedEntries.has(key)) {
        return normalizedEntries.get(key);
      }
    }

    return undefined;
  };
};

const parseFiniteNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, value: null };
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      value: null,
    };
  }

  const normalized = value.trim();

  if (
    !normalized
    || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)
  ) {
    return {
      ok: false,
      value: null,
    };
  }

  const number = Number(normalized);

  return Number.isFinite(number)
    ? { ok: true, value: number }
    : { ok: false, value: null };
};

const parseRequiredNonNegativeNumber = (
  value,
  rowRef,
  field,
  label,
) => {
  if (
    value === null
    || value === undefined
    || (typeof value === 'string' && value.trim() === '')
  ) {
    return createFailureResult(
      NORMALIZATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
      `${label} is required.`,
      rowRef,
      field,
    );
  }

  const parsed = parseFiniteNumber(value);

  if (!parsed.ok) {
    return createFailureResult(
      NORMALIZATION_ERROR_CODES.INVALID_NUMBER,
      `${label} must be a finite number.`,
      rowRef,
      field,
    );
  }

  if (parsed.value < 0) {
    return createFailureResult(
      NORMALIZATION_ERROR_CODES.NEGATIVE_VALUE,
      `${label} must not be negative.`,
      rowRef,
      field,
    );
  }

  return {
    ok: true,
    data: parsed.value,
    warnings: [],
  };
};

const parseOptionalNonNegativeNumber = (
  value,
  rowRef,
  field,
  label,
  maximum = null,
) => {
  if (
    value === null
    || value === undefined
    || (typeof value === 'string' && value.trim() === '')
  ) {
    return {
      ok: true,
      data: 0,
      warnings: [],
    };
  }

  const parsed = parseFiniteNumber(value);

  if (
    !parsed.ok
    || parsed.value < 0
    || (maximum !== null && parsed.value > maximum)
  ) {
    return {
      ok: true,
      data: 0,
      warnings: [
        createWarning(
          NORMALIZATION_WARNING_CODES.OPTIONAL_NUMBER_DEFAULTED,
          `${label} was invalid and was normalized to 0.`,
          rowRef,
          field,
        ),
      ],
    };
  }

  return {
    ok: true,
    data: parsed.value,
    warnings: [],
  };
};

const parseDate = (value, rowRef, field, label) => {
  if (
    value === null
    || value === undefined
    || (typeof value === 'string' && value.trim() === '')
  ) {
    return {
      ok: true,
      data: null,
      warnings: [],
    };
  }

  const normalized = normalizeString(value);
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
    .exec(normalized);

  if (!match) {
    return createFailureResult(
      NORMALIZATION_ERROR_CODES.INVALID_DATE,
      `${label} must use the YYYY-MM-DD format.`,
      rowRef,
      field,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return createFailureResult(
      NORMALIZATION_ERROR_CODES.INVALID_DATE,
      `${label} must be a valid calendar date.`,
      rowRef,
      field,
    );
  }

  return {
    ok: true,
    data: normalized,
    warnings: [],
  };
};

const parseTeams = (value) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;|]/)
      : value === null || value === undefined
        ? []
        : [value];

  return [...new Set(
    source
      .map(normalizeString)
      .filter(Boolean),
  )];
};

const parseAllocationString = (value) => {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('{')) {
    try {
      const parsed = JSON.parse(normalized);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  const entries = normalized
    .split(/[;|,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(':');

      if (separatorIndex <= 0) {
        return null;
      }

      return [
        entry.slice(0, separatorIndex).trim(),
        entry.slice(separatorIndex + 1).trim(),
      ];
    });

  if (
    entries.length === 0
    || entries.some((entry) => entry === null)
  ) {
    return null;
  }

  return Object.fromEntries(entries);
};

const parseAllocations = (
  rawAllocations,
  rawAllocationPoints,
  teams,
  estimatedPoints,
  rowRef,
) => {
  let allocationSource = rawAllocations;

  if (typeof allocationSource === 'string') {
    allocationSource = parseAllocationString(allocationSource);
  }

  const warnings = [];
  const allocations = {};

  if (isRecord(allocationSource)) {
    for (const [rawTeam, rawValue] of Object.entries(allocationSource)) {
      const team = normalizeString(rawTeam);

      if (!team) {
        return createFailureResult(
          NORMALIZATION_ERROR_CODES.INVALID_ALLOCATION,
          'Allocation team names must not be blank.',
          rowRef,
          'allocations',
          warnings,
        );
      }

      const parsed = parseRequiredNonNegativeNumber(
        rawValue,
        rowRef,
        'allocations',
        'Allocation points',
      );

      if (!parsed.ok) {
        return parsed;
      }

      allocations[team] = parsed.data;
    }
  }

  if (Object.keys(allocations).length === 0) {
    const hasAllocationPoints = !(
      rawAllocationPoints === null
      || rawAllocationPoints === undefined
      || (
        typeof rawAllocationPoints === 'string'
        && rawAllocationPoints.trim() === ''
      )
    );

    if (teams.length !== 1) {
      return createFailureResult(
        NORMALIZATION_ERROR_CODES.INVALID_ALLOCATION,
        'Allocations are required when a work item has multiple teams.',
        rowRef,
        'allocations',
        warnings,
      );
    }

    if (hasAllocationPoints) {
      const parsed = parseRequiredNonNegativeNumber(
        rawAllocationPoints,
        rowRef,
        'allocationPoints',
        'Allocation points',
      );

      if (!parsed.ok) {
        return parsed;
      }

      allocations[teams[0]] = parsed.data;
    } else {
      allocations[teams[0]] = estimatedPoints;
      warnings.push(createWarning(
        NORMALIZATION_WARNING_CODES.ALLOCATION_DERIVED_FROM_ESTIMATE,
        'Allocation points were derived from estimated points.',
        rowRef,
        'allocations',
      ));
    }
  }

  return {
    ok: true,
    data: allocations,
    warnings,
  };
};

const requireString = (value, rowRef, field, label) => {
  const normalized = normalizeString(value);

  if (!normalized) {
    return createFailureResult(
      NORMALIZATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
      `${label} is required.`,
      rowRef,
      field,
    );
  }

  return {
    ok: true,
    data: normalized,
    warnings: [],
  };
};

const combineWarnings = (...results) => (
  results.flatMap((result) => (
    Array.isArray(result?.warnings)
      ? result.warnings
      : []
  ))
);

const classifyRecord = (record, aliasMap) => {
  const read = createRecordReader(record, aliasMap);
  const explicitType = normalizeRecordType(read('recordType'));

  if (WORK_ITEM_TYPES.has(explicitType)) {
    return 'workItem';
  }

  if (CAPACITY_RECORD_TYPES.has(explicitType)) {
    return 'capacityRecord';
  }

  const capacityFields = [
    'capacityPoints',
    'reservedSupportPercent',
    'ptoImpactPoints',
    'holidayImpactPoints',
    'confidence',
  ];

  if (capacityFields.some((field) => read(field) !== undefined)) {
    return 'capacityRecord';
  }

  return 'workItem';
};

const resolveGenerator = (generator, record, rowRef) => {
  if (typeof generator === 'function') {
    return generator(record, rowRef);
  }

  if (typeof generator?.generate === 'function') {
    return generator.generate(record, rowRef);
  }

  if (typeof generator?.generateId === 'function') {
    return generator.generateId(record, rowRef);
  }

  return deterministicIdGenerator.generate(record, rowRef);
};

const normalizeConfidence = (value, rowRef) => {
  const normalized = normalizeString(value);
  const confidence = CONFIDENCE_LEVELS.find((candidate) => (
    candidate.toLowerCase() === normalized.toLowerCase()
  ));

  if (confidence) {
    return {
      data: confidence,
      warnings: [],
    };
  }

  return {
    data: 'Unknown',
    warnings: normalized
      ? [
        createWarning(
          NORMALIZATION_WARNING_CODES.CONFIDENCE_DEFAULTED,
          'Capacity confidence was unrecognized and was normalized to Unknown.',
          rowRef,
          'confidence',
        ),
      ]
      : [],
  };
};

const resolveParsedPayload = (payload) => {
  if (
    isRecord(payload)
    && typeof payload.ok === 'boolean'
    && Object.prototype.hasOwnProperty.call(payload, 'data')
  ) {
    return payload.ok ? payload.data : null;
  }

  return payload;
};

const createSummary = (
  acceptedRows,
  rejectedRows,
  warnings,
  rejections,
) => ({
  acceptedRows,
  rejectedRows,
  warningCount: warnings.length,
  warnings: warnings.map((warning) => ({ ...warning })),
  rejections: rejections.map((rejection) => ({ ...rejection })),
});

const extractRows = (payload) => {
  if (!isRecord(payload)) {
    return null;
  }

  if (
    Array.isArray(payload.workItems)
    || Array.isArray(payload.capacityRecords)
  ) {
    const workItems = Array.isArray(payload.workItems)
      ? payload.workItems
      : [];
    const capacityRecords = Array.isArray(payload.capacityRecords)
      ? payload.capacityRecords
      : [];
    const workItemRowRefs = Array.isArray(payload.workItemRowRefs)
      ? payload.workItemRowRefs
      : workItems.map((_, index) => index + 1);
    const capacityRecordRowRefs = Array.isArray(
      payload.capacityRecordRowRefs,
    )
      ? payload.capacityRecordRowRefs
      : capacityRecords.map((_, index) => index + 1);

    return [
      ...workItems.map((record, index) => ({
        record,
        type: 'workItem',
        rowRef: normalizeRowRef(
          workItemRowRefs[index],
          index + 1,
        ),
      })),
      ...capacityRecords.map((record, index) => ({
        record,
        type: 'capacityRecord',
        rowRef: normalizeRowRef(
          capacityRecordRowRefs[index],
          index + 1,
        ),
      })),
    ];
  }

  const records = Array.isArray(payload.records)
    ? payload.records
    : payload.rows;

  if (!Array.isArray(records)) {
    return null;
  }

  const rowRefs = Array.isArray(payload.rowRefs)
    ? payload.rowRefs
    : [];

  return records.map((record, index) => ({
    record,
    type: null,
    rowRef: normalizeRowRef(rowRefs[index], index + 1),
  }));
};

/**
 * Normalizes parser output into the canonical dataset schema.
 */
export class NormalizationService {
  constructor(
    aliasMap = HEADER_ALIAS_MAP,
    idGenerator = deterministicIdGenerator,
    _logger = null,
  ) {
    this.aliasMap = mergeAliasMap(aliasMap);
    this.idGenerator = idGenerator;
  }

  /**
   * Normalizes one work-item source record.
   *
   * @param {object} rawRecord Source work-item record.
   * @param {number|object} rowRef Source row reference.
   * @returns {{ok: boolean, data: object|null, warnings: object[], error?: object}}
   * Normalization result.
   */
  normalizeWorkItem(rawRecord, rowRef = 1) {
    const normalizedRowRef = normalizeRowRef(rowRef);

    if (!isRecord(rawRecord)) {
      return createFailureResult(
        NORMALIZATION_ERROR_CODES.INVALID_ROW,
        'The work-item row must be an object.',
        normalizedRowRef,
      );
    }

    const read = createRecordReader(rawRecord, this.aliasMap);
    const planningLevel = requireString(
      read('planningLevel'),
      normalizedRowRef,
      'planningLevel',
      'Planning level',
    );
    const program = requireString(
      read('program'),
      normalizedRowRef,
      'program',
      'Program',
    );
    const feature = requireString(
      read('feature'),
      normalizedRowRef,
      'feature',
      'Feature',
    );
    const featureWorkType = requireString(
      read('featureWorkType'),
      normalizedRowRef,
      'featureWorkType',
      'Feature work type',
    );
    const estimatedPoints = parseRequiredNonNegativeNumber(
      read('estimatedPoints'),
      normalizedRowRef,
      'estimatedPoints',
      'Estimated points',
    );

    const requiredResults = [
      planningLevel,
      program,
      feature,
      featureWorkType,
      estimatedPoints,
    ];
    const failedRequiredField = requiredResults.find((result) => !result.ok);

    if (failedRequiredField) {
      return failedRequiredField;
    }

    let teams = parseTeams(read('team'));
    const rawAllocations = read('allocations');

    if (teams.length === 0 && isRecord(rawAllocations)) {
      teams = Object.keys(rawAllocations)
        .map(normalizeString)
        .filter(Boolean);
    }

    if (teams.length === 0) {
      return createFailureResult(
        NORMALIZATION_ERROR_CODES.MISSING_REQUIRED_FIELD,
        'At least one team is required.',
        normalizedRowRef,
        'team',
      );
    }

    const allocations = parseAllocations(
      rawAllocations,
      read('allocationPoints'),
      teams,
      estimatedPoints.data,
      normalizedRowRef,
    );

    if (!allocations.ok) {
      return allocations;
    }

    const allocationTeams = Object.keys(allocations.data);
    const derivedTeams = allocationTeams.filter((team) => (
      !teams.includes(team)
    ));

    if (derivedTeams.length > 0) {
      teams = [...new Set([...teams, ...derivedTeams])];
      allocations.warnings.push(createWarning(
        NORMALIZATION_WARNING_CODES.TEAM_DERIVED_FROM_ALLOCATIONS,
        'One or more teams were derived from the allocation map.',
        normalizedRowRef,
        'team',
      ));
    }

    const startDate = parseDate(
      read('startDate'),
      normalizedRowRef,
      'startDate',
      'Start date',
    );

    if (!startDate.ok) {
      return startDate;
    }

    const endDate = parseDate(
      read('endDate'),
      normalizedRowRef,
      'endDate',
      'End date',
    );

    if (!endDate.ok) {
      return endDate;
    }

    if (
      startDate.data
      && endDate.data
      && endDate.data < startDate.data
    ) {
      return createFailureResult(
        NORMALIZATION_ERROR_CODES.INVALID_DATE,
        'End date must not be earlier than start date.',
        normalizedRowRef,
        'endDate',
      );
    }

    let recordId;

    try {
      recordId = resolveGenerator(
        this.idGenerator,
        rawRecord,
        normalizedRowRef,
      );
    } catch {
      recordId = '';
    }

    try {
      const data = createWorkItem({
        recordId,
        planningLevel: planningLevel.data,
        program: program.data,
        epic: normalizeString(read('epic')),
        itemId: normalizeString(read('itemId')),
        feature: feature.data,
        featureWorkType: featureWorkType.data,
        owner: normalizeString(read('owner')),
        estimatedPoints: estimatedPoints.data,
        team: teams,
        art: normalizeString(read('art')),
        status: normalizeString(read('status')),
        startDate: startDate.data,
        endDate: endDate.data,
        allocations: allocations.data,
      });

      return {
        ok: true,
        data,
        rowRef: normalizedRowRef,
        type: 'workItem',
        warnings: combineWarnings(
          estimatedPoints,
          allocations,
          startDate,
          endDate,
        ),
      };
    } catch {
      return createFailureResult(
        NORMALIZATION_ERROR_CODES.INVALID_ROW,
        'The work-item row does not satisfy the supported schema.',
        normalizedRowRef,
      );
    }
  }

  /**
   * Normalizes one capacity source record.
   *
   * @param {object} rawRecord Source capacity record.
   * @param {number|object} rowRef Source row reference.
   * @returns {{ok: boolean, data: object|null, warnings: object[], error?: object}}
   * Normalization result.
   */
  normalizeCapacityRecord(rawRecord, rowRef = 1) {
    const normalizedRowRef = normalizeRowRef(rowRef);

    if (!isRecord(rawRecord)) {
      return createFailureResult(
        NORMALIZATION_ERROR_CODES.INVALID_ROW,
        'The capacity row must be an object.',
        normalizedRowRef,
      );
    }

    const read = createRecordReader(rawRecord, this.aliasMap);
    const planningLevel = requireString(
      read('planningLevel'),
      normalizedRowRef,
      'planningLevel',
      'Planning level',
    );
    const team = requireString(
      read('team'),
      normalizedRowRef,
      'team',
      'Team',
    );
    const capacityPoints = parseRequiredNonNegativeNumber(
      read('capacityPoints'),
      normalizedRowRef,
      'capacityPoints',
      'Capacity points',
    );
    const requiredResults = [
      planningLevel,
      team,
      capacityPoints,
    ];
    const failedRequiredField = requiredResults.find((result) => !result.ok);

    if (failedRequiredField) {
      return failedRequiredField;
    }

    const reservedSupportPercent = parseOptionalNonNegativeNumber(
      read('reservedSupportPercent'),
      normalizedRowRef,
      'reservedSupportPercent',
      'Reserved support percent',
      100,
    );
    const ptoImpactPoints = parseOptionalNonNegativeNumber(
      read('ptoImpactPoints'),
      normalizedRowRef,
      'ptoImpactPoints',
      'PTO impact points',
    );
    const holidayImpactPoints = parseOptionalNonNegativeNumber(
      read('holidayImpactPoints'),
      normalizedRowRef,
      'holidayImpactPoints',
      'Holiday impact points',
    );
    const confidence = normalizeConfidence(
      read('confidence'),
      normalizedRowRef,
    );

    try {
      const data = createCapacityRecord({
        planningLevel: planningLevel.data,
        team: team.data,
        capacityPoints: capacityPoints.data,
        reservedSupportPercent: reservedSupportPercent.data,
        ptoImpactPoints: ptoImpactPoints.data,
        holidayImpactPoints: holidayImpactPoints.data,
        confidence: confidence.data,
      });

      return {
        ok: true,
        data,
        rowRef: normalizedRowRef,
        type: 'capacityRecord',
        warnings: combineWarnings(
          reservedSupportPercent,
          ptoImpactPoints,
          holidayImpactPoints,
          confidence,
        ),
      };
    } catch {
      return createFailureResult(
        NORMALIZATION_ERROR_CODES.INVALID_ROW,
        'The capacity row does not satisfy the supported schema.',
        normalizedRowRef,
      );
    }
  }

  /**
   * Normalizes parsed CSV or JSON payload data into a canonical dataset.
   *
   * @param {object} parsedPayload Parser output or parsed data.
   * @param {object} sourceMeta Optional source metadata.
   * @returns {{
   *   ok: boolean,
   *   data: object|null,
   *   warnings: object[],
   *   diagnostics: object[],
   *   summary: object,
   *   validationSummary: object,
   *   error?: object
   * }} Dataset normalization result.
   */
  normalizeParsedPayload(parsedPayload, sourceMeta = {}) {
    const payload = resolveParsedPayload(parsedPayload);
    const rows = extractRows(payload);

    if (!rows) {
      const summary = createSummary(0, 0, [], []);

      return {
        ...createFailureResult(
          NORMALIZATION_ERROR_CODES.INVALID_PAYLOAD,
          'Parsed import data must contain records, rows, or structured dataset arrays.',
        ),
        diagnostics: [],
        summary,
        validationSummary: summary,
      };
    }

    if (rows.length > IMPORT_POLICY.maximumRows) {
      const summary = createSummary(0, rows.length, [], []);

      return {
        ...createFailureResult(
          NORMALIZATION_ERROR_CODES.ROW_LIMIT_EXCEEDED,
          `The import exceeds the maximum of ${IMPORT_POLICY.maximumRows} rows.`,
        ),
        diagnostics: [],
        summary,
        validationSummary: summary,
      };
    }

    const workItems = [];
    const capacityRecords = [];
    const warnings = [];
    const rejections = [];
    const workItemIds = new Set();
    const capacityIdentities = new Set();

    rows.forEach(({ record, type, rowRef }) => {
      if (!isRecord(record)) {
        rejections.push(createError(
          NORMALIZATION_ERROR_CODES.INVALID_ROW,
          'The imported row must be an object.',
          rowRef,
        ));
        return;
      }

      const recordType = type ?? classifyRecord(record, this.aliasMap);
      const result = recordType === 'capacityRecord'
        ? this.normalizeCapacityRecord(record, rowRef)
        : this.normalizeWorkItem(record, rowRef);

      if (!result.ok) {
        rejections.push({ ...result.error });
        return;
      }

      if (recordType === 'workItem') {
        if (workItemIds.has(result.data.recordId)) {
          rejections.push(createError(
            NORMALIZATION_ERROR_CODES.DUPLICATE_IDENTITY,
            'A work item with the same identity was already imported.',
            rowRef,
            'recordId',
          ));
          return;
        }

        workItemIds.add(result.data.recordId);
        workItems.push(result.data);
      } else {
        const identity = JSON.stringify([
          result.data.planningLevel.toLowerCase(),
          result.data.team.toLowerCase(),
        ]);

        if (capacityIdentities.has(identity)) {
          rejections.push(createError(
            NORMALIZATION_ERROR_CODES.DUPLICATE_IDENTITY,
            'A capacity record with the same planning level and team was already imported.',
            rowRef,
          ));
          return;
        }

        capacityIdentities.add(identity);
        capacityRecords.push(result.data);
      }

      warnings.push(...result.warnings.map((warning) => ({ ...warning })));
    });

    const acceptedRows = workItems.length + capacityRecords.length;
    const summary = createSummary(
      acceptedRows,
      rejections.length,
      warnings,
      rejections,
    );

    if (workItems.length === 0) {
      const error = createError(
        NORMALIZATION_ERROR_CODES.NO_VALID_ROWS,
        'The import must contain at least one valid work item.',
      );

      error.details = {
        acceptedRows,
        rejectedRows: rejections.length,
        warningCount: warnings.length,
      };

      return {
        ok: false,
        data: null,
        error,
        warnings: warnings.map((warning) => ({ ...warning })),
        diagnostics: [
          ...warnings.map((warning) => ({ ...warning })),
          ...rejections.map((rejection) => ({ ...rejection })),
        ],
        rejections: rejections.map((rejection) => ({ ...rejection })),
        summary,
        validationSummary: summary,
      };
    }

    let dataset;

    try {
      dataset = createNormalizedDataset({
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        workItems,
        capacityRecords,
        dimensions: isRecord(payload?.dimensions)
          ? payload.dimensions
          : undefined,
      });
    } catch {
      return {
        ...createFailureResult(
          NORMALIZATION_ERROR_CODES.INVALID_PAYLOAD,
          'The normalized import does not satisfy the supported dataset schema.',
        ),
        diagnostics: [
          ...warnings.map((warning) => ({ ...warning })),
          ...rejections.map((rejection) => ({ ...rejection })),
        ],
        rejections: rejections.map((rejection) => ({ ...rejection })),
        summary,
        validationSummary: summary,
      };
    }

    return {
      ok: true,
      data: dataset,
      sourceMeta: isRecord(sourceMeta) ? { ...sourceMeta } : {},
      acceptedRows,
      rejectedRows: rejections.length,
      warnings: warnings.map((warning) => ({ ...warning })),
      diagnostics: [
        ...warnings.map((warning) => ({ ...warning })),
        ...rejections.map((rejection) => ({ ...rejection })),
      ],
      rejections: rejections.map((rejection) => ({ ...rejection })),
      summary,
      validationSummary: summary,
    };
  }

  /**
   * Alias for normalizing parsed import data.
   *
   * @param {object} parsedPayload Parser output or parsed data.
   * @param {object} sourceMeta Optional source metadata.
   * @returns {object} Dataset normalization result.
   */
  normalize(parsedPayload, sourceMeta = {}) {
    return this.normalizeParsedPayload(parsedPayload, sourceMeta);
  }
}

export const normalizationService = new NormalizationService();

export default normalizationService;