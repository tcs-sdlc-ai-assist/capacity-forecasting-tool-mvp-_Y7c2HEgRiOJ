import {
  useCallback,
  useSyncExternalStore,
} from 'react';
import authFacade, {
  AUTH_STATUSES,
} from '../facades/authFacade.js';

const subscribeToAuth = (listener) => authFacade.subscribe(listener);

const getAuthSnapshot = () => authFacade.getSessionSnapshot();

/**
 * Subscribes a React component to authentication state and exposes stable
 * authentication actions.
 *
 * @returns {{
 *   session: object|null,
 *   status: string,
 *   isAuthenticated: boolean,
 *   isAnonymous: boolean,
 *   isRestoring: boolean,
 *   login: Function,
 *   logout: Function,
 *   restoreSession: Function
 * }} Current authentication state and actions.
 */
export const useAuth = () => {
  const snapshot = useSyncExternalStore(
    subscribeToAuth,
    getAuthSnapshot,
    getAuthSnapshot,
  );

  const login = useCallback(
    (request = {}) => authFacade.login(request),
    [],
  );

  const logout = useCallback(
    () => authFacade.logout(),
    [],
  );

  const restoreSession = useCallback(
    () => authFacade.restoreSession(),
    [],
  );

  return {
    ...snapshot,
    isAuthenticated: snapshot.status
      === AUTH_STATUSES.AUTHENTICATED,
    isAnonymous: snapshot.status === AUTH_STATUSES.ANONYMOUS,
    isRestoring: snapshot.status === AUTH_STATUSES.UNKNOWN,
    login,
    logout,
    restoreSession,
  };
};

export default useAuth;