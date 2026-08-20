import Papa from 'papaparse';
import { SUPPORTED_SCHEMA_VERSION } from '../config/appConfig.js';

export const DATASET_EXPORT_FORMATS = Object.freeze({
  CSV: 'csv',
  JSON: 'json',
});

export const DATASET_EXPORT_ERROR_CODES = Object.freeze({
  DATASET_REQUIRED: 'DATASET_EXPORT_REQUIRED',
  INVALID_FORMAT: 'DATASET_EXPORT_INVALID_FORMAT',
  SERIALIZE_FAILED: 'DATASET_EXPORT_SERIALIZE_FAILED',
});

export const CSV_EXPORT_COLUMNS = Object.freeze([
  'recordType',
  'recordId',
  'planningLevel',
  'program',
  'epic',
  'itemId',
  'feature',
  'featureWorkType',
  'owner',
  'estimatedPoints',
  'team',
  'art',
  'status',
  'startDate',
  'endDate',
  'allocations',
  'allocationPoints',
  'capacityPoints',
  'reservedSupportPercent',
  'ptoImpactPoints',
  'holidayImpactPoints',
  'confidence',
]);

const createError = (code, message) => ({
  code,
  message,
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const normalizeText = (value) => (
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
);

const normalizeNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : ''
);

const resolveDataset = (source) => {
  if (!isRecord(source)) {
    return null;
  }

  if (
    Array.isArray(source.workItems)
    || Array.isArray(source.capacityRecords)
  ) {
    return source;
  }

  return source.dataset
    ?? source.activeDataset
    ?? source.data?.dataset
    ?? null;
};

const formatTeamList = (teams) => (
  Array.isArray(teams)
    ? teams.map(normalizeText).filter(Boolean).join(',')
    : normalizeText(teams)
);

const formatAllocations = (allocations) => {
  if (!isRecord(allocations)) {
    return '';
  }

  return Object.entries(allocations)
    .map(([team, points]) => {
      const normalizedTeam = normalizeText(team);

      if (
        !normalizedTeam
        || typeof points !== 'number'
        || !Number.isFinite(points)
      ) {
        return null;
      }

      return `${normalizedTeam}:${points}`;
    })
    .filter(Boolean)
    .join(';');
};

const createEmptyCsvRow = () => (
  Object.fromEntries(CSV_EXPORT_COLUMNS.map((column) => [column, '']))
);

const createWorkItemCsvRow = (workItem) => ({
  ...createEmptyCsvRow(),
  recordType: 'workItem',
  recordId: normalizeText(workItem?.recordId),
  planningLevel: normalizeText(workItem?.planningLevel),
  program: normalizeText(workItem?.program),
  epic: normalizeText(workItem?.epic),
  itemId: normalizeText(workItem?.itemId),
  feature: normalizeText(workItem?.feature),
  featureWorkType: normalizeText(workItem?.featureWorkType),
  owner: normalizeText(workItem?.owner),
  estimatedPoints: normalizeNumber(workItem?.estimatedPoints),
  team: formatTeamList(workItem?.team),
  art: normalizeText(workItem?.art),
  status: normalizeText(workItem?.status),
  startDate: normalizeText(workItem?.startDate),
  endDate: normalizeText(workItem?.endDate),
  allocations: formatAllocations(workItem?.allocations),
});

const createCapacityCsvRow = (capacityRecord) => ({
  ...createEmptyCsvRow(),
  recordType: 'capacityRecord',
  planningLevel: normalizeText(capacityRecord?.planningLevel),
  team: normalizeText(capacityRecord?.team),
  capacityPoints: normalizeNumber(capacityRecord?.capacityPoints),
  reservedSupportPercent: normalizeNumber(
    capacityRecord?.reservedSupportPercent,
  ),
  ptoImpactPoints: normalizeNumber(capacityRecord?.ptoImpactPoints),
  holidayImpactPoints: normalizeNumber(
    capacityRecord?.holidayImpactPoints,
  ),
  confidence: normalizeText(capacityRecord?.confidence) || 'Unknown',
});

const createExportFileName = (format, clock) => {
  let date;

  try {
    date = typeof clock === 'function' ? clock() : new Date();
  } catch {
    date = new Date();
  }

  const resolvedDate = date instanceof Date ? date : new Date(date);
  const stamp = Number.isNaN(resolvedDate.getTime())
    ? new Date().toISOString().slice(0, 10)
    : resolvedDate.toISOString().slice(0, 10);

  return `cft-dataset-${stamp}.${format}`;
};

const serializeCsv = (dataset) => {
  const workItems = Array.isArray(dataset.workItems)
    ? dataset.workItems
    : [];
  const capacityRecords = Array.isArray(dataset.capacityRecords)
    ? dataset.capacityRecords
    : [];
  const rows = [
    ...workItems.map(createWorkItemCsvRow),
    ...capacityRecords.map(createCapacityCsvRow),
  ];

  return Papa.unparse({
    fields: [...CSV_EXPORT_COLUMNS],
    data: rows.map((row) => (
      CSV_EXPORT_COLUMNS.map((column) => row[column])
    )),
  });
};

const serializeJson = (dataset) => (
  `${JSON.stringify({
    schemaVersion: dataset.schemaVersion || SUPPORTED_SCHEMA_VERSION,
    workItems: Array.isArray(dataset.workItems) ? dataset.workItems : [],
    capacityRecords: Array.isArray(dataset.capacityRecords)
      ? dataset.capacityRecords
      : [],
  }, null, 2)}\n`
);

/**
 * Serializes the active dataset into a re-importable CSV or JSON file.
 */
export class DatasetExportService {
  constructor(clock = () => new Date()) {
    this.clock = clock;
  }

  /**
   * Builds an export file for the supplied dataset.
   *
   * @param {object} source Dataset or dataset-like source.
   * @param {{format?: string}} [options] Export options.
   * @returns {{
   *   ok: boolean,
   *   data: {
   *     content: string,
   *     filename: string,
   *     mimeType: string,
   *     format: string,
   *     workItemCount: number,
   *     capacityRecordCount: number
   *   }|null,
   *   error?: object
   * }} Export file result.
   */
  createExportFile(source, options = {}) {
    const dataset = resolveDataset(source);
    const format = normalizeText(options.format).toLowerCase()
      || DATASET_EXPORT_FORMATS.CSV;

    if (!dataset) {
      return {
        ok: false,
        data: null,
        error: createError(
          DATASET_EXPORT_ERROR_CODES.DATASET_REQUIRED,
          'There is no active dataset to export.',
        ),
      };
    }

    const workItemCount = Array.isArray(dataset.workItems)
      ? dataset.workItems.length
      : 0;
    const capacityRecordCount = Array.isArray(dataset.capacityRecords)
      ? dataset.capacityRecords.length
      : 0;

    if (workItemCount === 0 && capacityRecordCount === 0) {
      return {
        ok: false,
        data: null,
        error: createError(
          DATASET_EXPORT_ERROR_CODES.DATASET_REQUIRED,
          'The active dataset does not contain records to export.',
        ),
      };
    }

    if (
      format !== DATASET_EXPORT_FORMATS.CSV
      && format !== DATASET_EXPORT_FORMATS.JSON
    ) {
      return {
        ok: false,
        data: null,
        error: createError(
          DATASET_EXPORT_ERROR_CODES.INVALID_FORMAT,
          'Export format must be CSV or JSON.',
        ),
      };
    }

    try {
      const content = format === DATASET_EXPORT_FORMATS.JSON
        ? serializeJson(dataset)
        : serializeCsv(dataset);

      return {
        ok: true,
        data: {
          content,
          filename: createExportFileName(format, this.clock),
          mimeType: format === DATASET_EXPORT_FORMATS.JSON
            ? 'application/json'
            : 'text/csv',
          format,
          workItemCount,
          capacityRecordCount,
        },
      };
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          DATASET_EXPORT_ERROR_CODES.SERIALIZE_FAILED,
          'The active dataset could not be exported.',
        ),
      };
    }
  }
}

export const datasetExportService = new DatasetExportService();

export const createExportFile = (source, options = {}) => (
  datasetExportService.createExportFile(source, options)
);

export default datasetExportService;
