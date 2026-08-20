import {
  useId,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import {
  createCapacityAriaLabel,
} from '../utils/accessibility.js';

const CAPACITY_STATE_CONFIG = Object.freeze({
  available: Object.freeze({
    label: 'Available',
    className: 'bg-green-100 text-green-800',
  }),
  healthy: Object.freeze({
    label: 'Healthy',
    className: 'bg-green-100 text-green-800',
  }),
  constrained: Object.freeze({
    label: 'Constrained',
    className: 'bg-amber-100 text-amber-800',
  }),
  warning: Object.freeze({
    label: 'Constrained',
    className: 'bg-amber-100 text-amber-800',
  }),
  exceeded: Object.freeze({
    label: 'Exceeded',
    className: 'bg-red-100 text-red-800',
  }),
  critical: Object.freeze({
    label: 'Exceeded',
    className: 'bg-red-100 text-red-800',
  }),
  unavailable: Object.freeze({
    label: 'Unavailable',
    className: 'bg-neutral-200 text-neutral-700',
  }),
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const isFiniteNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value)
);

const normalizeText = (value) => (
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
);

const readFiniteNumber = (...values) => {
  const value = values.find(isFiniteNumber);

  return value ?? null;
};

const formatNumber = (value) => {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const rounded = Math.round(value * 10) / 10;

  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
};

const formatPoints = (value) => {
  const formatted = formatNumber(value);

  return formatted === null ? 'Unavailable' : `${formatted} points`;
};

const formatDifferential = (value) => {
  const formatted = formatNumber(value);

  if (formatted === null) {
    return 'Unavailable';
  }

  if (value > 0) {
    return `+${formatted} points`;
  }

  return `${formatted} points`;
};

const formatUtilization = (value) => {
  const formatted = formatNumber(value);

  return formatted === null ? 'Unavailable' : `${formatted}%`;
};

const resolveDetailSource = ({
  capacity,
  capacityDetail,
  data,
  detail,
  metric,
}) => {
  const source = detail
    ?? capacityDetail
    ?? metric
    ?? capacity
    ?? data;

  return isRecord(source) ? source : {};
};

const resolveFeature = (source, suppliedFeature, workItem) => {
  const candidates = [
    suppliedFeature,
    workItem?.feature,
    source.feature,
    source.workItem?.feature,
    source.row?.feature,
    source.rows?.[0]?.feature,
    source.workItems?.[0]?.feature,
  ];

  return candidates
    .map(normalizeText)
    .find(Boolean) ?? 'Not specified';
};

const resolveState = (source, suppliedState, unavailable) => {
  if (unavailable) {
    return 'unavailable';
  }

  const state = normalizeText(
    suppliedState
      ?? source.state
      ?? source.capacityState,
  ).toLowerCase();

  return Object.prototype.hasOwnProperty.call(
    CAPACITY_STATE_CONFIG,
    state,
  )
    ? state
    : 'available';
};

const detailPropType = PropTypes.shape({
  feature: PropTypes.string,
  team: PropTypes.string,
  planningLevel: PropTypes.string,
  allocationPoints: PropTypes.number,
  allocatedPoints: PropTypes.number,
  cumulativeAllocationPoints: PropTypes.number,
  capacityPoints: PropTypes.number,
  effectiveCapacityPoints: PropTypes.number,
  differentialPoints: PropTypes.number,
  variancePoints: PropTypes.number,
  utilizationPercent: PropTypes.number,
  utilization: PropTypes.number,
  state: PropTypes.string,
  capacityState: PropTypes.string,
  isAvailable: PropTypes.bool,
  workItem: PropTypes.object,
  row: PropTypes.object,
  rows: PropTypes.arrayOf(PropTypes.object),
  workItems: PropTypes.arrayOf(PropTypes.object),
});

/**
 * Presents capacity details in a pointer- and focus-accessible surface.
 *
 * @param {{
 *   children?: import('react').ReactNode,
 *   trigger?: import('react').ReactNode,
 *   detail?: object,
 *   capacityDetail?: object,
 *   metric?: object,
 *   capacity?: object,
 *   data?: object,
 *   workItem?: object,
 *   feature?: string,
 *   team?: string,
 *   planningLevel?: string,
 *   runningTotal?: number,
 *   cumulativeAllocationPoints?: number,
 *   teamCapacity?: number,
 *   capacityPoints?: number,
 *   differential?: number,
 *   differentialPoints?: number,
 *   utilization?: number,
 *   utilizationPercent?: number,
 *   state?: string,
 *   isAvailable?: boolean,
 *   title?: string,
 *   ariaLabel?: string,
 *   unavailableLabel?: string,
 *   disabled?: boolean,
 *   isOpen?: boolean,
 *   open?: boolean,
 *   defaultOpen?: boolean,
 *   onOpenChange?: Function,
 *   onOpen?: Function,
 *   onClose?: Function,
 *   className?: string,
 *   triggerClassName?: string,
 *   popoverClassName?: string
 * }} props Capacity detail properties.
 * @returns {import('react').ReactNode} Capacity detail popover.
 */
export const CapacityDetailPopover = ({
  children = null,
  trigger = null,
  detail = null,
  capacityDetail = null,
  metric = null,
  capacity = null,
  data = null,
  workItem = null,
  feature = '',
  team = '',
  planningLevel = '',
  runningTotal = undefined,
  cumulativeAllocationPoints = undefined,
  teamCapacity = undefined,
  capacityPoints = undefined,
  differential = undefined,
  differentialPoints = undefined,
  utilization = undefined,
  utilizationPercent = undefined,
  state = '',
  isAvailable = undefined,
  title = 'Capacity details',
  ariaLabel = '',
  unavailableLabel = 'Unavailable',
  disabled = false,
  isOpen = undefined,
  open = undefined,
  defaultOpen = false,
  onOpenChange = null,
  onOpen = null,
  onClose = null,
  className = '',
  triggerClassName = '',
  popoverClassName = '',
}) => {
  const generatedId = useId();
  const popoverId = `capacity-detail-${generatedId.replace(/:/g, '')}`;
  const triggerRef = useRef(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlledOpen = isOpen ?? open;
  const resolvedOpen = controlledOpen ?? internalOpen;
  const source = resolveDetailSource({
    capacity,
    capacityDetail,
    data,
    detail,
    metric,
  });
  const resolvedFeature = resolveFeature(source, feature, workItem);
  const resolvedTeam = normalizeText(team || source.team)
    || 'Team';
  const resolvedPlanningLevel = normalizeText(
    planningLevel || source.planningLevel,
  );
  const resolvedRunningTotal = readFiniteNumber(
    runningTotal,
    cumulativeAllocationPoints,
    source.cumulativeAllocationPoints,
    source.allocatedPoints,
    source.allocationPoints,
  );
  const resolvedTeamCapacity = readFiniteNumber(
    teamCapacity,
    capacityPoints,
    source.effectiveCapacityPoints,
    source.capacityPoints,
  );
  const resolvedDifferential = readFiniteNumber(
    differential,
    differentialPoints,
    source.differentialPoints,
    source.variancePoints,
  ) ?? (
    resolvedTeamCapacity !== null && resolvedRunningTotal !== null
      ? resolvedTeamCapacity - resolvedRunningTotal
      : null
  );
  const resolvedUtilization = readFiniteNumber(
    utilization,
    utilizationPercent,
    source.utilizationPercent,
    source.utilization,
  ) ?? (
    resolvedTeamCapacity !== null
    && resolvedTeamCapacity > 0
    && resolvedRunningTotal !== null
      ? (resolvedRunningTotal / resolvedTeamCapacity) * 100
      : null
  );
  const explicitlyUnavailable = (
    isAvailable === false
    || source.isAvailable === false
    || normalizeText(state || source.state || source.capacityState)
      .toLowerCase() === 'unavailable'
  );
  const unavailable = (
    explicitlyUnavailable
    || resolvedTeamCapacity === null
    || resolvedTeamCapacity <= 0
  );
  const resolvedState = resolveState(
    source,
    state,
    unavailable,
  );
  const stateConfig = CAPACITY_STATE_CONFIG[resolvedState];
  const triggerContent = trigger ?? children ?? (
    unavailable
      ? unavailableLabel
      : `${formatNumber(resolvedRunningTotal) ?? 'View'} pts`
  );
  const generatedAriaLabel = createCapacityAriaLabel({
    ...source,
    team: resolvedTeam,
    planningLevel: resolvedPlanningLevel,
    allocatedPoints: resolvedRunningTotal,
    capacityPoints: resolvedTeamCapacity,
    utilizationPercent: resolvedUtilization,
    state: resolvedState,
  });
  const resolvedAriaLabel = ariaLabel.trim()
    || `View capacity details for ${resolvedFeature}. ${generatedAriaLabel}`;

  const updateOpen = (nextOpen) => {
    if (disabled || nextOpen === resolvedOpen) {
      return;
    }

    if (controlledOpen === undefined) {
      setInternalOpen(nextOpen);
    }

    try {
      onOpenChange?.(nextOpen);
    } catch {
      // Consumer callback failures must not interrupt popover interaction.
    }

    try {
      if (nextOpen) {
        onOpen?.();
      } else {
        onClose?.();
      }
    } catch {
      // Consumer callback failures must not interrupt popover interaction.
    }
  };

  const handleMouseEnter = () => {
    updateOpen(true);
  };

  const handleMouseLeave = () => {
    if (
      typeof document !== 'undefined'
      && triggerRef.current?.contains(document.activeElement)
    ) {
      return;
    }

    updateOpen(false);
  };

  const handleFocus = () => {
    updateOpen(true);
  };

  const handleBlur = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    updateOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'Escape' || !resolvedOpen) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateOpen(false);
  };

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`inline-flex min-h-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${triggerClassName}`}
        disabled={disabled}
        aria-label={resolvedAriaLabel}
        aria-describedby={resolvedOpen ? popoverId : undefined}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      >
        {triggerContent}
      </button>

      {resolvedOpen ? (
        <span
          id={popoverId}
          role="tooltip"
          className={`absolute bottom-full left-1/2 z-40 mb-2 block w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-neutral-200 bg-neutral-0 p-4 text-left text-neutral-900 shadow-lg ${popoverClassName}`}
        >
          <span
            className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-neutral-200 bg-neutral-0"
            aria-hidden="true"
          />

          <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {title}
          </span>

          <span className="mt-1 block text-sm font-semibold leading-5 text-neutral-900">
            {resolvedFeature}
          </span>

          {(resolvedTeam || resolvedPlanningLevel) ? (
            <span className="mt-1 block text-xs text-neutral-600">
              {[resolvedTeam, resolvedPlanningLevel]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}

          <span className="mt-4 block border-t border-neutral-200 pt-3">
            <span className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
              <span className="text-neutral-600">Feature</span>
              <span className="max-w-40 text-right font-medium text-neutral-900">
                {resolvedFeature}
              </span>

              <span className="text-neutral-600">Running total</span>
              <span className="text-right font-semibold text-neutral-900">
                {formatPoints(resolvedRunningTotal)}
              </span>

              <span className="text-neutral-600">Team capacity</span>
              <span className="text-right font-semibold text-neutral-900">
                {unavailable
                  ? unavailableLabel
                  : formatPoints(resolvedTeamCapacity)}
              </span>

              <span className="text-neutral-600">Differential</span>
              <span className="text-right font-semibold text-neutral-900">
                {unavailable
                  ? unavailableLabel
                  : formatDifferential(resolvedDifferential)}
              </span>

              <span className="text-neutral-600">Utilization</span>
              <span className="text-right font-semibold text-neutral-900">
                {unavailable
                  ? unavailableLabel
                  : formatUtilization(resolvedUtilization)}
              </span>

              <span className="self-center text-neutral-600">State</span>
              <span className="text-right">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stateConfig.className}`}
                >
                  {unavailable
                    ? unavailableLabel
                    : stateConfig.label}
                </span>
              </span>
            </span>
          </span>
        </span>
      ) : null}
    </span>
  );
};

CapacityDetailPopover.propTypes = {
  children: PropTypes.node,
  trigger: PropTypes.node,
  detail: detailPropType,
  capacityDetail: detailPropType,
  metric: detailPropType,
  capacity: detailPropType,
  data: detailPropType,
  workItem: PropTypes.shape({
    feature: PropTypes.string,
  }),
  feature: PropTypes.string,
  team: PropTypes.string,
  planningLevel: PropTypes.string,
  runningTotal: PropTypes.number,
  cumulativeAllocationPoints: PropTypes.number,
  teamCapacity: PropTypes.number,
  capacityPoints: PropTypes.number,
  differential: PropTypes.number,
  differentialPoints: PropTypes.number,
  utilization: PropTypes.number,
  utilizationPercent: PropTypes.number,
  state: PropTypes.string,
  isAvailable: PropTypes.bool,
  title: PropTypes.string,
  ariaLabel: PropTypes.string,
  unavailableLabel: PropTypes.string,
  disabled: PropTypes.bool,
  isOpen: PropTypes.bool,
  open: PropTypes.bool,
  defaultOpen: PropTypes.bool,
  onOpenChange: PropTypes.func,
  onOpen: PropTypes.func,
  onClose: PropTypes.func,
  className: PropTypes.string,
  triggerClassName: PropTypes.string,
  popoverClassName: PropTypes.string,
};

export default CapacityDetailPopover;