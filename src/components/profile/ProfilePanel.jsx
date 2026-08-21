import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getDemoUserProfile } from '../../data/demoUsers.js';
import ProfileAvatar from './ProfileAvatar.jsx';
import { processProfileImage } from './processProfileImage.js';

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

const resolvePhotoActionLabel = (isProcessing, imageSrc) => {
  if (isProcessing) {
    return 'Preparing photo…';
  }

  return imageSrc ? 'Change photo' : 'Add photo';
};

const formatDateTime = (value) => {
  if (typeof value !== 'string' || !value) {
    return 'Unavailable';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unavailable';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const DetailRow = ({ label, value, fullWidth = false }) => (
  <div className={`flex flex-col gap-1 ${fullWidth ? 'sm:col-span-2 sm:col-start-1' : ''}`}>
    <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
      {label}
    </dt>
    <dd className="min-w-0 break-words text-sm text-neutral-900">
      {value || 'Unavailable'}
    </dd>
  </div>
);

DetailRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  fullWidth: PropTypes.bool,
};

/**
 * Displays signed-in account details and lets the user add a profile photo.
 *
 * @param {{
 *   isOpen?: boolean,
 *   session?: object|null,
 *   imageSrc?: string|null,
 *   onClose?: Function,
 *   onSaveImage?: Function,
 *   onRemoveImage?: Function
 * }} props Profile panel properties.
 * @returns {import('react').ReactNode} Profile details dialog.
 */
export const ProfilePanel = ({
  isOpen = false,
  session = null,
  imageSrc = null,
  onClose = null,
  onSaveImage = null,
  onRemoveImage = null,
}) => {
  const generatedId = useId();
  const dialogId = `profile-panel-${generatedId.replace(/:/g, '')}`;
  const titleId = `${dialogId}-title`;
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const fileInputRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState('');

  const displayName = session?.displayName
    ?? session?.username
    ?? 'Signed-in user';
  const username = session?.username ?? '';
  const profile = getDemoUserProfile(username);
  
  const displayImageSrc = imageSrc || '/demo-profile.jpg';

  const requestClose = useCallback(() => {
    if (isProcessing) {
      return;
    }

    setActionError('');

    if (typeof onClose === 'function') {
      onClose();
    }
  }, [isProcessing, onClose]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return undefined;
    }

    restoreFocusRef.current = document.activeElement;
    setActionError('');

    return () => {
      const focusTarget = restoreFocusRef.current;

      restoreFocusRef.current = null;
      focusElement(focusTarget);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return undefined;
    }

    focusElement(closeButtonRef.current);

    const handleFocusIn = (event) => {
      const dialog = dialogRef.current;

      if (dialog && !dialog.contains(event.target)) {
        focusElement(closeButtonRef.current ?? getFocusableElements(dialog)[0]);
      }
    };

    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return undefined;
    }

    const handleDocumentKeyDown = (event) => {
      if (event.key === 'Escape' && !isProcessing) {
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
      const lastElement = focusableElements[focusableElements.length - 1];
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
  }, [isOpen, isProcessing, requestClose]);

  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  };

  const handleChoosePhoto = () => {
    if (!isProcessing) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || typeof onSaveImage !== 'function') {
      return;
    }

    setIsProcessing(true);
    setActionError('');

    try {
      const dataUrl = await processProfileImage(file);
      const result = onSaveImage(dataUrl);

      if (result?.ok === false) {
        setActionError(
          result.error?.message
          ?? 'The profile photo could not be saved.',
        );
      }
    } catch (error) {
      setActionError(
        typeof error?.message === 'string'
          ? error.message
          : 'The selected image could not be used as a profile photo.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemovePhoto = () => {
    if (isProcessing || typeof onRemoveImage !== 'function') {
      return;
    }

    const result = onRemoveImage();

    if (result?.ok === false) {
      setActionError(
        result.error?.message
        ?? 'The profile photo could not be removed.',
      );
      return;
    }

    setActionError('');
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
        tabIndex={-1}
        className="w-full max-w-3xl rounded-xl border border-neutral-200 bg-neutral-0 p-5 shadow-lg sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id={titleId}
              className="text-lg font-semibold text-neutral-900"
            >
              Account details
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              View this demo account and add a profile photo stored in
              this browser.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
            aria-label="Close account details"
            disabled={isProcessing}
            onClick={requestClose}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <ProfileAvatar
            imageSrc={displayImageSrc}
            size="lg"
            alt=""
            className="border-teal-200 bg-teal-50 text-teal-700"
          />

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-base font-semibold text-neutral-900">
              {displayName}
            </p>
            <p className="mt-0.5 text-sm text-neutral-600">
              {username || 'No username'}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={isProcessing}
                onChange={handleFileChange}
              />
              <button
                type="button"
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-teal-700 bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isProcessing}
                onClick={handleChoosePhoto}
              >
                {resolvePhotoActionLabel(isProcessing, imageSrc)}
              </button>
              {imageSrc ? (
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-neutral-300 bg-neutral-0 px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-xs transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isProcessing}
                  onClick={handleRemovePhoto}
                >
                  Remove photo
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {actionError ? (
          <div
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {actionError}
          </div>
        ) : null}

        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-5 sm:grid-cols-2">
          <DetailRow label="Display name" value={displayName} />
          <DetailRow label="Username" value={username} />
          <DetailRow label="Role" value={profile.role} />
          <DetailRow label="Email" value={profile.email} />
          <DetailRow label="Account type" value="Demo local" />
          <DetailRow
            label="Signed in"
            value={formatDateTime(session?.issuedAt)}
          />
          <DetailRow
            label="Session expires"
            value={formatDateTime(session?.expiresAt)}
          />
          <DetailRow label="Access" value={profile.description} fullWidth />
        </dl>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-700 shadow-xs transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isProcessing}
            onClick={requestClose}
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document === 'undefined'
    ? dialog
    : createPortal(dialog, document.body);
};

ProfilePanel.propTypes = {
  isOpen: PropTypes.bool,
  session: PropTypes.shape({
    username: PropTypes.string,
    displayName: PropTypes.string,
    issuedAt: PropTypes.string,
    expiresAt: PropTypes.string,
  }),
  imageSrc: PropTypes.string,
  onClose: PropTypes.func,
  onSaveImage: PropTypes.func,
  onRemoveImage: PropTypes.func,
};

export default ProfilePanel;
