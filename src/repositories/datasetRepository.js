import { STORAGE_KEYS } from '../constants/storageKeys.js';
import {
  createDatasetMetadata,
  createNormalizedDataset,
  isDatasetMetadata,
  isNormalizedDataset,
} from '../domain/schemas.js';
import persistentStore from '../platform/storage/persistentStore.js';

const INVALID_DATASET = 'INVALID_DATASET';
const INCOMPLETE_DATASET = 'INCOMPLETE_DATASET';
const DATASET_READ_FAILED = 'DATASET_READ_FAILED';
const DATASET_WRITE_FAILED = 'DATASET_WRITE_FAILED';
const DATASET_CLEAR_FAILED = 'DATASET_CLEAR_FAILED';

const createError = (code, message) => ({
  code,
  message,
});

const cloneMetadata = (metadata) => createDatasetMetadata(metadata);

const cloneDataset = (dataset) => createNormalizedDataset(dataset);

const hasMatchingRecordCounts = (metadata, dataset) => (
  metadata.recordCounts.workItems === dataset.workItems.length
  && metadata.recordCounts.capacityRecords === dataset.capacityRecords.length
);

const resolveMode = (storage, fallback = 'localStorage') => {
  if (typeof storage?.getMode === 'function') {
    const mode = storage.getMode();

    if (mode === 'localStorage' || mode === 'memory') {
      return mode;
    }
  }

  if (typeof storage?.storageAdapter?.getMode === 'function') {
    const mode = storage.storageAdapter.getMode();

    if (mode === 'localStorage' || mode === 'memory') {
      return mode;
    }
  }

  return fallback === 'memory' ? 'memory' : 'localStorage';
};

const readStorageValue = (storage, key) => {
  try {
    const result = storage.get(key);

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          DATASET_READ_FAILED,
          'The active dataset could not be read from browser storage.',
        ),
      };
    }

    return {
      ok: true,
      data: result.data ?? null,
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        DATASET_READ_FAILED,
        'The active dataset could not be read from browser storage.',
      ),
    };
  }
};

/**
 * Provides schema-aware, fail-soft access to the active normalized dataset.
 */
export class DatasetRepository {
  constructor(storage = persistentStore) {
    this.storage = storage;
  }

  /**
   * Reads and validates active dataset metadata.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getMetadata() {
    const result = readStorageValue(
      this.storage,
      STORAGE_KEYS.DATASET_METADATA,
    );

    if (!result.ok) {
      return result;
    }

    if (result.data === null) {
      return {
        ok: true,
        data: null,
      };
    }

    if (!isDatasetMetadata(result.data)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_DATASET,
          'Stored dataset metadata is invalid or incompatible.',
        ),
      };
    }

    return {
      ok: true,
      data: cloneMetadata(result.data),
    };
  }

  /**
   * Alias for reading active dataset metadata.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getActiveDatasetMetadata() {
    return this.getMetadata();
  }

  /**
   * Reads and validates active normalized dataset content.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getContent() {
    const result = readStorageValue(
      this.storage,
      STORAGE_KEYS.DATASET_CONTENT,
    );

    if (!result.ok) {
      return result;
    }

    if (result.data === null) {
      return {
        ok: true,
        data: null,
      };
    }

    if (!isNormalizedDataset(result.data)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_DATASET,
          'Stored dataset content is invalid or incompatible.',
        ),
      };
    }

    return {
      ok: true,
      data: cloneDataset(result.data),
    };
  }

  /**
   * Alias for reading active normalized dataset content.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getDataset() {
    return this.getContent();
  }

  /**
   * Reads metadata and content as one validated active-dataset unit.
   *
   * @returns {{
   *   ok: boolean,
   *   data: {metadata: object, dataset: object}|null,
   *   mode?: string,
   *   error?: object
   * }} Read result.
   */
  getActiveDataset() {
    const metadataResult = this.getMetadata();

    if (!metadataResult.ok) {
      return metadataResult;
    }

    const contentResult = this.getContent();

    if (!contentResult.ok) {
      return contentResult;
    }

    if (
      metadataResult.data === null
      && contentResult.data === null
    ) {
      return {
        ok: true,
        data: null,
      };
    }

    if (
      metadataResult.data === null
      || contentResult.data === null
    ) {
      return {
        ok: false,
        data: null,
        error: createError(
          INCOMPLETE_DATASET,
          'Stored dataset metadata and content are incomplete.',
        ),
      };
    }

    if (
      !hasMatchingRecordCounts(
        metadataResult.data,
        contentResult.data,
      )
    ) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_DATASET,
          'Stored dataset metadata does not match its content.',
        ),
      };
    }

    return {
      ok: true,
      data: {
        metadata: cloneMetadata(metadataResult.data),
        dataset: cloneDataset(contentResult.data),
      },
      mode: metadataResult.data.persistenceMode,
    };
  }

  /**
   * Validates and atomically replaces active dataset content and metadata.
   *
   * @param {object} dataset Candidate normalized dataset.
   * @param {object} metadata Candidate dataset metadata.
   * @returns {{
   *   ok: boolean,
   *   data: {metadata: object, dataset: object}|null,
   *   mode?: string,
   *   error?: object
   * }} Activation result.
   */
  activate(dataset, metadata) {
    let canonicalDataset;
    let canonicalMetadata;

    try {
      canonicalDataset = cloneDataset(dataset);
      canonicalMetadata = cloneMetadata(metadata);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_DATASET,
          'The dataset could not be activated because its data is invalid.',
        ),
      };
    }

    if (!hasMatchingRecordCounts(canonicalMetadata, canonicalDataset)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_DATASET,
          'The dataset metadata record counts do not match its content.',
        ),
      };
    }

    const metadataSnapshot = readStorageValue(
      this.storage,
      STORAGE_KEYS.DATASET_METADATA,
    );
    const contentSnapshot = readStorageValue(
      this.storage,
      STORAGE_KEYS.DATASET_CONTENT,
    );

    if (!metadataSnapshot.ok || !contentSnapshot.ok) {
      return {
        ok: false,
        data: null,
        error: metadataSnapshot.error
          ?? contentSnapshot.error
          ?? createError(
            DATASET_READ_FAILED,
            'The existing dataset could not be read before replacement.',
          ),
      };
    }

    let contentWrite;

    try {
      contentWrite = this.storage.set(
        STORAGE_KEYS.DATASET_CONTENT,
        canonicalDataset,
      );
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          DATASET_WRITE_FAILED,
          'The active dataset could not be saved to browser storage.',
        ),
      };
    }

    if (!contentWrite?.ok) {
      return {
        ok: false,
        data: null,
        mode: contentWrite?.mode,
        error: contentWrite?.error ?? createError(
          DATASET_WRITE_FAILED,
          'The active dataset could not be saved to browser storage.',
        ),
      };
    }

    let activeMode = contentWrite.mode === 'memory'
      ? 'memory'
      : resolveMode(
        this.storage,
        canonicalMetadata.persistenceMode,
      );

    canonicalMetadata = createDatasetMetadata({
      ...canonicalMetadata,
      persistenceMode: activeMode,
    });

    let metadataWrite;

    try {
      metadataWrite = this.storage.set(
        STORAGE_KEYS.DATASET_METADATA,
        canonicalMetadata,
      );
    } catch {
      const restored = this.restoreSnapshots(
        metadataSnapshot.data,
        contentSnapshot.data,
      );

      return {
        ok: false,
        data: null,
        mode: activeMode,
        error: createError(
          DATASET_WRITE_FAILED,
          restored
            ? 'The active dataset could not be saved to browser storage.'
            : 'The active dataset save failed and its previous state could not be fully restored.',
        ),
      };
    }

    if (!metadataWrite?.ok) {
      const restored = this.restoreSnapshots(
        metadataSnapshot.data,
        contentSnapshot.data,
      );

      return {
        ok: false,
        data: null,
        mode: metadataWrite?.mode ?? activeMode,
        error: metadataWrite?.error ?? createError(
          DATASET_WRITE_FAILED,
          restored
            ? 'The active dataset could not be saved to browser storage.'
            : 'The active dataset save failed and its previous state could not be fully restored.',
        ),
      };
    }

    if (
      metadataWrite.mode === 'memory'
      && canonicalMetadata.persistenceMode !== 'memory'
    ) {
      activeMode = 'memory';
      canonicalMetadata = createDatasetMetadata({
        ...canonicalMetadata,
        persistenceMode: activeMode,
      });

      let correctedMetadataWrite;

      try {
        correctedMetadataWrite = this.storage.set(
          STORAGE_KEYS.DATASET_METADATA,
          canonicalMetadata,
        );
      } catch {
        correctedMetadataWrite = null;
      }

      if (!correctedMetadataWrite?.ok) {
        const restored = this.restoreSnapshots(
          metadataSnapshot.data,
          contentSnapshot.data,
        );

        return {
          ok: false,
          data: null,
          mode: activeMode,
          error: correctedMetadataWrite?.error ?? createError(
            DATASET_WRITE_FAILED,
            restored
              ? 'The active dataset metadata could not be saved.'
              : 'The active dataset save failed and its previous state could not be fully restored.',
          ),
        };
      }

      metadataWrite = correctedMetadataWrite;
    } else if (metadataWrite.mode === 'localStorage') {
      activeMode = 'localStorage';
    }

    const response = {
      ok: true,
      data: {
        metadata: cloneMetadata(canonicalMetadata),
        dataset: cloneDataset(canonicalDataset),
      },
      mode: activeMode,
    };

    const persistenceWarning = metadataWrite.error ?? contentWrite.error;

    if (persistenceWarning) {
      response.error = persistenceWarning;
    }

    return response;
  }

  /**
   * Alias for activating a normalized dataset.
   *
   * @param {object} dataset Candidate normalized dataset.
   * @param {object} metadata Candidate dataset metadata.
   * @returns {object} Activation result.
   */
  saveDataset(dataset, metadata) {
    return this.activate(dataset, metadata);
  }

  /**
   * Alias for activating a normalized dataset.
   *
   * @param {object} dataset Candidate normalized dataset.
   * @param {object} metadata Candidate dataset metadata.
   * @returns {object} Activation result.
   */
  save(dataset, metadata) {
    return this.activate(dataset, metadata);
  }

  /**
   * Removes active dataset metadata and content as one logical operation.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Clear result.
   */
  clear() {
    const metadataSnapshot = readStorageValue(
      this.storage,
      STORAGE_KEYS.DATASET_METADATA,
    );
    const contentSnapshot = readStorageValue(
      this.storage,
      STORAGE_KEYS.DATASET_CONTENT,
    );

    if (!metadataSnapshot.ok || !contentSnapshot.ok) {
      return {
        ok: false,
        removed: false,
        error: metadataSnapshot.error
          ?? contentSnapshot.error
          ?? createError(
            DATASET_READ_FAILED,
            'The active dataset could not be read before removal.',
          ),
      };
    }

    let metadataRemoval;

    try {
      metadataRemoval = this.storage.remove(
        STORAGE_KEYS.DATASET_METADATA,
      );
    } catch {
      return {
        ok: false,
        removed: false,
        error: createError(
          DATASET_CLEAR_FAILED,
          'The active dataset could not be removed from browser storage.',
        ),
      };
    }

    if (!metadataRemoval?.ok) {
      return {
        ok: false,
        removed: false,
        error: metadataRemoval?.error ?? createError(
          DATASET_CLEAR_FAILED,
          'The active dataset could not be removed from browser storage.',
        ),
      };
    }

    let contentRemoval;

    try {
      contentRemoval = this.storage.remove(
        STORAGE_KEYS.DATASET_CONTENT,
      );
    } catch {
      contentRemoval = null;
    }

    if (!contentRemoval?.ok) {
      const restored = this.restoreSnapshots(
        metadataSnapshot.data,
        contentSnapshot.data,
      );

      return {
        ok: false,
        removed: false,
        error: contentRemoval?.error ?? createError(
          DATASET_CLEAR_FAILED,
          restored
            ? 'The active dataset could not be removed from browser storage.'
            : 'Dataset removal failed and its previous state could not be fully restored.',
        ),
      };
    }

    const response = {
      ok: true,
      removed: Boolean(
        metadataRemoval.removed || contentRemoval.removed,
      ),
    };

    const persistenceWarning = contentRemoval.error
      ?? metadataRemoval.error;

    if (persistenceWarning) {
      response.error = persistenceWarning;
    }

    return response;
  }

  /**
   * Alias for removing the active dataset.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Clear result.
   */
  remove() {
    return this.clear();
  }

  restoreSnapshots(metadata, content) {
    const restoreValue = (key, value) => {
      try {
        const result = value === null || value === undefined
          ? this.storage.remove(key)
          : this.storage.set(key, value);

        return Boolean(result?.ok);
      } catch {
        return false;
      }
    };

    const contentRestored = restoreValue(
      STORAGE_KEYS.DATASET_CONTENT,
      content,
    );
    const metadataRestored = restoreValue(
      STORAGE_KEYS.DATASET_METADATA,
      metadata,
    );

    return contentRestored && metadataRestored;
  }
}

export const datasetRepository = new DatasetRepository();

export default datasetRepository;