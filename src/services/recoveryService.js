import {
  createDatasetMetadata,
  createNormalizedDataset,
} from '../domain/schemas.js';
import datasetRepository from '../repositories/datasetRepository.js';
import persistenceStatusRepository from '../repositories/persistenceStatusRepository.js';
import mockDatasetProvider from './mockDatasetProvider.js';
import noticeCenterStore from '../stores/noticeCenterStore.js';

export const RECOVERY_ERROR_CODES = Object.freeze({
  MOCK_DATASET_UNAVAILABLE: 'RECOVERY_MOCK_DATASET_UNAVAILABLE',
  DATASET_ACTIVATION_FAILED: 'RECOVERY_DATASET_ACTIVATION_FAILED',
});

export const RECOVERY_REASON_CODES = Object.freeze({
  MISSING_DATASET: 'DATASET_MISSING',
  MALFORMED_DATASET: 'DATASET_PARSE_FAILED',
  UNSUPPORTED_SCHEMA: 'DATASET_SCHEMA_UNSUPPORTED',
});

export const RECOVERY_STATUSES = Object.freeze({
  BOOTSTRAPPED_MOCK: 'bootstrapped_mock',
  RECOVERED_MOCK: 'recovered_mock',
  MEMORY_ONLY: 'memory_only',
});

export const DATASET_RECOVERY_NOTICE_CODE = (
  'DATASET_RECOVERED_FROM_INVALID_STATE'
);

const createError = (code, message) => ({
  code,
  message,
});

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

const normalizeReasonCode = (reason) => {
  const value = typeof reason === 'string'
    ? reason
    : reason?.code;

  if (typeof value !== 'string') {
    return RECOVERY_REASON_CODES.MALFORMED_DATASET;
  }

  const normalized = value.trim().toUpperCase();

  if (
    normalized.includes('MISSING')
    || normalized.includes('INCOMPLETE')
    || normalized.includes('NOT_FOUND')
  ) {
    return RECOVERY_REASON_CODES.MISSING_DATASET;
  }

  if (
    normalized.includes('SCHEMA')
    || normalized.includes('VERSION')
    || normalized.includes('UNSUPPORTED')
    || normalized.includes('INCOMPATIBLE')
  ) {
    return RECOVERY_REASON_CODES.UNSUPPORTED_SCHEMA;
  }

  return RECOVERY_REASON_CODES.MALFORMED_DATASET;
};

const getRecoveryMessage = (reasonCode) => {
  if (reasonCode === RECOVERY_REASON_CODES.MISSING_DATASET) {
    return 'No saved dataset was available. The bundled demo dataset has been loaded.';
  }

  if (reasonCode === RECOVERY_REASON_CODES.UNSUPPORTED_SCHEMA) {
    return 'The saved dataset uses an unsupported schema. The bundled demo dataset has been restored.';
  }

  return 'The saved dataset was invalid or unreadable. The bundled demo dataset has been restored.';
};

const isPersistenceRepository = (value) => (
  value !== null
  && typeof value === 'object'
  && (
    typeof value.recordStatus === 'function'
    || typeof value.saveStatus === 'function'
    || typeof value.markLocalStorage === 'function'
    || typeof value.markMemoryOnly === 'function'
  )
);

const readProviderDataset = (provider) => {
  if (typeof provider?.getDataset === 'function') {
    return provider.getDataset();
  }

  if (typeof provider?.getMockDataset === 'function') {
    return provider.getMockDataset();
  }

  const bootstrapData = provider?.getBootstrapData?.();
  return bootstrapData?.dataset;
};

const readProviderMetadata = (provider) => {
  if (typeof provider?.getDatasetMetadata === 'function') {
    return provider.getDatasetMetadata();
  }

  if (typeof provider?.getMetadata === 'function') {
    return provider.getMetadata();
  }

  const bootstrapData = provider?.getBootstrapData?.();
  return bootstrapData?.metadata;
};

const activateDataset = (repository, dataset, metadata) => {
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
};

const normalizeStorageError = (error) => {
  if (error === null || typeof error !== 'object') {
    return null;
  }

  const code = typeof error.code === 'string'
    ? error.code.trim().slice(0, 64)
    : '';
  const message = typeof error.message === 'string'
    ? error.message.trim().slice(0, 256)
    : '';

  return code && message ? { code, message } : null;
};

const updatePersistenceStatus = (
  repository,
  mode,
  error,
  timestamp,
) => {
  const normalizedError = normalizeStorageError(error);

  try {
    if (typeof repository?.recordStatus === 'function') {
      return repository.recordStatus(
        mode,
        mode === 'memory'
          ? normalizedError ?? createError(
            'STORAGE_UNAVAILABLE',
            'Browser storage is unavailable. Changes will be kept in memory for this session.',
          )
          : null,
      );
    }

    if (
      mode === 'memory'
      && typeof repository?.markMemoryOnly === 'function'
    ) {
      return repository.markMemoryOnly(
        normalizedError ?? createError(
          'STORAGE_UNAVAILABLE',
          'Browser storage is unavailable. Changes will be kept in memory for this session.',
        ),
      );
    }

    if (
      mode === 'localStorage'
      && typeof repository?.markLocalStorage === 'function'
    ) {
      return repository.markLocalStorage();
    }

    if (typeof repository?.saveStatus === 'function') {
      return repository.saveStatus({
        mode,
        updatedAt: timestamp,
        lastError: mode === 'memory' ? normalizedError : null,
      });
    }

    return null;
  } catch {
    return null;
  }
};

const publishRecoveryNotice = (store, notice) => {
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

/**
 * Restores a known-good bundled dataset after missing, malformed, or
 * unsupported browser-local dataset state is detected.
 */
export class RecoveryService {
  constructor(
    activeDatasetRepository = datasetRepository,
    provider = mockDatasetProvider,
    recoveryNoticeStore = noticeCenterStore,
    statusRepositoryOrLogger = persistenceStatusRepository,
    clock = () => new Date(),
    logger = null,
  ) {
    this.datasetRepository = activeDatasetRepository;
    this.mockDatasetProvider = provider;
    this.noticeCenterStore = recoveryNoticeStore;
    this.persistenceStatusRepository = isPersistenceRepository(
      statusRepositoryOrLogger,
    )
      ? statusRepositoryOrLogger
      : persistenceStatusRepository;
    this.clock = clock;
    this.logger = isPersistenceRepository(statusRepositoryOrLogger)
      ? logger
      : statusRepositoryOrLogger;
  }

  /**
   * Replaces invalid or unsupported active data with the bundled mock dataset.
   *
   * @param {object|string} reason Recovery reason or error.
   * @returns {{
   *   ok: boolean,
   *   data: object|null,
   *   warnings?: object[],
   *   error?: object
   * }} Recovery result.
   */
  recoverUnsupportedOrMalformedDataset(reason) {
    return this.restoreMockDataset(
      reason,
      RECOVERY_STATUSES.RECOVERED_MOCK,
      'recovered-mock',
    );
  }

  /**
   * Bootstraps the bundled mock dataset when no active dataset exists.
   *
   * @param {object|string} reason Optional missing-dataset reason.
   * @returns {{
   *   ok: boolean,
   *   data: object|null,
   *   warnings?: object[],
   *   error?: object
   * }} Recovery result.
   */
  recoverMissingDataset(
    reason = RECOVERY_REASON_CODES.MISSING_DATASET,
  ) {
    return this.restoreMockDataset(
      reason,
      RECOVERY_STATUSES.BOOTSTRAPPED_MOCK,
      'mock',
    );
  }

  /**
   * Selects the appropriate recovery behavior for a supplied reason.
   *
   * @param {object|string} reason Recovery reason or error.
   * @returns {object} Recovery result.
   */
  recover(reason) {
    return normalizeReasonCode(reason)
      === RECOVERY_REASON_CODES.MISSING_DATASET
      ? this.recoverMissingDataset(reason)
      : this.recoverUnsupportedOrMalformedDataset(reason);
  }

  /**
   * Alias for recovering an active dataset.
   *
   * @param {object|string} reason Recovery reason or error.
   * @returns {object} Recovery result.
   */
  recoverDataset(reason) {
    return this.recover(reason);
  }

  restoreMockDataset(reason, status, sourceType) {
    const reasonCode = normalizeReasonCode(reason);
    const timestamp = resolveTimestamp(this.clock);
    let dataset;
    let sourceMetadata;

    try {
      dataset = createNormalizedDataset(
        readProviderDataset(this.mockDatasetProvider),
      );
      sourceMetadata = readProviderMetadata(this.mockDatasetProvider);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          RECOVERY_ERROR_CODES.MOCK_DATASET_UNAVAILABLE,
          'The bundled demo dataset could not be prepared for recovery.',
        ),
      };
    }

    let metadata;

    try {
      metadata = createDatasetMetadata({
        ...sourceMetadata,
        sourceType,
        importedAt: timestamp,
        recordCounts: {
          workItems: dataset.workItems.length,
          capacityRecords: dataset.capacityRecords.length,
          warnings: 0,
          rejected: 0,
        },
      });
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          RECOVERY_ERROR_CODES.MOCK_DATASET_UNAVAILABLE,
          'The bundled demo dataset metadata is invalid.',
        ),
      };
    }

    let activation;

    try {
      activation = activateDataset(
        this.datasetRepository,
        dataset,
        metadata,
      );
    } catch {
      activation = null;
    }

    if (!activation?.ok) {
      return {
        ok: false,
        data: null,
        error: activation?.error ?? createError(
          RECOVERY_ERROR_CODES.DATASET_ACTIVATION_FAILED,
          'The bundled demo dataset could not be activated.',
        ),
      };
    }

    let persistenceMode = activation.mode === 'memory'
      ? 'memory'
      : 'localStorage';
    const warnings = [];

    if (activation.error) {
      warnings.push({ ...activation.error });
    }

    const persistenceResult = updatePersistenceStatus(
      this.persistenceStatusRepository,
      persistenceMode,
      activation.error,
      timestamp,
    );

    if (persistenceResult?.mode === 'memory') {
      persistenceMode = 'memory';
    }

    if (persistenceResult?.error) {
      warnings.push({ ...persistenceResult.error });
    } else if (persistenceResult?.ok === false) {
      warnings.push(createError(
        'PERSISTENCE_STATUS_UPDATE_FAILED',
        'The active persistence status could not be updated.',
      ));
    }

    const noticeResult = publishRecoveryNotice(
      this.noticeCenterStore,
      {
        code: DATASET_RECOVERY_NOTICE_CODE,
        severity: 'info',
        message: getRecoveryMessage(reasonCode),
        dismissible: true,
        createdAt: timestamp,
      },
    );

    if (noticeResult?.error) {
      warnings.push({ ...noticeResult.error });
    }

    const finalStatus = persistenceMode === 'memory'
      ? RECOVERY_STATUSES.MEMORY_ONLY
      : status;
    const activeMetadata = activation.data?.metadata ?? metadata;
    const activeDataset = activation.data?.dataset ?? dataset;

    return {
      ok: true,
      data: {
        status: finalStatus,
        datasetStatus: status,
        reason: reasonCode,
        datasetMetadata: activeMetadata,
        metadata: activeMetadata,
        dataset: activeDataset,
        persistenceMode,
      },
      warnings,
    };
  }
}

export const recoveryService = new RecoveryService();

export default recoveryService;