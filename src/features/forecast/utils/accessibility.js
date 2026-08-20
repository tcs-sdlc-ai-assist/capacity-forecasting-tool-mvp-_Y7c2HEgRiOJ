const DEFAULT_DOM_ID_PREFIX = 'cft';
const ACTIVATION_KEYS = Object.freeze([
  'Enter',
  ' ',
  'Spacebar',
]);

const CAPACITY_STATE_LABELS = Object.freeze({
  available: 'available',
  healthy: 'healthy',
  constrained: 'constrained',
  warning: 'constrained',
  exceeded: 'exceeded',
  critical: 'exceeded',
  unavailable: 'unavailable',
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const normalizeText = (value) => {
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'boolean'
  ) {
    return '';
  }

  const source = String(value);
  const unicodeNormalized = typeof source.normalize === 'function'
    ? source.normalize('NFKD')
    : source;

  return unicodeNormalized
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeIdPart = (value) => (
  normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
);

const flattenIdParts = (values) => (
  values.flatMap((value) => (
    Array.isArray(value) ? flattenIdParts(value) : [value]
  ))
);

const normalizeFiniteNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : null
);

const formatNumber = (value) => {
  const normalized = normalizeFiniteNumber(value);

  if (normalized === null) {
    return null;
  }

  const rounded = Math.round(normalized * 10) / 10;

  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
};

const formatPercent = (value) => {
  const formatted = formatNumber(value);

  return formatted === null ? null : `${formatted}%`;
};

const resolveCapacityStateLabel = (state) => {
  const normalized = normalizeText(state).toLowerCase();

  return CAPACITY_STATE_LABELS[normalized] ?? normalized;
};

const resolveCapacityLabelInput = (input) => (
  isRecord(input) ? input : {}
);

const resolveAllocationPoints = (input) => (
  normalizeFiniteNumber(
    input.allocatedPoints
      ?? input.allocationPoints
      ?? input.demandPoints,
  )
);

const resolveCapacityPoints = (input) => (
  normalizeFiniteNumber(
    input.effectiveCapacityPoints
      ?? input.capacityPoints
      ?? input.capacity,
  )
);

const resolveUtilization = (
  input,
  allocatedPoints,
  capacityPoints,
) => {
  const suppliedUtilization = normalizeFiniteNumber(
    input.utilizationPercent ?? input.utilization,
  );

  if (suppliedUtilization !== null && suppliedUtilization >= 0) {
    return suppliedUtilization;
  }

  if (
    allocatedPoints !== null
    && capacityPoints !== null
    && capacityPoints > 0
  ) {
    return (allocatedPoints / capacityPoints) * 100;
  }

  return null;
};

const resolveCapacityContext = (input) => {
  const team = normalizeText(input.team ?? input.teamName);
  const planningLevel = normalizeText(
    input.planningLevel ?? input.period,
  );

  if (team && planningLevel) {
    return `${team}, ${planningLevel}`;
  }

  return team || planningLevel || 'Capacity';
};

const canFocus = (target) => (
  target !== null
  && typeof target === 'object'
  && typeof target.focus === 'function'
  && target.isConnected !== false
);

/**
 * Creates a deterministic, CSS-safe DOM identifier from primitive values.
 *
 * @param {...*} parts Values that uniquely identify the related element.
 * @returns {string} Deterministic DOM identifier.
 */
export const createDomId = (...parts) => {
  const normalizedParts = flattenIdParts(parts)
    .map(normalizeIdPart)
    .filter(Boolean);
  const id = normalizedParts.join('-') || DEFAULT_DOM_ID_PREFIX;

  return /^[a-z]/.test(id)
    ? id
    : `${DEFAULT_DOM_ID_PREFIX}-${id}`;
};

export const createDeterministicDomId = createDomId;
export const createAccessibleId = createDomId;

/**
 * Creates a concise label describing allocation and capacity for assistive
 * technology.
 *
 * @param {object} input Capacity metric fields.
 * @returns {string} Screen-reader-friendly capacity label.
 */
export const createCapacityAriaLabel = (input = {}) => {
  const source = resolveCapacityLabelInput(input);
  const context = resolveCapacityContext(source);
  const allocatedPoints = resolveAllocationPoints(source);
  const capacityPoints = resolveCapacityPoints(source);
  const utilization = resolveUtilization(
    source,
    allocatedPoints,
    capacityPoints,
  );
  const state = resolveCapacityStateLabel(
    source.state ?? source.capacityState,
  );
  const details = [];

  if (allocatedPoints !== null && capacityPoints !== null) {
    details.push(
      `${formatNumber(allocatedPoints)} of ${formatNumber(capacityPoints)} points allocated`,
    );
  } else if (allocatedPoints !== null) {
    details.push(`${formatNumber(allocatedPoints)} points allocated`);
  } else if (capacityPoints !== null) {
    details.push(`${formatNumber(capacityPoints)} capacity points`);
  }

  const utilizationLabel = formatPercent(utilization);

  if (utilizationLabel) {
    details.push(`${utilizationLabel} utilized`);
  }

  if (state) {
    details.push(state);
  }

  if (details.length === 0) {
    details.push('capacity unavailable');
  }

  return `${context}: ${details.join(', ')}.`;
};

export const formatCapacityAriaLabel = createCapacityAriaLabel;
export const createCapacityScreenReaderLabel = createCapacityAriaLabel;
export const getCapacityAriaLabel = createCapacityAriaLabel;

/**
 * Determines whether a keyboard event represents standard control activation.
 *
 * @param {object} event Keyboard event-like value.
 * @returns {boolean} Whether Enter or Space was pressed.
 */
export const isActivationKey = (event) => (
  event !== null
  && typeof event === 'object'
  && ACTIVATION_KEYS.includes(event.key)
);

/**
 * Activates a custom interactive control from Enter or Space.
 *
 * @param {object} event Keyboard event-like value.
 * @param {Function} onActivate Activation callback.
 * @param {{disabled?: boolean, preventDefault?: boolean}} options Options.
 * @returns {boolean} Whether the event was handled.
 */
export const handleKeyboardActivation = (
  event,
  onActivate,
  options = {},
) => {
  if (
    options?.disabled === true
    || typeof onActivate !== 'function'
    || !isActivationKey(event)
    || event.defaultPrevented === true
  ) {
    return false;
  }

  if (
    options?.preventDefault !== false
    && typeof event.preventDefault === 'function'
  ) {
    event.preventDefault();
  }

  onActivate(event);
  return true;
};

/**
 * Creates a reusable keydown handler for a custom interactive control.
 *
 * @param {Function} onActivate Activation callback.
 * @param {{disabled?: boolean, preventDefault?: boolean}} options Options.
 * @returns {Function} Keyboard event handler.
 */
export const createKeyboardActivationHandler = (
  onActivate,
  options = {},
) => (
  (event) => handleKeyboardActivation(event, onActivate, options)
);

export const activateOnKeyboard = handleKeyboardActivation;
export const onKeyboardActivate = handleKeyboardActivation;

/**
 * Captures the currently focused element for later restoration.
 *
 * @returns {object|null} Currently focused element, when available.
 */
export const captureFocusedElement = () => {
  if (typeof document === 'undefined') {
    return null;
  }

  const activeElement = document.activeElement;

  return activeElement && activeElement !== document.body
    ? activeElement
    : null;
};

export const captureFocus = captureFocusedElement;

/**
 * Restores focus to a previously captured element.
 *
 * @param {object|null} target Element to focus.
 * @param {{preventScroll?: boolean}} options Focus options.
 * @returns {boolean} Whether focus was requested successfully.
 */
export const restoreFocus = (target, options = {}) => {
  if (!canFocus(target)) {
    return false;
  }

  try {
    target.focus({
      preventScroll: options?.preventScroll !== false,
    });
    return true;
  } catch {
    try {
      target.focus();
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Captures a focus target and returns an idempotent restoration callback.
 *
 * @param {object|null} target Focus target, or the active element by default.
 * @param {{preventScroll?: boolean}} options Focus options.
 * @returns {Function} Focus restoration callback.
 */
export const createFocusRestorer = (
  target = captureFocusedElement(),
  options = {},
) => {
  let restored = false;

  return () => {
    if (restored) {
      return false;
    }

    const succeeded = restoreFocus(target, options);

    if (succeeded) {
      restored = true;
    }

    return succeeded;
  };
};

export const createFocusRestorationHelper = createFocusRestorer;

export default Object.freeze({
  createDomId,
  createDeterministicDomId,
  createCapacityAriaLabel,
  isActivationKey,
  handleKeyboardActivation,
  createKeyboardActivationHandler,
  captureFocusedElement,
  restoreFocus,
  createFocusRestorer,
});