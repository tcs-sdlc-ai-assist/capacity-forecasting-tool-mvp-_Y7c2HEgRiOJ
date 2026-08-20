import { ERROR_CODES } from '../../constants/domainConstants.js';
import { STORAGE_PREFIX } from '../../constants/storageKeys.js';
import {
  BrowserStorageAdapter,
} from './browserStorageAdapter.js';
import { MemoryFallbackStore } from './memoryFallbackStore.js';

const createStorageError = (name, code = undefined) => {
  const error = new Error(`${name} storage failure.`);

  error.name = name;

  if (code !== undefined) {
    Object.defineProperty(error, 'code', {
      configurable: true,
      value: code,
    });
  }

  return error;
};

const createStorage = ({
  getError = null,
  setError = null,
  removeError = null,
  initialValues = {},
} = {}) => {
  const values = new Map(
    Object.entries(initialValues).map(([key, value]) => [
      key,
      String(value),
    ]),
  );
  let getCallCount = 0;
  let setCallCount = 0;
  let removeCallCount = 0;

  return {
    get length() {
      return values.size;
    },

    get getCallCount() {
      return getCallCount;
    },

    get setCallCount() {
      return setCallCount;
    },

    get removeCallCount() {
      return removeCallCount;
    },

    getItem(key) {
      getCallCount += 1;

      if (getError) {
        throw getError;
      }

      return values.has(key) ? values.get(key) : null;
    },

    setItem(key, value) {
      setCallCount += 1;

      if (setError) {
        throw setError;
      }

      values.set(key, String(value));
    },

    removeItem(key) {
      removeCallCount += 1;

      if (removeError) {
        throw removeError;
      }

      values.delete(key);
    },

    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
  };
};

describe('BrowserStorageAdapter', () => {
  it('stores JSON-safe values and returns independent parsed copies', () => {
    const storage = createStorage();
    const adapter = new BrowserStorageAdapter(
      storage,
      new MemoryFallbackStore(),
    );
    const source = {
      name: 'Forecast dataset',
      dimensions: {
        teams: ['Atlas', 'Beacon'],
      },
      counts: [2, 4],
    };

    const writeResult = adapter.setJson(
      `${STORAGE_PREFIX}json-safe`,
      source,
    );

    source.dimensions.teams.push('Cirrus');
    source.counts[0] = 99;

    const firstRead = adapter.getJson(`${STORAGE_PREFIX}json-safe`);

    firstRead.data.dimensions.teams.push('Delta');

    const secondRead = adapter.getJson(`${STORAGE_PREFIX}json-safe`);

    expect(writeResult).toEqual({
      ok: true,
      mode: 'localStorage',
    });
    expect(firstRead.ok).toBe(true);
    expect(secondRead).toEqual({
      ok: true,
      data: {
        name: 'Forecast dataset',
        dimensions: {
          teams: ['Atlas', 'Beacon'],
        },
        counts: [2, 4],
      },
    });
    expect(adapter.getMode()).toBe('localStorage');
    expect(adapter.getLastError()).toBeNull();
  });

  it('rejects values that cannot be serialized without changing mode', () => {
    const storage = createStorage();
    const memoryStore = new MemoryFallbackStore();
    const adapter = new BrowserStorageAdapter(storage, memoryStore);
    const circularValue = {
      name: 'Circular value',
    };

    circularValue.self = circularValue;

    const result = adapter.setJson(
      `${STORAGE_PREFIX}circular`,
      circularValue,
    );

    expect(result).toEqual({
      ok: false,
      mode: 'localStorage',
      error: {
        code: 'STORAGE_SERIALIZATION_FAILED',
        message: 'The value could not be serialized for browser storage.',
      },
    });
    expect(storage.setCallCount).toBe(0);
    expect(memoryStore.get(`${STORAGE_PREFIX}circular`)).toBeNull();
    expect(adapter.getMode()).toBe('localStorage');
  });

  it('returns a safe error when stored JSON is malformed', () => {
    const key = `${STORAGE_PREFIX}malformed`;
    const storage = createStorage({
      initialValues: {
        [key]: '{"workItems":',
      },
    });
    const adapter = new BrowserStorageAdapter(
      storage,
      new MemoryFallbackStore(),
    );

    const result = adapter.getJson(key);

    expect(result).toEqual({
      ok: false,
      data: null,
      error: {
        code: 'STORAGE_PARSE_FAILED',
        message: 'Stored browser data could not be parsed.',
      },
    });
    expect(adapter.getMode()).toBe('localStorage');
  });

  it('clears only CFT-owned keys and preserves unrelated browser data', () => {
    const storage = createStorage();
    const adapter = new BrowserStorageAdapter(
      storage,
      new MemoryFallbackStore(),
    );

    adapter.setJson(`${STORAGE_PREFIX}session`, {
      sessionId: 'session-001',
    });
    adapter.setJson(`${STORAGE_PREFIX}dataset.content`, {
      workItems: [],
    });
    adapter.setJson('another-app.preferences', {
      theme: 'dark',
    });

    const result = adapter.clearByPrefix(STORAGE_PREFIX);
    const cftKeys = adapter.list(STORAGE_PREFIX);
    const unrelatedValue = adapter.getJson(
      'another-app.preferences',
    );

    expect(result).toEqual({
      ok: true,
      removedKeys: [
        `${STORAGE_PREFIX}dataset.content`,
        `${STORAGE_PREFIX}session`,
      ],
    });
    expect(cftKeys).toEqual({
      ok: true,
      keys: [],
    });
    expect(unrelatedValue).toEqual({
      ok: true,
      data: {
        theme: 'dark',
      },
    });
  });

  it('refuses to clear prefixes outside the CFT namespace', () => {
    const storage = createStorage();
    const adapter = new BrowserStorageAdapter(
      storage,
      new MemoryFallbackStore(),
    );

    adapter.setJson('another-app.session', {
      active: true,
    });

    const result = adapter.clearByPrefix('another-app.');

    expect(result).toEqual({
      ok: false,
      removedKeys: [],
      error: {
        code: 'INVALID_STORAGE_PREFIX',
        message: `Only ${STORAGE_PREFIX} browser storage keys can be cleared.`,
      },
    });
    expect(adapter.getJson('another-app.session')).toEqual({
      ok: true,
      data: {
        active: true,
      },
    });
  });

  it('degrades to memory after a quota exception and skips later durable writes', () => {
    const quotaError = createStorageError('QuotaExceededError', 22);
    const storage = createStorage({
      setError: quotaError,
    });
    const memoryStore = new MemoryFallbackStore();
    const adapter = new BrowserStorageAdapter(storage, memoryStore);
    const firstKey = `${STORAGE_PREFIX}dataset.content`;
    const secondKey = `${STORAGE_PREFIX}filters`;

    const firstResult = adapter.setJson(firstKey, {
      workItems: [{ recordId: 'work-item-001' }],
    });
    const secondResult = adapter.setJson(secondKey, {
      selectedTeams: ['Atlas'],
    });

    expect(firstResult).toEqual({
      ok: true,
      mode: 'memory',
      error: {
        code: ERROR_CODES.STORAGE_QUOTA_EXCEEDED,
        message: 'Browser storage quota was exceeded. Changes will be kept in memory for this session.',
      },
    });
    expect(secondResult).toEqual({
      ok: true,
      mode: 'memory',
      error: {
        code: ERROR_CODES.STORAGE_QUOTA_EXCEEDED,
        message: 'Browser storage quota was exceeded. Changes will be kept in memory for this session.',
      },
    });
    expect(storage.setCallCount).toBe(1);
    expect(adapter.getMode()).toBe('memory');
    expect(adapter.getJson(firstKey).data).toEqual({
      workItems: [{ recordId: 'work-item-001' }],
    });
    expect(adapter.getJson(secondKey).data).toEqual({
      selectedTeams: ['Atlas'],
    });
  });

  it('degrades on a security exception and reads the in-memory fallback', () => {
    const securityError = createStorageError('SecurityError');
    const storage = createStorage({
      getError: securityError,
    });
    const memoryStore = new MemoryFallbackStore();
    const key = `${STORAGE_PREFIX}session`;

    memoryStore.set(key, JSON.stringify({
      sessionId: 'memory-session-001',
    }));

    const adapter = new BrowserStorageAdapter(storage, memoryStore);
    const result = adapter.getJson(key);

    expect(result).toEqual({
      ok: true,
      data: {
        sessionId: 'memory-session-001',
      },
    });
    expect(adapter.getMode()).toBe('memory');
    expect(adapter.getLastError()).toEqual({
      code: ERROR_CODES.STORAGE_UNAVAILABLE,
      message: 'Browser storage is unavailable. Changes will be kept in memory for this session.',
    });
    expect(storage.getCallCount).toBe(1);
  });

  it('starts in memory-only mode when browser storage is unavailable', () => {
    const adapter = new BrowserStorageAdapter(
      null,
      new MemoryFallbackStore(),
    );
    const status = adapter.getLastError();

    status.message = 'Changed by the caller.';

    expect(adapter.getMode()).toBe('memory');
    expect(adapter.getLastError()).toEqual({
      code: ERROR_CODES.STORAGE_UNAVAILABLE,
      message: 'Browser storage is unavailable. Changes will be kept in memory for this session.',
    });

    const result = adapter.setJson(`${STORAGE_PREFIX}thresholds`, {
      constrained: 80,
      exceeded: 100,
    });

    expect(result).toEqual({
      ok: true,
      mode: 'memory',
      error: {
        code: ERROR_CODES.STORAGE_UNAVAILABLE,
        message: 'Browser storage is unavailable. Changes will be kept in memory for this session.',
      },
    });
    expect(adapter.getJson(`${STORAGE_PREFIX}thresholds`)).toEqual({
      ok: true,
      data: {
        constrained: 80,
        exceeded: 100,
      },
    });
  });

  it('reports generic persistence failure for unexpected storage errors', () => {
    const storage = createStorage({
      setError: createStorageError('UnknownStorageError'),
    });
    const adapter = new BrowserStorageAdapter(
      storage,
      new MemoryFallbackStore(),
    );

    const result = adapter.setJson(`${STORAGE_PREFIX}notices`, {
      notices: [],
    });

    expect(result).toEqual({
      ok: true,
      mode: 'memory',
      error: {
        code: ERROR_CODES.PERSISTENCE_FAILED,
        message: 'The browser storage operation failed. Changes will be kept in memory for this session.',
      },
    });
    expect(adapter.getMode()).toBe('memory');
    expect(adapter.getLastError()).toEqual(result.error);
  });
});