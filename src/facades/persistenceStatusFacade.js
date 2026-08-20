import { createPersistenceStatus } from '../domain/schemas.js';
import persistenceStatusRepository from '../repositories/persistenceStatusRepository.js';

export const PERSISTENCE_STATUS_FACADE_STATUSES = Object.freeze({
  UNKNOWN: 'unknown',
  READY: 'ready',
  EMPTY: 'empty',
  FAILED: 'failed',
});

export const PERSISTENCE_STATUS_FACADE_ERROR_CODES = Object.freeze({
  INVALID_STATUS: 'PERSISTENCE_STATUS_INVALID_STATUS',
  READ_FAILED: 'PERSISTENCE_STATUS_READ_FAILED',
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
        : PERSISTENCE_STATUS_FACADE_ERROR_CODES.READ_FAILED,
      message: typeof error.message === 'string'
        ? error.message
        : 'The persistence status could not be read.',
    }
    : null
);

const clonePersistenceStatus = (status) => (
  createPersistenceStatus(status)
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

const createSnapshot = ({
  persistenceStatus = null,
  status = PERSISTENCE_STATUS_FACADE_STATUSES.UNKNOWN,
  error = null,
  revision = 0,
} = {}) => deepFreeze({
  persistenceStatus: persistenceStatus
    ? clonePersistenceStatus(persistenceStatus)
    : null,
  mode: persistenceStatus?.mode ?? null,
  lastError: persistenceStatus?.lastError
    ? { ...persistenceStatus.lastError }
    : null,
  status,
  error: cloneError(error),
  revision,
});

const readRepositoryStatus = (repository) => {
  try {
    let result;

    if (typeof repository?.getStatus === 'function') {
      result = repository.getStatus();
    } else if (
      typeof repository?.getPersistenceStatus === 'function'
    ) {
      result = repository.getPersistenceStatus();
    } else if (typeof repository?.get === 'function') {
      result = repository.get();
    } else {
      return {
        ok: false,
        data: null,
        error: createError(
          PERSISTENCE_STATUS_FACADE_ERROR_CODES.READ_FAILED,
          'The persistence status repository is unavailable.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          PERSISTENCE_STATUS_FACADE_ERROR_CODES.READ_FAILED,
          'The persistence status could not be read.',
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
        PERSISTENCE_STATUS_FACADE_ERROR_CODES.READ_FAILED,
        'The persistence status could not be read.',
      ),
    };
  }
};

/**
 * Exposes a stable external-store snapshot of browser persistence status.
 */
export class PersistenceStatusFacade {
  constructor(statusRepository = persistenceStatusRepository) {
    this.persistenceStatusRepository = statusRepository;
    this.listeners = new Set();
    this.snapshot = createSnapshot();

    this.refresh();
  }

  /**
   * Returns the current canonical persistence status.
   *
   * @returns {object|null} Current persistence status, or null when absent.
   */
  getPersistenceStatus() {
    return this.snapshot.persistenceStatus;
  }

  /**
   * Returns the stable current external-store snapshot.
   *
   * @returns {{
   *   persistenceStatus: object|null,
   *   mode: string|null,
   *   lastError: object|null,
   *   status: string,
   *   error: object|null,
   *   revision: number
   * }} Persistence status snapshot.
   */
  getSnapshot() {
    return this.snapshot;
  }

  /**
   * Reloads persistence status after repository writes or storage changes.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}}
   * Refresh result.
   */
  refresh() {
    const result = readRepositoryStatus(
      this.persistenceStatusRepository,
    );

    if (!result.ok) {
      this.replaceSnapshot({
        persistenceStatus: this.snapshot.persistenceStatus,
        status: PERSISTENCE_STATUS_FACADE_STATUSES.FAILED,
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
        persistenceStatus: null,
        status: PERSISTENCE_STATUS_FACADE_STATUSES.EMPTY,
        error: null,
      });

      return {
        ok: true,
        data: null,
      };
    }

    return this.setPersistenceStatus(result.data);
  }

  /**
   * Replaces the snapshot with a validated persistence status.
   *
   * @param {object} persistenceStatus Candidate persistence status.
   * @returns {{ok: boolean, data: object|null, error?: object}}
   * Update result.
   */
  setPersistenceStatus(persistenceStatus) {
    let canonicalStatus;

    try {
      canonicalStatus = clonePersistenceStatus(persistenceStatus);
    } catch {
      const error = createError(
        PERSISTENCE_STATUS_FACADE_ERROR_CODES.INVALID_STATUS,
        'The persistence status is invalid or incompatible.',
      );

      this.replaceSnapshot({
        persistenceStatus: this.snapshot.persistenceStatus,
        status: PERSISTENCE_STATUS_FACADE_STATUSES.FAILED,
        error,
      });

      return {
        ok: false,
        data: null,
        error,
      };
    }

    this.replaceSnapshot({
      persistenceStatus: canonicalStatus,
      status: PERSISTENCE_STATUS_FACADE_STATUSES.READY,
      error: null,
    });

    return {
      ok: true,
      data: this.snapshot.persistenceStatus,
    };
  }

  /**
   * Updates the snapshot from a repository write result.
   *
   * Successful results containing status data are applied immediately.
   * Successful results without data trigger a repository refresh.
   *
   * @param {object} result Repository write result.
   * @returns {{ok: boolean, data: object|null, error?: object}}
   * Update result.
   */
  applyRepositoryResult(result) {
    if (!result?.ok) {
      const error = cloneError(result?.error) ?? createError(
        PERSISTENCE_STATUS_FACADE_ERROR_CODES.READ_FAILED,
        'The persistence status update did not complete.',
      );

      this.replaceSnapshot({
        persistenceStatus: this.snapshot.persistenceStatus,
        status: PERSISTENCE_STATUS_FACADE_STATUSES.FAILED,
        error,
      });

      return {
        ok: false,
        data: null,
        error,
      };
    }

    if (result.data === null || result.data === undefined) {
      return this.refresh();
    }

    return this.setPersistenceStatus(result.data);
  }

  /**
   * Subscribes to persistence status snapshot changes.
   *
   * @param {Function} listener Persistence status listener.
   * @param {{fireImmediately?: boolean}} options Subscription options.
   * @returns {Function} Unsubscribe callback.
   */
  subscribeToPersistenceStatus(listener, options = {}) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    this.listeners.add(listener);

    if (options?.fireImmediately === true) {
      try {
        listener(this.snapshot, null);
      } catch {
        // A failing consumer must not interrupt persistence updates.
      }
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Alias for subscribing to persistence status changes.
   *
   * @param {Function} listener Persistence status listener.
   * @param {{fireImmediately?: boolean}} options Subscription options.
   * @returns {Function} Unsubscribe callback.
   */
  subscribe(listener, options = {}) {
    return this.subscribeToPersistenceStatus(listener, options);
  }

  replaceSnapshot({
    persistenceStatus,
    status,
    error,
  }) {
    const previousSnapshot = this.snapshot;

    this.snapshot = createSnapshot({
      persistenceStatus,
      status,
      error,
      revision: previousSnapshot.revision + 1,
    });

    this.listeners.forEach((listener) => {
      try {
        listener(this.snapshot, previousSnapshot);
      } catch {
        // A failing consumer must not interrupt persistence updates.
      }
    });
  }
}

export const persistenceStatusFacade = new PersistenceStatusFacade();

export const getPersistenceStatus = () => (
  persistenceStatusFacade.getPersistenceStatus()
);

export const subscribeToPersistenceStatus = (
  listener,
  options = {},
) => (
  persistenceStatusFacade.subscribeToPersistenceStatus(
    listener,
    options,
  )
);

export const refreshPersistenceStatus = () => (
  persistenceStatusFacade.refresh()
);

export default persistenceStatusFacade;