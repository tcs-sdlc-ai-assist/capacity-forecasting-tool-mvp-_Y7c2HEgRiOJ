import {
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import SearchableMultiSelect from '../../../components/forms/SearchableMultiSelect.jsx';
import SearchableSingleSelect from '../../../components/forms/SearchableSingleSelect.jsx';
import { useDataset } from '../../../hooks/useDataset.js';
import {
  selectFilterOptionDescriptors,
} from '../selectors/datasetSelectors.js';
import {
  useForecastViewStore,
} from '../store/forecastViewStore.js';

const EMPTY_SELECTIONS = Object.freeze([]);
const EMPTY_OPTIONS = Object.freeze({
  planningLevels: EMPTY_SELECTIONS,
  owners: EMPTY_SELECTIONS,
  programs: EMPTY_SELECTIONS,
  teams: EMPTY_SELECTIONS,
  arts: EMPTY_SELECTIONS,
});

const FILTER_KEYS = Object.freeze({
  PLANNING_LEVELS: 'selectedPlanningLevels',
  OWNERS: 'selectedOwners',
  PROGRAMS: 'selectedPrograms',
  TEAMS: 'selectedTeams',
  ARTS: 'selectedArts',
});

const normalizeSelections = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((selection) => (
        typeof selection === 'string'
        || typeof selection === 'number'
      ))
      .map((selection) => String(selection).trim())
      .filter(Boolean),
  )];
};

const normalizePlanningLevel = (value) => {
  if (Array.isArray(value)) {
    return normalizeSelections(value)[0] ?? '';
  }

  if (
    typeof value === 'string'
    || typeof value === 'number'
  ) {
    return String(value).trim();
  }

  return '';
};

const resolveOptions = (
  suppliedOptions,
  suppliedFilterOptions,
  datasetOptions,
) => {
  const source = suppliedFilterOptions
    ?? suppliedOptions
    ?? datasetOptions
    ?? EMPTY_OPTIONS;

  return {
    planningLevels: Array.isArray(source.planningLevels)
      ? source.planningLevels
      : EMPTY_SELECTIONS,
    owners: Array.isArray(source.owners)
      ? source.owners
      : EMPTY_SELECTIONS,
    programs: Array.isArray(source.programs)
      ? source.programs
      : EMPTY_SELECTIONS,
    teams: Array.isArray(source.teams)
      ? source.teams
      : EMPTY_SELECTIONS,
    arts: Array.isArray(source.arts)
      ? source.arts
      : EMPTY_SELECTIONS,
  };
};

const createActionError = (error, fallbackMessage) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'FORECAST_FILTER_UPDATE_FAILED',
  message: typeof error?.message === 'string'
    ? error.message
    : fallbackMessage,
});

const optionPropType = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.number,
  PropTypes.shape({
    id: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    value: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    label: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    name: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
    ]),
    disabled: PropTypes.bool,
    count: PropTypes.number,
  }),
]);

const filterOptionsPropType = PropTypes.shape({
  planningLevels: PropTypes.arrayOf(optionPropType),
  owners: PropTypes.arrayOf(optionPropType),
  programs: PropTypes.arrayOf(optionPropType),
  teams: PropTypes.arrayOf(optionPropType),
  arts: PropTypes.arrayOf(optionPropType),
});

/**
 * Renders dataset-backed forecast filters with single planning-level selection
 * and multi-value selections for the remaining dimensions.
 *
 * Values within a multi-select dimension use OR semantics. Active dimensions
 * are combined using AND semantics by the forecast selectors.
 *
 * @param {{
 *   options?: object,
 *   filterOptions?: object,
 *   filters?: object,
 *   selectedPlanningLevel?: string|number,
 *   selectedPlanningLevels?: Array<string|number>,
 *   selectedOwners?: Array<string|number>,
 *   selectedPrograms?: Array<string|number>,
 *   selectedTeams?: Array<string|number>,
 *   selectedArts?: Array<string|number>,
 *   onPlanningLevelChange?: Function,
 *   onSelectedPlanningLevelsChange?: Function,
 *   onOwnersChange?: Function,
 *   onSelectedOwnersChange?: Function,
 *   onProgramsChange?: Function,
 *   onSelectedProgramsChange?: Function,
 *   onTeamsChange?: Function,
 *   onSelectedTeamsChange?: Function,
 *   onArtsChange?: Function,
 *   onSelectedArtsChange?: Function,
 *   onFiltersChange?: Function,
 *   onReset?: Function,
 *   onResetFilters?: Function,
 *   onClearFilters?: Function,
 *   title?: string,
 *   description?: string,
 *   disabled?: boolean,
 *   className?: string
 * }} props Filter panel properties.
 * @returns {import('react').ReactNode} Dataset-driven filter panel.
 */
export const FilterPanel = ({
  options = null,
  filterOptions = null,
  filters = null,
  selectedPlanningLevel = undefined,
  selectedPlanningLevels = undefined,
  selectedOwners = undefined,
  selectedPrograms = undefined,
  selectedTeams = undefined,
  selectedArts = undefined,
  onPlanningLevelChange = null,
  onSelectedPlanningLevelsChange = null,
  onOwnersChange = null,
  onSelectedOwnersChange = null,
  onProgramsChange = null,
  onSelectedProgramsChange = null,
  onTeamsChange = null,
  onSelectedTeamsChange = null,
  onArtsChange = null,
  onSelectedArtsChange = null,
  onFiltersChange = null,
  onReset = null,
  onResetFilters = null,
  onClearFilters = null,
  title = 'Forecast filters',
  description = 'Choose one planning level and any number of owners, programs, teams, or ARTs.',
  disabled = false,
  className = '',
}) => {
  const { dataset } = useDataset();
  const forecastState = useForecastViewStore();
  const [busyField, setBusyField] = useState(null);
  const [actionError, setActionError] = useState(null);

  const datasetOptions = useMemo(
    () => selectFilterOptionDescriptors(dataset),
    [dataset],
  );
  const resolvedOptions = useMemo(
    () => resolveOptions(
      options,
      filterOptions,
      datasetOptions,
    ),
    [
      datasetOptions,
      filterOptions,
      options,
    ],
  );

  const resolvedPlanningLevel = normalizePlanningLevel(
    selectedPlanningLevel
      ?? selectedPlanningLevels
      ?? filters?.selectedPlanningLevels
      ?? forecastState.selectedPlanningLevels,
  );
  const resolvedOwners = normalizeSelections(
    selectedOwners
      ?? filters?.selectedOwners
      ?? forecastState.selectedOwners,
  );
  const resolvedPrograms = normalizeSelections(
    selectedPrograms
      ?? filters?.selectedPrograms
      ?? forecastState.selectedPrograms,
  );
  const resolvedTeams = normalizeSelections(
    selectedTeams
      ?? filters?.selectedTeams
      ?? forecastState.selectedTeams,
  );
  const resolvedArts = normalizeSelections(
    selectedArts
      ?? filters?.selectedArts
      ?? forecastState.selectedArts,
  );

  const currentFilters = {
    selectedPlanningLevels: resolvedPlanningLevel
      ? [resolvedPlanningLevel]
      : [],
    selectedOwners: resolvedOwners,
    selectedPrograms: resolvedPrograms,
    selectedTeams: resolvedTeams,
    selectedArts: resolvedArts,
  };

  const runUpdate = async (
    field,
    value,
    callback,
    fallbackMessage,
  ) => {
    if (disabled || busyField !== null) {
      return;
    }

    setBusyField(field);
    setActionError(null);

    try {
      const result = await callback(value);

      if (result?.ok === false) {
        throw result.error ?? new Error(fallbackMessage);
      }

      if (typeof onFiltersChange === 'function') {
        const changeResult = await onFiltersChange({
          ...currentFilters,
          [field]: value,
        });

        if (changeResult?.ok === false) {
          throw changeResult.error ?? new Error(fallbackMessage);
        }
      }
    } catch (error) {
      setActionError(createActionError(error, fallbackMessage));
    } finally {
      setBusyField(null);
    }
  };

  const handlePlanningLevelChange = (value) => {
    const planningLevel = normalizePlanningLevel(value);
    const planningLevels = planningLevel ? [planningLevel] : [];
    let callback;

    if (typeof onPlanningLevelChange === 'function') {
      callback = () => onPlanningLevelChange(planningLevel);
    } else if (
      typeof onSelectedPlanningLevelsChange === 'function'
    ) {
      callback = () => onSelectedPlanningLevelsChange(planningLevels);
    } else {
      callback = () => forecastState.setSelectedPlanningLevels(
        planningLevels,
      );
    }

    runUpdate(
      FILTER_KEYS.PLANNING_LEVELS,
      planningLevels,
      callback,
      'The planning-level filter could not be updated.',
    );
  };

  const handleMultiSelectChange = (
    field,
    value,
    primaryCallback,
    alternateCallback,
    storeCallback,
    failureMessage,
  ) => {
    const selections = normalizeSelections(value);
    const callback = primaryCallback
      ?? alternateCallback
      ?? storeCallback;

    runUpdate(
      field,
      selections,
      () => callback(selections),
      failureMessage,
    );
  };

  const handleReset = async () => {
    if (disabled || busyField !== null) {
      return;
    }

    const callback = onResetFilters
      ?? onClearFilters
      ?? onReset
      ?? forecastState.resetFilters;

    setBusyField('reset');
    setActionError(null);

    try {
      const result = await callback();

      if (result?.ok === false) {
        throw result.error
          ?? new Error('Forecast filters could not be cleared.');
      }

      if (typeof onFiltersChange === 'function') {
        const changeResult = await onFiltersChange({
          selectedPlanningLevels: [],
          selectedOwners: [],
          selectedPrograms: [],
          selectedTeams: [],
          selectedArts: [],
        });

        if (changeResult?.ok === false) {
          throw changeResult.error
            ?? new Error('Forecast filters could not be cleared.');
        }
      }
    } catch (error) {
      setActionError(createActionError(
        error,
        'Forecast filters could not be cleared.',
      ));
    } finally {
      setBusyField(null);
    }
  };

  const activeSelectionCount = (
    (resolvedPlanningLevel ? 1 : 0)
    + resolvedOwners.length
    + resolvedPrograms.length
    + resolvedTeams.length
    + resolvedArts.length
  );
  const controlsDisabled = disabled || busyField !== null;

  return (
    <section
      className={`rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm ${className}`}
      aria-labelledby="forecast-filter-panel-title"
      aria-busy={busyField !== null || undefined}
    >
      <div className="flex flex-col gap-4 border-b border-neutral-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="forecast-filter-panel-title"
              className="text-lg font-semibold text-neutral-900"
            >
              {title}
            </h2>
            {activeSelectionCount > 0 ? (
              <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-800">
                {activeSelectionCount} active
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">
              {description}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={controlsDisabled || activeSelectionCount === 0}
          onClick={handleReset}
        >
          {busyField === 'reset' ? 'Clearing…' : 'Clear filters'}
        </button>
      </div>

      <div className="relative z-10 grid gap-5 overflow-visible p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
        <SearchableSingleSelect
          id="forecast-filter-planning-level"
          label="Planning level"
          options={resolvedOptions.planningLevels}
          value={resolvedPlanningLevel}
          onChange={handlePlanningLevelChange}
          placeholder="All planning levels"
          searchPlaceholder="Search planning levels"
          clearLabel="Clear planning level"
          helperText="Select at most one planning level."
          disabled={controlsDisabled}
        />

        <SearchableMultiSelect
          id="forecast-filter-owners"
          label="Owner"
          options={resolvedOptions.owners}
          value={resolvedOwners}
          onChange={(value) => handleMultiSelectChange(
            FILTER_KEYS.OWNERS,
            value,
            onOwnersChange,
            onSelectedOwnersChange,
            forecastState.setSelectedOwners,
            'The owner filters could not be updated.',
          )}
          placeholder="All owners"
          searchPlaceholder="Search owners"
          disabled={controlsDisabled}
        />

        <SearchableMultiSelect
          id="forecast-filter-programs"
          label="Program"
          options={resolvedOptions.programs}
          value={resolvedPrograms}
          onChange={(value) => handleMultiSelectChange(
            FILTER_KEYS.PROGRAMS,
            value,
            onProgramsChange,
            onSelectedProgramsChange,
            forecastState.setSelectedPrograms,
            'The program filters could not be updated.',
          )}
          placeholder="All programs"
          searchPlaceholder="Search programs"
          disabled={controlsDisabled}
        />

        <SearchableMultiSelect
          id="forecast-filter-teams"
          label="Team"
          options={resolvedOptions.teams}
          value={resolvedTeams}
          onChange={(value) => handleMultiSelectChange(
            FILTER_KEYS.TEAMS,
            value,
            onTeamsChange,
            onSelectedTeamsChange,
            forecastState.setSelectedTeams,
            'The team filters could not be updated.',
          )}
          placeholder="All teams"
          searchPlaceholder="Search teams"
          disabled={controlsDisabled}
        />

        <SearchableMultiSelect
          id="forecast-filter-arts"
          label="ART"
          options={resolvedOptions.arts}
          value={resolvedArts}
          onChange={(value) => handleMultiSelectChange(
            FILTER_KEYS.ARTS,
            value,
            onArtsChange,
            onSelectedArtsChange,
            forecastState.setSelectedArts,
            'The ART filters could not be updated.',
          )}
          placeholder="All ARTs"
          searchPlaceholder="Search ARTs"
          disabled={controlsDisabled}
        />
      </div>

      <div className="border-t border-neutral-200 bg-neutral-50 px-5 py-3 sm:px-6">
        <p className="text-xs leading-5 text-neutral-600">
          Multiple values within a filter are matched using OR. Different
          filter categories are combined using AND.
        </p>
      </div>

      {actionError ? (
        <div
          className="border-t border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-800 sm:px-6"
          role="alert"
        >
          {actionError.message}
        </div>
      ) : null}
    </section>
  );
};

FilterPanel.propTypes = {
  options: filterOptionsPropType,
  filterOptions: filterOptionsPropType,
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
  selectedPlanningLevel: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]),
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
  onPlanningLevelChange: PropTypes.func,
  onSelectedPlanningLevelsChange: PropTypes.func,
  onOwnersChange: PropTypes.func,
  onSelectedOwnersChange: PropTypes.func,
  onProgramsChange: PropTypes.func,
  onSelectedProgramsChange: PropTypes.func,
  onTeamsChange: PropTypes.func,
  onSelectedTeamsChange: PropTypes.func,
  onArtsChange: PropTypes.func,
  onSelectedArtsChange: PropTypes.func,
  onFiltersChange: PropTypes.func,
  onReset: PropTypes.func,
  onResetFilters: PropTypes.func,
  onClearFilters: PropTypes.func,
  title: PropTypes.string,
  description: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default FilterPanel;