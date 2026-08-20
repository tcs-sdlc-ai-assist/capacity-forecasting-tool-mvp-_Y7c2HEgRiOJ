import authService from './authService.js';

export const ROUTE_ACCESS_REASONS = Object.freeze({
  PUBLIC_ROUTE: 'PUBLIC_ROUTE',
  AUTHENTICATED: 'AUTHENTICATED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
});

export const ROUTE_ACCESS_ERROR_CODES = Object.freeze({
  INVALID_ROUTE: 'ROUTE_ACCESS_INVALID_ROUTE',
});

const LOGIN_ROUTE = '/login';

const createError = (code, message) => ({
  code,
  message,
});

const isRouteDefinition = (route) => (
  route !== null
  && typeof route === 'object'
  && !Array.isArray(route)
  && typeof route.path === 'string'
  && route.path.trim().length > 0
  && typeof route.requiresAuth === 'boolean'
);

const resolveSession = (sessionState) => {
  if (
    sessionState !== null
    && typeof sessionState === 'object'
    && !Array.isArray(sessionState)
    && Object.prototype.hasOwnProperty.call(sessionState, 'session')
  ) {
    return sessionState.session;
  }

  return sessionState;
};

/**
 * Applies framework-independent access policy to public and protected routes.
 */
export class RouteAccessGuard {
  constructor(sessionService = authService, loginRoute = LOGIN_ROUTE) {
    this.sessionService = sessionService;
    this.loginRoute = typeof loginRoute === 'string' && loginRoute.trim()
      ? loginRoute.trim()
      : LOGIN_ROUTE;
  }

  /**
   * Evaluates whether restored session state permits access to a route.
   *
   * @param {{path: string, requiresAuth: boolean}} route Route definition.
   * @param {object|null} sessionState Session or restored session state.
   * @returns {{
   *   ok: boolean,
   *   data: {
   *     allowed: boolean,
   *     redirectTo: string|null,
   *     reason: string
   *   }|null,
   *   error?: {code: string, message: string}
   * }} Route access decision.
   */
  evaluate(route, sessionState = null) {
    if (!isRouteDefinition(route)) {
      return {
        ok: false,
        data: null,
        error: createError(
          ROUTE_ACCESS_ERROR_CODES.INVALID_ROUTE,
          'A valid route access policy is required.',
        ),
      };
    }

    if (!route.requiresAuth) {
      return {
        ok: true,
        data: {
          allowed: true,
          redirectTo: null,
          reason: ROUTE_ACCESS_REASONS.PUBLIC_ROUTE,
        },
      };
    }

    const session = resolveSession(sessionState);
    let sessionIsActive = false;

    try {
      sessionIsActive = Boolean(
        this.sessionService?.isSessionActive?.(session),
      );
    } catch {
      sessionIsActive = false;
    }

    if (sessionIsActive) {
      return {
        ok: true,
        data: {
          allowed: true,
          redirectTo: null,
          reason: ROUTE_ACCESS_REASONS.AUTHENTICATED,
        },
      };
    }

    return {
      ok: true,
      data: {
        allowed: false,
        redirectTo: this.loginRoute,
        reason: ROUTE_ACCESS_REASONS.AUTH_REQUIRED,
      },
    };
  }
}

export const routeAccessGuard = new RouteAccessGuard();

export default routeAccessGuard;