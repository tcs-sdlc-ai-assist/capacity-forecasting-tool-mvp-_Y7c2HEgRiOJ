import { useState } from 'react';
import {
  isRouteErrorResponse,
  useNavigate,
  useRouteError,
} from 'react-router-dom';
import { APP_NAME } from '../config/appConfig.js';

const ROUTE_ERROR_CONTENT = Object.freeze({
  404: Object.freeze({
    title: 'Page not found',
    description: 'The requested page does not exist or is no longer available.',
  }),
  default: Object.freeze({
    title: 'Something went wrong',
    description: 'The requested page could not be displayed. Your browser-local data has not been changed.',
  }),
});

const resolveErrorContent = (error) => {
  if (
    isRouteErrorResponse(error)
    && error.status === 404
  ) {
    return ROUTE_ERROR_CONTENT[404];
  }

  return ROUTE_ERROR_CONTENT.default;
};

const BackIcon = () => (
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
);

const HomeIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M9.47 2.97a.75.75 0 0 1 1.06 0l7 7a.75.75 0 1 1-1.06 1.06L16 10.56v5.69A1.75 1.75 0 0 1 14.25 18h-2.5A1.75 1.75 0 0 1 10 16.25V13H8.5v3.25A1.75 1.75 0 0 1 6.75 18h-1A1.75 1.75 0 0 1 4 16.25v-5.69l-.47.47a.75.75 0 0 1-1.06-1.06l7-7ZM5.5 9.06v7.19c0 .138.112.25.25.25h1a.25.25 0 0 0 .25-.25v-4A.75.75 0 0 1 7.75 11h3a.75.75 0 0 1 .75.75v4.5c0 .138.112.25.25.25h2.5a.25.25 0 0 0 .25-.25V9.06L10 4.56 5.5 9.06Z"
      clipRule="evenodd"
    />
  </svg>
);

const ReloadIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M15.312 4.688A7.5 7.5 0 1 0 17.5 10a.75.75 0 0 0-1.5 0 6 6 0 1 1-1.757-4.243L12.5 7.5h4.25a.75.75 0 0 0 .75-.75V2.5a.75.75 0 0 0-1.5 0v1.934l-.688.254Z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * Presents a safe route-level error state with navigation recovery actions.
 *
 * @returns {import('react').ReactNode} Route error page.
 */
export const RouteErrorPage = () => {
  const routeError = useRouteError();
  const navigate = useNavigate();
  const [recoveryError, setRecoveryError] = useState('');
  const content = resolveErrorContent(routeError);

  const handleBack = () => {
    setRecoveryError('');

    try {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/forecast', { replace: true });
      }
    } catch {
      setRecoveryError(
        'The previous page could not be opened. Try returning to the forecast workspace.',
      );
    }
  };

  const handleForecast = () => {
    setRecoveryError('');

    try {
      navigate('/forecast', { replace: true });
    } catch {
      setRecoveryError(
        'The forecast workspace could not be opened. Try reloading the application.',
      );
    }
  };

  const handleReload = () => {
    setRecoveryError('');

    try {
      window.location.reload();
    } catch {
      setRecoveryError(
        'The application could not be reloaded. Use your browser refresh control to try again.',
      );
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <section
        className="w-full max-w-lg rounded-xl border border-neutral-200 bg-neutral-0 p-6 text-center shadow-sm sm:p-8"
        aria-labelledby="route-error-title"
      >
        <span
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700"
          aria-hidden="true"
        >
          <svg
            className="h-8 w-8"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495a1.75 1.75 0 0 1 3.03 0l6.28 10.85A1.75 1.75 0 0 1 16.28 16H3.72a1.75 1.75 0 0 1-1.515-2.655l6.28-10.85ZM10 6.25a.75.75 0 0 1 .75.75v3.25a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              clipRule="evenodd"
            />
          </svg>
        </span>

        <p className="mt-5 text-sm font-semibold text-teal-700">
          {APP_NAME}
        </p>

        <h1
          id="route-error-title"
          className="mt-1 text-2xl font-semibold text-neutral-900"
        >
          {content.title}
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-600">
          {content.description}
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900"
            onClick={handleBack}
          >
            <BackIcon />
            Go back
          </button>

          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800"
            onClick={handleForecast}
          >
            <HomeIcon />
            Forecast workspace
          </button>

          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900"
            onClick={handleReload}
          >
            <ReloadIcon />
            Reload application
          </button>
        </div>

        {recoveryError ? (
          <div
            className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-800"
            role="alert"
          >
            {recoveryError}
          </div>
        ) : null}

        <p className="mt-6 text-xs leading-5 text-neutral-500">
          Technical error details are intentionally hidden to protect
          application and browser-local information.
        </p>
      </section>
    </main>
  );
};

export default RouteErrorPage;