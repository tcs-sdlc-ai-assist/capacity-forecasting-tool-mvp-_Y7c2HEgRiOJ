import Papa from 'papaparse';
import { ERROR_CODES } from '../../constants/domainConstants.js';

export const CSV_IMPORT_PARSER_ERROR_CODES = Object.freeze({
  CONTENT_REQUIRED: ERROR_CODES.INVALID_CSV,
  FILE_EMPTY: ERROR_CODES.FILE_EMPTY,
  MISSING_HEADER: ERROR_CODES.INVALID_CSV,
  NO_DATA_ROWS: ERROR_CODES.INVALID_CSV,
  PARSE_FAILED: ERROR_CODES.PARSE_FAILED,
  DUPLICATE_COLUMN: ERROR_CODES.DUPLICATE_COLUMN,
});

const createError = (code, message) => ({
  code,
  message,
});

const sanitizeDiagnosticString = (value, fallback, maximumLength) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const sanitized = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximumLength);

  return sanitized || fallback;
};

const normalizeHeader = (header, index) => {
  if (typeof header !== 'string') {
    return '';
  }

  const withoutByteOrderMark = index === 0
    ? header.replace(/^\uFEFF/, '')
    : header;

  return withoutByteOrderMark.trim();
};

const hasMeaningfulValue = (value) => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(hasMeaningfulValue);
  }

  return value !== null && value !== undefined;
};

const isMeaningfulRecord = (record) => (
  record !== null
  && typeof record === 'object'
  && !Array.isArray(record)
  && Object.values(record).some(hasMeaningfulValue)
);

const createParserDiagnostic = (diagnostic, index) => {
  const parserRow = Number.isInteger(diagnostic?.row)
    && diagnostic.row >= 0
    ? diagnostic.row
    : null;
  const parserColumn = Number.isInteger(diagnostic?.index)
    && diagnostic.index >= 0
    ? diagnostic.index
    : null;
  const result = {
    code: sanitizeDiagnosticString(
      diagnostic?.code,
      'CSV_PARSE_DIAGNOSTIC',
      64,
    ),
    type: sanitizeDiagnosticString(
      diagnostic?.type,
      'Parse',
      64,
    ),
    message: sanitizeDiagnosticString(
      diagnostic?.message,
      'The CSV parser reported an issue.',
      512,
    ),
  };

  if (parserRow !== null) {
    result.row = parserRow;
    result.rowRef = parserRow + 2;
    result.rowRefs = [parserRow + 2];
  }

  if (parserColumn !== null) {
    result.column = parserColumn;
  }

  result.diagnosticIndex = index;

  return result;
};

const createDuplicateHeaderDiagnostics = (headers) => {
  const occurrences = new Map();
  const diagnostics = [];

  headers.forEach((header) => {
    if (!header) {
      return;
    }

    const comparisonKey = header.toLowerCase();
    const count = (occurrences.get(comparisonKey) ?? 0) + 1;

    occurrences.set(comparisonKey, count);

    if (count > 1) {
      diagnostics.push({
        code: CSV_IMPORT_PARSER_ERROR_CODES.DUPLICATE_COLUMN,
        type: 'FieldMismatch',
        message: `The CSV header "${header}" is duplicated.`,
        row: 0,
        rowRef: 1,
        rowRefs: [1],
      });
    }
  });

  return diagnostics;
};

const createSafeMeta = (meta, headers) => ({
  delimiter: typeof meta?.delimiter === 'string'
    ? meta.delimiter
    : '',
  linebreak: typeof meta?.linebreak === 'string'
    ? meta.linebreak
    : '',
  aborted: Boolean(meta?.aborted),
  truncated: Boolean(meta?.truncated),
  cursor: Number.isInteger(meta?.cursor) && meta.cursor >= 0
    ? meta.cursor
    : 0,
  fields: [...headers],
});

const resolveParser = (parser) => {
  if (typeof parser === 'function') {
    return parser;
  }

  if (typeof parser?.parse === 'function') {
    return parser.parse.bind(parser);
  }

  return null;
};

const createFailureResult = (code, message, diagnostics = []) => ({
  ok: false,
  data: null,
  error: createError(code, message),
  diagnostics,
  warnings: diagnostics,
});

/**
 * Parses CSV text into header-keyed records and sanitized parser diagnostics.
 */
export class CsvImportParser {
  constructor(parser = Papa) {
    this.parser = parser;
  }

  /**
   * Parses a CSV file descriptor using Papa Parse header mode.
   *
   * @param {{textContent?: string}|string} fileDescriptor CSV descriptor.
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
        CSV_IMPORT_PARSER_ERROR_CODES.CONTENT_REQUIRED,
        'CSV text content is required.',
      );
    }

    if (!textContent.replace(/^\uFEFF/, '').trim()) {
      return createFailureResult(
        CSV_IMPORT_PARSER_ERROR_CODES.FILE_EMPTY,
        'The CSV file is empty.',
      );
    }

    const parse = resolveParser(this.parser);

    if (!parse) {
      return createFailureResult(
        CSV_IMPORT_PARSER_ERROR_CODES.PARSE_FAILED,
        'The CSV parser is unavailable.',
      );
    }

    const sourceHeaders = [];
    let parsed;

    try {
      parsed = parse(textContent, {
        header: true,
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        transformHeader(header, index) {
          const normalizedHeader = normalizeHeader(header, index);
          sourceHeaders.push(normalizedHeader);
          return normalizedHeader;
        },
      });
    } catch {
      return createFailureResult(
        CSV_IMPORT_PARSER_ERROR_CODES.PARSE_FAILED,
        'The CSV file could not be parsed.',
      );
    }

    if (
      parsed === null
      || typeof parsed !== 'object'
      || !Array.isArray(parsed.data)
    ) {
      return createFailureResult(
        CSV_IMPORT_PARSER_ERROR_CODES.PARSE_FAILED,
        'The CSV parser returned an invalid result.',
      );
    }

    const headers = Array.isArray(parsed.meta?.fields)
      ? parsed.meta.fields.map(normalizeHeader)
      : [...sourceHeaders];
    const parserDiagnostics = Array.isArray(parsed.errors)
      ? parsed.errors.map(createParserDiagnostic)
      : [];
    const diagnostics = [
      ...createDuplicateHeaderDiagnostics(sourceHeaders),
      ...parserDiagnostics,
    ];

    if (
      headers.length === 0
      || headers.every((header) => !header)
    ) {
      return createFailureResult(
        CSV_IMPORT_PARSER_ERROR_CODES.MISSING_HEADER,
        'The CSV file must include a non-empty header row.',
        diagnostics,
      );
    }

    if (parsed.meta?.aborted) {
      return createFailureResult(
        CSV_IMPORT_PARSER_ERROR_CODES.PARSE_FAILED,
        'The CSV parsing operation was aborted.',
        diagnostics,
      );
    }

    const records = parsed.data.filter(isMeaningfulRecord);

    if (records.length === 0) {
      return createFailureResult(
        CSV_IMPORT_PARSER_ERROR_CODES.NO_DATA_ROWS,
        'The CSV file must include at least one non-empty data row.',
        diagnostics,
      );
    }

    const rowRefs = records.map((_, index) => index + 2);
    const safeMeta = createSafeMeta(parsed.meta, headers);

    return {
      ok: true,
      data: {
        format: 'csv',
        headers: [...headers],
        fields: [...headers],
        records,
        rows: records,
        rowRefs,
        diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
        meta: safeMeta,
      },
      diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
      warnings: diagnostics.map((diagnostic) => ({ ...diagnostic })),
    };
  }

  /**
   * Alias for parsing a CSV file descriptor.
   *
   * @param {{textContent?: string}|string} fileDescriptor CSV descriptor.
   * @returns {object} Parse result.
   */
  parseFile(fileDescriptor) {
    return this.parse(fileDescriptor);
  }
}

export const csvImportParser = new CsvImportParser();

export default csvImportParser;