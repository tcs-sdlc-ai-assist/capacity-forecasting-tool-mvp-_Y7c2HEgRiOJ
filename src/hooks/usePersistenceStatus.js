import {
  useCallback,
  useSyncExternalStore,
} from 'react';
import persistenceStatusFacade, {
  PERSISTENCE_STATUS_FACADE_STATUSES,
} from '../facades/persistenceStatusFacade.js';

const subscribeToPersistenceStatus = (listener) => (
  persistenceStatusFacade.subscribeToPersistenceStatus(listener)
);

const getPersistenceStatusSnapshot = () => (
  persistenceStatusFacade.getSnapshot()
);

/**
 * Subscribes a React component to browser-local persistence status and
 * exposes a stable refresh action.
 *
 * @returns {{
 *   persistenceStatus: object|null,
 *   mode: string|null,
 *   lastError: object|null,
 *   status: string,
 *   error: object|null,
 *   revision: number,
 *   isLoading: boolean,
 *   isReady: boolean,
 *   isEmpty: boolean,
 *   isFailed: boolean,
 *   isPersistent: boolean,
 *   isMemoryOnly: boolean,
 *   refresh: Function,
 *   refreshPersistenceStatus: Function
 * }} Current persistence state and actions.
 */
export const usePersistenceStatus = () => {
  const snapshot = useSyncExternalStore(
    subscribeToPersistenceStatus,
    getPersistenceStatusSnapshot,
    getPersistenceStatusSnapshot,
  );

  const refresh = useCallback(
    () => persistenceStatusFacade.refresh(),
    [],
  );

  return {
    ...snapshot,
    isLoading: snapshot.status
      === PERSISTENCE_STATUS_FACADE_STATUSES.UNKNOWN,
    isReady: snapshot.status
      === PERSISTENCE_STATUS_FACADE_STATUSES.READY,
    isEmpty: snapshot.status
      === PERSISTENCE_STATUS_FACADE_STATUSES.EMPTY,
    isFailed: snapshot.status
      === PERSISTENCE_STATUS_FACADE_STATUSES.FAILED,
    isPersistent: snapshot.mode === 'localStorage',
    isMemoryOnly: snapshot.mode === 'memory',
    refresh,
    refreshPersistenceStatus: refresh,
  };
};

export default usePersistenceStatus;