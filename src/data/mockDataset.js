import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';
import {
  createDatasetMetadata,
  createNormalizedDataset,
} from '../domain/schemas.js';

const MOCK_DATASET_ID = 'cft-bundled-demo-v1';
const MOCK_DATASET_DATE = '2026-08-20T00:00:00.000Z';

const PLANNING_LEVELS = Object.freeze([
  'PI 2026.3',
  'PI 2026.4',
  'PI 2027.1',
  'PI 2027.2',
  'PI 2027.3',
  'PI 2027.4',
]);

const PLANNING_LEVEL_DATES = Object.freeze([
  Object.freeze({
    startDate: '2026-07-01',
    endDate: '2026-09-30',
  }),
  Object.freeze({
    startDate: '2026-10-01',
    endDate: '2026-12-31',
  }),
  Object.freeze({
    startDate: '2027-01-01',
    endDate: '2027-03-31',
  }),
  Object.freeze({
    startDate: '2027-04-01',
    endDate: '2027-06-30',
  }),
  Object.freeze({
    startDate: '2027-07-01',
    endDate: '2027-09-30',
  }),
  Object.freeze({
    startDate: '2027-10-01',
    endDate: '2027-12-31',
  }),
]);

const PROGRAMS = Object.freeze([
  'Customer Identity',
  'Digital Commerce',
  'Enterprise Analytics',
  'Finance Modernization',
  'Fulfillment Excellence',
  'Growth Platform',
  'Intelligent Operations',
  'Partner Experience',
  'Payments Evolution',
  'People Systems',
  'Risk and Compliance',
  'Service Reliability',
  'Supply Chain Visibility',
  'Unified Customer Data',
]);

const OWNERS = Object.freeze([
  'Avery Brooks',
  'Blake Chen',
  'Cameron Diaz',
  'Devon Evans',
  'Emery Foster',
  'Finley Garcia',
  'Gray Harper',
  'Hayden Ito',
  'Indigo Johnson',
  'Jordan Kim',
  'Kai Lewis',
  'Logan Morgan',
  'Morgan Nguyen',
  'Noel Ortiz',
  'Parker Patel',
  'Quinn Reed',
  'Riley Singh',
  'Sage Thompson',
  'Taylor Usman',
  'Winter Vega',
]);

const TEAMS = Object.freeze([
  'Atlas',
  'Beacon',
  'Cirrus',
  'Delta',
  'Ember',
  'Falcon',
  'Gemini',
  'Harbor',
  'Ion',
  'Juniper',
  'Keystone',
  'Lumen',
]);

const ARTS = Object.freeze([
  'Customer ART',
  'Data ART',
  'Operations ART',
  'Platform ART',
]);

const WORK_TYPES = Object.freeze([
  'Business Feature',
  'Enabler',
  'Regulatory',
  'Technical Debt',
]);

const STATUSES = Object.freeze([
  'Approved',
  'Committed',
  'Discovery',
  'Planned',
]);

const FEATURE_THEMES = Object.freeze([
  'self-service workflow',
  'operational dashboard',
  'automated controls',
  'data quality service',
  'partner integration',
  'resilience improvements',
]);

const CAPACITY_PROFILES = Object.freeze([
  Object.freeze({
    allocationPoints: 0,
    capacityPoints: 40,
    confidence: 'High',
  }),
  Object.freeze({
    allocationPoints: 24,
    capacityPoints: 40,
    confidence: 'High',
  }),
  Object.freeze({
    allocationPoints: 34,
    capacityPoints: 40,
    confidence: 'Medium',
  }),
  Object.freeze({
    allocationPoints: 40,
    capacityPoints: 40,
    confidence: 'Medium',
  }),
  Object.freeze({
    allocationPoints: 50,
    capacityPoints: 40,
    confidence: 'Low',
  }),
  Object.freeze({
    allocationPoints: 10,
    capacityPoints: 0,
    confidence: 'Unknown',
  }),
]);

const createWorkItems = () => (
  PLANNING_LEVELS.flatMap((planningLevel, planningLevelIndex) => (
    FEATURE_THEMES.map((theme, itemIndex) => {
      const recordIndex = (planningLevelIndex * FEATURE_THEMES.length)
        + itemIndex;
      const firstTeamIndex = itemIndex * 2;
      const secondTeamIndex = firstTeamIndex + 1;
      const firstTeam = TEAMS[firstTeamIndex];
      const secondTeam = TEAMS[secondTeamIndex];
      const firstAllocation = CAPACITY_PROFILES[
        firstTeamIndex % CAPACITY_PROFILES.length
      ].allocationPoints;
      const secondAllocation = CAPACITY_PROFILES[
        secondTeamIndex % CAPACITY_PROFILES.length
      ].allocationPoints;
      const program = PROGRAMS[recordIndex % PROGRAMS.length];

      return {
        recordId: `mock-work-item-${String(recordIndex + 1).padStart(3, '0')}`,
        planningLevel,
        program,
        epic: `${program} transformation`,
        itemId: `CFT-${1201 + recordIndex}`,
        feature: `${program}: ${theme}`,
        featureWorkType: WORK_TYPES[recordIndex % WORK_TYPES.length],
        owner: OWNERS[recordIndex % OWNERS.length],
        estimatedPoints: firstAllocation + secondAllocation,
        team: [firstTeam, secondTeam],
        art: ARTS[itemIndex % ARTS.length],
        status: STATUSES[
          (planningLevelIndex + itemIndex) % STATUSES.length
        ],
        startDate: PLANNING_LEVEL_DATES[planningLevelIndex].startDate,
        endDate: PLANNING_LEVEL_DATES[planningLevelIndex].endDate,
        allocations: {
          [firstTeam]: firstAllocation,
          [secondTeam]: secondAllocation,
        },
      };
    })
  ))
);

const createCapacityRecords = () => (
  PLANNING_LEVELS.flatMap((planningLevel, planningLevelIndex) => (
    TEAMS.map((team, teamIndex) => {
      const profile = CAPACITY_PROFILES[
        teamIndex % CAPACITY_PROFILES.length
      ];

      return {
        planningLevel,
        team,
        capacityPoints: profile.capacityPoints,
        reservedSupportPercent: 0,
        ptoImpactPoints: 0,
        holidayImpactPoints: 0,
        confidence: profile.confidence,
        planningOrder: planningLevelIndex,
      };
    }).map(({
      planningOrder: _planningOrder,
      ...capacityRecord
    }) => capacityRecord)
  ))
);

const deepFreeze = (value) => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const normalizedMockDataset = createNormalizedDataset({
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  workItems: createWorkItems(),
  capacityRecords: createCapacityRecords(),
});

export const MOCK_DATASET = deepFreeze(normalizedMockDataset);

export const MOCK_DATASET_METADATA = deepFreeze(createDatasetMetadata({
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  datasetId: MOCK_DATASET_ID,
  name: 'Capacity Forecast Tool Demo Dataset',
  sourceType: 'mock',
  importedAt: MOCK_DATASET_DATE,
  sourceUpdatedAt: MOCK_DATASET_DATE,
  recordCounts: {
    workItems: MOCK_DATASET.workItems.length,
    capacityRecords: MOCK_DATASET.capacityRecords.length,
    warnings: 0,
    rejected: 0,
  },
  persistenceMode: 'localStorage',
}));

/**
 * Returns an independent canonical copy of the bundled mock dataset.
 *
 * @returns {object} Normalized synthetic dataset safe for callers to modify.
 */
export const getMockDataset = () => createNormalizedDataset(MOCK_DATASET);

/**
 * Returns an independent canonical copy of the mock dataset metadata.
 *
 * @returns {object} Synthetic dataset metadata safe for callers to modify.
 */
export const getMockDatasetMetadata = () => (
  createDatasetMetadata(MOCK_DATASET_METADATA)
);

export const createMockDataset = getMockDataset;
export const mockDataset = MOCK_DATASET;
export const mockDatasetMetadata = MOCK_DATASET_METADATA;

export default MOCK_DATASET;