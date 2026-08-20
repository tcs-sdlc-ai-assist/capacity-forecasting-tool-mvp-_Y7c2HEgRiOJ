import {
  CAPACITY_STATES,
  DEFAULT_THRESHOLDS,
  THRESHOLD_LIMITS,
} from '../../../constants/domainConstants.js';

export const THRESHOLD_ERROR_CODES = Object.freeze({
  INVALID_THRESHOLDS: 'INVALID_THRESHOLDS',
  INVALID_CONSTRAINED_THRESHOLD: 'INVALID_CONSTRAINED_THRESHOLD',
  INVALID_EXCEEDED_THRESHOLD: 'INVALID_EXCEEDED_THRESHOLD',
  UNORDERED_THRESHOLDS: 'UNORDERED_THRESHOLDS',
});

const createError = (code, message) => ({
  code,
  message,
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const isFiniteNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value)
);

const isThresholdInRange = (value) => (
  isFiniteNumber(value)
  && value >= THRESHOLD_LIMITS.minimum
  && value <= THRESHOLD_LIMITS.maximum
);

const cloneThresholds = (thresholds) => ({
  constrained: thresholds.constrained,
  exceeded: thresholds.exceeded,
});

/**
 * Returns a validation error for threshold settings.
 *
 * @param {*} thresholds Threshold settings to inspect.
 * @returns {{code: string, message: string}|null} Validation error.
 */
export const getThresholdValidationError = (thresholds) => {
  if (!isRecord(thresholds)) {
    return createError(
      THRESHOLD_ERROR_CODES.INVALID_THRESHOLDS,
      'Capacity thresholds must be provided as an object.',
    );
  }

  if (!isThresholdInRange(thresholds.constrained)) {
    return createError(
      THRESHOLD_ERROR_CODES.INVALID_CONSTRAINED_THRESHOLD,
      `The constrained threshold must be between ${THRESHOLD_LIMITS.minimum} and ${THRESHOLD_LIMITS.maximum}.`,
    );
  }

  if (!isThresholdInRange(thresholds.exceeded)) {
    return createError(
      THRESHOLD_ERROR_CODES.INVALID_EXCEEDED_THRESHOLD,
      `The exceeded threshold must be between ${THRESHOLD_LIMITS.minimum} and ${THRESHOLD_LIMITS.maximum}.`,
    );
  }

  if (thresholds.constrained > thresholds.exceeded) {
    return createError(
      THRESHOLD_ERROR_CODES.UNORDERED_THRESHOLDS,
      'The constrained threshold must not exceed the exceeded threshold.',
    );
  }

  return null;
};

/**
 * Determines whether capacity thresholds are finite, bounded, and ordered.
 *
 * @param {*} thresholds Threshold settings to inspect.
 * @returns {boolean} Whether the threshold settings are valid.
 */
export const isValidThresholds = (thresholds) => (
  getThresholdValidationError(thresholds) === null
);

/**
 * Validates capacity thresholds without throwing.
 *
 * @param {*} thresholds Threshold settings to validate.
 * @returns {{
 *   ok: boolean,
 *   data: {constrained: number, exceeded: number}|null,
 *   error: {code: string, message: string}|null
 * }} Threshold validation result.
 */
export const validateThresholds = (thresholds) => {
  const error = getThresholdValidationError(thresholds);

  if (error) {
    return {
      ok: false,
      data: null,
      error,
    };
  }

  return {
    ok: true,
    data: cloneThresholds(thresholds),
    error: null,
  };
};

/**
 * Creates an independent validated threshold object.
 *
 * @param {object} thresholds Threshold settings.
 * @returns {{constrained: number, exceeded: number}} Valid thresholds.
 * @throws {TypeError} When thresholds are invalid or unordered.
 */
export const createUtilizationThresholds = (
  thresholds = DEFAULT_THRESHOLDS,
) => {
  const validation = validateThresholds(thresholds);

  if (!validation.ok) {
    throw new TypeError(validation.error.message);
  }

  return validation.data;
};

/**
 * Determines whether a utilization value can be classified.
 *
 * Null, undefined, non-finite, and negative values are explicitly unavailable.
 *
 * @param {*} utilizationPercent Utilization percentage.
 * @returns {boolean} Whether utilization is available for classification.
 */
export const isUtilizationAvailable = (utilizationPercent) => (
  isFiniteNumber(utilizationPercent) && utilizationPercent >= 0
);

/**
 * Classifies utilization using the configured constrained and exceeded limits.
 *
 * Zero utilization is available, positive utilization below the constrained
 * threshold is healthy, utilization from the constrained threshold through
 * the exceeded threshold is constrained, and utilization above the exceeded
 * threshold is exceeded. Invalid utilization is unavailable.
 *
 * @param {*} utilizationPercent Utilization percentage to classify.
 * @param {object} thresholds Ordered capacity thresholds.
 * @returns {string} A value from CAPACITY_STATES.
 */
export const classifyUtilization = (
  utilizationPercent,
  thresholds = DEFAULT_THRESHOLDS,
) => {
  if (!isUtilizationAvailable(utilizationPercent)) {
    return CAPACITY_STATES.UNAVAILABLE;
  }

  const canonicalThresholds = createUtilizationThresholds(thresholds);

  if (utilizationPercent === 0) {
    return CAPACITY_STATES.AVAILABLE;
  }

  if (utilizationPercent < canonicalThresholds.constrained) {
    return CAPACITY_STATES.HEALTHY;
  }

  if (utilizationPercent <= canonicalThresholds.exceeded) {
    return CAPACITY_STATES.CONSTRAINED;
  }

  return CAPACITY_STATES.EXCEEDED;
};

export const classifyCapacityUtilization = classifyUtilization;
export const classifyUtilizationPercent = classifyUtilization;

export default classifyUtilization;