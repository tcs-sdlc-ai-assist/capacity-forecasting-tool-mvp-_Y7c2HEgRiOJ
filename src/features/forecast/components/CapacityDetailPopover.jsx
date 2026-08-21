import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
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

  return formatted === null ? '' : `${formatted} points`;
};

const formatDifferential = (value) => {
  const formatted = formatNumber(value);

  return formatted === null ? '' : `${formatted} points`;
};

const formatUtilization = (value) => {
  const formatted = formatNumber(value);

  return formatted === null ? '' : `${formatted}%`;
};

const VIEWPORT_PADDING = 8;
const POPOVER_GAP = 8;
const POPOVER_WIDTH = 288;
const FALLBACK_POPOVER_HEIGHT = 260;

const clamp = (value, minimum, maximum) => (
  Math.min(Math.max(value, minimum), maximum)
);

const resolvePopoverPlacement = ({
  height,
  spaceAbove,
  spaceBelow,
}) => {
  if (spaceAbove >= height + POPOVER_GAP) {
    return 'top';
  }

  if (spaceBelow >= height + POPOVER_GAP) {
    return 'bottom';
  }

  return spaceBelow >= spaceAbove ? 'bottom' : 'top';
};

const measurePopoverPosition = (triggerElement, popoverElement) => {
  if (
    typeof window === 'undefined'
    || !triggerElement
  ) {
    return {
      top: VIEWPORT_PADDING,
      left: VIEWPORT_PADDING,
      maxHeight: FALLBACK_POPOVER_HEIGHT,
      placement: 'top',
      arrowLeft: POPOVER_WIDTH / 2,
    };
  }

  const trigger = triggerElement.getBoundingClientRect();
  const measuredHeight = popoverElement?.offsetHeight;
  const measuredWidth = popoverElement?.offsetWidth;
  const height = measuredHeight > 0 ? measuredHeight : FALLBACK_POPOVER_HEIGHT;
  const width = measuredWidth > 0 ? measuredWidth : POPOVER_WIDTH;
  const viewportLeft = VIEWPORT_PADDING;
  const viewportTop = VIEWPORT_PADDING;
  const viewportRight = window.innerWidth - VIEWPORT_PADDING;
  const viewportBottom = window.innerHeight - VIEWPORT_PADDING;
  const maxHeight = Math.max(
    120,
    viewportBottom - viewportTop,
  );
  const boundedHeight = Math.min(height, maxHeight);
  const spaceAbove = trigger.top - viewportTop;
  const spaceBelow = viewportBottom - trigger.bottom;
  const placement = resolvePopoverPlacement({
    height: boundedHeight,
    spaceAbove,
    spaceBelow,
  });
  const preferredTop = placement === 'top'
    ? trigger.top - boundedHeight - POPOVER_GAP
    : trigger.bottom + POPOVER_GAP;
  const top = clamp(
    preferredTop,
    viewportTop,
    Math.max(viewportTop, viewportBottom - boundedHeight),
  );
  const preferredLeft = trigger.left + (trigger.width / 2) - (width / 2);
  const left = clamp(
    preferredLeft,
    viewportLeft,
    Math.max(viewportLeft, viewportRight - width),
  );
  const arrowLeft = clamp(
    trigger.left + (trigger.width / 2) - left,
    16,
    Math.max(16, width - 16),
  );

  return {
    top,
    left,
    maxHeight,
    placement,
    arrowLeft,
  };
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
  const popoverRef = useRef(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [position, setPosition] = useState({
    top: VIEWPORT_PADDING,
    left: VIEWPORT_PADDING,
    maxHeight: FALLBACK_POPOVER_HEIGHT,
    placement: 'top',
    arrowLeft: POPOVER_WIDTH / 2,
  });
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

  const updatePosition = useCallback(() => {
    setPosition(measurePopoverPosition(
      triggerRef.current,
      popoverRef.current,
    ));
  }, []);

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

  useLayoutEffect(() => {
    if (!resolvedOpen || typeof window === 'undefined') {
      return undefined;
    }

    updatePosition();
    const frameId = window.requestAnimationFrame(updatePosition);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [resolvedOpen, updatePosition, resolvedFeature, unavailable]);

  useEffect(() => {
    if (!resolvedOpen || typeof window === 'undefined') {
      return undefined;
    }

    const handleReposition = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [resolvedOpen, updatePosition]);

  const handleMouseEnter = () => {
    updateOpen(true);
  };

  const handleMouseLeave = (event) => {
    if (popoverRef.current?.contains(event.relatedTarget)) {
      return;
    }

    if (
      typeof document !== 'undefined'
      && triggerRef.current?.contains(document.activeElement)
    ) {
      return;
    }

    updateOpen(false);
  };

  const handlePopoverMouseLeave = (event) => {
    if (triggerRef.current?.contains(event.relatedTarget)) {
      return;
    }

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
    if (
      event.currentTarget.contains(event.relatedTarget)
      || popoverRef.current?.contains(event.relatedTarget)
    ) {
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

  const popoverContent = resolvedOpen ? (
    <span
      ref={popoverRef}
      id={popoverId}
      role="tooltip"
      className={`fixed z-[80] block w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-neutral-200 bg-neutral-0 p-4 text-left text-neutral-900 shadow-lg ${popoverClassName}`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handlePopoverMouseLeave}
    >
      <span
        className={`absolute h-3 w-3 -translate-x-1/2 rotate-45 border-neutral-200 bg-neutral-0 ${
          position.placement === 'bottom'
            ? '-top-1.5 border-l border-t'
            : '-bottom-1.5 border-b border-r'
        }`}
        style={{ left: `${position.arrowLeft}px` }}
        aria-hidden="true"
      />

      <span className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3">
        <span className="text-sm font-semibold text-neutral-600">
          Feature
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-5 text-neutral-900">
            {resolvedFeature}
          </span>
          {(resolvedTeam || resolvedPlanningLevel) ? (
            <span className="mt-1 block text-xs text-neutral-600">
              {[resolvedTeam, resolvedPlanningLevel]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
        </span>
      </span>

      <span className="mt-4 block border-t border-neutral-200 pt-3">
        <span className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
          <span className="text-neutral-600">Item Allocation</span>
          <span className="text-right font-semibold text-neutral-900">
            {formatPoints(source.allocationPoints)}
          </span>
          
          <span className="text-neutral-600">Capacity Running Total</span>
          <span className="text-right font-semibold text-neutral-900">
            {formatPoints(resolvedRunningTotal)}
          </span>

          <span className="text-neutral-600">Team Capacity</span>
          <span className="text-right font-semibold text-neutral-900">
            {unavailable ? '' : formatPoints(resolvedTeamCapacity)}
          </span>

          <span className="text-neutral-600">Differential</span>
          <span className="text-right font-semibold text-neutral-900">
            {unavailable ? '' : formatDifferential(resolvedDifferential)}
          </span>

          <span className="text-neutral-600">Utilization</span>
          <span className="text-right font-semibold text-neutral-900">
            {unavailable ? '' : formatUtilization(resolvedUtilization)}
          </span>

          <span className="self-center text-neutral-600">State</span>
          <span className="text-right">
            {unavailable ? null : (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${stateConfig.className}`}
              >
                {stateConfig.label}
              </span>
            )}
          </span>
        </span>
      </span>
    </span>
  ) : null;

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

      {typeof document === 'undefined' || !popoverContent
        ? null
        : createPortal(popoverContent, document.body)}
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