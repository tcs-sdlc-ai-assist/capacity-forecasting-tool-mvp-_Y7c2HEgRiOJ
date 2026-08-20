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

const ScenarioIcon = () => (
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

const ToolbarButton = ({
  children,
  disabled,
  icon,
  onClick,
  primary = false,
}) => (
  <button
    type="button"
    className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
      primary
        ? 'border border-teal-700 bg-teal-700 text-white hover:border-teal-800 hover:bg-teal-800'
        : 'border border-neutral-300 bg-neutral-0 text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900'
    }`}
    disabled={disabled}
    onClick={onClick}
  >
    {icon}
    {children}
  </button>
);

ToolbarButton.propTypes = {
  children: PropTypes.node.isRequired,
  disabled: PropTypes.bool,
  icon: PropTypes.node.isRequired,
  onClick: PropTypes.func.isRequired,
  primary: PropTypes.bool,
};

/**
 * Renders the primary controls and context for the forecast workspace.
 *
 * @param {{
 *   searchTerm?: string,
 *   searchValue?: string,
 *   onSearchChange?: Function,
 *   onSearchTermChange?: Function,
 *   activeFilterCount?: number,
 *   resultCount?: number,
 *   visibleCount?: number,
 *   totalCount?: number,
 *   onOpenFilters?: Function,
 *   onFiltersClick?: Function,
 *   onOpenThresholds?: Function,
 *   onThresholdsClick?: Function,
 *   onManageScenarios?: Function,
 *   onScenariosClick?: Function,
 *   onImport?: Function,
 *   onImportClick?: Function,
 *   onExport?: Function,
 *   onExportClick?: Function,
 *   isDemoData?: boolean,
 *   isLocalOnly?: boolean,
 *   dataLabel?: string,
 *   disabled?: boolean,
 *   searchPlaceholder?: string,
 *   className?: string
 * }} props Toolbar properties.
 * @returns {import('react').ReactNode} Forecast toolbar.
 */
export const ForecastToolbar = ({
  searchTerm = '',
  searchValue = undefined,
  onSearchChange = null,
  onSearchTermChange = null,
  activeFilterCount = 0,
  resultCount = 0,
  visibleCount = undefined,
  totalCount = undefined,
  onOpenFilters = null,
  onFiltersClick = null,
  onOpenThresholds = null,
  onThresholdsClick = null,
  onManageScenarios = null,
  onScenariosClick = null,
  onImport = null,
  onImportClick = null,
  onExport = null,
  onExportClick = null,
  isDemoData = true,
  isLocalOnly = true,
  dataLabel = '',
  disabled = false,
  searchPlaceholder = 'Search programs, features, owners, or teams',
  className = '',
}) => {
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const resolvedSearchTerm = searchValue ?? searchTerm;
  const resolvedResultCount = normalizeCount(
    visibleCount ?? resultCount,
  );
  const resolvedTotalCount = totalCount === undefined
    ? null
    : normalizeCount(totalCount);
  const resolvedFilterCount = normalizeCount(activeFilterCount);
  const resolvedDataLabel = dataLabel.trim()
    || (isDemoData ? 'Demo data' : 'Active dataset');
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
  const scenariosCallback = onManageScenarios ?? onScenariosClick;
  const importCallback = onImport ?? onImportClick;
  const exportCallback = onExport ?? onExportClick;
  const resultLabel = resolvedTotalCount !== null
    && resolvedTotalCount !== resolvedResultCount
    ? `${resolvedResultCount} of ${resolvedTotalCount} results`
    : `${resolvedResultCount} result${resolvedResultCount === 1 ? '' : 's'}`;

  return (
    <section
      className={`rounded-xl border border-neutral-200 bg-neutral-0 p-4 shadow-sm sm:p-5 ${className}`}
      aria-label="Forecast controls"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="w-full xl:max-w-xl">
          <label
            htmlFor="forecast-global-search"
            className="block text-sm font-semibold text-neutral-800"
          >
            Global search
          </label>

          <div className="relative mt-1.5">
            <span
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-500"
              aria-hidden="true"
            >
              <SearchIcon />
            </span>

            <input
              id="forecast-global-search"
              type="search"
              className="min-h-10 w-full rounded-md border border-neutral-300 bg-neutral-0 py-2 pl-10 pr-10 text-sm text-neutral-900 shadow-xs transition-colors placeholder:text-neutral-500 hover:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
              value={resolvedSearchTerm}
              placeholder={searchPlaceholder}
              disabled={disabled}
              autoComplete="off"
              onChange={handleSearchChange}
            />

            {resolvedSearchTerm ? (
              <button
                type="button"
                className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-md text-neutral-500 transition-colors hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="flex flex-wrap items-center gap-2"
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
            disabled={
              actionsDisabled
              || typeof scenariosCallback !== 'function'
            }
            icon={<ScenarioIcon />}
            onClick={() => runAction(
              TOOLBAR_ACTIONS.SCENARIOS,
              scenariosCallback,
              'Scenario management could not be opened.',
            )}
          >
            Scenarios
          </ToolbarButton>

          <ToolbarButton
            primary
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
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-neutral-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p
          className="text-sm font-semibold text-neutral-700"
          aria-live="polite"
        >
          {resultLabel}
        </p>

        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Dataset context"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
            <span
              className="h-2 w-2 rounded-full bg-teal-600"
              aria-hidden="true"
            />
            {resolvedDataLabel}
          </span>

          {isLocalOnly ? (
            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
              Local-only
            </span>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <div
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
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
  isDemoData: PropTypes.bool,
  isLocalOnly: PropTypes.bool,
  dataLabel: PropTypes.string,
  disabled: PropTypes.bool,
  searchPlaceholder: PropTypes.string,
  className: PropTypes.string,
};

export default ForecastToolbar;