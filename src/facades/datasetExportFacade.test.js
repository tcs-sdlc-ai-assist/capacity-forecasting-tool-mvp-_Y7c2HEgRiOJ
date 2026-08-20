import {
  DATASET_EXPORT_FACADE_ERROR_CODES,
  DatasetExportFacade,
} from './datasetExportFacade.js';
import {
  DATASET_EXPORT_FORMATS,
  DatasetExportService,
} from '../services/datasetExportService.js';
import {
  createValidDatasetFixture,
} from '../test/fixtures.js';

const FIXED_NOW = '2026-08-20T12:00:00.000Z';

const createFacade = ({
  dataset = createValidDatasetFixture(),
  downloader = vi.fn((file) => ({
    ok: true,
    data: {
      filename: file.filename,
      mimeType: file.mimeType,
    },
  })),
} = {}) => {
  const exportService = new DatasetExportService(
    () => new Date(FIXED_NOW),
  );
  const datasetAccess = {
    getSnapshot: () => ({
      dataset,
      metadata: null,
    }),
  };

  return {
    downloader,
    facade: new DatasetExportFacade(
      exportService,
      datasetAccess,
      downloader,
    ),
  };
};

describe('DatasetExportFacade', () => {
  it('downloads a CSV export of the active dataset', () => {
    const { downloader, facade } = createFacade();
    const result = facade.exportDataset();

    expect(result.ok).toBe(true);
    expect(result.data.filename).toBe('cft-dataset-2026-08-20.csv');
    expect(result.data.format).toBe(DATASET_EXPORT_FORMATS.CSV);
    expect(downloader).toHaveBeenCalledTimes(1);
    expect(downloader.mock.calls[0][0]).toEqual(expect.objectContaining({
      filename: 'cft-dataset-2026-08-20.csv',
      mimeType: 'text/csv',
      format: DATASET_EXPORT_FORMATS.CSV,
    }));
    expect(downloader.mock.calls[0][0].content).toContain('recordType');
  });

  it('downloads a JSON export of the active dataset', () => {
    const { downloader, facade } = createFacade();
    const result = facade.exportDataset({
      format: DATASET_EXPORT_FORMATS.JSON,
    });

    expect(result.ok).toBe(true);
    expect(result.data.filename).toBe('cft-dataset-2026-08-20.json');
    expect(JSON.parse(downloader.mock.calls[0][0].content)).toEqual(
      expect.objectContaining({
        schemaVersion: '1.0.0',
        workItems: expect.any(Array),
        capacityRecords: expect.any(Array),
      }),
    );
  });

  it('fails when no active dataset is available', () => {
    const { downloader, facade } = createFacade({
      dataset: null,
    });
    const result = facade.exportDataset();

    expect(result).toEqual({
      ok: false,
      data: null,
      error: {
        code: DATASET_EXPORT_FACADE_ERROR_CODES.DATASET_UNAVAILABLE,
        message: 'There is no active dataset to export.',
      },
    });
    expect(downloader).not.toHaveBeenCalled();
  });

  it('surfaces download failures without claiming success', () => {
    const { downloader, facade } = createFacade({
      downloader: vi.fn(() => ({
        ok: false,
        data: null,
        error: {
          code: DATASET_EXPORT_FACADE_ERROR_CODES.DOWNLOAD_FAILED,
          message: 'The dataset export file could not be downloaded.',
        },
      })),
    });
    const result = facade.exportDataset();

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe(
      DATASET_EXPORT_FACADE_ERROR_CODES.DOWNLOAD_FAILED,
    );
    expect(downloader).toHaveBeenCalledTimes(1);
  });
});
