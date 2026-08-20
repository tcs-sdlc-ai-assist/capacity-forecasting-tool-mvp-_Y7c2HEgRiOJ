import { STORAGE_KEYS } from '../constants/storageKeys.js';
import {
  createSession,
  isSession,
} from '../domain/schemas.js';
import persistentStore from '../platform/storage/persistentStore.js';

const INVALID_SESSION = 'INVALID_SESSION';
const SESSION_READ_FAILED = 'SESSION_READ_FAILED';
const SESSION_WRITE_FAILED = 'SESSION_WRITE_FAILED';
const SESSION_CLEAR_FAILED = 'SESSION_CLEAR_FAILED';

const createError = (code, message) => ({
  code,
  message,
});

const cloneSession = (session) => ({
  schemaVersion: session.schemaVersion,
  sessionId: session.sessionId,
  username: session.username,
  displayName: session.displayName,
  issuedAt: session.issuedAt,
  expiresAt: session.expiresAt,
  authMode: session.authMode,
});

/**
 * Provides schema-aware access to the browser-local session.
 */
export class SessionRepository {
  constructor(storage = persistentStore) {
    this.storage = storage;
  }

  /**
   * Reads and validates the persisted session.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getSession() {
    let result;

    try {
      result = this.storage.get(STORAGE_KEYS.SESSION);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          SESSION_READ_FAILED,
          'The active session could not be read from browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          SESSION_READ_FAILED,
          'The active session could not be read from browser storage.',
        ),
      };
    }

    if (result.data === null || result.data === undefined) {
      return {
        ok: true,
        data: null,
      };
    }

    if (!isSession(result.data)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_SESSION,
          'The stored session is invalid or incompatible.',
        ),
      };
    }

    return {
      ok: true,
      data: cloneSession(result.data),
    };
  }

  /**
   * Alias for reading the persisted session.
   *
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  get() {
    return this.getSession();
  }

  /**
   * Stores a canonical, validated session.
   *
   * @param {object} session Session fields to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  saveSession(session) {
    let canonicalSession;

    try {
      canonicalSession = createSession(session);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_SESSION,
          'The session could not be saved because its data is invalid.',
        ),
      };
    }

    let result;

    try {
      result = this.storage.set(
        STORAGE_KEYS.SESSION,
        canonicalSession,
      );
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          SESSION_WRITE_FAILED,
          'The active session could not be saved to browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        mode: result?.mode,
        error: result?.error ?? createError(
          SESSION_WRITE_FAILED,
          'The active session could not be saved to browser storage.',
        ),
      };
    }

    const response = {
      ok: true,
      data: cloneSession(canonicalSession),
      mode: result.mode,
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Alias for storing a session.
   *
   * @param {object} session Session fields to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  save(session) {
    return this.saveSession(session);
  }

  /**
   * Alias for storing a session.
   *
   * @param {object} session Session fields to persist.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Write result.
   */
  set(session) {
    return this.saveSession(session);
  }

  /**
   * Removes the persisted session.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  clearSession() {
    let result;

    try {
      result = this.storage.remove(STORAGE_KEYS.SESSION);
    } catch {
      return {
        ok: false,
        removed: false,
        error: createError(
          SESSION_CLEAR_FAILED,
          'The active session could not be cleared from browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        removed: Boolean(result?.removed),
        error: result?.error ?? createError(
          SESSION_CLEAR_FAILED,
          'The active session could not be cleared from browser storage.',
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
   * Alias for removing the persisted session.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  clear() {
    return this.clearSession();
  }

  /**
   * Alias for removing the persisted session.
   *
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  remove() {
    return this.clearSession();
  }
}

export const sessionRepository = new SessionRepository();

export default sessionRepository;