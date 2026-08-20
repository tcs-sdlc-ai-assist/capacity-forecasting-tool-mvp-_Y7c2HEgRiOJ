import { CAPACITY_STATES, DEFAULT_THRESHOLDS } from '../../../constants/domainConstants.js';
import {
  selectCapacityRecords,
  selectTeamOptions,
  selectVisibleWorkItems,
} from './datasetSelectors.js';
import { classifyUtilization } from '../utils/thresholds.js';

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const isFiniteNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value)
);

const normalizeText = (value) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeContextValue = (value) => (
  normalizeText(value).toLocaleLowerCase()
);

const uniqueStrings = (values) => (
  [...new Set(
    values
      .filter((value) => (
        typeof value === 'string'
        || typeof value === 'number'
      ))
      .map((value) => String(value).trim())
      .filter(Boolean),
  )]
);

const compareText = (first, second) => {
  const normalizedFirst = String(first).toLocaleLowerCase();
  const normalizedSecond = String(second).toLocaleLowerCase();

  if (normalizedFirst < normalizedSecond) {
    return -1;
  }

  if (normalizedFirst > normalizedSecond) {
    return 1;
  }

  return String(first).localeCompare(String(second));
};

const normalizeAllocation = (value) => (
  isFiniteNumber(value) && value >= 0 ? value : 0
);

const normalizePercentage = (value) => (
  isFiniteNumber(value)
    ? Math.min(100, Math.max(0, value))
    : 0
);

const resolveThresholds = (source) => {
  if (
    isRecord(source)
    && isFiniteNumber(source.constrained)
    && isFiniteNumber(source.exceeded)
  ) {
    return source;
  }

  if (
    isRecord(source?.thresholds)
    && isFiniteNumber(source.thresholds.constrained)
    && isFiniteNumber(source.thresholds.exceeded)
  ) {
    return source.thresholds;
  }

  return DEFAULT_THRESHOLDS;
};

const safelyClassifyUtilization = (utilizationPercent, thresholds) => {
  try {
    return classifyUtilization(utilizationPercent, thresholds);
  } catch {
    return CAPACITY_STATES.UNAVAILABLE;
  }
};

const getAllocationPoints = (workItem, team) => {
  if (!isRecord(workItem?.allocations)) {
    return 0;
  }

  return normalizeAllocation(workItem.allocations[team]);
};

const getAllocatedTeams = (workItem) => (
  isRecord(workItem?.allocations)
    ? Object.keys(workItem.allocations).filter((team) => (
      normalizeText(team).length > 0
    ))
    : []
);

const createUnavailableMetric = ({
  planningLevel,
  team,
  allocationPoints = 0,
  cumulativeAllocationPoints = 0,
  recordId = null,
  rowIndex = null,
  capacityRecord = null,
} = {}) => ({
  planningLevel: normalizeText(planningLevel),
  team: normalizeText(team),
  recordId,
  rowIndex,
  allocationPoints,
  allocatedPoints: cumulativeAllocationPoints,
  cumulativeAllocationPoints,
  capacityPoints: capacityRecord?.capacityPoints ?? null,
  reservedSupportPercent: capacityRecord?.reservedSupportPercent ?? null,
  ptoImpactPoints: capacityRecord?.ptoImpactPoints ?? null,
  holidayImpactPoints: capacityRecord?.holidayImpactPoints ?? null,
  effectiveCapacityPoints: null,
  differentialPoints: null,
  variancePoints: null,
  remainingCapacityPoints: null,
  overCapacityPoints: null,
  utilizationPercent: null,
  utilization: null,
  state: CAPACITY_STATES.UNAVAILABLE,
  capacityState: CAPACITY_STATES.UNAVAILABLE,
  confidence: capacityRecord?.confidence ?? 'Unknown',
  capacityRecord,
  isAvailable: false,
  hasCapacityRecord: Boolean(capacityRecord),
});

/**
 * Creates a normalized key for a planning-level and team capacity context.
 *
 * @param {*} planningLevel Planning-level value.
 * @param {*} team Team value.
 * @returns {string} Stable context key, or an empty string when incomplete.
 */
export const createCapacityContextKey = (planningLevel, team) => {
  const normalizedPlanningLevel = normalizeContextValue(planningLevel);
  const normalizedTeam = normalizeContextValue(team);

  if (!normalizedPlanningLevel || !normalizedTeam) {
    return '';
  }

  return JSON.stringify([
    normalizedPlanningLevel,
    normalizedTeam,
  ]);
};

/**
 * Calculates capacity after support reservations, PTO, and holiday impacts.
 *
 * @param {*} capacityRecord Capacity-record value.
 * @returns {number|null} Effective capacity, or null for an invalid record.
 */
export const calculateEffectiveCapacity = (capacityRecord) => {
  if (
    !isRecord(capacityRecord)
    || !isFiniteNumber(capacityRecord.capacityPoints)
    || capacityRecord.capacityPoints < 0
  ) {
    return null;
  }

  const reservedSupportPercent = normalizePercentage(
    capacityRecord.reservedSupportPercent,
  );
  const ptoImpactPoints = normalizeAllocation(
    capacityRecord.ptoImpactPoints,
  );
  const holidayImpactPoints = normalizeAllocation(
    capacityRecord.holidayImpactPoints,
  );
  const afterSupport = capacityRecord.capacityPoints
    * (1 - (reservedSupportPercent / 100));

  return Math.max(
    0,
    afterSupport - ptoImpactPoints - holidayImpactPoints,
  );
};

export const selectEffectiveCapacity = calculateEffectiveCapacity;

/**
 * Indexes capacity records by planning level and team.
 *
 * The first record for a normalized context is authoritative.
 *
 * @param {*} source Dataset-like source or capacity-record array.
 * @returns {Map<string, object>} Capacity records keyed by context.
 */
export const selectCapacityLookup = (source) => {
  const capacityRecords = Array.isArray(source)
    ? source
    : selectCapacityRecords(source);
  const lookup = new Map();

  capacityRecords.forEach((capacityRecord) => {
    if (!isRecord(capacityRecord)) {
      return;
    }

    const key = createCapacityContextKey(
      capacityRecord.planningLevel,
      capacityRecord.team,
    );

    if (key && !lookup.has(key)) {
      lookup.set(key, capacityRecord);
    }
  });

  return lookup;
};

export const createCapacityLookup = selectCapacityLookup;

/**
 * Finds capacity for one planning-level and team context.
 *
 * @param {*} source Dataset-like source or capacity-record array.
 * @param {*} planningLevel Planning level.
 * @param {*} team Team.
 * @returns {object|null} Matching capacity record.
 */
export const selectCapacityRecord = (
  source,
  planningLevel,
  team,
) => {
  const key = createCapacityContextKey(planningLevel, team);

  return key ? selectCapacityLookup(source).get(key) ?? null : null;
};

export const selectMatchingCapacity = selectCapacityRecord;

/**
 * Creates analytics for one cumulative allocation cell.
 *
 * @param {object} input Cell inputs.
 * @param {object} [thresholds] Utilization thresholds.
 * @returns {object} Capacity cell analytics.
 */
export const createCapacityCellMetric = (
  input = {},
  thresholds = DEFAULT_THRESHOLDS,
) => {
  const capacityRecord = isRecord(input.capacityRecord)
    ? input.capacityRecord
    : null;
  const allocationPoints = normalizeAllocation(
    input.allocationPoints,
  );
  const cumulativeAllocationPoints = normalizeAllocation(
    input.cumulativeAllocationPoints
      ?? input.allocatedPoints
      ?? allocationPoints,
  );
  const effectiveCapacityPoints = calculateEffectiveCapacity(
    capacityRecord,
  );

  if (
    !capacityRecord
    || effectiveCapacityPoints === null
    || effectiveCapacityPoints <= 0
  ) {
    return createUnavailableMetric({
      planningLevel: input.planningLevel
        ?? capacityRecord?.planningLevel,
      team: input.team ?? capacityRecord?.team,
      allocationPoints,
      cumulativeAllocationPoints,
      recordId: input.recordId ?? null,
      rowIndex: Number.isInteger(input.rowIndex)
        ? input.rowIndex
        : null,
      capacityRecord,
    });
  }

  const utilizationPercent = (
    cumulativeAllocationPoints / effectiveCapacityPoints
  ) * 100;
  const differentialPoints = (
    effectiveCapacityPoints - cumulativeAllocationPoints
  );
  const state = safelyClassifyUtilization(
    utilizationPercent,
    resolveThresholds(thresholds),
  );

  return {
    planningLevel: normalizeText(
      input.planningLevel ?? capacityRecord.planningLevel,
    ),
    team: normalizeText(input.team ?? capacityRecord.team),
    recordId: input.recordId ?? null,
    rowIndex: Number.isInteger(input.rowIndex)
      ? input.rowIndex
      : null,
    allocationPoints,
    allocatedPoints: cumulativeAllocationPoints,
    cumulativeAllocationPoints,
    capacityPoints: capacityRecord.capacityPoints,
    reservedSupportPercent: normalizePercentage(
      capacityRecord.reservedSupportPercent,
    ),
    ptoImpactPoints: normalizeAllocation(
      capacityRecord.ptoImpactPoints,
    ),
    holidayImpactPoints: normalizeAllocation(
      capacityRecord.holidayImpactPoints,
    ),
    effectiveCapacityPoints,
    differentialPoints,
    variancePoints: differentialPoints,
    remainingCapacityPoints: Math.max(0, differentialPoints),
    overCapacityPoints: Math.max(0, -differentialPoints),
    utilizationPercent,
    utilization: utilizationPercent,
    state,
    capacityState: state,
    confidence: normalizeText(capacityRecord.confidence) || 'Unknown',
    capacityRecord,
    isAvailable: true,
    hasCapacityRecord: true,
  };
};

export const calculateCapacityCell = createCapacityCellMetric;

const resolveVisibleRows = (source, filterSource, sorting) => (
  selectVisibleWorkItems(source, filterSource, sorting)
);

const resolveTeams = (source, visibleRows, explicitTeams) => {
  if (Array.isArray(explicitTeams)) {
    return uniqueStrings(explicitTeams);
  }

  return uniqueStrings([
    ...selectTeamOptions(source),
    ...visibleRows.flatMap((workItem) => (
      Array.isArray(workItem?.team) ? workItem.team : []
    )),
    ...visibleRows.flatMap(getAllocatedTeams),
    ...selectCapacityRecords(source).map((record) => record?.team),
  ]).sort(compareText);
};

/**
 * Computes every team cell in visible sorted row order.
 *
 * Cumulative allocation is maintained independently for each combination of
 * planning level and team.
 *
 * @param {*} source Dataset-like source or work-item array.
 * @param {*} filterSource Forecast filter state.
 * @param {object[]} [sorting] Optional sorting override.
 * @param {object} [options] Selector options.
 * @returns {object[]} Flat capacity-cell collection.
 */
export const selectCapacityCells = (
  source,
  filterSource = {},
  sorting,
  options = {},
) => {
  const visibleRows = resolveVisibleRows(
    source,
    filterSource,
    sorting,
  );
  const capacitySource = options.capacityRecords ?? source;
  const capacityLookup = selectCapacityLookup(capacitySource);
  const teams = resolveTeams(source, visibleRows, options.teams);
  const thresholds = resolveThresholds(
    options.thresholds ?? filterSource,
  );
  const cumulativeAllocations = new Map();
  const cells = [];

  visibleRows.forEach((workItem, rowIndex) => {
    const planningLevel = normalizeText(workItem?.planningLevel);

    teams.forEach((team) => {
      const contextKey = createCapacityContextKey(
        planningLevel,
        team,
      );
      const allocationPoints = getAllocationPoints(workItem, team);
      const cumulativeAllocationPoints = (
        (cumulativeAllocations.get(contextKey) ?? 0)
        + allocationPoints
      );

      cumulativeAllocations.set(
        contextKey,
        cumulativeAllocationPoints,
      );

      cells.push(createCapacityCellMetric({
        planningLevel,
        team,
        recordId: workItem?.recordId ?? null,
        rowIndex,
        allocationPoints,
        cumulativeAllocationPoints,
        capacityRecord: capacityLookup.get(contextKey) ?? null,
      }, thresholds));
    });
  });

  return cells;
};

export const selectCumulativeCapacityCells = selectCapacityCells;
export const selectCapacityCellMetrics = selectCapacityCells;

/**
 * Returns visible rows decorated with per-team cumulative capacity cells.
 *
 * @param {*} source Dataset-like source or work-item array.
 * @param {*} filterSource Forecast filter state.
 * @param {object[]} [sorting] Optional sorting override.
 * @param {object} [options] Selector options.
 * @returns {object[]} Decorated visible rows.
 */
export const selectCapacityRows = (
  source,
  filterSource = {},
  sorting,
  options = {},
) => {
  const visibleRows = resolveVisibleRows(
    source,
    filterSource,
    sorting,
  );
  const cells = selectCapacityCells(
    source,
    filterSource,
    sorting,
    options,
  );
  const cellsByRow = new Map();

  cells.forEach((cell) => {
    const rowCells = cellsByRow.get(cell.rowIndex) ?? [];

    rowCells.push(cell);
    cellsByRow.set(cell.rowIndex, rowCells);
  });

  return visibleRows.map((workItem, rowIndex) => {
    const capacityCells = cellsByRow.get(rowIndex) ?? [];
    const capacityByTeam = Object.fromEntries(
      capacityCells.map((cell) => [cell.team, cell]),
    );

    return {
      ...workItem,
      capacityCells,
      cells: capacityCells,
      capacityByTeam,
      capacityMetrics: capacityByTeam,
    };
  });
};

export const selectCumulativeAllocationRows = selectCapacityRows;
export const selectCapacityAnalyticsRows = selectCapacityRows;

const resolveDetailArguments = (
  planningLevelOrOptions,
  team,
  filterSource,
  sorting,
) => {
  if (isRecord(planningLevelOrOptions)) {
    return {
      planningLevel: planningLevelOrOptions.planningLevel,
      team: planningLevelOrOptions.team,
      filterSource: planningLevelOrOptions.filters
        ?? planningLevelOrOptions.filterSource
        ?? filterSource,
      sorting: planningLevelOrOptions.sorting ?? sorting,
      thresholds: planningLevelOrOptions.thresholds,
    };
  }

  return {
    planningLevel: planningLevelOrOptions,
    team,
    filterSource,
    sorting,
    thresholds: undefined,
  };
};

/**
 * Creates a detail payload for one planning-level and team context.
 *
 * @param {*} source Dataset-like source.
 * @param {string|object} planningLevelOrOptions Planning level or options.
 * @param {string} [team] Team.
 * @param {*} [filterSource] Forecast filter state.
 * @param {object[]} [sorting] Optional sorting override.
 * @returns {object} Capacity detail payload.
 */
export const selectCapacityDetailPayload = (
  source,
  planningLevelOrOptions,
  team,
  filterSource = {},
  sorting,
) => {
  const detailOptions = resolveDetailArguments(
    planningLevelOrOptions,
    team,
    filterSource,
    sorting,
  );
  const planningLevel = normalizeText(detailOptions.planningLevel);
  const normalizedTeam = normalizeText(detailOptions.team);
  const contextKey = createCapacityContextKey(
    planningLevel,
    normalizedTeam,
  );
  const visibleRows = resolveVisibleRows(
    source,
    detailOptions.filterSource,
    detailOptions.sorting,
  );
  const matchingRows = visibleRows.filter((workItem) => (
    createCapacityContextKey(
      workItem?.planningLevel,
      normalizedTeam,
    ) === contextKey
    && (
      getAllocatedTeams(workItem).includes(normalizedTeam)
      || (
        Array.isArray(workItem?.team)
        && workItem.team.includes(normalizedTeam)
      )
    )
  ));
  const allocationPoints = matchingRows.reduce(
    (total, workItem) => (
      total + getAllocationPoints(workItem, normalizedTeam)
    ),
    0,
  );
  const capacityRecord = selectCapacityRecord(
    source,
    planningLevel,
    normalizedTeam,
  );
  const metric = createCapacityCellMetric({
    planningLevel,
    team: normalizedTeam,
    allocationPoints,
    cumulativeAllocationPoints: allocationPoints,
    capacityRecord,
  }, detailOptions.thresholds ?? resolveThresholds(filterSource));

  return {
    ...metric,
    workItems: [...matchingRows],
    rows: [...matchingRows],
    workItemCount: matchingRows.length,
    recordIds: matchingRows
      .map((workItem) => workItem?.recordId)
      .filter((recordId) => typeof recordId === 'string'),
  };
};

export const selectCapacityDetails = selectCapacityDetailPayload;
export const selectCapacityDetail = selectCapacityDetailPayload;

const createSummaryCapacityContexts = (
  source,
  visibleRows,
  allocationContexts,
) => {
  const visiblePlanningLevels = new Set(
    visibleRows
      .map((workItem) => normalizeContextValue(
        workItem?.planningLevel,
      ))
      .filter(Boolean),
  );
  const contexts = new Map();

  selectCapacityRecords(source).forEach((capacityRecord) => {
    const planningLevel = normalizeContextValue(
      capacityRecord?.planningLevel,
    );

    if (
      visiblePlanningLevels.size > 0
      && !visiblePlanningLevels.has(planningLevel)
    ) {
      return;
    }

    const key = createCapacityContextKey(
      capacityRecord?.planningLevel,
      capacityRecord?.team,
    );

    if (key && !contexts.has(key)) {
      contexts.set(key, capacityRecord);
    }
  });

  allocationContexts.forEach((_points, key) => {
    if (!contexts.has(key)) {
      contexts.set(key, null);
    }
  });

  return contexts;
};

/**
 * Calculates aggregate allocation, effective capacity, variance, utilization,
 * and capacity state for the visible forecast rows.
 *
 * @param {*} source Dataset-like source.
 * @param {*} filterSource Forecast filter state.
 * @param {object[]} [sorting] Optional sorting override.
 * @param {object} [options] Selector options.
 * @returns {object} Visible capacity summary.
 */
export const selectCapacitySummary = (
  source,
  filterSource = {},
  sorting,
  options = {},
) => {
  const visibleRows = resolveVisibleRows(
    source,
    filterSource,
    sorting,
  );
  const thresholds = resolveThresholds(
    options.thresholds ?? filterSource,
  );
  const allocationContexts = new Map();
  let allocatedPoints = 0;

  visibleRows.forEach((workItem) => {
    Object.entries(
      isRecord(workItem?.allocations)
        ? workItem.allocations
        : {},
    ).forEach(([team, value]) => {
      const allocation = normalizeAllocation(value);
      const key = createCapacityContextKey(
        workItem?.planningLevel,
        team,
      );

      allocatedPoints += allocation;

      if (key) {
        allocationContexts.set(
          key,
          (allocationContexts.get(key) ?? 0) + allocation,
        );
      }
    });
  });

  const capacityContexts = createSummaryCapacityContexts(
    source,
    visibleRows,
    allocationContexts,
  );
  let capacityPoints = 0;
  let effectiveCapacityPoints = 0;
  let unavailableContextCount = 0;

  capacityContexts.forEach((capacityRecord, key) => {
    if (!capacityRecord) {
      if ((allocationContexts.get(key) ?? 0) > 0) {
        unavailableContextCount += 1;
      }
      return;
    }

    capacityPoints += normalizeAllocation(
      capacityRecord.capacityPoints,
    );

    const effectiveCapacity = calculateEffectiveCapacity(
      capacityRecord,
    );

    if (effectiveCapacity === null || effectiveCapacity <= 0) {
      if ((allocationContexts.get(key) ?? 0) > 0) {
        unavailableContextCount += 1;
      }
      return;
    }

    effectiveCapacityPoints += effectiveCapacity;
  });

  const hasUsableCapacity = (
    effectiveCapacityPoints > 0
    && unavailableContextCount === 0
  );
  const utilizationPercent = hasUsableCapacity
    ? (allocatedPoints / effectiveCapacityPoints) * 100
    : null;
  const differentialPoints = hasUsableCapacity
    ? effectiveCapacityPoints - allocatedPoints
    : null;
  const state = hasUsableCapacity
    ? safelyClassifyUtilization(utilizationPercent, thresholds)
    : CAPACITY_STATES.UNAVAILABLE;

  return {
    allocatedPoints,
    allocationPoints: allocatedPoints,
    cumulativeAllocationPoints: allocatedPoints,
    capacityPoints,
    effectiveCapacityPoints: hasUsableCapacity
      ? effectiveCapacityPoints
      : effectiveCapacityPoints || null,
    differentialPoints,
    variancePoints: differentialPoints,
    remainingCapacityPoints: differentialPoints === null
      ? null
      : Math.max(0, differentialPoints),
    overCapacityPoints: differentialPoints === null
      ? null
      : Math.max(0, -differentialPoints),
    utilizationPercent,
    utilization: utilizationPercent,
    state,
    capacityState: state,
    isAvailable: hasUsableCapacity,
    workItemCount: visibleRows.length,
    capacityContextCount: capacityContexts.size,
    allocationContextCount: allocationContexts.size,
    unavailableContextCount,
  };
};

export const selectCapacitySummaryTotals = selectCapacitySummary;
export const selectCapacityTotals = selectCapacitySummary;

/**
 * Produces rows, flat cells, details, and summary totals for a forecast view.
 *
 * @param {*} source Dataset-like source.
 * @param {*} filterSource Forecast filter state.
 * @param {object[]} [sorting] Optional sorting override.
 * @param {object} [options] Selector options.
 * @returns {object} Capacity analytics result.
 */
export const selectCapacityAnalytics = (
  source,
  filterSource = {},
  sorting,
  options = {},
) => {
  const rows = selectCapacityRows(
    source,
    filterSource,
    sorting,
    options,
  );
  const cells = rows.flatMap((row) => row.capacityCells);
  const summary = selectCapacitySummary(
    source,
    filterSource,
    sorting,
    options,
  );

  return {
    rows,
    cells,
    summary,
    totals: summary,
  };
};

export const selectCapacityMetrics = selectCapacityAnalytics;

/**
 * Creates capacity selectors for a forecast view instance.
 *
 * @returns {object} Capacity selector collection.
 */
export const createCapacitySelectors = () => ({
  selectCapacityLookup,
  selectCapacityRecord,
  selectCapacityCells,
  selectCapacityRows,
  selectCapacityDetailPayload,
  selectCapacitySummary,
  selectCapacityAnalytics,
});

export default Object.freeze({
  createCapacityContextKey,
  calculateEffectiveCapacity,
  selectEffectiveCapacity,
  selectCapacityLookup,
  createCapacityLookup,
  selectCapacityRecord,
  selectMatchingCapacity,
  createCapacityCellMetric,
  calculateCapacityCell,
  selectCapacityCells,
  selectCumulativeCapacityCells,
  selectCapacityCellMetrics,
  selectCapacityRows,
  selectCumulativeAllocationRows,
  selectCapacityAnalyticsRows,
  selectCapacityDetailPayload,
  selectCapacityDetails,
  selectCapacityDetail,
  selectCapacitySummary,
  selectCapacitySummaryTotals,
  selectCapacityTotals,
  selectCapacityAnalytics,
  selectCapacityMetrics,
  createCapacitySelectors,
});