import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';
import { STORAGE_KEYS } from '../constants/storageKeys.js';
import { getDemoUsers } from '../data/demoUsers.js';
import persistentStore from '../platform/storage/persistentStore.js';

const INVALID_DEMO_USERS = 'INVALID_DEMO_USERS';
const DEMO_USERS_READ_FAILED = 'DEMO_USERS_READ_FAILED';
const DEMO_USERS_WRITE_FAILED = 'DEMO_USERS_WRITE_FAILED';

const createError = (code, message) => ({
  code,
  message,
});

const isBoundedString = (value, minimum, maximum) => (
  typeof value === 'string'
  && value.length >= minimum
  && value.length <= maximum
);

const isIsoDateTime = (value) => (
  typeof value === 'string'
  && value.length > 0
  && Number.isFinite(Date.parse(value))
);

const isDemoUser = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && isBoundedString(value.username, 1, 64)
  && isBoundedString(value.password, 1, 128)
  && isBoundedString(value.displayName, 1, 128)
);

export const isDemoUserEnvelope = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && value.schemaVersion === SUPPORTED_SCHEMA_VERSION
  && Array.isArray(value.users)
  && value.users.length > 0
  && value.users.every(isDemoUser)
  && new Set(value.users.map((user) => user.username)).size
    === value.users.length
  && isIsoDateTime(value.seededAt)
);

const cloneUsers = (users) => (
  users.map((user) => ({
    username: user.username,
    password: user.password,
    displayName: user.displayName,
  }))
);

const cloneEnvelope = (envelope) => ({
  schemaVersion: envelope.schemaVersion,
  users: cloneUsers(envelope.users),
  seededAt: envelope.seededAt,
});

const normalizeUsers = (users) => {
  if (!Array.isArray(users)) {
    return null;
  }

  const normalizedUsers = users.map((user) => ({
    username: typeof user?.username === 'string'
      ? user.username.trim()
      : '',
    password: typeof user?.password === 'string'
      ? user.password
      : '',
    displayName: typeof user?.displayName === 'string'
      ? user.displayName.trim()
      : '',
  }));

  return normalizedUsers.length > 0
    && normalizedUsers.every(isDemoUser)
    && new Set(normalizedUsers.map((user) => user.username)).size
      === normalizedUsers.length
    ? normalizedUsers
    : null;
};

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

/**
 * Provides schema-aware access to locally persisted demo users.
 */
export class DemoUserRepository {
  constructor(storage = persistentStore, clock = () => new Date()) {
    this.storage = storage;
    this.clock = clock;
  }

  /**
   * Reads the persisted demo-user envelope.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getEnvelope() {
    let result;

    try {
      result = this.storage.get(STORAGE_KEYS.DEMO_USERS);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          DEMO_USERS_READ_FAILED,
          'Demo users could not be read from browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          DEMO_USERS_READ_FAILED,
          'Demo users could not be read from browser storage.',
        ),
      };
    }

    if (result.data === null || result.data === undefined) {
      return {
        ok: true,
        data: null,
      };
    }

    if (!isDemoUserEnvelope(result.data)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_DEMO_USERS,
          'Stored demo-user data is invalid or incompatible.',
        ),
      };
    }

    return {
      ok: true,
      data: cloneEnvelope(result.data),
    };
  }

  /**
   * Reads independent copies of the persisted demo users.
   *
   * @returns {{ok: boolean, data: object[]|null, error?: object}} Read result.
   */
  getUsers() {
    const result = this.getEnvelope();

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: result.data ? cloneUsers(result.data.users) : null,
    };
  }

  /**
   * Alias for reading all persisted demo users.
   *
   * @returns {{ok: boolean, data: object[]|null, error?: object}} Read result.
   */
  getAll() {
    return this.getUsers();
  }

  /**
   * Stores a validated demo-user envelope.
   *
   * @param {Array<{username: string, password: string, displayName: string}>}
   * users Demo users to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  seed(users = getDemoUsers()) {
    const normalizedUsers = normalizeUsers(users);

    if (!normalizedUsers) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_DEMO_USERS,
          'Demo users could not be seeded because their data is invalid.',
        ),
      };
    }

    const envelope = {
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      users: normalizedUsers,
      seededAt: resolveTimestamp(this.clock),
    };

    let result;

    try {
      result = this.storage.set(STORAGE_KEYS.DEMO_USERS, envelope);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          DEMO_USERS_WRITE_FAILED,
          'Demo users could not be saved to browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        mode: result?.mode,
        error: result?.error ?? createError(
          DEMO_USERS_WRITE_FAILED,
          'Demo users could not be saved to browser storage.',
        ),
      };
    }

    const response = {
      ok: true,
      data: cloneEnvelope(envelope),
      mode: result.mode,
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Seeds bundled users when persisted users are absent or invalid.
   *
   * @returns {{
   *   ok: boolean,
   *   data: {initialized: boolean, users: object[]}|null,
   *   mode?: string,
   *   error?: object
   * }} Initialization result.
   */
  ensureSeeded() {
    const existing = this.getEnvelope();

    if (existing.ok && existing.data) {
      return {
        ok: true,
        data: {
          initialized: false,
          users: cloneUsers(existing.data.users),
        },
      };
    }

    const seeded = this.seed();

    if (!seeded.ok) {
      return {
        ok: false,
        data: null,
        mode: seeded.mode,
        error: seeded.error,
      };
    }

    const response = {
      ok: true,
      data: {
        initialized: true,
        users: cloneUsers(seeded.data.users),
      },
      mode: seeded.mode,
    };

    if (seeded.error) {
      response.error = seeded.error;
    }

    return response;
  }

  /**
   * Finds a demo user by case-insensitive normalized username.
   *
   * @param {string} username Username to find.
   * @returns {{ok: boolean, data: object|null, error?: object}} Lookup result.
   */
  findByUsername(username) {
    const normalizedUsername = typeof username === 'string'
      ? username.trim().toLowerCase()
      : '';

    if (!normalizedUsername) {
      return {
        ok: true,
        data: null,
      };
    }

    const result = this.getUsers();

    if (!result.ok) {
      return result;
    }

    const user = result.data?.find((candidate) => (
      candidate.username.toLowerCase() === normalizedUsername
    ));

    return {
      ok: true,
      data: user ? { ...user } : null,
    };
  }
}

export const demoUserRepository = new DemoUserRepository();

export default demoUserRepository;