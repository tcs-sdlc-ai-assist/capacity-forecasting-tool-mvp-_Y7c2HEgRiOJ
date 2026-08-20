import {
  useEffect,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../../../components/dialogs/ConfirmDialog.jsx';
import defaultResetFacade from '../../../facades/resetFacade.js';

const createResetError = (error) => ({
  code: typeof error?.code === 'string'
    ? error.code
    : 'RESET_FAILED',
  message: typeof error?.message === 'string'
    ? error.message
    : 'Browser-local application data could not be removed.',
});

/**
 * Confirms and performs removal of all CFT-owned browser-local data.
 *
 * @param {{
 *   isOpen?: boolean,
 *   open?: boolean,
 *   onClose?: Function,
 *   onResetComplete?: Function,
 *   loginPath?: string,
 *   resetter?: {
 *     removeAllLocalData: Function
 *   }
 * }} props Reset dialog properties.
 * @returns {import('react').ReactNode} Local-data reset confirmation dialog.
 */
export const ResetLocalDataDialog = ({
  isOpen = undefined,
  open = false,
  onClose = null,
  onResetComplete = null,
  loginPath = '/login',
  resetter = defaultResetFacade,
}) => {
  const navigate = useNavigate();
  const [isRemoving, setIsRemoving] = useState(false);
  const [resetError, setResetError] = useState(null);
  const resolvedOpen = isOpen ?? open;

  useEffect(() => {
    if (resolvedOpen) {
      setResetError(null);
    }
  }, [resolvedOpen]);

  const handleClose = () => {
    if (isRemoving) {
      return;
    }

    setResetError(null);

    if (typeof onClose === 'function') {
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (isRemoving) {
      return;
    }

    if (typeof resetter?.removeAllLocalData !== 'function') {
      setResetError(createResetError({
        code: 'RESET_UNAVAILABLE',
        message: 'The local-data reset service is unavailable.',
      }));
      return;
    }

    setIsRemoving(true);
    setResetError(null);

    let result;

    try {
      result = await resetter.removeAllLocalData({
        confirmed: true,
      });
    } catch (error) {
      result = {
        ok: false,
        data: null,
        error: createResetError(error),
      };
    }

    if (!result?.ok) {
      setResetError(createResetError(result?.error));
      setIsRemoving(false);
      return;
    }

    if (typeof onResetComplete === 'function') {
      try {
        onResetComplete(result);
      } catch {
        // Consumer callback failures do not invalidate a completed reset.
      }
    }

    if (typeof onClose === 'function') {
      try {
        onClose();
      } catch {
        // Navigation must continue after browser-local data is removed.
      }
    }

    navigate(loginPath, {
      replace: true,
      state: null,
    });
  };

  return (
    <ConfirmDialog
      isOpen={resolvedOpen}
      title="Remove all local data?"
      description="This permanently removes Capacity Forecast Tool data stored by this browser."
      confirmLabel={isRemoving ? 'Removing data…' : 'Remove local data'}
      cancelLabel="Keep local data"
      destructive
      isLoading={isRemoving}
      closeOnBackdropClick={!isRemoving}
      closeOnEscape={!isRemoving}
      initialFocus="cancel"
      onCancel={handleClose}
      onConfirm={handleConfirm}
    >
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-neutral-900">
            The following browser-local information will be removed:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
            <li>The active dataset and import summary</li>
            <li>Saved scenarios, filters, and capacity thresholds</li>
            <li>Demo users, system notices, and your active session</li>
          </ul>
        </div>

        <p className="text-neutral-600">
          Data belonging to other sites is not affected. You will be signed
          out and returned to the login page. The bundled demo workspace will
          be restored the next time the application starts.
        </p>

        {resetError ? (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
            role="alert"
          >
            {resetError.message}
          </div>
        ) : null}
      </div>
    </ConfirmDialog>
  );
};

ResetLocalDataDialog.propTypes = {
  isOpen: PropTypes.bool,
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onResetComplete: PropTypes.func,
  loginPath: PropTypes.string,
  resetter: PropTypes.shape({
    removeAllLocalData: PropTypes.func.isRequired,
  }),
};

export default ResetLocalDataDialog;