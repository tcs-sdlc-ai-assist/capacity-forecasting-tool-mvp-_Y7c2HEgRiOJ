import datasetAccessFacade from './datasetAccessFacade.js';
import persistenceStatusFacade from './persistenceStatusFacade.js';
import datasetImportService from '../services/datasetImportService.js';

export const DATASET_IMPORT_FACADE_ERROR_CODES = Object.freeze({
  IMPORT_UNAVAILABLE: 'DATASET_IMPORT_UNAVAILABLE',
  IMPORT_FAILED: 'DATASET_IMPORT_FAILED',
  INVALID_RESULT: 'DATASET_IMPORT_INVALID_RESULT',
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

const isImportResult = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && typeof value.ok === 'boolean'
);

const refreshDatasetFacade = async (facade, result) => {
  if (!result?.ok) {
    return;
  }

  try {
    if (typeof facade?.applyImportResult === 'function') {
      const applied = await facade.applyImportResult(result);

      if (applied?.ok !== false) {
        return;
      }
    }

    if (typeof facade?.refresh === 'function') {
      await facade.refresh();
    }
  } catch {
    try {
      if (typeof facade?.refresh === 'function') {
        await facade.refresh();
      }
    } catch {
      // A synchronization failure must not invalidate a completed import.
    }
  }
};

const refreshStatusFacade = async (facade) => {
  try {
    if (typeof facade?.refresh === 'function') {
      await facade.refresh();
      return;
    }

    if (typeof facade?.refreshPersistenceStatus === 'function') {
      await facade.refreshPersistenceStatus();
    }
  } catch {
    // A synchronization failure must not invalidate a completed import.
  }
};

/**
 * Exposes the stable public interface for browser-local dataset imports.
 */
export class DatasetImportFacade {
  constructor(
    importService = datasetImportService,
    activeDatasetFacade = datasetAccessFacade,
    statusFacade = persistenceStatusFacade,
  ) {
    this.datasetImportService = importService;
    this.datasetAccessFacade = activeDatasetFacade;
    this.persistenceStatusFacade = statusFacade;
  }

  /**
   * Imports a file and synchronizes dataset and persistence-status snapshots.
   *
   * @param {object} fileDescriptor Browser-local import file descriptor.
   * @returns {Promise<{
   *   ok: boolean,
   *   data: object|null,
   *   warnings?: object[],
   *   error?: object
   * }>} Dataset import result.
   */
  async importFile(fileDescriptor) {
    if (
      typeof this.datasetImportService?.importFile !== 'function'
    ) {
      return createFailureResult(
        DATASET_IMPORT_FACADE_ERROR_CODES.IMPORT_UNAVAILABLE,
        'The dataset import service is unavailable.',
      );
    }

    let result;

    try {
      result = await this.datasetImportService.importFile(
        fileDescriptor,
      );
    } catch {
      await refreshStatusFacade(this.persistenceStatusFacade);

      return createFailureResult(
        DATASET_IMPORT_FACADE_ERROR_CODES.IMPORT_FAILED,
        'The dataset import could not be completed.',
      );
    }

    if (!isImportResult(result)) {
      await refreshStatusFacade(this.persistenceStatusFacade);

      return createFailureResult(
        DATASET_IMPORT_FACADE_ERROR_CODES.INVALID_RESULT,
        'The dataset import service returned an invalid result.',
      );
    }

    if (result.ok) {
      await refreshDatasetFacade(
        this.datasetAccessFacade,
        result,
      );
    }

    await refreshStatusFacade(this.persistenceStatusFacade);

    return result;
  }
}

export const datasetImportFacade = new DatasetImportFacade();

export const importFile = (fileDescriptor) => (
  datasetImportFacade.importFile(fileDescriptor)
);

export default datasetImportFacade;