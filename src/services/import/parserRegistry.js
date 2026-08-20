import {
  IMPORT_POLICY,
  SUPPORTED_FILE_FORMATS,
  SUPPORTED_MIME_TYPES,
} from '../../constants/domainConstants.js';
import csvImportParser from './csvImportParser.js';
import jsonImportParser from './jsonImportParser.js';

export const PARSER_REGISTRY_ERROR_CODES = Object.freeze({
  INVALID_FILE_DESCRIPTOR: 'IMPORT_INVALID_FILE_DESCRIPTOR',
  UNSUPPORTED_FILE_TYPE: 'IMPORT_UNSUPPORTED_FILE_TYPE',
  MIME_TYPE_MISMATCH: 'IMPORT_MIME_TYPE_MISMATCH',
  PARSER_UNAVAILABLE: 'IMPORT_PARSER_UNAVAILABLE',
});

const FORMAT_CONFIG = Object.freeze({
  [SUPPORTED_FILE_FORMATS.CSV]: Object.freeze({
    extension: '.csv',
    mimeTypes: Object.freeze([
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
    ]),
  }),
  [SUPPORTED_FILE_FORMATS.JSON]: Object.freeze({
    extension: '.json',
    mimeTypes: Object.freeze([
      'application/json',
      'text/json',
    ]),
  }),
});

const createError = (code, message) => ({
  code,
  message,
});

const createFailureResult = (code, message) => ({
  ok: false,
  data: null,
  error: createError(code, message),
});

const normalizeFileName = (value) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeMimeType = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
};

const getExtension = (fileName) => {
  const normalizedFileName = normalizeFileName(fileName);
  const separatorIndex = Math.max(
    normalizedFileName.lastIndexOf('/'),
    normalizedFileName.lastIndexOf('\\'),
  );
  const baseName = normalizedFileName.slice(separatorIndex + 1);
  const extensionIndex = baseName.lastIndexOf('.');

  if (
    extensionIndex <= 0
    || extensionIndex === baseName.length - 1
  ) {
    return '';
  }

  return baseName.slice(extensionIndex).toLowerCase();
};

const findFormatByExtension = (extension) => (
  Object.entries(FORMAT_CONFIG).find(([, config]) => (
    config.extension === extension
  ))?.[0] ?? null
);

const findFormatByMimeType = (mimeType) => (
  Object.entries(FORMAT_CONFIG).find(([, config]) => (
    config.mimeTypes.includes(mimeType)
  ))?.[0] ?? null
);

const isParser = (parser) => (
  parser !== null
  && (
    typeof parser === 'function'
    || typeof parser?.parse === 'function'
    || typeof parser?.parseFile === 'function'
  )
);

const createParserEntry = (format, parser) => ({
  format,
  extension: FORMAT_CONFIG[format].extension,
  mimeTypes: [...FORMAT_CONFIG[format].mimeTypes],
  parser,
});

/**
 * Selects an import parser using approved file extensions and MIME types.
 */
export class ParserRegistry {
  constructor(
    csvParser = csvImportParser,
    jsonParser = jsonImportParser,
  ) {
    this.parsers = new Map([
      [SUPPORTED_FILE_FORMATS.CSV, csvParser],
      [SUPPORTED_FILE_FORMATS.JSON, jsonParser],
    ]);
  }

  /**
   * Resolves the parser strategy for an import file descriptor.
   *
   * A supported extension is required. When a MIME type is supplied, it must
   * also be approved for the same format. CSV files tolerate the common
   * `application/vnd.ms-excel` browser MIME type, but spreadsheet extensions
   * such as `.xls` and `.xlsx` are never accepted.
   *
   * @param {{
   *   fileName?: string,
   *   name?: string,
   *   mimeType?: string,
   *   type?: string
   * }} fileDescriptor File metadata used for parser selection.
   * @returns {{
   *   ok: boolean,
   *   data: {
   *     format: string,
   *     extension: string,
   *     mimeTypes: string[],
   *     parser: object|Function
   *   }|null,
   *   error?: {code: string, message: string}
   * }} Parser resolution result.
   */
  resolve(fileDescriptor) {
    if (
      fileDescriptor === null
      || typeof fileDescriptor !== 'object'
      || Array.isArray(fileDescriptor)
    ) {
      return createFailureResult(
        PARSER_REGISTRY_ERROR_CODES.INVALID_FILE_DESCRIPTOR,
        'A valid file descriptor is required.',
      );
    }

    const fileName = normalizeFileName(
      fileDescriptor.fileName ?? fileDescriptor.name,
    );
    const extension = getExtension(fileName);

    if (!fileName || !extension) {
      return createFailureResult(
        PARSER_REGISTRY_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
        'Only CSV and JSON files are supported.',
      );
    }

    const extensionFormat = findFormatByExtension(extension);

    if (!extensionFormat) {
      return createFailureResult(
        PARSER_REGISTRY_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
        'Only CSV and JSON files are supported.',
      );
    }

    const rawMimeType = fileDescriptor.mimeType
      ?? fileDescriptor.type
      ?? '';
    const mimeType = normalizeMimeType(rawMimeType);

    if (
      mimeType
      && (
        !SUPPORTED_MIME_TYPES.includes(mimeType)
        && !FORMAT_CONFIG[extensionFormat].mimeTypes.includes(mimeType)
      )
    ) {
      return createFailureResult(
        PARSER_REGISTRY_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
        'The selected file has an unsupported MIME type.',
      );
    }

    const mimeFormat = mimeType
      ? findFormatByMimeType(mimeType)
      : null;

    if (mimeType && mimeFormat !== extensionFormat) {
      return createFailureResult(
        PARSER_REGISTRY_ERROR_CODES.MIME_TYPE_MISMATCH,
        'The file extension does not match its MIME type.',
      );
    }

    const parser = this.parsers.get(extensionFormat);

    if (!isParser(parser)) {
      return createFailureResult(
        PARSER_REGISTRY_ERROR_CODES.PARSER_UNAVAILABLE,
        'A parser is unavailable for the selected file type.',
      );
    }

    return {
      ok: true,
      data: createParserEntry(extensionFormat, parser),
    };
  }

  /**
   * Alias for resolving a parser strategy.
   *
   * @param {object} fileDescriptor File metadata.
   * @returns {object} Parser resolution result.
   */
  resolveParser(fileDescriptor) {
    return this.resolve(fileDescriptor);
  }

  /**
   * Returns whether a file descriptor resolves to a supported parser.
   *
   * @param {object} fileDescriptor File metadata.
   * @returns {boolean} Whether the file type is supported.
   */
  supports(fileDescriptor) {
    return this.resolve(fileDescriptor).ok;
  }

  /**
   * Parses a descriptor using its resolved parser strategy.
   *
   * @param {object} fileDescriptor Import file descriptor.
   * @returns {object} Parser result.
   */
  parse(fileDescriptor) {
    const resolved = this.resolve(fileDescriptor);

    if (!resolved.ok) {
      return resolved;
    }

    const parser = resolved.data.parser;

    try {
      if (typeof parser === 'function') {
        return parser(fileDescriptor);
      }

      if (typeof parser.parse === 'function') {
        return parser.parse(fileDescriptor);
      }

      return parser.parseFile(fileDescriptor);
    } catch {
      return createFailureResult(
        PARSER_REGISTRY_ERROR_CODES.PARSER_UNAVAILABLE,
        'The selected file parser could not process the file.',
      );
    }
  }

  /**
   * Lists the formats and extensions accepted by this registry.
   *
   * @returns {Array<{format: string, extension: string, mimeTypes: string[]}>}
   * Supported parser metadata.
   */
  listSupportedFormats() {
    return Object.keys(FORMAT_CONFIG).map((format) => ({
      format,
      extension: FORMAT_CONFIG[format].extension,
      mimeTypes: [...FORMAT_CONFIG[format].mimeTypes],
    }));
  }

  /**
   * Returns the configured maximum import file size.
   *
   * @returns {number} Maximum file size in bytes.
   */
  getMaximumFileSizeBytes() {
    return IMPORT_POLICY.maximumFileSizeBytes;
  }
}

export const parserRegistry = new ParserRegistry();

export default parserRegistry;