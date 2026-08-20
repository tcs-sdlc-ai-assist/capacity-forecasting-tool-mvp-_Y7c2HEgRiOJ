import { STORAGE_KEYS } from '../constants/storageKeys.js';
import {
  createThresholds,
  isThresholds,
} from '../domain/schemas.js';
import persistentStore from '../platform/storage/persistentStore.js';

const INVALID_FILTER_PREFERENCES = 'INVALID_FILTER_PREFERENCES';
const FILTERS_READ_FAILED = 'FILTERS_READ_FAILED';
const FILTERS_WRITE_FAILED = 'FILTERS_WRITE_FAILED';
const FILTERS_CLEAR_FAILED = 'FILTERS_CLEAR_FAILED';
const INVALID_THRESHOLD_PREFERENCES = 'INVALID_THRESHOLD_PREFERENCES';
const THRESHOLDS_READ_FAILED = 'THRESHOLDS_READ_FAILED';
const THRESHOLDS_WRITE_FAILED = 'THRESHOLDS_WRITE_FAILED';
const THRESHOLDS_CLEAR_FAILED = 'THRESHOLDS_CLEAR_FAILED';

const createError = (code, message) => ({
  code,
  message,
});

const isPlainObject = (value) => {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const isJsonSafe = (value, visited = new Set()) => {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (
      typeof value === 'number'
      && Number.isFinite(value)
    )
  ) {
    return true;
  }

  if (
    typeof value !== 'object'
    || visited.has(value)
    || (!Array.isArray(value) && !isPlainObject(value))
  ) {
    return false;
  }

  visited.add(value);

  const valid = Array.isArray(value)
    ? value.every((item) => isJsonSafe(item, visited))
    : Object.entries(value).every(([key, item]) => (
      key !== '__proto__'
      && key !== 'constructor'
      && key !== 'prototype'
      && isJsonSafe(item, visited)
    ));

  visited.delete(value);
  return valid;
};

const cloneJsonValue = (value) => JSON.parse(JSON.stringify(value));

/**
 * Determines whether a value is a valid forecast-filter preference object.
 *
 * Filter preferences are intentionally extensible so new view filters can be
 * persisted without a storage migration. Values must remain JSON-safe.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value is a valid filter preference object.
 */
export const isFilterPreferences = (value) => (
  isPlainObject(value) && isJsonSafe(value)
);

/**
 * Creates an independent canonical copy of forecast-filter preferences.
 *
 * @param {object} filters Filter preferences.
 * @returns {object} Canonical filter preferences.
 */
export const createFilterPreferences = (filters = {}) => {
  if (!isFilterPreferences(filters)) {
    throw new TypeError('Invalid filter preferences.');
  }

  return cloneJsonValue(filters);
};

const cloneFilters = (filters) => createFilterPreferences(filters);
const cloneThresholds = (thresholds) => createThresholds(thresholds);

const readValue = (storage, key, failureCode, failureMessage) => {
  try {
    const result = storage.get(key);

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          failureCode,
          failureMessage,
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
      error: createError(failureCode, failureMessage),
    };
  }
};

const writeValue = (
  storage,
  key,
  value,
  failureCode,
  failureMessage,
) => {
  try {
    const result = storage.set(key, value);

    if (!result?.ok) {
      return {
        ok: false,
        mode: result?.mode,
        error: result?.error ?? createError(
          failureCode,
          failureMessage,
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      error: createError(failureCode, failureMessage),
    };
  }
};

const removeValue = (
  storage,
  key,
  failureCode,
  failureMessage,
) => {
  try {
    const result = storage.remove(key);

    if (!result?.ok) {
      return {
        ok: false,
        removed: Boolean(result?.removed),
        error: result?.error ?? createError(
          failureCode,
          failureMessage,
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      removed: false,
      error: createError(failureCode, failureMessage),
    };
  }
};

/**
 * Provides schema-aware access to forecast view-state and thresholds.
 *
 * Failed browser writes are retained by this repository for the lifetime of
 * the instance, allowing the current session to continue in memory.
 */
export class PreferenceRepository {
  constructor(storage = persistentStore) {
    this.storage = storage;
    this.filterMemoryOverride = false;
    this.filterMemoryValue = null;
    this.thresholdMemoryOverride = false;
    this.thresholdMemoryValue = null;
  }

  /**
   * Reads and validates persisted forecast filters.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getFilters() {
    if (this.filterMemoryOverride) {
      return {
        ok: true,
        data: this.filterMemoryValue === null
          ? null
          : cloneFilters(this.filterMemoryValue),
      };
    }

    const result = readValue(
      this.storage,
      STORAGE_KEYS.FILTERS,
      FILTERS_READ_FAILED,
      'Forecast filters could not be read from browser storage.',
    );

    if (!result.ok || result.data === null) {
      return result;
    }

    if (!isFilterPreferences(result.data)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_FILTER_PREFERENCES,
          'Stored forecast filters are invalid or incompatible.',
        ),
      };
    }

    return {
      ok: true,
      data: cloneFilters(result.data),
    };
  }

  /**
   * Alias for reading persisted forecast filters.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getFilterPreferences() {
    return this.getFilters();
  }

  /**
   * Persists forecast filters, falling back to repository memory on failure.
   *
   * @param {object} filters Forecast filter preferences.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  saveFilters(filters) {
    let canonicalFilters;

    try {
      canonicalFilters = createFilterPreferences(filters);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_FILTER_PREFERENCES,
          'Forecast filters could not be saved because their data is invalid.',
        ),
      };
    }

    const result = writeValue(
      this.storage,
      STORAGE_KEYS.FILTERS,
      canonicalFilters,
      FILTERS_WRITE_FAILED,
      'Forecast filters could not be saved to browser storage.',
    );

    if (!result.ok) {
      this.filterMemoryOverride = true;
      this.filterMemoryValue = cloneFilters(canonicalFilters);

      return {
        ok: true,
        data: cloneFilters(canonicalFilters),
        mode: 'memory',
        error: result.error,
      };
    }

    this.filterMemoryValue = cloneFilters(canonicalFilters);
    this.filterMemoryOverride = result.mode === 'memory';

    const response = {
      ok: true,
      data: cloneFilters(canonicalFilters),
      mode: result.mode,
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Alias for persisting forecast filters.
   *
   * @param {object} filters Forecast filter preferences.
   * @returns {object} Write result.
   */
  saveFilterPreferences(filters) {
    return this.saveFilters(filters);
  }

  /**
   * Alias for persisting forecast filters.
   *
   * @param {object} filters Forecast filter preferences.
   * @returns {object} Write result.
   */
  setFilters(filters) {
    return this.saveFilters(filters);
  }

  /**
   * Clears forecast filters from storage and the current session.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Clear result.
   */
  clearFilters() {
    const hadMemoryValue = this.filterMemoryValue !== null;
    const result = removeValue(
      this.storage,
      STORAGE_KEYS.FILTERS,
      FILTERS_CLEAR_FAILED,
      'Forecast filters could not be cleared from browser storage.',
    );

    this.filterMemoryValue = null;

    if (!result.ok) {
      this.filterMemoryOverride = true;

      return {
        ok: true,
        removed: hadMemoryValue || Boolean(result.removed),
        error: result.error,
      };
    }

    this.filterMemoryOverride = Boolean(result.error);

    const response = {
      ok: true,
      removed: hadMemoryValue || Boolean(result.removed),
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Reads and validates persisted capacity thresholds.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getThresholds() {
    if (this.thresholdMemoryOverride) {
      return {
        ok: true,
        data: this.thresholdMemoryValue === null
          ? null
          : cloneThresholds(this.thresholdMemoryValue),
      };
    }

    const result = readValue(
      this.storage,
      STORAGE_KEYS.THRESHOLDS,
      THRESHOLDS_READ_FAILED,
      'Capacity thresholds could not be read from browser storage.',
    );

    if (!result.ok || result.data === null) {
      return result;
    }

    if (!isThresholds(result.data)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_THRESHOLD_PREFERENCES,
          'Stored capacity thresholds are invalid or incompatible.',
        ),
      };
    }

    return {
      ok: true,
      data: cloneThresholds(result.data),
    };
  }

  /**
   * Alias for reading persisted capacity thresholds.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getThresholdPreferences() {
    return this.getThresholds();
  }

  /**
   * Persists thresholds, falling back to repository memory on failure.
   *
   * @param {object} thresholds Capacity threshold preferences.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  saveThresholds(thresholds) {
    let canonicalThresholds;

    try {
      canonicalThresholds = createThresholds(thresholds);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_THRESHOLD_PREFERENCES,
          'Capacity thresholds could not be saved because their data is invalid.',
        ),
      };
    }

    const result = writeValue(
      this.storage,
      STORAGE_KEYS.THRESHOLDS,
      canonicalThresholds,
      THRESHOLDS_WRITE_FAILED,
      'Capacity thresholds could not be saved to browser storage.',
    );

    if (!result.ok) {
      this.thresholdMemoryOverride = true;
      this.thresholdMemoryValue = cloneThresholds(canonicalThresholds);

      return {
        ok: true,
        data: cloneThresholds(canonicalThresholds),
        mode: 'memory',
        error: result.error,
      };
    }

    this.thresholdMemoryValue = cloneThresholds(canonicalThresholds);
    this.thresholdMemoryOverride = result.mode === 'memory';

    const response = {
      ok: true,
      data: cloneThresholds(canonicalThresholds),
      mode: result.mode,
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Alias for persisting capacity thresholds.
   *
   * @param {object} thresholds Capacity threshold preferences.
   * @returns {object} Write result.
   */
  saveThresholdPreferences(thresholds) {
    return this.saveThresholds(thresholds);
  }

  /**
   * Alias for persisting capacity thresholds.
   *
   * @param {object} thresholds Capacity threshold preferences.
   * @returns {object} Write result.
   */
  setThresholds(thresholds) {
    return this.saveThresholds(thresholds);
  }

  /**
   * Clears capacity thresholds from storage and the current session.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Clear result.
   */
  clearThresholds() {
    const hadMemoryValue = this.thresholdMemoryValue !== null;
    const result = removeValue(
      this.storage,
      STORAGE_KEYS.THRESHOLDS,
      THRESHOLDS_CLEAR_FAILED,
      'Capacity thresholds could not be cleared from browser storage.',
    );

    this.thresholdMemoryValue = null;

    if (!result.ok) {
      this.thresholdMemoryOverride = true;

      return {
        ok: true,
        removed: hadMemoryValue || Boolean(result.removed),
        error: result.error,
      };
    }

    this.thresholdMemoryOverride = Boolean(result.error);

    const response = {
      ok: true,
      removed: hadMemoryValue || Boolean(result.removed),
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Clears both forecast filters and capacity thresholds.
   *
   * @returns {{
   *   ok: boolean,
   *   removed: boolean,
   *   filters: object,
   *   thresholds: object,
   *   error?: object
   * }} Clear result.
   */
  clear() {
    const filters = this.clearFilters();
    const thresholds = this.clearThresholds();
    const response = {
      ok: filters.ok && thresholds.ok,
      removed: filters.removed || thresholds.removed,
      filters,
      thresholds,
    };

    const error = thresholds.error ?? filters.error;

    if (error) {
      response.error = error;
    }

    return response;
  }
}

export const preferenceRepository = new PreferenceRepository();

export default preferenceRepository;