import {
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import ConfirmDialog from '../../../components/dialogs/ConfirmDialog.jsx';
import SearchableMultiSelect from '../../../components/forms/SearchableMultiSelect.jsx';
import {
  useScenarioStore,
} from '../store/scenarioStore.js';

const createActionError = (error, fallbackMessage) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'SCENARIO_PANEL_ACTION_FAILED',
  message: typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : fallbackMessage,
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const normalizeText = (value) => (
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
);

const normalizeTeams = (value) => (
  Array.isArray(value)
    ? [...new Set(
      value
        .map(normalizeText)
        .filter(Boolean),
    )]
    : []
);

const normalizeAllocation = (value) => {
  if (
    typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
  ) {
    return value;
  }

  if (
    typeof value === 'string'
    && value.trim()
    && Number.isFinite(Number(value))
    && Number(value) >= 0
  ) {
    return Number(value);
  }

  return null;
};

const formatNumber = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unavailable';
  }

  const rounded = Math.round(value * 10) / 10;

  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
};

const formatPoints = (value) => {
  const formatted = formatNumber(value);

  return formatted === 'Unavailable'
    ? formatted
    : `${formatted} pts`;
};

const formatPercent = (value) => {
  const formatted = formatNumber(value);

  return formatted === 'Unavailable'
    ? formatted
    : `${formatted}%`;
};

const formatDelta = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }

  const formatted = formatNumber(Math.abs(value));

  if (value > 0) {
    return `+${formatted}`;
  }

  if (value < 0) {
    return `−${formatted}`;
  }

  return '0';
};

const resolveWorkItemTeams = (workItem, scenario) => {
  const assignment = scenario?.adjustments?.assignments?.[
    workItem.recordId
  ];

  return normalizeTeams(
    Array.isArray(assignment) ? assignment : workItem.team,
  );
};

const resolveAllocation = (workItem, scenario, team) => {
  const adjustedValue = scenario?.adjustments?.allocations?.[
    workItem.recordId
  ]?.[team];

  if (adjustedValue !== undefined) {
    return normalizeAllocation(adjustedValue) ?? 0;
  }

  return normalizeAllocation(workItem.allocations?.[team]) ?? 0;
};

const createAllocationDrafts = (workItems, scenario) => (
  Object.fromEntries(
    workItems.flatMap((workItem) => (
      resolveWorkItemTeams(workItem, scenario).map((team) => [
        `${workItem.recordId}\u0000${team}`,
        String(resolveAllocation(workItem, scenario, team)),
      ])
    )),
  )
);

const resolveTeamOptions = (dataset) => {
  if (!dataset) {
    return [];
  }

  const teams = [
    ...(Array.isArray(dataset.dimensions?.teams)
      ? dataset.dimensions.teams
      : []),
    ...(Array.isArray(dataset.capacityRecords)
      ? dataset.capacityRecords.map((record) => record?.team)
      : []),
    ...(Array.isArray(dataset.workItems)
      ? dataset.workItems.flatMap((workItem) => [
        ...(Array.isArray(workItem?.team) ? workItem.team : []),
        ...(
          isRecord(workItem?.allocations)
            ? Object.keys(workItem.allocations)
            : []
        ),
      ])
      : []),
  ];

  return [...new Set(teams.map(normalizeText).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
};

const resolveScenarioCollection = (value) => (
  Array.isArray(value)
    ? value.filter((scenario) => (
      isRecord(scenario)
      && normalizeText(scenario.scenarioId)
    ))
    : []
);

const SummaryCard = ({
  baseline,
  delta,
  label,
  scenario,
  formatter,
}) => (
  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
      {label}
    </dt>
    <dd className="mt-3 grid grid-cols-2 gap-3">
      <span>
        <span className="block text-xs text-neutral-500">
          Baseline
        </span>
        <span className="mt-1 block text-lg font-semibold text-neutral-800">
          {formatter(baseline)}
        </span>
      </span>
      <span>
        <span className="block text-xs text-neutral-500">
          Scenario
        </span>
        <span className="mt-1 block text-lg font-semibold text-teal-800">
          {formatter(scenario)}
        </span>
      </span>
    </dd>
    {typeof delta === 'number' && Number.isFinite(delta) ? (
      <p className="mt-3 border-t border-neutral-200 pt-2 text-xs text-neutral-600">
        Change:{' '}
        <span className="font-semibold text-neutral-800">
          {formatDelta(delta)}
        </span>
      </p>
    ) : null}
  </div>
);

SummaryCard.propTypes = {
  baseline: PropTypes.number,
  delta: PropTypes.number,
  label: PropTypes.string.isRequired,
  scenario: PropTypes.number,
  formatter: PropTypes.func.isRequired,
};

const ScenarioStatusBadge = ({
  isDirty,
  isMemoryOnly,
  persistenceMode,
}) => {
  if (isMemoryOnly || persistenceMode === 'memory') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
        Memory only
      </span>
    );
  }

  if (isDirty) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
        Unsaved changes
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-800">
      Saved in this browser
    </span>
  );
};

ScenarioStatusBadge.propTypes = {
  isDirty: PropTypes.bool.isRequired,
  isMemoryOnly: PropTypes.bool.isRequired,
  persistenceMode: PropTypes.string,
};

/**
 * Renders the browser-local what-if scenario workflow.
 *
 * @param {{
 *   scenarios?: object[],
 *   activeScenario?: object,
 *   dataset?: object,
 *   comparison?: object,
 *   isDirty?: boolean,
 *   isMemoryOnly?: boolean,
 *   persistenceMode?: string,
 *   error?: object|string,
 *   onCreateScenario?: Function,
 *   onSelectScenario?: Function,
 *   onUpdateAssignment?: Function,
 *   onUpdateAllocation?: Function,
 *   onSaveScenario?: Function,
 *   onDiscardChanges?: Function,
 *   onDiscardScenario?: Function,
 *   title?: string,
 *   description?: string,
 *   disabled?: boolean,
 *   className?: string
 * }} props Scenario panel properties.
 * @returns {import('react').ReactNode} What-if scenario workflow.
 */
export const ScenarioPanel = ({
  scenarios = undefined,
  activeScenario = undefined,
  dataset = undefined,
  comparison = undefined,
  isDirty = undefined,
  isMemoryOnly = undefined,
  persistenceMode = undefined,
  error = undefined,
  onCreateScenario = null,
  onSelectScenario = null,
  onUpdateAssignment = null,
  onUpdateAllocation = null,
  onSaveScenario = null,
  onDiscardChanges = null,
  onDiscardScenario = null,
  title = 'What-if scenarios',
  description = 'Create a browser-local scenario to explore team assignments and allocation changes without modifying the baseline dataset.',
  disabled = false,
  className = '',
}) => {
  const generatedId = useId();
  const panelId = `scenario-panel-${generatedId.replace(/:/g, '')}`;
  const scenarioState = useScenarioStore();
  const resolvedScenarios = resolveScenarioCollection(
    scenarios ?? scenarioState.scenarios,
  );
  const resolvedActiveScenario = activeScenario
    ?? scenarioState.activeScenario
    ?? null;
  const resolvedDataset = dataset
    ?? scenarioState.baselineDataset
    ?? null;
  const resolvedComparison = comparison
    ?? scenarioState.comparison
    ?? null;
  const resolvedIsDirty = isDirty
    ?? scenarioState.isDirty
    ?? false;
  const resolvedIsMemoryOnly = isMemoryOnly
    ?? scenarioState.isMemoryOnly
    ?? false;
  const resolvedPersistenceMode = persistenceMode
    ?? scenarioState.persistenceMode
    ?? null;
  const workItems = useMemo(
    () => (
      Array.isArray(resolvedDataset?.workItems)
        ? resolvedDataset.workItems
        : []
    ),
    [resolvedDataset],
  );
  const teamOptions = useMemo(
    () => resolveTeamOptions(resolvedDataset),
    [resolvedDataset],
  );
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [allocationDrafts, setAllocationDrafts] = useState({});
  const [fieldError, setFieldError] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [scenarioPendingDiscard, setScenarioPendingDiscard] = useState(null);

  useEffect(() => {
    setAllocationDrafts(
      createAllocationDrafts(
        workItems,
        resolvedActiveScenario,
      ),
    );
  }, [resolvedActiveScenario, workItems]);

  const suppliedError = typeof error === 'string'
    ? error.trim()
    : typeof error?.message === 'string'
      ? error.message.trim()
      : '';
  const storeError = typeof scenarioState.error?.message === 'string'
    ? scenarioState.error.message
    : '';
  const displayedError = actionError?.message
    ?? suppliedError
    ?? storeError
    ?? '';
  const controlsDisabled = disabled || busyAction !== null;

  const runAction = async (
    action,
    callback,
    failureMessage,
    onSuccess = null,
  ) => {
    if (
      controlsDisabled
      || typeof callback !== 'function'
    ) {
      return null;
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
        return result;
      }

      if (typeof onSuccess === 'function') {
        onSuccess(result);
      }

      return result;
    } catch (actionFailure) {
      setActionError(createActionError(
        actionFailure,
        failureMessage,
      ));

      return {
        ok: false,
        data: null,
        error: createActionError(
          actionFailure,
          failureMessage,
        ),
      };
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateScenario = async (event) => {
    event.preventDefault();

    const name = scenarioName.trim();

    if (!name) {
      setFieldError('Enter a name for the scenario.');
      return;
    }

    setFieldError('');

    const callback = onCreateScenario
      ?? scenarioState.createScenario;

    await runAction(
      'create',
      () => callback(
        {
          name,
          description: scenarioDescription.trim(),
        },
        {
          persist: true,
        },
      ),
      'The scenario could not be created.',
      () => {
        setScenarioName('');
        setScenarioDescription('');
      },
    );
  };

  const handleScenarioSelection = async (event) => {
    const scenarioId = event.target.value;

    if (!scenarioId) {
      const clearSelection = scenarioState.clearSelection;

      await runAction(
        'select',
        () => clearSelection(),
        'The scenario selection could not be cleared.',
      );
      return;
    }

    const callback = onSelectScenario
      ?? scenarioState.selectScenario;

    await runAction(
      'select',
      () => callback(scenarioId),
      'The selected scenario could not be opened.',
    );
  };

  const handleAssignmentChange = async (workItem, teams) => {
    const selections = normalizeTeams(teams);

    if (selections.length === 0) {
      setActionError(createActionError(
        null,
        'Each work item must remain assigned to at least one team.',
      ));
      return;
    }

    const callback = onUpdateAssignment
      ?? scenarioState.updateAssignment;

    await runAction(
      `assignment:${workItem.recordId}`,
      () => callback(
        workItem.recordId,
        selections,
        {
          persist: true,
        },
      ),
      `Team assignments for ${workItem.feature} could not be updated.`,
    );
  };

  const handleAllocationChange = (
    recordId,
    team,
    value,
  ) => {
    const key = `${recordId}\u0000${team}`;

    setAllocationDrafts((currentDrafts) => ({
      ...currentDrafts,
      [key]: value,
    }));
    setActionError(null);
  };

  const handleAllocationSave = async (
    workItem,
    team,
  ) => {
    const key = `${workItem.recordId}\u0000${team}`;
    const allocation = normalizeAllocation(
      allocationDrafts[key],
    );

    if (allocation === null) {
      setActionError(createActionError(
        null,
        'Allocation points must be a finite, non-negative number.',
      ));
      return;
    }

    const callback = onUpdateAllocation
      ?? scenarioState.updateAllocation;

    await runAction(
      `allocation:${key}`,
      () => callback(
        workItem.recordId,
        team,
        allocation,
        {
          persist: true,
        },
      ),
      `The ${team} allocation for ${workItem.feature} could not be updated.`,
    );
  };

  const handleSaveScenario = async () => {
    const callback = onSaveScenario
      ?? scenarioState.saveActiveScenario;

    await runAction(
      'save',
      () => callback(resolvedActiveScenario),
      'The scenario could not be saved.',
    );
  };

  const handleDiscardChanges = async () => {
    const callback = onDiscardChanges
      ?? scenarioState.discardChanges;

    await runAction(
      'discard-changes',
      () => callback(resolvedActiveScenario),
      'The scenario changes could not be discarded.',
    );
  };

  const handleDiscardScenario = async () => {
    const scenario = scenarioPendingDiscard;

    if (!scenario) {
      return;
    }

    const callback = onDiscardScenario
      ?? scenarioState.removeScenario;
    const result = await runAction(
      'discard-scenario',
      () => callback(scenario.scenarioId, scenario),
      'The scenario could not be discarded.',
    );

    if (result?.ok !== false) {
      setScenarioPendingDiscard(null);
    }
  };

  const baselineTotals = resolvedComparison?.baseline ?? null;
  const scenarioTotals = resolvedComparison?.scenario ?? null;
  const deltaTotals = resolvedComparison?.delta ?? null;

  return (
    <section
      className={`rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm ${className}`}
      aria-labelledby={`${panelId}-title`}
      aria-busy={busyAction !== null || undefined}
    >
      <div className="border-b border-neutral-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1
              id={`${panelId}-title`}
              className="text-xl font-semibold text-neutral-900"
            >
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
                {description}
              </p>
            ) : null}
          </div>

          <span className="inline-flex shrink-0 items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
            Browser local
          </span>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {(resolvedIsMemoryOnly || resolvedPersistenceMode === 'memory') ? (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"
            role="status"
          >
            <p className="text-sm font-semibold">
              Scenario changes are available for this session only
            </p>
            <p className="mt-1 text-sm leading-5 text-amber-900">
              Browser storage is unavailable. Keep this page open to retain
              the current what-if scenario.
            </p>
          </div>
        ) : null}

        {displayedError ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            role="alert"
          >
            {displayedError}
          </div>
        ) : null}

        <form
          className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:p-5"
          onSubmit={handleCreateScenario}
        >
          <fieldset
            disabled={controlsDisabled}
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
          >
            <legend className="sr-only">Create a what-if scenario</legend>

            <div>
              <label
                htmlFor={`${panelId}-name`}
                className="block text-sm font-semibold text-neutral-800"
              >
                Scenario name
              </label>
              <input
                id={`${panelId}-name`}
                type="text"
                maxLength={256}
                className={`mt-1.5 min-h-10 w-full rounded-md border bg-neutral-0 px-3 py-2 text-sm text-neutral-900 shadow-xs placeholder:text-neutral-500 disabled:cursor-not-allowed disabled:bg-neutral-100 ${
                  fieldError
                    ? 'border-red-400'
                    : 'border-neutral-300 hover:border-neutral-400'
                }`}
                value={scenarioName}
                placeholder="Quarter-end staffing plan"
                aria-invalid={fieldError ? 'true' : undefined}
                aria-describedby={
                  fieldError ? `${panelId}-name-error` : undefined
                }
                onChange={(event) => {
                  setScenarioName(event.target.value);
                  setFieldError('');
                  setActionError(null);
                }}
              />
              {fieldError ? (
                <p
                  id={`${panelId}-name-error`}
                  className="mt-1.5 text-sm font-medium text-red-700"
                  role="alert"
                >
                  {fieldError}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor={`${panelId}-description`}
                className="block text-sm font-semibold text-neutral-800"
              >
                Description
                <span className="ml-1 font-normal text-neutral-500">
                  (optional)
                </span>
              </label>
              <input
                id={`${panelId}-description`}
                type="text"
                maxLength={512}
                className="mt-1.5 min-h-10 w-full rounded-md border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm text-neutral-900 shadow-xs placeholder:text-neutral-500 hover:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
                value={scenarioDescription}
                placeholder="Describe the planning assumptions"
                onChange={(event) => {
                  setScenarioDescription(event.target.value);
                  setActionError(null);
                }}
              />
            </div>

            <button
              type="submit"
              className="inline-flex min-h-10 items-center justify-center self-end rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'create'
                ? 'Creating…'
                : 'Create scenario'}
            </button>
          </fieldset>
        </form>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label
              htmlFor={`${panelId}-selection`}
              className="block text-sm font-semibold text-neutral-800"
            >
              Active scenario
            </label>
            <select
              id={`${panelId}-selection`}
              className="mt-1.5 min-h-10 w-full rounded-md border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm text-neutral-900 shadow-xs hover:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
              value={resolvedActiveScenario?.scenarioId ?? ''}
              disabled={controlsDisabled}
              onChange={handleScenarioSelection}
            >
              <option value="">Select a scenario</option>
              {resolvedScenarios.map((scenario) => (
                <option
                  key={scenario.scenarioId}
                  value={scenario.scenarioId}
                >
                  {scenario.name}
                </option>
              ))}
            </select>
          </div>

          {resolvedActiveScenario ? (
            <div className="flex flex-wrap items-center gap-2">
              <ScenarioStatusBadge
                isDirty={resolvedIsDirty}
                isMemoryOnly={resolvedIsMemoryOnly}
                persistenceMode={resolvedPersistenceMode}
              />

              {resolvedIsDirty ? (
                <>
                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={controlsDisabled}
                    onClick={handleDiscardChanges}
                  >
                    {busyAction === 'discard-changes'
                      ? 'Discarding…'
                      : 'Discard changes'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={controlsDisabled}
                    onClick={handleSaveScenario}
                  >
                    {busyAction === 'save'
                      ? 'Saving…'
                      : 'Save scenario'}
                  </button>
                </>
              ) : null}

              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-red-300 bg-neutral-0 px-3 py-2 text-sm font-semibold text-red-700 shadow-xs transition-colors hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={controlsDisabled}
                onClick={() => {
                  setScenarioPendingDiscard(resolvedActiveScenario);
                }}
              >
                Discard scenario
              </button>
            </div>
          ) : null}
        </div>

        {resolvedActiveScenario ? (
          <>
            <section
              className="rounded-lg border border-neutral-200"
              aria-labelledby={`${panelId}-summary-title`}
            >
              <div className="border-b border-neutral-200 px-4 py-4 sm:px-5">
                <h2
                  id={`${panelId}-summary-title`}
                  className="text-base font-semibold text-neutral-900"
                >
                  Baseline versus scenario
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Compare aggregate planning totals after applying the current
                  scenario.
                </p>
              </div>

              {baselineTotals && scenarioTotals ? (
                <dl className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
                  <SummaryCard
                    label="Estimated points"
                    baseline={baselineTotals.estimatedPoints}
                    scenario={scenarioTotals.estimatedPoints}
                    delta={deltaTotals?.estimatedPoints}
                    formatter={formatPoints}
                  />
                  <SummaryCard
                    label="Allocated points"
                    baseline={baselineTotals.allocatedPoints}
                    scenario={scenarioTotals.allocatedPoints}
                    delta={deltaTotals?.allocatedPoints}
                    formatter={formatPoints}
                  />
                  <SummaryCard
                    label="Effective capacity"
                    baseline={baselineTotals.effectiveCapacityPoints}
                    scenario={scenarioTotals.effectiveCapacityPoints}
                    delta={deltaTotals?.effectiveCapacityPoints}
                    formatter={formatPoints}
                  />
                  <SummaryCard
                    label="Utilization"
                    baseline={baselineTotals.utilizationPercent}
                    scenario={scenarioTotals.utilizationPercent}
                    formatter={formatPercent}
                  />
                </dl>
              ) : (
                <p className="px-4 py-6 text-sm text-neutral-600 sm:px-5">
                  Comparison totals are unavailable for this scenario.
                </p>
              )}
            </section>

            <section
              className="rounded-lg border border-neutral-200"
              aria-labelledby={`${panelId}-work-items-title`}
            >
              <div className="border-b border-neutral-200 px-4 py-4 sm:px-5">
                <h2
                  id={`${panelId}-work-items-title`}
                  className="text-base font-semibold text-neutral-900"
                >
                  Work-item assignments and allocations
                </h2>
                <p className="mt-1 text-sm leading-5 text-neutral-600">
                  Assignment and allocation changes apply only to the active
                  scenario.
                </p>
              </div>

              {workItems.length > 0 ? (
                <ul className="divide-y divide-neutral-200">
                  {workItems.map((workItem) => {
                    const assignedTeams = resolveWorkItemTeams(
                      workItem,
                      resolvedActiveScenario,
                    );
                    const assignmentBusy = busyAction
                      === `assignment:${workItem.recordId}`;

                    return (
                      <li
                        key={workItem.recordId}
                        className="space-y-4 px-4 py-5 sm:px-5"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-neutral-900">
                              {workItem.feature}
                            </h3>
                            <p className="mt-1 text-xs text-neutral-600">
                              {[
                                workItem.itemId,
                                workItem.program,
                                workItem.planningLevel,
                              ].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                            {formatPoints(workItem.estimatedPoints)}
                            {' estimated'}
                          </span>
                        </div>

                        <SearchableMultiSelect
                          id={`${panelId}-teams-${workItem.recordId}`}
                          label="Assigned teams"
                          options={teamOptions}
                          value={assignedTeams}
                          onChange={(teams) => {
                            handleAssignmentChange(workItem, teams);
                          }}
                          placeholder="Select assigned teams"
                          searchPlaceholder="Search teams"
                          helperText="At least one team is required."
                          disabled={controlsDisabled}
                          required
                        />

                        <div>
                          <p className="text-sm font-semibold text-neutral-800">
                            Team allocations
                          </p>

                          <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {assignedTeams.map((team) => {
                              const allocationKey = (
                                `${workItem.recordId}\u0000${team}`
                              );
                              const allocationBusy = busyAction
                                === `allocation:${allocationKey}`;
                              const inputId = (
                                `${panelId}-allocation-${workItem.recordId}-${team}`
                              ).replace(/[^A-Za-z0-9_-]/g, '-');

                              return (
                                <div
                                  key={team}
                                  className="rounded-md border border-neutral-200 bg-neutral-50 p-3"
                                >
                                  <label
                                    htmlFor={inputId}
                                    className="block truncate text-xs font-semibold text-neutral-700"
                                    title={team}
                                  >
                                    {team}
                                  </label>

                                  <div className="mt-1.5 flex gap-2">
                                    <div className="relative min-w-0 flex-1">
                                      <input
                                        id={inputId}
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        inputMode="decimal"
                                        className="min-h-10 w-full rounded-md border border-neutral-300 bg-neutral-0 px-3 py-2 pr-12 text-sm text-neutral-900 shadow-xs hover:border-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100"
                                        value={
                                          allocationDrafts[
                                            allocationKey
                                          ] ?? ''
                                        }
                                        disabled={controlsDisabled}
                                        onChange={(event) => {
                                          handleAllocationChange(
                                            workItem.recordId,
                                            team,
                                            event.target.value,
                                          );
                                        }}
                                      />
                                      <span
                                        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-neutral-500"
                                        aria-hidden="true"
                                      >
                                        pts
                                      </span>
                                    </div>

                                    <button
                                      type="button"
                                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-teal-700 bg-neutral-0 px-3 py-2 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      disabled={controlsDisabled}
                                      onClick={() => {
                                        handleAllocationSave(
                                          workItem,
                                          team,
                                        );
                                      }}
                                    >
                                      {allocationBusy
                                        ? 'Saving…'
                                        : 'Apply'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {assignmentBusy ? (
                            <p
                              className="mt-2 text-xs font-medium text-teal-700"
                              role="status"
                            >
                              Updating team assignments…
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-neutral-600 sm:px-5">
                  The baseline dataset does not contain any editable work
                  items.
                </p>
              )}
            </section>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-5 py-10 text-center">
            <h2 className="text-base font-semibold text-neutral-900">
              No scenario selected
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-neutral-600">
              Create a scenario or select an existing browser-local scenario
              to edit assignments, allocations, and compare planning totals.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(scenarioPendingDiscard)}
        title="Discard this scenario?"
        description="This permanently removes the scenario and its what-if changes from this browser."
        confirmLabel={
          busyAction === 'discard-scenario'
            ? 'Discarding scenario…'
            : 'Discard scenario'
        }
        cancelLabel="Keep scenario"
        destructive
        isLoading={busyAction === 'discard-scenario'}
        closeOnBackdropClick={busyAction !== 'discard-scenario'}
        closeOnEscape={busyAction !== 'discard-scenario'}
        onCancel={() => {
          if (busyAction !== 'discard-scenario') {
            setScenarioPendingDiscard(null);
          }
        }}
        onConfirm={handleDiscardScenario}
      >
        {scenarioPendingDiscard ? (
          <p>
            <span className="font-semibold text-neutral-900">
              {scenarioPendingDiscard.name}
            </span>
            {' '}cannot be recovered after it is discarded.
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
};

ScenarioPanel.propTypes = {
  scenarios: PropTypes.arrayOf(
    PropTypes.shape({
      scenarioId: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      description: PropTypes.string,
      adjustments: PropTypes.object,
    }),
  ),
  activeScenario: PropTypes.shape({
    scenarioId: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    adjustments: PropTypes.object,
  }),
  dataset: PropTypes.shape({
    dimensions: PropTypes.shape({
      teams: PropTypes.arrayOf(PropTypes.string),
    }),
    workItems: PropTypes.arrayOf(PropTypes.object),
    capacityRecords: PropTypes.arrayOf(PropTypes.object),
  }),
  comparison: PropTypes.shape({
    baseline: PropTypes.object,
    scenario: PropTypes.object,
    delta: PropTypes.object,
  }),
  isDirty: PropTypes.bool,
  isMemoryOnly: PropTypes.bool,
  persistenceMode: PropTypes.string,
  error: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      code: PropTypes.string,
      message: PropTypes.string,
    }),
  ]),
  onCreateScenario: PropTypes.func,
  onSelectScenario: PropTypes.func,
  onUpdateAssignment: PropTypes.func,
  onUpdateAllocation: PropTypes.func,
  onSaveScenario: PropTypes.func,
  onDiscardChanges: PropTypes.func,
  onDiscardScenario: PropTypes.func,
  title: PropTypes.string,
  description: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default ScenarioPanel;