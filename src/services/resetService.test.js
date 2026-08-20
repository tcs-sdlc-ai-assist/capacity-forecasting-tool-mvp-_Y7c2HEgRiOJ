import {
  CFT_STORAGE_KEYS,
  STORAGE_KEYS,
  STORAGE_PREFIX,
} from '../constants/storageKeys.js';
import {
  BrowserStorageAdapter,
} from '../platform/storage/browserStorageAdapter.js';
import {
  MemoryFallbackStore,
} from '../platform/storage/memoryFallbackStore.js';
import {
  PersistentStore,
} from '../platform/storage/persistentStore.js';
import {
  DatasetRepository,
} from '../repositories/datasetRepository.js';
import {
  DemoUserRepository,
} from '../repositories/demoUserRepository.js';
import {
  PersistenceStatusRepository,
} from '../repositories/persistenceStatusRepository.js';
import {
  PreferenceRepository,
} from '../repositories/preferenceRepository.js';
import {
  SessionRepository,
} from '../repositories/sessionRepository.js';
import {
  createNoticeCenterStore,
} from '../stores/noticeCenterStore.js';
import {
  BOOTSTRAP_DATASET_STATUSES,
  BootstrapService,
} from './bootstrapService.js';
import {
  MockDatasetProvider,
} from './mockDatasetProvider.js';
import {
  RecoveryService,
} from './recoveryService.js';
import {
  RESET_ERROR_CODES,
  RESET_NEXT_LOAD_BEHAVIOR,
  ResetService,
} from './resetService.js';

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

const createPersistenceHarness = () => {
  const windowStorage = createStorage();
  const memoryStore = new MemoryFallbackStore();
  const storageAdapter = new BrowserStorageAdapter(
    windowStorage,
    memoryStore,
  );
  const persistentStore = new PersistentStore(storageAdapter);

  return {
    windowStorage,
    memoryStore,
    storageAdapter,
    persistentStore,
  };
};

describe('ResetService', () => {
  it('removes all and only CFT-owned durable and in-memory keys', () => {
    const harness = createPersistenceHarness();

    CFT_STORAGE_KEYS.forEach((key) => {
      const result = harness.persistentStore.set(key, {
        key,
        retainedUntilReset: true,
      });

      expect(result.ok).toBe(true);
    });

    const memoryOnlyKey = `${STORAGE_PREFIX}runtime-only`;

    harness.memoryStore.set(memoryOnlyKey, {
      volatile: true,
    });
    harness.persistentStore.set('another-app.preferences', {
      theme: 'dark',
    });
    harness.memoryStore.set('another-app.runtime', {
      active: true,
    });

    const sessionRepository = new SessionRepository(
      harness.persistentStore,
    );
    const clearSessionSpy = vi.spyOn(
      sessionRepository,
      'clearSession',
    );
    const noticeCenterStore = {
      clearNotices: vi.fn(() => ({
        ok: true,
        removed: true,
      })),
    };
    const service = new ResetService(
      harness.persistentStore,
      sessionRepository,
      noticeCenterStore,
    );

    const result = service.removeAllLocalData({
      confirmed: true,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        removedKeys: [
          ...CFT_STORAGE_KEYS,
          memoryOnlyKey,
        ].sort(),
        sessionEnded: true,
        nextLoadBehavior: RESET_NEXT_LOAD_BEHAVIOR,
      },
    });
    expect(clearSessionSpy).toHaveBeenCalledTimes(1);
    expect(noticeCenterStore.clearNotices).toHaveBeenCalledTimes(1);
    expect(harness.persistentStore.list(STORAGE_PREFIX)).toEqual({
      ok: true,
      keys: [],
    });
    expect(
      harness.persistentStore.get('another-app.preferences'),
    ).toEqual({
      ok: true,
      data: {
        theme: 'dark',
      },
    });
    expect(
      harness.persistentStore.get('another-app.runtime'),
    ).toEqual({
      ok: true,
      data: {
        active: true,
      },
    });
  });

  it('requires explicit confirmation and leaves storage and session unchanged', () => {
    const storage = {
      clearNamespace: vi.fn(() => ({
        ok: true,
        removedKeys: [],
      })),
    };
    const sessionRepository = {
      clearSession: vi.fn(() => ({
        ok: true,
        removed: true,
      })),
    };
    const noticeCenterStore = {
      clearNotices: vi.fn(() => ({
        ok: true,
        removed: true,
      })),
    };
    const service = new ResetService(
      storage,
      sessionRepository,
      noticeCenterStore,
    );

    const result = service.removeAllLocalData({
      confirmed: false,
    });

    expect(result).toEqual({
      ok: false,
      data: null,
      error: {
        code: RESET_ERROR_CODES.CONFIRMATION_REQUIRED,
        message: 'Confirmation is required before removing local application data.',
      },
    });
    expect(storage.clearNamespace).not.toHaveBeenCalled();
    expect(sessionRepository.clearSession).not.toHaveBeenCalled();
    expect(noticeCenterStore.clearNotices).not.toHaveBeenCalled();
  });

  it('clears CFT data when persistence is already memory-only', () => {
    const memoryStore = new MemoryFallbackStore();
    const storageAdapter = new BrowserStorageAdapter(
      null,
      memoryStore,
    );
    const persistentStore = new PersistentStore(storageAdapter);
    const sessionRepository = new SessionRepository(persistentStore);
    const noticeCenterStore = {
      clearNotices: vi.fn(() => ({
        ok: true,
        removed: false,
      })),
    };

    persistentStore.set(STORAGE_KEYS.SESSION, {
      sessionId: 'volatile-session',
    });
    persistentStore.set(STORAGE_KEYS.FILTERS, {
      selectedTeams: ['Atlas'],
    });
    persistentStore.set('another-app.memory', {
      retained: true,
    });

    const service = new ResetService(
      persistentStore,
      sessionRepository,
      noticeCenterStore,
    );
    const result = service.removeAllLocalData(true);

    expect(result.ok).toBe(true);
    expect(result.data.removedKeys).toEqual([
      STORAGE_KEYS.FILTERS,
      STORAGE_KEYS.SESSION,
    ].sort());
    expect(result.data.sessionEnded).toBe(true);
    expect(storageAdapter.getMode()).toBe('memory');
    expect(persistentStore.list(STORAGE_PREFIX).keys).toEqual([]);
    expect(persistentStore.get('another-app.memory').data).toEqual({
      retained: true,
    });
  });

  it('allows the next application load to bootstrap clean demo state', () => {
    const harness = createPersistenceHarness();
    const staleKey = `${STORAGE_PREFIX}stale-state`;

    harness.persistentStore.set(staleKey, {
      fromPreviousRun: true,
    });
    harness.persistentStore.set(STORAGE_KEYS.SESSION, {
      invalid: 'stale session data',
    });
    harness.persistentStore.set(STORAGE_KEYS.DATASET_CONTENT, {
      invalid: 'stale dataset data',
    });

    const resetService = new ResetService(
      harness.persistentStore,
      new SessionRepository(harness.persistentStore),
      {
        clearNotices: vi.fn(() => ({
          ok: true,
          removed: false,
        })),
      },
    );
    const resetResult = resetService.removeAllLocalData({
      confirmed: true,
    });

    expect(resetResult.ok).toBe(true);
    expect(resetResult.data.nextLoadBehavior).toBe(
      RESET_NEXT_LOAD_BEHAVIOR,
    );
    expect(harness.persistentStore.get(staleKey).data).toBeNull();

    const datasetRepository = new DatasetRepository(
      harness.persistentStore,
    );
    const demoUserRepository = new DemoUserRepository(
      harness.persistentStore,
      () => new Date(FIXED_NOW),
    );
    const persistenceStatusRepository = (
      new PersistenceStatusRepository(
        harness.persistentStore,
        () => new Date(FIXED_NOW),
      )
    );
    const preferenceRepository = new PreferenceRepository(
      harness.persistentStore,
    );
    const noticeCenterStore = createNoticeCenterStore(
      harness.persistentStore,
      () => new Date(FIXED_NOW),
      () => 'reset-rebootstrap-notice',
    );
    const mockDatasetProvider = new MockDatasetProvider();
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
      datasetRepository,
      mockDatasetProvider,
      noticeCenterStore,
      persistenceStatusRepository,
      () => new Date(FIXED_NOW),
    );
    const bootstrapService = new BootstrapService(
      demoUserRepository,
      authService,
      datasetRepository,
      mockDatasetProvider,
      recoveryService,
      persistenceStatusRepository,
      noticeCenterStore,
      null,
      preferenceRepository,
    );

    const bootstrapResult = bootstrapService.initialize();

    expect(bootstrapResult.ok).toBe(true);
    expect(bootstrapResult.data.demoUsersInitialized).toBe(true);
    expect(bootstrapResult.data.sessionRestored).toBe(false);
    expect(bootstrapResult.data.datasetStatus).toBe(
      BOOTSTRAP_DATASET_STATUSES.BOOTSTRAPPED_MOCK,
    );
    expect(bootstrapResult.data.datasetMetadata.sourceType).toBe('mock');
    expect(bootstrapResult.data.dataset.workItems.length).toBeGreaterThan(0);
    expect(
      bootstrapResult.data.dataset.capacityRecords.length,
    ).toBeGreaterThan(0);
    expect(authService.restoreSession).toHaveBeenCalledTimes(1);

    const activeDataset = datasetRepository.getActiveDataset();
    const demoUsers = demoUserRepository.getUsers();

    expect(activeDataset.ok).toBe(true);
    expect(activeDataset.data.dataset).toEqual(
      bootstrapResult.data.dataset,
    );
    expect(activeDataset.data.metadata).toEqual(
      bootstrapResult.data.datasetMetadata,
    );
    expect(demoUsers.ok).toBe(true);
    expect(demoUsers.data).toHaveLength(3);
    expect(harness.persistentStore.get(staleKey).data).toBeNull();
  });
});