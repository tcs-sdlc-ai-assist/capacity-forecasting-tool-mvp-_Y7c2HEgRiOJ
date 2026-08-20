import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';
import {
  createCapacityRecord,
  createDatasetMetadata,
  createNormalizedDataset,
  createWorkItem,
} from '../domain/schemas.js';

export const FIXTURE_TIMESTAMP = '2026-08-20T12:00:00.000Z';
export const FIXTURE_DATASET_ID = 'test-dataset-001';

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const deepFreeze = (value) => {
  if (
    value === null
    || typeof value !== 'object'
    || Object.isFrozen(value)
  ) {
    return value;
  }

  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const createBaseWorkItem = (overrides = {}) => createWorkItem({
  recordId: 'fixture-work-item-001',
  planningLevel: 'PI 2026.3',
  program: 'Customer Experience',
  epic: 'Account modernization',
  itemId: 'FIX-101',
  feature: 'Self-service account recovery',
  featureWorkType: 'Business Feature',
  owner: 'Test Planner',
  estimatedPoints: 20,
  team: ['Atlas'],
  art: 'Customer ART',
  status: 'Committed',
  startDate: '2026-07-01',
  endDate: '2026-09-30',
  allocations: {
    Atlas: 20,
  },
  ...overrides,
});

const createBaseCapacityRecord = (overrides = {}) => (
  createCapacityRecord({
    planningLevel: 'PI 2026.3',
    team: 'Atlas',
    capacityPoints: 40,
    reservedSupportPercent: 0,
    ptoImpactPoints: 0,
    holidayImpactPoints: 0,
    confidence: 'High',
    ...overrides,
  })
);

/**
 * Creates a compact canonical work-item fixture.
 *
 * @param {object} overrides Work-item fields to replace.
 * @returns {object} Canonical work item.
 */
export const createValidWorkItemFixture = (overrides = {}) => (
  createBaseWorkItem(overrides)
);

/**
 * Creates a compact canonical capacity-record fixture.
 *
 * @param {object} overrides Capacity fields to replace.
 * @returns {object} Canonical capacity record.
 */
export const createValidCapacityRecordFixture = (overrides = {}) => (
  createBaseCapacityRecord(overrides)
);

/**
 * Creates a compact canonical normalized dataset.
 *
 * @param {object} overrides Dataset fields to replace.
 * @returns {object} Canonical normalized dataset.
 */
export const createValidDatasetFixture = (overrides = {}) => {
  const input = {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    workItems: [
      createBaseWorkItem(),
      createBaseWorkItem({
        recordId: 'fixture-work-item-002',
        program: 'Data Platform',
        epic: 'Analytics modernization',
        itemId: 'FIX-102',
        feature: 'Operational analytics dashboard',
        featureWorkType: 'Enabler',
        owner: 'Test Manager',
        estimatedPoints: 12,
        team: ['Beacon'],
        art: 'Data ART',
        status: 'Planned',
        allocations: {
          Beacon: 12,
        },
      }),
    ],
    capacityRecords: [
      createBaseCapacityRecord(),
      createBaseCapacityRecord({
        team: 'Beacon',
        capacityPoints: 32,
        confidence: 'Medium',
      }),
    ],
    ...overrides,
  };

  return createNormalizedDataset(input);
};

/**
 * Creates metadata matching a supplied canonical dataset.
 *
 * @param {object} dataset Canonical dataset.
 * @param {object} overrides Metadata fields to replace.
 * @returns {object} Canonical dataset metadata.
 */
export const createValidDatasetMetadataFixture = (
  dataset = createValidDatasetFixture(),
  overrides = {},
) => createDatasetMetadata({
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  datasetId: FIXTURE_DATASET_ID,
  name: 'Sanitized Test Dataset',
  sourceType: 'import',
  importedAt: FIXTURE_TIMESTAMP,
  sourceUpdatedAt: FIXTURE_TIMESTAMP,
  recordCounts: {
    workItems: dataset.workItems.length,
    capacityRecords: dataset.capacityRecords.length,
    warnings: 0,
    rejected: 0,
  },
  persistenceMode: 'localStorage',
  ...overrides,
});

/**
 * Creates a valid dataset containing an allocation without matching capacity.
 *
 * @returns {object} Canonical dataset with a capacity coverage gap.
 */
export const createMissingCapacityDatasetFixture = () => (
  createNormalizedDataset({
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    workItems: [
      createBaseWorkItem({
        team: ['Atlas', 'Uncovered Team'],
        estimatedPoints: 30,
        allocations: {
          Atlas: 20,
          'Uncovered Team': 10,
        },
      }),
    ],
    capacityRecords: [
      createBaseCapacityRecord(),
    ],
  })
);

/**
 * Creates parser-shaped source data containing an invalid calendar date.
 *
 * @returns {object} Independent invalid-date source payload.
 */
export const createInvalidDateFixture = () => ({
  format: 'json',
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  workItems: [
    {
      recordId: 'fixture-invalid-date-001',
      planningLevel: 'PI 2026.3',
      program: 'Customer Experience',
      epic: 'Account modernization',
      itemId: 'FIX-INVALID-DATE',
      feature: 'Invalid date example',
      featureWorkType: 'Business Feature',
      owner: 'Test Planner',
      estimatedPoints: 8,
      team: ['Atlas'],
      art: 'Customer ART',
      status: 'Planned',
      startDate: '2026-02-30',
      endDate: '2026-09-30',
      allocations: {
        Atlas: 8,
      },
    },
  ],
  capacityRecords: [
    {
      planningLevel: 'PI 2026.3',
      team: 'Atlas',
      capacityPoints: 40,
      reservedSupportPercent: 0,
      ptoImpactPoints: 0,
      holidayImpactPoints: 0,
      confidence: 'High',
    },
  ],
  workItemRowRefs: [2],
  capacityRecordRowRefs: [3],
  rowRefs: [2, 3],
});

/**
 * Creates an envelope that intentionally violates the normalized schema.
 *
 * @returns {object} Independent malformed schema fixture.
 */
export const createMalformedSchemaFixture = () => ({
  schemaVersion: '999.0.0',
  workItems: {
    unexpected: 'Work items must be an array.',
  },
  capacityRecords: [],
  dimensions: {
    planningLevels: ['PI 2026.3'],
  },
});

/**
 * Creates a valid dataset with deterministic values for sorting tests.
 *
 * @returns {object} Canonical sorting dataset.
 */
export const createSortingDatasetFixture = () => (
  createNormalizedDataset({
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    workItems: [
      createBaseWorkItem({
        recordId: 'sorting-item-003',
        program: 'Zulu Program',
        itemId: 'SORT-003',
        feature: 'Third feature',
        owner: 'Alex Planner',
        estimatedPoints: 8,
        allocations: {
          Atlas: 8,
        },
      }),
      createBaseWorkItem({
        recordId: 'sorting-item-001',
        program: 'Alpha Program',
        itemId: 'SORT-001',
        feature: 'First feature',
        owner: 'Morgan Planner',
        estimatedPoints: 13,
        allocations: {
          Atlas: 13,
        },
      }),
      createBaseWorkItem({
        recordId: 'sorting-item-002',
        program: 'Alpha Program',
        itemId: 'SORT-002',
        feature: 'Second feature',
        owner: 'Alex Planner',
        estimatedPoints: 5,
        team: ['Beacon'],
        allocations: {
          Beacon: 5,
        },
      }),
      createBaseWorkItem({
        recordId: 'sorting-item-004',
        program: 'Beta Program',
        itemId: 'SORT-004',
        feature: 'Fourth feature',
        owner: 'Taylor Planner',
        estimatedPoints: 5,
        team: ['Beacon'],
        allocations: {
          Beacon: 5,
        },
      }),
    ],
    capacityRecords: [
      createBaseCapacityRecord(),
      createBaseCapacityRecord({
        team: 'Beacon',
        capacityPoints: 30,
        confidence: 'Medium',
      }),
    ],
  })
);

export const VALID_WORK_ITEM_FIXTURE = deepFreeze(
  createValidWorkItemFixture(),
);

export const VALID_CAPACITY_RECORD_FIXTURE = deepFreeze(
  createValidCapacityRecordFixture(),
);

export const VALID_DATASET_FIXTURE = deepFreeze(
  createValidDatasetFixture(),
);

export const VALID_DATASET_METADATA_FIXTURE = deepFreeze(
  createValidDatasetMetadataFixture(VALID_DATASET_FIXTURE),
);

export const MISSING_CAPACITY_DATASET_FIXTURE = deepFreeze(
  createMissingCapacityDatasetFixture(),
);

export const INVALID_DATE_FIXTURE = deepFreeze(
  createInvalidDateFixture(),
);

export const MALFORMED_SCHEMA_FIXTURE = deepFreeze(
  createMalformedSchemaFixture(),
);

export const SORTING_DATASET_FIXTURE = deepFreeze(
  createSortingDatasetFixture(),
);

export const ASCENDING_PROGRAM_SORTING_FIXTURE = deepFreeze([
  {
    id: 'program',
    desc: false,
  },
]);

export const DESCENDING_POINTS_SORTING_FIXTURE = deepFreeze([
  {
    id: 'estimatedPoints',
    desc: true,
  },
]);

export const MULTI_COLUMN_SORTING_FIXTURE = deepFreeze([
  {
    id: 'program',
    desc: false,
  },
  {
    id: 'owner',
    desc: false,
  },
]);

export const validWorkItemFixture = VALID_WORK_ITEM_FIXTURE;
export const validCapacityRecordFixture = VALID_CAPACITY_RECORD_FIXTURE;
export const validDatasetFixture = VALID_DATASET_FIXTURE;
export const validDatasetMetadataFixture = VALID_DATASET_METADATA_FIXTURE;
export const missingCapacityFixture = MISSING_CAPACITY_DATASET_FIXTURE;
export const missingCapacityDatasetFixture = (
  MISSING_CAPACITY_DATASET_FIXTURE
);
export const invalidDateFixture = INVALID_DATE_FIXTURE;
export const invalidDateDatasetFixture = INVALID_DATE_FIXTURE;
export const malformedSchemaFixture = MALFORMED_SCHEMA_FIXTURE;
export const sortingFixture = SORTING_DATASET_FIXTURE;
export const sortingDatasetFixture = SORTING_DATASET_FIXTURE;

/**
 * Returns an independent JSON-safe copy of a fixture.
 *
 * @param {*} fixture Fixture value to clone.
 * @returns {*} Independent fixture copy.
 */
export const cloneFixture = (fixture) => cloneJson(fixture);

export default Object.freeze({
  validWorkItem: VALID_WORK_ITEM_FIXTURE,
  validCapacityRecord: VALID_CAPACITY_RECORD_FIXTURE,
  validDataset: VALID_DATASET_FIXTURE,
  validDatasetMetadata: VALID_DATASET_METADATA_FIXTURE,
  missingCapacityDataset: MISSING_CAPACITY_DATASET_FIXTURE,
  invalidDate: INVALID_DATE_FIXTURE,
  malformedSchema: MALFORMED_SCHEMA_FIXTURE,
  sortingDataset: SORTING_DATASET_FIXTURE,
  ascendingProgramSorting: ASCENDING_PROGRAM_SORTING_FIXTURE,
  descendingPointsSorting: DESCENDING_POINTS_SORTING_FIXTURE,
  multiColumnSorting: MULTI_COLUMN_SORTING_FIXTURE,
});