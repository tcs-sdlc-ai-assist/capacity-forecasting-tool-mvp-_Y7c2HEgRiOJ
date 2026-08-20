import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import {
  NavLink,
  useNavigate,
} from 'react-router-dom';
import { APP_NAME } from '../../config/appConfig.js';
import {
  forecastViewStore,
} from '../../features/forecast/store/forecastViewStore.js';
import { useDataset } from '../../hooks/useDataset.js';
import { useAuthContext } from '../../providers/AuthProvider.jsx';

const ACTIONS = Object.freeze({
  IMPORT: 'import',
  THRESHOLDS: 'thresholds',
  SCENARIOS: 'scenarios',
  REMOVE_DATA: 'remove-data',
  LOGOUT: 'logout',
});

const createActionError = (error, fallbackMessage) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'APP_HEADER_ACTION_FAILED',
  message: typeof error?.message === 'string'
    ? error.message
    : fallbackMessage,
});

const resolveDataLabel = (metadata, suppliedLabel) => {
  if (typeof suppliedLabel === 'string' && suppliedLabel.trim()) {
    return suppliedLabel.trim();
  }

  if (
    metadata?.sourceType === 'mock'
    || metadata?.sourceType === 'recovered-mock'
  ) {
    return 'Demo data';
  }

  return metadata ? 'Imported data' : 'Browser-local data';
};

const ActionIcon = ({ action }) => {
  if (action === ACTIONS.IMPORT) {
    return (
      <svg
        className="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v7.69L6.53 7.72a.75.75 0 0 0-1.06 1.06l4 4a.75.75 0 0 0 1.06 0l4-4a.75.75 0 1 0-1.06-1.06l-2.72 2.72V2.75Z" />
        <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
      </svg>
    );
  }

  if (action === ACTIONS.THRESHOLDS) {
    return (
      <svg
        className="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M3.25 4.5a.75.75 0 0 1 .75-.75h7.1a2.75 2.75 0 0 1 5.3 0H17a.75.75 0 0 1 0 1.5h-.6a2.75 2.75 0 0 1-5.3 0H4a.75.75 0 0 1-.75-.75Zm9.25 0a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 0 0-2.5 0ZM3 10a.75.75 0 0 1 .75-.75h.85a2.75 2.75 0 0 1 5.3 0H17a.75.75 0 0 1 0 1.5H9.9a2.75 2.75 0 0 1-5.3 0h-.85A.75.75 0 0 1 3 10Zm3.25-1.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM3 15.5a.75.75 0 0 1 .75-.75h7.35a2.75 2.75 0 0 1 5.3 0H17a.75.75 0 0 1 0 1.5h-.6a2.75 2.75 0 0 1-5.3 0H3.75A.75.75 0 0 1 3 15.5Zm9.5 0a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 0 0-2.5 0Z" />
      </svg>
    );
  }

  if (action === ACTIONS.SCENARIOS) {
    return (
      <svg
        className="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10.79 2.21a1.12 1.12 0 0 0-1.58 0l-7 7a1.12 1.12 0 0 0 0 1.58l7 7a1.12 1.12 0 0 0 1.58 0l7-7a1.12 1.12 0 0 0 0-1.58l-7-7ZM6.75 9.25a.75.75 0 0 0 0 1.5h4.69l-1.72 1.72a.75.75 0 1 0 1.06 1.06l3-3a.75.75 0 0 0 0-1.06l-3-3a.75.75 0 0 0-1.06 1.06l1.72 1.72H6.75Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (action === ACTIONS.REMOVE_DATA) {
    return (
      <svg
        className="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.5 2.5A1.5 1.5 0 0 0 7 4H4.75a.75.75 0 0 0 0 1.5h.44l.7 10.13A2.5 2.5 0 0 0 8.38 18h3.24a2.5 2.5 0 0 0 2.49-2.37l.7-10.13h.44a.75.75 0 0 0 0-1.5H13a1.5 1.5 0 0 0-1.5-1.5h-3Zm.38 4.75a.75.75 0 0 0-1.5.1l.5 7.5a.75.75 0 0 0 1.5-.1l-.5-7.5Zm3.74.1a.75.75 0 0 0-1.5-.1l-.5 7.5a.75.75 0 0 0 1.5.1l.5-7.5Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M3 4.75A2.75 2.75 0 0 1 5.75 2h5.5A2.75 2.75 0 0 1 14 4.75V6a.75.75 0 0 1-1.5 0V4.75c0-.69-.56-1.25-1.25-1.25h-5.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h5.5c.69 0 1.25-.56 1.25-1.25V14a.75.75 0 0 1 1.5 0v1.25A2.75 2.75 0 0 1 11.25 18h-5.5A2.75 2.75 0 0 1 3 15.25V4.75Zm10.47 3.22a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 0 1 0 1.06l-1.5 1.5a.75.75 0 1 1-1.06-1.06l.22-.22H8.75a.75.75 0 0 1 0-1.5h4.94l-.22-.22a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
};

ActionIcon.propTypes = {
  action: PropTypes.oneOf(Object.values(ACTIONS)).isRequired,
};

const HeaderAction = ({
  action,
  children,
  disabled,
  onClick,
  variant = 'secondary',
}) => {
  const className = variant === 'danger'
    ? 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-red-300/60 px-3 py-2 text-sm font-semibold text-red-50 transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-teal-600 px-3 py-2 text-sm font-semibold text-teal-50 transition-colors hover:border-teal-400 hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      <ActionIcon action={action} />
      <span>{children}</span>
    </button>
  );
};

HeaderAction.propTypes = {
  action: PropTypes.oneOf(Object.values(ACTIONS)).isRequired,
  children: PropTypes.node.isRequired,
  disabled: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['secondary', 'danger']),
};

/**
 * Renders protected application navigation, identity, and workspace actions.
 *
 * @param {{
 *   dataLabel?: string,
 *   forecastPath?: string,
 *   importPath?: string,
 *   scenariosPath?: string,
 *   removeDataPath?: string,
 *   onImport?: Function,
 *   onManageThresholds?: Function,
 *   onManageScenarios?: Function,
 *   onRemoveData?: Function,
 *   onLogout?: Function
 * }} props Header properties.
 * @returns {import('react').ReactNode} Protected application header.
 */
export const AppHeader = ({
  dataLabel = '',
  forecastPath = '/forecast',
  importPath = '/import',
  scenariosPath = '/scenarios',
  removeDataPath = '/settings#remove-local-data',
  onImport = null,
  onManageThresholds = null,
  onManageScenarios = null,
  onRemoveData = null,
  onLogout = null,
}) => {
  const auth = useAuthContext();
  const { metadata } = useDataset();
  const navigate = useNavigate();
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const resolvedDataLabel = resolveDataLabel(metadata, dataLabel);
  const displayName = auth.session?.displayName
    ?? auth.session?.username
    ?? 'Signed-in user';
  const username = auth.session?.username ?? '';

  const runAction = useCallback(async (
    action,
    callback,
    fallback,
    failureMessage,
  ) => {
    if (busyAction !== null) {
      return;
    }

    setBusyAction(action);
    setActionError(null);

    try {
      const result = callback
        ? await callback()
        : await fallback();

      if (result?.ok === false) {
        setActionError(createActionError(
          result.error,
          failureMessage,
        ));
      }
    } catch (error) {
      setActionError(createActionError(error, failureMessage));
    } finally {
      setBusyAction(null);
    }
  }, [busyAction]);

  const handleImport = () => runAction(
    ACTIONS.IMPORT,
    onImport,
    () => navigate(importPath),
    'The dataset import workspace could not be opened.',
  );

  const handleThresholds = () => runAction(
    ACTIONS.THRESHOLDS,
    onManageThresholds,
    () => {
      navigate(forecastPath);
      forecastViewStore.getState().openThresholdDialog();

      return { ok: true };
    },
    'Capacity threshold settings could not be opened.',
  );

  const handleScenarios = () => runAction(
    ACTIONS.SCENARIOS,
    onManageScenarios,
    () => navigate(scenariosPath),
    'Scenario management could not be opened.',
  );

  const handleRemoveData = () => runAction(
    ACTIONS.REMOVE_DATA,
    onRemoveData,
    () => navigate(removeDataPath),
    'The local-data removal settings could not be opened.',
  );

  const handleLogout = () => runAction(
    ACTIONS.LOGOUT,
    onLogout ?? auth.logout,
    async () => ({ ok: true }),
    'The active session could not be ended.',
  ).then(() => {
    if (auth.status !== 'authenticated' || onLogout !== null) {
      navigate('/login', { replace: true });
    }
  });

  const actionsDisabled = busyAction !== null;

  return (
    <header className="bg-teal-950 text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <NavLink
              to={forecastPath}
              className="inline-flex min-w-0 items-center gap-3 rounded-md text-white transition-opacity hover:opacity-90"
              aria-label={`${APP_NAME} forecast workspace`}
            >
              <span
                className="grid h-10 w-10 shrink-0 grid-cols-3 items-end gap-1 rounded-lg bg-teal-700 p-2"
                aria-hidden="true"
              >
                <span className="h-2 rounded-sm bg-white" />
                <span className="h-4 rounded-sm bg-white" />
                <span className="h-6 rounded-sm bg-white" />
              </span>
              <span className="truncate text-lg font-semibold sm:text-xl">
                {APP_NAME}
              </span>
            </NavLink>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-700 bg-teal-900 px-2.5 py-1 text-xs font-semibold text-teal-100">
              <span
                className="h-2 w-2 rounded-full bg-teal-300"
                aria-hidden="true"
              />
              {resolvedDataLabel}
            </span>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <nav
              className="flex flex-wrap items-center gap-1"
              aria-label="Primary navigation"
            >
              <NavLink
                to={forecastPath}
                className={({ isActive }) => (
                  `rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-teal-700 text-white'
                      : 'text-teal-100 hover:bg-teal-900 hover:text-white'
                  }`
                )}
              >
                Forecast
              </NavLink>
            </nav>

            <div
              className="flex flex-wrap items-center gap-2"
              aria-label="Workspace actions"
            >
              <HeaderAction
                action={ACTIONS.IMPORT}
                disabled={actionsDisabled}
                onClick={handleImport}
              >
                Import
              </HeaderAction>
              <HeaderAction
                action={ACTIONS.THRESHOLDS}
                disabled={actionsDisabled}
                onClick={handleThresholds}
              >
                Thresholds
              </HeaderAction>
              <HeaderAction
                action={ACTIONS.SCENARIOS}
                disabled={actionsDisabled}
                onClick={handleScenarios}
              >
                Scenarios
              </HeaderAction>
              <HeaderAction
                action={ACTIONS.REMOVE_DATA}
                disabled={actionsDisabled}
                onClick={handleRemoveData}
                variant="danger"
              >
                Remove data
              </HeaderAction>
            </div>

            <div className="flex items-center gap-3 border-t border-teal-800 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-semibold text-white">
                  {displayName}
                </p>
                {username ? (
                  <p className="truncate text-xs text-teal-200">
                    {username}
                  </p>
                ) : null}
              </div>

              <HeaderAction
                action={ACTIONS.LOGOUT}
                disabled={actionsDisabled}
                onClick={handleLogout}
              >
                {busyAction === ACTIONS.LOGOUT
                  ? 'Signing out…'
                  : 'Sign out'}
              </HeaderAction>
            </div>
          </div>
        </div>

        {actionError ? (
          <div
            className="rounded-md border border-red-300/60 bg-red-950/40 px-4 py-3 text-sm font-medium text-red-50"
            role="alert"
          >
            {actionError.message}
          </div>
        ) : null}
      </div>
    </header>
  );
};

AppHeader.propTypes = {
  dataLabel: PropTypes.string,
  forecastPath: PropTypes.string,
  importPath: PropTypes.string,
  scenariosPath: PropTypes.string,
  removeDataPath: PropTypes.string,
  onImport: PropTypes.func,
  onManageThresholds: PropTypes.func,
  onManageScenarios: PropTypes.func,
  onRemoveData: PropTypes.func,
  onLogout: PropTypes.func,
};

export default AppHeader;