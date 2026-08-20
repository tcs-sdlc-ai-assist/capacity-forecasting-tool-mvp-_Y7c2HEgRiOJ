import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';
import { STORAGE_KEYS } from '../constants/storageKeys.js';
import {
  createNotice,
  isNotice,
  NOTICE_SEVERITIES,
} from '../domain/schemas.js';
import persistentStore from '../platform/storage/persistentStore.js';

export const NOTICE_CENTER_ERROR_CODES = Object.freeze({
  INVALID_NOTICE: 'NOTICE_CENTER_INVALID_NOTICE',
  READ_FAILED: 'NOTICE_CENTER_READ_FAILED',
  WRITE_FAILED: 'NOTICE_CENTER_WRITE_FAILED',
  CLEAR_FAILED: 'NOTICE_CENTER_CLEAR_FAILED',
});

export const MAX_NOTICE_COUNT = 100;

const defaultSelector = (state) => state;

const createError = (code, message) => ({
  code,
  message,
});

const cloneNotice = (notice) => createNotice(notice);

const cloneNotices = (notices) => notices.map(cloneNotice);

const sanitizeString = (value, maximumLength) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximumLength);
};

const resolveTimestamp = (clock) => {
  let value;

  try {
    value = typeof clock === 'function'
      ? clock()
      : clock?.now?.();
  } catch {
    value = null;
  }

  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(value);

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
};

const createFallbackId = (timestamp) => {
  const timePart = Date.parse(timestamp).toString(36);
  const randomPart = Math.random().toString(36).slice(2, 12);

  return `notice-${timePart}-${randomPart}`;
};

const resolveNoticeId = (input, idGenerator, timestamp) => {
  const suppliedId = sanitizeString(input?.id, 128);

  if (suppliedId) {
    return suppliedId;
  }

  let generatedId;

  try {
    if (typeof idGenerator === 'function') {
      generatedId = idGenerator();
    } else if (typeof idGenerator?.generate === 'function') {
      generatedId = idGenerator.generate();
    } else if (typeof idGenerator?.generateId === 'function') {
      generatedId = idGenerator.generateId();
    }
  } catch {
    generatedId = null;
  }

  return sanitizeString(generatedId, 128)
    || createFallbackId(timestamp);
};

const resolveCreatedAt = (value, clock) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (
    typeof value === 'string'
    && value.trim()
    && Number.isFinite(Date.parse(value))
  ) {
    return new Date(value).toISOString();
  }

  return resolveTimestamp(clock);
};

const resolveSeverity = (value) => {
  const normalized = sanitizeString(value, 32).toLowerCase();

  return NOTICE_SEVERITIES.includes(normalized)
    ? normalized
    : 'info';
};

/**
 * Converts an untrusted notice-like value into a UI-safe canonical notice.
 *
 * @param {*} input Notice-like value.
 * @param {Function|object} clock Clock used for missing timestamps.
 * @param {Function|object|null} idGenerator Identifier generator.
 * @returns {object|null} Canonical notice, or null when required fields fail.
 */
export const sanitizeNotice = (
  input,
  clock = () => new Date(),
  idGenerator = null,
) => {
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
  ) {
    return null;
  }

  const code = sanitizeString(input.code, 64);
  const message = sanitizeString(input.message, 512);

  if (!code || !message) {
    return null;
  }

  const createdAt = resolveCreatedAt(input.createdAt, clock);

  try {
    return createNotice({
      id: resolveNoticeId(input, idGenerator, createdAt),
      code,
      severity: resolveSeverity(input.severity),
      message,
      dismissible: input.dismissible === undefined
        ? true
        : Boolean(input.dismissible),
      createdAt,
    });
  } catch {
    return null;
  }
};

const noticeSignature = (notice) => (
  `${notice.code}\u0000${notice.severity}\u0000${notice.message}`
);

const deduplicateNotices = (notices) => {
  const ids = new Set();
  const signatures = new Set();
  const result = [];

  notices.forEach((notice) => {
    const signature = noticeSignature(notice);

    if (ids.has(notice.id) || signatures.has(signature)) {
      return;
    }

    ids.add(notice.id);
    signatures.add(signature);
    result.push(notice);
  });

  return result.slice(-MAX_NOTICE_COUNT);
};

export const isNoticeEnvelope = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && value.schemaVersion === SUPPORTED_SCHEMA_VERSION
  && Array.isArray(value.notices)
  && value.notices.every(isNotice)
);

const createNoticeEnvelope = (notices) => ({
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  notices: cloneNotices(notices),
});

const readStoredValue = (storage) => {
  try {
    const result = typeof storage?.get === 'function'
      ? storage.get(STORAGE_KEYS.NOTICES)
      : storage?.getJson?.(STORAGE_KEYS.NOTICES);

    if (!result?.ok) {
      return {
        ok: false,
        data: [],
        error: result?.error ?? createError(
          NOTICE_CENTER_ERROR_CODES.READ_FAILED,
          'System notices could not be read from browser storage.',
        ),
      };
    }

    if (result.data === null || result.data === undefined) {
      return {
        ok: true,
        data: [],
      };
    }

    const storedNotices = Array.isArray(result.data)
      ? result.data
      : isNoticeEnvelope(result.data)
        ? result.data.notices
        : null;

    if (!storedNotices) {
      return {
        ok: false,
        data: [],
        error: createError(
          NOTICE_CENTER_ERROR_CODES.READ_FAILED,
          'Stored system notices are invalid or incompatible.',
        ),
      };
    }

    const notices = deduplicateNotices(
      storedNotices
        .map((notice) => sanitizeNotice(notice))
        .filter(Boolean),
    );

    return {
      ok: true,
      data: notices,
    };
  } catch {
    return {
      ok: false,
      data: [],
      error: createError(
        NOTICE_CENTER_ERROR_CODES.READ_FAILED,
        'System notices could not be read from browser storage.',
      ),
    };
  }
};

const writeStoredValue = (storage, notices) => {
  try {
    const envelope = createNoticeEnvelope(notices);
    const result = typeof storage?.set === 'function'
      ? storage.set(STORAGE_KEYS.NOTICES, envelope)
      : storage?.setJson?.(STORAGE_KEYS.NOTICES, envelope);

    if (!result?.ok) {
      return {
        ok: false,
        mode: result?.mode,
        error: result?.error ?? createError(
          NOTICE_CENTER_ERROR_CODES.WRITE_FAILED,
          'System notices could not be saved to browser storage.',
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      error: createError(
        NOTICE_CENTER_ERROR_CODES.WRITE_FAILED,
        'System notices could not be saved to browser storage.',
      ),
    };
  }
};

const removeStoredValue = (storage) => {
  try {
    const result = storage?.remove?.(STORAGE_KEYS.NOTICES);

    if (!result?.ok) {
      return {
        ok: false,
        removed: Boolean(result?.removed),
        error: result?.error ?? createError(
          NOTICE_CENTER_ERROR_CODES.CLEAR_FAILED,
          'System notices could not be cleared from browser storage.',
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      removed: false,
      error: createError(
        NOTICE_CENTER_ERROR_CODES.CLEAR_FAILED,
        'System notices could not be cleared from browser storage.',
      ),
    };
  }
};

/**
 * Creates a vanilla Zustand store for sanitized browser-local notices.
 *
 * @param {object} storage Persistent storage facade.
 * @param {Function|object} clock Clock used to create notice timestamps.
 * @param {Function|object|null} idGenerator Notice identifier generator.
 * @returns {object} Zustand store API with notice facade helpers.
 */
export const createNoticeCenterStore = (
  storage = persistentStore,
  clock = () => new Date(),
  idGenerator = null,
) => {
  const initialRead = readStoredValue(storage);
  const initialNotices = initialRead.ok
    ? cloneNotices(initialRead.data)
    : [];

  const store = createStore((set, get) => ({
    notices: initialNotices,
    items: initialNotices,
    persistenceMode: null,
    persistenceError: initialRead.error ?? null,

    addNotice(input) {
      const notice = sanitizeNotice(input, clock, idGenerator);

      if (!notice) {
        return {
          ok: false,
          data: null,
          error: createError(
            NOTICE_CENTER_ERROR_CODES.INVALID_NOTICE,
            'The system notice is invalid.',
          ),
        };
      }

      const currentNotices = get().notices;
      const existingNotice = currentNotices.find((candidate) => (
        candidate.id === notice.id
        || noticeSignature(candidate) === noticeSignature(notice)
      ));

      if (existingNotice) {
        return {
          ok: true,
          data: cloneNotice(existingNotice),
          deduplicated: true,
        };
      }

      const notices = deduplicateNotices([
        ...currentNotices,
        notice,
      ]);
      const persisted = writeStoredValue(storage, notices);

      set({
        notices,
        items: notices,
        persistenceMode: persisted.mode ?? get().persistenceMode,
        persistenceError: persisted.error ?? null,
      });

      const response = {
        ok: true,
        data: cloneNotice(notice),
        deduplicated: false,
      };

      if (persisted.mode) {
        response.mode = persisted.mode;
      }

      if (persisted.error) {
        response.error = persisted.error;
      }

      return response;
    },

    enqueueNotice(input) {
      return get().addNotice(input);
    },

    publishNotice(input) {
      return get().addNotice(input);
    },

    dismissNotice(noticeId) {
      const normalizedId = sanitizeString(noticeId, 128);
      const currentNotices = get().notices;
      const notice = currentNotices.find((candidate) => (
        candidate.id === normalizedId
      ));

      if (!notice || !notice.dismissible) {
        return {
          ok: true,
          removed: false,
        };
      }

      const notices = currentNotices.filter((candidate) => (
        candidate.id !== normalizedId
      ));
      const persisted = notices.length === 0
        ? removeStoredValue(storage)
        : writeStoredValue(storage, notices);

      set({
        notices,
        items: notices,
        persistenceMode: persisted.mode ?? get().persistenceMode,
        persistenceError: persisted.error ?? null,
      });

      const response = {
        ok: true,
        removed: true,
      };

      if (persisted.mode) {
        response.mode = persisted.mode;
      }

      if (persisted.error) {
        response.error = persisted.error;
      }

      return response;
    },

    dismiss(noticeId) {
      return get().dismissNotice(noticeId);
    },

    clearNotices(options = {}) {
      const dismissibleOnly = options?.dismissibleOnly === true;
      const currentNotices = get().notices;
      const notices = dismissibleOnly
        ? currentNotices.filter((notice) => !notice.dismissible)
        : [];

      if (notices.length === currentNotices.length) {
        return {
          ok: true,
          removed: false,
        };
      }

      const persisted = notices.length === 0
        ? removeStoredValue(storage)
        : writeStoredValue(storage, notices);

      set({
        notices,
        items: notices,
        persistenceMode: persisted.mode ?? get().persistenceMode,
        persistenceError: persisted.error ?? null,
      });

      const response = {
        ok: true,
        removed: true,
      };

      if (persisted.mode) {
        response.mode = persisted.mode;
      }

      if (persisted.error) {
        response.error = persisted.error;
      }

      return response;
    },

    clear(options) {
      return get().clearNotices(options);
    },

    hydrate() {
      const result = readStoredValue(storage);
      const notices = result.ok ? cloneNotices(result.data) : [];

      set({
        notices,
        items: notices,
        persistenceError: result.error ?? null,
      });

      return {
        ok: result.ok,
        data: cloneNotices(notices),
        error: result.error,
      };
    },
  }));

  return Object.assign(store, {
    getNotices() {
      return cloneNotices(store.getState().notices);
    },

    addNotice(input) {
      return store.getState().addNotice(input);
    },

    dismissNotice(noticeId) {
      return store.getState().dismissNotice(noticeId);
    },

    clearNotices(options) {
      return store.getState().clearNotices(options);
    },

    hydrate() {
      return store.getState().hydrate();
    },

    subscribeToNotices(listener, options = {}) {
      if (typeof listener !== 'function') {
        return () => {};
      }

      if (options?.fireImmediately === true) {
        listener(cloneNotices(store.getState().notices), []);
      }

      return store.subscribe((state, previousState) => {
        if (state.notices !== previousState.notices) {
          listener(
            cloneNotices(state.notices),
            cloneNotices(previousState.notices),
          );
        }
      });
    },
  });
};

export const noticeCenterStore = createNoticeCenterStore();

/**
 * React hook for selecting notice-center state.
 *
 * @param {Function} selector Zustand state selector.
 * @returns {*} Selected notice-center state.
 */
export const useNoticeCenterStore = (selector = defaultSelector) => (
  useStore(noticeCenterStore, selector)
);

export default noticeCenterStore;