import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';
import {
  createDatasetMetadata,
  createNormalizedDataset,
} from '../domain/schemas.js';
import sampleDataset from './sampleDataset.json';

const MOCK_DATASET_ID = 'cft-bundled-demo-v4';
const MOCK_DATASET_DATE = '2026-08-21T00:00:00.000Z';

const deepFreeze = (value) => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const normalizedMockDataset = createNormalizedDataset({
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  workItems: sampleDataset.workItems,
  capacityRecords: sampleDataset.capacityRecords,
});

export const MOCK_DATASET = deepFreeze(normalizedMockDataset);

export const MOCK_DATASET_METADATA = deepFreeze(createDatasetMetadata({
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  datasetId: MOCK_DATASET_ID,
  name: 'Capacity Forecast Tool Sample Dataset',
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
 * Returns an independent canonical copy of the bundled sample dataset.
 *
 * @returns {object} Normalized sample dataset safe for callers to modify.
 */
export const getMockDataset = () => createNormalizedDataset(MOCK_DATASET);

/**
 * Returns an independent canonical copy of the sample dataset metadata.
 *
 * @returns {object} Sample dataset metadata safe for callers to modify.
 */
export const getMockDatasetMetadata = () => (
  createDatasetMetadata(MOCK_DATASET_METADATA)
);

export const createMockDataset = getMockDataset;
export const mockDataset = MOCK_DATASET;
export const mockDatasetMetadata = MOCK_DATASET_METADATA;

export default MOCK_DATASET;
