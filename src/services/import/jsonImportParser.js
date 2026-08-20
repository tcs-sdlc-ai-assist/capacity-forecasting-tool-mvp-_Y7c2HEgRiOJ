import { SUPPORTED_SCHEMA_VERSION } from '../../config/appConfig.js';
import { ERROR_CODES } from '../../constants/domainConstants.js';

export const JSON_IMPORT_PARSER_ERROR_CODES = Object.freeze({
  CONTENT_REQUIRED: ERROR_CODES.INVALID_JSON,
  FILE_EMPTY: ERROR_CODES.FILE_EMPTY,
  PARSE_FAILED: ERROR_CODES.INVALID_JSON,
  INVALID_SHAPE: ERROR_CODES.INVALID_DATASET_SHAPE,
  INVALID_SCHEMA_VERSION: ERROR_CODES.INVALID_SCHEMA_VERSION,
});

const createError = (code, message) => ({
  code,
  message,
});

const createFailureResult = (code, message, diagnostics = []) => ({
  ok: false,
  data: null,
  error: createError(code, message),
  diagnostics,
  warnings: diagnostics,
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const hasOwn = (value, key) => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const isRecordArray = (value) => (
  Array.isArray(value) && value.every(isRecord)
);

const normalizeRecordType = (value) => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    : ''
);

const WORK_ITEM_TYPES = new Set([
  'feature',
  'workitem',
]);

const CAPACITY_RECORD_TYPES = new Set([
  'capacity',
  'capacityrecord',
]);

const getExplicitRecordType = (record) => {
  const candidates = [
    record.recordType,
    record.rowType,
    record.entityType,
    record.kind,
    record.type,
    record._type,
  ];

  for (const candidate of candidates) {
    const normalizedType = normalizeRecordType(candidate);

    if (WORK_ITEM_TYPES.has(normalizedType)) {
      return 'workItem';
    }

    if (CAPACITY_RECORD_TYPES.has(normalizedType)) {
      return 'capacityRecord';
    }
  }

  return null;
};

const inferRecordType = (record) => {
  const explicitType = getExplicitRecordType(record);

  if (explicitType) {
    return explicitType;
  }

  if (
    hasOwn(record, 'capacityPoints')
    && hasOwn(record, 'planningLevel')
    && hasOwn(record, 'team')
  ) {
    return 'capacityRecord';
  }

  if (
    hasOwn(record, 'feature')
    || hasOwn(record, 'itemId')
    || hasOwn(record, 'estimatedPoints')
    || hasOwn(record, 'allocations')
  ) {
    return 'workItem';
  }

  return null;
};

const partitionStructuredRows = (rows) => {
  if (!isRecordArray(rows) || rows.length === 0) {
    return null;
  }

  const workItems = [];
  const capacityRecords = [];
  const workItemRowRefs = [];
  const capacityRecordRowRefs = [];

  for (let index = 0; index < rows.length; index += 1) {
    const record = rows[index];
    const recordType = inferRecordType(record);
    const rowRef = index + 1;

    if (recordType === 'workItem') {
      workItems.push(record);
      workItemRowRefs.push(rowRef);
    } else if (recordType === 'capacityRecord') {
      capacityRecords.push(record);
      capacityRecordRowRefs.push(rowRef);
    } else {
      return null;
    }
  }

  return {
    workItems,
    capacityRecords,
    workItemRowRefs,
    capacityRecordRowRefs,
  };
};

const readStructuredObject = (payload) => {
  if (!hasOwn(payload, 'workItems')) {
    return null;
  }

  if (!isRecordArray(payload.workItems)) {
    return null;
  }

  const capacityRecords = payload.capacityRecords ?? [];

  if (!isRecordArray(capacityRecords)) {
    return null;
  }

  return {
    workItems: payload.workItems,
    capacityRecords,
    workItemRowRefs: payload.workItems.map((_, index) => index + 1),
    capacityRecordRowRefs: capacityRecords.map((_, index) => index + 1),
  };
};

const readFlatRowsObject = (payload) => {
  const rows = Array.isArray(payload.records)
    ? payload.records
    : payload.rows;

  if (!Array.isArray(rows)) {
    return null;
  }

  return partitionStructuredRows(rows);
};

const hasSupportedSchemaVersion = (payload) => {
  if (!isRecord(payload) || !hasOwn(payload, 'schemaVersion')) {
    return true;
  }

  return payload.schemaVersion === SUPPORTED_SCHEMA_VERSION;
};

const createSafeMeta = (
  sourceShape,
  workItems,
  capacityRecords,
) => ({
  sourceShape,
  workItemCount: workItems.length,
  capacityRecordCount: capacityRecords.length,
  recordCount: workItems.length + capacityRecords.length,
});

/**
 * Parses JSON text containing a canonical dataset object, separate structured
 * row arrays, or a flat array of identifiable work-item and capacity records.
 */
export class JsonImportParser {
  /**
   * Parses a JSON file descriptor without retaining its source text.
   *
   * @param {{textContent?: string}|string} fileDescriptor JSON descriptor.
   * @returns {{
   *   ok: boolean,
   *   data: object|null,
   *   diagnostics: object[],
   *   warnings: object[],
   *   error?: {code: string, message: string}
   * }} Parse result.
   */
  parse(fileDescriptor) {
    const textContent = typeof fileDescriptor === 'string'
      ? fileDescriptor
      : fileDescriptor?.textContent;

    if (typeof textContent !== 'string') {
      return createFailureResult(
        JSON_IMPORT_PARSER_ERROR_CODES.CONTENT_REQUIRED,
        'JSON text content is required.',
      );
    }

    const normalizedContent = textContent.replace(/^\uFEFF/, '').trim();

    if (!normalizedContent) {
      return createFailureResult(
        JSON_IMPORT_PARSER_ERROR_CODES.FILE_EMPTY,
        'The JSON file is empty.',
      );
    }

    let payload;

    try {
      payload = JSON.parse(normalizedContent);
    } catch {
      return createFailureResult(
        JSON_IMPORT_PARSER_ERROR_CODES.PARSE_FAILED,
        'The JSON file contains invalid JSON.',
      );
    }

    if (
      isRecord(payload)
      && !hasSupportedSchemaVersion(payload)
    ) {
      return createFailureResult(
        JSON_IMPORT_PARSER_ERROR_CODES.INVALID_SCHEMA_VERSION,
        'The JSON dataset uses an unsupported schema version.',
      );
    }

    let structuredRows;
    let sourceShape;

    if (Array.isArray(payload)) {
      structuredRows = partitionStructuredRows(payload);
      sourceShape = 'flat-array';
    } else if (isRecord(payload)) {
      structuredRows = readStructuredObject(payload);
      sourceShape = 'dataset-object';

      if (!structuredRows) {
        structuredRows = readFlatRowsObject(payload);
        sourceShape = 'rows-object';
      }
    }

    if (!structuredRows) {
      return createFailureResult(
        JSON_IMPORT_PARSER_ERROR_CODES.INVALID_SHAPE,
        'The JSON file must contain workItems and optional capacityRecords arrays, or an array of identifiable records.',
      );
    }

    const {
      workItems,
      capacityRecords,
      workItemRowRefs,
      capacityRecordRowRefs,
    } = structuredRows;
    const records = [...workItems, ...capacityRecords];
    const rowRefs = [
      ...workItemRowRefs,
      ...capacityRecordRowRefs,
    ];
    const schemaVersion = isRecord(payload)
      && typeof payload.schemaVersion === 'string'
      ? payload.schemaVersion
      : SUPPORTED_SCHEMA_VERSION;
    const data = {
      format: 'json',
      schemaVersion,
      workItems,
      capacityRecords,
      records,
      rows: records,
      rowRefs,
      workItemRowRefs,
      capacityRecordRowRefs,
      diagnostics: [],
      meta: createSafeMeta(
        sourceShape,
        workItems,
        capacityRecords,
      ),
    };

    if (
      isRecord(payload)
      && isRecord(payload.dimensions)
    ) {
      data.dimensions = payload.dimensions;
    }

    if (
      isRecord(payload)
      && hasOwn(payload, 'sourceUpdatedAt')
    ) {
      data.sourceUpdatedAt = payload.sourceUpdatedAt;
    }

    return {
      ok: true,
      data,
      diagnostics: [],
      warnings: [],
    };
  }

  /**
   * Alias for parsing a JSON file descriptor.
   *
   * @param {{textContent?: string}|string} fileDescriptor JSON descriptor.
   * @returns {object} Parse result.
   */
  parseFile(fileDescriptor) {
    return this.parse(fileDescriptor);
  }
}

export const jsonImportParser = new JsonImportParser();

export default jsonImportParser;