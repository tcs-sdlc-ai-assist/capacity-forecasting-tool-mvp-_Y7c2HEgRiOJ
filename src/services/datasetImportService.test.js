import {
  DATASET_IMPORT_ERROR_CODES,
  DatasetImportService,
} from './datasetImportService.js';
import { BrowserStorageAdapter } from '../platform/storage/browserStorageAdapter.js';
import { MemoryFallbackStore } from '../platform/storage/memoryFallbackStore.js';
import { PersistentStore } from '../platform/storage/persistentStore.js';
import { DatasetRepository } from '../repositories/datasetRepository.js';
import {
  ImportSummaryRepository,
} from '../repositories/importSummaryRepository.js';
import {
  createNoticeCenterStore,
} from '../stores/noticeCenterStore.js';
import {
  CapacityCoverageValidator,
} from './import/capacityCoverageValidator.js';
import {
  NormalizationService,
} from './import/normalizationService.js';
import { ParserRegistry } from './import/parserRegistry.js';
import {
  createValidDatasetFixture,
  createValidDatasetMetadataFixture,
} from '../test/fixtures.js';

const FIXED_NOW = '2026-08-20T12:00:00.000Z';
const IMPORT_DATASET_ID = 'import-dataset-test-001';

const createStorage = () => {
  const values = new Map();

  return {
    get length() {
      return values.size;
    },

    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },

    setItem(key, value) {
      values.set(key, String(value));
    },

    removeItem(key) {
      values.delete(key);
    },

    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
  };
};

const createWorkItem = (overrides = {}) => ({
  recordId: 'import-work-item-001',
  planningLevel: 'PI 2026.3',
  program: 'Customer Experience',
  epic: 'Account modernization',
  itemId: 'IMP-101',
  feature: 'Self-service account recovery',
  featureWorkType: 'Business Feature',
  owner: 'Import Planner',
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

const createCapacityRecord = (overrides = {}) => ({
  planningLevel: 'PI 2026.3',
  team: 'Atlas',
  capacityPoints: 40,
  reservedSupportPercent: 0,
  ptoImpactPoints: 0,
  holidayImpactPoints: 0,
  confidence: 'High',
  ...overrides,
});

const createJsonDescriptor = (payload, overrides = {}) => {
  const textContent = JSON.stringify(payload);

  return {
    fileName: 'capacity-forecast.json',
    mimeType: 'application/json',
    sizeBytes: textContent.length,
    textContent,
    options: {
      activateOnSuccess: true,
    },
    ...overrides,
  };
};

const createCsvDescriptor = (textContent, overrides = {}) => ({
  fileName: 'capacity-forecast.csv',
  mimeType: 'text/csv',
  sizeBytes: textContent.length,
  textContent,
  options: {
    activateOnSuccess: true,
  },
  ...overrides,
});

const createValidJsonPayload = (overrides = {}) => ({
  schemaVersion: '1.0.0',
  workItems: [
    createWorkItem(),
  ],
  capacityRecords: [
    createCapacityRecord(),
  ],
  ...overrides,
});

const createValidCsv = () => [
  'recordType,planningLevel,program,epic,itemId,feature,featureWorkType,owner,estimatedPoints,team,art,status,startDate,endDate,allocationPoints,capacityPoints,reservedSupportPercent,ptoImpactPoints,holidayImpactPoints,confidence',
  'workItem,PI 2026.3,Customer Experience,Account modernization,IMP-101,Self-service account recovery,Business Feature,Import Planner,20,Atlas,Customer ART,Committed,2026-07-01,2026-09-30,20,,,,,',
  'capacityRecord,PI 2026.3,,,,,,,,Atlas,,,,,,40,0,0,0,High',
].join('\n');

const createHarness = () => {
  const windowStorage = createStorage();
  const storageAdapter = new BrowserStorageAdapter(
    windowStorage,
    new MemoryFallbackStore(),
  );
  const persistentStore = new PersistentStore(storageAdapter);
  const datasetRepository = new DatasetRepository(persistentStore);
  const importSummaryRepository = new ImportSummaryRepository(
    persistentStore,
  );
  let noticeSequence = 0;
  const noticeCenterStore = createNoticeCenterStore(
    persistentStore,
    () => new Date(FIXED_NOW),
    () => {
      noticeSequence += 1;
      return `import-notice-${noticeSequence}`;
    },
  );
  const service = new DatasetImportService(
    new ParserRegistry(),
    new NormalizationService(),
    new CapacityCoverageValidator(),
    datasetRepository,
    importSummaryRepository,
    noticeCenterStore,
    null,
    () => new Date(FIXED_NOW),
    () => IMPORT_DATASET_ID,
  );

  return {
    service,
    datasetRepository,
    importSummaryRepository,
    noticeCenterStore,
  };
};

describe('DatasetImportService', () => {
  it('imports and activates a valid CSV dataset with accurate summary counts', async () => {
    const harness = createHarness();

    const result = await harness.service.importFile(
      createCsvDescriptor(createValidCsv()),
    );

    expect(result.ok).toBe(true);
    expect(result.data.datasetMetadata).toMatchObject({
      datasetId: IMPORT_DATASET_ID,
      name: 'capacity-forecast.csv',
      sourceType: 'import',
      importedAt: FIXED_NOW,
      recordCounts: {
        workItems: 1,
        capacityRecords: 1,
        warnings: 0,
        rejected: 0,
      },
    });
    expect(result.data.activation).toEqual({
      activated: true,
      activeDatasetId: IMPORT_DATASET_ID,
      persistenceMode: 'localStorage',
    });
    expect(result.data.validationSummary).toMatchObject({
      acceptedRows: 2,
      rejectedRows: 0,
      warningCount: 0,
      warnings: [],
      createdAt: FIXED_NOW,
    });

    const activeDataset = harness.datasetRepository.getActiveDataset();
    const storedSummary = harness.importSummaryRepository.getSummary();

    expect(activeDataset.ok).toBe(true);
    expect(activeDataset.data.dataset.workItems).toHaveLength(1);
    expect(activeDataset.data.dataset.capacityRecords).toHaveLength(1);
    expect(activeDataset.data.dataset.workItems[0]).toMatchObject({
      itemId: 'IMP-101',
      planningLevel: 'PI 2026.3',
      allocations: {
        Atlas: 20,
      },
    });
    expect(storedSummary).toEqual({
      ok: true,
      data: result.data.validationSummary,
    });
  });

  it('imports and activates a valid structured JSON dataset', async () => {
    const harness = createHarness();
    const descriptor = createJsonDescriptor(createValidJsonPayload());

    const result = await harness.service.importFile(descriptor);

    expect(result.ok).toBe(true);
    expect(result.data.dataset.workItems).toHaveLength(1);
    expect(result.data.dataset.capacityRecords).toHaveLength(1);
    expect(result.data.dataset.workItems[0]).toMatchObject({
      recordId: 'import-work-item-001',
      feature: 'Self-service account recovery',
      estimatedPoints: 20,
    });
    expect(result.data.dataset.capacityRecords[0]).toMatchObject({
      planningLevel: 'PI 2026.3',
      team: 'Atlas',
      capacityPoints: 40,
    });
    expect(result.data.validationSummary.acceptedRows).toBe(2);
    expect(result.data.validationSummary.rejectedRows).toBe(0);

    const notices = harness.noticeCenterStore.getNotices();

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      code: 'IMPORT_SUCCEEDED',
      severity: 'success',
      dismissible: true,
    });
  });

  it('rejects XLSX files before reading or parsing their content', async () => {
    const harness = createHarness();
    const file = {
      text: vi.fn(async () => 'binary spreadsheet content'),
    };

    const result = await harness.service.importFile({
      file,
      fileName: 'capacity-forecast.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 128,
    });

    expect(result).toEqual({
      ok: false,
      data: null,
      error: {
        code: 'IMPORT_UNSUPPORTED_FILE_TYPE',
        message: 'Only CSV and JSON files are supported.',
      },
    });
    expect(file.text).not.toHaveBeenCalled();

    const activeDataset = harness.datasetRepository.getActiveDataset();

    expect(activeDataset).toEqual({
      ok: true,
      data: null,
    });
  });

  it('rejects a CSV with an empty header row and records a failure summary', async () => {
    const harness = createHarness();
    const csv = ',\nvalue,data';

    const result = await harness.service.importFile(
      createCsvDescriptor(csv),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      code: DATASET_IMPORT_ERROR_CODES.VALIDATION_FAILED,
      message: 'The uploaded file could not be activated.',
      details: {
        acceptedRows: 0,
        rejectedRows: 0,
        currentDatasetPreserved: true,
      },
    });

    const storedSummary = harness.importSummaryRepository.getSummary();

    expect(storedSummary.ok).toBe(true);
    expect(storedSummary.data).toMatchObject({
      acceptedRows: 0,
      rejectedRows: 0,
      createdAt: FIXED_NOW,
    });
  });

  it('rejects work items with ambiguous dates and reports the rejected row', async () => {
    const harness = createHarness();
    const payload = createValidJsonPayload({
      workItems: [
        createWorkItem({
          startDate: '07/01/2026',
        }),
      ],
    });

    const result = await harness.service.importFile(
      createJsonDescriptor(payload),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      code: DATASET_IMPORT_ERROR_CODES.VALIDATION_FAILED,
      details: {
        acceptedRows: 1,
        rejectedRows: 1,
        currentDatasetPreserved: true,
      },
    });
    expect(result.validationSummary).toMatchObject({
      acceptedRows: 1,
      rejectedRows: 1,
    });

    const activeDataset = harness.datasetRepository.getActiveDataset();

    expect(activeDataset.data).toBeNull();
  });

  it('rejects nonnumeric required values without activating partial data', async () => {
    const harness = createHarness();
    const payload = createValidJsonPayload({
      workItems: [
        createWorkItem({
          estimatedPoints: 'many',
        }),
      ],
    });

    const result = await harness.service.importFile(
      createJsonDescriptor(payload),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({
      code: DATASET_IMPORT_ERROR_CODES.VALIDATION_FAILED,
      details: {
        acceptedRows: 1,
        rejectedRows: 1,
        currentDatasetPreserved: true,
      },
    });

    const activeDataset = harness.datasetRepository.getActiveDataset();

    expect(activeDataset).toEqual({
      ok: true,
      data: null,
    });
  });

  it('generates the same deterministic record ID for repeated equivalent imports', async () => {
    const harness = createHarness();
    const workItem = createWorkItem({
      recordId: '',
      itemId: '',
      feature: 'Deterministic imported feature',
    });
    const descriptor = createJsonDescriptor(
      createValidJsonPayload({
        workItems: [workItem],
      }),
    );

    const firstResult = await harness.service.importFile(descriptor);
    const secondResult = await harness.service.importFile(descriptor);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);

    const firstRecordId = firstResult.data.dataset.workItems[0].recordId;
    const secondRecordId = secondResult.data.dataset.workItems[0].recordId;

    expect(firstRecordId).toMatch(/^rec_[0-9a-f]{16}$/);
    expect(secondRecordId).toBe(firstRecordId);
  });

  it('imports missing capacity coverage as a non-blocking warning', async () => {
    const harness = createHarness();
    const payload = createValidJsonPayload({
      workItems: [
        createWorkItem({
          team: ['Atlas', 'Uncovered Team'],
          estimatedPoints: 30,
          allocations: {
            Atlas: 20,
            'Uncovered Team': 10,
          },
        }),
      ],
    });

    const result = await harness.service.importFile(
      createJsonDescriptor(payload),
    );

    expect(result.ok).toBe(true);
    expect(result.data.validationSummary).toMatchObject({
      acceptedRows: 2,
      rejectedRows: 0,
      warningCount: 1,
    });
    expect(result.data.validationSummary.warnings).toEqual([
      {
        code: 'CAPACITY_CONTEXT_MISSING',
        message: '1 work-item allocation references teams/planning levels without capacity records. Capacity metrics will show Unavailable.',
        rowRefs: [1],
      },
    ]);
    expect(result.data.datasetMetadata.recordCounts.warnings).toBe(1);

    const notices = harness.noticeCenterStore.getNotices();

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      code: 'IMPORT_COMPLETED_WITH_WARNINGS',
      severity: 'warning',
      message: 'The dataset was imported with 1 warning.',
    });
  });

  it('reports accepted and rejected rows while activating remaining valid data', async () => {
    const harness = createHarness();
    const payload = createValidJsonPayload({
      workItems: [
        createWorkItem(),
        createWorkItem({
          recordId: 'import-work-item-002',
          itemId: 'IMP-102',
          feature: 'Valid secondary feature',
          estimatedPoints: 8,
          allocations: {
            Atlas: 8,
          },
        }),
        createWorkItem({
          recordId: 'import-work-item-invalid',
          itemId: 'IMP-INVALID',
          feature: 'Invalid numeric feature',
          estimatedPoints: 'not-a-number',
          allocations: {
            Atlas: 5,
          },
        }),
      ],
    });

    const result = await harness.service.importFile(
      createJsonDescriptor(payload),
    );

    expect(result.ok).toBe(true);
    expect(result.data.dataset.workItems).toHaveLength(2);
    expect(result.data.dataset.capacityRecords).toHaveLength(1);
    expect(result.data.validationSummary).toMatchObject({
      acceptedRows: 3,
      rejectedRows: 1,
      warningCount: 0,
    });
    expect(result.data.datasetMetadata.recordCounts).toEqual({
      workItems: 2,
      capacityRecords: 1,
      warnings: 0,
      rejected: 1,
    });
  });

  it('preserves the current active dataset when a replacement import fails', async () => {
    const harness = createHarness();
    const baselineDataset = createValidDatasetFixture();
    const baselineMetadata = createValidDatasetMetadataFixture(
      baselineDataset,
      {
        datasetId: 'existing-active-dataset',
        name: 'Existing active dataset',
      },
    );
    const activation = harness.datasetRepository.activate(
      baselineDataset,
      baselineMetadata,
    );

    expect(activation.ok).toBe(true);

    const invalidPayload = createValidJsonPayload({
      workItems: [
        createWorkItem({
          estimatedPoints: 'invalid',
        }),
      ],
    });
    const result = await harness.service.importFile(
      createJsonDescriptor(invalidPayload, {
        fileName: 'invalid-replacement.json',
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.error.details.currentDatasetPreserved).toBe(true);

    const activeDataset = harness.datasetRepository.getActiveDataset();

    expect(activeDataset.ok).toBe(true);
    expect(activeDataset.data.metadata).toEqual(baselineMetadata);
    expect(activeDataset.data.dataset).toEqual(baselineDataset);
  });
});