import {
  useId,
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import {
  selectActiveFilterChips,
} from '../selectors/datasetSelectors.js';
import {
  useForecastViewStore,
} from '../store/forecastViewStore.js';

const createActionError = (error, fallbackMessage) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'ACTIVE_FILTER_UPDATE_FAILED',
  message: typeof error?.message === 'string'
    ? error.message
    : fallbackMessage,
});

const normalizeChips = (chips) => {
  if (!Array.isArray(chips)) {
    return [];
  }

  return chips
    .filter((chip) => (
      chip !== null
      && typeof chip === 'object'
      && !Array.isArray(chip)
      && typeof chip.filterKey === 'string'
      && chip.filterKey.trim()
      && (
        typeof chip.value === 'string'
        || typeof chip.value === 'number'
      )
    ))
    .map((chip, index) => {
      const filterKey = chip.filterKey.trim();
      const value = String(chip.value).trim();
      const category = typeof chip.category === 'string'
        && chip.category.trim()
        ? chip.category.trim()
        : 'Filter';
      const label = typeof chip.label === 'string'
        && chip.label.trim()
        ? chip.label.trim()
        : value;

      return {
        ...chip,
        id: typeof chip.id === 'string' && chip.id.trim()
          ? chip.id.trim()
          : `${filterKey}:${value}:${index}`,
        filterKey,
        value,
        category,
        label,
      };
    })
    .filter((chip) => chip.value && chip.label);
};

const RemoveIcon = () => (
  <svg
    className="h-3.5 w-3.5"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z" />
  </svg>
);

/**
 * Renders active forecast selections as labelled, removable filter chips.
 *
 * @param {{
 *   chips?: object[],
 *   activeFilters?: object[],
 *   filters?: object,
 *   onRemove?: Function,
 *   onRemoveFilter?: Function,
 *   onClear?: Function,
 *   onClearAll?: Function,
 *   onClearFilters?: Function,
 *   title?: string,
 *   clearLabel?: string,
 *   disabled?: boolean,
 *   className?: string
 * }} props Active-filter chip properties.
 * @returns {import('react').ReactNode} Active filter visibility controls.
 */
export const ActiveFilterChips = ({
  chips = undefined,
  activeFilters = undefined,
  filters = null,
  onRemove = null,
  onRemoveFilter = null,
  onClear = null,
  onClearAll = null,
  onClearFilters = null,
  title = 'Active filters',
  clearLabel = 'Clear all filters',
  disabled = false,
  className = '',
}) => {
  const generatedId = useId();
  const titleId = `active-filters-${generatedId.replace(/:/g, '')}`;
  const forecastState = useForecastViewStore();
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);

  const storeFilters = useMemo(() => ({
    selectedPlanningLevels: forecastState.selectedPlanningLevels,
    selectedOwners: forecastState.selectedOwners,
    selectedPrograms: forecastState.selectedPrograms,
    selectedTeams: forecastState.selectedTeams,
    selectedArts: forecastState.selectedArts,
  }), [
    forecastState.selectedPlanningLevels,
    forecastState.selectedOwners,
    forecastState.selectedPrograms,
    forecastState.selectedTeams,
    forecastState.selectedArts,
  ]);

  const resolvedChips = useMemo(() => {
    const suppliedChips = chips ?? activeFilters;

    if (suppliedChips !== undefined) {
      return normalizeChips(suppliedChips);
    }

    return normalizeChips(
      selectActiveFilterChips(filters ?? storeFilters),
    );
  }, [
    activeFilters,
    chips,
    filters,
    storeFilters,
  ]);

  if (resolvedChips.length === 0 && actionError === null) {
    return null;
  }

  const handleRemove = async (chip) => {
    if (disabled || busyAction !== null) {
      return;
    }

    setBusyAction(chip.id);
    setActionError(null);

    try {
      let result;

      if (typeof onRemoveFilter === 'function') {
        result = await onRemoveFilter(
          chip.filterKey,
          chip.value,
          chip,
        );
      } else if (typeof onRemove === 'function') {
        result = await onRemove(chip);
      } else {
        result = await forecastState.toggleSelection(
          chip.filterKey,
          chip.value,
        );
      }

      if (result?.ok === false) {
        setActionError(createActionError(
          result.error,
          `The ${chip.category.toLowerCase()} filter could not be removed.`,
        ));
      }
    } catch (error) {
      setActionError(createActionError(
        error,
        `The ${chip.category.toLowerCase()} filter could not be removed.`,
      ));
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearAll = async () => {
    if (disabled || busyAction !== null) {
      return;
    }

    const callback = onClearAll
      ?? onClearFilters
      ?? onClear
      ?? forecastState.resetFilters;

    setBusyAction('clear-all');
    setActionError(null);

    try {
      const result = await callback();

      if (result?.ok === false) {
        setActionError(createActionError(
          result.error,
          'Active forecast filters could not be cleared.',
        ));
      }
    } catch (error) {
      setActionError(createActionError(
        error,
        'Active forecast filters could not be cleared.',
      ));
    } finally {
      setBusyAction(null);
    }
  };

  const controlsDisabled = disabled || busyAction !== null;
  const filterCount = resolvedChips.length;

  return (
    <section
      className={`rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-3 shadow-xs ${className}`}
      aria-labelledby={titleId}
      aria-busy={busyAction !== null || undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id={titleId}
              className="text-sm font-semibold text-neutral-800"
            >
              {title}
            </h2>
            <span
              className="inline-flex min-w-6 items-center justify-center rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800"
              aria-live="polite"
              aria-atomic="true"
            >
              {filterCount}
              <span className="sr-only">
                {` active filter${filterCount === 1 ? '' : 's'}`}
              </span>
            </span>
          </div>

          {filterCount > 0 ? (
            <ul
              className="mt-3 flex flex-wrap gap-2"
              aria-label="Active forecast filters"
            >
              {resolvedChips.map((chip) => (
                <li key={chip.id}>
                  <span className="inline-flex max-w-full items-center overflow-hidden rounded-full border border-teal-200 bg-teal-50 text-sm text-teal-950">
                    <span className="min-w-0 px-3 py-1.5">
                      <span className="font-semibold">
                        {chip.category}:
                      </span>{' '}
                      <span>{chip.label}</span>
                    </span>
                    <button
                      type="button"
                      className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center self-stretch border-l border-teal-200 px-2 text-teal-700 transition-colors hover:bg-teal-100 hover:text-teal-950 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`Remove ${chip.category} filter: ${chip.label}`}
                      disabled={controlsDisabled}
                      onClick={() => handleRemove(chip)}
                    >
                      <RemoveIcon />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {filterCount > 0 ? (
          <button
            type="button"
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-50 hover:text-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={controlsDisabled}
            onClick={handleClearAll}
          >
            {busyAction === 'clear-all' ? 'Clearing…' : clearLabel}
          </button>
        ) : null}
      </div>

      {actionError ? (
        <div
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          role="alert"
        >
          {actionError.message}
        </div>
      ) : null}
    </section>
  );
};

const chipPropType = PropTypes.shape({
  id: PropTypes.string,
  filterKey: PropTypes.string.isRequired,
  field: PropTypes.string,
  category: PropTypes.string,
  label: PropTypes.string,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]).isRequired,
});

ActiveFilterChips.propTypes = {
  chips: PropTypes.arrayOf(chipPropType),
  activeFilters: PropTypes.arrayOf(chipPropType),
  filters: PropTypes.shape({
    selectedPlanningLevels: PropTypes.arrayOf(
      PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
      ]),
    ),
    selectedOwners: PropTypes.arrayOf(
      PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
      ]),
    ),
    selectedPrograms: PropTypes.arrayOf(
      PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
      ]),
    ),
    selectedTeams: PropTypes.arrayOf(
      PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
      ]),
    ),
    selectedArts: PropTypes.arrayOf(
      PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.number,
      ]),
    ),
  }),
  onRemove: PropTypes.func,
  onRemoveFilter: PropTypes.func,
  onClear: PropTypes.func,
  onClearAll: PropTypes.func,
  onClearFilters: PropTypes.func,
  title: PropTypes.string,
  clearLabel: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default ActiveFilterChips;