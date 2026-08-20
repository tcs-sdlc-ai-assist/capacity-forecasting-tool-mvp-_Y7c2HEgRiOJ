import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';
import { STORAGE_KEYS } from '../constants/storageKeys.js';
import {
  createScenario,
  isScenario,
} from '../domain/schemas.js';
import persistentStore from '../platform/storage/persistentStore.js';

const INVALID_SCENARIO = 'INVALID_SCENARIO';
const INVALID_DATASET_ID = 'INVALID_DATASET_ID';
const INVALID_SCENARIO_ENVELOPE = 'INVALID_SCENARIO_ENVELOPE';
const SCENARIO_DATASET_MISMATCH = 'SCENARIO_DATASET_MISMATCH';
const SCENARIOS_READ_FAILED = 'SCENARIOS_READ_FAILED';
const SCENARIOS_WRITE_FAILED = 'SCENARIOS_WRITE_FAILED';
const SCENARIOS_CLEAR_FAILED = 'SCENARIOS_CLEAR_FAILED';

const createError = (code, message) => ({
  code,
  message,
});

const normalizeDatasetId = (datasetId) => (
  typeof datasetId === 'string' ? datasetId.trim() : ''
);

const isDatasetId = (datasetId) => (
  typeof datasetId === 'string'
  && datasetId.length >= 1
  && datasetId.length <= 128
);

const cloneScenario = (scenario) => createScenario(scenario);

const cloneScenarios = (scenarios) => scenarios.map(cloneScenario);

const cloneEnvelope = (envelope) => ({
  schemaVersion: envelope.schemaVersion,
  datasetId: envelope.datasetId,
  scenarios: cloneScenarios(envelope.scenarios),
});

/**
 * Determines whether a value is a valid dataset-scoped scenario envelope.
 *
 * @param {*} value Value to inspect.
 * @returns {boolean} Whether the value satisfies the envelope contract.
 */
export const isScenarioEnvelope = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && value.schemaVersion === SUPPORTED_SCHEMA_VERSION
  && isDatasetId(value.datasetId)
  && Array.isArray(value.scenarios)
  && value.scenarios.every(isScenario)
  && new Set(
    value.scenarios.map((scenario) => scenario.scenarioId),
  ).size === value.scenarios.length
);

const createScenarioEnvelope = (datasetId, scenarios = []) => {
  const normalizedDatasetId = normalizeDatasetId(datasetId);

  if (!isDatasetId(normalizedDatasetId)) {
    throw new TypeError('Invalid scenario dataset identifier.');
  }

  const canonicalScenarios = Array.isArray(scenarios)
    ? scenarios.map(createScenario)
    : null;

  const envelope = {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    datasetId: normalizedDatasetId,
    scenarios: canonicalScenarios,
  };

  if (!isScenarioEnvelope(envelope)) {
    throw new TypeError('Invalid scenario envelope.');
  }

  return envelope;
};

const readStoredEnvelope = (storage) => {
  try {
    const result = storage.get(STORAGE_KEYS.SCENARIOS);

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          SCENARIOS_READ_FAILED,
          'Saved scenarios could not be read from browser storage.',
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
        SCENARIOS_READ_FAILED,
        'Saved scenarios could not be read from browser storage.',
      ),
    };
  }
};

const writeStoredEnvelope = (storage, envelope) => {
  try {
    const result = storage.set(STORAGE_KEYS.SCENARIOS, envelope);

    if (!result?.ok) {
      return {
        ok: false,
        mode: result?.mode,
        error: result?.error ?? createError(
          SCENARIOS_WRITE_FAILED,
          'Saved scenarios could not be written to browser storage.',
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      error: createError(
        SCENARIOS_WRITE_FAILED,
        'Saved scenarios could not be written to browser storage.',
      ),
    };
  }
};

const removeStoredEnvelope = (storage) => {
  try {
    const result = storage.remove(STORAGE_KEYS.SCENARIOS);

    if (!result?.ok) {
      return {
        ok: false,
        removed: Boolean(result?.removed),
        error: result?.error ?? createError(
          SCENARIOS_CLEAR_FAILED,
          'Saved scenarios could not be cleared from browser storage.',
        ),
      };
    }

    return result;
  } catch {
    return {
      ok: false,
      removed: false,
      error: createError(
        SCENARIOS_CLEAR_FAILED,
        'Saved scenarios could not be cleared from browser storage.',
      ),
    };
  }
};

const datasetMismatchResult = () => ({
  ok: false,
  data: null,
  error: createError(
    SCENARIO_DATASET_MISMATCH,
    'Saved scenarios belong to a different active dataset.',
  ),
});

const invalidDatasetResult = () => ({
  ok: false,
  data: null,
  error: createError(
    INVALID_DATASET_ID,
    'A valid dataset identifier is required for saved scenarios.',
  ),
});

const resolveSaveArguments = (scenarioOrDatasetId, datasetIdOrScenario) => {
  if (typeof scenarioOrDatasetId === 'string') {
    return {
      datasetId: scenarioOrDatasetId,
      scenario: datasetIdOrScenario,
    };
  }

  return {
    datasetId: datasetIdOrScenario ?? scenarioOrDatasetId?.datasetId,
    scenario: scenarioOrDatasetId,
  };
};

const resolveCollectionArguments = (
  scenariosOrDatasetId,
  datasetIdOrScenarios,
) => {
  if (typeof scenariosOrDatasetId === 'string') {
    return {
      datasetId: scenariosOrDatasetId,
      scenarios: datasetIdOrScenarios,
    };
  }

  return {
    datasetId: datasetIdOrScenarios,
    scenarios: scenariosOrDatasetId,
  };
};

/**
 * Provides validated, dataset-scoped persistence for saved scenarios.
 *
 * Failed storage writes are retained in repository memory so scenario work can
 * continue for the lifetime of the current application session.
 */
export class ScenarioRepository {
  constructor(storage = persistentStore) {
    this.storage = storage;
    this.memoryOverride = false;
    this.memoryEnvelope = null;
  }

  /**
   * Reads the stored scenario envelope and optionally verifies its dataset.
   *
   * @param {string} [datasetId] Expected active dataset identifier.
   * @returns {{ok: boolean, data: object|null, error?: object}} Read result.
   */
  getEnvelope(datasetId) {
    const normalizedDatasetId = datasetId === undefined
      ? null
      : normalizeDatasetId(datasetId);

    if (
      normalizedDatasetId !== null
      && !isDatasetId(normalizedDatasetId)
    ) {
      return invalidDatasetResult();
    }

    if (this.memoryOverride) {
      if (
        this.memoryEnvelope
        && normalizedDatasetId !== null
        && this.memoryEnvelope.datasetId !== normalizedDatasetId
      ) {
        return datasetMismatchResult();
      }

      return {
        ok: true,
        data: this.memoryEnvelope
          ? cloneEnvelope(this.memoryEnvelope)
          : null,
      };
    }

    const result = readStoredEnvelope(this.storage);

    if (!result.ok || result.data === null) {
      return result;
    }

    if (!isScenarioEnvelope(result.data)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_SCENARIO_ENVELOPE,
          'Stored scenarios are invalid or incompatible.',
        ),
      };
    }

    if (
      normalizedDatasetId !== null
      && result.data.datasetId !== normalizedDatasetId
    ) {
      return datasetMismatchResult();
    }

    return {
      ok: true,
      data: cloneEnvelope(result.data),
    };
  }

  /**
   * Reads scenarios associated with the active dataset.
   *
   * @param {string} datasetId Active dataset identifier.
   * @returns {{ok: boolean, data: object[]|null, error?: object}} Read result.
   */
  getScenarios(datasetId) {
    const result = this.getEnvelope(datasetId);

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: result.data ? cloneScenarios(result.data.scenarios) : [],
    };
  }

  /**
   * Alias for reading scenarios associated with a dataset.
   *
   * @param {string} datasetId Active dataset identifier.
   * @returns {{ok: boolean, data: object[]|null, error?: object}} Read result.
   */
  getAll(datasetId) {
    return this.getScenarios(datasetId);
  }

  /**
   * Finds a scenario by identifier within the active dataset.
   *
   * @param {string} scenarioId Scenario identifier.
   * @param {string} datasetId Active dataset identifier.
   * @returns {{ok: boolean, data: object|null, error?: object}} Lookup result.
   */
  findById(scenarioId, datasetId) {
    const normalizedScenarioId = typeof scenarioId === 'string'
      ? scenarioId.trim()
      : '';

    if (!normalizedScenarioId) {
      return {
        ok: true,
        data: null,
      };
    }

    const result = this.getScenarios(datasetId);

    if (!result.ok) {
      return result;
    }

    const scenario = result.data.find((candidate) => (
      candidate.scenarioId === normalizedScenarioId
    ));

    return {
      ok: true,
      data: scenario ? cloneScenario(scenario) : null,
    };
  }

  /**
   * Checks whether stored scenarios belong to the supplied dataset.
   *
   * @param {string} datasetId Active dataset identifier.
   * @returns {{ok: boolean, compatible: boolean, error?: object}} Check result.
   */
  isCompatibleWithDataset(datasetId) {
    const normalizedDatasetId = normalizeDatasetId(datasetId);

    if (!isDatasetId(normalizedDatasetId)) {
      return {
        ok: false,
        compatible: false,
        error: invalidDatasetResult().error,
      };
    }

    const result = this.getEnvelope();

    if (!result.ok) {
      return {
        ok: false,
        compatible: false,
        error: result.error,
      };
    }

    return {
      ok: true,
      compatible: (
        result.data === null
        || result.data.datasetId === normalizedDatasetId
      ),
    };
  }

  /**
   * Creates or replaces one scenario within a dataset-scoped envelope.
   *
   * Both saveScenario(scenario, datasetId) and
   * saveScenario(datasetId, scenario) are supported.
   *
   * @param {object|string} scenarioOrDatasetId Scenario or dataset identifier.
   * @param {string|object} datasetIdOrScenario Dataset identifier or scenario.
   * @returns {{ok: boolean, data: object|null, mode?: string, error?: object}}
   * Save result.
   */
  saveScenario(scenarioOrDatasetId, datasetIdOrScenario) {
    const {
      datasetId,
      scenario,
    } = resolveSaveArguments(
      scenarioOrDatasetId,
      datasetIdOrScenario,
    );
    const normalizedDatasetId = normalizeDatasetId(datasetId);

    if (!isDatasetId(normalizedDatasetId)) {
      return invalidDatasetResult();
    }

    let canonicalScenario;

    try {
      canonicalScenario = createScenario(scenario);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_SCENARIO,
          'The scenario could not be saved because its data is invalid.',
        ),
      };
    }

    const existing = this.getEnvelope();

    if (!existing.ok) {
      return existing;
    }

    if (
      existing.data
      && existing.data.datasetId !== normalizedDatasetId
    ) {
      return datasetMismatchResult();
    }

    const scenarios = existing.data
      ? cloneScenarios(existing.data.scenarios)
      : [];
    const existingIndex = scenarios.findIndex((candidate) => (
      candidate.scenarioId === canonicalScenario.scenarioId
    ));

    if (existingIndex >= 0) {
      scenarios[existingIndex] = canonicalScenario;
    } else {
      scenarios.push(canonicalScenario);
    }

    const envelope = createScenarioEnvelope(
      normalizedDatasetId,
      scenarios,
    );
    const result = writeStoredEnvelope(this.storage, envelope);

    if (!result.ok) {
      this.memoryOverride = true;
      this.memoryEnvelope = cloneEnvelope(envelope);

      return {
        ok: true,
        data: cloneScenario(canonicalScenario),
        mode: 'memory',
        error: result.error,
      };
    }

    this.memoryEnvelope = cloneEnvelope(envelope);
    this.memoryOverride = result.mode === 'memory';

    const response = {
      ok: true,
      data: cloneScenario(canonicalScenario),
      mode: result.mode,
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Alias for creating or replacing a scenario.
   *
   * @param {object|string} scenarioOrDatasetId Scenario or dataset identifier.
   * @param {string|object} datasetIdOrScenario Dataset identifier or scenario.
   * @returns {object} Save result.
   */
  save(scenarioOrDatasetId, datasetIdOrScenario) {
    return this.saveScenario(
      scenarioOrDatasetId,
      datasetIdOrScenario,
    );
  }

  /**
   * Replaces all scenarios for a dataset.
   *
   * Both saveScenarios(scenarios, datasetId) and
   * saveScenarios(datasetId, scenarios) are supported.
   *
   * @param {object[]|string} scenariosOrDatasetId Scenarios or dataset ID.
   * @param {string|object[]} datasetIdOrScenarios Dataset ID or scenarios.
   * @returns {{ok: boolean, data: object[]|null, mode?: string, error?: object}}
   * Save result.
   */
  saveScenarios(scenariosOrDatasetId, datasetIdOrScenarios) {
    const {
      datasetId,
      scenarios,
    } = resolveCollectionArguments(
      scenariosOrDatasetId,
      datasetIdOrScenarios,
    );
    const normalizedDatasetId = normalizeDatasetId(datasetId);

    if (!isDatasetId(normalizedDatasetId)) {
      return invalidDatasetResult();
    }

    let envelope;

    try {
      envelope = createScenarioEnvelope(
        normalizedDatasetId,
        scenarios,
      );
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_SCENARIO,
          'Scenarios could not be saved because their data is invalid.',
        ),
      };
    }

    const existing = this.getEnvelope();

    if (!existing.ok) {
      return existing;
    }

    if (
      existing.data
      && existing.data.datasetId !== normalizedDatasetId
    ) {
      return datasetMismatchResult();
    }

    const result = writeStoredEnvelope(this.storage, envelope);

    if (!result.ok) {
      this.memoryOverride = true;
      this.memoryEnvelope = cloneEnvelope(envelope);

      return {
        ok: true,
        data: cloneScenarios(envelope.scenarios),
        mode: 'memory',
        error: result.error,
      };
    }

    this.memoryEnvelope = cloneEnvelope(envelope);
    this.memoryOverride = result.mode === 'memory';

    const response = {
      ok: true,
      data: cloneScenarios(envelope.scenarios),
      mode: result.mode,
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Removes one scenario from a dataset-scoped envelope.
   *
   * @param {string} scenarioId Scenario identifier.
   * @param {string} datasetId Active dataset identifier.
   * @returns {{ok: boolean, removed: boolean, mode?: string, error?: object}}
   * Remove result.
   */
  removeScenario(scenarioId, datasetId) {
    const normalizedScenarioId = typeof scenarioId === 'string'
      ? scenarioId.trim()
      : '';
    const normalizedDatasetId = normalizeDatasetId(datasetId);

    if (!isDatasetId(normalizedDatasetId)) {
      return {
        ...invalidDatasetResult(),
        removed: false,
      };
    }

    if (!normalizedScenarioId) {
      return {
        ok: true,
        removed: false,
      };
    }

    const existing = this.getEnvelope(normalizedDatasetId);

    if (!existing.ok) {
      return {
        ...existing,
        removed: false,
      };
    }

    if (!existing.data) {
      return {
        ok: true,
        removed: false,
      };
    }

    const scenarios = existing.data.scenarios.filter((scenario) => (
      scenario.scenarioId !== normalizedScenarioId
    ));

    if (scenarios.length === existing.data.scenarios.length) {
      return {
        ok: true,
        removed: false,
      };
    }

    const envelope = createScenarioEnvelope(
      normalizedDatasetId,
      scenarios,
    );
    const result = writeStoredEnvelope(this.storage, envelope);

    if (!result.ok) {
      this.memoryOverride = true;
      this.memoryEnvelope = cloneEnvelope(envelope);

      return {
        ok: true,
        removed: true,
        mode: 'memory',
        error: result.error,
      };
    }

    this.memoryEnvelope = cloneEnvelope(envelope);
    this.memoryOverride = result.mode === 'memory';

    const response = {
      ok: true,
      removed: true,
      mode: result.mode,
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Alias for removing one scenario.
   *
   * @param {string} scenarioId Scenario identifier.
   * @param {string} datasetId Active dataset identifier.
   * @returns {object} Remove result.
   */
  remove(scenarioId, datasetId) {
    return this.removeScenario(scenarioId, datasetId);
  }

  /**
   * Clears scenarios after optionally verifying dataset compatibility.
   *
   * @param {string} [datasetId] Expected active dataset identifier.
   * @returns {{ok: boolean, removed: boolean, error?: object}} Clear result.
   */
  clearScenarios(datasetId) {
    if (datasetId !== undefined) {
      const compatibility = this.getEnvelope(datasetId);

      if (!compatibility.ok) {
        return {
          ok: false,
          removed: false,
          error: compatibility.error,
        };
      }
    }

    const hadMemoryEnvelope = this.memoryEnvelope !== null;
    const result = removeStoredEnvelope(this.storage);

    this.memoryEnvelope = null;

    if (!result.ok) {
      this.memoryOverride = true;

      return {
        ok: true,
        removed: hadMemoryEnvelope || Boolean(result.removed),
        error: result.error,
      };
    }

    this.memoryOverride = Boolean(result.error);

    const response = {
      ok: true,
      removed: hadMemoryEnvelope || Boolean(result.removed),
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Alias for clearing saved scenarios.
   *
   * @param {string} [datasetId] Expected active dataset identifier.
   * @returns {{ok: boolean, removed: boolean, error?: object}} Clear result.
   */
  clear(datasetId) {
    return this.clearScenarios(datasetId);
  }
}

export const scenarioRepository = new ScenarioRepository();

export default scenarioRepository;