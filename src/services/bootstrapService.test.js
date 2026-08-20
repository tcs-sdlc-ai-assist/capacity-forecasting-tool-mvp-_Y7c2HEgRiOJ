import {
  BOOTSTRAP_DATASET_STATUSES,
  BootstrapService,
} from './bootstrapService.js';
import {
  DATASET_RECOVERY_NOTICE_CODE,
  RecoveryService,
} from './recoveryService.js';
import { STORAGE_KEYS } from '../constants/storageKeys.js';
import { MockDatasetProvider } from './mockDatasetProvider.js';
import { BrowserStorageAdapter } from '../platform/storage/browserStorageAdapter.js';
import { MemoryFallbackStore } from '../platform/storage/memoryFallbackStore.js';
import { PersistentStore } from '../platform/storage/persistentStore.js';
import { DatasetRepository } from '../repositories/datasetRepository.js';
import { DemoUserRepository } from '../repositories/demoUserRepository.js';
import { PersistenceStatusRepository } from '../repositories/persistenceStatusRepository.js';
import { PreferenceRepository } from '../repositories/preferenceRepository.js';
import { createNoticeCenterStore } from '../stores/noticeCenterStore.js';
import {
  createValidDatasetFixture,
  createValidDatasetMetadataFixture,
} from '../test/fixtures.js';

const FIXED_NOW = '2026-08-20T12:00:00.000Z';

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

const createDatasetFailure = (code, message) => ({
  ok: false,
  data: null,
  error: {
    code,
    message,
  },
});

const createHarness = ({
  datasetReadFailure = null,
} = {}) => {
  const windowStorage = createStorage();
  const storageAdapter = new BrowserStorageAdapter(
    windowStorage,
    new MemoryFallbackStore(),
  );
  const persistentStore = new PersistentStore(storageAdapter);
  const datasetRepository = new DatasetRepository(persistentStore);
  const demoUserRepository = new DemoUserRepository(
    persistentStore,
    () => new Date(FIXED_NOW),
  );
  const persistenceStatusRepository = new PersistenceStatusRepository(
    persistentStore,
    () => new Date(FIXED_NOW),
  );
  const preferenceRepository = new PreferenceRepository(persistentStore);
  const noticeCenterStore = createNoticeCenterStore(
    persistentStore,
    () => new Date(FIXED_NOW),
    () => 'bootstrap-recovery-notice',
  );
  const mockDatasetProvider = new MockDatasetProvider();
  const activeDatasetRepository = datasetReadFailure
    ? {
      getActiveDataset: vi.fn(() => datasetReadFailure),
      activate: vi.fn((dataset, metadata) => (
        datasetRepository.activate(dataset, metadata)
      )),
    }
    : datasetRepository;
  const authService = {
    restoreSession: vi.fn(() => ({
      ok: true,
      data: {
        session: null,
        status: 'missing_or_expired',
      },
    })),
  };
  const recoveryService = new RecoveryService(
    activeDatasetRepository,
    mockDatasetProvider,
    noticeCenterStore,
    persistenceStatusRepository,
    () => new Date(FIXED_NOW),
  );
  const service = new BootstrapService(
    demoUserRepository,
    authService,
    activeDatasetRepository,
    mockDatasetProvider,
    recoveryService,
    persistenceStatusRepository,
    noticeCenterStore,
    null,
    preferenceRepository,
  );

  return {
    service,
    authService,
    datasetRepository,
    demoUserRepository,
    persistenceStatusRepository,
    preferenceRepository,
    noticeCenterStore,
    mockDatasetProvider,
    persistentStore,
    windowStorage,
  };
};

describe('BootstrapService', () => {
  it('bootstraps demo users and the bundled mock dataset from clean storage', () => {
    const harness = createHarness();

    const result = harness.service.initialize();

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.data.demoUsersInitialized).toBe(true);
    expect(result.data.sessionRestored).toBe(false);
    expect(result.data.datasetStatus).toBe(
      BOOTSTRAP_DATASET_STATUSES.BOOTSTRAPPED_MOCK,
    );
    expect(result.data.persistenceMode).toBe('localStorage');
    expect(result.data.dataset).not.toBeNull();
    expect(result.data.dataset.workItems.length).toBeGreaterThan(0);
    expect(result.data.dataset.capacityRecords.length).toBeGreaterThan(0);
    expect(result.data.datasetMetadata.sourceType).toBe('mock');

    const usersResult = harness.demoUserRepository.getUsers();
    const activeDatasetResult = harness.datasetRepository.getActiveDataset();
    const persistenceResult = (
      harness.persistenceStatusRepository.getStatus()
    );

    expect(usersResult.ok).toBe(true);
    expect(usersResult.data).toHaveLength(3);
    expect(usersResult.data.map((user) => user.username)).toEqual([
      'planner',
      'manager',
      'viewer',
    ]);
    expect(activeDatasetResult.ok).toBe(true);
    expect(activeDatasetResult.data.dataset).toEqual(result.data.dataset);
    expect(activeDatasetResult.data.metadata).toEqual(
      result.data.datasetMetadata,
    );
    expect(persistenceResult.ok).toBe(true);
    expect(persistenceResult.data.mode).toBe('localStorage');
    expect(harness.authService.restoreSession).toHaveBeenCalledTimes(1);
  });

  it('preserves a valid imported dataset instead of replacing it with demo data', () => {
    const harness = createHarness();
    const importedDataset = createValidDatasetFixture();
    const importedMetadata = createValidDatasetMetadataFixture(
      importedDataset,
      {
        datasetId: 'preserved-import-001',
        name: 'Preserved capacity import',
        sourceType: 'import',
      },
    );
    const activation = harness.datasetRepository.activate(
      importedDataset,
      importedMetadata,
    );
    const providerDatasetSpy = vi.spyOn(
      harness.mockDatasetProvider,
      'getDataset',
    );

    expect(activation.ok).toBe(true);

    const result = harness.service.initialize();

    expect(result.ok).toBe(true);
    expect(result.data.datasetStatus).toBe(
      BOOTSTRAP_DATASET_STATUSES.RESTORED_EXISTING,
    );
    expect(result.data.datasetMetadata.datasetId).toBe(
      importedMetadata.datasetId,
    );
    expect(result.data.datasetMetadata.sourceType).toBe('import');
    expect(result.data.dataset).toEqual(importedDataset);
    expect(providerDatasetSpy).not.toHaveBeenCalled();

    const storedDataset = harness.datasetRepository.getActiveDataset();

    expect(storedDataset.ok).toBe(true);
    expect(storedDataset.data.metadata.datasetId).toBe(
      importedMetadata.datasetId,
    );
    expect(storedDataset.data.dataset).toEqual(importedDataset);
  });

  it('recovers malformed persisted dataset state with the bundled mock dataset', () => {
    const datasetReadFailure = createDatasetFailure(
      'DATASET_PARSE_FAILED',
      'Stored dataset content could not be parsed.',
    );
    const harness = createHarness({ datasetReadFailure });

    const result = harness.service.initialize();

    expect(result.ok).toBe(true);
    expect(result.data.datasetStatus).toBe(
      BOOTSTRAP_DATASET_STATUSES.RECOVERED_MOCK,
    );
    expect(result.data.datasetMetadata.sourceType).toBe('recovered-mock');
    expect(result.data.dataset.workItems.length).toBeGreaterThan(0);

    const activeDataset = harness.datasetRepository.getActiveDataset();

    expect(activeDataset.ok).toBe(true);
    expect(activeDataset.data.metadata.sourceType).toBe('recovered-mock');
    expect(activeDataset.data.dataset).toEqual(result.data.dataset);

    const notices = harness.noticeCenterStore.getNotices();

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      code: DATASET_RECOVERY_NOTICE_CODE,
      severity: 'info',
      dismissible: true,
      message: 'The saved dataset was invalid or unreadable. The bundled demo dataset has been restored.',
    });
  });

  it('recovers an unsupported stored schema and creates a safe recovery notice', () => {
    const datasetReadFailure = createDatasetFailure(
      'DATASET_SCHEMA_UNSUPPORTED',
      'The stored dataset uses an unsupported schema version.',
    );
    const harness = createHarness({ datasetReadFailure });

    const result = harness.service.initialize();

    expect(result.ok).toBe(true);
    expect(result.data.datasetStatus).toBe(
      BOOTSTRAP_DATASET_STATUSES.RECOVERED_MOCK,
    );
    expect(result.data.datasetMetadata.sourceType).toBe('recovered-mock');
    expect(result.data.recoveryNotices).toEqual([
      {
        code: DATASET_RECOVERY_NOTICE_CODE,
        severity: 'info',
      },
    ]);

    const notices = harness.noticeCenterStore.getNotices();

    expect(notices).toHaveLength(1);
    expect(notices[0].message).toBe(
      'The saved dataset uses an unsupported schema. The bundled demo dataset has been restored.',
    );
    expect(notices[0].createdAt).toBe(FIXED_NOW);
  });

  it('seeds missing demo users once and reuses the valid stored envelope', () => {
    const harness = createHarness();

    const firstResult = harness.service.ensureDemoUsers();
    const firstEnvelope = harness.demoUserRepository.getEnvelope();
    const secondResult = harness.service.ensureDemoUsers();
    const secondEnvelope = harness.demoUserRepository.getEnvelope();

    expect(firstResult.ok).toBe(true);
    expect(firstResult.data.initialized).toBe(true);
    expect(firstResult.data.users).toHaveLength(3);
    expect(secondResult.ok).toBe(true);
    expect(secondResult.data.initialized).toBe(false);
    expect(secondResult.data.users).toEqual(firstResult.data.users);
    expect(firstEnvelope.ok).toBe(true);
    expect(secondEnvelope.ok).toBe(true);
    expect(secondEnvelope.data).toEqual(firstEnvelope.data);
    expect(secondEnvelope.data.seededAt).toBe(FIXED_NOW);
  });

  it('replaces invalid stored demo-user data with the bundled users', () => {
    const harness = createHarness();
    const invalidWrite = harness.persistentStore.set(
      STORAGE_KEYS.DEMO_USERS,
      {
        schemaVersion: '999.0.0',
        users: [],
        seededAt: FIXED_NOW,
      },
    );

    expect(invalidWrite.ok).toBe(true);

    const result = harness.service.ensureDemoUsers();

    expect(result.ok).toBe(true);
    expect(result.data.initialized).toBe(true);
    expect(result.data.users).toHaveLength(3);

    const storedUsers = harness.demoUserRepository.getEnvelope();

    expect(storedUsers.ok).toBe(true);
    expect(storedUsers.data.schemaVersion).toBe('1.0.0');
    expect(storedUsers.data.users.map((user) => user.username)).toEqual([
      'planner',
      'manager',
      'viewer',
    ]);
  });
});