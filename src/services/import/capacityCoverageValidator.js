export const CAPACITY_CONTEXT_MISSING = 'CAPACITY_CONTEXT_MISSING';

export const CAPACITY_COVERAGE_WARNING_CODES = Object.freeze({
  CAPACITY_CONTEXT_MISSING,
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const normalizeContextValue = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = typeof value.normalize === 'function'
    ? value.normalize('NFKC')
    : value;

  return normalized.trim().toLowerCase();
};

const createContextKey = (planningLevel, team) => {
  const normalizedPlanningLevel = normalizeContextValue(planningLevel);
  const normalizedTeam = normalizeContextValue(team);

  if (!normalizedPlanningLevel || !normalizedTeam) {
    return null;
  }

  return JSON.stringify([
    normalizedPlanningLevel,
    normalizedTeam,
  ]);
};

const resolveDataset = (value) => {
  if (
    isRecord(value)
    && typeof value.ok === 'boolean'
    && Object.prototype.hasOwnProperty.call(value, 'data')
  ) {
    return value.ok ? value.data : null;
  }

  return value;
};

const resolveConfiguredRowRefs = (context) => {
  if (Array.isArray(context)) {
    return context;
  }

  if (!isRecord(context)) {
    return [];
  }

  if (Array.isArray(context.workItemRowRefs)) {
    return context.workItemRowRefs;
  }

  return Array.isArray(context.rowRefs) ? context.rowRefs : [];
};

const normalizeRowRef = (value, fallback) => {
  const candidate = isRecord(value)
    ? value.rowRef ?? value.sourceRowNumber ?? value.rowNumber
    : value;
  const normalized = Number(candidate);

  return Number.isInteger(normalized) && normalized >= 1
    ? normalized
    : fallback;
};

const resolveWorkItemRowRef = (
  workItem,
  index,
  configuredRowRefs,
) => {
  const itemRowRef = isRecord(workItem)
    ? workItem.rowRef
      ?? workItem.sourceRowNumber
      ?? workItem.rowNumber
    : undefined;
  const configuredRowRef = configuredRowRefs[index];

  return normalizeRowRef(
    configuredRowRef ?? itemRowRef,
    index + 1,
  );
};

const createMissingCoverageWarning = (
  missingReferenceCount,
  rowRefs,
) => {
  const subject = missingReferenceCount === 1
    ? 'work-item allocation references'
    : 'work-item allocations reference';

  return {
    code: CAPACITY_CONTEXT_MISSING,
    message: `${missingReferenceCount} ${subject} teams/planning levels without capacity records. Capacity metrics will show Unavailable.`,
    rowRefs: [...rowRefs],
  };
};

/**
 * Checks imported work-item allocations for matching capacity records.
 *
 * Capacity coverage is matched case-insensitively using the combination of
 * planning level and allocation team. Missing coverage is non-blocking and is
 * returned as a sanitized aggregate warning.
 */
export class CapacityCoverageValidator {
  /**
   * Validates capacity coverage for every allocation in a normalized dataset.
   *
   * @param {object} normalizedDataset Normalized dataset or successful result.
   * @param {object|number[]} sourceContext Optional source work-item row refs.
   * @returns {{warnings: object[]}} Capacity coverage warnings.
   */
  validate(normalizedDataset, sourceContext = {}) {
    const dataset = resolveDataset(normalizedDataset);

    if (!isRecord(dataset)) {
      return {
        warnings: [],
      };
    }

    const workItems = Array.isArray(dataset.workItems)
      ? dataset.workItems
      : [];
    const capacityRecords = Array.isArray(dataset.capacityRecords)
      ? dataset.capacityRecords
      : [];
    const configuredRowRefs = resolveConfiguredRowRefs(sourceContext);
    const coveredContexts = new Set();

    capacityRecords.forEach((capacityRecord) => {
      if (!isRecord(capacityRecord)) {
        return;
      }

      const contextKey = createContextKey(
        capacityRecord.planningLevel,
        capacityRecord.team,
      );

      if (contextKey) {
        coveredContexts.add(contextKey);
      }
    });

    let missingReferenceCount = 0;
    const affectedRowRefs = new Set();

    workItems.forEach((workItem, index) => {
      if (!isRecord(workItem) || !isRecord(workItem.allocations)) {
        return;
      }

      Object.keys(workItem.allocations).forEach((team) => {
        const contextKey = createContextKey(
          workItem.planningLevel,
          team,
        );

        if (!contextKey || coveredContexts.has(contextKey)) {
          return;
        }

        missingReferenceCount += 1;
        affectedRowRefs.add(resolveWorkItemRowRef(
          workItem,
          index,
          configuredRowRefs,
        ));
      });
    });

    if (missingReferenceCount === 0) {
      return {
        warnings: [],
      };
    }

    const rowRefs = Array.from(affectedRowRefs)
      .sort((first, second) => first - second);

    return {
      warnings: [
        createMissingCoverageWarning(
          missingReferenceCount,
          rowRefs,
        ),
      ],
    };
  }

  /**
   * Alias for validating capacity coverage.
   *
   * @param {object} normalizedDataset Normalized dataset.
   * @param {object|number[]} sourceContext Optional source row references.
   * @returns {{warnings: object[]}} Capacity coverage warnings.
   */
  validateCoverage(normalizedDataset, sourceContext = {}) {
    return this.validate(normalizedDataset, sourceContext);
  }
}

export const capacityCoverageValidator = new CapacityCoverageValidator();

export default capacityCoverageValidator;