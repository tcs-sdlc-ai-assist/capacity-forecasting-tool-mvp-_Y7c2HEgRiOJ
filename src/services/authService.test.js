import {
  AuthService,
  AUTH_ERROR_CODES,
  SESSION_DURATION_HOURS,
} from './authService.js';

const FIXED_NOW = '2026-08-20T10:30:00.000Z';
const SESSION_ID = 'session-test-001';
const DEMO_USER = Object.freeze({
  username: 'planner',
  password: 'Planner@123',
  displayName: 'Capacity Planner',
});

const createUserRepository = (lookupResult = {
  ok: true,
  data: { ...DEMO_USER },
}) => ({
  findByUsername: vi.fn(() => lookupResult),
});

const createSessionRepository = ({
  readResult = {
    ok: true,
    data: null,
  },
  saveResult = {
    ok: true,
    mode: 'localStorage',
  },
  clearResult = {
    ok: true,
    removed: true,
  },
} = {}) => ({
  getSession: vi.fn(() => readResult),
  saveSession: vi.fn(() => saveResult),
  clearSession: vi.fn(() => clearResult),
});

const createService = ({
  userRepository = createUserRepository(),
  sessionRepository = createSessionRepository(),
  now = FIXED_NOW,
} = {}) => new AuthService(
  userRepository,
  sessionRepository,
  () => new Date(now),
  () => SESSION_ID,
);

const createValidSession = (overrides = {}) => ({
  schemaVersion: '1.0.0',
  sessionId: SESSION_ID,
  username: DEMO_USER.username,
  displayName: DEMO_USER.displayName,
  issuedAt: FIXED_NOW,
  expiresAt: '2026-08-20T18:30:00.000Z',
  authMode: 'demo-local',
  ...overrides,
});

describe('AuthService', () => {
  it('logs in a valid demo user and creates a password-free session', () => {
    const userRepository = createUserRepository();
    const sessionRepository = createSessionRepository();
    const service = createService({
      userRepository,
      sessionRepository,
    });

    const result = service.login({
      username: '  planner  ',
      password: DEMO_USER.password,
    });

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.mode).toBe('localStorage');
    expect(result.data.session).toEqual({
      schemaVersion: '1.0.0',
      sessionId: SESSION_ID,
      username: DEMO_USER.username,
      displayName: DEMO_USER.displayName,
      issuedAt: FIXED_NOW,
      expiresAt: '2026-08-20T18:30:00.000Z',
      authMode: 'demo-local',
    });
    expect(SESSION_DURATION_HOURS).toBe(8);
    expect(userRepository.findByUsername).toHaveBeenCalledWith('planner');
    expect(sessionRepository.saveSession).toHaveBeenCalledTimes(1);

    const persistedSession = sessionRepository.saveSession.mock.calls[0][0];

    expect(
      Object.prototype.hasOwnProperty.call(
        result.data.session,
        'password',
      ),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        persistedSession,
        'password',
      ),
    ).toBe(false);
    expect(JSON.stringify(result.data.session)).not.toContain(
      DEMO_USER.password,
    );
    expect(JSON.stringify(persistedSession)).not.toContain(
      DEMO_USER.password,
    );
  });

  it('reseeds bundled demo users before login when they are missing', () => {
    const userRepository = {
      ensureSeeded: vi.fn(() => ({
        ok: true,
        data: {
          initialized: true,
          users: [{ ...DEMO_USER }],
        },
      })),
      findByUsername: vi.fn(() => ({
        ok: true,
        data: { ...DEMO_USER },
      })),
    };
    const sessionRepository = createSessionRepository();
    const service = createService({
      userRepository,
      sessionRepository,
    });

    const result = service.login({
      username: DEMO_USER.username,
      password: DEMO_USER.password,
    });

    expect(userRepository.ensureSeeded).toHaveBeenCalledTimes(1);
    expect(userRepository.findByUsername).toHaveBeenCalledWith(
      DEMO_USER.username,
    );
    expect(result.ok).toBe(true);
    expect(result.data.session.username).toBe(DEMO_USER.username);
  });

  it('returns the same generic error for unknown users and wrong passwords', () => {
    const unknownUserRepository = createUserRepository({
      ok: true,
      data: null,
    });
    const wrongPasswordRepository = createUserRepository({
      ok: true,
      data: { ...DEMO_USER },
    });
    const unknownSessionRepository = createSessionRepository();
    const wrongPasswordSessionRepository = createSessionRepository();
    const unknownUserService = createService({
      userRepository: unknownUserRepository,
      sessionRepository: unknownSessionRepository,
    });
    const wrongPasswordService = createService({
      userRepository: wrongPasswordRepository,
      sessionRepository: wrongPasswordSessionRepository,
    });

    const unknownUserResult = unknownUserService.login({
      username: 'missing-user',
      password: 'Unknown@123',
    });
    const wrongPasswordResult = wrongPasswordService.login({
      username: DEMO_USER.username,
      password: 'Incorrect@123',
    });

    const expectedError = {
      ok: false,
      error: {
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid username or password.',
      },
    };

    expect(unknownUserResult).toEqual(expectedError);
    expect(wrongPasswordResult).toEqual(expectedError);
    expect(unknownSessionRepository.saveSession).not.toHaveBeenCalled();
    expect(
      wrongPasswordSessionRepository.saveSession,
    ).not.toHaveBeenCalled();
  });

  it('rejects empty credentials without reading users or creating a session', () => {
    const userRepository = createUserRepository();
    const sessionRepository = createSessionRepository();
    const service = createService({
      userRepository,
      sessionRepository,
    });

    const result = service.login({
      username: '   ',
      password: '',
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid username or password.',
      },
    });
    expect(userRepository.findByUsername).not.toHaveBeenCalled();
    expect(sessionRepository.saveSession).not.toHaveBeenCalled();
  });

  it('returns a safe failure when a valid session cannot be persisted', () => {
    const sessionRepository = createSessionRepository({
      saveResult: {
        ok: false,
        error: {
          code: 'SESSION_WRITE_FAILED',
          message: 'The active session could not be saved.',
        },
      },
    });
    const service = createService({ sessionRepository });

    const result = service.login({
      username: DEMO_USER.username,
      password: DEMO_USER.password,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'SESSION_WRITE_FAILED',
        message: 'The active session could not be saved.',
      },
    });
    expect(result.data).toBeUndefined();
  });

  it('restores an active browser-local session without password data', () => {
    const session = createValidSession();
    const sessionRepository = createSessionRepository({
      readResult: {
        ok: true,
        data: session,
      },
    });
    const service = createService({ sessionRepository });

    const result = service.restoreSession();

    expect(result).toEqual({
      ok: true,
      data: {
        session,
        status: 'active',
      },
    });
    expect(sessionRepository.getSession).toHaveBeenCalledTimes(1);
    expect(sessionRepository.clearSession).not.toHaveBeenCalled();
    expect(result.data.session).not.toHaveProperty('password');
    expect(JSON.stringify(result.data.session)).not.toContain(
      DEMO_USER.password,
    );
  });

  it('removes an expired session and restores an anonymous state', () => {
    const expiredSession = createValidSession({
      issuedAt: '2026-08-19T01:00:00.000Z',
      expiresAt: '2026-08-19T09:00:00.000Z',
    });
    const sessionRepository = createSessionRepository({
      readResult: {
        ok: true,
        data: expiredSession,
      },
    });
    const service = createService({ sessionRepository });

    const result = service.restoreSession();

    expect(result).toEqual({
      ok: true,
      data: {
        session: null,
        status: 'missing_or_expired',
      },
    });
    expect(sessionRepository.clearSession).toHaveBeenCalledTimes(1);
  });

  it('returns a safe error when session restoration fails', () => {
    const sessionRepository = createSessionRepository({
      readResult: {
        ok: false,
        error: {
          code: 'SESSION_READ_FAILED',
          message: 'The active session could not be restored.',
        },
      },
    });
    const service = createService({ sessionRepository });

    const result = service.restoreSession();

    expect(result).toEqual({
      ok: false,
      data: null,
      error: {
        code: 'SESSION_READ_FAILED',
        message: 'The active session could not be restored.',
      },
    });
    expect(sessionRepository.clearSession).not.toHaveBeenCalled();
  });

  it('logs out by clearing the persisted session', () => {
    const sessionRepository = createSessionRepository({
      clearResult: {
        ok: true,
        removed: true,
      },
    });
    const service = createService({ sessionRepository });

    const result = service.logout();

    expect(result).toEqual({
      ok: true,
      data: {
        sessionEnded: true,
        removed: true,
      },
    });
    expect(sessionRepository.clearSession).toHaveBeenCalledTimes(1);
  });

  it('returns a safe failure when logout cannot clear the session', () => {
    const sessionRepository = createSessionRepository({
      clearResult: {
        ok: false,
        removed: false,
        error: {
          code: 'SESSION_CLEAR_FAILED',
          message: 'The active session could not be cleared.',
        },
      },
    });
    const service = createService({ sessionRepository });

    const result = service.logout();

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'SESSION_CLEAR_FAILED',
        message: 'The active session could not be cleared.',
      },
    });
  });
});