import { AUTH_MODE } from '../config/appConfig.js';
import {
  createSession,
  isSession,
} from '../domain/schemas.js';
import demoUserRepository from '../repositories/demoUserRepository.js';
import sessionRepository from '../repositories/sessionRepository.js';

export const SESSION_DURATION_HOURS = 8;

export const AUTH_ERROR_CODES = Object.freeze({
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  SESSION_CREATE_FAILED: 'AUTH_SESSION_CREATE_FAILED',
  SESSION_READ_FAILED: 'AUTH_SESSION_READ_FAILED',
  SESSION_WRITE_FAILED: 'AUTH_SESSION_WRITE_FAILED',
  SESSION_CLEAR_FAILED: 'AUTH_SESSION_CLEAR_FAILED',
});

const RESTORE_STATUSES = Object.freeze({
  ACTIVE: 'active',
  MISSING_OR_EXPIRED: 'missing_or_expired',
});

const createError = (code, message) => ({
  code,
  message,
});

const invalidCredentialsResult = () => ({
  ok: false,
  error: createError(
    AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    'Invalid username or password.',
  ),
});

const resolveDate = (clock) => {
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

  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const createFallbackSessionId = (date) => {
  const timestamp = date.getTime().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 14);

  return `session-${timestamp}-${randomPart}`;
};

const resolveSessionId = (idGenerator, date) => {
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

  const normalizedId = typeof generatedId === 'string'
    ? generatedId.trim()
    : '';

  if (normalizedId.length >= 8 && normalizedId.length <= 128) {
    return normalizedId;
  }

  return createFallbackSessionId(date);
};

const readUser = (repository, username) => {
  try {
    if (typeof repository?.findByUsername === 'function') {
      return repository.findByUsername(username);
    }

    const result = typeof repository?.getUsers === 'function'
      ? repository.getUsers()
      : repository?.getAll?.();

    if (!result?.ok) {
      return result;
    }

    const normalizedUsername = username.toLowerCase();
    const user = result.data?.find((candidate) => (
      typeof candidate?.username === 'string'
      && candidate.username.toLowerCase() === normalizedUsername
    ));

    return {
      ok: true,
      data: user ? { ...user } : null,
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        AUTH_ERROR_CODES.SESSION_READ_FAILED,
        'Demo credentials could not be read from browser storage.',
      ),
    };
  }
};

const readSession = (repository) => {
  try {
    const result = typeof repository?.getSession === 'function'
      ? repository.getSession()
      : repository?.get?.();

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          AUTH_ERROR_CODES.SESSION_READ_FAILED,
          'The active session could not be restored.',
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
        AUTH_ERROR_CODES.SESSION_READ_FAILED,
        'The active session could not be restored.',
      ),
    };
  }
};

const saveSession = (repository, session) => {
  try {
    const result = typeof repository?.saveSession === 'function'
      ? repository.saveSession(session)
      : typeof repository?.save === 'function'
        ? repository.save(session)
        : repository?.set?.(session);

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        mode: result?.mode,
        error: result?.error ?? createError(
          AUTH_ERROR_CODES.SESSION_WRITE_FAILED,
          'The active session could not be saved.',
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        AUTH_ERROR_CODES.SESSION_WRITE_FAILED,
        'The active session could not be saved.',
      ),
    };
  }
};

const clearSession = (repository) => {
  try {
    const result = typeof repository?.clearSession === 'function'
      ? repository.clearSession()
      : typeof repository?.clear === 'function'
        ? repository.clear()
        : repository?.remove?.();

    if (!result?.ok) {
      return {
        ok: false,
        removed: Boolean(result?.removed),
        error: result?.error ?? createError(
          AUTH_ERROR_CODES.SESSION_CLEAR_FAILED,
          'The active session could not be cleared.',
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      removed: false,
      error: createError(
        AUTH_ERROR_CODES.SESSION_CLEAR_FAILED,
        'The active session could not be cleared.',
      ),
    };
  }
};

/**
 * Implements browser-local demo authentication and session lifecycle behavior.
 */
export class AuthService {
  constructor(
    userRepository = demoUserRepository,
    activeSessionRepository = sessionRepository,
    clock = () => new Date(),
    idGenerator = null,
    _logger = null,
  ) {
    this.demoUserRepository = userRepository;
    this.sessionRepository = activeSessionRepository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  /**
   * Validates demo credentials and creates a browser-local session.
   *
   * @param {{username?: string, password?: string}} request Credentials.
   * @returns {{
   *   ok: boolean,
   *   data?: {session: object},
   *   warnings?: object[],
   *   mode?: string,
   *   error?: object
   * }} Login result.
   */
  login(request = {}) {
    const username = typeof request?.username === 'string'
      ? request.username.trim()
      : '';
    const password = typeof request?.password === 'string'
      ? request.password
      : '';

    if (!username || !password) {
      return invalidCredentialsResult();
    }

    const userResult = readUser(this.demoUserRepository, username);

    if (!userResult?.ok) {
      return {
        ok: false,
        error: userResult?.error ?? createError(
          AUTH_ERROR_CODES.SESSION_READ_FAILED,
          'Demo credentials could not be read from browser storage.',
        ),
      };
    }

    const user = userResult.data;

    if (
      !user
      || typeof user.password !== 'string'
      || user.password !== password
    ) {
      return invalidCredentialsResult();
    }

    const issuedDate = resolveDate(this.clock);
    const expiresDate = new Date(
      issuedDate.getTime() + (SESSION_DURATION_HOURS * 60 * 60 * 1000),
    );

    let session;

    try {
      session = createSession({
        sessionId: resolveSessionId(this.idGenerator, issuedDate),
        username: user.username,
        displayName: user.displayName,
        issuedAt: issuedDate.toISOString(),
        expiresAt: expiresDate.toISOString(),
        authMode: AUTH_MODE,
      });
    } catch {
      return {
        ok: false,
        error: createError(
          AUTH_ERROR_CODES.SESSION_CREATE_FAILED,
          'The active session could not be created.',
        ),
      };
    }

    const persisted = saveSession(this.sessionRepository, session);

    if (!persisted.ok) {
      return {
        ok: false,
        error: persisted.error,
      };
    }

    const response = {
      ok: true,
      data: {
        session: createSession(persisted.data ?? session),
      },
      warnings: [],
    };

    if (persisted.mode) {
      response.mode = persisted.mode;
    }

    if (persisted.error) {
      response.warnings.push({ ...persisted.error });
    }

    return response;
  }

  /**
   * Restores the active session or removes it when it has expired.
   *
   * @returns {{
   *   ok: boolean,
   *   data: {session: object|null, status: string}|null,
   *   error?: object
   * }} Restore result.
   */
  restoreSession() {
    const result = readSession(this.sessionRepository);

    if (!result.ok) {
      return result;
    }

    if (!this.isSessionActive(result.data)) {
      if (result.data !== null) {
        clearSession(this.sessionRepository);
      }

      return {
        ok: true,
        data: {
          session: null,
          status: RESTORE_STATUSES.MISSING_OR_EXPIRED,
        },
      };
    }

    return {
      ok: true,
      data: {
        session: createSession(result.data),
        status: RESTORE_STATUSES.ACTIVE,
      },
    };
  }

  /**
   * Ends the active browser-local session.
   *
   * @returns {{
   *   ok: boolean,
   *   data?: {sessionEnded: boolean, removed: boolean},
   *   error?: object
   * }} Logout result.
   */
  logout() {
    const result = clearSession(this.sessionRepository);

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
      };
    }

    const response = {
      ok: true,
      data: {
        sessionEnded: true,
        removed: Boolean(result.removed),
      },
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Determines whether a session is valid and has not expired.
   *
   * @param {object|null} session Session to evaluate.
   * @returns {boolean} Whether the session is currently active.
   */
  isSessionActive(session) {
    if (!isSession(session)) {
      return false;
    }

    const now = resolveDate(this.clock).getTime();
    const expiresAt = Date.parse(session.expiresAt);

    return Number.isFinite(expiresAt) && expiresAt > now;
  }
}

export const authService = new AuthService();

export default authService;