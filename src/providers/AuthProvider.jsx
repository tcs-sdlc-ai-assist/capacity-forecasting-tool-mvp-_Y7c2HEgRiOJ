import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../hooks/useAuth.js';

export const AuthContext = createContext(null);

const createRestoreError = (error) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'AUTH_SESSION_RESTORE_FAILED',
  message: typeof error?.message === 'string'
    ? error.message
    : 'The active session could not be restored.',
});

/**
 * Restores browser-local authentication state before rendering descendants
 * and exposes the current authentication snapshot through context.
 *
 * @param {{
 *   children: import('react').ReactNode,
 *   fallback?: import('react').ReactNode
 * }} props Provider properties.
 * @returns {import('react').ReactNode} Authentication provider content.
 */
export const AuthProvider = ({
  children,
  fallback = null,
}) => {
  const auth = useAuth();
  const restorePromiseRef = useRef(null);
  const [restorationError, setRestorationError] = useState(null);

  useEffect(() => {
    let active = true;

    if (!restorePromiseRef.current) {
      try {
        restorePromiseRef.current = Promise.resolve(
          auth.restoreSession(),
        );
      } catch (error) {
        restorePromiseRef.current = Promise.reject(error);
      }
    }

    restorePromiseRef.current
      .then((result) => {
        if (!active) {
          return;
        }

        setRestorationError(
          result?.ok === false
            ? createRestoreError(result.error)
            : null,
        );
      })
      .catch((error) => {
        if (active) {
          setRestorationError(createRestoreError(error));
        }
      });

    return () => {
      active = false;
    };
  }, [auth.restoreSession]);

  const value = useMemo(() => ({
    ...auth,
    authReady: !auth.isRestoring,
    restorationError,
  }), [auth, restorationError]);

  if (auth.isRestoring) {
    return fallback;
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node,
};

/**
 * Returns authentication state and actions from the nearest AuthProvider.
 *
 * @returns {object} Authentication context value.
 * @throws {Error} When used outside AuthProvider.
 */
export const useAuthContext = () => {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error(
      'useAuthContext must be used within an AuthProvider.',
    );
  }

  return context;
};

export default AuthProvider;