import {
  useCallback,
  useMemo,
} from 'react';
import { useDataset } from '../../../hooks/useDataset.js';
import scenarioService from '../../../services/scenarioService.js';
import {
  createCapacitySelectors,
} from '../selectors/capacitySelectors.js';
import {
  createDatasetSelectors,
} from '../selectors/datasetSelectors.js';
import {
  useForecastViewStore,
} from '../store/forecastViewStore.js';
import {
  useScenarioStore,
} from '../../scenarios/store/scenarioStore.js';

const createProjectionError = (error) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'FORECAST_SCENARIO_PROJECTION_FAILED',
  message: typeof error?.message === 'string'
    ? error.message
    : 'The active scenario could not be applied to the forecast dataset.',
});

const projectScenario = (dataset, scenario) => {
  if (!dataset) {
    return {
      dataset: null,
      error: null,
    };
  }

  if (!scenario) {
    return {
      dataset,
      error: null,
    };
  }

  try {
    const result = scenarioService.applyScenario(dataset, scenario);

    if (!result?.ok || !result.data) {
      return {
        dataset,
        error: createProjectionError(result?.error),
      };
    }

    return {
      dataset: result.data,
      error: null,
    };
  } catch {
    return {
      dataset,
      error: createProjectionError(null),
    };
  }
};

/**
 * Composes the active dataset, forecast preferences, scenario projection, and
 * forecast selectors into a memoized workspace view model.
 *
 * @returns {object} Forecast workspace state, derived data, and actions.
 */
export const useForecastViewModel = () => {
  const {
    dataset: activeDataset,
    metadata,
    status: datasetStatus,
    error: datasetError,
    revision: datasetRevision,
    hasDataset,
    isLoading: isDatasetLoading,
    isReady: isDatasetReady,
    isEmpty: isDatasetEmpty,
    isFailed: isDatasetFailed,
    refresh: refreshDataset,
  } = useDataset();
  const forecastState = useForecastViewStore();
  const scenarioState = useScenarioStore();
  const datasetSelectors = useMemo(
    () => createDatasetSelectors(),
    [],
  );
  const capacitySelectors = useMemo(
    () => createCapacitySelectors(),
    [],
  );

  const filters = useMemo(() => ({
    searchTerm: forecastState.searchTerm,
    selectedPlanningLevels: forecastState.selectedPlanningLevels,
    selectedOwners: forecastState.selectedOwners,
    selectedPrograms: forecastState.selectedPrograms,
    selectedTeams: forecastState.selectedTeams,
    selectedArts: forecastState.selectedArts,
    sorting: forecastState.sorting,
  }), [
    forecastState.searchTerm,
    forecastState.selectedPlanningLevels,
    forecastState.selectedOwners,
    forecastState.selectedPrograms,
    forecastState.selectedTeams,
    forecastState.selectedArts,
    forecastState.sorting,
  ]);

  const projection = useMemo(
    () => projectScenario(
      activeDataset,
      scenarioState.activeScenario,
    ),
    [activeDataset, scenarioState.activeScenario],
  );
  const projectedDataset = projection.dataset;

  const filterOptions = useMemo(
    () => datasetSelectors.selectFilterOptions(projectedDataset),
    [datasetSelectors, projectedDataset],
  );
  const filterOptionDescriptors = useMemo(
    () => datasetSelectors.selectFilterOptionDescriptors(
      projectedDataset,
    ),
    [datasetSelectors, projectedDataset],
  );
  const dynamicTeamColumns = useMemo(
    () => datasetSelectors.selectDynamicTeamColumns(projectedDataset),
    [datasetSelectors, projectedDataset],
  );
  const visibleWorkItems = useMemo(
    () => datasetSelectors.selectVisibleWorkItems(
      projectedDataset,
      filters,
      filters.sorting,
    ),
    [datasetSelectors, projectedDataset, filters],
  );
  const activeFilterChips = useMemo(
    () => datasetSelectors.selectActiveFilterChips(filters),
    [datasetSelectors, filters],
  );
  const noResultsState = useMemo(
    () => datasetSelectors.selectNoResultsState(
      projectedDataset,
      filters,
    ),
    [datasetSelectors, projectedDataset, filters],
  );
  const capacityAnalytics = useMemo(
    () => capacitySelectors.selectCapacityAnalytics(
      projectedDataset,
      filters,
      filters.sorting,
      {
        thresholds: forecastState.thresholds,
      },
    ),
    [
      capacitySelectors,
      projectedDataset,
      filters,
      forecastState.thresholds,
    ],
  );

  const getCapacityDetail = useCallback(
    (planningLevel, team) => (
      capacitySelectors.selectCapacityDetailPayload(
        projectedDataset,
        {
          planningLevel,
          team,
          filters,
          sorting: filters.sorting,
          thresholds: forecastState.thresholds,
        },
      )
    ),
    [
      capacitySelectors,
      projectedDataset,
      filters,
      forecastState.thresholds,
    ],
  );

  const forecastActions = useMemo(() => ({
    hydratePreferences: forecastState.hydratePreferences,
    persistPreferences: forecastState.persistPreferences,
    persistFilters: forecastState.persistFilters,
    persistThresholds: forecastState.persistThresholds,
    setSearchTerm: forecastState.setSearchTerm,
    setSearchQuery: forecastState.setSearchQuery,
    setGlobalFilter: forecastState.setGlobalFilter,
    setSelectedPlanningLevels: (
      forecastState.setSelectedPlanningLevels
    ),
    setSelectedOwners: forecastState.setSelectedOwners,
    setSelectedPrograms: forecastState.setSelectedPrograms,
    setSelectedTeams: forecastState.setSelectedTeams,
    setSelectedArts: forecastState.setSelectedArts,
    toggleSelection: forecastState.toggleSelection,
    setSorting: forecastState.setSorting,
    resetSorting: forecastState.resetSorting,
    resetFilters: forecastState.resetFilters,
    clearFilters: forecastState.clearFilters,
    setThresholds: forecastState.setThresholds,
    setConstrainedThreshold: forecastState.setConstrainedThreshold,
    setExceededThreshold: forecastState.setExceededThreshold,
    resetThresholds: forecastState.resetThresholds,
    resetView: forecastState.resetView,
    setFilterPanelOpen: forecastState.setFilterPanelOpen,
    toggleFilterPanel: forecastState.toggleFilterPanel,
    openFilterDialog: forecastState.openFilterDialog,
    closeFilterDialog: forecastState.closeFilterDialog,
    openThresholdDialog: forecastState.openThresholdDialog,
    closeThresholdDialog: forecastState.closeThresholdDialog,
    setWorkspaceView: forecastState.setWorkspaceView,
    openImportWorkspace: forecastState.openImportWorkspace,
    openScenariosWorkspace: forecastState.openScenariosWorkspace,
    openForecastWorkspace: forecastState.openForecastWorkspace,
    closeDialogs: forecastState.closeDialogs,
    clearPersistenceError: forecastState.clearPersistenceError,
  }), [forecastState]);

  const scenarioActions = useMemo(() => ({
    hydrateScenarios: scenarioState.hydrateScenarios,
    createScenario: scenarioState.createScenario,
    addScenario: scenarioState.addScenario,
    selectScenario: scenarioState.selectScenario,
    setActiveScenario: scenarioState.setActiveScenario,
    clearScenarioSelection: scenarioState.clearSelection,
    updateAllocation: scenarioState.updateAllocation,
    setAllocation: scenarioState.setAllocation,
    updateAssignment: scenarioState.updateAssignment,
    updateAssignments: scenarioState.updateAssignments,
    assignTeams: scenarioState.assignTeams,
    saveActiveScenario: scenarioState.saveActiveScenario,
    persistActiveScenario: scenarioState.persistActiveScenario,
    discardScenarioChanges: scenarioState.discardChanges,
    removeScenario: scenarioState.removeScenario,
    deleteScenario: scenarioState.deleteScenario,
    refreshScenarioComparison: scenarioState.refreshComparison,
    clearScenarioError: scenarioState.clearError,
  }), [scenarioState]);

  const actions = useMemo(() => ({
    refreshDataset,
    getCapacityDetail,
    ...forecastActions,
    ...scenarioActions,
  }), [
    refreshDataset,
    getCapacityDetail,
    forecastActions,
    scenarioActions,
  ]);

  return useMemo(() => {
    const workspaceError = datasetError
      ?? projection.error
      ?? forecastState.persistenceError
      ?? scenarioState.error
      ?? scenarioState.comparisonError
      ?? null;
    const isScenarioActive = Boolean(scenarioState.activeScenario);
    const activeFilterCount = activeFilterChips.length;
    const hasActiveSearch = filters.searchTerm.trim().length > 0;
    const hasActiveFilters = activeFilterCount > 0;

    return {
      dataset: projectedDataset,
      activeDataset: projectedDataset,
      projectedDataset,
      baselineDataset: activeDataset,
      metadata,
      datasetMetadata: metadata,
      datasetStatus,
      datasetRevision,
      datasetError,
      projectionError: projection.error,
      error: workspaceError,
      hasDataset,
      isLoading: isDatasetLoading,
      isReady: isDatasetReady,
      isEmpty: isDatasetEmpty,
      isFailed: isDatasetFailed,

      filters,
      sorting: filters.sorting,
      thresholds: forecastState.thresholds,
      filterOptions,
      options: filterOptions,
      filterOptionDescriptors,
      dynamicTeamColumns,
      teamColumns: dynamicTeamColumns,
      allocationColumns: dynamicTeamColumns,
      activeFilterChips,
      activeFilters: activeFilterChips,
      activeFilterCount,
      hasActiveFilters,
      hasActiveSearch,
      hasActiveCriteria: hasActiveFilters || hasActiveSearch,
      noResultsState,
      hasNoResults: noResultsState.isNoResults,

      visibleWorkItems,
      visibleRows: capacityAnalytics.rows,
      forecastRows: capacityAnalytics.rows,
      rows: capacityAnalytics.rows,
      capacityRows: capacityAnalytics.rows,
      capacityCells: capacityAnalytics.cells,
      cells: capacityAnalytics.cells,
      capacityAnalytics,
      capacitySummary: capacityAnalytics.summary,
      summary: capacityAnalytics.summary,
      totals: capacityAnalytics.totals,
      getCapacityDetail,

      scenarios: scenarioState.scenarios,
      activeScenario: scenarioState.activeScenario,
      selectedScenario: scenarioState.selectedScenario,
      selectedScenarioId: scenarioState.selectedScenarioId,
      persistedScenario: scenarioState.persistedScenario,
      isScenarioActive,
      isScenarioDirty: scenarioState.isDirty,
      hasUnsavedScenarioChanges: scenarioState.hasUnsavedChanges,
      scenarioStatus: scenarioState.status,
      isScenarioHydrating: scenarioState.isHydrating,
      isScenarioHydrated: scenarioState.isHydrated,
      isScenarioMemoryOnly: scenarioState.isMemoryOnly,
      scenarioPersistenceMode: scenarioState.persistenceMode,
      scenarioPersistenceError: scenarioState.persistenceError,
      scenarioWarnings: scenarioState.warnings,
      scenarioError: scenarioState.error,
      comparison: scenarioState.comparison,
      scenarioComparison: scenarioState.comparison,
      baselineTotals: scenarioState.baselineTotals,
      scenarioTotals: scenarioState.scenarioTotals,
      comparisonError: scenarioState.comparisonError,

      isFilterPanelOpen: forecastState.isFilterPanelOpen,
      isFilterDialogOpen: forecastState.isFilterDialogOpen,
      isThresholdDialogOpen: forecastState.isThresholdDialogOpen,
      workspaceView: forecastState.workspaceView,
      activeDialog: forecastState.activeDialog,
      isHydratingPreferences: forecastState.isHydrating,
      arePreferencesHydrated: forecastState.isHydrated,
      preferencePersistenceMode: forecastState.persistenceMode,
      preferencePersistenceError: forecastState.persistenceError,

      actions,
      forecastActions,
      scenarioActions,
      ...actions,
    };
  }, [
    activeDataset,
    activeFilterChips,
    actions,
    capacityAnalytics,
    datasetError,
    datasetRevision,
    datasetStatus,
    dynamicTeamColumns,
    filterOptionDescriptors,
    filterOptions,
    filters,
    forecastActions,
    forecastState,
    hasDataset,
    isDatasetEmpty,
    isDatasetFailed,
    isDatasetLoading,
    isDatasetReady,
    metadata,
    noResultsState,
    projectedDataset,
    projection.error,
    scenarioActions,
    scenarioState,
    visibleWorkItems,
    getCapacityDetail,
  ]);
};

export default useForecastViewModel;