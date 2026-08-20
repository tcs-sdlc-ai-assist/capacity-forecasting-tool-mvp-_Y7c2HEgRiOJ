import datasetAccessFacade from './datasetAccessFacade.js';
import datasetExportService, {
  DATASET_EXPORT_FORMATS,
} from '../services/datasetExportService.js';

export const DATASET_EXPORT_FACADE_ERROR_CODES = Object.freeze({
  DATASET_UNAVAILABLE: 'DATASET_EXPORT_UNAVAILABLE',
  DOWNLOAD_UNAVAILABLE: 'DATASET_EXPORT_DOWNLOAD_UNAVAILABLE',
  DOWNLOAD_FAILED: 'DATASET_EXPORT_DOWNLOAD_FAILED',
});

const createError = (code, message) => ({
  code,
  message,
});

const createFailureResult = (code, message) => ({
  ok: false,
  data: null,
  error: createError(code, message),
});

const downloadInBrowser = ({
  content,
  filename,
  mimeType,
}) => {
  if (
    typeof document === 'undefined'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
  ) {
    return createFailureResult(
      DATASET_EXPORT_FACADE_ERROR_CODES.DOWNLOAD_UNAVAILABLE,
      'The dataset could not be downloaded in this browser.',
    );
  }

  let objectUrl = '';

  try {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    return {
      ok: true,
      data: {
        filename,
        mimeType,
      },
    };
  } catch {
    return createFailureResult(
      DATASET_EXPORT_FACADE_ERROR_CODES.DOWNLOAD_FAILED,
      'The dataset export file could not be downloaded.',
    );
  } finally {
    if (objectUrl && typeof URL.revokeObjectURL === 'function') {
      const urlToRevoke = objectUrl;

      setTimeout(() => {
        URL.revokeObjectURL(urlToRevoke);
      }, 1000);
    }
  }
};

/**
 * Exports the active dataset as a re-importable CSV or JSON file.
 */
export class DatasetExportFacade {
  constructor(
    exportService = datasetExportService,
    activeDatasetFacade = datasetAccessFacade,
    downloader = downloadInBrowser,
  ) {
    this.datasetExportService = exportService;
    this.datasetAccessFacade = activeDatasetFacade;
    this.downloader = downloader;
  }

  /**
   * Builds and downloads the active dataset.
   *
   * @param {{format?: string}} [options] Export options.
   * @returns {{
   *   ok: boolean,
   *   data: object|null,
   *   error?: object
   * }} Export result.
   */
  exportDataset(options = {}) {
    const snapshot = this.datasetAccessFacade?.getSnapshot?.() ?? null;
    const dataset = snapshot?.dataset ?? null;

    if (!dataset) {
      return createFailureResult(
        DATASET_EXPORT_FACADE_ERROR_CODES.DATASET_UNAVAILABLE,
        'There is no active dataset to export.',
      );
    }

    if (typeof this.datasetExportService?.createExportFile !== 'function') {
      return createFailureResult(
        DATASET_EXPORT_FACADE_ERROR_CODES.DATASET_UNAVAILABLE,
        'The dataset export service is unavailable.',
      );
    }

    const fileResult = this.datasetExportService.createExportFile(
      dataset,
      options,
    );

    if (!fileResult?.ok) {
      return {
        ok: false,
        data: null,
        error: fileResult?.error ?? createError(
          DATASET_EXPORT_FACADE_ERROR_CODES.DATASET_UNAVAILABLE,
          'The active dataset could not be exported.',
        ),
      };
    }

    const downloadResult = this.downloader(fileResult.data);

    if (!downloadResult?.ok) {
      return downloadResult ?? createFailureResult(
        DATASET_EXPORT_FACADE_ERROR_CODES.DOWNLOAD_FAILED,
        'The dataset export file could not be downloaded.',
      );
    }

    return {
      ok: true,
      data: {
        ...fileResult.data,
        filename: fileResult.data.filename,
        format: fileResult.data.format,
      },
    };
  }
}

export const datasetExportFacade = new DatasetExportFacade();

export const exportDataset = (options = {}) => (
  datasetExportFacade.exportDataset(options)
);

export { DATASET_EXPORT_FORMATS };

export default datasetExportFacade;
