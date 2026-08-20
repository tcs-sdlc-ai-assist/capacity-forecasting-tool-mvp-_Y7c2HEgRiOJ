import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import datasetAccessFacade from '../../../facades/datasetAccessFacade.js';
import {
  createScenario as createCanonicalScenario,
  isNormalizedDataset,
  isScenario,
} from '../../../domain/schemas.js';
import scenarioRepository from '../../../repositories/scenarioRepository.js';
import scenarioService from '../../../services/scenarioService.js';

export const SCENARIO_STORE_ERROR_CODES = Object.freeze({
  BASELINE_UNAVAILABLE: 'SCENARIO_STORE_BASELINE_UNAVAILABLE',
  HYDRATION_FAILED: 'SCENARIO_STORE_HYDRATION_FAILED',
  INVALID_SCENARIO: 'SCENARIO_STORE_INVALID_SCENARIO',
  SCENARIO_NOT_FOUND: 'SCENARIO_STORE_SCENARIO_NOT_FOUND',
  CREATE_FAILED: 'SCENARIO_STORE_CREATE_FAILED',
  UPDATE_FAILED: 'SCENARIO_STORE_UPDATE_FAILED',
  DISCARD_FAILED: 'SCENARIO_STORE_DISCARD_FAILED',
  REMOVE_FAILED: 'SCENARIO_STORE_REMOVE_FAILED',
  COMPARISON_FAILED: 'SCENARIO_STORE_COMPARISON_FAILED',
});

export const SCENARIO_STORE_STATUSES = Object.freeze({
  IDLE: 'idle',
  HYDRATING: 'hydrating',
  READY: 'ready',
  EMPTY: 'empty',
  FAILED: 'failed',
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

const cloneScenario = (scenario) => createCanonicalScenario(scenario);

const cloneScenarios = (scenarios) => (
  Array.isArray(scenarios)
    ? scenarios.filter(isScenario).map(cloneScenario)
    : []
);

const cloneWarnings = (warnings) => (
  Array.isArray(warnings)
    ? warnings
      .filter((warning) => (
        warning !== null
        && typeof warning === 'object'
        && !Array.isArray(warning)
      ))
      .map((warning) => ({ ...warning }))
    : []
);

const normalizeDatasetId = (value) => (
  typeof value === 'string' ? value.trim() : ''
);

const resolveDatasetSnapshot = (source) => {
  if (
    source === null
    || source === undefined
  ) {
    return {
      dataset: null,
      metadata: null,
    };
  }

  if (isNormalizedDataset(source)) {
    return {
      dataset: source,
      metadata: null,
    };
  }

  const data = source?.data
    && typeof source.data === 'object'
    && !Array.isArray(source.data)
    ? source.data
    : source;
  const dataset = data?.dataset
    ?? data?.activeDataset
    ?? data?.content
    ?? null;
  const metadata = data?.metadata
    ?? data?.datasetMetadata
    ?? data?.activeDatasetMetadata
    ?? null;

  return {
    dataset: isNormalizedDataset(dataset) ? dataset : null,
    metadata: metadata
      && typeof metadata === 'object'
      && !Array.isArray(metadata)
      ? metadata
      : null,
  };
};

const readDatasetSnapshot = (facade) => {
  try {
    if (typeof facade?.getSnapshot === 'function') {
      return resolveDatasetSnapshot(facade.getSnapshot());
    }

    return resolveDatasetSnapshot({
      dataset: facade?.getActiveDataset?.(),
      metadata: facade?.getActiveDatasetMetadata?.(),
    });
  } catch {
    return {
      dataset: null,
      metadata: null,
    };
  }
};

const readScenarios = (repository, datasetId) => {
  try {
    let result;

    if (typeof repository?.getScenarios === 'function') {
      result = repository.getScenarios(datasetId);
    } else if (typeof repository?.getAll === 'function') {
      result = repository.getAll(datasetId);
    } else {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_STORE_ERROR_CODES.HYDRATION_FAILED,
          'Saved scenarios are unavailable.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: cloneError(
          result?.error,
          SCENARIO_STORE_ERROR_CODES.HYDRATION_FAILED,
          'Saved scenarios could not be loaded.',
        ),
      };
    }

    return {
      ok: true,
      data: cloneScenarios(result.data),
      mode: result.mode,
      error: result.error,
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        SCENARIO_STORE_ERROR_CODES.HYDRATION_FAILED,
        'Saved scenarios could not be loaded.',
      ),
    };
  }
};

const removeScenario = (repository, scenarioId, datasetId) => {
  try {
    let result;

    if (typeof repository?.removeScenario === 'function') {
      result = repository.removeScenario(scenarioId, datasetId);
    } else if (typeof repository?.remove === 'function') {
      result = repository.remove(scenarioId, datasetId);
    } else {
      return {
        ok: false,
        removed: false,
        error: createError(
          SCENARIO_STORE_ERROR_CODES.REMOVE_FAILED,
          'Saved scenario removal is unavailable.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        removed: false,
        error: cloneError(
          result?.error,
          SCENARIO_STORE_ERROR_CODES.REMOVE_FAILED,
          'The saved scenario could not be removed.',
        ),
      };
    }

    return {
      ...result,
      ok: true,
      removed: Boolean(result.removed),
    };
  } catch {
    return {
      ok: false,
      removed: false,
      error: createError(
        SCENARIO_STORE_ERROR_CODES.REMOVE_FAILED,
        'The saved scenario could not be removed.',
      ),
    };
  }
};

const invokeCreateScenario = (
  service,
  request,
  datasetId,
  persist,
) => {
  try {
    if (typeof service?.createScenario !== 'function') {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_STORE_ERROR_CODES.CREATE_FAILED,
          'Scenario creation is unavailable.',
        ),
        warnings: [],
      };
    }

    return service.createScenario(request, {
      datasetId,
      persist,
    });
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        SCENARIO_STORE_ERROR_CODES.CREATE_FAILED,
        'The scenario could not be created.',
      ),
      warnings: [],
    };
  }
};

const invokeAllocationUpdate = (
  service,
  scenario,
  recordId,
  team,
  points,
  options,
) => {
  try {
    const update = typeof service?.updateAllocation === 'function'
      ? service.updateAllocation.bind(service)
      : service?.setAllocation?.bind(service);

    if (!update) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_STORE_ERROR_CODES.UPDATE_FAILED,
          'Scenario allocation editing is unavailable.',
        ),
        warnings: [],
      };
    }

    return update(
      scenario,
      recordId,
      team,
      points,
      options,
    );
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        SCENARIO_STORE_ERROR_CODES.UPDATE_FAILED,
        'The scenario allocation could not be updated.',
      ),
      warnings: [],
    };
  }
};

const invokeAssignmentUpdate = (
  service,
  scenario,
  recordId,
  teams,
  options,
) => {
  try {
    const update = typeof service?.updateAssignment === 'function'
      ? service.updateAssignment.bind(service)
      : typeof service?.updateAssignments === 'function'
        ? service.updateAssignments.bind(service)
        : service?.assignTeams?.bind(service);

    if (!update) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_STORE_ERROR_CODES.UPDATE_FAILED,
          'Scenario assignment editing is unavailable.',
        ),
        warnings: [],
      };
    }

    return update(
      scenario,
      recordId,
      teams,
      options,
    );
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        SCENARIO_STORE_ERROR_CODES.UPDATE_FAILED,
        'The scenario assignment could not be updated.',
      ),
      warnings: [],
    };
  }
};

const invokePersistScenario = (
  service,
  repository,
  scenario,
  datasetId,
) => {
  try {
    if (typeof service?.persistScenario === 'function') {
      return service.persistScenario(scenario, datasetId);
    }

    if (typeof service?.saveScenario === 'function') {
      return service.saveScenario(scenario, datasetId);
    }

    if (typeof repository?.saveScenario === 'function') {
      return repository.saveScenario(scenario, datasetId);
    }

    if (typeof repository?.save === 'function') {
      return repository.save(scenario, datasetId);
    }

    return {
      ok: false,
      data: null,
      error: createError(
        SCENARIO_STORE_ERROR_CODES.UPDATE_FAILED,
        'Scenario persistence is unavailable.',
      ),
      warnings: [],
    };
  } catch {
    return {
      ok: false,
      data: null,
      error: createError(
        SCENARIO_STORE_ERROR_CODES.UPDATE_FAILED,
        'The scenario could not be saved.',
      ),
      warnings: [],
    };
  }
};

const calculateComparison = (service, dataset, scenario) => {
  if (!dataset || !scenario) {
    return {
      comparison: null,
      baselineTotals: null,
      scenarioTotals: null,
      error: null,
    };
  }

  try {
    const comparisonResult = typeof service?.calculateComparison === 'function'
      ? service.calculateComparison(dataset, scenario)
      : service?.calculateBaselineAndScenarioTotals?.(dataset, scenario);

    if (!comparisonResult?.ok) {
      return {
        comparison: null,
        baselineTotals: null,
        scenarioTotals: null,
        error: cloneError(
          comparisonResult?.error,
          SCENARIO_STORE_ERROR_CODES.COMPARISON_FAILED,
          'Scenario comparison totals could not be calculated.',
        ),
      };
    }

    return {
      comparison: comparisonResult.data ?? null,
      baselineTotals: comparisonResult.data?.baseline ?? null,
      scenarioTotals: comparisonResult.data?.scenario ?? null,
      error: null,
    };
  } catch {
    return {
      comparison: null,
      baselineTotals: null,
      scenarioTotals: null,
      error: createError(
        SCENARIO_STORE_ERROR_CODES.COMPARISON_FAILED,
        'Scenario comparison totals could not be calculated.',
      ),
    };
  }
};

const createSelectionState = (
  scenario,
  persistedScenario,
  dataset,
  service,
) => {
  const activeScenario = scenario ? cloneScenario(scenario) : null;
  const savedScenario = persistedScenario
    ? cloneScenario(persistedScenario)
    : null;
  const comparisonState = calculateComparison(
    service,
    dataset,
    activeScenario,
  );

  return {
    activeScenario,
    selectedScenario: activeScenario,
    selectedScenarioId: activeScenario?.scenarioId ?? null,
    draftScenario: activeScenario,
    persistedScenario: savedScenario,
    comparison: comparisonState.comparison,
    comparisonState: comparisonState.comparison,
    baselineTotals: comparisonState.baselineTotals,
    scenarioTotals: comparisonState.scenarioTotals,
    comparisonError: comparisonState.error,
  };
};

const createEmptySelectionState = () => ({
  activeScenario: null,
  selectedScenario: null,
  selectedScenarioId: null,
  draftScenario: null,
  persistedScenario: null,
  comparison: null,
  comparisonState: null,
  baselineTotals: null,
  scenarioTotals: null,
  comparisonError: null,
});

const resolveMemoryOnly = (result, currentValue = false) => (
  currentValue
  || result?.mode === 'memory'
  || (
    Array.isArray(result?.warnings)
    && result.warnings.some((warning) => (
      warning?.code === 'SCENARIO_MEMORY_ONLY'
    ))
  )
);

const createInitialState = (facade) => {
  const snapshot = readDatasetSnapshot(facade);
  const datasetId = normalizeDatasetId(snapshot.metadata?.datasetId);

  return {
    baselineDataset: snapshot.dataset,
    dataset: snapshot.dataset,
    baselineMetadata: snapshot.metadata,
    datasetMetadata: snapshot.metadata,
    baselineDatasetId: datasetId || null,
    datasetId: datasetId || null,
    scenarios: [],
    ...createEmptySelectionState(),
    status: SCENARIO_STORE_STATUSES.IDLE,
    isHydrating: false,
    isHydrated: false,
    isDirty: false,
    hasUnsavedChanges: false,
    isMemoryOnly: false,
    memoryOnly: false,
    persistenceMode: null,
    persistenceError: null,
    warnings: [],
    error: null,
  };
};

/**
 * Creates the central scenario feature state store.
 *
 * @param {object} repository Dataset-scoped scenario repository.
 * @param {object} service Scenario domain service.
 * @param {object} activeDatasetFacade Active dataset facade.
 * @returns {object} Zustand vanilla store API.
 */
export const createScenarioStore = (
  repository = scenarioRepository,
  service = scenarioService,
  activeDatasetFacade = datasetAccessFacade,
) => {
  const store = createStore((set, get) => ({
    ...createInitialState(activeDatasetFacade),

    hydrateScenarios(source) {
      const suppliedSnapshot = source === undefined
        ? readDatasetSnapshot(activeDatasetFacade)
        : resolveDatasetSnapshot(source);
      const dataset = suppliedSnapshot.dataset ?? get().baselineDataset;
      const metadata = suppliedSnapshot.metadata ?? get().baselineMetadata;
      const datasetId = normalizeDatasetId(metadata?.datasetId);

      set({
        baselineDataset: dataset,
        dataset,
        baselineMetadata: metadata,
        datasetMetadata: metadata,
        baselineDatasetId: datasetId || null,
        datasetId: datasetId || null,
        isHydrating: true,
        status: SCENARIO_STORE_STATUSES.HYDRATING,
        error: null,
        persistenceError: null,
      });

      if (!dataset || !datasetId) {
        const error = dataset
          ? createError(
            SCENARIO_STORE_ERROR_CODES.BASELINE_UNAVAILABLE,
            'The active dataset does not have a valid identifier.',
          )
          : null;

        set({
          scenarios: [],
          ...createEmptySelectionState(),
          isHydrating: false,
          isHydrated: true,
          isDirty: false,
          hasUnsavedChanges: false,
          status: error
            ? SCENARIO_STORE_STATUSES.FAILED
            : SCENARIO_STORE_STATUSES.EMPTY,
          error,
        });

        return error
          ? {
            ok: false,
            data: null,
            error,
          }
          : {
            ok: true,
            data: [],
          };
      }

      const result = readScenarios(repository, datasetId);

      if (!result.ok) {
        set({
          scenarios: [],
          ...createEmptySelectionState(),
          isHydrating: false,
          isHydrated: true,
          isDirty: false,
          hasUnsavedChanges: false,
          status: SCENARIO_STORE_STATUSES.FAILED,
          error: result.error,
          persistenceError: result.error,
        });

        return result;
      }

      const scenarios = cloneScenarios(result.data);
      const previousScenarioId = get().selectedScenarioId;
      const selectedScenario = scenarios.find((scenario) => (
        scenario.scenarioId === previousScenarioId
      )) ?? null;
      const selection = selectedScenario
        ? createSelectionState(
          selectedScenario,
          selectedScenario,
          dataset,
          service,
        )
        : createEmptySelectionState();

      set({
        scenarios,
        ...selection,
        isHydrating: false,
        isHydrated: true,
        isDirty: false,
        hasUnsavedChanges: false,
        status: scenarios.length > 0
          ? SCENARIO_STORE_STATUSES.READY
          : SCENARIO_STORE_STATUSES.EMPTY,
        persistenceMode: result.mode ?? get().persistenceMode,
        isMemoryOnly: resolveMemoryOnly(result, get().isMemoryOnly),
        memoryOnly: resolveMemoryOnly(result, get().isMemoryOnly),
        error: null,
      });

      return {
        ok: true,
        data: cloneScenarios(scenarios),
      };
    },

    hydrate(source) {
      return get().hydrateScenarios(source);
    },

    handleDatasetSnapshot(source) {
      const snapshot = resolveDatasetSnapshot(source);
      const nextDatasetId = normalizeDatasetId(
        snapshot.metadata?.datasetId,
      );
      const currentDatasetId = get().baselineDatasetId;
      const datasetChanged = nextDatasetId !== currentDatasetId;

      if (datasetChanged) {
        return get().hydrateScenarios(snapshot);
      }

      set({
        baselineDataset: snapshot.dataset,
        dataset: snapshot.dataset,
        baselineMetadata: snapshot.metadata,
        datasetMetadata: snapshot.metadata,
      });

      if (get().activeScenario && snapshot.dataset) {
        get().refreshComparison();
      }

      return {
        ok: true,
        data: snapshot,
      };
    },

    createScenario(request = {}, options = {}) {
      const datasetId = get().baselineDatasetId;
      const persist = options?.persist !== false;

      if (!get().baselineDataset || !datasetId) {
        const error = createError(
          SCENARIO_STORE_ERROR_CODES.BASELINE_UNAVAILABLE,
          'A valid active dataset is required to create a scenario.',
        );

        set({ error });
        return {
          ok: false,
          data: null,
          error,
          warnings: [],
        };
      }

      const result = invokeCreateScenario(
        service,
        request,
        datasetId,
        persist,
      );

      if (!result?.ok || !isScenario(result.data)) {
        const error = cloneError(
          result?.error,
          SCENARIO_STORE_ERROR_CODES.CREATE_FAILED,
          'The scenario could not be created.',
        );

        set({
          error,
          warnings: cloneWarnings(result?.warnings),
        });

        return {
          ok: false,
          data: null,
          error,
          warnings: cloneWarnings(result?.warnings),
        };
      }

      const scenario = cloneScenario(result.data);
      const scenarios = [
        ...get().scenarios.filter((candidate) => (
          candidate.scenarioId !== scenario.scenarioId
        )),
        cloneScenario(scenario),
      ];
      const isDirty = !persist;
      const memoryOnly = resolveMemoryOnly(
        result,
        get().isMemoryOnly,
      );

      set({
        scenarios,
        ...createSelectionState(
          scenario,
          persist ? scenario : null,
          get().baselineDataset,
          service,
        ),
        status: SCENARIO_STORE_STATUSES.READY,
        isDirty,
        hasUnsavedChanges: isDirty,
        isMemoryOnly: memoryOnly,
        memoryOnly,
        persistenceMode: result.mode ?? get().persistenceMode,
        persistenceError: result.error
          ? cloneError(
            result.error,
            SCENARIO_STORE_ERROR_CODES.CREATE_FAILED,
            'The scenario is available only for this session.',
          )
          : null,
        warnings: cloneWarnings(result.warnings),
        error: null,
      });

      return {
        ...result,
        data: cloneScenario(scenario),
      };
    },

    addScenario(request = {}, options = {}) {
      return get().createScenario(request, options);
    },

    selectScenario(scenarioOrId) {
      const scenarioId = typeof scenarioOrId === 'string'
        ? scenarioOrId.trim()
        : scenarioOrId?.scenarioId;
      const scenario = isScenario(scenarioOrId)
        ? scenarioOrId
        : get().scenarios.find((candidate) => (
          candidate.scenarioId === scenarioId
        ));

      if (!scenario) {
        const error = createError(
          SCENARIO_STORE_ERROR_CODES.SCENARIO_NOT_FOUND,
          'The selected scenario could not be found.',
        );

        set({ error });
        return {
          ok: false,
          data: null,
          error,
        };
      }

      set({
        ...createSelectionState(
          scenario,
          scenario,
          get().baselineDataset,
          service,
        ),
        isDirty: false,
        hasUnsavedChanges: false,
        error: null,
      });

      return {
        ok: true,
        data: cloneScenario(scenario),
      };
    },

    setActiveScenario(scenarioOrId) {
      return get().selectScenario(scenarioOrId);
    },

    clearSelection() {
      set({
        ...createEmptySelectionState(),
        isDirty: false,
        hasUnsavedChanges: false,
        error: null,
      });
    },

    updateAllocation(recordId, team, points, options = {}) {
      const activeScenario = get().activeScenario;

      if (!activeScenario) {
        const error = createError(
          SCENARIO_STORE_ERROR_CODES.INVALID_SCENARIO,
          'Select a scenario before editing allocations.',
        );

        set({ error });
        return {
          ok: false,
          data: null,
          error,
          warnings: [],
        };
      }

      const persist = options?.persist !== false;
      const result = invokeAllocationUpdate(
        service,
        activeScenario,
        recordId,
        team,
        points,
        {
          datasetId: get().baselineDatasetId,
          dataset: get().baselineDataset,
          persist,
        },
      );

      return get().applyEditResult(result, persist);
    },

    setAllocation(recordId, team, points, options = {}) {
      return get().updateAllocation(
        recordId,
        team,
        points,
        options,
      );
    },

    updateAssignment(recordId, teams, options = {}) {
      const activeScenario = get().activeScenario;

      if (!activeScenario) {
        const error = createError(
          SCENARIO_STORE_ERROR_CODES.INVALID_SCENARIO,
          'Select a scenario before editing assignments.',
        );

        set({ error });
        return {
          ok: false,
          data: null,
          error,
          warnings: [],
        };
      }

      const persist = options?.persist !== false;
      const result = invokeAssignmentUpdate(
        service,
        activeScenario,
        recordId,
        teams,
        {
          datasetId: get().baselineDatasetId,
          dataset: get().baselineDataset,
          persist,
        },
      );

      return get().applyEditResult(result, persist);
    },

    updateAssignments(recordId, teams, options = {}) {
      return get().updateAssignment(recordId, teams, options);
    },

    assignTeams(recordId, teams, options = {}) {
      return get().updateAssignment(recordId, teams, options);
    },

    applyEditResult(result, persisted) {
      if (!result?.ok || !isScenario(result.data)) {
        const error = cloneError(
          result?.error,
          SCENARIO_STORE_ERROR_CODES.UPDATE_FAILED,
          'The scenario change could not be applied.',
        );

        set({
          error,
          warnings: cloneWarnings(result?.warnings),
        });

        return {
          ok: false,
          data: null,
          error,
          warnings: cloneWarnings(result?.warnings),
        };
      }

      const scenario = cloneScenario(result.data);
      const scenarios = persisted
        ? [
          ...get().scenarios.filter((candidate) => (
            candidate.scenarioId !== scenario.scenarioId
          )),
          cloneScenario(scenario),
        ]
        : get().scenarios;
      const memoryOnly = resolveMemoryOnly(
        result,
        get().isMemoryOnly,
      );

      set({
        scenarios,
        ...createSelectionState(
          scenario,
          persisted ? scenario : get().persistedScenario,
          get().baselineDataset,
          service,
        ),
        isDirty: !persisted,
        hasUnsavedChanges: !persisted,
        isMemoryOnly: memoryOnly,
        memoryOnly,
        persistenceMode: result.mode ?? get().persistenceMode,
        persistenceError: result.error
          ? cloneError(
            result.error,
            SCENARIO_STORE_ERROR_CODES.UPDATE_FAILED,
            'The scenario is available only for this session.',
          )
          : null,
        warnings: cloneWarnings(result.warnings),
        error: null,
      });

      return {
        ...result,
        data: cloneScenario(scenario),
      };
    },

    saveActiveScenario() {
      const scenario = get().activeScenario;
      const datasetId = get().baselineDatasetId;

      if (!scenario || !datasetId) {
        const error = createError(
          SCENARIO_STORE_ERROR_CODES.INVALID_SCENARIO,
          'A selected scenario and active dataset are required.',
        );

        set({ error });
        return {
          ok: false,
          data: null,
          error,
          warnings: [],
        };
      }

      const result = invokePersistScenario(
        service,
        repository,
        scenario,
        datasetId,
      );

      return get().applyEditResult(result, true);
    },

    persistActiveScenario() {
      return get().saveActiveScenario();
    },

    discardChanges() {
      const persistedScenario = get().persistedScenario;

      if (!get().activeScenario) {
        return {
          ok: true,
          data: null,
        };
      }

      if (!persistedScenario) {
        set({
          scenarios: get().scenarios.filter((scenario) => (
            scenario.scenarioId !== get().activeScenario?.scenarioId
          )),
          ...createEmptySelectionState(),
          isDirty: false,
          hasUnsavedChanges: false,
          error: null,
        });

        return {
          ok: true,
          data: null,
        };
      }

      set({
        ...createSelectionState(
          persistedScenario,
          persistedScenario,
          get().baselineDataset,
          service,
        ),
        isDirty: false,
        hasUnsavedChanges: false,
        error: null,
      });

      return {
        ok: true,
        data: cloneScenario(persistedScenario),
      };
    },

    discard() {
      return get().discardChanges();
    },

    removeScenario(scenarioId = get().selectedScenarioId) {
      const normalizedScenarioId = typeof scenarioId === 'string'
        ? scenarioId.trim()
        : '';

      if (!normalizedScenarioId || !get().baselineDatasetId) {
        const error = createError(
          SCENARIO_STORE_ERROR_CODES.REMOVE_FAILED,
          'A saved scenario and active dataset are required.',
        );

        set({ error });
        return {
          ok: false,
          removed: false,
          error,
        };
      }

      const result = removeScenario(
        repository,
        normalizedScenarioId,
        get().baselineDatasetId,
      );

      if (!result.ok) {
        set({
          error: result.error,
          persistenceError: result.error,
        });
        return result;
      }

      const scenarios = get().scenarios.filter((scenario) => (
        scenario.scenarioId !== normalizedScenarioId
      ));
      const wasSelected = get().selectedScenarioId
        === normalizedScenarioId;
      const memoryOnly = resolveMemoryOnly(
        result,
        get().isMemoryOnly,
      );

      set({
        scenarios,
        ...(wasSelected ? createEmptySelectionState() : {}),
        status: scenarios.length > 0
          ? SCENARIO_STORE_STATUSES.READY
          : SCENARIO_STORE_STATUSES.EMPTY,
        isDirty: wasSelected ? false : get().isDirty,
        hasUnsavedChanges: wasSelected
          ? false
          : get().hasUnsavedChanges,
        isMemoryOnly: memoryOnly,
        memoryOnly,
        persistenceMode: result.mode ?? get().persistenceMode,
        persistenceError: result.error
          ? cloneError(
            result.error,
            SCENARIO_STORE_ERROR_CODES.REMOVE_FAILED,
            'The scenario removal is available only for this session.',
          )
          : null,
        error: null,
      });

      return result;
    },

    discardScenario(scenarioId = get().selectedScenarioId) {
      return get().removeScenario(scenarioId);
    },

    deleteScenario(scenarioId = get().selectedScenarioId) {
      return get().removeScenario(scenarioId);
    },

    refreshComparison() {
      const comparisonState = calculateComparison(
        service,
        get().baselineDataset,
        get().activeScenario,
      );

      set({
        comparison: comparisonState.comparison,
        comparisonState: comparisonState.comparison,
        baselineTotals: comparisonState.baselineTotals,
        scenarioTotals: comparisonState.scenarioTotals,
        comparisonError: comparisonState.error,
      });

      if (comparisonState.error) {
        return {
          ok: false,
          data: null,
          error: comparisonState.error,
        };
      }

      return {
        ok: true,
        data: comparisonState.comparison,
      };
    },

    calculateComparison() {
      return get().refreshComparison();
    },

    clearError() {
      set({
        error: null,
        comparisonError: null,
        persistenceError: null,
      });
    },

    reset() {
      const snapshot = readDatasetSnapshot(activeDatasetFacade);
      const datasetId = normalizeDatasetId(
        snapshot.metadata?.datasetId,
      );

      set({
        ...createInitialState(activeDatasetFacade),
        baselineDataset: snapshot.dataset,
        dataset: snapshot.dataset,
        baselineMetadata: snapshot.metadata,
        datasetMetadata: snapshot.metadata,
        baselineDatasetId: datasetId || null,
        datasetId: datasetId || null,
      });

      return {
        ok: true,
        data: null,
      };
    },
  }));

  let unsubscribe = () => {};

  try {
    const subscribe = typeof activeDatasetFacade
      ?.subscribeToDatasetChanges === 'function'
      ? activeDatasetFacade.subscribeToDatasetChanges.bind(
        activeDatasetFacade,
      )
      : activeDatasetFacade?.subscribe?.bind(activeDatasetFacade);

    if (subscribe) {
      const result = subscribe((snapshot) => {
        store.getState().handleDatasetSnapshot(snapshot);
      });

      if (typeof result === 'function') {
        unsubscribe = result;
      }
    }
  } catch {
    unsubscribe = () => {};
  }

  return Object.assign(store, {
    dispose() {
      unsubscribe();
      unsubscribe = () => {};
    },
  });
};

export const scenarioStore = createScenarioStore();

/**
 * Selects scenario feature state from the shared Zustand store.
 *
 * @param {Function} selector Scenario state selector.
 * @returns {*} Selected scenario state.
 */
export const useScenarioStore = (selector = defaultSelector) => (
  useStore(scenarioStore, selector)
);

export default scenarioStore;