import { DEFAULT_THRESHOLDS } from '../constants/domainConstants.js';
import {
  createDatasetMetadata,
  createNormalizedDataset,
} from '../domain/schemas.js';
import datasetRepository from '../repositories/datasetRepository.js';
import demoUserRepository from '../repositories/demoUserRepository.js';
import persistenceStatusRepository from '../repositories/persistenceStatusRepository.js';
import preferenceRepository from '../repositories/preferenceRepository.js';
import authService from './authService.js';
import mockDatasetProvider from './mockDatasetProvider.js';
import recoveryService from './recoveryService.js';
import noticeCenterStore from '../stores/noticeCenterStore.js';

export const BOOTSTRAP_DATASET_STATUSES = Object.freeze({
  BOOTSTRAPPED_MOCK: 'bootstrapped_mock',
  RESTORED_EXISTING: 'restored_existing',
  RECOVERED_MOCK: 'recovered_mock',
  MEMORY_ONLY: 'memory_only',
  NO_DATASET: 'no_dataset',
});

export const BOOTSTRAP_ERROR_CODES = Object.freeze({
  DEMO_USERS_INITIALIZATION_FAILED: 'BOOTSTRAP_DEMO_USERS_INITIALIZATION_FAILED',
  DATASET_READ_FAILED: 'BOOTSTRAP_DATASET_READ_FAILED',
  DATASET_INITIALIZATION_FAILED: 'BOOTSTRAP_DATASET_INITIALIZATION_FAILED',
  INITIALIZATION_FAILED: 'BOOTSTRAP_INITIALIZATION_FAILED',
});

const RECOVERY_NOTICE_CODE = 'DATASET_RECOVERED_FROM_INVALID_STATE';

const createError = (code, message) => ({
  code,
  message,
});

const isPreferenceRepository = (value) => (
  value !== null
  && typeof value === 'object'
  && (
    typeof value.getFilters === 'function'
    || typeof value.saveFilters === 'function'
    || typeof value.getThresholds === 'function'
    || typeof value.saveThresholds === 'function'
  )
);

const cloneError = (error) => {
  if (error === null || typeof error !== 'object') {
    return null;
  }

  const code = typeof error.code === 'string'
    ? error.code
    : 'UNKNOWN_BOOTSTRAP_WARNING';
  const message = typeof error.message === 'string'
    ? error.message
    : 'A browser-local startup operation could not be completed.';

  return {
    code,
    message,
  };
};

const appendWarning = (warnings, error) => {
  const warning = cloneError(error);

  if (
    warning
    && !warnings.some((candidate) => (
      candidate.code === warning.code
      && candidate.message === warning.message
    ))
  ) {
    warnings.push(warning);
  }
};

const resolveTimestamp = () => new Date().toISOString();

const resolvePersistenceMode = (value, fallback = 'localStorage') => {
  const candidates = [
    value?.persistenceMode,
    value?.mode,
    value?.metadata?.persistenceMode,
    value?.datasetMetadata?.persistenceMode,
    value?.data?.persistenceMode,
    value?.data?.mode,
    value?.data?.metadata?.persistenceMode,
    value?.data?.datasetMetadata?.persistenceMode,
  ];

  return candidates.includes('memory')
    ? 'memory'
    : candidates.includes('localStorage')
      ? 'localStorage'
      : fallback;
};

const readActiveDataset = (repository) => {
  try {
    if (typeof repository?.getActiveDataset === 'function') {
      return repository.getActiveDataset();
    }

    const metadataResult = typeof repository?.getMetadata === 'function'
      ? repository.getMetadata()
      : repository?.getActiveDatasetMetadata?.();
    const datasetResult = typeof repository?.getContent === 'function'
      ? repository.getContent()
      : repository?.getDataset?.();

    if (!metadataResult?.ok || !datasetResult?.ok) {
      return {
        ok: false,
        data: null,
        error: metadataResult?.error
          ?? datasetResult?.error
          ?? createError(
            BOOTSTRAP_ERROR_CODES.DATASET_READ_FAILED,
            'The active dataset could not be restored.',
          ),
      };
    }

    if (
      metadataResult.data === null
      && datasetResult.data === null
    ) {
      return {
        ok: true,
        data: null,
      };
    }

    if (
      metadataResult.data === null
      || datasetResult.data === null
    ) {
      return {
        ok: false,
        data: null,
        error: createError(
          'INCOMPLETE_DATASET',
          'Stored dataset metadata and content are incomplete.',
        ),
      };
    }

    return {
      ok: true,
      data: {
        metadata: metadataResult.data,
        dataset: datasetResult.data,
      },
      mode: metadataResult.data.persistenceMode,
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        BOOTSTRAP_ERROR_CODES.DATASET_READ_FAILED,
        'The active dataset could not be restored.',
      ),
    };
  }
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

const readProviderDataset = (provider) => {
  if (typeof provider?.getDataset === 'function') {
    return provider.getDataset();
  }

  if (typeof provider?.getMockDataset === 'function') {
    return provider.getMockDataset();
  }

  return provider?.getBootstrapData?.()?.dataset;
};

const readProviderMetadata = (provider) => {
  if (typeof provider?.getDatasetMetadata === 'function') {
    return provider.getDatasetMetadata();
  }

  if (typeof provider?.getMetadata === 'function') {
    return provider.getMetadata();
  }

  return provider?.getBootstrapData?.()?.metadata;
};

const readNotices = (store) => {
  try {
    if (typeof store?.getNotices === 'function') {
      return store.getNotices();
    }

    const state = store?.getState?.();
    const notices = state?.notices ?? state?.items;

    return Array.isArray(notices) ? notices : [];
  } catch {
    return [];
  }
};

const createRecoveryNoticeSummary = (store) => (
  readNotices(store)
    .filter((notice) => notice?.code === RECOVERY_NOTICE_CODE)
    .map((notice) => ({
      code: notice.code,
      severity: notice.severity,
    }))
);

const readPreference = (repository, type) => {
  try {
    if (type === 'filters') {
      if (typeof repository?.getFilters === 'function') {
        return repository.getFilters();
      }

      return repository?.getFilterPreferences?.();
    }

    if (typeof repository?.getThresholds === 'function') {
      return repository.getThresholds();
    }

    return repository?.getThresholdPreferences?.();
  } catch {
    return null;
  }
};

const savePreference = (repository, type, value) => {
  try {
    if (type === 'filters') {
      if (typeof repository?.saveFilters === 'function') {
        return repository.saveFilters(value);
      }

      if (typeof repository?.saveFilterPreferences === 'function') {
        return repository.saveFilterPreferences(value);
      }

      return repository?.setFilters?.(value);
    }

    if (typeof repository?.saveThresholds === 'function') {
      return repository.saveThresholds(value);
    }

    if (typeof repository?.saveThresholdPreferences === 'function') {
      return repository.saveThresholdPreferences(value);
    }

    return repository?.setThresholds?.(value);
  } catch {
    return null;
  }
};

/**
 * Coordinates browser-local startup initialization and recovery.
 */
export class BootstrapService {
  constructor(
    userRepository = demoUserRepository,
    sessionService = authService,
    activeDatasetRepository = datasetRepository,
    provider = mockDatasetProvider,
    datasetRecoveryService = recoveryService,
    statusRepository = persistenceStatusRepository,
    recoveryNoticeStore = noticeCenterStore,
    logger = null,
    preferences = preferenceRepository,
  ) {
    this.demoUserRepository = userRepository;
    this.authService = sessionService;
    this.datasetRepository = activeDatasetRepository;
    this.mockDatasetProvider = provider;
    this.recoveryService = datasetRecoveryService;
    this.persistenceStatusRepository = statusRepository;
    this.noticeCenterStore = recoveryNoticeStore;
    this.preferenceRepository = isPreferenceRepository(logger)
      ? logger
      : preferences;
    this.logger = isPreferenceRepository(logger) ? null : logger;
  }

  /**
   * Initializes demo users, session state, dataset state, and preferences.
   *
   * @returns {{
   *   ok: boolean,
   *   data: object|null,
   *   warnings?: object[],
   *   error?: object
   * }} Bootstrap result.
   */
  initialize() {
    const warnings = [];

    try {
      const usersResult = this.ensureDemoUsers();

      if (!usersResult.ok) {
        return {
          ok: false,
          data: null,
          error: usersResult.error,
          warnings,
        };
      }

      appendWarning(warnings, usersResult.error);

      const sessionResult = this.restoreSession();

      if (!sessionResult.ok) {
        appendWarning(warnings, sessionResult.error);
      } else {
        appendWarning(warnings, sessionResult.error);
      }

      const datasetResult = this.ensureDataset();

      if (!datasetResult.ok) {
        return {
          ok: false,
          data: null,
          error: datasetResult.error,
          warnings,
        };
      }

      datasetResult.warnings?.forEach((warning) => {
        appendWarning(warnings, warning);
      });
      appendWarning(warnings, datasetResult.error);

      const preferencesResult = this.ensureDefaultPreferences();

      preferencesResult.warnings.forEach((warning) => {
        appendWarning(warnings, warning);
      });

      const persistenceMode = resolvePersistenceMode(
        datasetResult.data,
        'localStorage',
      );
      const persistenceResult = this.ensurePersistenceStatus(
        persistenceMode,
      );

      appendWarning(warnings, persistenceResult.error);

      const activePersistenceMode = resolvePersistenceMode(
        persistenceResult,
        persistenceMode,
      );
      const datasetStatus = activePersistenceMode === 'memory'
        ? BOOTSTRAP_DATASET_STATUSES.MEMORY_ONLY
        : datasetResult.data.status;

      return {
        ok: true,
        data: {
          demoUsersInitialized: usersResult.data.initialized,
          sessionRestored: Boolean(sessionResult.data?.session),
          session: sessionResult.data?.session ?? null,
          datasetStatus,
          persistenceMode: activePersistenceMode,
          recoveryNotices: createRecoveryNoticeSummary(
            this.noticeCenterStore,
          ),
          preferencesInitialized: {
            filters: preferencesResult.data.filtersInitialized,
            thresholds: preferencesResult.data.thresholdsInitialized,
          },
          datasetMetadata: datasetResult.data.metadata ?? null,
          metadata: datasetResult.data.metadata ?? null,
          dataset: datasetResult.data.dataset ?? null,
        },
        warnings,
      };
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          BOOTSTRAP_ERROR_CODES.INITIALIZATION_FAILED,
          'The application could not complete browser-local startup.',
        ),
        warnings,
      };
    }
  }

  /**
   * Ensures bundled demo users exist in browser-local persistence.
   *
   * @returns {{
   *   ok: boolean,
   *   data: {initialized: boolean, users: object[]}|null,
   *   mode?: string,
   *   error?: object
   * }} Initialization result.
   */
  ensureDemoUsers() {
    try {
      if (
        typeof this.demoUserRepository?.ensureSeeded === 'function'
      ) {
        const result = this.demoUserRepository.ensureSeeded();

        if (!result?.ok) {
          return {
            ok: false,
            data: null,
            mode: result?.mode,
            error: result?.error ?? createError(
              BOOTSTRAP_ERROR_CODES.DEMO_USERS_INITIALIZATION_FAILED,
              'Demo users could not be initialized.',
            ),
          };
        }

        return result;
      }

      const existing = typeof this.demoUserRepository?.getUsers
        === 'function'
        ? this.demoUserRepository.getUsers()
        : this.demoUserRepository?.getAll?.();

      if (existing?.ok && Array.isArray(existing.data)) {
        return {
          ok: true,
          data: {
            initialized: false,
            users: existing.data.map((user) => ({ ...user })),
          },
        };
      }

      const users = this.mockDatasetProvider?.getDemoUsers?.()
        ?? this.mockDatasetProvider?.getUsers?.();
      const seeded = this.demoUserRepository?.seed?.(users);

      if (!seeded?.ok) {
        return {
          ok: false,
          data: null,
          mode: seeded?.mode,
          error: seeded?.error ?? createError(
            BOOTSTRAP_ERROR_CODES.DEMO_USERS_INITIALIZATION_FAILED,
            'Demo users could not be initialized.',
          ),
        };
      }

      return {
        ok: true,
        data: {
          initialized: true,
          users: seeded.data?.users ?? users ?? [],
        },
        mode: seeded.mode,
        error: seeded.error,
      };
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          BOOTSTRAP_ERROR_CODES.DEMO_USERS_INITIALIZATION_FAILED,
          'Demo users could not be initialized.',
        ),
      };
    }
  }

  /**
   * Restores the active browser-local session.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Restore result.
   */
  restoreSession() {
    try {
      const result = this.authService?.restoreSession?.();

      if (!result?.ok) {
        return {
          ok: false,
          data: null,
          error: result?.error ?? createError(
            'BOOTSTRAP_SESSION_RESTORE_FAILED',
            'The active session could not be restored.',
          ),
        };
      }

      return result;
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          'BOOTSTRAP_SESSION_RESTORE_FAILED',
          'The active session could not be restored.',
        ),
      };
    }
  }

  /**
   * Restores a valid active dataset or invokes bundled-data recovery.
   *
   * @returns {{
   *   ok: boolean,
   *   data: object|null,
   *   warnings?: object[],
   *   error?: object
   * }} Dataset initialization result.
   */
  ensureDataset() {
    const existing = readActiveDataset(this.datasetRepository);

    if (existing.ok && existing.data) {
      return {
        ok: true,
        data: {
          status: BOOTSTRAP_DATASET_STATUSES.RESTORED_EXISTING,
          datasetStatus: BOOTSTRAP_DATASET_STATUSES.RESTORED_EXISTING,
          metadata: existing.data.metadata,
          datasetMetadata: existing.data.metadata,
          dataset: existing.data.dataset,
          persistenceMode: resolvePersistenceMode(existing),
        },
        warnings: [],
      };
    }

    if (existing.ok) {
      return this.recoverDataset(
        {
          code: 'DATASET_MISSING',
          message: 'No active dataset is stored.',
        },
        true,
      );
    }

    return this.recoverDataset(existing.error, false);
  }

  /**
   * Initializes empty filter preferences and default capacity thresholds.
   *
   * @returns {{
   *   ok: boolean,
   *   data: {filtersInitialized: boolean, thresholdsInitialized: boolean},
   *   warnings: object[]
   * }} Preference initialization result.
   */
  ensureDefaultPreferences() {
    const warnings = [];
    let filtersInitialized = false;
    let thresholdsInitialized = false;

    const filters = readPreference(
      this.preferenceRepository,
      'filters',
    );

    if (!filters?.ok || filters.data === null) {
      appendWarning(warnings, filters?.error);

      const savedFilters = savePreference(
        this.preferenceRepository,
        'filters',
        {},
      );

      if (savedFilters?.ok) {
        filtersInitialized = true;
        appendWarning(warnings, savedFilters.error);
      } else {
        appendWarning(
          warnings,
          savedFilters?.error ?? createError(
            'BOOTSTRAP_FILTER_PREFERENCES_FAILED',
            'Default forecast filters could not be initialized.',
          ),
        );
      }
    }

    const thresholds = readPreference(
      this.preferenceRepository,
      'thresholds',
    );

    if (!thresholds?.ok || thresholds.data === null) {
      appendWarning(warnings, thresholds?.error);

      const savedThresholds = savePreference(
        this.preferenceRepository,
        'thresholds',
        DEFAULT_THRESHOLDS,
      );

      if (savedThresholds?.ok) {
        thresholdsInitialized = true;
        appendWarning(warnings, savedThresholds.error);
      } else {
        appendWarning(
          warnings,
          savedThresholds?.error ?? createError(
            'BOOTSTRAP_THRESHOLD_PREFERENCES_FAILED',
            'Default capacity thresholds could not be initialized.',
          ),
        );
      }
    }

    return {
      ok: true,
      data: {
        filtersInitialized,
        thresholdsInitialized,
      },
      warnings,
    };
  }

  /**
   * Ensures persistence status reflects the active storage mode.
   *
   * @param {'localStorage'|'memory'} mode Active persistence mode.
   * @returns {{ok: boolean, data?: object, mode?: string, error?: object}}
   * Status result.
   */
  ensurePersistenceStatus(mode) {
    const normalizedMode = mode === 'memory'
      ? 'memory'
      : 'localStorage';

    try {
      const existing = typeof this.persistenceStatusRepository
        ?.getStatus === 'function'
        ? this.persistenceStatusRepository.getStatus()
        : this.persistenceStatusRepository?.get?.();

      if (
        existing?.ok
        && existing.data
        && existing.data.mode === normalizedMode
      ) {
        return {
          ok: true,
          data: existing.data,
          mode: normalizedMode,
        };
      }

      let result;

      if (
        typeof this.persistenceStatusRepository?.recordStatus
        === 'function'
      ) {
        result = this.persistenceStatusRepository.recordStatus(
          normalizedMode,
          normalizedMode === 'memory'
            ? createError(
              'STORAGE_UNAVAILABLE',
              'Browser storage is unavailable. Changes will be kept in memory for this session.',
            )
            : null,
        );
      } else if (
        normalizedMode === 'localStorage'
        && typeof this.persistenceStatusRepository?.markLocalStorage
          === 'function'
      ) {
        result = this.persistenceStatusRepository.markLocalStorage();
      } else if (
        normalizedMode === 'memory'
        && typeof this.persistenceStatusRepository?.markMemoryOnly
          === 'function'
      ) {
        result = this.persistenceStatusRepository.markMemoryOnly(
          createError(
            'STORAGE_UNAVAILABLE',
            'Browser storage is unavailable. Changes will be kept in memory for this session.',
          ),
        );
      } else {
        result = this.persistenceStatusRepository?.saveStatus?.({
          mode: normalizedMode,
          updatedAt: resolveTimestamp(),
          lastError: normalizedMode === 'memory'
            ? createError(
              'STORAGE_UNAVAILABLE',
              'Browser storage is unavailable. Changes will be kept in memory for this session.',
            )
            : null,
        });
      }

      if (!result?.ok) {
        return {
          ok: false,
          mode: normalizedMode,
          error: result?.error ?? createError(
            'BOOTSTRAP_PERSISTENCE_STATUS_FAILED',
            'The browser persistence status could not be initialized.',
          ),
        };
      }

      return result;
    } catch {
      return {
        ok: false,
        mode: normalizedMode,
        error: createError(
          'BOOTSTRAP_PERSISTENCE_STATUS_FAILED',
          'The browser persistence status could not be initialized.',
        ),
      };
    }
  }

  recoverDataset(reason, missingDataset) {
    let result;

    try {
      if (
        missingDataset
        && typeof this.recoveryService?.recoverMissingDataset
          === 'function'
      ) {
        result = this.recoveryService.recoverMissingDataset(reason);
      } else if (
        !missingDataset
        && typeof this.recoveryService
          ?.recoverUnsupportedOrMalformedDataset === 'function'
      ) {
        result = this.recoveryService
          .recoverUnsupportedOrMalformedDataset(reason);
      } else if (typeof this.recoveryService?.recover === 'function') {
        result = this.recoveryService.recover(reason);
      } else {
        result = this.bootstrapMockDataset(missingDataset);
      }
    } catch {
      result = null;
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          BOOTSTRAP_ERROR_CODES.DATASET_INITIALIZATION_FAILED,
          'A valid active dataset could not be initialized.',
        ),
        warnings: [],
      };
    }

    const metadata = result.data?.metadata
      ?? result.data?.datasetMetadata
      ?? null;
    const status = result.data?.status
      ?? (
        missingDataset
          ? BOOTSTRAP_DATASET_STATUSES.BOOTSTRAPPED_MOCK
          : BOOTSTRAP_DATASET_STATUSES.RECOVERED_MOCK
      );

    return {
      ok: true,
      data: {
        ...result.data,
        status,
        datasetStatus: result.data?.datasetStatus ?? status,
        metadata,
        datasetMetadata: metadata,
        persistenceMode: resolvePersistenceMode(result),
      },
      warnings: Array.isArray(result.warnings)
        ? result.warnings.map((warning) => ({ ...warning }))
        : [],
      error: result.error,
    };
  }

  bootstrapMockDataset(missingDataset) {
    try {
      const dataset = createNormalizedDataset(
        readProviderDataset(this.mockDatasetProvider),
      );
      const sourceMetadata = readProviderMetadata(
        this.mockDatasetProvider,
      );
      const metadata = createDatasetMetadata({
        ...sourceMetadata,
        sourceType: missingDataset ? 'mock' : 'recovered-mock',
        importedAt: resolveTimestamp(),
        recordCounts: {
          workItems: dataset.workItems.length,
          capacityRecords: dataset.capacityRecords.length,
          warnings: 0,
          rejected: 0,
        },
      });
      const activation = activateDataset(
        this.datasetRepository,
        dataset,
        metadata,
      );

      if (!activation?.ok) {
        return {
          ok: false,
          data: null,
          error: activation?.error,
        };
      }

      const activeMetadata = activation.data?.metadata ?? metadata;

      return {
        ok: true,
        data: {
          status: missingDataset
            ? BOOTSTRAP_DATASET_STATUSES.BOOTSTRAPPED_MOCK
            : BOOTSTRAP_DATASET_STATUSES.RECOVERED_MOCK,
          metadata: activeMetadata,
          datasetMetadata: activeMetadata,
          dataset: activation.data?.dataset ?? dataset,
          persistenceMode: resolvePersistenceMode(activation),
        },
        warnings: activation.error ? [{ ...activation.error }] : [],
      };
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          BOOTSTRAP_ERROR_CODES.DATASET_INITIALIZATION_FAILED,
          'The bundled demo dataset could not be initialized.',
        ),
      };
    }
  }
}

export const bootstrapService = new BootstrapService();

export default bootstrapService;