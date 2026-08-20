import {
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import datasetImportFacade from '../../../facades/datasetImportFacade.js';

const ACCEPTED_FILE_TYPES = [
  '.csv',
  '.json',
  'text/csv',
  'application/csv',
  'application/json',
  'text/json',
].join(',');

const IMPORT_STATUSES = Object.freeze({
  IDLE: 'idle',
  READY: 'ready',
  IMPORTING: 'importing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
});

const UNSUPPORTED_ERROR_CODES = new Set([
  'IMPORT_UNSUPPORTED_FILE_TYPE',
  'IMPORT_UNSUPPORTED_FILE_FORMAT',
  'IMPORT_MIME_TYPE_MISMATCH',
  'UNSUPPORTED_FILE_FORMAT',
]);

const CAPACITY_GAP_CODE = 'CAPACITY_CONTEXT_MISSING';

const createError = (code, message) => ({
  code,
  message,
});

const getFileExtension = (fileName) => {
  if (typeof fileName !== 'string') {
    return '';
  }

  const normalizedName = fileName.trim().toLowerCase();
  const separatorIndex = normalizedName.lastIndexOf('.');

  return separatorIndex > 0
    ? normalizedName.slice(separatorIndex)
    : '';
};

const isSupportedFile = (file) => (
  file !== null
  && typeof file === 'object'
  && ['.csv', '.json'].includes(getFileExtension(file.name))
);

const normalizeCount = (value, fallback = 0) => {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized >= 0
    ? normalized
    : fallback;
};

const normalizeWarnings = (warnings) => (
  Array.isArray(warnings)
    ? warnings.filter((warning) => (
      warning !== null
      && typeof warning === 'object'
      && !Array.isArray(warning)
      && typeof warning.message === 'string'
      && warning.message.trim()
    ))
    : []
);

const resolveImportSummary = (result) => {
  const summary = result?.data?.validationSummary
    ?? result?.validationSummary
    ?? null;
  const metadata = result?.data?.datasetMetadata
    ?? result?.data?.metadata
    ?? null;
  const warnings = normalizeWarnings(
    summary?.warnings ?? result?.warnings,
  );

  if (!summary && !metadata && warnings.length === 0) {
    return null;
  }

  const metadataAcceptedRows = (
    normalizeCount(metadata?.recordCounts?.workItems)
    + normalizeCount(metadata?.recordCounts?.capacityRecords)
  );

  return {
    acceptedRows: normalizeCount(
      summary?.acceptedRows,
      metadataAcceptedRows,
    ),
    rejectedRows: normalizeCount(
      summary?.rejectedRows,
      normalizeCount(metadata?.recordCounts?.rejected),
    ),
    warningCount: normalizeCount(
      summary?.warningCount,
      warnings.length || normalizeCount(
        metadata?.recordCounts?.warnings,
      ),
    ),
    warnings,
  };
};

const isUnsupportedError = (error) => {
  const code = typeof error?.code === 'string'
    ? error.code.toUpperCase()
    : '';
  const causeCode = typeof error?.details?.causeCode === 'string'
    ? error.details.causeCode.toUpperCase()
    : '';

  return (
    UNSUPPORTED_ERROR_CODES.has(code)
    || UNSUPPORTED_ERROR_CODES.has(causeCode)
    || code.includes('UNSUPPORTED_FILE')
    || causeCode.includes('UNSUPPORTED_FILE')
    || code.includes('MIME_TYPE_MISMATCH')
    || causeCode.includes('MIME_TYPE_MISMATCH')
  );
};

const formatFileSize = (size) => {
  if (!Number.isFinite(size) || size < 0) {
    return '';
  }

  if (size < 1024) {
    return `${size} bytes`;
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const FileIcon = () => (
  <svg
    className="h-8 w-8"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.25 2.75H7A2.25 2.25 0 0 0 4.75 5v14A2.25 2.25 0 0 0 7 21.25h10A2.25 2.25 0 0 0 19.25 19V7.75l-5-5Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.25 2.75v5h5M8 14h8M8 17.5h5"
    />
  </svg>
);

const SummaryMetric = ({
  label,
  value,
  variant,
}) => {
  const colorClassName = variant === 'success'
    ? 'text-green-700'
    : variant === 'danger'
      ? 'text-red-700'
      : 'text-amber-700';

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
        {label}
      </dt>
      <dd className={`mt-1 text-2xl font-semibold ${colorClassName}`}>
        {value}
      </dd>
    </div>
  );
};

SummaryMetric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  variant: PropTypes.oneOf([
    'success',
    'danger',
    'warning',
  ]).isRequired,
};

/**
 * Presents the browser-local CSV/JSON dataset import workflow.
 *
 * @param {{
 *   className?: string,
 *   importer?: {
 *     importFile: Function
 *   },
 *   onImportComplete?: Function
 * }} props Import panel properties.
 * @returns {import('react').ReactNode} Dataset import panel.
 */
export const ImportPanel = ({
  className = '',
  importer = datasetImportFacade,
  onImportComplete = null,
}) => {
  const generatedId = useId();
  const inputId = `dataset-import-${generatedId.replace(/:/g, '')}`;
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState(IMPORT_STATUSES.IDLE);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const summary = useMemo(
    () => resolveImportSummary(result),
    [result],
  );
  const capacityGapWarnings = useMemo(
    () => (
      summary?.warnings.filter((warning) => (
        warning.code === CAPACITY_GAP_CODE
      )) ?? []
    ),
    [summary],
  );
  const otherWarnings = useMemo(
    () => (
      summary?.warnings.filter((warning) => (
        warning.code !== CAPACITY_GAP_CODE
      )) ?? []
    ),
    [summary],
  );
  const isImporting = status === IMPORT_STATUSES.IMPORTING;
  const unsupportedInput = Boolean(
    error?.unsupported || isUnsupportedError(error),
  );

  const resetOutcome = () => {
    setError(null);
    setResult(null);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;

    resetOutcome();

    if (!file) {
      setSelectedFile(null);
      setStatus(IMPORT_STATUSES.IDLE);
      return;
    }

    setSelectedFile(file);

    if (!isSupportedFile(file)) {
      setStatus(IMPORT_STATUSES.FAILED);
      setError({
        ...createError(
          'IMPORT_UNSUPPORTED_FILE_TYPE',
          'Only CSV and JSON files are supported.',
        ),
        unsupported: true,
      });
      return;
    }

    setStatus(IMPORT_STATUSES.READY);
  };

  const handleClear = () => {
    if (isImporting) {
      return;
    }

    setSelectedFile(null);
    setStatus(IMPORT_STATUSES.IDLE);
    resetOutcome();

    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.focus();
    }
  };

  const handleImport = async () => {
    if (!selectedFile || isImporting) {
      return;
    }

    if (!isSupportedFile(selectedFile)) {
      setStatus(IMPORT_STATUSES.FAILED);
      setError({
        ...createError(
          'IMPORT_UNSUPPORTED_FILE_TYPE',
          'Only CSV and JSON files are supported.',
        ),
        unsupported: true,
      });
      return;
    }

    if (typeof importer?.importFile !== 'function') {
      setStatus(IMPORT_STATUSES.FAILED);
      setError(createError(
        'DATASET_IMPORT_UNAVAILABLE',
        'The dataset import service is unavailable.',
      ));
      return;
    }

    setStatus(IMPORT_STATUSES.IMPORTING);
    resetOutcome();

    let importResult;

    try {
      importResult = await importer.importFile({
        file: selectedFile,
        fileName: selectedFile.name,
        name: selectedFile.name,
        mimeType: selectedFile.type,
        type: selectedFile.type,
        sizeBytes: selectedFile.size,
        size: selectedFile.size,
        options: {
          activateOnSuccess: true,
        },
      });
    } catch {
      importResult = {
        ok: false,
        data: null,
        error: createError(
          'DATASET_IMPORT_FAILED',
          'The dataset import could not be completed.',
        ),
      };
    }

    setResult(importResult);

    if (importResult?.ok) {
      setStatus(IMPORT_STATUSES.SUCCEEDED);
      setError(null);
    } else {
      setStatus(IMPORT_STATUSES.FAILED);
      setError(importResult?.error ?? createError(
        'DATASET_IMPORT_FAILED',
        'The dataset import could not be completed.',
      ));
    }

    if (typeof onImportComplete === 'function') {
      try {
        onImportComplete(importResult);
      } catch {
        // Consumer callback failures do not invalidate the import result.
      }
    }
  };

  return (
    <section
      className={`rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm ${className}`}
      aria-labelledby={`${inputId}-title`}
    >
      <div className="border-b border-neutral-200 px-5 py-5 sm:px-6">
        <h1
          id={`${inputId}-title`}
          className="text-xl font-semibold text-neutral-900"
        >
          Import dataset
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Select a CSV or JSON file to validate and activate in this
          browser. The source file is processed locally and is not uploaded.
        </p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <div>
          <label
            htmlFor={inputId}
            className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 py-8 text-center transition-colors ${
              isImporting
                ? 'cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-500'
                : 'border-neutral-300 bg-neutral-50 text-neutral-700 hover:border-teal-500 hover:bg-teal-50'
            }`}
          >
            <span className="text-teal-700">
              <FileIcon />
            </span>
            <span className="mt-3 text-sm font-semibold text-neutral-900">
              Choose a CSV or JSON file
            </span>
            <span className="mt-1 text-xs text-neutral-600">
              Supported formats: .csv and .json
            </span>
          </label>

          <input
            ref={inputRef}
            id={inputId}
            type="file"
            className="sr-only"
            accept={ACCEPTED_FILE_TYPES}
            disabled={isImporting}
            aria-describedby={`${inputId}-requirements`}
            onChange={handleFileChange}
          />

          <p
            id={`${inputId}-requirements`}
            className="mt-2 text-xs leading-5 text-neutral-600"
          >
            The file must contain at least one valid work item. Invalid
            imports leave the current active dataset unchanged.
          </p>
        </div>

        {selectedFile ? (
          <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-neutral-900">
                {selectedFile.name}
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isImporting}
                onClick={handleClear}
              >
                Clear
              </button>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  isImporting
                  || !isSupportedFile(selectedFile)
                }
                onClick={handleImport}
              >
                {isImporting ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden="true"
                  />
                ) : null}
                {isImporting ? 'Processing…' : 'Import dataset'}
              </button>
            </div>
          </div>
        ) : null}

        {isImporting ? (
          <div
            className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            Validating and processing the selected dataset…
          </div>
        ) : null}

        {status === IMPORT_STATUSES.SUCCEEDED ? (
          <div
            className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-950"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold">Dataset imported successfully</p>
            <p className="mt-1 leading-5 text-green-900">
              The validated dataset is now active in this browser.
            </p>
          </div>
        ) : null}

        {status === IMPORT_STATUSES.FAILED && error ? (
          <div
            className={`rounded-lg border px-4 py-3 ${
              unsupportedInput
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-red-200 bg-red-50 text-red-950'
            }`}
            role="alert"
          >
            <p className="text-sm font-semibold">
              {unsupportedInput
                ? 'Unsupported file type'
                : 'Dataset could not be imported'}
            </p>
            <p className="mt-1 text-sm leading-5">
              {error.message}
            </p>
            {!unsupportedInput ? (
              <p className="mt-2 text-xs leading-5">
                The current active dataset was not replaced.
              </p>
            ) : null}
          </div>
        ) : null}

        {summary ? (
          <section aria-labelledby={`${inputId}-summary-title`}>
            <h2
              id={`${inputId}-summary-title`}
              className="text-base font-semibold text-neutral-900"
            >
              Validation summary
            </h2>

            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <SummaryMetric
                label="Accepted rows"
                value={summary.acceptedRows}
                variant="success"
              />
              <SummaryMetric
                label="Rejected rows"
                value={summary.rejectedRows}
                variant="danger"
              />
              <SummaryMetric
                label="Warnings"
                value={summary.warningCount}
                variant="warning"
              />
            </dl>
          </section>
        ) : null}

        {capacityGapWarnings.length > 0 ? (
          <section
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"
            aria-labelledby={`${inputId}-capacity-gaps-title`}
          >
            <h2
              id={`${inputId}-capacity-gaps-title`}
              className="text-sm font-semibold"
            >
              Capacity coverage gaps
            </h2>
            <p className="mt-1 text-sm leading-5 text-amber-900">
              Some work-item allocations do not have matching capacity
              records. Their capacity metrics will appear as unavailable.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {capacityGapWarnings.map((warning, index) => (
                <li
                  key={`${warning.code}:${index}`}
                  className="rounded-md bg-amber-100/70 px-3 py-2"
                >
                  <span>{warning.message}</span>
                  {Array.isArray(warning.rowRefs)
                    && warning.rowRefs.length > 0 ? (
                      <span className="mt-1 block text-xs text-amber-800">
                        Rows: {warning.rowRefs.join(', ')}
                      </span>
                    ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {otherWarnings.length > 0 ? (
          <section aria-labelledby={`${inputId}-warnings-title`}>
            <h2
              id={`${inputId}-warnings-title`}
              className="text-sm font-semibold text-neutral-900"
            >
              Import warnings
            </h2>
            <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-neutral-50">
              {otherWarnings.map((warning, index) => (
                <li
                  key={`${warning.code ?? 'warning'}:${index}`}
                  className="px-4 py-3 text-sm text-neutral-700"
                >
                  <p>{warning.message}</p>
                  {Array.isArray(warning.rowRefs)
                    && warning.rowRefs.length > 0 ? (
                      <p className="mt-1 text-xs text-neutral-600">
                        Rows: {warning.rowRefs.join(', ')}
                      </p>
                    ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
};

ImportPanel.propTypes = {
  className: PropTypes.string,
  importer: PropTypes.shape({
    importFile: PropTypes.func.isRequired,
  }),
  onImportComplete: PropTypes.func,
};

export default ImportPanel;