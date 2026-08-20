import { useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';
import { useAuthContext } from '../../providers/AuthProvider.jsx';
import routeAccessGuard from '../../services/routeAccessGuard.js';

/**
 * Protects routed content using the browser-local route access policy.
 *
 * Unauthenticated users are redirected to the login route with their intended
 * location preserved in navigation state.
 *
 * @param {{
 *   children?: import('react').ReactNode,
 *   fallback?: import('react').ReactNode,
 *   requiresAuth?: boolean,
 *   route?: {path?: string, requiresAuth?: boolean}
 * }} props Route guard properties.
 * @returns {import('react').ReactNode} Protected content or redirect.
 */
export const RouteAccessGuard = ({
  children = null,
  fallback = null,
  requiresAuth = true,
  route = null,
}) => {
  const auth = useAuthContext();
  const location = useLocation();
  const routePath = typeof route?.path === 'string' && route.path.trim()
    ? route.path.trim()
    : location.pathname || '/';
  const routeRequiresAuth = typeof route?.requiresAuth === 'boolean'
    ? route.requiresAuth
    : requiresAuth;
  const decision = useMemo(
    () => routeAccessGuard.evaluate(
      {
        path: routePath,
        requiresAuth: routeRequiresAuth,
      },
      auth.session,
    ),
    [auth.session, routePath, routeRequiresAuth],
  );
  const isRestoring = (
    auth.isRestoring === true
    || auth.authReady === false
    || auth.status === 'unknown'
  );

  if (isRestoring) {
    return fallback;
  }

  if (!decision.ok || !decision.data?.allowed) {
    return (
      <Navigate
        replace
        to={decision.data?.redirectTo ?? '/login'}
        state={{ from: location }}
      />
    );
  }

  return children ?? <Outlet />;
};

RouteAccessGuard.propTypes = {
  children: PropTypes.node,
  fallback: PropTypes.node,
  requiresAuth: PropTypes.bool,
  route: PropTypes.shape({
    path: PropTypes.string,
    requiresAuth: PropTypes.bool,
  }),
};

export default RouteAccessGuard;