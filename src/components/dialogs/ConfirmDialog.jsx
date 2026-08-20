import {
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const getFocusableElements = (container) => (
  container
    ? Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((element) => (
        element.getAttribute('aria-hidden') !== 'true'
        && element.getAttribute('disabled') === null
      ))
    : []
);

const focusElement = (element) => {
  if (!element || typeof element.focus !== 'function') {
    return false;
  }

  try {
    element.focus({ preventScroll: true });
    return true;
  } catch {
    try {
      element.focus();
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Renders an accessible modal confirmation dialog with focus containment and
 * restoration.
 *
 * @param {{
 *   isOpen?: boolean,
 *   open?: boolean,
 *   title: import('react').ReactNode,
 *   description?: import('react').ReactNode,
 *   children?: import('react').ReactNode,
 *   confirmLabel?: import('react').ReactNode,
 *   cancelLabel?: import('react').ReactNode,
 *   onConfirm: Function,
 *   onCancel?: Function,
 *   onClose?: Function,
 *   destructive?: boolean,
 *   variant?: 'default'|'danger',
 *   isLoading?: boolean,
 *   isPending?: boolean,
 *   disabled?: boolean,
 *   closeOnBackdropClick?: boolean,
 *   closeOnEscape?: boolean,
 *   initialFocus?: 'cancel'|'confirm',
 *   initialFocusRef?: object,
 *   id?: string,
 *   className?: string
 * }} props Dialog properties.
 * @returns {import('react').ReactNode} Confirmation dialog.
 */
export const ConfirmDialog = ({
  isOpen = undefined,
  open = false,
  title,
  description = null,
  children = null,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel = null,
  onClose = null,
  destructive = false,
  variant = 'default',
  isLoading = false,
  isPending = false,
  disabled = false,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  initialFocus = 'cancel',
  initialFocusRef = null,
  id = '',
  className = '',
}) => {
  const generatedId = useId();
  const dialogId = id || `confirm-dialog-${generatedId.replace(/:/g, '')}`;
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;
  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const confirmButtonRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const resolvedOpen = isOpen ?? open;
  const isBusy = isLoading || isPending;
  const actionsDisabled = disabled || isBusy;
  const isDestructive = destructive || variant === 'danger';

  const requestClose = useCallback(() => {
    if (actionsDisabled) {
      return;
    }

    const callback = onCancel ?? onClose;

    if (typeof callback === 'function') {
      callback();
    }
  }, [actionsDisabled, onCancel, onClose]);

  const focusInitialElement = useCallback(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const suppliedTarget = initialFocusRef?.current;
    const preferredTarget = suppliedTarget ?? (
      initialFocus === 'confirm'
        ? confirmButtonRef.current
        : cancelButtonRef.current
    );
    const preferredIsAvailable = (
      preferredTarget
      && preferredTarget.disabled !== true
      && preferredTarget.getAttribute?.('aria-hidden') !== 'true'
    );

    if (preferredIsAvailable && focusElement(preferredTarget)) {
      return;
    }

    const focusableElements = getFocusableElements(dialog);

    if (!focusElement(focusableElements[0])) {
      focusElement(dialog);
    }
  }, [initialFocus, initialFocusRef]);

  useEffect(() => {
    if (!resolvedOpen || typeof document === 'undefined') {
      return undefined;
    }

    restoreFocusRef.current = document.activeElement;

    return () => {
      const focusTarget = restoreFocusRef.current;

      restoreFocusRef.current = null;
      focusElement(focusTarget);
    };
  }, [resolvedOpen]);

  useEffect(() => {
    if (!resolvedOpen || typeof document === 'undefined') {
      return undefined;
    }

    focusInitialElement();

    const handleFocusIn = (event) => {
      const dialog = dialogRef.current;

      if (dialog && !dialog.contains(event.target)) {
        focusInitialElement();
      }
    };

    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [focusInitialElement, resolvedOpen]);

  useEffect(() => {
    if (!resolvedOpen || typeof document === 'undefined') {
      return undefined;
    }

    const handleDocumentKeyDown = (event) => {
      if (
        event.key === 'Escape'
        && closeOnEscape
        && !actionsDisabled
      ) {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = dialogRef.current;
      const focusableElements = getFocusableElements(dialog);

      if (focusableElements.length === 0) {
        event.preventDefault();
        focusElement(dialog);
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[
        focusableElements.length - 1
      ];
      const activeElement = document.activeElement;

      if (
        event.shiftKey
        && (
          activeElement === firstElement
          || !dialog?.contains(activeElement)
        )
      ) {
        event.preventDefault();
        focusElement(lastElement);
      } else if (
        !event.shiftKey
        && (
          activeElement === lastElement
          || !dialog?.contains(activeElement)
        )
      ) {
        event.preventDefault();
        focusElement(firstElement);
      }
    };

    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [
    actionsDisabled,
    closeOnEscape,
    requestClose,
    resolvedOpen,
  ]);

  if (!resolvedOpen) {
    return null;
  }

  const handleBackdropClick = (event) => {
    if (
      closeOnBackdropClick
      && event.target === event.currentTarget
    ) {
      requestClose();
    }
  };

  const handleConfirm = () => {
    if (!actionsDisabled) {
      onConfirm();
    }
  };

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-950/60 px-4 py-6 sm:px-6"
      onClick={handleBackdropClick}
    >
      <section
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={isBusy || undefined}
        tabIndex={-1}
        className={`w-full max-w-md rounded-xl border border-neutral-200 bg-neutral-0 p-5 shadow-lg sm:p-6 ${className}`}
      >
        <div className="flex items-start gap-4">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isDestructive
                ? 'bg-red-100 text-red-700'
                : 'bg-teal-100 text-teal-700'
            }`}
            aria-hidden="true"
          >
            {isDestructive ? (
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495a1.75 1.75 0 0 1 3.03 0l6.28 10.85A1.75 1.75 0 0 1 16.28 16H3.72a1.75 1.75 0 0 1-1.515-2.655l6.28-10.85ZM10 6.25a.75.75 0 0 1 .75.75v3.25a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-11.75a.875.875 0 1 0 0-1.75.875.875 0 0 0 0 1.75ZM9.25 8.5a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 .74.75v4.25h.25a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1 0-1.5h.25V9.25a.75.75 0 0 1 0-1.5Z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </span>

          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-lg font-semibold text-neutral-900"
            >
              {title}
            </h2>

            {description ? (
              <div
                id={descriptionId}
                className="mt-2 text-sm leading-6 text-neutral-600"
              >
                {description}
              </div>
            ) : null}

            {children ? (
              <div className="mt-4 text-sm text-neutral-700">
                {children}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={actionsDisabled}
            onClick={requestClose}
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmButtonRef}
            type="button"
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              isDestructive
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-teal-700 hover:bg-teal-800'
            }`}
            disabled={actionsDisabled}
            onClick={handleConfirm}
          >
            {isBusy ? (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                aria-hidden="true"
              />
            ) : null}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === 'undefined'
    ? dialog
    : createPortal(dialog, document.body);
};

ConfirmDialog.propTypes = {
  isOpen: PropTypes.bool,
  open: PropTypes.bool,
  title: PropTypes.node.isRequired,
  description: PropTypes.node,
  children: PropTypes.node,
  confirmLabel: PropTypes.node,
  cancelLabel: PropTypes.node,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func,
  onClose: PropTypes.func,
  destructive: PropTypes.bool,
  variant: PropTypes.oneOf(['default', 'danger']),
  isLoading: PropTypes.bool,
  isPending: PropTypes.bool,
  disabled: PropTypes.bool,
  closeOnBackdropClick: PropTypes.bool,
  closeOnEscape: PropTypes.bool,
  initialFocus: PropTypes.oneOf(['cancel', 'confirm']),
  initialFocusRef: PropTypes.shape({
    current: PropTypes.any,
  }),
  id: PropTypes.string,
  className: PropTypes.string,
};

export default ConfirmDialog;