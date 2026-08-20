import {
  calculateEffectiveCapacity,
  createCapacityCellMetric,
  selectCapacityDetailPayload,
  selectCapacityRows,
  selectCapacitySummary,
} from './capacitySelectors.js';
import {
  CAPACITY_STATES,
  DEFAULT_THRESHOLDS,
} from '../../../constants/domainConstants.js';
import {
  createNormalizedDataset,
  createScenario,
} from '../../../domain/schemas.js';
import scenarioService from '../../../services/scenarioService.js';
import {
  FIXTURE_TIMESTAMP,
  createMissingCapacityDatasetFixture,
  createValidCapacityRecordFixture,
  createValidDatasetFixture,
  createValidWorkItemFixture,
} from '../../../test/fixtures.js';

const createRunningTotalDataset = () => createNormalizedDataset({
  schemaVersion: '1.0.0',
  workItems: [
    createValidWorkItemFixture({
      recordId: 'running-item-001',
      planningLevel: 'PI 2026.3',
      program: 'Included Program',
      itemId: 'RUN-001',
      feature: 'First Atlas feature',
      estimatedPoints: 10,
      team: ['Atlas'],
      allocations: {
        Atlas: 10,
      },
    }),
    createValidWorkItemFixture({
      recordId: 'running-item-002',
      planningLevel: 'PI 2026.3',
      program: 'Included Program',
      itemId: 'RUN-002',
      feature: 'Second Atlas feature',
      estimatedPoints: 30,
      team: ['Atlas'],
      allocations: {
        Atlas: 15,
      },
    }),
    createValidWorkItemFixture({
      recordId: 'running-item-003',
      planningLevel: 'PI 2026.4',
      program: 'Other Program',
      itemId: 'RUN-003',
      feature: 'Later planning-level feature',
      estimatedPoints: 20,
      team: ['Atlas'],
      allocations: {
        Atlas: 7,
      },
    }),
    createValidWorkItemFixture({
      recordId: 'running-item-004',
      planningLevel: 'PI 2026.3',
      program: 'Included Program',
      itemId: 'RUN-004',
      feature: 'Beacon feature',
      estimatedPoints: 5,
      team: ['Beacon'],
      allocations: {
        Beacon: 5,
      },
    }),
  ],
  capacityRecords: [
    createValidCapacityRecordFixture({
      planningLevel: 'PI 2026.3',
      team: 'Atlas',
      capacityPoints: 40,
    }),
    createValidCapacityRecordFixture({
      planningLevel: 'PI 2026.4',
      team: 'Atlas',
      capacityPoints: 20,
    }),
    createValidCapacityRecordFixture({
      planningLevel: 'PI 2026.3',
      team: 'Beacon',
      capacityPoints: 10,
    }),
  ],
});

describe('capacitySelectors', () => {
  describe('visible-order running totals', () => {
    it('calculates running totals in visible sort order for each planning-level and team group', () => {
      const dataset = createRunningTotalDataset();

      const rows = selectCapacityRows(
        dataset,
        {},
        [
          {
            id: 'estimatedPoints',
            desc: true,
          },
        ],
      );

      expect(rows.map((row) => row.recordId)).toEqual([
        'running-item-002',
        'running-item-003',
        'running-item-001',
        'running-item-004',
      ]);
      expect(
        rows[0].capacityByTeam.Atlas.cumulativeAllocationPoints,
      ).toBe(15);
      expect(
        rows[1].capacityByTeam.Atlas.cumulativeAllocationPoints,
      ).toBe(7);
      expect(
        rows[2].capacityByTeam.Atlas.cumulativeAllocationPoints,
      ).toBe(25);
      expect(
        rows[3].capacityByTeam.Atlas.cumulativeAllocationPoints,
      ).toBe(25);
      expect(
        rows[3].capacityByTeam.Beacon.cumulativeAllocationPoints,
      ).toBe(5);
    });

    it('excludes filtered work items from running totals and summary metrics', () => {
      const dataset = createNormalizedDataset({
        schemaVersion: '1.0.0',
        workItems: [
          createValidWorkItemFixture({
            recordId: 'filtered-item-001',
            program: 'Excluded Program',
            itemId: 'FILTER-001',
            feature: 'Excluded feature',
            estimatedPoints: 30,
            allocations: {
              Atlas: 30,
            },
          }),
          createValidWorkItemFixture({
            recordId: 'filtered-item-002',
            program: 'Included Program',
            itemId: 'FILTER-002',
            feature: 'Included feature one',
            estimatedPoints: 10,
            allocations: {
              Atlas: 10,
            },
          }),
          createValidWorkItemFixture({
            recordId: 'filtered-item-003',
            program: 'Included Program',
            itemId: 'FILTER-003',
            feature: 'Included feature two',
            estimatedPoints: 5,
            allocations: {
              Atlas: 5,
            },
          }),
        ],
        capacityRecords: [
          createValidCapacityRecordFixture({
            capacityPoints: 40,
          }),
        ],
      });
      const filters = {
        selectedPrograms: ['Included Program'],
      };

      const rows = selectCapacityRows(dataset, filters);
      const summary = selectCapacitySummary(dataset, filters);

      expect(rows.map((row) => row.recordId)).toEqual([
        'filtered-item-002',
        'filtered-item-003',
      ]);
      expect(
        rows.map((row) => (
          row.capacityByTeam.Atlas.cumulativeAllocationPoints
        )),
      ).toEqual([10, 15]);
      expect(summary).toMatchObject({
        allocatedPoints: 15,
        effectiveCapacityPoints: 40,
        differentialPoints: 25,
        utilizationPercent: 37.5,
        state: CAPACITY_STATES.HEALTHY,
        workItemCount: 2,
      });
    });
  });

  describe('capacity calculations and thresholds', () => {
    it('calculates effective capacity, differential, utilization, and default threshold state', () => {
      const capacityRecord = createValidCapacityRecordFixture({
        capacityPoints: 40,
        reservedSupportPercent: 25,
        ptoImpactPoints: 3,
        holidayImpactPoints: 2,
      });

      const metric = createCapacityCellMetric({
        planningLevel: 'PI 2026.3',
        team: 'Atlas',
        allocationPoints: 8,
        cumulativeAllocationPoints: 20,
        capacityRecord,
      }, DEFAULT_THRESHOLDS);

      expect(calculateEffectiveCapacity(capacityRecord)).toBe(25);
      expect(metric).toMatchObject({
        allocationPoints: 8,
        cumulativeAllocationPoints: 20,
        capacityPoints: 40,
        effectiveCapacityPoints: 25,
        differentialPoints: 5,
        remainingCapacityPoints: 5,
        overCapacityPoints: 0,
        utilizationPercent: 80,
        state: CAPACITY_STATES.CONSTRAINED,
        isAvailable: true,
      });
    });

    it('applies custom thresholds and classifies zero and exceeded utilization', () => {
      const capacityRecord = createValidCapacityRecordFixture({
        capacityPoints: 25,
      });
      const healthyMetric = createCapacityCellMetric({
        allocationPoints: 20,
        cumulativeAllocationPoints: 20,
        capacityRecord,
      }, {
        constrained: 90,
        exceeded: 110,
      });
      const exceededMetric = createCapacityCellMetric({
        allocationPoints: 10,
        cumulativeAllocationPoints: 30,
        capacityRecord,
      }, DEFAULT_THRESHOLDS);
      const availableMetric = createCapacityCellMetric({
        allocationPoints: 0,
        cumulativeAllocationPoints: 0,
        capacityRecord,
      }, DEFAULT_THRESHOLDS);

      expect(healthyMetric.state).toBe(CAPACITY_STATES.HEALTHY);
      expect(healthyMetric.utilizationPercent).toBe(80);
      expect(exceededMetric).toMatchObject({
        differentialPoints: -5,
        remainingCapacityPoints: 0,
        overCapacityPoints: 5,
        utilizationPercent: 120,
        state: CAPACITY_STATES.EXCEEDED,
      });
      expect(availableMetric).toMatchObject({
        utilizationPercent: 0,
        state: CAPACITY_STATES.AVAILABLE,
      });
    });

    it('returns null or zero effective capacity for invalid and exhausted records', () => {
      expect(calculateEffectiveCapacity(null)).toBeNull();
      expect(calculateEffectiveCapacity({
        capacityPoints: -1,
      })).toBeNull();
      expect(calculateEffectiveCapacity({
        capacityPoints: 20,
        reservedSupportPercent: 50,
        ptoImpactPoints: 8,
        holidayImpactPoints: 5,
      })).toBe(0);
    });
  });

  describe('missing capacity coverage', () => {
    it('marks allocations without matching capacity as unavailable while retaining their totals', () => {
      const dataset = createMissingCapacityDatasetFixture();

      const rows = selectCapacityRows(dataset);
      const detail = selectCapacityDetailPayload(dataset, {
        planningLevel: 'PI 2026.3',
        team: 'Uncovered Team',
        thresholds: DEFAULT_THRESHOLDS,
      });
      const uncoveredMetric = rows[0].capacityByTeam['Uncovered Team'];

      expect(uncoveredMetric).toMatchObject({
        allocationPoints: 10,
        cumulativeAllocationPoints: 10,
        capacityPoints: null,
        effectiveCapacityPoints: null,
        differentialPoints: null,
        utilizationPercent: null,
        state: CAPACITY_STATES.UNAVAILABLE,
        capacityState: CAPACITY_STATES.UNAVAILABLE,
        isAvailable: false,
        hasCapacityRecord: false,
      });
      expect(detail).toMatchObject({
        team: 'Uncovered Team',
        planningLevel: 'PI 2026.3',
        allocationPoints: 10,
        cumulativeAllocationPoints: 10,
        workItemCount: 1,
        state: CAPACITY_STATES.UNAVAILABLE,
        isAvailable: false,
      });
      expect(detail.recordIds).toEqual([
        'fixture-work-item-001',
      ]);
    });

    it('marks a zero-capacity context unavailable without producing infinite utilization', () => {
      const metric = createCapacityCellMetric({
        planningLevel: 'PI 2026.3',
        team: 'Atlas',
        allocationPoints: 5,
        cumulativeAllocationPoints: 5,
        capacityRecord: createValidCapacityRecordFixture({
          capacityPoints: 0,
        }),
      });

      expect(metric).toMatchObject({
        effectiveCapacityPoints: null,
        differentialPoints: null,
        utilizationPercent: null,
        state: CAPACITY_STATES.UNAVAILABLE,
        isAvailable: false,
        hasCapacityRecord: true,
      });
    });
  });

  describe('scenario comparison totals', () => {
    it('keeps baseline capacity unchanged while reporting scenario allocation deltas', () => {
      const dataset = createValidDatasetFixture();
      const scenario = createScenario({
        scenarioId: 'scenario-capacity-test-001',
        name: 'Higher Atlas allocation',
        description: 'Increase the Atlas allocation for comparison.',
        createdAt: FIXTURE_TIMESTAMP,
        updatedAt: FIXTURE_TIMESTAMP,
        adjustments: {
          assignments: {},
          allocations: {
            'fixture-work-item-001': {
              Atlas: 30,
            },
          },
        },
      });

      const comparisonResult = scenarioService.calculateComparison(
        dataset,
        scenario,
      );
      const projectionResult = scenarioService.applyScenario(
        dataset,
        scenario,
      );

      expect(comparisonResult.ok).toBe(true);
      expect(projectionResult.ok).toBe(true);

      const baselineSummary = selectCapacitySummary(dataset);
      const scenarioSummary = selectCapacitySummary(
        projectionResult.data,
      );

      expect(comparisonResult.data.baseline).toMatchObject({
        allocatedPoints: 32,
        effectiveCapacityPoints: 72,
      });
      expect(comparisonResult.data.scenario).toMatchObject({
        allocatedPoints: 42,
        effectiveCapacityPoints: 72,
      });
      expect(comparisonResult.data.delta).toMatchObject({
        allocatedPoints: 10,
        capacityPoints: 0,
        effectiveCapacityPoints: 0,
        variancePoints: -10,
      });
      expect(
        comparisonResult.data.scenario.byTeam.Atlas.allocatedPoints,
      ).toBe(30);
      expect(
        comparisonResult.data.scenario.byTeam.Beacon.allocatedPoints,
      ).toBe(12);
      expect(baselineSummary.allocatedPoints).toBe(
        comparisonResult.data.baseline.allocatedPoints,
      );
      expect(scenarioSummary.allocatedPoints).toBe(
        comparisonResult.data.scenario.allocatedPoints,
      );
      expect(scenarioSummary.effectiveCapacityPoints).toBe(
        baselineSummary.effectiveCapacityPoints,
      );
    });
  });
});