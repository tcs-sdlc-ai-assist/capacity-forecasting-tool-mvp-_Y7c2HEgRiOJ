import {
  useCallback,
  useState,
} from 'react';
import PropTypes from 'prop-types';

const TOOLBAR_ACTIONS = Object.freeze({
  FILTERS: 'filters',
  THRESHOLDS: 'thresholds',
  SCENARIOS: 'scenarios',
  IMPORT: 'import',
  EXPORT: 'export',
});

const normalizeCount = (value) => {
  const count = Number(value);

  return Number.isInteger(count) && count >= 0 ? count : 0;
};

const createActionError = (error, fallbackMessage) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'FORECAST_TOOLBAR_ACTION_FAILED',
  message: typeof error?.message === 'string'
    ? error.message
    : fallbackMessage,
});

const SearchIcon = () => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M9 3.5a5.5 5.5 0 1 0 3.437 9.795l3.634 3.634a.75.75 0 0 0 1.06-1.06l-3.633-3.634A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
      clipRule="evenodd"
    />
  </svg>
);

const FilterIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M2.75 4.5A.75.75 0 0 1 3.5 3.75h13a.75.75 0 0 1 .53 1.28l-5.28 5.28v4.44a.75.75 0 0 1-.416.671l-2.5 1.25A.75.75 0 0 1 7.75 16v-5.69L2.97 5.03a.75.75 0 0 1-.22-.53Z" />
  </svg>
);

const ThresholdIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M3.25 4.5A.75.75 0 0 1 4 3.75h7.1a2.75 2.75 0 0 1 5.3 0h.6a.75.75 0 0 1 0 1.5h-.6a2.75 2.75 0 0 1-5.3 0H4a.75.75 0 0 1-.75-.75Zm9.25 0a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 0 0-2.5 0ZM3 10a.75.75 0 0 1 .75-.75h.85a2.75 2.75 0 0 1 5.3 0H17a.75.75 0 0 1 0 1.5H9.9a2.75 2.75 0 0 1-5.3 0h-.85A.75.75 0 0 1 3 10Zm3.25-1.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM3 15.5a.75.75 0 0 1 .75-.75h7.35a2.75 2.75 0 0 1 5.3 0h.6a.75.75 0 0 1 0 1.5h-.6a2.75 2.75 0 0 1-5.3 0H3.75A.75.75 0 0 1 3 15.5Zm9.5 0a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 0 0-2.5 0Z" />
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

const ExportIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V5.56l2.72 2.72a.75.75 0 1 0 1.06-1.06l-4-4a.75.75 0 0 0-1.06 0l-4 4a.75.75 0 0 0 1.06 1.06l2.72-2.72v7.69Z" />
    <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
  </svg>
);

const ClearIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z" />
  </svg>
);

const RemoveDataIcon = () => (
  <svg
    className="h-5 w-5"
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

const ToolbarButton = ({
  children,
  disabled,
  icon,
  onClick,
  primary = false,
  danger = false,
  title = '',
  'aria-label': ariaLabel = '',
}) => (
  <button
    type="button"
    className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-[13px] font-semibold shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
      danger
        ? 'border-neutral-300 bg-neutral-0 text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700'
        : primary
          ? 'border-teal-700 bg-teal-700 text-white hover:border-teal-800 hover:bg-teal-800'
          : 'border-neutral-300 bg-neutral-0 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900'
    }`}
    disabled={disabled}
    onClick={onClick}
    title={title}
    aria-label={ariaLabel || title}
  >
    {icon}
    {children}
  </button>
);

ToolbarButton.propTypes = {
  children: PropTypes.node,
  disabled: PropTypes.bool,
  icon: PropTypes.node.isRequired,
  onClick: PropTypes.func.isRequired,
  primary: PropTypes.bool,
  danger: PropTypes.bool,
  title: PropTypes.string,
  'aria-label': PropTypes.string,
};

export const ForecastToolbar = ({
  searchTerm = '',
  searchValue = undefined,
  onSearchChange = null,
  onSearchTermChange = null,
  activeFilterCount = 0,
  resultCount: _resultCount = 0,
  visibleCount: _visibleCount = undefined,
  totalCount: _totalCount = undefined,
  onOpenFilters = null,
  onFiltersClick = null,
  onOpenThresholds = null,
  onThresholdsClick = null,
  onManageScenarios: _onManageScenarios = null,
  onScenariosClick: _onScenariosClick = null,
  onImport = null,
  onImportClick = null,
  onExport = null,
  onExportClick = null,
  onRemoveData = null,
  isDemoData: _isDemoData = true,
  isLocalOnly: _isLocalOnly = true,
  dataLabel: _dataLabel = '',
  disabled = false,
  searchPlaceholder = 'Search programs, features, owners, or teams',
  titleNode = null,
  embedded = false,
  className = '',
}) => {
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const resolvedSearchTerm = searchValue ?? searchTerm;
  const resolvedFilterCount = normalizeCount(activeFilterCount);
  const actionsDisabled = disabled || busyAction !== null;

  const runAction = useCallback(async (
    action,
    callback,
    failureMessage,
  ) => {
    if (disabled || busyAction !== null || typeof callback !== 'function') {
      return;
    }

    setBusyAction(action);
    setActionError(null);

    try {
      const result = await callback();

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
  }, [busyAction, disabled]);

  const handleSearchChange = (event) => {
    const callback = onSearchChange ?? onSearchTermChange;

    if (typeof callback !== 'function') {
      return;
    }

    try {
      callback(event.target.value);
      setActionError(null);
    } catch (error) {
      setActionError(createActionError(
        error,
        'The forecast search could not be updated.',
      ));
    }
  };

  const handleClearSearch = () => {
    const callback = onSearchChange ?? onSearchTermChange;

    if (typeof callback !== 'function') {
      return;
    }

    try {
      callback('');
      setActionError(null);
    } catch (error) {
      setActionError(createActionError(
        error,
        'The forecast search could not be cleared.',
      ));
    }
  };

  const filtersCallback = onOpenFilters ?? onFiltersClick;
  const thresholdsCallback = onOpenThresholds ?? onThresholdsClick;
  const importCallback = onImport ?? onImportClick;
  const exportCallback = onExport ?? onExportClick;

  const containerClass = embedded
    ? `flex flex-col lg:flex-row lg:items-center gap-4 ${className}`
    : `rounded-xl border border-neutral-200 bg-neutral-0 p-4 shadow-sm flex flex-col lg:flex-row lg:items-center gap-4 ${className}`;

  return (
    <section
      className={containerClass}
      aria-label="Forecast controls"
    >
      <div className="flex shrink-0 items-center min-w-0">
        {titleNode || (
          <h2 className="sr-only">
            Forecast Controls
          </h2>
        )}
      </div>

      <div className="flex-1 w-full min-w-0 lg:max-w-sm">
        <label
          htmlFor="forecast-global-search"
          className="sr-only"
        >
          Global search
        </label>

        <div className="relative">
          <span
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-500"
            aria-hidden="true"
          >
            <SearchIcon />
          </span>

          <input
            id="forecast-global-search"
            type="search"
            className="min-h-9 w-full rounded border border-neutral-300 bg-neutral-0 py-1.5 pl-9 pr-9 text-[13px] text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-500 hover:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
            value={resolvedSearchTerm}
            placeholder={searchPlaceholder}
            disabled={disabled}
            autoComplete="off"
            onChange={handleSearchChange}
          />

          {resolvedSearchTerm ? (
            <button
              type="button"
              className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center rounded-r text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Clear global search"
              disabled={disabled}
              onClick={handleClearSearch}
            >
              <ClearIcon />
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="flex shrink-0 flex-wrap items-center gap-2 lg:ml-auto"
        aria-label="Forecast actions"
      >
        <ToolbarButton
          disabled={actionsDisabled || typeof filtersCallback !== 'function'}
          icon={<FilterIcon />}
          onClick={() => runAction(
            TOOLBAR_ACTIONS.FILTERS,
            filtersCallback,
            'Forecast filters could not be opened.',
          )}
        >
          <span>Filters</span>
          {resolvedFilterCount > 0 ? (
            <span
              className="inline-flex min-w-5 items-center justify-center rounded-full bg-teal-100 px-1.5 py-0.5 text-xs font-bold text-teal-800"
              aria-label={`${resolvedFilterCount} active filter${resolvedFilterCount === 1 ? '' : 's'}`}
            >
              {resolvedFilterCount}
            </span>
          ) : null}
        </ToolbarButton>

        <ToolbarButton
          disabled={
            actionsDisabled
            || typeof thresholdsCallback !== 'function'
          }
          icon={<ThresholdIcon />}
          onClick={() => runAction(
            TOOLBAR_ACTIONS.THRESHOLDS,
            thresholdsCallback,
            'Capacity threshold settings could not be opened.',
          )}
        >
          Thresholds
        </ToolbarButton>

        <ToolbarButton
          disabled={actionsDisabled || typeof importCallback !== 'function'}
          icon={<ImportIcon />}
          onClick={() => runAction(
            TOOLBAR_ACTIONS.IMPORT,
            importCallback,
            'The dataset import workspace could not be opened.',
          )}
        >
          {busyAction === TOOLBAR_ACTIONS.IMPORT
            ? 'Opening…'
            : 'Import'}
        </ToolbarButton>

        <ToolbarButton
          disabled={actionsDisabled || typeof exportCallback !== 'function'}
          icon={<ExportIcon />}
          onClick={() => runAction(
            TOOLBAR_ACTIONS.EXPORT,
            exportCallback,
            'The active dataset could not be exported.',
          )}
        >
          {busyAction === TOOLBAR_ACTIONS.EXPORT
            ? 'Exporting…'
            : 'Export'}
        </ToolbarButton>

        {typeof onRemoveData === 'function' && (
          <ToolbarButton
            danger
            disabled={actionsDisabled}
            icon={<RemoveDataIcon />}
            onClick={onRemoveData}
          >
            Remove Data
          </ToolbarButton>
        )}
      </div>

      {actionError ? (
        <div
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 w-full"
          role="alert"
        >
          {actionError.message}
        </div>
      ) : null}
    </section>
  );
};

ForecastToolbar.propTypes = {
  searchTerm: PropTypes.string,
  searchValue: PropTypes.string,
  onSearchChange: PropTypes.func,
  onSearchTermChange: PropTypes.func,
  activeFilterCount: PropTypes.number,
  resultCount: PropTypes.number,
  visibleCount: PropTypes.number,
  totalCount: PropTypes.number,
  onOpenFilters: PropTypes.func,
  onFiltersClick: PropTypes.func,
  onOpenThresholds: PropTypes.func,
  onThresholdsClick: PropTypes.func,
  onManageScenarios: PropTypes.func,
  onScenariosClick: PropTypes.func,
  onImport: PropTypes.func,
  onImportClick: PropTypes.func,
  onExport: PropTypes.func,
  onExportClick: PropTypes.func,
  onRemoveData: PropTypes.func,
  isDemoData: PropTypes.bool,
  isLocalOnly: PropTypes.bool,
  dataLabel: PropTypes.string,
  disabled: PropTypes.bool,
  searchPlaceholder: PropTypes.string,
  className: PropTypes.string,
  embedded: PropTypes.bool,
  titleNode: PropTypes.node,
};

export default ForecastToolbar;