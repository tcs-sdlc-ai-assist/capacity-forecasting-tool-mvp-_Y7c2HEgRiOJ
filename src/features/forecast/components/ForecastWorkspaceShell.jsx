import { useState } from 'react';
import PropTypes from 'prop-types';
import ActiveFilterChips from './ActiveFilterChips.jsx';
import FilterPanel from './FilterPanel.jsx';
import ForecastMatrixTable from './ForecastMatrixTable.jsx';
import ForecastToolbar from './ForecastToolbar.jsx';
import NoDataState from './NoDataState.jsx';
import NoResultsState from './NoResultsState.jsx';
import ThresholdSettingsDialog from './ThresholdSettingsDialog.jsx';
import ImportPanel from '../../import/components/ImportPanel.jsx';
import ScenarioComparison from '../../scenarios/components/ScenarioComparison.jsx';
import ScenarioPanel from '../../scenarios/components/ScenarioPanel.jsx';
import useForecastViewModel from '../hooks/useForecastViewModel.js';
import { WORKSPACE_VIEWS } from '../store/forecastViewStore.js';
import datasetExportFacade, {
  DATASET_EXPORT_FORMATS,
} from '../../../facades/datasetExportFacade.js';

const normalizeView = (view) => (
  Object.values(WORKSPACE_VIEWS).includes(view)
    ? view
    : WORKSPACE_VIEWS.FORECAST
);

const resolveDataLabel = (metadata) => {
  if (
    metadata?.sourceType === 'mock'
    || metadata?.sourceType === 'recovered-mock'
  ) {
    return 'Demo data';
  }

  return metadata ? 'Imported data' : 'No active dataset';
};

const resolveErrorMessage = (error) => {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (
    error !== null
    && typeof error === 'object'
    && typeof error.message === 'string'
    && error.message.trim()
  ) {
    return error.message.trim();
  }

  return '';
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

const WorkspaceSubpageHeader = ({
  description,
  onBack,
  title,
}) => (
  <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-neutral-0 px-5 py-5 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:px-6">
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold text-neutral-900">
        {title}
      </h1>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">
        {description}
      </p>
    </div>

    <button
      type="button"
      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900"
      onClick={onBack}
    >
      <BackIcon />
      Back to forecast
    </button>
  </div>
);

WorkspaceSubpageHeader.propTypes = {
  description: PropTypes.string.isRequired,
  onBack: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
};

/**
 * Composes the complete forecast workspace while preserving the active
 * baseline dataset and applying scenario projections only to derived views.
 *
 * @param {{
 *   view?: 'forecast'|'import'|'scenarios',
 *   initialView?: 'forecast'|'import'|'scenarios',
 *   onViewChange?: Function,
 *   onImport?: Function,
 *   onManageScenarios?: Function,
 *   onOpenFilters?: Function,
 *   onOpenThresholds?: Function,
 *   onImportComplete?: Function,
 *   title?: string,
 *   description?: string,
 *   className?: string
 * }} props Workspace properties.
 * @returns {import('react').ReactNode} Forecast feature composition root.
 */
export const ForecastWorkspaceShell = ({
  view = undefined,
  initialView = WORKSPACE_VIEWS.FORECAST,
  onViewChange = null,
  onImport = null,
  onManageScenarios = null,
  onOpenFilters = null,
  onOpenThresholds = null,
  onImportComplete = null,
  title = 'Capacity forecast',
  description = 'Explore planned work, team allocations, and capacity across planning levels.',
  className = '',
}) => {
  const viewModel = useForecastViewModel();
  const [workspaceError, setWorkspaceError] = useState(null);
  const resolvedView = normalizeView(
    view ?? viewModel.workspaceView ?? initialView,
  );
  const dataset = viewModel.dataset;
  const baselineDataset = viewModel.baselineDataset;
  const metadata = viewModel.metadata;
  const totalCount = Array.isArray(dataset?.workItems)
    ? dataset.workItems.length
    : 0;
  const visibleCount = viewModel.rows.length;
  const dataLabel = resolveDataLabel(metadata);
  const datasetErrorMessage = resolveErrorMessage(
    viewModel.datasetError ?? viewModel.projectionError,
  );

  const changeView = async (nextView) => {
    const normalizedView = normalizeView(nextView);

    setWorkspaceError(null);

    try {
      const result = typeof onViewChange === 'function'
        ? await onViewChange(normalizedView)
        : null;

      if (result?.ok === false) {
        return result;
      }

      if (view === undefined) {
        viewModel.setWorkspaceView(normalizedView);
      }

      return result ?? {
        ok: true,
        data: normalizedView,
      };
    } catch (error) {
      const failure = {
        ok: false,
        data: null,
        error: {
          code: typeof error?.code === 'string'
            ? error.code
            : 'FORECAST_WORKSPACE_VIEW_FAILED',
          message: resolveErrorMessage(error)
            || 'The requested workspace could not be opened.',
        },
      };

      setWorkspaceError(failure.error);
      return failure;
    }
  };

  const handleOpenImport = () => (
    typeof onImport === 'function'
      ? onImport()
      : changeView(WORKSPACE_VIEWS.IMPORT)
  );

  const handleExport = () => (
    datasetExportFacade.exportDataset({
      format: DATASET_EXPORT_FORMATS.CSV,
    })
  );

  const handleOpenScenarios = () => (
    typeof onManageScenarios === 'function'
      ? onManageScenarios()
      : changeView(WORKSPACE_VIEWS.SCENARIOS)
  );

  const handleOpenFilters = () => {
    if (typeof onOpenFilters === 'function') {
      return onOpenFilters();
    }

    viewModel.toggleFilterPanel();

    return {
      ok: true,
      data: {
        open: !viewModel.isFilterPanelOpen,
      },
    };
  };

  const handleOpenThresholds = () => {
    if (typeof onOpenThresholds === 'function') {
      return onOpenThresholds();
    }

    viewModel.openThresholdDialog();

    return {
      ok: true,
      data: {
        open: true,
      },
    };
  };

  const handleImportComplete = (result) => {
    try {
      onImportComplete?.(result);
    } catch (error) {
      setWorkspaceError({
        code: typeof error?.code === 'string'
          ? error.code
          : 'FORECAST_IMPORT_CALLBACK_FAILED',
        message: resolveErrorMessage(error)
          || 'The imported dataset was activated, but the workspace could not complete its follow-up action.',
      });
    }

    if (result?.ok) {
      viewModel.resetFilters();
      changeView(WORKSPACE_VIEWS.FORECAST);
    }
  };

  const handleBackToForecast = () => {
    changeView(WORKSPACE_VIEWS.FORECAST);
  };

  const sharedError = workspaceError?.message
    ?? datasetErrorMessage;

  if (resolvedView === WORKSPACE_VIEWS.IMPORT) {
    return (
      <div className={`space-y-6 ${className}`}>
        <WorkspaceSubpageHeader
          title="Import workspace"
          description="Validate and activate a CSV or JSON dataset without sending source data outside this browser."
          onBack={handleBackToForecast}
        />

        {workspaceError ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            role="alert"
          >
            {workspaceError.message}
          </div>
        ) : null}

        <ImportPanel onImportComplete={handleImportComplete} />
      </div>
    );
  }

  if (resolvedView === WORKSPACE_VIEWS.SCENARIOS) {
    return (
      <div className={`space-y-6 ${className}`}>
        <WorkspaceSubpageHeader
          title="Scenario workspace"
          description="Explore browser-local what-if changes without modifying the active baseline dataset."
          onBack={handleBackToForecast}
        />

        {workspaceError ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            role="alert"
          >
            {workspaceError.message}
          </div>
        ) : null}

        {!viewModel.hasDataset ? (
          <NoDataState
            dataset={baselineDataset}
            isLoading={viewModel.isLoading}
            error={viewModel.datasetError}
            onImport={handleOpenImport}
            onRecover={viewModel.refreshDataset}
          />
        ) : (
          <>
            <ScenarioPanel
              scenarios={viewModel.scenarios}
              activeScenario={viewModel.activeScenario}
              dataset={baselineDataset}
              comparison={viewModel.scenarioComparison}
              isDirty={viewModel.isScenarioDirty}
              isMemoryOnly={viewModel.isScenarioMemoryOnly}
              persistenceMode={viewModel.scenarioPersistenceMode}
              error={viewModel.scenarioError}
              onCreateScenario={viewModel.createScenario}
              onSelectScenario={viewModel.selectScenario}
              onUpdateAssignment={viewModel.updateAssignment}
              onUpdateAllocation={viewModel.updateAllocation}
              onSaveScenario={viewModel.saveActiveScenario}
              onDiscardChanges={viewModel.discardScenarioChanges}
              onDiscardScenario={viewModel.removeScenario}
            />

            {viewModel.activeScenario ? (
              <ScenarioComparison
                comparison={viewModel.scenarioComparison}
                baselineTotals={viewModel.baselineTotals}
                scenarioTotals={viewModel.scenarioTotals}
                isLoading={viewModel.isScenarioHydrating}
                error={viewModel.comparisonError}
              />
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <header>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-4xl text-sm leading-6 text-neutral-600">
            {description}
          </p>
        ) : null}
      </header>

      {workspaceError ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          role="alert"
        >
          {workspaceError.message}
        </div>
      ) : null}

      {!viewModel.hasDataset ? (
        <NoDataState
          dataset={baselineDataset}
          isLoading={viewModel.isLoading}
          error={viewModel.datasetError}
          onImport={handleOpenImport}
          onRecover={viewModel.refreshDataset}
        />
      ) : (
        <>
          <ForecastToolbar
            searchTerm={viewModel.filters.searchTerm}
            onSearchChange={viewModel.setSearchTerm}
            activeFilterCount={viewModel.activeFilterCount}
            visibleCount={visibleCount}
            totalCount={totalCount}
            onOpenFilters={handleOpenFilters}
            onOpenThresholds={handleOpenThresholds}
            onManageScenarios={handleOpenScenarios}
            onImport={handleOpenImport}
            onExport={handleExport}
            isDemoData={
              metadata?.sourceType === 'mock'
              || metadata?.sourceType === 'recovered-mock'
            }
            isLocalOnly
            dataLabel={dataLabel}
            disabled={viewModel.isLoading}
          />

          {viewModel.isFilterPanelOpen ? (
            <FilterPanel
              filterOptions={viewModel.filterOptionDescriptors}
              filters={viewModel.filters}
              onPlanningLevelChange={(planningLevel) => (
                viewModel.setSelectedPlanningLevels(
                  planningLevel ? [planningLevel] : [],
                )
              )}
              onSelectedOwnersChange={viewModel.setSelectedOwners}
              onSelectedProgramsChange={viewModel.setSelectedPrograms}
              onSelectedTeamsChange={viewModel.setSelectedTeams}
              onSelectedArtsChange={viewModel.setSelectedArts}
              onResetFilters={viewModel.resetFilters}
            />
          ) : null}

          <ActiveFilterChips
            chips={viewModel.activeFilterChips}
          />

          {viewModel.activeScenario ? (
            <section
              className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-teal-950 shadow-xs"
              aria-label="Active forecast scenario"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    Scenario active: {viewModel.activeScenario.name}
                  </p>
                  <p className="mt-1 text-sm text-teal-800">
                    The matrix shows a derived scenario projection. The
                    baseline dataset remains unchanged.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-teal-300 bg-neutral-0 px-3 py-2 text-sm font-semibold text-teal-800 shadow-xs transition-colors hover:bg-teal-100"
                  onClick={handleOpenScenarios}
                >
                  Edit scenario
                </button>
              </div>
            </section>
          ) : null}

          {viewModel.hasNoResults ? (
            <NoResultsState
              dataset={dataset}
              noResultsState={viewModel.noResultsState}
              searchTerm={viewModel.filters.searchTerm}
              activeFilterCount={viewModel.activeFilterCount}
              onSearchChange={viewModel.setSearchTerm}
              onClearFilters={viewModel.resetFilters}
            />
          ) : (
            <ForecastMatrixTable
              rows={viewModel.rows}
              dynamicTeamColumns={viewModel.dynamicTeamColumns}
              sorting={viewModel.sorting}
              onSortingChange={viewModel.setSorting}
              isLoading={viewModel.isLoading}
              error={sharedError}
            />
          )}
        </>
      )}

      <ThresholdSettingsDialog
        isOpen={viewModel.isThresholdDialogOpen}
        thresholds={viewModel.thresholds}
        onSave={viewModel.setThresholds}
        onClose={viewModel.closeThresholdDialog}
        onCancel={viewModel.closeThresholdDialog}
      />
    </div>
  );
};

ForecastWorkspaceShell.propTypes = {
  view: PropTypes.oneOf(Object.values(WORKSPACE_VIEWS)),
  initialView: PropTypes.oneOf(Object.values(WORKSPACE_VIEWS)),
  onViewChange: PropTypes.func,
  onImport: PropTypes.func,
  onManageScenarios: PropTypes.func,
  onOpenFilters: PropTypes.func,
  onOpenThresholds: PropTypes.func,
  onImportComplete: PropTypes.func,
  title: PropTypes.string,
  description: PropTypes.string,
  className: PropTypes.string,
};

export default ForecastWorkspaceShell;