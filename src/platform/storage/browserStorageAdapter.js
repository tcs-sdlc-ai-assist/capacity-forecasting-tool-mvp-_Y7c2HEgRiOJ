import { ERROR_CODES } from '../../constants/domainConstants.js';
import { STORAGE_PREFIX } from '../../constants/storageKeys.js';
import MemoryFallbackStore from './memoryFallbackStore.js';

const STORAGE_PARSE_FAILED = 'STORAGE_PARSE_FAILED';
const STORAGE_SERIALIZATION_FAILED = 'STORAGE_SERIALIZATION_FAILED';
const INVALID_STORAGE_PREFIX = 'INVALID_STORAGE_PREFIX';

const getDefaultStorage = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const isStorageLike = (storage) => (
  storage !== null
  && typeof storage === 'object'
  && typeof storage.getItem === 'function'
  && typeof storage.setItem === 'function'
  && typeof storage.removeItem === 'function'
);

const createError = (code, message) => ({
  code,
  message,
});

const isQuotaError = (error) => (
  error !== null
  && typeof error === 'object'
  && (
    error.name === 'QuotaExceededError'
    || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error.code === 22
    || error.code === 1014
  )
);

const isSecurityError = (error) => (
  error !== null
  && typeof error === 'object'
  && (
    error.name === 'SecurityError'
    || error.name === 'InvalidStateError'
    || error.name === 'NotSupportedError'
  )
);

const toStorageError = (error) => {
  if (isQuotaError(error)) {
    return createError(
      ERROR_CODES.STORAGE_QUOTA_EXCEEDED,
      'Browser storage quota was exceeded. Changes will be kept in memory for this session.',
    );
  }

  if (isSecurityError(error)) {
    return createError(
      ERROR_CODES.STORAGE_UNAVAILABLE,
      'Browser storage is unavailable. Changes will be kept in memory for this session.',
    );
  }

  return createError(
    ERROR_CODES.PERSISTENCE_FAILED,
    'The browser storage operation failed. Changes will be kept in memory for this session.',
  );
};

const cloneSerializedValue = (serializedValue) => (
  JSON.parse(serializedValue)
);

const parseStoredValue = (storedValue) => {
  if (typeof storedValue === 'string') {
    return JSON.parse(storedValue);
  }

  const serializedValue = JSON.stringify(storedValue);

  if (serializedValue === undefined) {
    throw new TypeError('Stored value is not JSON serializable.');
  }

  return cloneSerializedValue(serializedValue);
};

/**
 * Provides fail-soft JSON access to browser storage with an in-memory mirror.
 */
export class BrowserStorageAdapter {
  constructor(
    windowStorage = getDefaultStorage(),
    memoryFallbackStore = new MemoryFallbackStore(),
    _logger = null,
  ) {
    this.windowStorage = isStorageLike(windowStorage)
      ? windowStorage
      : null;
    this.memoryFallbackStore = memoryFallbackStore;
    this.mode = this.windowStorage ? 'localStorage' : 'memory';
    this.lastError = this.windowStorage
      ? null
      : createError(
        ERROR_CODES.STORAGE_UNAVAILABLE,
        'Browser storage is unavailable. Changes will be kept in memory for this session.',
      );
  }

  /**
   * Returns the currently active persistence mode.
   *
   * @returns {'localStorage'|'memory'} Active persistence mode.
   */
  getMode() {
    return this.mode;
  }

  /**
   * Returns the most recent storage failure, if one occurred.
   *
   * @returns {{code: string, message: string}|null} Safe storage error.
   */
  getLastError() {
    return this.lastError ? { ...this.lastError } : null;
  }

  /**
   * Reads and parses a JSON-compatible value.
   *
   * @param {string} key Storage key.
   * @returns {{ok: boolean, data: *|null, error?: object}} Read result.
   */
  getJson(key) {
    if (typeof key !== 'string' || key.length === 0) {
      return {
        ok: false,
        data: null,
        error: createError(
          ERROR_CODES.STORAGE_UNAVAILABLE,
          'A valid browser storage key is required.',
        ),
      };
    }

    let storedValue = null;

    if (this.mode === 'localStorage' && this.windowStorage) {
      try {
        storedValue = this.windowStorage.getItem(key);
      } catch (error) {
        this.degrade(error);
      }
    }

    if (storedValue === null) {
      try {
        storedValue = this.memoryFallbackStore.get(key);
      } catch {
        return {
          ok: false,
          data: null,
          error: createError(
            ERROR_CODES.PERSISTENCE_FAILED,
            'The in-memory storage operation failed.',
          ),
        };
      }
    }

    if (storedValue === null || storedValue === undefined) {
      return {
        ok: true,
        data: null,
      };
    }

    try {
      const data = parseStoredValue(storedValue);

      if (this.mode === 'localStorage') {
        this.mirrorValue(key, data);
      }

      return {
        ok: true,
        data,
      };
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          STORAGE_PARSE_FAILED,
          'Stored browser data could not be parsed.',
        ),
      };
    }
  }

  /**
   * Serializes and stores a JSON-compatible value.
   *
   * @param {string} key Storage key.
   * @param {*} value JSON-compatible value.
   * @returns {{ok: boolean, mode: 'localStorage'|'memory', error?: object}}
   * Storage result.
   */
  setJson(key, value) {
    if (typeof key !== 'string' || key.length === 0) {
      return {
        ok: false,
        mode: this.mode,
        error: createError(
          ERROR_CODES.STORAGE_UNAVAILABLE,
          'A valid browser storage key is required.',
        ),
      };
    }

    let serializedValue;

    try {
      serializedValue = JSON.stringify(value);

      if (serializedValue === undefined) {
        throw new TypeError('Value is not JSON serializable.');
      }
    } catch {
      return {
        ok: false,
        mode: this.mode,
        error: createError(
          STORAGE_SERIALIZATION_FAILED,
          'The value could not be serialized for browser storage.',
        ),
      };
    }

    const mirroredValue = cloneSerializedValue(serializedValue);

    if (this.mode === 'localStorage' && this.windowStorage) {
      try {
        this.windowStorage.setItem(key, serializedValue);
        this.mirrorValue(key, mirroredValue);

        return {
          ok: true,
          mode: 'localStorage',
        };
      } catch (error) {
        this.degrade(error);
      }
    }

    try {
      this.memoryFallbackStore.set(key, mirroredValue);

      return {
        ok: true,
        mode: 'memory',
        error: this.getLastError(),
      };
    } catch {
      return {
        ok: false,
        mode: 'memory',
        error: createError(
          ERROR_CODES.PERSISTENCE_FAILED,
          'The value could not be stored in browser or memory storage.',
        ),
      };
    }
  }

  /**
   * Removes a value from active storage and its in-memory mirror.
   *
   * @param {string} key Storage key.
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  remove(key) {
    if (typeof key !== 'string' || key.length === 0) {
      return {
        ok: false,
        removed: false,
        error: createError(
          ERROR_CODES.STORAGE_UNAVAILABLE,
          'A valid browser storage key is required.',
        ),
      };
    }

    let removed = false;

    if (this.mode === 'localStorage' && this.windowStorage) {
      try {
        const existingValue = this.windowStorage.getItem(key);
        this.windowStorage.removeItem(key);
        removed = existingValue !== null;
      } catch (error) {
        this.degrade(error);
      }
    }

    try {
      removed = this.memoryFallbackStore.remove(key) || removed;
    } catch {
      return {
        ok: false,
        removed,
        error: createError(
          ERROR_CODES.PERSISTENCE_FAILED,
          'The in-memory storage operation failed.',
        ),
      };
    }

    if (this.mode === 'memory' && this.lastError) {
      return {
        ok: true,
        removed,
        error: this.getLastError(),
      };
    }

    return {
      ok: true,
      removed,
    };
  }

  /**
   * Lists keys matching a prefix across durable and in-memory storage.
   *
   * @param {string} prefix Storage key prefix.
   * @returns {{ok: boolean, keys: string[], error?: object}} List result.
   */
  list(prefix = '') {
    if (typeof prefix !== 'string') {
      return {
        ok: false,
        keys: [],
        error: createError(
          ERROR_CODES.STORAGE_UNAVAILABLE,
          'The browser storage prefix must be a string.',
        ),
      };
    }

    const keys = new Set();

    if (this.mode === 'localStorage' && this.windowStorage) {
      try {
        this.listPersistentKeys().forEach((key) => {
          if (key.startsWith(prefix)) {
            keys.add(key);
          }
        });
      } catch (error) {
        this.degrade(error);
      }
    }

    try {
      this.memoryFallbackStore.list(prefix).forEach((key) => {
        keys.add(key);
      });
    } catch {
      return {
        ok: false,
        keys: Array.from(keys).sort(),
        error: createError(
          ERROR_CODES.PERSISTENCE_FAILED,
          'The in-memory storage operation failed.',
        ),
      };
    }

    const result = {
      ok: true,
      keys: Array.from(keys).sort(),
    };

    if (this.mode === 'memory' && this.lastError) {
      result.error = this.getLastError();
    }

    return result;
  }

  /**
   * Clears CFT-owned values matching a namespace prefix.
   *
   * @param {string} prefix CFT storage key prefix.
   * @returns {{ok: boolean, removedKeys: string[], error?: object}}
   * Clear result.
   */
  clearByPrefix(prefix = STORAGE_PREFIX) {
    if (
      typeof prefix !== 'string'
      || !prefix.startsWith(STORAGE_PREFIX)
    ) {
      return {
        ok: false,
        removedKeys: [],
        error: createError(
          INVALID_STORAGE_PREFIX,
          `Only ${STORAGE_PREFIX} browser storage keys can be cleared.`,
        ),
      };
    }

    const listed = this.list(prefix);

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
      if (!key.startsWith(STORAGE_PREFIX)) {
        return;
      }

      const result = this.remove(key);

      if (result.ok && result.removed) {
        removedKeys.push(key);
      }

      if (!result.ok || result.error) {
        operationError = result.error ?? operationError;
      }
    });

    const result = {
      ok: true,
      removedKeys: removedKeys.sort(),
    };

    if (operationError) {
      result.error = operationError;
    }

    return result;
  }

  /**
   * Alias for clearing CFT-owned keys by namespace.
   *
   * @param {string} namespace CFT namespace prefix.
   * @returns {{ok: boolean, removedKeys: string[], error?: object}}
   * Clear result.
   */
  clearNamespace(namespace = STORAGE_PREFIX) {
    return this.clearByPrefix(namespace);
  }

  /**
   * Alias for reading JSON-compatible values.
   *
   * @param {string} key Storage key.
   * @returns {{ok: boolean, data: *|null, error?: object}} Read result.
   */
  get(key) {
    return this.getJson(key);
  }

  /**
   * Alias for storing JSON-compatible values.
   *
   * @param {string} key Storage key.
   * @param {*} value JSON-compatible value.
   * @returns {{ok: boolean, mode: 'localStorage'|'memory', error?: object}}
   * Storage result.
   */
  set(key, value) {
    return this.setJson(key, value);
  }

  degrade(error) {
    this.mode = 'memory';
    this.lastError = toStorageError(error);
  }

  mirrorValue(key, value) {
    try {
      this.memoryFallbackStore.set(key, value);
    } catch {
      // Durable storage remains authoritative when mirroring is unavailable.
    }
  }

  listPersistentKeys() {
    const keys = [];

    if (
      typeof this.windowStorage.key === 'function'
      && Number.isInteger(this.windowStorage.length)
    ) {
      for (let index = 0; index < this.windowStorage.length; index += 1) {
        const key = this.windowStorage.key(index);

        if (typeof key === 'string') {
          keys.push(key);
        }
      }

      return keys;
    }

    return Object.keys(this.windowStorage).filter((key) => (
      typeof key === 'string'
      && typeof this.windowStorage[key] !== 'function'
    ));
  }
}

export default BrowserStorageAdapter;