import { STORAGE_KEYS } from '../constants/storageKeys.js';
import {
  createPersistenceStatus,
  isPersistenceStatus,
} from '../domain/schemas.js';
import persistentStore from '../platform/storage/persistentStore.js';

const INVALID_PERSISTENCE_STATUS = 'INVALID_PERSISTENCE_STATUS';
const PERSISTENCE_STATUS_READ_FAILED = 'PERSISTENCE_STATUS_READ_FAILED';
const PERSISTENCE_STATUS_WRITE_FAILED = 'PERSISTENCE_STATUS_WRITE_FAILED';
const PERSISTENCE_STATUS_CLEAR_FAILED = 'PERSISTENCE_STATUS_CLEAR_FAILED';

const createError = (code, message) => ({
  code,
  message,
});

const cloneStatus = (status) => createPersistenceStatus(status);

const resolveTimestamp = (clock) => {
  const value = typeof clock === 'function'
    ? clock()
    : clock?.now?.();
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
};

const isPersistenceMode = (mode) => (
  mode === 'localStorage' || mode === 'memory'
);

const normalizeStorageError = (error) => {
  if (
    error === null
    || error === undefined
    || typeof error !== 'object'
  ) {
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

/**
 * Provides schema-aware access to the current persistence status.
 */
export class PersistenceStatusRepository {
  constructor(storage = persistentStore, clock = () => new Date()) {
    this.storage = storage;
    this.clock = clock;
  }

  /**
   * Reads and validates the current persistence status.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getStatus() {
    let result;

    try {
      result = this.storage.get(STORAGE_KEYS.PERSISTENCE_STATUS);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          PERSISTENCE_STATUS_READ_FAILED,
          'The persistence status could not be read from browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          PERSISTENCE_STATUS_READ_FAILED,
          'The persistence status could not be read from browser storage.',
        ),
      };
    }

    if (result.data === null || result.data === undefined) {
      return {
        ok: true,
        data: null,
      };
    }

    if (!isPersistenceStatus(result.data)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_PERSISTENCE_STATUS,
          'The stored persistence status is invalid or incompatible.',
        ),
      };
    }

    return {
      ok: true,
      data: cloneStatus(result.data),
    };
  }

  /**
   * Alias for reading the current persistence status.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getPersistenceStatus() {
    return this.getStatus();
  }

  /**
   * Alias for reading the current persistence status.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  get() {
    return this.getStatus();
  }

  /**
   * Stores a canonical persistence status.
   *
   * If the write itself causes durable storage to degrade, the stored status
   * is corrected to memory mode and records the storage failure.
   *
   * @param {object} status Persistence status fields to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  saveStatus(status) {
    let canonicalStatus;

    try {
      canonicalStatus = createPersistenceStatus(status);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_PERSISTENCE_STATUS,
          'The persistence status could not be saved because its data is invalid.',
        ),
      };
    }

    let result;

    try {
      result = this.storage.set(
        STORAGE_KEYS.PERSISTENCE_STATUS,
        canonicalStatus,
      );
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          PERSISTENCE_STATUS_WRITE_FAILED,
          'The persistence status could not be saved to browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        mode: result?.mode,
        error: result?.error ?? createError(
          PERSISTENCE_STATUS_WRITE_FAILED,
          'The persistence status could not be saved to browser storage.',
        ),
      };
    }

    const activeMode = isPersistenceMode(result.mode)
      ? result.mode
      : canonicalStatus.mode;
    const storageError = normalizeStorageError(result.error);

    if (
      canonicalStatus.mode !== activeMode
      || (
        activeMode === 'memory'
        && storageError
        && canonicalStatus.lastError === null
      )
    ) {
      try {
        canonicalStatus = createPersistenceStatus({
          ...canonicalStatus,
          mode: activeMode,
          lastError: storageError ?? canonicalStatus.lastError,
        });
      } catch {
        return {
          ok: false,
          data: null,
          mode: activeMode,
          error: createError(
            INVALID_PERSISTENCE_STATUS,
            'The active persistence status could not be normalized.',
          ),
        };
      }

      let correctedResult;

      try {
        correctedResult = this.storage.set(
          STORAGE_KEYS.PERSISTENCE_STATUS,
          canonicalStatus,
        );
      } catch {
        correctedResult = null;
      }

      if (!correctedResult?.ok) {
        return {
          ok: false,
          data: null,
          mode: correctedResult?.mode ?? activeMode,
          error: correctedResult?.error ?? createError(
            PERSISTENCE_STATUS_WRITE_FAILED,
            'The active persistence status could not be saved.',
          ),
        };
      }

      result = correctedResult;
    }

    const response = {
      ok: true,
      data: cloneStatus(canonicalStatus),
      mode: isPersistenceMode(result.mode)
        ? result.mode
        : activeMode,
    };

    if (result.error ?? storageError) {
      response.error = result.error ?? storageError;
    }

    return response;
  }

  /**
   * Creates and stores a persistence status for the supplied mode.
   *
   * @param {'localStorage'|'memory'} mode Active persistence mode.
   * @param {{code: string, message: string}|null} lastError Last failure.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  recordStatus(mode, lastError = null) {
    return this.saveStatus({
      mode,
      updatedAt: resolveTimestamp(this.clock),
      lastError,
    });
  }

  /**
   * Records durable browser persistence as active.
   *
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  markLocalStorage() {
    return this.recordStatus('localStorage', null);
  }

  /**
   * Records memory-only persistence and its latest failure.
   *
   * @param {{code: string, message: string}} lastError Storage failure.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  markMemoryOnly(lastError) {
    return this.recordStatus('memory', lastError);
  }

  /**
   * Alias for storing a persistence status.
   *
   * @param {object} status Persistence status fields to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  save(status) {
    return this.saveStatus(status);
  }

  /**
   * Alias for storing a persistence status.
   *
   * @param {object} status Persistence status fields to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  set(status) {
    return this.saveStatus(status);
  }

  /**
   * Removes the persisted persistence status.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  clearStatus() {
    let result;

    try {
      result = this.storage.remove(STORAGE_KEYS.PERSISTENCE_STATUS);
    } catch {
      return {
        ok: false,
        removed: false,
        error: createError(
          PERSISTENCE_STATUS_CLEAR_FAILED,
          'The persistence status could not be cleared from browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        removed: Boolean(result?.removed),
        error: result?.error ?? createError(
          PERSISTENCE_STATUS_CLEAR_FAILED,
          'The persistence status could not be cleared from browser storage.',
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
   * Alias for removing the persisted persistence status.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  clear() {
    return this.clearStatus();
  }

  /**
   * Alias for removing the persisted persistence status.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  remove() {
    return this.clearStatus();
  }
}

export const persistenceStatusRepository = new PersistenceStatusRepository();

export default persistenceStatusRepository;