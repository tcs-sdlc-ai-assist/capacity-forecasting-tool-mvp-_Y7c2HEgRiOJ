import {
  useId,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import { useDataset } from '../../../hooks/useDataset.js';

const ACTIONS = Object.freeze({
  IMPORT: 'import',
  RECOVER: 'recover',
});

const createActionError = (error, fallbackMessage) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'NO_DATA_RECOVERY_FAILED',
  message: typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : fallbackMessage,
});

const resolveErrorMessage = (error) => {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return '';
};

const DatasetIcon = () => (
  <svg
    className="h-8 w-8"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.75 6.5c0-1.52 3.25-2.75 7.25-2.75s7.25 1.23 7.25 2.75S16 9.25 12 9.25 4.75 8.02 4.75 6.5Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.75 6.5v5c0 1.52 3.25 2.75 7.25 2.75s7.25-1.23 7.25-2.75v-5"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.75 11.5v5c0 1.52 3.25 2.75 7.25 2.75s7.25-1.23 7.25-2.75v-5"
    />
    <path
      strokeLinecap="round"
      d="M9.5 11.75h5"
    />
  </svg>
);

const ImportIcon = () => (
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
 * Presents an accessible state when no active dataset is available, including
 * browser-local import and startup recovery actions.
 *
 * @param {{
 *   dataset?: object|null,
 *   data?: object|null,
 *   hasDataset?: boolean,
 *   show?: boolean,
 *   isLoading?: boolean,
 *   loading?: boolean,
 *   error?: object|string,
 *   onImport?: Function,
 *   onImportClick?: Function,
 *   onRecover?: Function,
 *   onRetry?: Function,
 *   onReload?: Function,
 *   onRefresh?: Function,
 *   importPath?: string,
 *   title?: string,
 *   description?: string,
 *   guidance?: string,
 *   importLabel?: string,
 *   reloadLabel?: string,
 *   disabled?: boolean,
 *   className?: string
 * }} props No-data state properties.
 * @returns {import('react').ReactNode} No active dataset state.
 */
export const NoDataState = ({
  dataset = undefined,
  data = undefined,
  hasDataset = undefined,
  show = undefined,
  isLoading = false,
  loading = false,
  error = null,
  onImport = null,
  onImportClick = null,
  onRecover = null,
  onRetry = null,
  onReload = null,
  onRefresh = null,
  importPath = '/import',
  title = 'No active dataset',
  description = 'There is no active capacity dataset in this browser.',
  guidance = 'Import a CSV or JSON dataset to begin forecasting. If data should already be available, reload the application to retry browser-local recovery.',
  importLabel = 'Import dataset',
  reloadLabel = 'Reload application',
  disabled = false,
  className = '',
}) => {
  const generatedId = useId();
  const titleId = `no-data-${generatedId.replace(/:/g, '')}`;
  const activeDatasetState = useDataset();
  const resolvedDataset = dataset
    ?? data
    ?? activeDatasetState.dataset;
  const resolvedHasDataset = hasDataset
    ?? Boolean(resolvedDataset);
  const shouldRender = show ?? !resolvedHasDataset;
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const isRecovering = (
    isLoading
    || loading
    || activeDatasetState.isLoading
  );
  const suppliedErrorMessage = resolveErrorMessage(
    error ?? activeDatasetState.error,
  );
  const displayedError = actionError?.message
    ?? suppliedErrorMessage;
  const importCallback = onImport ?? onImportClick;
  const recoveryCallback = onRecover
    ?? onRetry
    ?? onReload
    ?? onRefresh;
  const controlsDisabled = (
    disabled
    || busyAction !== null
    || isRecovering
  );

  if (!shouldRender) {
    return null;
  }

  const runAction = async (
    action,
    callback,
    fallbackMessage,
  ) => {
    if (
      controlsDisabled
      || typeof callback !== 'function'
    ) {
      return;
    }

    setBusyAction(action);
    setActionError(null);

    try {
      const result = await callback();

      if (result?.ok === false) {
        setActionError(createActionError(
          result.error,
          fallbackMessage,
        ));
      }
    } catch (actionFailure) {
      setActionError(createActionError(
        actionFailure,
        fallbackMessage,
      ));
    } finally {
      setBusyAction(null);
    }
  };

  const handleImport = () => {
    runAction(
      ACTIONS.IMPORT,
      importCallback,
      'The dataset import workspace could not be opened.',
    );
  };

  const handleRecovery = () => {
    const callback = recoveryCallback ?? (() => {
      if (typeof window === 'undefined') {
        throw new Error('Application reload is unavailable.');
      }

      window.location.reload();
    });

    runAction(
      ACTIONS.RECOVER,
      callback,
      'The browser-local dataset recovery could not be retried.',
    );
  };

  return (
    <section
      className={`rounded-xl border border-dashed border-neutral-300 bg-neutral-0 px-5 py-10 text-center shadow-xs sm:px-8 sm:py-12 ${className}`}
      aria-labelledby={titleId}
      aria-busy={
        isRecovering || busyAction !== null || undefined
      }
    >
      <span
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-700"
        aria-hidden="true"
      >
        <DatasetIcon />
      </span>

      <h1
        id={titleId}
        className="mt-5 text-xl font-semibold text-neutral-900"
      >
        {title}
      </h1>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-neutral-700">
        {description}
      </p>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-neutral-600">
        {guidance}
      </p>

      {isRecovering ? (
        <div
          className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-teal-800"
          role="status"
          aria-live="polite"
        >
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-teal-200 border-t-teal-700"
            aria-hidden="true"
          />
          Restoring browser-local data…
        </div>
      ) : (
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {typeof importCallback === 'function' ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={controlsDisabled}
              onClick={handleImport}
            >
              <ImportIcon />
              {busyAction === ACTIONS.IMPORT
                ? 'Opening import…'
                : importLabel}
            </button>
          ) : (
            <a
              href={importPath}
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 ${
                controlsDisabled
                  ? 'pointer-events-none cursor-not-allowed opacity-60'
                  : ''
              }`}
              aria-disabled={controlsDisabled || undefined}
              tabIndex={controlsDisabled ? -1 : undefined}
            >
              <ImportIcon />
              {importLabel}
            </a>
          )}

          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={controlsDisabled}
            onClick={handleRecovery}
          >
            <ReloadIcon />
            {busyAction === ACTIONS.RECOVER
              ? 'Reloading…'
              : reloadLabel}
          </button>
        </div>
      )}

      {displayedError ? (
        <div
          className="mx-auto mt-6 max-w-xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-900"
          role="alert"
        >
          <p className="font-semibold">
            Dataset recovery needs attention
          </p>
          <p className="mt-1 leading-5">
            {displayedError}
          </p>
          <p className="mt-1 text-xs leading-5 text-red-800">
            You can still import a replacement dataset, or reload to retry
            application startup.
          </p>
        </div>
      ) : null}
    </section>
  );
};

NoDataState.propTypes = {
  dataset: PropTypes.object,
  data: PropTypes.object,
  hasDataset: PropTypes.bool,
  show: PropTypes.bool,
  isLoading: PropTypes.bool,
  loading: PropTypes.bool,
  error: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      code: PropTypes.string,
      message: PropTypes.string,
    }),
  ]),
  onImport: PropTypes.func,
  onImportClick: PropTypes.func,
  onRecover: PropTypes.func,
  onRetry: PropTypes.func,
  onReload: PropTypes.func,
  onRefresh: PropTypes.func,
  importPath: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  guidance: PropTypes.string,
  importLabel: PropTypes.string,
  reloadLabel: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default NoDataState;