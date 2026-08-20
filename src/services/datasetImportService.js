import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';
import {
  ERROR_CODES,
  IMPORT_POLICY,
  NOTICE_CODES,
} from '../constants/domainConstants.js';
import {
  createDatasetMetadata,
  createImportSummary,
} from '../domain/schemas.js';
import datasetRepository from '../repositories/datasetRepository.js';
import importSummaryRepository from '../repositories/importSummaryRepository.js';
import noticeCenterStore from '../stores/noticeCenterStore.js';
import capacityCoverageValidator from './import/capacityCoverageValidator.js';
import normalizationService from './import/normalizationService.js';
import parserRegistry from './import/parserRegistry.js';

export const DATASET_IMPORT_ERROR_CODES = Object.freeze({
  INVALID_FILE_DESCRIPTOR: 'IMPORT_INVALID_FILE_DESCRIPTOR',
  IMPORT_IN_PROGRESS: 'IMPORT_IN_PROGRESS',
  FILE_READ_FAILED: ERROR_CODES.FILE_READ_FAILED,
  PARSE_FAILED: ERROR_CODES.PARSE_FAILED,
  VALIDATION_FAILED: 'IMPORT_VALIDATION_FAILED',
  METADATA_CREATION_FAILED: 'IMPORT_METADATA_CREATION_FAILED',
  ACTIVATION_FAILED: 'IMPORT_ACTIVATION_FAILED',
});

const createError = (code, message, details) => {
  const error = {
    code,
    message,
  };

  if (
    details !== undefined
    && details !== null
    && typeof details === 'object'
  ) {
    error.details = { ...details };
  }

  return error;
};

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const resolveTimestamp = (clock) => {
  let value;

  try {
    value = typeof clock === 'function'
      ? clock()
      : clock?.now?.();
  } catch {
    value = null;
  }

  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(value);

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
};

const sanitizeString = (value, fallback, maximumLength) => {
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

const normalizeRowRefs = (value) => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return [...new Set(
    value
      .map(Number)
      .filter((rowRef) => (
        Number.isInteger(rowRef) && rowRef >= 1
      )),
  )].sort((first, second) => first - second);
};

const sanitizeWarning = (warning) => {
  const source = isRecord(warning) ? warning : {};
  const sanitized = {
    code: sanitizeString(
      source.code,
      'IMPORT_WARNING',
      64,
    ),
    message: sanitizeString(
      source.message,
      'The import completed with a warning.',
      512,
    ),
  };
  const rowRefs = normalizeRowRefs(
    source.rowRefs
      ?? (
        Number.isInteger(source.rowRef)
          ? [source.rowRef]
          : undefined
      ),
  );

  if (rowRefs !== undefined) {
    sanitized.rowRefs = rowRefs;
  }

  return sanitized;
};

const warningSignature = (warning) => JSON.stringify([
  warning.code,
  warning.message,
  warning.rowRefs ?? [],
]);

const collectWarnings = (...collections) => {
  const signatures = new Set();
  const warnings = [];

  collections.forEach((collection) => {
    if (!Array.isArray(collection)) {
      return;
    }

    collection.forEach((warning) => {
      const sanitized = sanitizeWarning(warning);
      const signature = warningSignature(sanitized);

      if (!signatures.has(signature)) {
        signatures.add(signature);
        warnings.push(sanitized);
      }
    });
  });

  return warnings;
};

const normalizeCount = (value, fallback = 0) => {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized >= 0
    ? normalized
    : fallback;
};

const resolveFileName = (fileDescriptor) => (
  sanitizeString(
    fileDescriptor?.fileName
      ?? fileDescriptor?.name
      ?? fileDescriptor?.file?.name,
    'Imported dataset',
    256,
  )
);

const resolveFileSize = (fileDescriptor) => {
  const candidate = fileDescriptor?.sizeBytes
    ?? fileDescriptor?.size
    ?? fileDescriptor?.file?.size;

  if (candidate === undefined || candidate === null || candidate === '') {
    return null;
  }

  const size = Number(candidate);

  return Number.isFinite(size) && size >= 0 ? size : Number.NaN;
};

const normalizeFileDescriptor = (fileDescriptor, textContent) => ({
  ...fileDescriptor,
  fileName: fileDescriptor.fileName
    ?? fileDescriptor.name
    ?? fileDescriptor.file?.name,
  name: fileDescriptor.name
    ?? fileDescriptor.fileName
    ?? fileDescriptor.file?.name,
  mimeType: fileDescriptor.mimeType
    ?? fileDescriptor.type
    ?? fileDescriptor.file?.type
    ?? '',
  sizeBytes: fileDescriptor.sizeBytes
    ?? fileDescriptor.size
    ?? fileDescriptor.file?.size,
  textContent,
});

const readWithFileReader = (file) => new Promise((resolve, reject) => {
  if (typeof FileReader !== 'function') {
    reject(new TypeError('The browser file reader is unavailable.'));
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    if (typeof reader.result === 'string') {
      resolve(reader.result);
      return;
    }

    reject(new TypeError('The selected file did not contain text.'));
  };
  reader.onerror = () => {
    reject(reader.error ?? new TypeError('The selected file could not be read.'));
  };
  reader.onabort = () => {
    reject(new TypeError('The selected file read was aborted.'));
  };

  reader.readAsText(file);
});

const resolveTextContent = async (fileDescriptor) => {
  if (typeof fileDescriptor.textContent === 'string') {
    return fileDescriptor.textContent;
  }

  if (typeof fileDescriptor.content === 'string') {
    return fileDescriptor.content;
  }

  const file = fileDescriptor.file ?? fileDescriptor;

  if (typeof file?.text === 'function') {
    const content = await file.text();

    if (typeof content !== 'string') {
      throw new TypeError('The selected file did not contain text.');
    }

    return content;
  }

  if (typeof Blob === 'function' && file instanceof Blob) {
    return readWithFileReader(file);
  }

  throw new TypeError('The selected file could not be read as text.');
};

const invokeParser = async (registry, fileDescriptor) => {
  if (typeof registry?.parse === 'function') {
    return registry.parse(fileDescriptor);
  }

  const resolution = typeof registry?.resolve === 'function'
    ? registry.resolve(fileDescriptor)
    : registry?.resolveParser?.(fileDescriptor);

  if (!resolution?.ok) {
    return resolution;
  }

  const parser = resolution.data?.parser;

  if (typeof parser === 'function') {
    return parser(fileDescriptor);
  }

  if (typeof parser?.parse === 'function') {
    return parser.parse(fileDescriptor);
  }

  if (typeof parser?.parseFile === 'function') {
    return parser.parseFile(fileDescriptor);
  }

  return {
    ok: false,
    data: null,
    error: createError(
      DATASET_IMPORT_ERROR_CODES.PARSE_FAILED,
      'A parser is unavailable for the selected file type.',
    ),
  };
};

const invokeNormalizer = async (normalizer, parsedData, sourceMeta) => {
  if (typeof normalizer?.normalizeParsedPayload === 'function') {
    return normalizer.normalizeParsedPayload(parsedData, sourceMeta);
  }

  if (typeof normalizer?.normalize === 'function') {
    return normalizer.normalize(parsedData, sourceMeta);
  }

  return null;
};

const invokeCoverageValidator = async (
  validator,
  dataset,
  sourceContext,
) => {
  if (typeof validator?.validate === 'function') {
    return validator.validate(dataset, sourceContext);
  }

  if (typeof validator?.validateCoverage === 'function') {
    return validator.validateCoverage(dataset, sourceContext);
  }

  return {
    warnings: [],
  };
};

const saveImportSummary = (repository, summary) => {
  try {
    if (typeof repository?.saveSummary === 'function') {
      return repository.saveSummary(summary);
    }

    if (typeof repository?.save === 'function') {
      return repository.save(summary);
    }

    return repository?.set?.(summary);
  } catch {
    return {
      ok: false,
      error: createError(
        'IMPORT_SUMMARY_WRITE_FAILED',
        'The latest import summary could not be saved.',
      ),
    };
  }
};

const activateDataset = (repository, dataset, metadata) => {
  try {
    if (typeof repository?.activate === 'function') {
      return repository.activate(dataset, metadata);
    }

    if (typeof repository?.saveDataset === 'function') {
      return repository.saveDataset(dataset, metadata);
    }

    if (typeof repository?.save === 'function') {
      return repository.save(dataset, metadata);
    }

    return null;
  } catch {
    return null;
  }
};

const publishNotice = (store, notice) => {
  try {
    if (typeof store?.addNotice === 'function') {
      return store.addNotice(notice);
    }

    if (typeof store?.enqueueNotice === 'function') {
      return store.enqueueNotice(notice);
    }

    if (typeof store?.publishNotice === 'function') {
      return store.publishNotice(notice);
    }

    const state = store?.getState?.();

    if (typeof state?.addNotice === 'function') {
      return state.addNotice(notice);
    }

    return null;
  } catch {
    return null;
  }
};

const resolveGeneratedId = (idGenerator) => {
  try {
    if (typeof idGenerator === 'function') {
      return idGenerator();
    }

    if (typeof idGenerator?.generate === 'function') {
      return idGenerator.generate();
    }

    if (typeof idGenerator?.generateId === 'function') {
      return idGenerator.generateId();
    }
  } catch {
    return null;
  }

  return null;
};

const createDatasetId = (timestamp, idGenerator) => {
  const generatedId = resolveGeneratedId(idGenerator);
  const normalizedGeneratedId = sanitizeString(generatedId, '', 128);

  if (normalizedGeneratedId) {
    return normalizedGeneratedId;
  }

  const timestampPart = timestamp
    .replace(/[^0-9A-Za-z]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `import-${timestampPart}-${randomPart}`.slice(0, 128);
};

const resolveSourceUpdatedAt = (parsedData) => {
  const candidate = parsedData?.sourceUpdatedAt;

  if (
    candidate instanceof Date
    && !Number.isNaN(candidate.getTime())
  ) {
    return candidate.toISOString();
  }

  if (
    typeof candidate === 'string'
    && candidate.trim()
    && Number.isFinite(Date.parse(candidate))
  ) {
    return new Date(candidate).toISOString();
  }

  return null;
};

const createSummary = (
  acceptedRows,
  rejectedRows,
  warnings,
  createdAt,
) => createImportSummary({
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  acceptedRows,
  rejectedRows,
  warningCount: warnings.length,
  warnings,
  createdAt,
});

const createValidationFailure = (
  sourceError,
  acceptedRows,
  rejectedRows,
  warningCount,
) => {
  const causeCode = typeof sourceError?.code === 'string'
    ? sourceError.code
    : null;
  const details = {
    acceptedRows,
    rejectedRows,
    warningCount,
    currentDatasetPreserved: true,
  };

  if (causeCode) {
    details.causeCode = causeCode;
  }

  return createError(
    DATASET_IMPORT_ERROR_CODES.VALIDATION_FAILED,
    'The uploaded file could not be activated.',
    details,
  );
};

const buildSourceContext = (parsedData) => ({
  rowRefs: Array.isArray(parsedData?.rowRefs)
    ? [...parsedData.rowRefs]
    : [],
  workItemRowRefs: Array.isArray(parsedData?.workItemRowRefs)
    ? [...parsedData.workItemRowRefs]
    : [],
  capacityRecordRowRefs: Array.isArray(
    parsedData?.capacityRecordRowRefs,
  )
    ? [...parsedData.capacityRecordRowRefs]
    : [],
});

const createMemoryFallbackNotice = (error, createdAt) => ({
  code: error?.code === ERROR_CODES.STORAGE_QUOTA_EXCEEDED
    ? ERROR_CODES.STORAGE_QUOTA_EXCEEDED
    : ERROR_CODES.STORAGE_UNAVAILABLE,
  severity: 'warning',
  message: sanitizeString(
    error?.message,
    'Browser storage is unavailable. Imported data will be kept in memory for this session.',
    512,
  ),
  dismissible: true,
  createdAt,
});

const createImportNotice = (warningCount, createdAt) => ({
  code: warningCount > 0
    ? NOTICE_CODES.IMPORT_COMPLETED_WITH_WARNINGS
    : NOTICE_CODES.IMPORT_SUCCEEDED,
  severity: warningCount > 0 ? 'warning' : 'success',
  message: warningCount > 0
    ? `The dataset was imported with ${warningCount} warning${warningCount === 1 ? '' : 's'}.`
    : 'The dataset was imported successfully.',
  dismissible: true,
  createdAt,
});

/**
 * Coordinates browser-local parsing, normalization, validation, activation,
 * summary persistence, and non-blocking import notices.
 */
export class DatasetImportService {
  constructor(
    importParserRegistry = parserRegistry,
    datasetNormalizationService = normalizationService,
    coverageValidator = capacityCoverageValidator,
    activeDatasetRepository = datasetRepository,
    summaryRepository = importSummaryRepository,
    systemNoticeStore = noticeCenterStore,
    logger = null,
    clock = () => new Date(),
    idGenerator = null,
  ) {
    this.parserRegistry = importParserRegistry;
    this.normalizationService = datasetNormalizationService;
    this.capacityCoverageValidator = coverageValidator;
    this.datasetRepository = activeDatasetRepository;
    this.importSummaryRepository = summaryRepository;
    this.noticeCenterStore = systemNoticeStore;
    this.logger = logger;
    this.clock = clock;
    this.idGenerator = idGenerator;
    this.inFlightPromise = null;
  }

  /**
   * Validates import file metadata before file content is read.
   *
   * @param {object} fileDescriptor Import file descriptor.
   * @returns {{ok: boolean, data: object|null, error?: object}}
   * Validation result.
   */
  validateFileDescriptor(fileDescriptor) {
    if (!isRecord(fileDescriptor)) {
      return {
        ok: false,
        data: null,
        error: createError(
          ERROR_CODES.FILE_REQUIRED,
          'A CSV or JSON file is required.',
        ),
      };
    }

    const fileName = fileDescriptor.fileName
      ?? fileDescriptor.name
      ?? fileDescriptor.file?.name;

    if (typeof fileName !== 'string' || !fileName.trim()) {
      return {
        ok: false,
        data: null,
        error: createError(
          DATASET_IMPORT_ERROR_CODES.INVALID_FILE_DESCRIPTOR,
          'The selected file must have a valid file name.',
        ),
      };
    }

    const size = resolveFileSize(fileDescriptor);

    if (Number.isNaN(size)) {
      return {
        ok: false,
        data: null,
        error: createError(
          DATASET_IMPORT_ERROR_CODES.INVALID_FILE_DESCRIPTOR,
          'The selected file has an invalid size.',
        ),
      };
    }

    if (size === 0) {
      return {
        ok: false,
        data: null,
        error: createError(
          ERROR_CODES.FILE_EMPTY,
          'The selected file is empty.',
        ),
      };
    }

    if (
      size !== null
      && size > IMPORT_POLICY.maximumFileSizeBytes
    ) {
      return {
        ok: false,
        data: null,
        error: createError(
          ERROR_CODES.FILE_TOO_LARGE,
          `The selected file exceeds the maximum size of ${IMPORT_POLICY.maximumFileSizeBytes} bytes.`,
        ),
      };
    }

    let parserResolution;

    try {
      parserResolution = typeof this.parserRegistry?.resolve === 'function'
        ? this.parserRegistry.resolve(fileDescriptor)
        : this.parserRegistry?.resolveParser?.(fileDescriptor);
    } catch {
      parserResolution = null;
    }

    if (!parserResolution?.ok) {
      return {
        ok: false,
        data: null,
        error: parserResolution?.error ?? createError(
          ERROR_CODES.UNSUPPORTED_FILE_FORMAT,
          'Only CSV and JSON files are supported.',
        ),
      };
    }

    return {
      ok: true,
      data: {
        fileName: fileName.trim(),
        sizeBytes: size,
        format: parserResolution.data?.format ?? null,
      },
    };
  }

  /**
   * Imports, validates, and optionally activates a browser-local dataset.
   *
   * @param {object} fileDescriptor Import file descriptor.
   * @returns {Promise<{
   *   ok: boolean,
   *   data: object|null,
   *   warnings?: object[],
   *   error?: object
   * }>} Import result.
   */
  importFile(fileDescriptor) {
    if (this.inFlightPromise) {
      return Promise.resolve({
        ok: false,
        data: null,
        error: createError(
          DATASET_IMPORT_ERROR_CODES.IMPORT_IN_PROGRESS,
          'Another dataset import is already in progress.',
        ),
      });
    }

    const operation = this.runImport(fileDescriptor);
    let trackedPromise;

    trackedPromise = Promise.resolve(operation).finally(() => {
      if (this.inFlightPromise === trackedPromise) {
        this.inFlightPromise = null;
      }
    });
    this.inFlightPromise = trackedPromise;

    return trackedPromise;
  }

  async runImport(fileDescriptor) {
    const validation = this.validateFileDescriptor(fileDescriptor);
    const createdAt = resolveTimestamp(this.clock);

    if (!validation.ok) {
      this.persistFailureSummary(createdAt, [], 0, 0);
      this.publishFailureNotice(validation.error, createdAt);

      return {
        ok: false,
        data: null,
        error: validation.error,
      };
    }

    let textContent;

    try {
      textContent = await resolveTextContent(fileDescriptor);
    } catch {
      const error = createError(
        DATASET_IMPORT_ERROR_CODES.FILE_READ_FAILED,
        'The selected file could not be read.',
      );

      this.persistFailureSummary(createdAt, [], 0, 0);
      this.publishFailureNotice(error, createdAt);

      return {
        ok: false,
        data: null,
        error,
      };
    }

    const normalizedDescriptor = normalizeFileDescriptor(
      fileDescriptor,
      textContent,
    );
    let parsed;

    try {
      parsed = await invokeParser(
        this.parserRegistry,
        normalizedDescriptor,
      );
    } catch {
      parsed = null;
    }

    if (!parsed?.ok) {
      const parserWarnings = collectWarnings(
        parsed?.warnings,
        parsed?.diagnostics,
      );
      const summary = this.persistFailureSummary(
        createdAt,
        parserWarnings,
        0,
        0,
      );
      const error = createValidationFailure(
        parsed?.error,
        0,
        0,
        parserWarnings.length,
      );

      this.publishFailureNotice(error, createdAt);

      return {
        ok: false,
        data: null,
        error,
        warnings: parserWarnings,
        validationSummary: summary.data,
      };
    }

    const sourceMeta = {
      fileName: validation.data.fileName,
      format: parsed.data?.format ?? validation.data.format,
      sizeBytes: validation.data.sizeBytes,
    };
    let normalized;

    try {
      normalized = await invokeNormalizer(
        this.normalizationService,
        parsed.data,
        sourceMeta,
      );
    } catch {
      normalized = null;
    }

    const parserWarnings = collectWarnings(
      parsed.warnings,
      parsed.diagnostics,
    );
    const normalizationWarnings = collectWarnings(
      normalized?.warnings,
    );
    const preliminaryWarnings = collectWarnings(
      parserWarnings,
      normalizationWarnings,
    );
    const acceptedRows = normalizeCount(
      normalized?.acceptedRows
        ?? normalized?.summary?.acceptedRows,
      0,
    );
    const rejectedRows = normalizeCount(
      normalized?.rejectedRows
        ?? normalized?.summary?.rejectedRows,
      0,
    );

    if (!normalized?.ok || !normalized.data) {
      const summaryResult = this.persistFailureSummary(
        createdAt,
        preliminaryWarnings,
        acceptedRows,
        rejectedRows,
      );
      const error = createValidationFailure(
        normalized?.error,
        acceptedRows,
        rejectedRows,
        preliminaryWarnings.length,
      );

      this.publishFailureNotice(error, createdAt);

      return {
        ok: false,
        data: null,
        error,
        warnings: preliminaryWarnings,
        validationSummary: summaryResult.data,
      };
    }

    let coverage;

    try {
      coverage = await invokeCoverageValidator(
        this.capacityCoverageValidator,
        normalized.data,
        buildSourceContext(parsed.data),
      );
    } catch {
      coverage = null;
    }

    if (!coverage) {
      const error = createValidationFailure(
        createError(
          DATASET_IMPORT_ERROR_CODES.VALIDATION_FAILED,
          'Capacity coverage could not be validated.',
        ),
        acceptedRows,
        rejectedRows,
        preliminaryWarnings.length,
      );
      const summaryResult = this.persistFailureSummary(
        createdAt,
        preliminaryWarnings,
        acceptedRows,
        rejectedRows,
      );

      this.publishFailureNotice(error, createdAt);

      return {
        ok: false,
        data: null,
        error,
        warnings: preliminaryWarnings,
        validationSummary: summaryResult.data,
      };
    }

    const warnings = collectWarnings(
      preliminaryWarnings,
      coverage.warnings,
    );
    const resolvedAcceptedRows = acceptedRows || (
      normalized.data.workItems.length
      + normalized.data.capacityRecords.length
    );
    const summary = createSummary(
      resolvedAcceptedRows,
      rejectedRows,
      warnings,
      createdAt,
    );
    const summaryResult = saveImportSummary(
      this.importSummaryRepository,
      summary,
    );
    const operationalWarnings = [];

    if (!summaryResult?.ok && summaryResult?.error) {
      operationalWarnings.push(sanitizeWarning(summaryResult.error));
    }

    const options = isRecord(fileDescriptor.options)
      ? fileDescriptor.options
      : {};
    const shouldActivate = options.activateOnSuccess !== false;
    let metadata;

    try {
      metadata = createDatasetMetadata({
        schemaVersion: SUPPORTED_SCHEMA_VERSION,
        datasetId: createDatasetId(createdAt, this.idGenerator),
        name: resolveFileName(fileDescriptor),
        sourceType: 'import',
        importedAt: createdAt,
        sourceUpdatedAt: resolveSourceUpdatedAt(parsed.data),
        recordCounts: {
          workItems: normalized.data.workItems.length,
          capacityRecords: normalized.data.capacityRecords.length,
          warnings: warnings.length,
          rejected: rejectedRows,
        },
        persistenceMode: 'localStorage',
      });
    } catch {
      const error = createError(
        DATASET_IMPORT_ERROR_CODES.METADATA_CREATION_FAILED,
        'Metadata for the imported dataset could not be created.',
        {
          acceptedRows: resolvedAcceptedRows,
          rejectedRows,
          warningCount: warnings.length,
          currentDatasetPreserved: true,
        },
      );

      this.publishFailureNotice(error, createdAt);

      return {
        ok: false,
        data: null,
        error,
        warnings,
        validationSummary: summary,
      };
    }

    let activation = {
      ok: true,
      data: {
        metadata,
        dataset: normalized.data,
      },
      mode: metadata.persistenceMode,
    };

    if (shouldActivate) {
      activation = activateDataset(
        this.datasetRepository,
        normalized.data,
        metadata,
      );

      if (!activation?.ok) {
        const error = createError(
          DATASET_IMPORT_ERROR_CODES.ACTIVATION_FAILED,
          'The uploaded file was valid, but the dataset could not be activated.',
          {
            acceptedRows: resolvedAcceptedRows,
            rejectedRows,
            warningCount: warnings.length,
            currentDatasetPreserved: true,
            causeCode: activation?.error?.code ?? null,
          },
        );

        this.publishFailureNotice(error, createdAt);

        return {
          ok: false,
          data: null,
          error,
          warnings: collectWarnings(
            warnings,
            operationalWarnings,
          ),
          validationSummary: summary,
        };
      }
    }

    const activeMetadata = activation.data?.metadata ?? metadata;
    const activeDataset = activation.data?.dataset ?? normalized.data;
    const persistenceMode = activation.mode === 'memory'
      || summaryResult?.mode === 'memory'
      ? 'memory'
      : activeMetadata.persistenceMode;
    const persistenceError = activation.error
      ?? summaryResult?.error
      ?? null;

    if (persistenceMode === 'memory') {
      publishNotice(
        this.noticeCenterStore,
        createMemoryFallbackNotice(persistenceError, createdAt),
      );
    }

    publishNotice(
      this.noticeCenterStore,
      createImportNotice(warnings.length, createdAt),
    );

    if (activation.error) {
      operationalWarnings.push(sanitizeWarning(activation.error));
    }

    return {
      ok: true,
      data: {
        datasetMetadata: activeMetadata,
        metadata: activeMetadata,
        dataset: activeDataset,
        activation: {
          activated: shouldActivate,
          activeDatasetId: shouldActivate
            ? activeMetadata.datasetId
            : null,
          persistenceMode,
        },
        validationSummary: summary,
      },
      warnings: collectWarnings(
        warnings,
        operationalWarnings,
      ),
      mode: persistenceMode,
    };
  }

  persistFailureSummary(
    createdAt,
    warnings,
    acceptedRows,
    rejectedRows,
  ) {
    const safeWarnings = collectWarnings(warnings);
    const summary = createSummary(
      normalizeCount(acceptedRows),
      normalizeCount(rejectedRows),
      safeWarnings,
      createdAt,
    );
    const result = saveImportSummary(
      this.importSummaryRepository,
      summary,
    );

    return {
      ok: Boolean(result?.ok),
      data: result?.data ?? summary,
      mode: result?.mode,
      error: result?.error,
    };
  }

  publishFailureNotice(error, createdAt) {
    publishNotice(this.noticeCenterStore, {
      code: sanitizeString(
        error?.code,
        DATASET_IMPORT_ERROR_CODES.VALIDATION_FAILED,
        64,
      ),
      severity: 'error',
      message: sanitizeString(
        error?.message,
        'The uploaded file could not be imported.',
        512,
      ),
      dismissible: true,
      createdAt,
    });
  }
}

export const datasetImportService = new DatasetImportService();

export default datasetImportService;