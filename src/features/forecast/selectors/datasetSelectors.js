import { matchesGlobalSearch } from '../utils/search.js';

export const FILTER_DIMENSIONS = Object.freeze([
  Object.freeze({
    key: 'selectedPlanningLevels',
    field: 'planningLevel',
    optionKey: 'planningLevels',
    label: 'Planning level',
  }),
  Object.freeze({
    key: 'selectedOwners',
    field: 'owner',
    optionKey: 'owners',
    label: 'Owner',
  }),
  Object.freeze({
    key: 'selectedPrograms',
    field: 'program',
    optionKey: 'programs',
    label: 'Program',
  }),
  Object.freeze({
    key: 'selectedTeams',
    field: 'team',
    optionKey: 'teams',
    label: 'Team',
  }),
  Object.freeze({
    key: 'selectedArts',
    field: 'art',
    optionKey: 'arts',
    label: 'ART',
  }),
]);

export const NO_RESULTS_REASONS = Object.freeze({
  EMPTY_DATASET: 'empty_dataset',
  NO_MATCHES: 'no_matches',
});

const FILTER_ALIASES = Object.freeze({
  selectedPlanningLevels: Object.freeze([
    'planningLevels',
    'planningLevelSelections',
  ]),
  selectedOwners: Object.freeze([
    'owners',
    'ownerSelections',
  ]),
  selectedPrograms: Object.freeze([
    'programs',
    'programSelections',
  ]),
  selectedTeams: Object.freeze([
    'teams',
    'teamSelections',
  ]),
  selectedArts: Object.freeze([
    'arts',
    'artSelections',
  ]),
});

const SEARCH_ALIASES = Object.freeze([
  'searchTerm',
  'searchQuery',
  'globalFilter',
  'search',
]);

const TEAM_COLUMN_PREFIXES = Object.freeze([
  'team:',
  'allocation:',
  'allocations.',
  'allocations:',
]);

const EMPTY_OPTIONS = Object.freeze({
  planningLevels: Object.freeze([]),
  owners: Object.freeze([]),
  programs: Object.freeze([]),
  teams: Object.freeze([]),
  arts: Object.freeze([]),
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const hasOwn = (value, key) => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const normalizeString = (value) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeSearchTerm = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .slice(0, 512);
};

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

const normalizeSorting = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const identifiers = new Set();
  const sorting = [];

  value.forEach((sort) => {
    if (!isRecord(sort) || typeof sort.id !== 'string') {
      return;
    }

    const id = sort.id.trim();

    if (!id || identifiers.has(id)) {
      return;
    }

    identifiers.add(id);
    sorting.push({
      id,
      desc: Boolean(sort.desc),
    });
  });

  return sorting;
};

const compareText = (first, second) => {
  const normalizedFirst = String(first).toLocaleLowerCase();
  const normalizedSecond = String(second).toLocaleLowerCase();

  if (normalizedFirst < normalizedSecond) {
    return -1;
  }

  if (normalizedFirst > normalizedSecond) {
    return 1;
  }

  return String(first).localeCompare(String(second));
};

const getPlanningLevelSortRank = (value) => {
  const normalized = String(value).trim().toLowerCase();

  if (normalized === 'current pi') {
    return 0;
  }

  if (normalized.endsWith(' train')) {
    return 1;
  }

  return 2;
};

const comparePlanningLevels = (first, second) => {
  const rankDiff = getPlanningLevelSortRank(first)
    - getPlanningLevelSortRank(second);

  if (rankDiff !== 0) {
    return rankDiff;
  }

  return String(first).localeCompare(String(second), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const uniqueSortedStrings = (values, compare = compareText) => (
  [...new Set(
    values
      .filter((value) => (
        typeof value === 'string' || typeof value === 'number'
      ))
      .map((value) => String(value).trim())
      .filter(Boolean),
  )].sort(compare)
);

const resolveDataset = (source) => {
  if (!isRecord(source)) {
    return null;
  }

  if (
    Array.isArray(source.workItems)
    && Array.isArray(source.capacityRecords)
  ) {
    return source;
  }

  const data = isRecord(source.data) ? source.data : source;

  return data.dataset
    ?? data.activeDataset
    ?? data.content
    ?? data.baselineDataset
    ?? null;
};

const resolveFilters = (source) => {
  if (!isRecord(source)) {
    return {};
  }

  if (isRecord(source.filters)) {
    return source.filters;
  }

  if (isRecord(source.viewState)) {
    return source.viewState;
  }

  return source;
};

const readSelection = (filters, key) => {
  const candidates = [
    filters[key],
    ...(FILTER_ALIASES[key] ?? []).map((alias) => filters[alias]),
  ];
  const selection = candidates.find(Array.isArray);

  return normalizeSelections(selection);
};

const readSearchTerm = (filters) => {
  for (const alias of SEARCH_ALIASES) {
    if (
      filters[alias] !== null
      && filters[alias] !== undefined
    ) {
      return normalizeSearchTerm(filters[alias]);
    }
  }

  return '';
};

const readSorting = (filters, explicitSorting) => (
  normalizeSorting(
    explicitSorting === undefined
      ? filters.sorting
      : explicitSorting,
  )
);

const memoizeLast = (selector) => {
  let previousArguments = null;
  let previousResult;

  return (...args) => {
    if (
      previousArguments
      && previousArguments.length === args.length
      && args.every((argument, index) => (
        argument === previousArguments[index]
      ))
    ) {
      return previousResult;
    }

    previousArguments = args;
    previousResult = selector(...args);

    return previousResult;
  };
};

const createOptions = (source) => {
  const dataset = resolveDataset(source);

  if (!dataset) {
    return EMPTY_OPTIONS;
  }

  const workItems = Array.isArray(dataset.workItems)
    ? dataset.workItems
    : [];
  const capacityRecords = Array.isArray(dataset.capacityRecords)
    ? dataset.capacityRecords
    : [];
  const dimensions = isRecord(dataset.dimensions)
    ? dataset.dimensions
    : {};

  return {
    planningLevels: uniqueSortedStrings([
      ...(Array.isArray(dimensions.planningLevels)
        ? dimensions.planningLevels
        : []),
      ...workItems.map((item) => item?.planningLevel),
      ...capacityRecords.map((record) => record?.planningLevel),
    ], comparePlanningLevels),
    owners: uniqueSortedStrings([
      ...(Array.isArray(dimensions.owners) ? dimensions.owners : []),
      ...workItems.map((item) => item?.owner),
    ]),
    programs: uniqueSortedStrings([
      ...(Array.isArray(dimensions.programs)
        ? dimensions.programs
        : []),
      ...workItems.map((item) => item?.program),
    ]),
    teams: uniqueSortedStrings([
      ...(Array.isArray(dimensions.teams) ? dimensions.teams : []),
      ...workItems.flatMap((item) => (
        Array.isArray(item?.team) ? item.team : []
      )),
      ...workItems.flatMap((item) => (
        isRecord(item?.allocations)
          ? Object.keys(item.allocations)
          : []
      )),
      ...capacityRecords.map((record) => record?.team),
    ]),
    arts: uniqueSortedStrings([
      ...(Array.isArray(dimensions.arts) ? dimensions.arts : []),
      ...workItems.map((item) => item?.art),
    ]),
  };
};

/**
 * Returns the normalized dataset from a dataset-like source.
 *
 * @param {*} source Dataset, facade snapshot, or state object.
 * @returns {object|null} Resolved dataset.
 */
export const selectDataset = (source) => resolveDataset(source);

/**
 * Returns work items from a dataset-like source.
 *
 * @param {*} source Dataset, facade snapshot, or state object.
 * @returns {object[]} Work-item collection.
 */
export const selectWorkItems = (source) => {
  if (Array.isArray(source)) {
    return source;
  }

  const dataset = resolveDataset(source);

  return Array.isArray(dataset?.workItems)
    ? dataset.workItems
    : [];
};

/**
 * Returns capacity records from a dataset-like source.
 *
 * @param {*} source Dataset, facade snapshot, or state object.
 * @returns {object[]} Capacity-record collection.
 */
export const selectCapacityRecords = (source) => {
  const dataset = resolveDataset(source);

  return Array.isArray(dataset?.capacityRecords)
    ? dataset.capacityRecords
    : [];
};

/**
 * Derives all dataset-backed forecast filter options.
 *
 * @param {*} source Dataset, facade snapshot, or state object.
 * @returns {object} Sorted unique option values by dimension.
 */
export const selectFilterOptions = memoizeLast(createOptions);

export const selectPlanningLevelOptions = (source) => (
  selectFilterOptions(source).planningLevels
);

export const selectOwnerOptions = (source) => (
  selectFilterOptions(source).owners
);

export const selectProgramOptions = (source) => (
  selectFilterOptions(source).programs
);

export const selectTeamOptions = (source) => (
  selectFilterOptions(source).teams
);

export const selectArtOptions = (source) => (
  selectFilterOptions(source).arts
);

const createOptionDescriptors = (source) => {
  const options = selectFilterOptions(source);
  const workItems = selectWorkItems(source);

  return Object.fromEntries(
    FILTER_DIMENSIONS.map((dimension) => {
      const descriptors = options[dimension.optionKey].map((value) => ({
        value,
        label: value,
        count: workItems.filter((item) => {
          const fieldValue = item?.[dimension.field];

          return Array.isArray(fieldValue)
            ? fieldValue.includes(value)
            : fieldValue === value;
        }).length,
      }));

      return [dimension.optionKey, descriptors];
    }),
  );
};

/**
 * Derives label/value/count descriptors for filter controls.
 *
 * @param {*} source Dataset, facade snapshot, or state object.
 * @returns {object} Option descriptors by dimension.
 */
export const selectFilterOptionDescriptors = memoizeLast(
  createOptionDescriptors,
);

const createDynamicTeamColumns = (source) => (
  selectTeamOptions(source).map((team) => ({
    id: `team:${team}`,
    team,
    header: team,
    accessorFn: (row) => (
      isRecord(row?.allocations) && hasOwn(row.allocations, team)
        ? row.allocations[team]
        : null
    ),
  }))
);

/**
 * Creates TanStack-compatible allocation columns for every dataset team.
 *
 * @param {*} source Dataset, facade snapshot, or state object.
 * @returns {object[]} Dynamic team column definitions.
 */
export const selectDynamicTeamColumns = memoizeLast(
  createDynamicTeamColumns,
);

export const selectTeamColumns = selectDynamicTeamColumns;
export const selectAllocationColumns = selectDynamicTeamColumns;

/**
 * Normalizes the forecast filters used by selectors.
 *
 * @param {*} source Filter state or an object containing filter state.
 * @returns {object} Canonical filter values.
 */
export const selectNormalizedFilters = (source = {}) => {
  const filters = resolveFilters(source);

  return {
    searchTerm: readSearchTerm(filters),
    selectedPlanningLevels: readSelection(
      filters,
      'selectedPlanningLevels',
    ),
    selectedOwners: readSelection(filters, 'selectedOwners'),
    selectedPrograms: readSelection(filters, 'selectedPrograms'),
    selectedTeams: readSelection(filters, 'selectedTeams'),
    selectedArts: readSelection(filters, 'selectedArts'),
    sorting: readSorting(filters),
  };
};

const matchesSelection = (fieldValue, selections) => {
  if (selections.length === 0) {
    return true;
  }

  if (Array.isArray(fieldValue)) {
    return fieldValue.some((value) => selections.includes(value));
  }

  return selections.includes(fieldValue);
};

/**
 * Determines whether a work item matches OR-within and AND-across filters.
 *
 * @param {object} workItem Work item to evaluate.
 * @param {*} filterSource Forecast filter state.
 * @returns {boolean} Whether the item matches all active dimensions.
 */
export const matchesForecastFilters = (workItem, filterSource = {}) => {
  if (!isRecord(workItem)) {
    return false;
  }

  const filters = selectNormalizedFilters(filterSource);

  return FILTER_DIMENSIONS.every((dimension) => (
    matchesSelection(
      workItem[dimension.field],
      filters[dimension.key],
    )
  ));
};

/**
 * Applies dimension filters without applying global search or sorting.
 *
 * @param {*} source Dataset-like source or work-item array.
 * @param {*} filterSource Forecast filter state.
 * @returns {object[]} Dimension-filtered work items.
 */
export const selectDimensionFilteredWorkItems = (
  source,
  filterSource = {},
) => {
  const workItems = selectWorkItems(source);
  const filters = selectNormalizedFilters(filterSource);

  if (
    FILTER_DIMENSIONS.every((dimension) => (
      filters[dimension.key].length === 0
    ))
  ) {
    return workItems;
  }

  return workItems.filter((workItem) => (
    FILTER_DIMENSIONS.every((dimension) => (
      matchesSelection(
        workItem?.[dimension.field],
        filters[dimension.key],
      )
    ))
  ));
};

/**
 * Applies global search to a collection of work items.
 *
 * @param {*} source Dataset-like source or work-item array.
 * @param {*} searchSource Search term or forecast filter state.
 * @returns {object[]} Search-matched work items.
 */
export const selectSearchedWorkItems = (
  source,
  searchSource = '',
) => {
  const workItems = selectWorkItems(source);
  const searchTerm = isRecord(searchSource)
    ? readSearchTerm(resolveFilters(searchSource))
    : normalizeSearchTerm(searchSource);

  if (!searchTerm.trim()) {
    return workItems;
  }

  return workItems.filter((workItem) => (
    matchesGlobalSearch(workItem, searchTerm)
  ));
};

const resolveTeamFromSortId = (id) => {
  for (const prefix of TEAM_COLUMN_PREFIXES) {
    if (id.startsWith(prefix)) {
      return id.slice(prefix.length);
    }
  }

  return '';
};

const sumAllocations = (workItem) => (
  isRecord(workItem?.allocations)
    ? Object.values(workItem.allocations).reduce((total, value) => (
      total + (
        typeof value === 'number' && Number.isFinite(value)
          ? value
          : 0
      )
    ), 0)
    : 0
);

const resolveSortValue = (workItem, id) => {
  const team = resolveTeamFromSortId(id);

  if (team) {
    return isRecord(workItem?.allocations)
      && hasOwn(workItem.allocations, team)
      ? workItem.allocations[team]
      : null;
  }

  if (
    isRecord(workItem?.allocations)
    && hasOwn(workItem.allocations, id)
  ) {
    return workItem.allocations[id];
  }

  if (id === 'allocatedPoints' || id === 'allocationPoints') {
    return sumAllocations(workItem);
  }

  if (id === 'team' || id === 'teams') {
    return Array.isArray(workItem?.team)
      ? workItem.team.join(', ')
      : '';
  }

  return workItem?.[id] ?? null;
};

const compareValues = (first, second) => {
  const firstMissing = first === null
    || first === undefined
    || first === '';
  const secondMissing = second === null
    || second === undefined
    || second === '';

  if (firstMissing || secondMissing) {
    if (firstMissing && secondMissing) {
      return 0;
    }

    return firstMissing ? 1 : -1;
  }

  if (
    typeof first === 'number'
    && Number.isFinite(first)
    && typeof second === 'number'
    && Number.isFinite(second)
  ) {
    return first - second;
  }

  return compareText(
    Array.isArray(first) ? first.join(', ') : first,
    Array.isArray(second) ? second.join(', ') : second,
  );
};

/**
 * Applies stable controlled multi-column sorting to work items.
 *
 * @param {*} source Dataset-like source or work-item array.
 * @param {*} sortingSource Sorting array or forecast filter state.
 * @returns {object[]} Stably sorted work items.
 */
export const selectSortedWorkItems = (
  source,
  sortingSource = [],
) => {
  const workItems = selectWorkItems(source);
  const sorting = Array.isArray(sortingSource)
    ? normalizeSorting(sortingSource)
    : readSorting(resolveFilters(sortingSource));

  if (sorting.length === 0) {
    return workItems;
  }

  return workItems
    .map((workItem, index) => ({
      workItem,
      index,
    }))
    .sort((firstEntry, secondEntry) => {
      for (const sort of sorting) {
        const comparison = compareValues(
          resolveSortValue(firstEntry.workItem, sort.id),
          resolveSortValue(secondEntry.workItem, sort.id),
        );

        if (comparison !== 0) {
          return sort.desc ? -comparison : comparison;
        }
      }

      return firstEntry.index - secondEntry.index;
    })
    .map((entry) => entry.workItem);
};

/**
 * Applies dimension filters and global search to dataset work items.
 *
 * @param {*} source Dataset-like source or work-item array.
 * @param {*} filterSource Forecast filter state.
 * @returns {object[]} Filtered work items.
 */
export const selectFilteredWorkItems = (
  source,
  filterSource = {},
) => {
  const filters = selectNormalizedFilters(filterSource);
  const dimensionFiltered = selectDimensionFilteredWorkItems(
    source,
    filters,
  );

  return selectSearchedWorkItems(
    dimensionFiltered,
    filters.searchTerm,
  );
};

/**
 * Applies filters, search, and controlled sorting to dataset work items.
 *
 * @param {*} source Dataset-like source or work-item array.
 * @param {*} filterSource Forecast filter state.
 * @param {object[]} [sorting] Optional controlled sorting override.
 * @returns {object[]} Visible forecast work items.
 */
export const selectVisibleWorkItems = (
  source,
  filterSource = {},
  sorting,
) => {
  const filters = selectNormalizedFilters(filterSource);
  const filteredWorkItems = selectFilteredWorkItems(source, filters);
  const resolvedSorting = sorting === undefined
    ? filters.sorting
    : sorting;

  return selectSortedWorkItems(filteredWorkItems, resolvedSorting);
};

export const selectForecastRows = selectVisibleWorkItems;
export const selectVisibleForecastRows = selectVisibleWorkItems;

const createActiveFilterChips = (filterSource) => {
  const filters = selectNormalizedFilters(filterSource);

  return FILTER_DIMENSIONS.flatMap((dimension) => (
    filters[dimension.key].map((value) => ({
      id: `${dimension.key}:${value}`,
      filterKey: dimension.key,
      field: dimension.field,
      category: dimension.label,
      label: value,
      value,
    }))
  ));
};

/**
 * Creates removable chips for active dimension selections.
 *
 * @param {*} filterSource Forecast filter state.
 * @returns {object[]} Active filter chips.
 */
export const selectActiveFilterChips = memoizeLast(
  createActiveFilterChips,
);

export const selectActiveFilters = selectActiveFilterChips;

/**
 * Counts active dimension selections.
 *
 * @param {*} filterSource Forecast filter state.
 * @returns {number} Number of active filter values.
 */
export const selectActiveFilterCount = (filterSource = {}) => (
  selectActiveFilterChips(filterSource).length
);

export const selectHasActiveFilters = (filterSource = {}) => (
  selectActiveFilterCount(filterSource) > 0
);

export const selectHasActiveSearch = (filterSource = {}) => (
  selectNormalizedFilters(filterSource).searchTerm.trim().length > 0
);

export const selectHasActiveCriteria = (filterSource = {}) => (
  selectHasActiveFilters(filterSource)
  || selectHasActiveSearch(filterSource)
);

/**
 * Derives the empty-state reason for the current forecast view.
 *
 * @param {*} source Dataset-like source or work-item array.
 * @param {*} filterSource Forecast filter state.
 * @returns {object} No-results state.
 */
export const selectNoResultsState = (
  source,
  filterSource = {},
) => {
  const sourceRows = selectWorkItems(source);
  const visibleRows = selectVisibleWorkItems(source, filterSource);
  const hasSourceRows = sourceRows.length > 0;
  const hasActiveFilters = selectHasActiveFilters(filterSource);
  const hasActiveSearch = selectHasActiveSearch(filterSource);
  const isNoResults = visibleRows.length === 0;
  let reason = null;
  let message = '';

  if (!hasSourceRows) {
    reason = NO_RESULTS_REASONS.EMPTY_DATASET;
    message = 'The active dataset does not contain any work items.';
  } else if (isNoResults) {
    reason = NO_RESULTS_REASONS.NO_MATCHES;
    message = 'No work items match the active filters and search.';
  }

  return {
    isNoResults,
    reason,
    message,
    hasDataset: resolveDataset(source) !== null || Array.isArray(source),
    hasSourceRows,
    hasActiveFilters,
    hasActiveSearch,
    hasActiveCriteria: hasActiveFilters || hasActiveSearch,
    sourceRowCount: sourceRows.length,
    visibleRowCount: visibleRows.length,
  };
};

export const selectHasNoResults = (source, filterSource = {}) => (
  selectNoResultsState(source, filterSource).isNoResults
);

export const selectNoResults = selectHasNoResults;

/**
 * Creates independently memoized selectors for a forecast view instance.
 *
 * @returns {object} Memoized forecast dataset selectors.
 */
export const createDatasetSelectors = () => ({
  selectFilterOptions: memoizeLast(createOptions),
  selectFilterOptionDescriptors: memoizeLast(
    createOptionDescriptors,
  ),
  selectDynamicTeamColumns: memoizeLast(
    createDynamicTeamColumns,
  ),
  selectFilteredWorkItems: memoizeLast(
    selectFilteredWorkItems,
  ),
  selectVisibleWorkItems: memoizeLast(
    selectVisibleWorkItems,
  ),
  selectActiveFilterChips: memoizeLast(
    createActiveFilterChips,
  ),
  selectNoResultsState: memoizeLast(
    selectNoResultsState,
  ),
});

export default Object.freeze({
  selectDataset,
  selectWorkItems,
  selectCapacityRecords,
  selectFilterOptions,
  selectFilterOptionDescriptors,
  selectPlanningLevelOptions,
  selectOwnerOptions,
  selectProgramOptions,
  selectTeamOptions,
  selectArtOptions,
  selectDynamicTeamColumns,
  selectNormalizedFilters,
  matchesForecastFilters,
  selectDimensionFilteredWorkItems,
  selectSearchedWorkItems,
  selectSortedWorkItems,
  selectFilteredWorkItems,
  selectVisibleWorkItems,
  selectActiveFilterChips,
  selectActiveFilterCount,
  selectHasActiveFilters,
  selectHasActiveSearch,
  selectHasActiveCriteria,
  selectNoResultsState,
  selectHasNoResults,
  createDatasetSelectors,
});