import authService from '../services/authService.js';

export const AUTH_STATUSES = Object.freeze({
  UNKNOWN: 'unknown',
  AUTHENTICATED: 'authenticated',
  ANONYMOUS: 'anonymous',
});

export const AUTH_FACADE_ERROR_CODES = Object.freeze({
  LOGIN_UNAVAILABLE: 'AUTH_LOGIN_UNAVAILABLE',
  LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  SESSION_RESTORE_UNAVAILABLE: 'AUTH_SESSION_RESTORE_UNAVAILABLE',
  SESSION_RESTORE_FAILED: 'AUTH_SESSION_RESTORE_FAILED',
  LOGOUT_UNAVAILABLE: 'AUTH_LOGOUT_UNAVAILABLE',
  LOGOUT_FAILED: 'AUTH_LOGOUT_FAILED',
  INVALID_RESULT: 'AUTH_INVALID_RESULT',
});

const createError = (code, message) => ({
  code,
  message,
});

const createFailureResult = (code, message) => ({
  ok: false,
  error: createError(code, message),
});

const isResult = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && typeof value.ok === 'boolean'
);

const isSession = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const cloneSession = (session) => (
  isSession(session) ? { ...session } : null
);

const createSnapshot = (session, status) => Object.freeze({
  session: session ? Object.freeze(cloneSession(session)) : null,
  status,
});

const isPromiseLike = (value) => (
  value !== null
  && (
    typeof value === 'object'
    || typeof value === 'function'
  )
  && typeof value.then === 'function'
);

/**
 * Exposes the stable public authentication interface used by the application.
 */
export class AuthFacade {
  constructor(sessionService = authService) {
    this.authService = sessionService;
    this.listeners = new Set();
    this.snapshot = createSnapshot(null, AUTH_STATUSES.UNKNOWN);
  }

  /**
   * Validates credentials and updates the current session snapshot.
   *
   * @param {{username?: string, password?: string}} request Credentials.
   * @returns {object|Promise<object>} Authentication result.
   */
  login(request = {}) {
    const unavailableResult = createFailureResult(
      AUTH_FACADE_ERROR_CODES.LOGIN_UNAVAILABLE,
      'The authentication service is unavailable.',
    );

    if (typeof this.authService?.login !== 'function') {
      this.setSession(null, AUTH_STATUSES.ANONYMOUS);
      return unavailableResult;
    }

    let result;

    try {
      result = this.authService.login(request);
    } catch {
      this.setSession(null, AUTH_STATUSES.ANONYMOUS);

      return createFailureResult(
        AUTH_FACADE_ERROR_CODES.LOGIN_FAILED,
        'The login request could not be completed.',
      );
    }

    if (isPromiseLike(result)) {
      return Promise.resolve(result)
        .then((resolvedResult) => this.handleLoginResult(resolvedResult))
        .catch(() => {
          this.setSession(null, AUTH_STATUSES.ANONYMOUS);

          return createFailureResult(
            AUTH_FACADE_ERROR_CODES.LOGIN_FAILED,
            'The login request could not be completed.',
          );
        });
    }

    return this.handleLoginResult(result);
  }

  /**
   * Restores browser-local session state and updates the current snapshot.
   *
   * @returns {object|Promise<object>} Session restoration result.
   */
  restoreSession() {
    if (typeof this.authService?.restoreSession !== 'function') {
      this.setSession(null, AUTH_STATUSES.ANONYMOUS);

      return createFailureResult(
        AUTH_FACADE_ERROR_CODES.SESSION_RESTORE_UNAVAILABLE,
        'The session restoration service is unavailable.',
      );
    }

    let result;

    try {
      result = this.authService.restoreSession();
    } catch {
      this.setSession(null, AUTH_STATUSES.ANONYMOUS);

      return createFailureResult(
        AUTH_FACADE_ERROR_CODES.SESSION_RESTORE_FAILED,
        'The active session could not be restored.',
      );
    }

    if (isPromiseLike(result)) {
      return Promise.resolve(result)
        .then((resolvedResult) => this.handleRestoreResult(resolvedResult))
        .catch(() => {
          this.setSession(null, AUTH_STATUSES.ANONYMOUS);

          return createFailureResult(
            AUTH_FACADE_ERROR_CODES.SESSION_RESTORE_FAILED,
            'The active session could not be restored.',
          );
        });
    }

    return this.handleRestoreResult(result);
  }

  /**
   * Ends the browser-local session and updates the current snapshot.
   *
   * @returns {object|Promise<object>} Logout result.
   */
  logout() {
    if (typeof this.authService?.logout !== 'function') {
      return createFailureResult(
        AUTH_FACADE_ERROR_CODES.LOGOUT_UNAVAILABLE,
        'The logout service is unavailable.',
      );
    }

    let result;

    try {
      result = this.authService.logout();
    } catch {
      return createFailureResult(
        AUTH_FACADE_ERROR_CODES.LOGOUT_FAILED,
        'The active session could not be ended.',
      );
    }

    if (isPromiseLike(result)) {
      return Promise.resolve(result)
        .then((resolvedResult) => this.handleLogoutResult(resolvedResult))
        .catch(() => createFailureResult(
          AUTH_FACADE_ERROR_CODES.LOGOUT_FAILED,
          'The active session could not be ended.',
        ));
    }

    return this.handleLogoutResult(result);
  }

  /**
   * Returns the stable current authentication snapshot.
   *
   * @returns {{session: object|null, status: string}} Session snapshot.
   */
  getSessionSnapshot() {
    return this.snapshot;
  }

  /**
   * Subscribes to authentication snapshot changes.
   *
   * @param {Function} listener Snapshot listener.
   * @param {{fireImmediately?: boolean}} options Subscription options.
   * @returns {Function} Unsubscribe callback.
   */
  subscribe(listener, options = {}) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    this.listeners.add(listener);

    if (options?.fireImmediately === true) {
      try {
        listener(this.snapshot);
      } catch {
        // A failing consumer must not interrupt authentication operations.
      }
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  handleLoginResult(result) {
    if (!isResult(result)) {
      this.setSession(null, AUTH_STATUSES.ANONYMOUS);

      return createFailureResult(
        AUTH_FACADE_ERROR_CODES.INVALID_RESULT,
        'The authentication service returned an invalid result.',
      );
    }

    if (result.ok && isSession(result.data?.session)) {
      this.setSession(
        result.data.session,
        AUTH_STATUSES.AUTHENTICATED,
      );
    } else if (!result.ok) {
      this.setSession(null, AUTH_STATUSES.ANONYMOUS);
    }

    return result;
  }

  handleRestoreResult(result) {
    if (!isResult(result)) {
      this.setSession(null, AUTH_STATUSES.ANONYMOUS);

      return createFailureResult(
        AUTH_FACADE_ERROR_CODES.INVALID_RESULT,
        'The session restoration service returned an invalid result.',
      );
    }

    if (!result.ok) {
      this.setSession(null, AUTH_STATUSES.ANONYMOUS);
      return result;
    }

    const session = result.data?.session;

    this.setSession(
      isSession(session) ? session : null,
      isSession(session)
        ? AUTH_STATUSES.AUTHENTICATED
        : AUTH_STATUSES.ANONYMOUS,
    );

    return result;
  }

  handleLogoutResult(result) {
    if (!isResult(result)) {
      return createFailureResult(
        AUTH_FACADE_ERROR_CODES.INVALID_RESULT,
        'The logout service returned an invalid result.',
      );
    }

    if (result.ok) {
      this.setSession(null, AUTH_STATUSES.ANONYMOUS);
    }

    return result;
  }

  setSession(session, status) {
    this.snapshot = createSnapshot(session, status);
    this.publish();
  }

  publish() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.snapshot);
      } catch {
        // A failing consumer must not interrupt authentication operations.
      }
    });
  }
}

export const authFacade = new AuthFacade();

export default authFacade;