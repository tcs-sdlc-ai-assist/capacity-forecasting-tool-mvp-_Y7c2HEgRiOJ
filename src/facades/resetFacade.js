import authFacade, {
  AUTH_STATUSES,
} from './authFacade.js';
import datasetAccessFacade from './datasetAccessFacade.js';
import resetService from '../services/resetService.js';

export const RESET_FACADE_ERROR_CODES = Object.freeze({
  RESET_UNAVAILABLE: 'RESET_UNAVAILABLE',
  RESET_FAILED: 'RESET_FAILED',
  INVALID_RESULT: 'RESET_INVALID_RESULT',
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

const isResetResult = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && typeof value.ok === 'boolean'
);

const isPromiseLike = (value) => (
  value !== null
  && (
    typeof value === 'object'
    || typeof value === 'function'
  )
  && typeof value.then === 'function'
);

const setAnonymousSnapshot = (facade) => {
  try {
    if (typeof facade?.setSession === 'function') {
      facade.setSession(null, AUTH_STATUSES.ANONYMOUS);
    }
  } catch {
    // A snapshot synchronization failure must not invalidate a reset.
  }
};

const synchronizeAuthFacade = (facade) => {
  if (typeof facade?.logout !== 'function') {
    setAnonymousSnapshot(facade);
    return;
  }

  try {
    const result = facade.logout();

    if (isPromiseLike(result)) {
      Promise.resolve(result)
        .then((resolvedResult) => {
          if (resolvedResult?.ok === false) {
            setAnonymousSnapshot(facade);
          }
        })
        .catch(() => {
          setAnonymousSnapshot(facade);
        });
      return;
    }

    if (result?.ok === false) {
      setAnonymousSnapshot(facade);
    }
  } catch {
    setAnonymousSnapshot(facade);
  }
};

const synchronizeDatasetFacade = (facade, result) => {
  try {
    let synchronizationResult;

    if (typeof facade?.applyResetResult === 'function') {
      synchronizationResult = facade.applyResetResult(result);
    } else if (typeof facade?.clearActiveDataset === 'function') {
      synchronizationResult = facade.clearActiveDataset();
    } else if (typeof facade?.refresh === 'function') {
      synchronizationResult = facade.refresh();
    }

    if (isPromiseLike(synchronizationResult)) {
      Promise.resolve(synchronizationResult).catch(() => {
        // A snapshot synchronization failure must not invalidate a reset.
      });
    }
  } catch {
    // A snapshot synchronization failure must not invalidate a reset.
  }
};

/**
 * Exposes the stable public interface for removing browser-local CFT data.
 */
export class ResetFacade {
  constructor(
    localResetService = resetService,
    authenticationFacade = authFacade,
    activeDatasetFacade = datasetAccessFacade,
  ) {
    this.resetService = localResetService;
    this.authFacade = authenticationFacade;
    this.datasetAccessFacade = activeDatasetFacade;
  }

  /**
   * Removes all CFT-owned local data after explicit confirmation and updates
   * authentication and active-dataset snapshots after a successful purge.
   *
   * @param {{confirmed?: boolean}|boolean} request Reset confirmation.
   * @returns {object|Promise<object>} Local-data reset result.
   */
  removeAllLocalData(request = {}) {
    if (
      typeof this.resetService?.removeAllLocalData !== 'function'
    ) {
      return createFailureResult(
        RESET_FACADE_ERROR_CODES.RESET_UNAVAILABLE,
        'The local-data reset service is unavailable.',
      );
    }

    let result;

    try {
      result = this.resetService.removeAllLocalData(request);
    } catch {
      return createFailureResult(
        RESET_FACADE_ERROR_CODES.RESET_FAILED,
        'Browser-local application data could not be removed.',
      );
    }

    if (isPromiseLike(result)) {
      return Promise.resolve(result)
        .then((resolvedResult) => this.handleResetResult(resolvedResult))
        .catch(() => createFailureResult(
          RESET_FACADE_ERROR_CODES.RESET_FAILED,
          'Browser-local application data could not be removed.',
        ));
    }

    return this.handleResetResult(result);
  }

  handleResetResult(result) {
    if (!isResetResult(result)) {
      return createFailureResult(
        RESET_FACADE_ERROR_CODES.INVALID_RESULT,
        'The local-data reset service returned an invalid result.',
      );
    }

    if (result.ok) {
      synchronizeAuthFacade(this.authFacade);
      synchronizeDatasetFacade(this.datasetAccessFacade, result);
    }

    return result;
  }
}

export const resetFacade = new ResetFacade();

export const removeAllLocalData = (request = {}) => (
  resetFacade.removeAllLocalData(request)
);

export default resetFacade;