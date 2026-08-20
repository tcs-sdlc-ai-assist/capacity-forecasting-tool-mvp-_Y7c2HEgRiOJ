import {
  createDatasetMetadata,
  createNormalizedDataset,
} from '../domain/schemas.js';
import datasetRepository from '../repositories/datasetRepository.js';

export const DATASET_ACCESS_STATUSES = Object.freeze({
  UNKNOWN: 'unknown',
  READY: 'ready',
  EMPTY: 'empty',
  FAILED: 'failed',
});

export const DATASET_ACCESS_ERROR_CODES = Object.freeze({
  INVALID_DATASET: 'DATASET_ACCESS_INVALID_DATASET',
  READ_FAILED: 'DATASET_ACCESS_READ_FAILED',
});

const createError = (code, message) => ({
  code,
  message,
});

const cloneError = (error) => (
  error !== null && typeof error === 'object'
    ? {
      code: typeof error.code === 'string'
        ? error.code
        : DATASET_ACCESS_ERROR_CODES.READ_FAILED,
      message: typeof error.message === 'string'
        ? error.message
        : 'The active dataset could not be read.',
    }
    : null
);

const deepFreeze = (value) => {
  if (
    value === null
    || typeof value !== 'object'
    || Object.isFrozen(value)
  ) {
    return value;
  }

  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const cloneDataset = (dataset) => createNormalizedDataset(dataset);

const cloneMetadata = (metadata) => createDatasetMetadata(metadata);

const createSnapshot = ({
  dataset = null,
  metadata = null,
  status = DATASET_ACCESS_STATUSES.UNKNOWN,
  error = null,
  revision = 0,
} = {}) => deepFreeze({
  dataset: dataset ? cloneDataset(dataset) : null,
  metadata: metadata ? cloneMetadata(metadata) : null,
  status,
  error: cloneError(error),
  revision,
});

const readRepositoryDataset = (repository) => {
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
            DATASET_ACCESS_ERROR_CODES.READ_FAILED,
            'The active dataset could not be read.',
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
          DATASET_ACCESS_ERROR_CODES.INVALID_DATASET,
          'The active dataset metadata and content are incomplete.',
        ),
      };
    }

    return {
      ok: true,
      data: {
        metadata: metadataResult.data,
        dataset: datasetResult.data,
      },
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        DATASET_ACCESS_ERROR_CODES.READ_FAILED,
        'The active dataset could not be read.',
      ),
    };
  }
};

const resolveDatasetPayload = (source) => {
  if (
    source === null
    || typeof source !== 'object'
    || Array.isArray(source)
  ) {
    return null;
  }

  const data = source.data !== null
    && typeof source.data === 'object'
    && !Array.isArray(source.data)
    ? source.data
    : source;
  const dataset = data.dataset
    ?? data.activeDataset
    ?? data.content
    ?? null;
  const metadata = data.datasetMetadata
    ?? data.metadata
    ?? data.activeDatasetMetadata
    ?? null;

  if (!dataset || !metadata) {
    return null;
  }

  return {
    dataset,
    metadata,
  };
};

/**
 * Exposes a stable external-store snapshot of the active normalized dataset.
 */
export class DatasetAccessFacade {
  constructor(activeDatasetRepository = datasetRepository) {
    this.datasetRepository = activeDatasetRepository;
    this.listeners = new Set();
    this.snapshot = createSnapshot();

    this.refresh();
  }

  /**
   * Returns the active normalized dataset, or null when none is available.
   *
   * @returns {object|null} Active normalized dataset.
   */
  getActiveDataset() {
    return this.snapshot.dataset;
  }

  /**
   * Returns metadata for the active dataset, or null when none is available.
   *
   * @returns {object|null} Active dataset metadata.
   */
  getActiveDatasetMetadata() {
    return this.snapshot.metadata;
  }

  /**
   * Returns the stable current external-store snapshot.
   *
   * @returns {{
   *   dataset: object|null,
   *   metadata: object|null,
   *   status: string,
   *   error: object|null,
   *   revision: number
   * }} Active dataset snapshot.
   */
  getSnapshot() {
    return this.snapshot;
  }

  /**
   * Reads the current active dataset from its repository.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Refresh result.
   */
  refresh() {
    const result = readRepositoryDataset(this.datasetRepository);

    if (!result.ok) {
      this.replaceSnapshot({
        dataset: this.snapshot.dataset,
        metadata: this.snapshot.metadata,
        status: DATASET_ACCESS_STATUSES.FAILED,
        error: result.error,
      });

      return {
        ok: false,
        data: null,
        error: cloneError(result.error),
      };
    }

    if (result.data === null) {
      this.replaceSnapshot({
        dataset: null,
        metadata: null,
        status: DATASET_ACCESS_STATUSES.EMPTY,
        error: null,
      });

      return {
        ok: true,
        data: null,
      };
    }

    return this.setActiveDataset(
      result.data.dataset,
      result.data.metadata,
    );
  }

  /**
   * Replaces the external-store snapshot with a validated active dataset.
   *
   * @param {object} dataset Normalized dataset.
   * @param {object} metadata Dataset metadata.
   * @returns {{ok: boolean, data: object|null, error?: object}} Update result.
   */
  setActiveDataset(dataset, metadata) {
    let canonicalDataset;
    let canonicalMetadata;

    try {
      canonicalDataset = cloneDataset(dataset);
      canonicalMetadata = cloneMetadata(metadata);
    } catch {
      const error = createError(
        DATASET_ACCESS_ERROR_CODES.INVALID_DATASET,
        'The active dataset snapshot is invalid or incompatible.',
      );

      this.replaceSnapshot({
        dataset: this.snapshot.dataset,
        metadata: this.snapshot.metadata,
        status: DATASET_ACCESS_STATUSES.FAILED,
        error,
      });

      return {
        ok: false,
        data: null,
        error,
      };
    }

    if (
      canonicalMetadata.recordCounts.workItems
        !== canonicalDataset.workItems.length
      || canonicalMetadata.recordCounts.capacityRecords
        !== canonicalDataset.capacityRecords.length
    ) {
      const error = createError(
        DATASET_ACCESS_ERROR_CODES.INVALID_DATASET,
        'The active dataset metadata does not match its content.',
      );

      this.replaceSnapshot({
        dataset: this.snapshot.dataset,
        metadata: this.snapshot.metadata,
        status: DATASET_ACCESS_STATUSES.FAILED,
        error,
      });

      return {
        ok: false,
        data: null,
        error,
      };
    }

    this.replaceSnapshot({
      dataset: canonicalDataset,
      metadata: canonicalMetadata,
      status: DATASET_ACCESS_STATUSES.READY,
      error: null,
    });

    return {
      ok: true,
      data: {
        dataset: this.snapshot.dataset,
        metadata: this.snapshot.metadata,
      },
    };
  }

  /**
   * Updates the snapshot from a successful bootstrap result.
   *
   * @param {object} result Bootstrap result or readiness snapshot.
   * @returns {{ok: boolean, data: object|null, error?: object}} Update result.
   */
  applyBootstrapResult(result) {
    if (result?.ok === false) {
      return {
        ok: false,
        data: null,
        error: cloneError(result.error) ?? createError(
          DATASET_ACCESS_ERROR_CODES.READ_FAILED,
          'The active dataset could not be initialized.',
        ),
      };
    }

    const payload = resolveDatasetPayload(result);

    if (!payload) {
      return this.refresh();
    }

    return this.setActiveDataset(payload.dataset, payload.metadata);
  }

  /**
   * Updates the snapshot from a successful dataset import result.
   *
   * @param {object} result Dataset import result.
   * @returns {{ok: boolean, data: object|null, error?: object}} Update result.
   */
  applyImportResult(result) {
    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: cloneError(result?.error) ?? createError(
          DATASET_ACCESS_ERROR_CODES.READ_FAILED,
          'The dataset import did not update the active dataset.',
        ),
      };
    }

    if (result.data?.activation?.activated === false) {
      return {
        ok: true,
        data: {
          dataset: this.snapshot.dataset,
          metadata: this.snapshot.metadata,
        },
      };
    }

    const payload = resolveDatasetPayload(result);

    if (!payload) {
      return this.refresh();
    }

    return this.setActiveDataset(payload.dataset, payload.metadata);
  }

  /**
   * Clears the snapshot after a successful local-data reset.
   *
   * @param {object|boolean} result Reset result or success flag.
   * @returns {{ok: boolean, data: null, error?: object}} Update result.
   */
  applyResetResult(result) {
    const succeeded = result === true || result?.ok === true;

    if (!succeeded) {
      return {
        ok: false,
        data: null,
        error: cloneError(result?.error) ?? createError(
          DATASET_ACCESS_ERROR_CODES.READ_FAILED,
          'The local-data reset did not complete.',
        ),
      };
    }

    this.clearActiveDataset();

    return {
      ok: true,
      data: null,
    };
  }

  /**
   * Clears the active dataset snapshot without modifying persistence.
   *
   * @returns {void}
   */
  clearActiveDataset() {
    this.replaceSnapshot({
      dataset: null,
      metadata: null,
      status: DATASET_ACCESS_STATUSES.EMPTY,
      error: null,
    });
  }

  /**
   * Subscribes to active dataset snapshot changes.
   *
   * @param {Function} listener Dataset snapshot listener.
   * @param {{fireImmediately?: boolean}} options Subscription options.
   * @returns {Function} Unsubscribe callback.
   */
  subscribeToDatasetChanges(listener, options = {}) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    this.listeners.add(listener);

    if (options?.fireImmediately === true) {
      try {
        listener(this.snapshot, null);
      } catch {
        // A failing consumer must not interrupt dataset lifecycle updates.
      }
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Alias for subscribing to active dataset changes.
   *
   * @param {Function} listener Dataset snapshot listener.
   * @param {{fireImmediately?: boolean}} options Subscription options.
   * @returns {Function} Unsubscribe callback.
   */
  subscribe(listener, options = {}) {
    return this.subscribeToDatasetChanges(listener, options);
  }

  replaceSnapshot({
    dataset,
    metadata,
    status,
    error,
  }) {
    const previousSnapshot = this.snapshot;

    this.snapshot = createSnapshot({
      dataset,
      metadata,
      status,
      error,
      revision: previousSnapshot.revision + 1,
    });

    this.listeners.forEach((listener) => {
      try {
        listener(this.snapshot, previousSnapshot);
      } catch {
        // A failing consumer must not interrupt dataset lifecycle updates.
      }
    });
  }
}

export const datasetAccessFacade = new DatasetAccessFacade();

export const getActiveDataset = () => (
  datasetAccessFacade.getActiveDataset()
);

export const getActiveDatasetMetadata = () => (
  datasetAccessFacade.getActiveDatasetMetadata()
);

export const subscribeToDatasetChanges = (listener, options = {}) => (
  datasetAccessFacade.subscribeToDatasetChanges(listener, options)
);

export default datasetAccessFacade;