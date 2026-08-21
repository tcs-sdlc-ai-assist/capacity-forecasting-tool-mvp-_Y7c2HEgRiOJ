import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import ConfirmDialog from '../../../components/dialogs/ConfirmDialog.jsx';
import {
  DEFAULT_THRESHOLDS,
  THRESHOLD_LIMITS,
} from '../../../constants/domainConstants.js';
import {
  validateThresholds,
} from '../utils/thresholds.js';
import {
  useForecastViewStore,
} from '../store/forecastViewStore.js';

const createActionError = (error, fallbackMessage) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'THRESHOLD_SETTINGS_UPDATE_FAILED',
  message: typeof error?.message === 'string'
    ? error.message
    : fallbackMessage,
});

const normalizeThresholdValue = (value) => {
  if (
    typeof value === 'number'
    && Number.isFinite(value)
  ) {
    return String(value);
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

const resolveThresholds = (
  thresholds,
  constrainedThreshold,
  exceededThreshold,
  storeThresholds,
) => ({
  constrained: thresholds?.constrained
    ?? constrainedThreshold
    ?? storeThresholds.constrained,
  exceeded: thresholds?.exceeded
    ?? exceededThreshold
    ?? storeThresholds.exceeded,
});

const validateDraft = (constrainedValue, exceededValue) => {
  if (!constrainedValue) {
    return {
      field: 'constrained',
      error: {
        code: 'INVALID_CONSTRAINED_THRESHOLD',
        message: 'Enter the utilization percentage where warning begins.',
      },
    };
  }

  if (!exceededValue) {
    return {
      field: 'exceeded',
      error: {
        code: 'INVALID_EXCEEDED_THRESHOLD',
        message: 'Enter the utilization percentage where over capacity begins.',
      },
    };
  }

  const candidate = {
    constrained: Number(constrainedValue),
    exceeded: Number(exceededValue),
  };
  const validation = validateThresholds(candidate);

  if (!validation.ok) {
    const field = validation.error?.code
      === 'INVALID_EXCEEDED_THRESHOLD'
      ? 'exceeded'
      : validation.error?.code === 'UNORDERED_THRESHOLDS'
        ? 'exceeded'
        : 'constrained';

    return {
      field,
      error: validation.error,
    };
  }

  return {
    field: null,
    error: null,
    data: validation.data,
  };
};

/**
 * Configures utilization boundaries used to classify forecast capacity.
 *
 * @param {{
 *   isOpen?: boolean,
 *   open?: boolean,
 *   thresholds?: {constrained: number, exceeded: number},
 *   constrainedThreshold?: number,
 *   exceededThreshold?: number,
 *   onSave?: Function,
 *   onThresholdsChange?: Function,
 *   onChange?: Function,
 *   onClose?: Function,
 *   onCancel?: Function,
 *   title?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   disabled?: boolean,
 *   className?: string
 * }} props Threshold settings properties.
 * @returns {import('react').ReactNode} Threshold settings dialog.
 */
export const ThresholdSettingsDialog = ({
  isOpen = undefined,
  open = undefined,
  thresholds = null,
  constrainedThreshold = undefined,
  exceededThreshold = undefined,
  onSave = null,
  onThresholdsChange = null,
  onChange = null,
  onClose = null,
  onCancel = null,
  title = 'Capacity thresholds',
  confirmLabel = 'Save thresholds',
  cancelLabel = 'Cancel',
  disabled = false,
  className = '',
}) => {
  const generatedId = useId();
  const inputPrefix = `threshold-settings-${generatedId.replace(/:/g, '')}`;
  const constrainedInputRef = useRef(null);
  const storeThresholds = useForecastViewStore(
    (state) => state.thresholds,
  );
  const storeDialogOpen = useForecastViewStore(
    (state) => state.isThresholdDialogOpen,
  );
  const setStoreThresholds = useForecastViewStore(
    (state) => state.setThresholds,
  );
  const closeStoreDialog = useForecastViewStore(
    (state) => state.closeThresholdDialog,
  );
  const resolvedOpen = isOpen ?? open ?? storeDialogOpen;
  const resolvedThresholds = resolveThresholds(
    thresholds,
    constrainedThreshold,
    exceededThreshold,
    storeThresholds,
  );
  const [constrainedValue, setConstrainedValue] = useState(
    normalizeThresholdValue(resolvedThresholds.constrained),
  );
  const [exceededValue, setExceededValue] = useState(
    normalizeThresholdValue(resolvedThresholds.exceeded),
  );
  const [fieldError, setFieldError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!resolvedOpen) {
      return;
    }

    setConstrainedValue(
      normalizeThresholdValue(resolvedThresholds.constrained),
    );
    setExceededValue(
      normalizeThresholdValue(resolvedThresholds.exceeded),
    );
    setFieldError(null);
    setActionError(null);
  }, [
    resolvedOpen,
    resolvedThresholds.constrained,
    resolvedThresholds.exceeded,
  ]);

  const requestClose = () => {
    if (isSaving) {
      return;
    }

    setFieldError(null);
    setActionError(null);

    const callback = onCancel ?? onClose;

    if (typeof callback === 'function') {
      callback();
    } else {
      closeStoreDialog();
    }
  };

  const handleReset = () => {
    if (disabled || isSaving) {
      return;
    }

    setConstrainedValue(String(DEFAULT_THRESHOLDS.constrained));
    setExceededValue(String(DEFAULT_THRESHOLDS.exceeded));
    setFieldError(null);
    setActionError(null);
    constrainedInputRef.current?.focus();
  };

  const handleConfirm = async () => {
    if (disabled || isSaving) {
      return;
    }

    const validation = validateDraft(
      constrainedValue,
      exceededValue,
    );

    if (!validation.data) {
      setFieldError({
        field: validation.field,
        ...validation.error,
      });
      setActionError(null);

      if (validation.field === 'constrained') {
        constrainedInputRef.current?.focus();
      } else {
        document.getElementById(`${inputPrefix}-exceeded`)?.focus();
      }

      return;
    }

    setIsSaving(true);
    setFieldError(null);
    setActionError(null);

    try {
      const callback = onSave
        ?? onThresholdsChange
        ?? onChange
        ?? setStoreThresholds;
      const result = await callback(validation.data);

      if (result?.ok === false) {
        setActionError(createActionError(
          result.error,
          'Capacity thresholds could not be saved.',
        ));
        return;
      }

      if (result?.error) {
        setActionError(createActionError(
          result.error,
          'Capacity thresholds are active for this session but could not be saved in browser storage.',
        ));
        return;
      }

      if (typeof onClose === 'function') {
        onClose(validation.data);
      } else {
        closeStoreDialog();
      }
    } catch (error) {
      setActionError(createActionError(
        error,
        'Capacity thresholds could not be saved.',
      ));
    } finally {
      setIsSaving(false);
    }
  };

  const constrainedError = fieldError?.field === 'constrained'
    ? fieldError.message
    : '';
  const exceededError = fieldError?.field === 'exceeded'
    ? fieldError.message
    : '';
  const constrainedErrorId = `${inputPrefix}-constrained-error`;
  const exceededErrorId = `${inputPrefix}-exceeded-error`;
  const constrainedHelpId = `${inputPrefix}-constrained-help`;
  const exceededHelpId = `${inputPrefix}-exceeded-help`;
  const warningRangeStart = Number(constrainedValue);
  const warningRangeEnd = Number(exceededValue);
  const hasValidPreview = (
    Number.isFinite(warningRangeStart)
    && Number.isFinite(warningRangeEnd)
    && warningRangeStart >= THRESHOLD_LIMITS.minimum
    && warningRangeEnd <= THRESHOLD_LIMITS.maximum
    && warningRangeStart <= warningRangeEnd
  );

  return (
    <ConfirmDialog
      isOpen={resolvedOpen}
      title={title}
      description="Set the utilization boundaries used to identify healthy, warning, and over-capacity forecasts."
      confirmLabel={isSaving ? 'Saving thresholds…' : confirmLabel}
      cancelLabel={cancelLabel}
      onCancel={requestClose}
      onConfirm={handleConfirm}
      isLoading={isSaving}
      disabled={disabled}
      closeOnBackdropClick={!isSaving}
      closeOnEscape={!isSaving}
      initialFocusRef={constrainedInputRef}
      className={`!max-w-2xl ${className}`}
    >
      <div className="space-y-6">
        <fieldset
          className="grid gap-6 sm:grid-cols-2"
          disabled={disabled || isSaving}
        >
          <legend className="sr-only">
            Utilization threshold boundaries
          </legend>

          <div>
            <label
              htmlFor={`${inputPrefix}-constrained`}
              className="block text-sm font-semibold text-neutral-800"
            >
              Warning starts at
            </label>
            <div className="relative mt-1.5">
              <input
                ref={constrainedInputRef}
                id={`${inputPrefix}-constrained`}
                name="constrainedThreshold"
                type="number"
                min={THRESHOLD_LIMITS.minimum}
                max={THRESHOLD_LIMITS.maximum}
                step="0.1"
                inputMode="decimal"
                className={`min-h-10 w-full rounded-md border bg-neutral-0 px-3 py-2 pr-10 text-sm text-neutral-900 shadow-xs disabled:cursor-not-allowed disabled:bg-neutral-100 ${
                  constrainedError
                    ? 'border-red-400'
                    : 'border-neutral-300 hover:border-neutral-400'
                }`}
                value={constrainedValue}
                aria-describedby={[
                  constrainedHelpId,
                  constrainedError ? constrainedErrorId : '',
                ].filter(Boolean).join(' ')}
                aria-invalid={constrainedError ? 'true' : undefined}
                onChange={(event) => {
                  setConstrainedValue(event.target.value);
                  setFieldError(null);
                  setActionError(null);
                }}
              />
              <span
                className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-neutral-500"
                aria-hidden="true"
              >
                %
              </span>
            </div>
            <p
              id={constrainedHelpId}
              className="mt-1.5 text-xs leading-5 text-neutral-600"
            >
              Utilization below this value is healthy. The default is
              {' '}{DEFAULT_THRESHOLDS.constrained}%.
            </p>
            {constrainedError ? (
              <p
                id={constrainedErrorId}
                className="mt-1.5 text-sm font-medium text-red-700"
                role="alert"
              >
                {constrainedError}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor={`${inputPrefix}-exceeded`}
              className="block text-sm font-semibold text-neutral-800"
            >
              Over capacity starts above
            </label>
            <div className="relative mt-1.5">
              <input
                id={`${inputPrefix}-exceeded`}
                name="exceededThreshold"
                type="number"
                min={THRESHOLD_LIMITS.minimum}
                max={THRESHOLD_LIMITS.maximum}
                step="0.1"
                inputMode="decimal"
                className={`min-h-10 w-full rounded-md border bg-neutral-0 px-3 py-2 pr-10 text-sm text-neutral-900 shadow-xs disabled:cursor-not-allowed disabled:bg-neutral-100 ${
                  exceededError
                    ? 'border-red-400'
                    : 'border-neutral-300 hover:border-neutral-400'
                }`}
                value={exceededValue}
                aria-describedby={[
                  exceededHelpId,
                  exceededError ? exceededErrorId : '',
                ].filter(Boolean).join(' ')}
                aria-invalid={exceededError ? 'true' : undefined}
                onChange={(event) => {
                  setExceededValue(event.target.value);
                  setFieldError(null);
                  setActionError(null);
                }}
              />
              <span
                className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm text-neutral-500"
                aria-hidden="true"
              >
                %
              </span>
            </div>
            <p
              id={exceededHelpId}
              className="mt-1.5 text-xs leading-5 text-neutral-600"
            >
              Utilization through this value remains in warning. The
              default is {DEFAULT_THRESHOLDS.exceeded}%.
            </p>
            {exceededError ? (
              <p
                id={exceededErrorId}
                className="mt-1.5 text-sm font-medium text-red-700"
                role="alert"
              >
                {exceededError}
              </p>
            ) : null}
          </div>
        </fieldset>

        {hasValidPreview ? (
          <div
            className="grid gap-2 sm:grid-cols-3"
            aria-label="Capacity threshold preview"
          >
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2">
              <p className="text-xs font-semibold text-green-800">
                Healthy
              </p>
              <p className="mt-1 text-xs text-green-900">
                Below {warningRangeStart}%
              </p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800">
                Warning
              </p>
              <p className="mt-1 text-xs text-amber-900">
                {warningRangeStart}%–{warningRangeEnd}%
              </p>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-semibold text-red-800">
                Over capacity
              </p>
              <p className="mt-1 text-xs text-red-900">
                Above {warningRangeEnd}%
              </p>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          className="inline-flex min-h-9 items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-teal-700 transition-colors hover:bg-teal-50 hover:text-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || isSaving}
          onClick={handleReset}
        >
          Restore defaults
        </button>

        {actionError ? (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
            role="alert"
          >
            {actionError.message}
          </div>
        ) : null}
      </div>
    </ConfirmDialog>
  );
};

ThresholdSettingsDialog.propTypes = {
  isOpen: PropTypes.bool,
  open: PropTypes.bool,
  thresholds: PropTypes.shape({
    constrained: PropTypes.number.isRequired,
    exceeded: PropTypes.number.isRequired,
  }),
  constrainedThreshold: PropTypes.number,
  exceededThreshold: PropTypes.number,
  onSave: PropTypes.func,
  onThresholdsChange: PropTypes.func,
  onChange: PropTypes.func,
  onClose: PropTypes.func,
  onCancel: PropTypes.func,
  title: PropTypes.string,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};

export default ThresholdSettingsDialog;