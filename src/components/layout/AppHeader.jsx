import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import {
  NavLink,
  useNavigate,
} from 'react-router-dom';
import { useStore } from 'zustand';
import { APP_NAME } from '../../config/appConfig.js';
import {
  forecastViewStore,
  WORKSPACE_VIEWS,
} from '../../features/forecast/store/forecastViewStore.js';

import { useProfileImage } from '../../hooks/useProfileImage.js';
import { useAuthContext } from '../../providers/AuthProvider.jsx';
import ProfileAvatar from '../profile/ProfileAvatar.jsx';
import ProfilePanel from '../profile/ProfilePanel.jsx';

const ACTIONS = Object.freeze({
  SCENARIOS: 'scenarios',
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


const ActionIcon = ({ action }) => {
  if (action === ACTIONS.SCENARIOS) {
    return (
      <svg
        className="h-5 w-5"
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

  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M3 4.75A2.75 2.75 0 0 1 5.75 2h5.5A2.75 2.75 0 0 1 14 4.75v2.5a.75.75 0 0 1-1.5 0v-2.5c0-.69-.56-1.25-1.25-1.25h-5.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h5.5c.69 0 1.25-.56 1.25-1.25v-2.5a.75.75 0 0 1 1.5 0v2.5A2.75 2.75 0 0 1 11.25 18h-5.5A2.75 2.75 0 0 1 3 15.25V4.75Zm12.78 2.47a.75.75 0 0 1 0 1.06L14.06 10h1.69a.75.75 0 0 1 0 1.5h-1.69l1.72 1.72a.75.75 0 1 1-1.06 1.06l-3-3a.75.75 0 0 1 0-1.06l3-3a.75.75 0 0 1 1.06 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
};

ActionIcon.propTypes = {
  action: PropTypes.oneOf(Object.values(ACTIONS)).isRequired,
};

const HeaderIconButton = ({
  action,
  label,
  disabled,
  onClick,
  variant = 'secondary',
}) => {
  const className = variant === 'danger'
    ? 'inline-flex p-1.5 shrink-0 items-center justify-center rounded-md text-red-200 transition-colors hover:text-red-50 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex p-1.5 shrink-0 items-center justify-center rounded-md text-teal-200 transition-colors hover:text-white hover:bg-teal-800/80 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <ActionIcon action={action} />
    </button>
  );
};

HeaderIconButton.propTypes = {
  action: PropTypes.oneOf(Object.values(ACTIONS)).isRequired,
  label: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['secondary', 'danger']),
};

/**
 * Renders protected application navigation, identity, and utility actions.
 *
 * @param {{
 *   dataLabel?: string,
 *   forecastPath?: string,
 *   onLogout?: Function
 * }} props Header properties.
 * @returns {import('react').ReactNode} Protected application header.
 */
export const AppHeader = ({
  dataLabel: _dataLabel = '',
  forecastPath = '/forecast',
  onLogout = null,
}) => {
  const auth = useAuthContext();
  const navigate = useNavigate();
  const workspaceView = useStore(
    forecastViewStore,
    (state) => state.workspaceView,
  );
  const isScenarioView = workspaceView === WORKSPACE_VIEWS.SCENARIOS;
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const displayName = auth.session?.displayName
    ?? auth.session?.username
    ?? 'Signed-in user';
  const username = auth.session?.username ?? '';
  const {
    imageSrc,
    saveImage,
    removeImage,
  } = useProfileImage(username);

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

  const openForecastWorkspace = () => {
    forecastViewStore.getState().openForecastWorkspace();
  };

  const openScenariosWorkspace = () => {
    forecastViewStore.getState().openScenariosWorkspace();
  };

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
    <header className="sticky top-0 z-50 bg-teal-950 text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 shrink-0 items-center gap-2.5 flex-1">
          {isScenarioView ? (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm font-medium text-teal-200 transition-colors hover:text-white"
                onClick={openForecastWorkspace}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M17.25 10a.75.75 0 0 1-.75.75H5.31l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 1.06L5.31 9.25H16.5a.75.75 0 0 1 .75.75Z"
                    clipRule="evenodd"
                  />
                </svg>
                Back
              </button>
              <span className="text-teal-600" aria-hidden="true">|</span>
              <span
                className="grid h-8 w-8 shrink-0 grid-cols-3 items-end gap-0.5 rounded-md bg-teal-700 p-1.5"
                aria-hidden="true"
              >
                <span className="h-1.5 rounded-sm bg-white" />
                <span className="h-3 rounded-sm bg-white" />
                <span className="h-5 rounded-sm bg-white" />
              </span>
              <span className="whitespace-nowrap text-sm font-semibold sm:text-base text-white">
                Scenario Workspace
              </span>
            </>
          ) : (
            <>
              <NavLink
                to={forecastPath}
                className="inline-flex items-center gap-2 rounded-md text-white transition-opacity hover:opacity-90"
                aria-label={`${APP_NAME} forecast workspace`}
                onClick={openForecastWorkspace}
              >
                <span
                  className="grid h-8 w-8 shrink-0 grid-cols-3 items-end gap-0.5 rounded-md bg-teal-700 p-1.5"
                  aria-hidden="true"
                >
                  <span className="h-1.5 rounded-sm bg-white" />
                  <span className="h-3 rounded-sm bg-white" />
                  <span className="h-5 rounded-sm bg-white" />
                </span>
                <span className="whitespace-nowrap text-sm font-semibold sm:text-base">
                  {APP_NAME}
                </span>
              </NavLink>
              <span className="ml-2 inline-flex items-center rounded bg-teal-800/60 px-2 py-0.5 text-[10px] font-medium text-teal-100 uppercase tracking-wide border border-teal-700">
                Demo data
              </span>
            </>
          )}
        </div>

        <div
          className="flex shrink-0 items-center gap-2"
          aria-label="Utility actions"
        >
          <HeaderIconButton
            action={ACTIONS.LOGOUT}
            label={busyAction === ACTIONS.LOGOUT ? 'Signing out…' : 'Sign out'}
            disabled={actionsDisabled}
            onClick={handleLogout}
          />
          {isScenarioView ? null : (
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-teal-700 bg-teal-800/50 px-3 text-xs font-semibold text-teal-50 shadow-xs transition-colors hover:border-teal-600 hover:bg-teal-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={actionsDisabled}
              onClick={openScenariosWorkspace}
            >
              <ActionIcon action={ACTIONS.SCENARIOS} />
              Scenarios
            </button>
          )}
        </div>

        <button
          type="button"
          className="ml-auto flex shrink-0 items-center gap-2 rounded-md border-l border-teal-800 py-0.5 pl-3 transition-colors hover:bg-teal-900"
          aria-haspopup="dialog"
          aria-expanded={isProfileOpen}
          aria-label={`View account details for ${displayName}`}
          onClick={() => setIsProfileOpen(true)}
        >
          <div className="whitespace-nowrap text-right leading-tight">
            <p className="text-xs font-semibold text-white">
              {displayName}
            </p>
            {username ? (
              <p className="text-[11px] text-teal-200">
                {username}
              </p>
            ) : null}
          </div>
          <ProfileAvatar imageSrc={imageSrc || '/demo-profile.jpg'} alt="" />
        </button>
      </div>

      <ProfilePanel
        isOpen={isProfileOpen}
        session={auth.session}
        imageSrc={imageSrc}
        onClose={() => setIsProfileOpen(false)}
        onSaveImage={saveImage}
        onRemoveImage={removeImage}
      />

      {actionError ? (
        <div className="mx-auto w-full max-w-screen-2xl px-4 pb-2 sm:px-6 lg:px-8">
          <div
            className="rounded-md border border-red-300/60 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-50"
            role="alert"
          >
            {actionError.message}
          </div>
        </div>
      ) : null}
    </header>
  );
};

AppHeader.propTypes = {
  dataLabel: PropTypes.string,
  forecastPath: PropTypes.string,
  onLogout: PropTypes.func,
};

export default AppHeader;