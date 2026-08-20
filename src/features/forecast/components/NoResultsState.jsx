import {
  useId,
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import { useDataset } from '../../../hooks/useDataset.js';
import {
  NO_RESULTS_REASONS,
  selectNoResultsState,
} from '../selectors/datasetSelectors.js';
import {
  forecastViewStore,
  useForecastViewStore,
} from '../store/forecastViewStore.js';

const createActionError = (error, fallbackMessage) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'NO_RESULTS_RECOVERY_FAILED',
  message: typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : fallbackMessage,
});

const SearchIcon = () => (
  <svg
    className="h-7 w-7"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m20 20-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
    />
    <path
      strokeLinecap="round"
      d="M8 10.5h5"
    />
  </svg>
);

const EmptyDatasetIcon = () => (
  <svg
    className="h-7 w-7"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 4.75h14A2.25 2.25 0 0 1 21.25 7v10A2.25 2.25 0 0 1 19 19.25H5A2.25 2.25 0 0 1 2.75 17V7A2.25 2.25 0 0 1 5 4.75Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 9.25h8M8 12h8M8 14.75h4"
    />
  </svg>
);

const clearDimensionFilters = () => {
  const state = forecastViewStore.getState();

  state.setSelectedPlanningLevels([], { persist: false });
  state.setSelectedOwners([], { persist: false });
  state.setSelectedPrograms([], { persist: false });
  state.setSelectedTeams([], { persist: false });
  state.setSelectedArts([], { persist: false });

  return state.persistFilters();
};

/**
 * Presents distinct empty-dataset and zero-match guidance with recovery
 * actions for active search and dimension filters.
 *
 * @param {{
 *   dataset?: object,
 *   state?: object,
 *   noResultsState?: object,
 *   reason?: 'empty_dataset'|'no_matches',
 *   message?: string,
 *   searchTerm?: string,
 *   activeFilterCount?: number,
 *   hasActiveSearch?: boolean,
 *   hasActiveFilters?: boolean,
 *   isNoResults?: boolean,
 *   onClearSearch?: Function,
 *   onSearchChange?: Function,
 *   onClearFilters?: Function,
 *   onResetFilters?: Function,
 *   title?: string,
 *   emptyDatasetTitle?: string,
 *   noMatchesTitle?: string,
 *   disabled?: boolean,
 *   className?: string
 * }} props No-results properties.
 * @returns {import('react').ReactNode} No-results recovery state.
 */
export const NoResultsState = ({
  dataset = undefined,
  state = null,
  noResultsState = null,
  reason = undefined,
  message = '',
  searchTerm = undefined,
  activeFilterCount = undefined,
  hasActiveSearch = undefined,
  hasActiveFilters = undefined,
  isNoResults = undefined,
  onClearSearch = null,
  onSearchChange = null,
  onClearFilters = null,
  onResetFilters = null,
  title = '',
  emptyDatasetTitle = 'No work items available',
  noMatchesTitle = 'No matching work items',
  disabled = false,
  className = '',
}) => {
  const generatedId = useId();
  const titleId = `no-results-${generatedId.replace(/:/g, '')}`;
  const { dataset: activeDataset } = useDataset();
  const storeSearchTerm = useForecastViewStore(
    (storeState) => storeState.searchTerm,
  );
  const selectedPlanningLevels = useForecastViewStore(
    (storeState) => storeState.selectedPlanningLevels,
  );
  const selectedOwners = useForecastViewStore(
    (storeState) => storeState.selectedOwners,
  );
  const selectedPrograms = useForecastViewStore(
    (storeState) => storeState.selectedPrograms,
  );
  const selectedTeams = useForecastViewStore(
    (storeState) => storeState.selectedTeams,
  );
  const selectedArts = useForecastViewStore(
    (storeState) => storeState.selectedArts,
  );
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);

  const filters = useMemo(() => ({
    searchTerm: searchTerm ?? storeSearchTerm,
    selectedPlanningLevels,
    selectedOwners,
    selectedPrograms,
    selectedTeams,
    selectedArts,
  }), [
    searchTerm,
    selectedArts,
    selectedOwners,
    selectedPlanningLevels,
    selectedPrograms,
    selectedTeams,
    storeSearchTerm,
  ]);

  const derivedState = useMemo(
    () => selectNoResultsState(
      dataset ?? activeDataset,
      filters,
    ),
    [activeDataset, dataset, filters],
  );
  const suppliedState = noResultsState ?? state;
  const resolvedReason = reason
    ?? suppliedState?.reason
    ?? derivedState.reason;
  const resolvedIsNoResults = isNoResults
    ?? suppliedState?.isNoResults
    ?? derivedState.isNoResults;
  const resolvedSearchTerm = searchTerm ?? storeSearchTerm;
  const storeFilterCount = (
    selectedPlanningLevels.length
    + selectedOwners.length
    + selectedPrograms.length
    + selectedTeams.length
    + selectedArts.length
  );
  const resolvedFilterCount = activeFilterCount
    ?? suppliedState?.activeFilterCount
    ?? storeFilterCount;
  const resolvedHasActiveSearch = hasActiveSearch
    ?? suppliedState?.hasActiveSearch
    ?? resolvedSearchTerm.trim().length > 0;
  const resolvedHasActiveFilters = hasActiveFilters
    ?? suppliedState?.hasActiveFilters
    ?? resolvedFilterCount > 0;
  const isEmptyDataset = resolvedReason
    === NO_RESULTS_REASONS.EMPTY_DATASET;
  const resolvedTitle = title || (
    isEmptyDataset ? emptyDatasetTitle : noMatchesTitle
  );
  const resolvedMessage = message
    || suppliedState?.message
    || (
      isEmptyDataset
        ? 'The active dataset does not contain any work items. Import a dataset to begin forecasting capacity.'
        : resolvedHasActiveSearch && resolvedHasActiveFilters
          ? 'No work items match the current search and filters. Clear one or both criteria to broaden the forecast view.'
          : resolvedHasActiveSearch
            ? 'No work items match the current search. Clear the search or try a different term.'
            : resolvedHasActiveFilters
              ? 'No work items match the active filters. Clear the filters to restore the full forecast view.'
              : 'No work items are available for the current forecast view.'
    );

  if (!resolvedIsNoResults) {
    return null;
  }

  const runRecoveryAction = async (
    action,
    callback,
    failureMessage,
  ) => {
    if (
      disabled
      || busyAction !== null
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
          failureMessage,
        ));
      }
    } catch (error) {
      setActionError(createActionError(error, failureMessage));
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearSearch = () => {
    const callback = onClearSearch
      ? () => onClearSearch('')
      : onSearchChange
        ? () => onSearchChange('')
        : () => forecastViewStore.getState().setSearchTerm('');

    runRecoveryAction(
      'search',
      callback,
      'The forecast search could not be cleared.',
    );
  };

  const handleClearFilters = () => {
    const callback = onClearFilters
      ?? onResetFilters
      ?? clearDimensionFilters;

    runRecoveryAction(
      'filters',
      callback,
      'The active forecast filters could not be cleared.',
    );
  };

  const controlsDisabled = disabled || busyAction !== null;

  return (
    <section
      className={`rounded-xl border border-dashed border-neutral-300 bg-neutral-0 px-5 py-10 text-center shadow-xs sm:px-8 sm:py-12 ${className}`}
      aria-labelledby={titleId}
      aria-busy={busyAction !== null || undefined}
    >
      <span
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
          isEmptyDataset
            ? 'bg-neutral-100 text-neutral-600'
            : 'bg-teal-50 text-teal-700'
        }`}
        aria-hidden="true"
      >
        {isEmptyDataset ? <EmptyDatasetIcon /> : <SearchIcon />}
      </span>

      <h2
        id={titleId}
        className="mt-4 text-lg font-semibold text-neutral-900"
      >
        {resolvedTitle}
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-neutral-600">
        {resolvedMessage}
      </p>

      {!isEmptyDataset
      && (resolvedHasActiveSearch || resolvedHasActiveFilters) ? (
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {resolvedHasActiveSearch ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={controlsDisabled}
              onClick={handleClearSearch}
            >
              {busyAction === 'search'
                ? 'Clearing search…'
                : 'Clear search'}
            </button>
          ) : null}

          {resolvedHasActiveFilters ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={controlsDisabled}
              onClick={handleClearFilters}
            >
              {busyAction === 'filters'
                ? 'Clearing filters…'
                : 'Clear filters'}
            </button>
          ) : null}
        </div>
      ) : null}

      {actionError ? (
        <div
          className="mx-auto mt-5 max-w-xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-medium text-red-800"
          role="alert"
        >
          {actionError.message}
        </div>
      ) : null}
    </section>
  );
};

const noResultsStatePropType = PropTypes.shape({
  isNoResults: PropTypes.bool,
  reason: PropTypes.oneOf(Object.values(NO_RESULTS_REASONS)),
  message: PropTypes.string,
  hasActiveSearch: PropTypes.bool,
  hasActiveFilters: PropTypes.bool,
  activeFilterCount: PropTypes.number,
  sourceRowCount: PropTypes.number,
  visibleRowCount: PropTypes.number,
});

NoResultsState.propTypes = {
  dataset: PropTypes.object,
  state: noResultsStatePropType,
  noResultsState: noResultsStatePropType,
  reason: PropTypes.oneOf(Object.values(NO_RESULTS_REASONS)),
  message: PropTypes.string,
  searchTerm: PropTypes.string,
  activeFilterCount: PropTypes.number,
  hasActiveSearch: PropTypes.bool,
  hasActiveFilters: PropTypes.bool,
  isNoResults: PropTypes.bool,
  onClearSearch: PropTypes.func,
  onSearchChange: PropTypes.func,
  onClearFilters: PropTypes.func,
  onResetFilters: PropTypes.func,
  title: PropTypes.string,
  emptyDatasetTitle: PropTypes.string,
  noMatchesTitle: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default NoResultsState;