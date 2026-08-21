import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import {
  DEFAULT_THRESHOLDS,
} from '../../../constants/domainConstants.js';
import {
  createThresholds,
} from '../../../domain/schemas.js';
import preferenceRepository from '../../../repositories/preferenceRepository.js';

export const FORECAST_VIEW_STORE_ERROR_CODES = Object.freeze({
  FILTERS_READ_FAILED: 'FORECAST_VIEW_FILTERS_READ_FAILED',
  FILTERS_WRITE_FAILED: 'FORECAST_VIEW_FILTERS_WRITE_FAILED',
  THRESHOLDS_READ_FAILED: 'FORECAST_VIEW_THRESHOLDS_READ_FAILED',
  THRESHOLDS_WRITE_FAILED: 'FORECAST_VIEW_THRESHOLDS_WRITE_FAILED',
  INVALID_THRESHOLDS: 'FORECAST_VIEW_INVALID_THRESHOLDS',
});

export const FORECAST_FILTER_KEYS = Object.freeze({
  PLANNING_LEVELS: 'selectedPlanningLevels',
  OWNERS: 'selectedOwners',
  PROGRAMS: 'selectedPrograms',
  TEAMS: 'selectedTeams',
  ARTS: 'selectedArts',
});

export const DEFAULT_FORECAST_SORTING = Object.freeze([]);

export const WORKSPACE_VIEWS = Object.freeze({
  FORECAST: 'forecast',
  IMPORT: 'import',
  SCENARIOS: 'scenarios',
});

const defaultSelector = (state) => state;

const createError = (code, message) => ({
  code,
  message,
});

const cloneError = (error, fallbackCode, fallbackMessage) => {
  if (
    error !== null
    && typeof error === 'object'
    && !Array.isArray(error)
  ) {
    return {
      code: typeof error.code === 'string' && error.code.trim()
        ? error.code.trim()
        : fallbackCode,
      message: typeof error.message === 'string' && error.message.trim()
        ? error.message.trim()
        : fallbackMessage,
    };
  }

  return createError(fallbackCode, fallbackMessage);
};

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const normalizeSearchTerm = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  const source = typeof value === 'string' ? value : String(value);

  return source
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

    const id = sort.id.trim().slice(0, 128);

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

const cloneSorting = (sorting) => (
  sorting.map((sort) => ({ ...sort }))
);

const normalizeWorkspaceView = (view) => (
  Object.values(WORKSPACE_VIEWS).includes(view)
    ? view
    : WORKSPACE_VIEWS.FORECAST
);

const createDefaultFilters = () => ({
  searchTerm: '',
  selectedPlanningLevels: [],
  selectedOwners: [],
  selectedPrograms: [],
  selectedTeams: [],
  selectedArts: [],
  sorting: [],
});

const readSelection = (filters, canonicalKey, aliases = []) => {
  const candidates = [
    filters?.[canonicalKey],
    ...aliases.map((alias) => filters?.[alias]),
  ];
  const value = candidates.find(Array.isArray);

  return normalizeSelections(value);
};

const normalizeFilters = (value) => {
  const filters = isRecord(value) ? value : {};
  const searchTerm = filters.searchTerm
    ?? filters.searchQuery
    ?? filters.search
    ?? filters.globalFilter
    ?? '';

  return {
    searchTerm: normalizeSearchTerm(searchTerm),
    selectedPlanningLevels: readSelection(
      filters,
      FORECAST_FILTER_KEYS.PLANNING_LEVELS,
      ['planningLevels', 'planningLevelSelections'],
    ),
    selectedOwners: readSelection(
      filters,
      FORECAST_FILTER_KEYS.OWNERS,
      ['owners', 'ownerSelections'],
    ),
    selectedPrograms: readSelection(
      filters,
      FORECAST_FILTER_KEYS.PROGRAMS,
      ['programs', 'programSelections'],
    ),
    selectedTeams: readSelection(
      filters,
      FORECAST_FILTER_KEYS.TEAMS,
      ['teams', 'teamSelections'],
    ),
    selectedArts: readSelection(
      filters,
      FORECAST_FILTER_KEYS.ARTS,
      ['arts', 'artSelections'],
    ),
    sorting: normalizeSorting(filters.sorting),
  };
};

const createFilterState = (filters = createDefaultFilters()) => ({
  searchTerm: filters.searchTerm,
  searchQuery: filters.searchTerm,
  globalFilter: filters.searchTerm,
  selectedPlanningLevels: [...filters.selectedPlanningLevels],
  selectedOwners: [...filters.selectedOwners],
  selectedPrograms: [...filters.selectedPrograms],
  selectedTeams: [...filters.selectedTeams],
  selectedArts: [...filters.selectedArts],
  sorting: cloneSorting(filters.sorting),
});

const selectPersistedFilters = (state) => ({
  searchTerm: state.searchTerm,
  selectedPlanningLevels: [...state.selectedPlanningLevels],
  selectedOwners: [...state.selectedOwners],
  selectedPrograms: [...state.selectedPrograms],
  selectedTeams: [...state.selectedTeams],
  selectedArts: [...state.selectedArts],
  sorting: cloneSorting(state.sorting),
});

const readFilters = (repository) => {
  try {
    const result = typeof repository?.getFilters === 'function'
      ? repository.getFilters()
      : repository?.getFilterPreferences?.();

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: cloneError(
          result?.error,
          FORECAST_VIEW_STORE_ERROR_CODES.FILTERS_READ_FAILED,
          'Forecast view preferences could not be read.',
        ),
      };
    }

    return {
      ok: true,
      data: result.data ?? null,
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        FORECAST_VIEW_STORE_ERROR_CODES.FILTERS_READ_FAILED,
        'Forecast view preferences could not be read.',
      ),
    };
  }
};

const readThresholds = (repository) => {
  try {
    const result = typeof repository?.getThresholds === 'function'
      ? repository.getThresholds()
      : repository?.getThresholdPreferences?.();

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: cloneError(
          result?.error,
          FORECAST_VIEW_STORE_ERROR_CODES.THRESHOLDS_READ_FAILED,
          'Capacity threshold preferences could not be read.',
        ),
      };
    }

    return {
      ok: true,
      data: result.data ?? null,
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        FORECAST_VIEW_STORE_ERROR_CODES.THRESHOLDS_READ_FAILED,
        'Capacity threshold preferences could not be read.',
      ),
    };
  }
};

const writeFilters = (repository, filters) => {
  try {
    const result = typeof repository?.saveFilters === 'function'
      ? repository.saveFilters(filters)
      : typeof repository?.saveFilterPreferences === 'function'
        ? repository.saveFilterPreferences(filters)
        : repository?.setFilters?.(filters);

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        mode: result?.mode,
        error: cloneError(
          result?.error,
          FORECAST_VIEW_STORE_ERROR_CODES.FILTERS_WRITE_FAILED,
          'Forecast view preferences could not be saved.',
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        FORECAST_VIEW_STORE_ERROR_CODES.FILTERS_WRITE_FAILED,
        'Forecast view preferences could not be saved.',
      ),
    };
  }
};

const writeThresholds = (repository, thresholds) => {
  try {
    const result = typeof repository?.saveThresholds === 'function'
      ? repository.saveThresholds(thresholds)
      : typeof repository?.saveThresholdPreferences === 'function'
        ? repository.saveThresholdPreferences(thresholds)
        : repository?.setThresholds?.(thresholds);

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        mode: result?.mode,
        error: cloneError(
          result?.error,
          FORECAST_VIEW_STORE_ERROR_CODES.THRESHOLDS_WRITE_FAILED,
          'Capacity threshold preferences could not be saved.',
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        FORECAST_VIEW_STORE_ERROR_CODES.THRESHOLDS_WRITE_FAILED,
        'Capacity threshold preferences could not be saved.',
      ),
    };
  }
};

const resolveUpdater = (updater, currentValue) => (
  typeof updater === 'function' ? updater(currentValue) : updater
);

const updatePersistenceState = (set, result) => {
  set({
    persistenceMode: result?.mode ?? null,
    persistenceError: result?.error
      ? cloneError(
        result.error,
        FORECAST_VIEW_STORE_ERROR_CODES.FILTERS_WRITE_FAILED,
        'Forecast view preferences could not be saved.',
      )
      : null,
  });
};

/**
 * Creates the central forecast view-state store.
 *
 * @param {object} repository Forecast preference repository.
 * @returns {object} Zustand vanilla store API.
 */
export const createForecastViewStore = (
  repository = preferenceRepository,
) => createStore((set, get) => ({
  ...createFilterState(),
  thresholds: createThresholds(DEFAULT_THRESHOLDS),
  workspaceView: WORKSPACE_VIEWS.FORECAST,
  isFilterPanelOpen: false,
  isFilterDialogOpen: false,
  isThresholdDialogOpen: false,
  activeDialog: null,
  isHydrating: false,
  isHydrated: false,
  persistenceMode: null,
  persistenceError: null,

  persistFilters() {
    const result = writeFilters(
      repository,
      selectPersistedFilters(get()),
    );

    updatePersistenceState(set, result);
    return result;
  },

  saveFilterPreferences() {
    return get().persistFilters();
  },

  persistThresholds() {
    const result = writeThresholds(repository, get().thresholds);

    updatePersistenceState(set, result);
    return result;
  },

  saveThresholdPreferences() {
    return get().persistThresholds();
  },

  persistPreferences() {
    const filters = get().persistFilters();
    const thresholds = get().persistThresholds();
    const response = {
      ok: Boolean(filters?.ok && thresholds?.ok),
      data: {
        filters: filters?.data ?? selectPersistedFilters(get()),
        thresholds: thresholds?.data ?? { ...get().thresholds },
      },
      filters,
      thresholds,
    };
    const error = thresholds?.error ?? filters?.error;

    if (error) {
      response.error = { ...error };
    }

    return response;
  },

  hydratePreferences() {
    set({
      isHydrating: true,
      persistenceError: null,
    });

    const filtersResult = readFilters(repository);
    const thresholdsResult = readThresholds(repository);
    const updates = {
      isHydrating: false,
      isHydrated: true,
    };

    if (filtersResult.ok) {
      // Start each session with no forecast filters applied. Selections
      // stay in memory only after the user chooses them.
      Object.assign(
        updates,
        createFilterState(createDefaultFilters()),
      );
    }

    if (thresholdsResult.ok) {
      try {
        updates.thresholds = createThresholds(
          thresholdsResult.data ?? DEFAULT_THRESHOLDS,
        );
      } catch {
        thresholdsResult.ok = false;
        thresholdsResult.error = createError(
          FORECAST_VIEW_STORE_ERROR_CODES.INVALID_THRESHOLDS,
          'Stored capacity thresholds are invalid.',
        );
      }
    }

    const error = thresholdsResult.error ?? filtersResult.error ?? null;

    updates.persistenceError = error ? { ...error } : null;
    set(updates);

    const response = {
      ok: filtersResult.ok && thresholdsResult.ok,
      data: {
        filters: selectPersistedFilters(get()),
        thresholds: { ...get().thresholds },
      },
      filters: filtersResult,
      thresholds: thresholdsResult,
    };

    if (error) {
      response.error = { ...error };
    }

    return response;
  },

  hydrate() {
    return get().hydratePreferences();
  },

  setSearchTerm(value, options = {}) {
    const searchTerm = normalizeSearchTerm(
      resolveUpdater(value, get().searchTerm),
    );

    set({
      searchTerm,
      searchQuery: searchTerm,
      globalFilter: searchTerm,
    });

    return options?.persist === false
      ? { ok: true, data: searchTerm }
      : get().persistFilters();
  },

  setSearchQuery(value, options = {}) {
    return get().setSearchTerm(value, options);
  },

  setSearch(value, options = {}) {
    return get().setSearchTerm(value, options);
  },

  setGlobalFilter(value, options = {}) {
    return get().setSearchTerm(value, options);
  },

  setSelectedPlanningLevels(value, options = {}) {
    const selectedPlanningLevels = normalizeSelections(
      resolveUpdater(value, get().selectedPlanningLevels),
    );

    set({ selectedPlanningLevels });

    return options?.persist === false
      ? { ok: true, data: [...selectedPlanningLevels] }
      : get().persistFilters();
  },

  setPlanningLevels(value, options = {}) {
    return get().setSelectedPlanningLevels(value, options);
  },

  setSelectedOwners(value, options = {}) {
    const selectedOwners = normalizeSelections(
      resolveUpdater(value, get().selectedOwners),
    );

    set({ selectedOwners });

    return options?.persist === false
      ? { ok: true, data: [...selectedOwners] }
      : get().persistFilters();
  },

  setOwners(value, options = {}) {
    return get().setSelectedOwners(value, options);
  },

  setSelectedPrograms(value, options = {}) {
    const selectedPrograms = normalizeSelections(
      resolveUpdater(value, get().selectedPrograms),
    );

    set({ selectedPrograms });

    return options?.persist === false
      ? { ok: true, data: [...selectedPrograms] }
      : get().persistFilters();
  },

  setPrograms(value, options = {}) {
    return get().setSelectedPrograms(value, options);
  },

  setSelectedTeams(value, options = {}) {
    const selectedTeams = normalizeSelections(
      resolveUpdater(value, get().selectedTeams),
    );

    set({ selectedTeams });

    return options?.persist === false
      ? { ok: true, data: [...selectedTeams] }
      : get().persistFilters();
  },

  setTeams(value, options = {}) {
    return get().setSelectedTeams(value, options);
  },

  setSelectedArts(value, options = {}) {
    const selectedArts = normalizeSelections(
      resolveUpdater(value, get().selectedArts),
    );

    set({ selectedArts });

    return options?.persist === false
      ? { ok: true, data: [...selectedArts] }
      : get().persistFilters();
  },

  setArts(value, options = {}) {
    return get().setSelectedArts(value, options);
  },

  toggleSelection(filterKey, selection, options = {}) {
    if (!Object.values(FORECAST_FILTER_KEYS).includes(filterKey)) {
      return {
        ok: false,
        data: null,
        error: createError(
          FORECAST_VIEW_STORE_ERROR_CODES.FILTERS_WRITE_FAILED,
          'The selected forecast filter is not supported.',
        ),
      };
    }

    const normalizedSelection = normalizeSelections([selection])[0];

    if (!normalizedSelection) {
      return {
        ok: true,
        data: [...get()[filterKey]],
      };
    }

    const currentSelections = get()[filterKey];
    const nextSelections = currentSelections.includes(normalizedSelection)
      ? currentSelections.filter((value) => value !== normalizedSelection)
      : [...currentSelections, normalizedSelection];

    set({ [filterKey]: nextSelections });

    return options?.persist === false
      ? { ok: true, data: [...nextSelections] }
      : get().persistFilters();
  },

  setSorting(value, options = {}) {
    const sorting = normalizeSorting(
      resolveUpdater(value, cloneSorting(get().sorting)),
    );

    set({ sorting });

    return options?.persist === false
      ? { ok: true, data: cloneSorting(sorting) }
      : get().persistFilters();
  },

  resetSorting(options = {}) {
    return get().setSorting(DEFAULT_FORECAST_SORTING, options);
  },

  setFilterPanelOpen(value) {
    const isFilterPanelOpen = typeof value === 'function'
      ? Boolean(value(get().isFilterPanelOpen))
      : Boolean(value);

    set({ isFilterPanelOpen });
  },

  toggleFilterPanel() {
    set((state) => ({
      isFilterPanelOpen: !state.isFilterPanelOpen,
    }));
  },

  setFilterDialogOpen(value) {
    const isFilterDialogOpen = typeof value === 'function'
      ? Boolean(value(get().isFilterDialogOpen))
      : Boolean(value);

    set({
      isFilterDialogOpen,
      activeDialog: isFilterDialogOpen ? 'filters' : null,
    });
  },

  openFilterDialog() {
    get().setFilterDialogOpen(true);
  },

  closeFilterDialog() {
    get().setFilterDialogOpen(false);
  },

  setThresholdDialogOpen(value) {
    const isThresholdDialogOpen = typeof value === 'function'
      ? Boolean(value(get().isThresholdDialogOpen))
      : Boolean(value);

    set({
      isThresholdDialogOpen,
      activeDialog: isThresholdDialogOpen ? 'thresholds' : null,
    });
  },

  openThresholdDialog() {
    get().setThresholdDialogOpen(true);
  },

  closeThresholdDialog() {
    get().setThresholdDialogOpen(false);
  },

  setWorkspaceView(view) {
    set({
      workspaceView: normalizeWorkspaceView(view),
    });
  },

  openImportWorkspace() {
    get().setWorkspaceView(WORKSPACE_VIEWS.IMPORT);
  },

  openScenariosWorkspace() {
    get().setWorkspaceView(WORKSPACE_VIEWS.SCENARIOS);
  },

  openForecastWorkspace() {
    get().setWorkspaceView(WORKSPACE_VIEWS.FORECAST);
  },

  closeDialogs() {
    set({
      isFilterDialogOpen: false,
      isThresholdDialogOpen: false,
      activeDialog: null,
    });
  },

  setThresholds(value, options = {}) {
    const candidate = resolveUpdater(value, { ...get().thresholds });
    let thresholds;

    try {
      thresholds = createThresholds({
        ...get().thresholds,
        ...(isRecord(candidate) ? candidate : {}),
      });
    } catch {
      const error = createError(
        FORECAST_VIEW_STORE_ERROR_CODES.INVALID_THRESHOLDS,
        'Capacity thresholds must be valid and ordered.',
      );

      set({ persistenceError: error });

      return {
        ok: false,
        data: null,
        error,
      };
    }

    set({
      thresholds,
      persistenceError: null,
    });

    return options?.persist === false
      ? { ok: true, data: { ...thresholds } }
      : get().persistThresholds();
  },

  setConstrainedThreshold(value, options = {}) {
    return get().setThresholds(
      { constrained: Number(value) },
      options,
    );
  },

  setExceededThreshold(value, options = {}) {
    return get().setThresholds(
      { exceeded: Number(value) },
      options,
    );
  },

  resetThresholds(options = {}) {
    return get().setThresholds(DEFAULT_THRESHOLDS, options);
  },

  resetFilters(options = {}) {
    set(createFilterState(createDefaultFilters()));

    return options?.persist === false
      ? { ok: true, data: selectPersistedFilters(get()) }
      : get().persistFilters();
  },

  clearFilters(options = {}) {
    return get().resetFilters(options);
  },

  resetView(options = {}) {
    set({
      ...createFilterState(createDefaultFilters()),
      thresholds: createThresholds(DEFAULT_THRESHOLDS),
      workspaceView: WORKSPACE_VIEWS.FORECAST,
      isFilterPanelOpen: false,
      isFilterDialogOpen: false,
      isThresholdDialogOpen: false,
      activeDialog: null,
      persistenceError: null,
    });

    return options?.persist === false
      ? {
        ok: true,
        data: {
          filters: selectPersistedFilters(get()),
          thresholds: { ...get().thresholds },
        },
      }
      : get().persistPreferences();
  },

  clearPersistenceError() {
    set({ persistenceError: null });
  },
}));

export const forecastViewStore = createForecastViewStore();

/**
 * Selects forecast view state from the shared Zustand store.
 *
 * @param {Function} selector Forecast view-state selector.
 * @returns {*} Selected forecast view state.
 */
export const useForecastViewStore = (selector = defaultSelector) => (
  useStore(forecastViewStore, selector)
);

export default forecastViewStore;