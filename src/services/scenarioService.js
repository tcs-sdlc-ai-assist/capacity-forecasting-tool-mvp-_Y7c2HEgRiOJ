import {
  createNormalizedDataset,
  createScenario as createCanonicalScenario,
  isNormalizedDataset,
  isScenario,
} from '../domain/schemas.js';
import scenarioRepository from '../repositories/scenarioRepository.js';

export const SCENARIO_SERVICE_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'SCENARIO_INVALID_REQUEST',
  INVALID_DATASET: 'SCENARIO_INVALID_DATASET',
  INVALID_DATASET_ID: 'SCENARIO_INVALID_DATASET_ID',
  INVALID_SCENARIO: 'SCENARIO_INVALID_SCENARIO',
  INVALID_RECORD_ID: 'SCENARIO_INVALID_RECORD_ID',
  INVALID_TEAM: 'SCENARIO_INVALID_TEAM',
  INVALID_ALLOCATION: 'SCENARIO_INVALID_ALLOCATION',
  WORK_ITEM_NOT_FOUND: 'SCENARIO_WORK_ITEM_NOT_FOUND',
  PERSISTENCE_FAILED: 'SCENARIO_PERSISTENCE_FAILED',
});

export const SCENARIO_SERVICE_WARNING_CODES = Object.freeze({
  MEMORY_ONLY: 'SCENARIO_MEMORY_ONLY',
});

const createError = (code, message, details) => {
  const error = {
    code,
    message,
  };

  if (
    details !== undefined
    && details !== null
    && typeof details === 'object'
  ) {
    error.details = { ...details };
  }

  return error;
};

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const normalizeString = (value) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeDatasetId = (value) => normalizeString(value);

const isDatasetId = (value) => (
  typeof value === 'string'
  && value.length >= 1
  && value.length <= 128
);

const resolveTimestamp = (clock) => {
  let value;

  try {
    value = typeof clock === 'function'
      ? clock()
      : clock?.now?.();
  } catch {
    value = null;
  }

  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(value);

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
};

const resolveGeneratedId = (idGenerator) => {
  try {
    if (typeof idGenerator === 'function') {
      return idGenerator();
    }

    if (typeof idGenerator?.generate === 'function') {
      return idGenerator.generate();
    }

    if (typeof idGenerator?.generateId === 'function') {
      return idGenerator.generateId();
    }
  } catch {
    return null;
  }

  return null;
};

const createScenarioId = (timestamp, idGenerator) => {
  const suppliedId = normalizeString(resolveGeneratedId(idGenerator));

  if (suppliedId && suppliedId.length <= 128) {
    return suppliedId;
  }

  const timestampPart = timestamp
    .replace(/[^0-9A-Za-z]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const randomPart = Math.random().toString(36).slice(2, 10);

  return `scenario-${timestampPart}-${randomPart}`.slice(0, 128);
};

const cloneJsonValue = (value) => JSON.parse(JSON.stringify(value));

const cloneScenario = (scenario) => createCanonicalScenario(scenario);

const createEmptyAdjustments = () => ({
  allocations: {},
  assignments: {},
});

const normalizeAdjustmentMap = (value) => (
  isRecord(value) ? cloneJsonValue(value) : {}
);

const normalizeAdjustments = (value) => {
  if (!isRecord(value)) {
    return createEmptyAdjustments();
  }

  return {
    ...cloneJsonValue(value),
    allocations: normalizeAdjustmentMap(value.allocations),
    assignments: normalizeAdjustmentMap(value.assignments),
  };
};

const createMemoryWarning = (error = null) => ({
  code: SCENARIO_SERVICE_WARNING_CODES.MEMORY_ONLY,
  message: typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : 'The scenario is available for this session but could not be saved to durable browser storage.',
});

const normalizeTeams = (value) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;|]/)
      : [];

  return [...new Set(
    source
      .map(normalizeString)
      .filter(Boolean),
  )];
};

const normalizeAllocation = (value) => {
  if (
    typeof value === 'string'
    && value.trim() === ''
  ) {
    return Number.NaN;
  }

  const allocation = Number(value);

  return Number.isFinite(allocation) && allocation >= 0
    ? allocation
    : Number.NaN;
};

const resolveDataset = (value) => {
  if (isNormalizedDataset(value)) {
    return value;
  }

  if (isNormalizedDataset(value?.dataset)) {
    return value.dataset;
  }

  if (isNormalizedDataset(value?.data?.dataset)) {
    return value.data.dataset;
  }

  return null;
};

const findWorkItem = (dataset, recordId) => (
  dataset?.workItems.find((workItem) => workItem.recordId === recordId)
  ?? null
);

const invokeSave = (repository, scenario, datasetId) => {
  try {
    if (typeof repository?.saveScenario === 'function') {
      return repository.saveScenario(scenario, datasetId);
    }

    if (typeof repository?.save === 'function') {
      return repository.save(scenario, datasetId);
    }

    return null;
  } catch {
    return null;
  }
};

const createPersistenceFailure = (result) => ({
  ok: false,
  data: null,
  error: result?.error ?? createError(
    SCENARIO_SERVICE_ERROR_CODES.PERSISTENCE_FAILED,
    'The scenario could not be saved.',
  ),
});

const withPersistenceResult = (
  scenario,
  datasetId,
  repository,
  shouldPersist,
) => {
  if (!shouldPersist) {
    return {
      ok: true,
      data: cloneScenario(scenario),
      warnings: [],
    };
  }

  if (!isDatasetId(datasetId)) {
    return {
      ok: false,
      data: null,
      error: createError(
        SCENARIO_SERVICE_ERROR_CODES.INVALID_DATASET_ID,
        'A valid dataset identifier is required to save the scenario.',
      ),
      warnings: [],
    };
  }

  const result = invokeSave(repository, scenario, datasetId);

  if (!result?.ok) {
    return {
      ...createPersistenceFailure(result),
      warnings: [],
    };
  }

  const persistedScenario = isScenario(result.data)
    ? result.data
    : scenario;
  const warnings = [];

  if (result.mode === 'memory' || result.error) {
    warnings.push(createMemoryWarning(result.error));
  }

  const response = {
    ok: true,
    data: cloneScenario(persistedScenario),
    mode: result.mode,
    warnings,
  };

  if (result.error) {
    response.error = { ...result.error };
  }

  return response;
};

const resolveEditOptions = (datasetIdOrOptions, options = {}) => {
  if (isRecord(datasetIdOrOptions)) {
    return {
      datasetId: normalizeDatasetId(datasetIdOrOptions.datasetId),
      dataset: resolveDataset(datasetIdOrOptions.dataset),
      persist: datasetIdOrOptions.persist !== false,
    };
  }

  return {
    datasetId: normalizeDatasetId(datasetIdOrOptions),
    dataset: resolveDataset(options.dataset),
    persist: options.persist !== false,
  };
};

const validateScenarioAndRecord = (scenario, recordId, dataset) => {
  if (!isScenario(scenario)) {
    return createError(
      SCENARIO_SERVICE_ERROR_CODES.INVALID_SCENARIO,
      'A valid scenario is required.',
    );
  }

  if (!recordId || recordId.length > 128) {
    return createError(
      SCENARIO_SERVICE_ERROR_CODES.INVALID_RECORD_ID,
      'A valid work-item record identifier is required.',
    );
  }

  if (dataset && !findWorkItem(dataset, recordId)) {
    return createError(
      SCENARIO_SERVICE_ERROR_CODES.WORK_ITEM_NOT_FOUND,
      'The selected work item does not exist in the active dataset.',
      { recordId },
    );
  }

  return null;
};

const sumAllocations = (allocations) => (
  Object.values(allocations).reduce(
    (total, value) => total + (
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : 0
    ),
    0,
  )
);

const createTotalBucket = () => ({
  estimatedPoints: 0,
  allocatedPoints: 0,
  capacityPoints: 0,
  effectiveCapacityPoints: 0,
  workItemCount: 0,
  capacityRecordCount: 0,
});

const ensureBucket = (collection, key) => {
  if (!collection[key]) {
    collection[key] = createTotalBucket();
  }

  return collection[key];
};

const addWorkItemToBucket = (bucket, workItem) => {
  bucket.estimatedPoints += workItem.estimatedPoints;
  bucket.allocatedPoints += sumAllocations(workItem.allocations);
  bucket.workItemCount += 1;
};

const calculateEffectiveCapacity = (capacityRecord) => {
  const afterSupport = capacityRecord.capacityPoints
    * (1 - (capacityRecord.reservedSupportPercent / 100));

  return Math.max(
    0,
    afterSupport
      - capacityRecord.ptoImpactPoints
      - capacityRecord.holidayImpactPoints,
  );
};

const addCapacityToBucket = (bucket, capacityRecord) => {
  bucket.capacityPoints += capacityRecord.capacityPoints;
  bucket.effectiveCapacityPoints += calculateEffectiveCapacity(
    capacityRecord,
  );
  bucket.capacityRecordCount += 1;
};

const finalizeBucket = (bucket) => {
  const variancePoints = (
    bucket.effectiveCapacityPoints - bucket.allocatedPoints
  );
  const utilizationPercent = bucket.effectiveCapacityPoints > 0
    ? (bucket.allocatedPoints / bucket.effectiveCapacityPoints) * 100
    : null;

  return {
    ...bucket,
    variancePoints,
    utilizationPercent,
  };
};

const finalizeBuckets = (collection) => (
  Object.fromEntries(
    Object.entries(collection).map(([key, bucket]) => [
      key,
      finalizeBucket(bucket),
    ]),
  )
);

const applyAdjustmentsToWorkItem = (workItem, adjustments) => {
  const assignment = adjustments.assignments[workItem.recordId];
  const allocationEdits = adjustments.allocations[workItem.recordId];
  const teams = Array.isArray(assignment)
    ? normalizeTeams(assignment)
    : [...workItem.team];
  const allocations = {
    ...workItem.allocations,
  };

  if (isRecord(allocationEdits)) {
    Object.entries(allocationEdits).forEach(([team, value]) => {
      const normalizedTeam = normalizeString(team);
      const normalizedValue = normalizeAllocation(value);

      if (normalizedTeam && Number.isFinite(normalizedValue)) {
        allocations[normalizedTeam] = normalizedValue;
      }
    });
  }

  Object.keys(allocations).forEach((team) => {
    if (!teams.includes(team)) {
      teams.push(team);
    }
  });

  return {
    ...workItem,
    team: teams,
    allocations,
  };
};

/**
 * Implements immutable browser-local what-if scenario operations.
 */
export class ScenarioService {
  constructor(
    repository = scenarioRepository,
    clock = () => new Date(),
    idGenerator = null,
  ) {
    this.scenarioRepository = repository;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  /**
   * Creates a scenario whose adjustments are independent from its source.
   *
   * @param {object} request Scenario creation fields.
   * @param {string|object} [datasetIdOrOptions] Dataset ID or options.
   * @returns {{ok: boolean, data: object|null, warnings: object[], error?: object}}
   * Scenario creation result.
   */
  createScenario(request = {}, datasetIdOrOptions = {}) {
    if (!isRecord(request)) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_REQUEST,
          'Valid scenario creation fields are required.',
        ),
        warnings: [],
      };
    }

    const options = isRecord(datasetIdOrOptions)
      ? datasetIdOrOptions
      : { datasetId: datasetIdOrOptions };
    const datasetId = normalizeDatasetId(
      options.datasetId ?? request.datasetId,
    );
    const shouldPersist = options.persist === undefined
      ? request.persist !== false && Boolean(datasetId)
      : options.persist !== false;
    const sourceScenario = request.sourceScenario ?? request.scenario;
    const timestamp = resolveTimestamp(this.clock);
    const createdAt = sourceScenario?.createdAt && request.preserveCreatedAt
      ? sourceScenario.createdAt
      : timestamp;
    let scenario;

    try {
      scenario = createCanonicalScenario({
        scenarioId: normalizeString(request.scenarioId)
          || createScenarioId(timestamp, this.idGenerator),
        name: normalizeString(request.name),
        description: normalizeString(request.description),
        createdAt,
        updatedAt: timestamp,
        adjustments: normalizeAdjustments(
          request.adjustments ?? sourceScenario?.adjustments,
        ),
      });
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_SCENARIO,
          'The scenario could not be created because its data is invalid.',
        ),
        warnings: [],
      };
    }

    return withPersistenceResult(
      scenario,
      datasetId,
      this.scenarioRepository,
      shouldPersist,
    );
  }

  /**
   * Creates an independent scenario from an existing scenario.
   *
   * @param {object} sourceScenario Existing scenario.
   * @param {object} request New scenario fields.
   * @param {string|object} [datasetIdOrOptions] Dataset ID or options.
   * @returns {object} Scenario creation result.
   */
  cloneScenario(sourceScenario, request = {}, datasetIdOrOptions = {}) {
    if (!isScenario(sourceScenario)) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_SCENARIO,
          'A valid source scenario is required.',
        ),
        warnings: [],
      };
    }

    return this.createScenario(
      {
        ...request,
        name: normalizeString(request.name)
          || `${sourceScenario.name} copy`,
        description: request.description === undefined
          ? sourceScenario.description
          : request.description,
        sourceScenario,
      },
      datasetIdOrOptions,
    );
  }

  /**
   * Immutably updates one team allocation in a scenario.
   *
   * @param {object} scenario Scenario to update.
   * @param {string} recordId Work-item record ID.
   * @param {string} team Allocation team.
   * @param {number|string} points Allocation points.
   * @param {string|object} [datasetIdOrOptions] Dataset ID or options.
   * @param {object} [options] Edit options.
   * @returns {object} Scenario update result.
   */
  updateAllocation(
    scenario,
    recordId,
    team,
    points,
    datasetIdOrOptions = {},
    options = {},
  ) {
    const normalizedRecordId = normalizeString(recordId);
    const normalizedTeam = normalizeString(team);
    const allocation = normalizeAllocation(points);
    const editOptions = resolveEditOptions(
      datasetIdOrOptions,
      options,
    );
    const validationError = validateScenarioAndRecord(
      scenario,
      normalizedRecordId,
      editOptions.dataset,
    );

    if (validationError) {
      return {
        ok: false,
        data: null,
        error: validationError,
        warnings: [],
      };
    }

    if (!normalizedTeam || normalizedTeam.length > 128) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_TEAM,
          'A valid allocation team is required.',
        ),
        warnings: [],
      };
    }

    if (!Number.isFinite(allocation)) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_ALLOCATION,
          'Allocation points must be a finite, non-negative number.',
        ),
        warnings: [],
      };
    }

    const adjustments = normalizeAdjustments(scenario.adjustments);
    const existingAllocations = isRecord(
      adjustments.allocations[normalizedRecordId],
    )
      ? adjustments.allocations[normalizedRecordId]
      : {};
    const timestamp = resolveTimestamp(this.clock);
    let updatedScenario;

    try {
      updatedScenario = createCanonicalScenario({
        ...scenario,
        updatedAt: timestamp < scenario.createdAt
          ? scenario.createdAt
          : timestamp,
        adjustments: {
          ...adjustments,
          allocations: {
            ...adjustments.allocations,
            [normalizedRecordId]: {
              ...existingAllocations,
              [normalizedTeam]: allocation,
            },
          },
        },
      });
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_SCENARIO,
          'The allocation change could not be applied.',
        ),
        warnings: [],
      };
    }

    return withPersistenceResult(
      updatedScenario,
      editOptions.datasetId,
      this.scenarioRepository,
      editOptions.persist && Boolean(editOptions.datasetId),
    );
  }

  /**
   * Alias for updating a scenario allocation.
   *
   * @returns {object} Scenario update result.
   */
  setAllocation(...args) {
    return this.updateAllocation(...args);
  }

  /**
   * Immutably replaces a work item's team assignments.
   *
   * @param {object} scenario Scenario to update.
   * @param {string} recordId Work-item record ID.
   * @param {string|string[]} teams Assigned teams.
   * @param {string|object} [datasetIdOrOptions] Dataset ID or options.
   * @param {object} [options] Edit options.
   * @returns {object} Scenario update result.
   */
  updateAssignment(
    scenario,
    recordId,
    teams,
    datasetIdOrOptions = {},
    options = {},
  ) {
    const normalizedRecordId = normalizeString(recordId);
    const normalizedTeams = normalizeTeams(teams);
    const editOptions = resolveEditOptions(
      datasetIdOrOptions,
      options,
    );
    const validationError = validateScenarioAndRecord(
      scenario,
      normalizedRecordId,
      editOptions.dataset,
    );

    if (validationError) {
      return {
        ok: false,
        data: null,
        error: validationError,
        warnings: [],
      };
    }

    if (
      normalizedTeams.length === 0
      || normalizedTeams.some((team) => team.length > 128)
    ) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_TEAM,
          'At least one valid assigned team is required.',
        ),
        warnings: [],
      };
    }

    const adjustments = normalizeAdjustments(scenario.adjustments);
    const timestamp = resolveTimestamp(this.clock);
    let updatedScenario;

    try {
      updatedScenario = createCanonicalScenario({
        ...scenario,
        updatedAt: timestamp < scenario.createdAt
          ? scenario.createdAt
          : timestamp,
        adjustments: {
          ...adjustments,
          assignments: {
            ...adjustments.assignments,
            [normalizedRecordId]: [...normalizedTeams],
          },
        },
      });
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_SCENARIO,
          'The assignment change could not be applied.',
        ),
        warnings: [],
      };
    }

    return withPersistenceResult(
      updatedScenario,
      editOptions.datasetId,
      this.scenarioRepository,
      editOptions.persist && Boolean(editOptions.datasetId),
    );
  }

  /**
   * Alias for replacing work-item team assignments.
   *
   * @returns {object} Scenario update result.
   */
  updateAssignments(...args) {
    return this.updateAssignment(...args);
  }

  /**
   * Alias for replacing work-item team assignments.
   *
   * @returns {object} Scenario update result.
   */
  assignTeams(...args) {
    return this.updateAssignment(...args);
  }

  /**
   * Applies scenario adjustments to an independent dataset copy.
   *
   * @param {object} dataset Baseline normalized dataset.
   * @param {object|null} scenario Scenario to apply.
   * @returns {{ok: boolean, data: object|null, error?: object}}
   * Dataset application result.
   */
  applyScenario(dataset, scenario = null) {
    const normalizedDataset = resolveDataset(dataset);

    if (!normalizedDataset) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_DATASET,
          'A valid normalized baseline dataset is required.',
        ),
      };
    }

    if (scenario !== null && !isScenario(scenario)) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_SCENARIO,
          'A valid scenario is required.',
        ),
      };
    }

    const adjustments = scenario
      ? normalizeAdjustments(scenario.adjustments)
      : createEmptyAdjustments();

    try {
      return {
        ok: true,
        data: createNormalizedDataset({
          ...normalizedDataset,
          workItems: normalizedDataset.workItems.map((workItem) => (
            applyAdjustmentsToWorkItem(workItem, adjustments)
          )),
        }),
      };
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_SCENARIO,
          'The scenario adjustments could not be applied to the dataset.',
        ),
      };
    }
  }

  /**
   * Calculates allocation, estimate, and capacity totals.
   *
   * @param {object} dataset Baseline normalized dataset.
   * @param {object|null} scenario Optional scenario.
   * @returns {{ok: boolean, data: object|null, error?: object}}
   * Totals result.
   */
  calculateTotals(dataset, scenario = null) {
    const applied = this.applyScenario(dataset, scenario);

    if (!applied.ok) {
      return applied;
    }

    const totals = createTotalBucket();
    const byTeam = {};
    const byPlanningLevel = {};

    applied.data.workItems.forEach((workItem) => {
      addWorkItemToBucket(totals, workItem);
      addWorkItemToBucket(
        ensureBucket(byPlanningLevel, workItem.planningLevel),
        workItem,
      );

      Object.entries(workItem.allocations).forEach(([team, points]) => {
        const teamBucket = ensureBucket(byTeam, team);

        teamBucket.allocatedPoints += points;
      });

      workItem.team.forEach((team) => {
        ensureBucket(byTeam, team).workItemCount += 1;
      });
    });

    applied.data.capacityRecords.forEach((capacityRecord) => {
      addCapacityToBucket(totals, capacityRecord);
      addCapacityToBucket(
        ensureBucket(byTeam, capacityRecord.team),
        capacityRecord,
      );
      addCapacityToBucket(
        ensureBucket(
          byPlanningLevel,
          capacityRecord.planningLevel,
        ),
        capacityRecord,
      );
    });

    const finalizedTotals = finalizeBucket(totals);

    return {
      ok: true,
      data: {
        ...finalizedTotals,
        totalEstimatedPoints: finalizedTotals.estimatedPoints,
        totalAllocatedPoints: finalizedTotals.allocatedPoints,
        totalCapacityPoints: finalizedTotals.capacityPoints,
        totalEffectiveCapacityPoints: (
          finalizedTotals.effectiveCapacityPoints
        ),
        byTeam: finalizeBuckets(byTeam),
        byPlanningLevel: finalizeBuckets(byPlanningLevel),
      },
    };
  }

  /**
   * Calculates baseline and scenario totals with their aggregate deltas.
   *
   * @param {object} dataset Baseline normalized dataset.
   * @param {object} scenario Scenario to compare.
   * @returns {{ok: boolean, data: object|null, error?: object}}
   * Comparison result.
   */
  calculateComparison(dataset, scenario) {
    if (!isScenario(scenario)) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_SCENARIO,
          'A valid scenario is required.',
        ),
      };
    }

    const baseline = this.calculateTotals(dataset);
    const scenarioTotals = this.calculateTotals(dataset, scenario);

    if (!baseline.ok || !scenarioTotals.ok) {
      return baseline.ok ? scenarioTotals : baseline;
    }

    return {
      ok: true,
      data: {
        baseline: baseline.data,
        scenario: scenarioTotals.data,
        delta: {
          estimatedPoints: (
            scenarioTotals.data.estimatedPoints
            - baseline.data.estimatedPoints
          ),
          allocatedPoints: (
            scenarioTotals.data.allocatedPoints
            - baseline.data.allocatedPoints
          ),
          capacityPoints: (
            scenarioTotals.data.capacityPoints
            - baseline.data.capacityPoints
          ),
          effectiveCapacityPoints: (
            scenarioTotals.data.effectiveCapacityPoints
            - baseline.data.effectiveCapacityPoints
          ),
          variancePoints: (
            scenarioTotals.data.variancePoints
            - baseline.data.variancePoints
          ),
        },
      },
    };
  }

  /**
   * Alias for calculating baseline and scenario totals.
   *
   * @param {object} dataset Baseline normalized dataset.
   * @param {object} scenario Scenario to compare.
   * @returns {object} Comparison result.
   */
  calculateBaselineAndScenarioTotals(dataset, scenario) {
    return this.calculateComparison(dataset, scenario);
  }

  /**
   * Attempts to persist a canonical scenario.
   *
   * @param {object} scenario Scenario to persist.
   * @param {string} datasetId Active dataset identifier.
   * @returns {object} Persistence result.
   */
  persistScenario(scenario, datasetId) {
    if (!isScenario(scenario)) {
      return {
        ok: false,
        data: null,
        error: createError(
          SCENARIO_SERVICE_ERROR_CODES.INVALID_SCENARIO,
          'A valid scenario is required.',
        ),
        warnings: [],
      };
    }

    return withPersistenceResult(
      scenario,
      normalizeDatasetId(datasetId),
      this.scenarioRepository,
      true,
    );
  }

  /**
   * Alias for persisting a scenario.
   *
   * @param {object} scenario Scenario to persist.
   * @param {string} datasetId Active dataset identifier.
   * @returns {object} Persistence result.
   */
  saveScenario(scenario, datasetId) {
    return this.persistScenario(scenario, datasetId);
  }
}

export const scenarioService = new ScenarioService();

export default scenarioService;