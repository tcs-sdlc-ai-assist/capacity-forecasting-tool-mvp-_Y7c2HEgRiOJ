import { STORAGE_KEYS } from '../constants/storageKeys.js';
import {
  createImportSummary,
  isImportSummary,
} from '../domain/schemas.js';
import persistentStore from '../platform/storage/persistentStore.js';

const INVALID_IMPORT_SUMMARY = 'INVALID_IMPORT_SUMMARY';
const IMPORT_SUMMARY_READ_FAILED = 'IMPORT_SUMMARY_READ_FAILED';
const IMPORT_SUMMARY_WRITE_FAILED = 'IMPORT_SUMMARY_WRITE_FAILED';
const IMPORT_SUMMARY_CLEAR_FAILED = 'IMPORT_SUMMARY_CLEAR_FAILED';

const createError = (code, message) => ({
  code,
  message,
});

const cloneSummary = (summary) => createImportSummary(summary);

/**
 * Provides schema-aware access to the most recent sanitized import summary.
 */
export class ImportSummaryRepository {
  constructor(storage = persistentStore) {
    this.storage = storage;
  }

  /**
   * Reads and validates the most recent import summary.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getSummary() {
    let result;

    try {
      result = this.storage.get(STORAGE_KEYS.IMPORT_LAST_SUMMARY);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          IMPORT_SUMMARY_READ_FAILED,
          'The latest import summary could not be read from browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          IMPORT_SUMMARY_READ_FAILED,
          'The latest import summary could not be read from browser storage.',
        ),
      };
    }

    if (result.data === null || result.data === undefined) {
      return {
        ok: true,
        data: null,
      };
    }

    if (!isImportSummary(result.data)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_IMPORT_SUMMARY,
          'The stored import summary is invalid or incompatible.',
        ),
      };
    }

    return {
      ok: true,
      data: cloneSummary(result.data),
    };
  }

  /**
   * Alias for reading the most recent import summary.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  get() {
    return this.getSummary();
  }

  /**
   * Stores a canonical import summary containing sanitized counts and warnings.
   *
   * @param {object} summary Import summary fields to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  saveSummary(summary) {
    let canonicalSummary;

    try {
      canonicalSummary = createImportSummary(summary);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_IMPORT_SUMMARY,
          'The import summary could not be saved because its data is invalid.',
        ),
      };
    }

    let result;

    try {
      result = this.storage.set(
        STORAGE_KEYS.IMPORT_LAST_SUMMARY,
        canonicalSummary,
      );
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          IMPORT_SUMMARY_WRITE_FAILED,
          'The latest import summary could not be saved to browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        mode: result?.mode,
        error: result?.error ?? createError(
          IMPORT_SUMMARY_WRITE_FAILED,
          'The latest import summary could not be saved to browser storage.',
        ),
      };
    }

    const response = {
      ok: true,
      data: cloneSummary(canonicalSummary),
      mode: result.mode,
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Alias for storing the most recent import summary.
   *
   * @param {object} summary Import summary fields to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  save(summary) {
    return this.saveSummary(summary);
  }

  /**
   * Alias for storing the most recent import summary.
   *
   * @param {object} summary Import summary fields to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  set(summary) {
    return this.saveSummary(summary);
  }

  /**
   * Removes the most recent import summary.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  clearSummary() {
    let result;

    try {
      result = this.storage.remove(STORAGE_KEYS.IMPORT_LAST_SUMMARY);
    } catch {
      return {
        ok: false,
        removed: false,
        error: createError(
          IMPORT_SUMMARY_CLEAR_FAILED,
          'The latest import summary could not be cleared from browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        removed: Boolean(result?.removed),
        error: result?.error ?? createError(
          IMPORT_SUMMARY_CLEAR_FAILED,
          'The latest import summary could not be cleared from browser storage.',
        ),
      };
    }

    const response = {
      ok: true,
      removed: Boolean(result.removed),
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Alias for removing the most recent import summary.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  clear() {
    return this.clearSummary();
  }

  /**
   * Alias for removing the most recent import summary.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  remove() {
    return this.clearSummary();
  }
}

export const importSummaryRepository = new ImportSummaryRepository();

export default importSummaryRepository;