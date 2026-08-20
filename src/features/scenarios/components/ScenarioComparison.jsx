import { useId, useMemo } from 'react';
import PropTypes from 'prop-types';

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

const readFiniteNumber = (...values) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
};

const resolveAllocatedPoints = (totals) => (
  readFiniteNumber(
    totals?.allocatedPoints,
    totals?.allocationPoints,
    totals?.cumulativeAllocationPoints,
    totals?.totalAllocatedPoints,
  )
);

const resolveCapacityPoints = (totals) => (
  readFiniteNumber(
    totals?.effectiveCapacityPoints,
    totals?.capacityPoints,
    totals?.totalEffectiveCapacityPoints,
    totals?.totalCapacityPoints,
  )
);

const formatNumber = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unavailable';
  }

  const rounded = Math.round(value * 10) / 10;

  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
};

const formatPoints = (value) => {
  const formatted = formatNumber(value);

  return formatted === 'Unavailable'
    ? formatted
    : `${formatted} pts`;
};

const formatDelta = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unavailable';
  }

  const formatted = formatNumber(Math.abs(value));

  if (value > 0) {
    return `+${formatted} pts`;
  }

  if (value < 0) {
    return `−${formatted} pts`;
  }

  return '0 pts';
};

const createDeltaLabel = (label, value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `${label} change unavailable`;
  }

  if (value > 0) {
    return `${label} increased by ${formatNumber(value)} points`;
  }

  if (value < 0) {
    return `${label} decreased by ${formatNumber(Math.abs(value))} points`;
  }

  return `${label} did not change`;
};

const resolveErrorMessage = (error) => {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (
    error !== null
    && typeof error === 'object'
    && typeof error.message === 'string'
    && error.message.trim()
  ) {
    return error.message.trim();
  }

  return '';
};

const resolveTotals = (
  comparison,
  baseline,
  scenario,
  baselineTotals,
  scenarioTotals,
) => ({
  baseline: baseline
    ?? baselineTotals
    ?? comparison?.baseline
    ?? comparison?.baselineTotals
    ?? null,
  scenario: scenario
    ?? scenarioTotals
    ?? comparison?.scenario
    ?? comparison?.scenarioTotals
    ?? null,
});

const resolveBuckets = (totals, key) => (
  isRecord(totals?.[key]) ? totals[key] : {}
);

const createComparisonRows = (
  baselineBuckets,
  scenarioBuckets,
) => {
  const labels = new Set([
    ...Object.keys(baselineBuckets),
    ...Object.keys(scenarioBuckets),
  ]);

  return Array.from(labels)
    .map(normalizeText)
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second))
    .map((label) => {
      const baselineBucket = isRecord(baselineBuckets[label])
        ? baselineBuckets[label]
        : {};
      const scenarioBucket = isRecord(scenarioBuckets[label])
        ? scenarioBuckets[label]
        : {};
      const baselineAllocation = resolveAllocatedPoints(
        baselineBucket,
      );
      const scenarioAllocation = resolveAllocatedPoints(
        scenarioBucket,
      );
      const baselineCapacity = resolveCapacityPoints(
        baselineBucket,
      );
      const scenarioCapacity = resolveCapacityPoints(
        scenarioBucket,
      );

      return {
        label,
        baselineAllocation,
        scenarioAllocation,
        allocationDelta: (
          baselineAllocation !== null
          && scenarioAllocation !== null
        )
          ? scenarioAllocation - baselineAllocation
          : null,
        baselineCapacity,
        scenarioCapacity,
        capacityDelta: (
          baselineCapacity !== null
          && scenarioCapacity !== null
        )
          ? scenarioCapacity - baselineCapacity
          : null,
      };
    });
};

const DeltaValue = ({
  label,
  value,
}) => (
  <span
    className="font-semibold text-neutral-900"
    aria-label={createDeltaLabel(label, value)}
  >
    {formatDelta(value)}
  </span>
);

DeltaValue.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
};

const SummaryMetric = ({
  baseline,
  label,
  scenario,
}) => {
  const delta = (
    baseline !== null
    && scenario !== null
  )
    ? scenario - baseline
    : null;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
        {label}
      </dt>
      <dd className="mt-3 grid grid-cols-2 gap-3">
        <span>
          <span className="block text-xs text-neutral-500">
            Baseline
          </span>
          <span className="mt-1 block text-lg font-semibold text-neutral-800">
            {formatPoints(baseline)}
          </span>
        </span>
        <span>
          <span className="block text-xs text-neutral-500">
            Scenario
          </span>
          <span className="mt-1 block text-lg font-semibold text-teal-800">
            {formatPoints(scenario)}
          </span>
        </span>
      </dd>
      <p className="mt-3 border-t border-neutral-200 pt-2 text-xs text-neutral-600">
        Change:{' '}
        <DeltaValue label={label} value={delta} />
      </p>
    </div>
  );
};

SummaryMetric.propTypes = {
  baseline: PropTypes.number,
  label: PropTypes.string.isRequired,
  scenario: PropTypes.number,
};

const ComparisonTable = ({
  caption,
  dimensionLabel,
  emptyMessage,
  rows,
  title,
  titleId,
}) => (
  <section
    className="overflow-hidden rounded-lg border border-neutral-200"
    aria-labelledby={titleId}
  >
    <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 sm:px-5">
      <h3
        id={titleId}
        className="text-sm font-semibold text-neutral-900"
      >
        {title}
      </h3>
    </div>

    {rows.length > 0 ? (
      <div
        className="max-w-full overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={`${title} comparison table`}
      >
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th
                rowSpan={2}
                scope="col"
                className="border-b border-r border-neutral-300 bg-neutral-100 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-700"
              >
                {dimensionLabel}
              </th>
              <th
                colSpan={3}
                scope="colgroup"
                className="border-b border-r border-neutral-300 bg-neutral-100 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-700"
              >
                Allocation
              </th>
              <th
                colSpan={3}
                scope="colgroup"
                className="border-b border-neutral-300 bg-neutral-100 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-700"
              >
                Effective capacity
              </th>
            </tr>
            <tr>
              {[
                'Baseline',
                'Scenario',
                'Change',
                'Baseline',
                'Scenario',
                'Change',
              ].map((heading, index) => (
                <th
                  key={`${heading}:${index}`}
                  scope="col"
                  className={`border-b border-neutral-300 bg-neutral-100 px-4 py-2 text-right text-xs font-semibold text-neutral-600 ${
                    index < 5 ? 'border-r' : ''
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={row.label}
                className={
                  rowIndex % 2 === 0
                    ? 'bg-neutral-0'
                    : 'bg-neutral-50'
                }
              >
                <th
                  scope="row"
                  className="min-w-44 border-b border-r border-neutral-200 px-4 py-3 text-left font-semibold text-neutral-900"
                >
                  {row.label}
                </th>
                <td className="whitespace-nowrap border-b border-r border-neutral-200 px-4 py-3 text-right text-neutral-700">
                  {formatPoints(row.baselineAllocation)}
                </td>
                <td className="whitespace-nowrap border-b border-r border-neutral-200 px-4 py-3 text-right font-semibold text-teal-800">
                  {formatPoints(row.scenarioAllocation)}
                </td>
                <td className="whitespace-nowrap border-b border-r border-neutral-200 px-4 py-3 text-right">
                  <DeltaValue
                    label={`${row.label} allocation`}
                    value={row.allocationDelta}
                  />
                </td>
                <td className="whitespace-nowrap border-b border-r border-neutral-200 px-4 py-3 text-right text-neutral-700">
                  {formatPoints(row.baselineCapacity)}
                </td>
                <td className="whitespace-nowrap border-b border-r border-neutral-200 px-4 py-3 text-right font-semibold text-teal-800">
                  {formatPoints(row.scenarioCapacity)}
                </td>
                <td className="whitespace-nowrap border-b border-neutral-200 px-4 py-3 text-right">
                  <DeltaValue
                    label={`${row.label} effective capacity`}
                    value={row.capacityDelta}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="px-4 py-6 text-sm text-neutral-600 sm:px-5">
        {emptyMessage}
      </p>
    )}
  </section>
);

ComparisonTable.propTypes = {
  caption: PropTypes.string.isRequired,
  dimensionLabel: PropTypes.string.isRequired,
  emptyMessage: PropTypes.string.isRequired,
  rows: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      baselineAllocation: PropTypes.number,
      scenarioAllocation: PropTypes.number,
      allocationDelta: PropTypes.number,
      baselineCapacity: PropTypes.number,
      scenarioCapacity: PropTypes.number,
      capacityDelta: PropTypes.number,
    }),
  ).isRequired,
  title: PropTypes.string.isRequired,
  titleId: PropTypes.string.isRequired,
};

/**
 * Presents baseline and scenario allocation and capacity changes by team and
 * planning level.
 *
 * @param {{
 *   comparison?: object,
 *   baseline?: object,
 *   scenario?: object,
 *   baselineTotals?: object,
 *   scenarioTotals?: object,
 *   title?: string,
 *   description?: string,
 *   emptyMessage?: string,
 *   isLoading?: boolean,
 *   loading?: boolean,
 *   error?: object|string,
 *   className?: string
 * }} props Scenario comparison properties.
 * @returns {import('react').ReactNode} Scenario comparison presentation.
 */
export const ScenarioComparison = ({
  comparison = null,
  baseline = null,
  scenario = null,
  baselineTotals = null,
  scenarioTotals = null,
  title = 'Baseline versus scenario',
  description = 'Compare allocation and effective capacity changes across teams and planning levels.',
  emptyMessage = 'Comparison totals are unavailable for the active scenario.',
  isLoading = false,
  loading = false,
  error = null,
  className = '',
}) => {
  const generatedId = useId();
  const idPrefix = `scenario-comparison-${generatedId.replace(/:/g, '')}`;
  const resolvedTotals = resolveTotals(
    comparison,
    baseline,
    scenario,
    baselineTotals,
    scenarioTotals,
  );
  const teamRows = useMemo(
    () => createComparisonRows(
      resolveBuckets(resolvedTotals.baseline, 'byTeam'),
      resolveBuckets(resolvedTotals.scenario, 'byTeam'),
    ),
    [resolvedTotals.baseline, resolvedTotals.scenario],
  );
  const planningLevelRows = useMemo(
    () => createComparisonRows(
      resolveBuckets(
        resolvedTotals.baseline,
        'byPlanningLevel',
      ),
      resolveBuckets(
        resolvedTotals.scenario,
        'byPlanningLevel',
      ),
    ),
    [resolvedTotals.baseline, resolvedTotals.scenario],
  );
  const baselineAllocation = resolveAllocatedPoints(
    resolvedTotals.baseline,
  );
  const scenarioAllocation = resolveAllocatedPoints(
    resolvedTotals.scenario,
  );
  const baselineCapacity = resolveCapacityPoints(
    resolvedTotals.baseline,
  );
  const scenarioCapacity = resolveCapacityPoints(
    resolvedTotals.scenario,
  );
  const hasSummary = (
    resolvedTotals.baseline !== null
    && resolvedTotals.scenario !== null
  );
  const isComparisonLoading = isLoading || loading;
  const errorMessage = resolveErrorMessage(error);

  return (
    <section
      className={`overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm ${className}`}
      aria-labelledby={`${idPrefix}-title`}
      aria-busy={isComparisonLoading || undefined}
    >
      <div className="border-b border-neutral-200 px-5 py-5 sm:px-6">
        <h2
          id={`${idPrefix}-title`}
          className="text-lg font-semibold text-neutral-900"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">
            {description}
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <div
          className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-800 sm:px-6"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {isComparisonLoading ? (
        <div
          className="px-5 py-12 text-center sm:px-6"
          role="status"
          aria-live="polite"
        >
          <span
            className="mx-auto block h-7 w-7 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700"
            aria-hidden="true"
          />
          <span className="mt-3 block text-sm font-medium text-neutral-700">
            Calculating scenario comparison…
          </span>
        </div>
      ) : hasSummary ? (
        <div className="space-y-6 p-5 sm:p-6">
          <section aria-labelledby={`${idPrefix}-summary-title`}>
            <h3
              id={`${idPrefix}-summary-title`}
              className="text-sm font-semibold text-neutral-900"
            >
              Overall change
            </h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <SummaryMetric
                label="Allocated points"
                baseline={baselineAllocation}
                scenario={scenarioAllocation}
              />
              <SummaryMetric
                label="Effective capacity"
                baseline={baselineCapacity}
                scenario={scenarioCapacity}
              />
            </dl>
          </section>

          <ComparisonTable
            title="Changes by team"
            titleId={`${idPrefix}-teams-title`}
            dimensionLabel="Team"
            caption="Baseline and scenario allocation and effective capacity by team"
            rows={teamRows}
            emptyMessage="No team-level comparison totals are available."
          />

          <ComparisonTable
            title="Changes by planning level"
            titleId={`${idPrefix}-planning-levels-title`}
            dimensionLabel="Planning level"
            caption="Baseline and scenario allocation and effective capacity by planning level"
            rows={planningLevelRows}
            emptyMessage="No planning-level comparison totals are available."
          />
        </div>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-neutral-600 sm:px-6">
          {emptyMessage}
        </p>
      )}
    </section>
  );
};

const totalsPropType = PropTypes.shape({
  allocatedPoints: PropTypes.number,
  allocationPoints: PropTypes.number,
  cumulativeAllocationPoints: PropTypes.number,
  totalAllocatedPoints: PropTypes.number,
  capacityPoints: PropTypes.number,
  effectiveCapacityPoints: PropTypes.number,
  totalCapacityPoints: PropTypes.number,
  totalEffectiveCapacityPoints: PropTypes.number,
  byTeam: PropTypes.objectOf(PropTypes.object),
  byPlanningLevel: PropTypes.objectOf(PropTypes.object),
});

ScenarioComparison.propTypes = {
  comparison: PropTypes.shape({
    baseline: totalsPropType,
    scenario: totalsPropType,
    baselineTotals: totalsPropType,
    scenarioTotals: totalsPropType,
    delta: PropTypes.object,
  }),
  baseline: totalsPropType,
  scenario: totalsPropType,
  baselineTotals: totalsPropType,
  scenarioTotals: totalsPropType,
  title: PropTypes.string,
  description: PropTypes.string,
  emptyMessage: PropTypes.string,
  isLoading: PropTypes.bool,
  loading: PropTypes.bool,
  error: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      code: PropTypes.string,
      message: PropTypes.string,
    }),
  ]),
  className: PropTypes.string,
};

export default ScenarioComparison;