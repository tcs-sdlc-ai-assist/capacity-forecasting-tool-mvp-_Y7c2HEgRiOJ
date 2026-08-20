import Papa from 'papaparse';
import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';
import {
  DATASET_EXPORT_ERROR_CODES,
  DATASET_EXPORT_FORMATS,
  DatasetExportService,
} from './datasetExportService.js';
import {
  createValidCapacityRecordFixture,
  createValidDatasetFixture,
  createValidWorkItemFixture,
} from '../test/fixtures.js';

const FIXED_NOW = '2026-08-20T12:00:00.000Z';

const createService = (timestamp = FIXED_NOW) => (
  new DatasetExportService(() => new Date(timestamp))
);

const parseCsv = (content) => Papa.parse(content, {
  header: true,
  skipEmptyLines: true,
});

describe('DatasetExportService', () => {
  it('serializes the active dataset as re-importable CSV', () => {
    const dataset = createValidDatasetFixture({
      workItems: [
        createValidWorkItemFixture({
          team: ['Atlas', 'Beacon'],
          allocations: {
            Atlas: 12,
            Beacon: 8,
          },
        }),
      ],
      capacityRecords: [
        createValidCapacityRecordFixture({
          reservedSupportPercent: 10,
          ptoImpactPoints: 2,
          holidayImpactPoints: 1,
        }),
      ],
    });
    const result = createService().createExportFile(dataset);

    expect(result.ok).toBe(true);
    expect(result.data.format).toBe(DATASET_EXPORT_FORMATS.CSV);
    expect(result.data.mimeType).toBe('text/csv');
    expect(result.data.filename).toBe('cft-dataset-2026-08-20.csv');
    expect(result.data.workItemCount).toBe(1);
    expect(result.data.capacityRecordCount).toBe(1);

    const parsed = parseCsv(result.data.content);

    expect(parsed.errors).toEqual([]);
    expect(parsed.meta.fields).toEqual(expect.arrayContaining([
      'recordType',
      'planningLevel',
      'program',
      'feature',
      'estimatedPoints',
      'team',
      'allocations',
      'capacityPoints',
    ]));
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0]).toEqual(expect.objectContaining({
      recordType: 'workItem',
      recordId: 'fixture-work-item-001',
      planningLevel: 'PI 2026.3',
      program: 'Customer Experience',
      feature: 'Self-service account recovery',
      estimatedPoints: '20',
      team: 'Atlas,Beacon',
      allocations: 'Atlas:12;Beacon:8',
    }));
    expect(parsed.data[1]).toEqual(expect.objectContaining({
      recordType: 'capacityRecord',
      planningLevel: 'PI 2026.3',
      team: 'Atlas',
      capacityPoints: '40',
      reservedSupportPercent: '10',
      ptoImpactPoints: '2',
      holidayImpactPoints: '1',
      confidence: 'High',
    }));
  });

  it('serializes the active dataset as re-importable JSON', () => {
    const dataset = createValidDatasetFixture();
    const result = createService().createExportFile(dataset, {
      format: DATASET_EXPORT_FORMATS.JSON,
    });

    expect(result.ok).toBe(true);
    expect(result.data.format).toBe(DATASET_EXPORT_FORMATS.JSON);
    expect(result.data.mimeType).toBe('application/json');
    expect(result.data.filename).toBe('cft-dataset-2026-08-20.json');

    const payload = JSON.parse(result.data.content);

    expect(payload).toEqual({
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      workItems: dataset.workItems,
      capacityRecords: dataset.capacityRecords,
    });
  });

  it('defaults to CSV and accepts dataset-like wrappers', () => {
    const dataset = createValidDatasetFixture();
    const result = createService().createExportFile({
      dataset,
    });

    expect(result.ok).toBe(true);
    expect(result.data.format).toBe(DATASET_EXPORT_FORMATS.CSV);
    expect(result.data.content.startsWith('recordType,')).toBe(true);
  });

  it('rejects missing, empty, and unsupported formats', () => {
    const service = createService();

    expect(service.createExportFile(null)).toEqual({
      ok: false,
      data: null,
      error: {
        code: DATASET_EXPORT_ERROR_CODES.DATASET_REQUIRED,
        message: 'There is no active dataset to export.',
      },
    });
    expect(service.createExportFile({
      workItems: [],
      capacityRecords: [],
    })).toEqual({
      ok: false,
      data: null,
      error: {
        code: DATASET_EXPORT_ERROR_CODES.DATASET_REQUIRED,
        message: 'The active dataset does not contain records to export.',
      },
    });
    expect(service.createExportFile(createValidDatasetFixture(), {
      format: 'xlsx',
    })).toEqual({
      ok: false,
      data: null,
      error: {
        code: DATASET_EXPORT_ERROR_CODES.INVALID_FORMAT,
        message: 'Export format must be CSV or JSON.',
      },
    });
  });
});
