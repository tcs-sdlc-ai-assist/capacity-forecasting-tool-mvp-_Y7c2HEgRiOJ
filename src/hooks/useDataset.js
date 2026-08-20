import {
  useCallback,
  useSyncExternalStore,
} from 'react';
import datasetAccessFacade, {
  DATASET_ACCESS_STATUSES,
} from '../facades/datasetAccessFacade.js';

const subscribeToDataset = (listener) => (
  datasetAccessFacade.subscribeToDatasetChanges(listener)
);

const getDatasetSnapshot = () => datasetAccessFacade.getSnapshot();

/**
 * Subscribes a React component to the active dataset and exposes a stable
 * refresh action.
 *
 * @returns {{
 *   dataset: object|null,
 *   activeDataset: object|null,
 *   metadata: object|null,
 *   datasetMetadata: object|null,
 *   status: string,
 *   error: object|null,
 *   revision: number,
 *   hasDataset: boolean,
 *   isLoading: boolean,
 *   isReady: boolean,
 *   isEmpty: boolean,
 *   isFailed: boolean,
 *   refresh: Function
 * }} Current active-dataset state and actions.
 */
export const useDataset = () => {
  const snapshot = useSyncExternalStore(
    subscribeToDataset,
    getDatasetSnapshot,
    getDatasetSnapshot,
  );

  const refresh = useCallback(
    () => datasetAccessFacade.refresh(),
    [],
  );

  return {
    ...snapshot,
    activeDataset: snapshot.dataset,
    datasetMetadata: snapshot.metadata,
    hasDataset: Boolean(snapshot.dataset && snapshot.metadata),
    isLoading: snapshot.status === DATASET_ACCESS_STATUSES.UNKNOWN,
    isReady: snapshot.status === DATASET_ACCESS_STATUSES.READY,
    isEmpty: snapshot.status === DATASET_ACCESS_STATUSES.EMPTY,
    isFailed: snapshot.status === DATASET_ACCESS_STATUSES.FAILED,
    refresh,
  };
};

export default useDataset;