import PropTypes from 'prop-types';
import CapacityDetailPopover from './CapacityDetailPopover.jsx';

const CAPACITY_STATE_CONFIG = Object.freeze({
  available: Object.freeze({
    label: 'Available',
    containerClassName: 'border-green-200 bg-green-50 text-green-900',
    iconClassName: 'text-green-700',
  }),
  healthy: Object.freeze({
    label: 'Healthy',
    containerClassName: 'border-green-200 bg-green-50 text-green-900',
    iconClassName: 'text-green-700',
  }),
  constrained: Object.freeze({
    label: 'Constrained',
    containerClassName: 'border-amber-200 bg-amber-50 text-amber-950',
    iconClassName: 'text-amber-700',
  }),
  warning: Object.freeze({
    label: 'Constrained',
    containerClassName: 'border-amber-200 bg-amber-50 text-amber-950',
    iconClassName: 'text-amber-700',
  }),
  exceeded: Object.freeze({
    label: 'Exceeded',
    containerClassName: 'border-red-200 bg-red-50 text-red-950',
    iconClassName: 'text-red-700',
  }),
  critical: Object.freeze({
    label: 'Exceeded',
    containerClassName: 'border-red-200 bg-red-50 text-red-950',
    iconClassName: 'text-red-700',
  }),
  unavailable: Object.freeze({
    label: 'Unavailable',
    containerClassName: 'border-neutral-200 bg-neutral-100 text-neutral-700',
    iconClassName: 'text-neutral-500',
  }),
});

const hasOwn = (value, key) => (
  value !== null
  && typeof value === 'object'
  && Object.prototype.hasOwnProperty.call(value, key)
);

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

const normalizeNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (
    typeof value === 'string'
    && value.trim()
    && Number.isFinite(Number(value))
  ) {
    return Number(value);
  }

  return null;
};

const formatAllocation = (value) => {
  const normalized = normalizeNumber(value);

  if (normalized === null) {
    return null;
  }

  const rounded = Math.round(normalized * 10) / 10;

  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
};

const resolveRowSource = (row, workItem) => {
  if (isRecord(workItem)) {
    return workItem;
  }

  if (isRecord(row?.original)) {
    return row.original;
  }

  return isRecord(row) ? row : null;
};

const resolveMetricSource = ({
  capacity,
  capacityDetail,
  data,
  detail,
  metric,
  rowSource,
  team,
}) => {
  const suppliedSource = detail
    ?? capacityDetail
    ?? metric
    ?? capacity
    ?? data;

  if (isRecord(suppliedSource)) {
    return suppliedSource;
  }

  if (
    isRecord(rowSource?.capacityByTeam)
    && isRecord(rowSource.capacityByTeam[team])
  ) {
    return rowSource.capacityByTeam[team];
  }

  if (
    isRecord(rowSource?.capacityMetrics)
    && isRecord(rowSource.capacityMetrics[team])
  ) {
    return rowSource.capacityMetrics[team];
  }

  return {};
};

const safelyReadCellValue = (cell, getValue) => {
  try {
    if (typeof getValue === 'function') {
      return {
        found: true,
        value: getValue(),
      };
    }

    if (typeof cell?.getValue === 'function') {
      return {
        found: true,
        value: cell.getValue(),
      };
    }
  } catch {
    return {
      found: false,
      value: undefined,
    };
  }

  return {
    found: false,
    value: undefined,
  };
};

const resolveAllocationValue = ({
  allocationPoints,
  cell,
  getValue,
  hasAllocation,
  metricSource,
  rowSource,
  team,
  value,
}) => {
  if (hasAllocation === false) {
    return null;
  }

  if (value !== undefined) {
    return normalizeNumber(value);
  }

  if (allocationPoints !== undefined) {
    return normalizeNumber(allocationPoints);
  }

  const cellValue = safelyReadCellValue(cell, getValue);

  if (cellValue.found) {
    return normalizeNumber(cellValue.value);
  }

  if (
    isRecord(rowSource?.allocations)
    && team
  ) {
    return hasOwn(rowSource.allocations, team)
      ? normalizeNumber(rowSource.allocations[team])
      : null;
  }

  if (hasAllocation === true && hasOwn(metricSource, 'allocationPoints')) {
    return normalizeNumber(metricSource.allocationPoints);
  }

  if (
    rowSource === null
    && hasOwn(metricSource, 'allocationPoints')
  ) {
    return normalizeNumber(metricSource.allocationPoints);
  }

  return null;
};

const resolveState = (metricSource, suppliedState, hasValue) => {
  if (!hasValue || metricSource.isAvailable === false) {
    return 'unavailable';
  }

  const state = normalizeText(
    suppliedState
      || metricSource.state
      || metricSource.capacityState,
  ).toLowerCase();

  return Object.prototype.hasOwnProperty.call(
    CAPACITY_STATE_CONFIG,
    state,
  )
    ? state
    : 'unavailable';
};

const resolveColumnTeam = (column) => {
  const id = normalizeText(column?.id);

  if (!id) {
    return '';
  }

  const prefixes = [
    'team:',
    'allocation:',
    'allocations.',
    'allocations:',
  ];
  const prefix = prefixes.find((candidate) => id.startsWith(candidate));

  return prefix ? id.slice(prefix.length).trim() : id;
};

const hasCapacityAnalytics = (metricSource) => (
  isRecord(metricSource)
  && (
    hasOwn(metricSource, 'capacityPoints')
    || hasOwn(metricSource, 'effectiveCapacityPoints')
    || hasOwn(metricSource, 'cumulativeAllocationPoints')
    || hasOwn(metricSource, 'utilizationPercent')
    || hasOwn(metricSource, 'differentialPoints')
    || hasOwn(metricSource, 'capacityState')
  )
);

const StateIcon = ({ state }) => {
  if (state === 'available' || state === 'healthy') {
    return (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.236 4.45-1.95-1.95a.75.75 0 0 0-1.06 1.061l2.57 2.57a.75.75 0 0 0 1.137-.089l3.753-5.16Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (state === 'constrained' || state === 'warning') {
    return (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495a1.75 1.75 0 0 1 3.03 0l6.28 10.85A1.75 1.75 0 0 1 16.28 16H3.72a1.75 1.75 0 0 1-1.515-2.655l6.28-10.85ZM10 6.25a.75.75 0 0 1 .75.75v3.25a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  if (state === 'exceeded' || state === 'critical') {
    return (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.47 7.41a.75.75 0 0 0-1.06 1.06L8.94 10l-1.53 1.53a.75.75 0 1 0 1.06 1.06L10 11.06l1.53 1.53a.75.75 0 1 0 1.06-1.06L11.06 10l1.53-1.53a.75.75 0 0 0-1.06-1.06L10 8.94 8.47 7.41Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-3-8a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 7 10Z"
        clipRule="evenodd"
      />
    </svg>
  );
};

StateIcon.propTypes = {
  state: PropTypes.oneOf(Object.keys(CAPACITY_STATE_CONFIG)).isRequired,
};

const AllocationContent = ({
  formattedValue,
  state,
}) => {
  const stateConfig = CAPACITY_STATE_CONFIG[state];

  return (
    <span
      className={`flex flex-col w-full rounded-md text-center transition-colors ${stateConfig.containerClassName} px-2 py-1 border shadow-sm`}
    >
      <span className="flex items-center justify-center gap-1">
        <span
          className={`shrink-0 ${stateConfig.iconClassName}`}
          aria-hidden="true"
        >
          <StateIcon state={state} />
        </span>
        <span className="text-[12px] font-bold leading-none">
          {formattedValue}
        </span>
        <span className="text-[10px] font-medium leading-none">
          Points
        </span>
      </span>
      <span className="mt-0.5 block text-center text-[9px] font-semibold opacity-90 leading-none">
        {stateConfig.label}
      </span>
    </span>
  );
};

AllocationContent.propTypes = {
  formattedValue: PropTypes.string.isRequired,
  state: PropTypes.oneOf(Object.keys(CAPACITY_STATE_CONFIG)).isRequired,
};

/**
 * Renders one dynamic team allocation with its capacity state and, when
 * analytics are available, an accessible capacity-detail popover.
 *
 * @param {{
 *   value?: number|string|null,
 *   allocationPoints?: number|string|null,
 *   hasAllocation?: boolean,
 *   metric?: object,
 *   detail?: object,
 *   capacityDetail?: object,
 *   capacity?: object,
 *   data?: object,
 *   row?: object,
 *   cell?: object,
 *   column?: object,
 *   getValue?: Function,
 *   workItem?: object,
 *   team?: string,
 *   planningLevel?: string,
 *   feature?: string,
 *   state?: string,
 *   ariaLabel?: string,
 *   unavailableLabel?: string,
 *   popoverEnabled?: boolean,
 *   showPopover?: boolean,
 *   disabled?: boolean,
 *   onOpenChange?: Function,
 *   className?: string,
 *   triggerClassName?: string,
 *   popoverClassName?: string
 * }} props Allocation cell properties.
 * @returns {import('react').ReactNode} Dynamic team allocation cell.
 */
export const AllocationCell = ({
  value = undefined,
  allocationPoints = undefined,
  hasAllocation = undefined,
  metric = null,
  detail = null,
  capacityDetail = null,
  capacity = null,
  data = null,
  row = null,
  cell = null,
  column = null,
  getValue = null,
  workItem = null,
  team = '',
  planningLevel = '',
  feature = '',
  state = '',
  ariaLabel = '',
  unavailableLabel = 'Unavailable',
  popoverEnabled = true,
  showPopover = undefined,
  disabled = false,
  onOpenChange = null,
  className = '',
  triggerClassName = '',
  popoverClassName = '',
}) => {
  const rowSource = resolveRowSource(row, workItem);
  const resolvedTeam = normalizeText(team)
    || normalizeText(metric?.team)
    || resolveColumnTeam(column);
  const metricSource = resolveMetricSource({
    capacity,
    capacityDetail,
    data,
    detail,
    metric,
    rowSource,
    team: resolvedTeam,
  });
  const resolvedPlanningLevel = normalizeText(planningLevel)
    || normalizeText(metricSource.planningLevel)
    || normalizeText(rowSource?.planningLevel);
  const resolvedFeature = normalizeText(feature)
    || normalizeText(rowSource?.feature)
    || normalizeText(metricSource.feature);
  const resolvedValue = resolveAllocationValue({
    allocationPoints,
    cell,
    getValue,
    hasAllocation,
    metricSource,
    rowSource,
    team: resolvedTeam,
    value,
  });
  const formattedValue = formatAllocation(resolvedValue);
  const resolvedState = resolveState(
    metricSource,
    state,
    formattedValue !== null,
  );
  const stateConfig = CAPACITY_STATE_CONFIG[resolvedState];
  const resolvedAriaLabel = normalizeText(ariaLabel) || (
    formattedValue === null
      ? `${resolvedTeam ? `${resolvedTeam}: ` : ''}Allocation unavailable.`
      : `${resolvedTeam ? `${resolvedTeam}: ` : ''}${formattedValue} allocation points, ${stateConfig.label.toLowerCase()}.`
  );
  const canShowPopover = (
    (showPopover ?? popoverEnabled)
    && formattedValue !== null
    && hasCapacityAnalytics(metricSource)
    && Boolean(resolvedTeam)
    && Boolean(resolvedPlanningLevel)
  );

  if (formattedValue === null) {
    return (
      <span
        className={`block min-h-9 w-full ${className}`}
        aria-hidden="true"
      />
    );
  }

  const content = (
    <AllocationContent
      formattedValue={formattedValue}
      state={resolvedState}
    />
  );

  if (canShowPopover) {
    return (
      <CapacityDetailPopover
        detail={{
          ...metricSource,
          allocationPoints: resolvedValue,
          team: resolvedTeam,
          planningLevel: resolvedPlanningLevel,
        }}
        workItem={rowSource}
        feature={resolvedFeature}
        team={resolvedTeam}
        planningLevel={resolvedPlanningLevel}
        state={resolvedState}
        ariaLabel={resolvedAriaLabel}
        unavailableLabel={unavailableLabel}
        disabled={disabled}
        onOpenChange={onOpenChange}
        className={`w-full ${className}`}
        triggerClassName={`w-full rounded-md text-left hover:brightness-95 ${triggerClassName}`}
        popoverClassName={popoverClassName}
        trigger={content}
      />
    );
  }

  return (
    <span
      className={`block w-full rounded-md ${className}`}
      tabIndex={disabled ? undefined : 0}
      aria-label={resolvedAriaLabel}
      aria-disabled={disabled || undefined}
    >
      {content}
    </span>
  );
};

AllocationCell.propTypes = {
  value: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string,
  ]),
  allocationPoints: PropTypes.oneOfType([
    PropTypes.number,
    PropTypes.string,
  ]),
  hasAllocation: PropTypes.bool,
  metric: PropTypes.object,
  detail: PropTypes.object,
  capacityDetail: PropTypes.object,
  capacity: PropTypes.object,
  data: PropTypes.object,
  row: PropTypes.object,
  cell: PropTypes.object,
  column: PropTypes.object,
  getValue: PropTypes.func,
  workItem: PropTypes.object,
  team: PropTypes.string,
  planningLevel: PropTypes.string,
  feature: PropTypes.string,
  state: PropTypes.string,
  ariaLabel: PropTypes.string,
  unavailableLabel: PropTypes.string,
  popoverEnabled: PropTypes.bool,
  showPopover: PropTypes.bool,
  disabled: PropTypes.bool,
  onOpenChange: PropTypes.func,
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
  popoverClassName: PropTypes.string,
};

export default AllocationCell;