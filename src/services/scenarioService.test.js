import {
  SCENARIO_SERVICE_ERROR_CODES,
  SCENARIO_SERVICE_WARNING_CODES,
  ScenarioService,
} from './scenarioService.js';
import {
  createScenario,
} from '../domain/schemas.js';
import {
  FIXTURE_DATASET_ID,
  FIXTURE_TIMESTAMP,
  createValidDatasetFixture,
} from '../test/fixtures.js';

const SCENARIO_ID = 'scenario-service-test-001';
const UPDATED_TIMESTAMP = '2026-08-20T13:00:00.000Z';

const createScenarioFixture = (overrides = {}) => createScenario({
  scenarioId: SCENARIO_ID,
  name: 'Capacity planning scenario',
  description: 'Scenario domain test fixture.',
  createdAt: FIXTURE_TIMESTAMP,
  updatedAt: FIXTURE_TIMESTAMP,
  adjustments: {
    allocations: {},
    assignments: {},
  },
  ...overrides,
});

const createRepository = (saveImplementation = (scenario) => ({
  ok: true,
  data: scenario,
  mode: 'localStorage',
})) => ({
  saveScenario: vi.fn(saveImplementation),
});

const createService = ({
  repository = createRepository(),
  timestamp = UPDATED_TIMESTAMP,
  scenarioId = SCENARIO_ID,
} = {}) => ({
  repository,
  service: new ScenarioService(
    repository,
    () => new Date(timestamp),
    () => scenarioId,
  ),
});

describe('ScenarioService', () => {
  it('creates and persists a browser-local scenario with independent adjustments', () => {
    const repository = createRepository();
    const { service } = createService({ repository });
    const sourceAdjustments = {
      allocations: {
        'fixture-work-item-001': {
          Atlas: 24,
        },
      },
      assignments: {
        'fixture-work-item-001': ['Atlas'],
      },
    };

    const result = service.createScenario({
      name: '  Quarter-end plan  ',
      description: '  Explore higher Atlas demand.  ',
      adjustments: sourceAdjustments,
    }, {
      datasetId: FIXTURE_DATASET_ID,
      persist: true,
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('localStorage');
    expect(result.warnings).toEqual([]);
    expect(result.data).toEqual({
      schemaVersion: '1.0.0',
      scenarioId: SCENARIO_ID,
      name: 'Quarter-end plan',
      description: 'Explore higher Atlas demand.',
      createdAt: UPDATED_TIMESTAMP,
      updatedAt: UPDATED_TIMESTAMP,
      adjustments: sourceAdjustments,
    });
    expect(repository.saveScenario).toHaveBeenCalledTimes(1);
    expect(repository.saveScenario).toHaveBeenCalledWith(
      result.data,
      FIXTURE_DATASET_ID,
    );

    sourceAdjustments.allocations[
      'fixture-work-item-001'
    ].Atlas = 99;
    sourceAdjustments.assignments[
      'fixture-work-item-001'
    ].push('Beacon');

    expect(result.data.adjustments).toEqual({
      allocations: {
        'fixture-work-item-001': {
          Atlas: 24,
        },
      },
      assignments: {
        'fixture-work-item-001': ['Atlas'],
      },
    });
  });

  it('applies a scenario to a deep copy without changing the baseline dataset', () => {
    const dataset = createValidDatasetFixture();
    const scenario = createScenarioFixture({
      adjustments: {
        allocations: {
          'fixture-work-item-001': {
            Atlas: 30,
          },
        },
        assignments: {
          'fixture-work-item-001': ['Atlas', 'Beacon'],
        },
      },
    });
    const { service } = createService();

    const result = service.applyScenario(dataset, scenario);

    expect(result.ok).toBe(true);
    expect(result.data).not.toBe(dataset);
    expect(result.data.workItems[0]).not.toBe(dataset.workItems[0]);
    expect(result.data.workItems[0]).toMatchObject({
      recordId: 'fixture-work-item-001',
      team: ['Atlas', 'Beacon'],
      allocations: {
        Atlas: 30,
      },
    });
    expect(dataset.workItems[0]).toMatchObject({
      recordId: 'fixture-work-item-001',
      team: ['Atlas'],
      allocations: {
        Atlas: 20,
      },
    });

    result.data.workItems[0].team.push('Cirrus');
    result.data.workItems[0].allocations.Atlas = 100;
    result.data.capacityRecords[0].capacityPoints = 1;
    result.data.dimensions.teams.push('Cirrus');

    expect(dataset.workItems[0].team).toEqual(['Atlas']);
    expect(dataset.workItems[0].allocations).toEqual({
      Atlas: 20,
    });
    expect(dataset.capacityRecords[0].capacityPoints).toBe(40);
    expect(dataset.dimensions.teams).toEqual([
      'Atlas',
      'Beacon',
    ]);
  });

  it('immutably edits allocation and assignment adjustments', () => {
    const dataset = createValidDatasetFixture();
    const scenario = createScenarioFixture({
      adjustments: {
        allocations: {
          'fixture-work-item-001': {
            Atlas: 20,
          },
        },
        assignments: {
          'fixture-work-item-001': ['Atlas'],
        },
      },
    });
    const { service } = createService();

    const allocationResult = service.updateAllocation(
      scenario,
      'fixture-work-item-001',
      'Beacon',
      '12.5',
      {
        dataset,
        persist: false,
      },
    );

    expect(allocationResult.ok).toBe(true);
    expect(allocationResult.warnings).toEqual([]);
    expect(allocationResult.data).not.toBe(scenario);
    expect(allocationResult.data.adjustments.allocations).toEqual({
      'fixture-work-item-001': {
        Atlas: 20,
        Beacon: 12.5,
      },
    });
    expect(scenario.adjustments.allocations).toEqual({
      'fixture-work-item-001': {
        Atlas: 20,
      },
    });

    const assignmentResult = service.updateAssignment(
      allocationResult.data,
      'fixture-work-item-001',
      [' Beacon ', 'Atlas', 'Beacon'],
      {
        dataset,
        persist: false,
      },
    );

    expect(assignmentResult.ok).toBe(true);
    expect(assignmentResult.data).not.toBe(allocationResult.data);
    expect(
      assignmentResult.data.adjustments.assignments,
    ).toEqual({
      'fixture-work-item-001': ['Beacon', 'Atlas'],
    });
    expect(
      allocationResult.data.adjustments.assignments,
    ).toEqual({
      'fixture-work-item-001': ['Atlas'],
    });
    expect(scenario.adjustments.assignments).toEqual({
      'fixture-work-item-001': ['Atlas'],
    });
  });

  it('calculates baseline and scenario totals without changing capacity', () => {
    const dataset = createValidDatasetFixture();
    const scenario = createScenarioFixture({
      adjustments: {
        allocations: {
          'fixture-work-item-001': {
            Atlas: 30,
          },
        },
        assignments: {},
      },
    });
    const { service } = createService();

    const result = service.calculateComparison(dataset, scenario);

    expect(result.ok).toBe(true);
    expect(result.data.baseline).toMatchObject({
      estimatedPoints: 32,
      allocatedPoints: 32,
      capacityPoints: 72,
      effectiveCapacityPoints: 72,
      variancePoints: 40,
    });
    expect(result.data.scenario).toMatchObject({
      estimatedPoints: 32,
      allocatedPoints: 42,
      capacityPoints: 72,
      effectiveCapacityPoints: 72,
      variancePoints: 30,
    });
    expect(result.data.delta).toEqual({
      estimatedPoints: 0,
      allocatedPoints: 10,
      capacityPoints: 0,
      effectiveCapacityPoints: 0,
      variancePoints: -10,
    });
    expect(
      result.data.baseline.byTeam.Atlas.allocatedPoints,
    ).toBe(20);
    expect(
      result.data.scenario.byTeam.Atlas.allocatedPoints,
    ).toBe(30);
    expect(dataset.workItems[0].allocations.Atlas).toBe(20);
  });

  it('reports memory-only fallback while keeping a successful scenario result', () => {
    const storageError = {
      code: 'STORAGE_QUOTA_EXCEEDED',
      message: 'Browser storage quota was exceeded.',
    };
    const repository = createRepository((scenario) => ({
      ok: true,
      data: scenario,
      mode: 'memory',
      error: storageError,
    }));
    const { service } = createService({ repository });

    const result = service.createScenario({
      name: 'Memory-only scenario',
      description: 'Retained for the current session.',
    }, {
      datasetId: FIXTURE_DATASET_ID,
      persist: true,
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('memory');
    expect(result.error).toEqual(storageError);
    expect(result.data.name).toBe('Memory-only scenario');
    expect(result.warnings).toEqual([
      {
        code: SCENARIO_SERVICE_WARNING_CODES.MEMORY_ONLY,
        message: storageError.message,
      },
    ]);
    expect(repository.saveScenario).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid allocation edits without mutating or persisting the scenario', () => {
    const dataset = createValidDatasetFixture();
    const scenario = createScenarioFixture();
    const repository = createRepository();
    const { service } = createService({ repository });

    const result = service.updateAllocation(
      scenario,
      'fixture-work-item-001',
      'Atlas',
      -1,
      {
        dataset,
        datasetId: FIXTURE_DATASET_ID,
        persist: true,
      },
    );

    expect(result).toEqual({
      ok: false,
      data: null,
      error: {
        code: SCENARIO_SERVICE_ERROR_CODES.INVALID_ALLOCATION,
        message: 'Allocation points must be a finite, non-negative number.',
      },
      warnings: [],
    });
    expect(scenario.adjustments).toEqual({
      allocations: {},
      assignments: {},
    });
    expect(repository.saveScenario).not.toHaveBeenCalled();
  });

  it('rejects edits for work items outside the active baseline dataset', () => {
    const dataset = createValidDatasetFixture();
    const scenario = createScenarioFixture();
    const repository = createRepository();
    const { service } = createService({ repository });

    const result = service.updateAssignment(
      scenario,
      'missing-work-item',
      ['Atlas'],
      {
        dataset,
        datasetId: FIXTURE_DATASET_ID,
        persist: true,
      },
    );

    expect(result).toEqual({
      ok: false,
      data: null,
      error: {
        code: SCENARIO_SERVICE_ERROR_CODES.WORK_ITEM_NOT_FOUND,
        message: 'The selected work item does not exist in the active dataset.',
        details: {
          recordId: 'missing-work-item',
        },
      },
      warnings: [],
    });
    expect(repository.saveScenario).not.toHaveBeenCalled();
  });

  it('returns a safe failure when local scenario persistence fails', () => {
    const repository = createRepository(() => ({
      ok: false,
      data: null,
      error: {
        code: 'SCENARIOS_WRITE_FAILED',
        message: 'Saved scenarios could not be written.',
      },
    }));
    const { service } = createService({ repository });

    const result = service.createScenario({
      name: 'Unsaved scenario',
    }, {
      datasetId: FIXTURE_DATASET_ID,
      persist: true,
    });

    expect(result).toEqual({
      ok: false,
      data: null,
      error: {
        code: 'SCENARIOS_WRITE_FAILED',
        message: 'Saved scenarios could not be written.',
      },
      warnings: [],
    });
    expect(repository.saveScenario).toHaveBeenCalledTimes(1);
  });
});