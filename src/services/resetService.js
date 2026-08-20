import { STORAGE_PREFIX } from '../constants/storageKeys.js';
import persistentStore from '../platform/storage/persistentStore.js';
import sessionRepository from '../repositories/sessionRepository.js';
import noticeCenterStore from '../stores/noticeCenterStore.js';

export const RESET_ERROR_CODES = Object.freeze({
  CONFIRMATION_REQUIRED: 'RESET_CONFIRMATION_REQUIRED',
  STORAGE_UNAVAILABLE: 'RESET_STORAGE_UNAVAILABLE',
  PURGE_FAILED: 'RESET_PURGE_FAILED',
});

export const RESET_NEXT_LOAD_BEHAVIOR = 'bootstrap_demo_state';

const createError = (code, message) => ({
  code,
  message,
});

const cloneError = (error, fallbackCode, fallbackMessage) => {
  if (error !== null && typeof error === 'object') {
    return {
      code: typeof error.code === 'string' && error.code.trim()
        ? error.code.trim()
        : fallbackCode,
      message: typeof error.message === 'string' && error.message.trim()
        ? error.message.trim()
        : fallbackMessage,
    };
  }

  return createError(fallbackCode, fallbackMessage);
};

const addWarning = (warnings, error) => {
  if (!error) {
    return;
  }

  const warning = cloneError(
    error,
    RESET_ERROR_CODES.PURGE_FAILED,
    'A browser-local reset operation could not be completed.',
  );

  if (!warnings.some((candidate) => (
    candidate.code === warning.code
    && candidate.message === warning.message
  ))) {
    warnings.push(warning);
  }
};

const normalizeKeys = (keys) => (
  [...new Set(
    (Array.isArray(keys) ? keys : [])
      .filter((key) => (
        typeof key === 'string'
        && key.startsWith(STORAGE_PREFIX)
      )),
  )].sort()
);

const normalizeClearResult = (result) => {
  if (Array.isArray(result)) {
    return {
      ok: true,
      removedKeys: normalizeKeys(result),
    };
  }

  if (result?.ok) {
    const response = {
      ok: true,
      removedKeys: normalizeKeys(result.removedKeys),
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  return {
    ok: false,
    removedKeys: normalizeKeys(result?.removedKeys),
    error: result?.error ?? createError(
      RESET_ERROR_CODES.PURGE_FAILED,
      'Browser-local application data could not be removed.',
    ),
  };
};

const normalizeListResult = (result) => {
  if (Array.isArray(result)) {
    return {
      ok: true,
      keys: normalizeKeys(result),
    };
  }

  if (result?.ok) {
    return {
      ok: true,
      keys: normalizeKeys(result.keys),
      error: result.error,
    };
  }

  return {
    ok: false,
    keys: [],
    error: result?.error ?? createError(
      RESET_ERROR_CODES.PURGE_FAILED,
      'Browser-local application data could not be listed.',
    ),
  };
};

const removeStorageKey = (storage, key) => {
  const result = storage.remove(key);

  if (typeof result === 'boolean') {
    return {
      ok: true,
      removed: result,
    };
  }

  if (result?.ok) {
    return {
      ok: true,
      removed: Boolean(result.removed),
      error: result.error,
    };
  }

  return {
    ok: false,
    removed: Boolean(result?.removed),
    error: result?.error ?? createError(
      RESET_ERROR_CODES.PURGE_FAILED,
      'A browser-local application value could not be removed.',
    ),
  };
};

const clearUsingList = (storage) => {
  if (
    typeof storage?.list !== 'function'
    || typeof storage?.remove !== 'function'
  ) {
    return {
      ok: false,
      removedKeys: [],
      error: createError(
        RESET_ERROR_CODES.STORAGE_UNAVAILABLE,
        'Browser-local application storage is unavailable.',
      ),
    };
  }

  let listed;

  try {
    listed = normalizeListResult(storage.list(STORAGE_PREFIX));
  } catch {
    return {
      ok: false,
      removedKeys: [],
      error: createError(
        RESET_ERROR_CODES.PURGE_FAILED,
        'Browser-local application data could not be listed.',
      ),
    };
  }

  if (!listed.ok) {
    return {
      ok: false,
      removedKeys: [],
      error: listed.error,
    };
  }

  const removedKeys = [];
  let operationError = listed.error;

  listed.keys.forEach((key) => {
    try {
      const result = removeStorageKey(storage, key);

      if (result.ok && result.removed) {
        removedKeys.push(key);
      }

      if (!result.ok || result.error) {
        operationError = result.error ?? operationError;
      }
    } catch {
      operationError = createError(
        RESET_ERROR_CODES.PURGE_FAILED,
        'A browser-local application value could not be removed.',
      );
    }
  });

  const allKeysRemoved = removedKeys.length === listed.keys.length;
  const response = {
    ok: allKeysRemoved,
    removedKeys: normalizeKeys(removedKeys),
  };

  if (operationError) {
    response.error = operationError;
  }

  if (!allKeysRemoved && !response.error) {
    response.error = createError(
      RESET_ERROR_CODES.PURGE_FAILED,
      'Not all browser-local application data could be removed.',
    );
  }

  return response;
};

const clearStorageNamespace = (storage) => {
  try {
    if (typeof storage?.clearNamespace === 'function') {
      return normalizeClearResult(
        storage.clearNamespace(STORAGE_PREFIX),
      );
    }

    if (typeof storage?.clearByPrefix === 'function') {
      return normalizeClearResult(
        storage.clearByPrefix(STORAGE_PREFIX),
      );
    }

    return clearUsingList(storage);
  } catch {
    return {
      ok: false,
      removedKeys: [],
      error: createError(
        RESET_ERROR_CODES.PURGE_FAILED,
        'Browser-local application data could not be removed.',
      ),
    };
  }
};

const clearSessionState = (repository) => {
  try {
    let result;

    if (typeof repository?.clearSession === 'function') {
      result = repository.clearSession();
    } else if (typeof repository?.clear === 'function') {
      result = repository.clear();
    } else if (typeof repository?.remove === 'function') {
      result = repository.remove();
    } else {
      return {
        ok: false,
        error: createError(
          RESET_ERROR_CODES.STORAGE_UNAVAILABLE,
          'The active session repository is unavailable.',
        ),
      };
    }

    if (result?.ok === false) {
      return {
        ok: false,
        error: result.error ?? createError(
          RESET_ERROR_CODES.PURGE_FAILED,
          'The active session could not be terminated.',
        ),
      };
    }

    return {
      ok: true,
      error: result?.error,
    };
  } catch {
    return {
      ok: false,
      error: createError(
        RESET_ERROR_CODES.PURGE_FAILED,
        'The active session could not be terminated.',
      ),
    };
  }
};

const clearNoticeState = (store) => {
  try {
    let result;

    if (typeof store?.clearNotices === 'function') {
      result = store.clearNotices();
    } else {
      const state = store?.getState?.();

      if (typeof state?.clearNotices === 'function') {
        result = state.clearNotices();
      } else if (typeof state?.clear === 'function') {
        result = state.clear();
      } else if (typeof store?.clear === 'function') {
        result = store.clear();
      } else {
        return {
          ok: true,
        };
      }
    }

    if (result?.ok === false) {
      return {
        ok: false,
        error: result.error ?? createError(
          RESET_ERROR_CODES.PURGE_FAILED,
          'System notice state could not be cleared.',
        ),
      };
    }

    return {
      ok: true,
      error: result?.error,
    };
  } catch {
    return {
      ok: false,
      error: createError(
        RESET_ERROR_CODES.PURGE_FAILED,
        'System notice state could not be cleared.',
      ),
    };
  }
};

const clearResetTarget = (target) => {
  try {
    let result;

    if (typeof target?.clearAllLocalState === 'function') {
      result = target.clearAllLocalState();
    } else if (typeof target?.clear === 'function') {
      result = target.clear();
    } else if (typeof target?.reset === 'function') {
      result = target.reset();
    } else {
      return {
        ok: true,
      };
    }

    if (result?.ok === false) {
      return {
        ok: false,
        error: result.error ?? createError(
          RESET_ERROR_CODES.PURGE_FAILED,
          'A browser-local repository could not be reset.',
        ),
      };
    }

    return {
      ok: true,
      error: result?.error,
    };
  } catch {
    return {
      ok: false,
      error: createError(
        RESET_ERROR_CODES.PURGE_FAILED,
        'A browser-local repository could not be reset.',
      ),
    };
  }
};

/**
 * Coordinates confirmed removal of all CFT-owned browser-local state.
 */
export class ResetService {
  constructor(
    storage = persistentStore,
    activeSessionRepository = sessionRepository,
    systemNoticeStore = noticeCenterStore,
    _logger = null,
    resetTargets = [],
  ) {
    this.storage = storage;
    this.sessionRepository = activeSessionRepository;
    this.noticeCenterStore = systemNoticeStore;
    this.resetTargets = Array.isArray(resetTargets)
      ? [...resetTargets]
      : [];
  }

  /**
   * Removes all CFT-owned durable and in-memory data without reseeding it.
   *
   * @param {{confirmed?: boolean}|boolean} request Reset confirmation.
   * @returns {{
   *   ok: boolean,
   *   data: {
   *     removedKeys: string[],
   *     sessionEnded: boolean,
   *     nextLoadBehavior: string
   *   }|null,
   *   warnings?: object[],
   *   error?: object
   * }} Reset result.
   */
  removeAllLocalData(request = {}) {
    const confirmed = request === true || request?.confirmed === true;

    if (!confirmed) {
      return {
        ok: false,
        data: null,
        error: createError(
          RESET_ERROR_CODES.CONFIRMATION_REQUIRED,
          'Confirmation is required before removing local application data.',
        ),
      };
    }

    const warnings = [];
    const purgeResult = clearStorageNamespace(this.storage);
    const sessionResult = clearSessionState(this.sessionRepository);
    const noticeResult = clearNoticeState(this.noticeCenterStore);

    addWarning(warnings, sessionResult.error);
    addWarning(warnings, noticeResult.error);

    this.resetTargets.forEach((target) => {
      const result = clearResetTarget(target);
      addWarning(warnings, result.error);
    });

    if (!purgeResult.ok) {
      return {
        ok: false,
        data: null,
        error: cloneError(
          purgeResult.error,
          RESET_ERROR_CODES.PURGE_FAILED,
          'Browser-local application data could not be removed.',
        ),
        warnings,
      };
    }

    addWarning(warnings, purgeResult.error);

    const response = {
      ok: true,
      data: {
        removedKeys: normalizeKeys(purgeResult.removedKeys),
        sessionEnded: true,
        nextLoadBehavior: RESET_NEXT_LOAD_BEHAVIOR,
      },
    };

    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    return response;
  }

  /**
   * Alias for removing all CFT-owned browser-local data.
   *
   * @param {{confirmed?: boolean}|boolean} request Reset confirmation.
   * @returns {object} Reset result.
   */
  reset(request = {}) {
    return this.removeAllLocalData(request);
  }

  /**
   * Alias for removing all CFT-owned browser-local data.
   *
   * @param {{confirmed?: boolean}|boolean} request Reset confirmation.
   * @returns {object} Reset result.
   */
  removeLocalData(request = {}) {
    return this.removeAllLocalData(request);
  }
}

export const resetService = new ResetService();

export default resetService;