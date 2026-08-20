import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import { APP_NAME } from '../config/appConfig.js';
import datasetAccessFacade from '../facades/datasetAccessFacade.js';
import persistenceStatusFacade from '../facades/persistenceStatusFacade.js';
import {
  forecastViewStore,
} from '../features/forecast/store/forecastViewStore.js';
import {
  scenarioStore,
} from '../features/scenarios/store/scenarioStore.js';
import AuthProvider from './AuthProvider.jsx';
import bootstrapOrchestrator from '../services/bootstrapOrchestrator.js';

const STARTUP_STATUSES = Object.freeze({
  INITIALIZING: 'initializing',
  READY: 'ready',
  FAILED: 'failed',
});

const createStartupError = (error) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'APP_STARTUP_FAILED',
  message: typeof error?.message === 'string'
    ? error.message
    : 'The application could not complete startup.',
});

const synchronizeApplicationState = async (bootstrapResult) => {
  const datasetResult = await Promise.resolve(
    datasetAccessFacade.applyBootstrapResult(bootstrapResult),
  );

  if (datasetResult?.ok === false) {
    throw createStartupError(datasetResult.error);
  }

  await Promise.resolve(persistenceStatusFacade.refresh());
  await Promise.resolve(
    forecastViewStore.getState().hydratePreferences(),
  );
  await Promise.resolve(
    scenarioStore.getState().hydrateScenarios(
      datasetAccessFacade.getSnapshot(),
    ),
  );
};

const StartupStatus = () => (
  <main
    className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12"
    aria-labelledby="startup-title"
  >
    <div
      className="w-full max-w-md rounded-lg border border-neutral-200 bg-neutral-0 p-8 text-center shadow-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700"
        aria-hidden="true"
      />
      <h1
        id="startup-title"
        className="text-xl font-semibold text-neutral-900"
      >
        Starting {APP_NAME}
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        Restoring your browser-local workspace.
      </p>
    </div>
  </main>
);

const StartupError = ({
  error,
  onReload,
}) => (
  <main
    className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-12"
    aria-labelledby="startup-error-title"
  >
    <div
      className="w-full max-w-lg rounded-lg border border-red-200 bg-neutral-0 p-8 shadow-sm"
      role="alert"
    >
      <h1
        id="startup-error-title"
        className="text-xl font-semibold text-neutral-900"
      >
        {APP_NAME} could not start
      </h1>
      <p className="mt-3 text-sm text-neutral-700">
        {error.message}
      </p>
      <p className="mt-2 text-sm text-neutral-600">
        Reload the page to retry browser-local initialization.
      </p>
      <button
        type="button"
        className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        onClick={onReload}
      >
        Reload application
      </button>
    </div>
  </main>
);

StartupError.propTypes = {
  error: PropTypes.shape({
    code: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
  }).isRequired,
  onReload: PropTypes.func.isRequired,
};

/**
 * Initializes browser-local application state before rendering app routes and
 * composes the global authentication provider.
 *
 * @param {{
 *   children: import('react').ReactNode
 * }} props Provider properties.
 * @returns {import('react').ReactNode} Global provider content.
 */
export const AppProviders = ({ children }) => {
  const [startupStatus, setStartupStatus] = useState(
    STARTUP_STATUSES.INITIALIZING,
  );
  const [startupError, setStartupError] = useState(null);

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      try {
        const result = await bootstrapOrchestrator.initialize();

        if (!active) {
          return;
        }

        if (!result?.ok) {
          setStartupError(createStartupError(result?.error));
          setStartupStatus(STARTUP_STATUSES.FAILED);
          return;
        }

        await synchronizeApplicationState(result);

        if (active) {
          setStartupError(null);
          setStartupStatus(STARTUP_STATUSES.READY);
        }
      } catch (error) {
        if (active) {
          setStartupError(createStartupError(error));
          setStartupStatus(STARTUP_STATUSES.FAILED);
        }
      }
    };

    initialize();

    return () => {
      active = false;
    };
  }, []);

  const reloadApplication = useCallback(() => {
    window.location.reload();
  }, []);

  if (startupStatus === STARTUP_STATUSES.FAILED) {
    return (
      <StartupError
        error={startupError ?? createStartupError(null)}
        onReload={reloadApplication}
      />
    );
  }

  if (startupStatus !== STARTUP_STATUSES.READY) {
    return <StartupStatus />;
  }

  return (
    <AuthProvider fallback={<StartupStatus />}>
      {children}
    </AuthProvider>
  );
};

AppProviders.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AppProviders;