import { useState } from 'react';
import { useNotices } from '../../hooks/useNotices.js';
import { MISSING_DATASET_NOTICE_MESSAGE } from '../../services/recoveryService.js';

const SEVERITY_CONFIG = Object.freeze({
  info: Object.freeze({
    label: 'Information',
    containerClassName: 'border-teal-200 bg-teal-50 text-teal-950',
    iconClassName: 'text-teal-700',
    badgeClassName: 'bg-teal-100 text-teal-800',
  }),
  success: Object.freeze({
    label: 'Success',
    containerClassName: 'border-green-200 bg-green-50 text-green-950',
    iconClassName: 'text-green-700',
    badgeClassName: 'bg-green-100 text-green-800',
  }),
  warning: Object.freeze({
    label: 'Warning',
    containerClassName: 'border-amber-200 bg-amber-50 text-amber-950',
    iconClassName: 'text-amber-700',
    badgeClassName: 'bg-amber-100 text-amber-800',
  }),
  error: Object.freeze({
    label: 'Error',
    containerClassName: 'border-red-200 bg-red-50 text-red-950',
    iconClassName: 'text-red-700',
    badgeClassName: 'bg-red-100 text-red-800',
  }),
});

const resolveSeverityConfig = (severity) => (
  SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info
);

const SeverityIcon = ({ severity }) => {
  if (severity === 'success') {
    return (
      <svg
        className="h-5 w-5"
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

  if (severity === 'warning') {
    return (
      <svg
        className="h-5 w-5"
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

  if (severity === 'error') {
    return (
      <svg
        className="h-5 w-5"
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
      className="h-5 w-5"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-11.75a.875.875 0 1 0 0-1.75.875.875 0 0 0 0 1.75ZM9.25 8.5a.75.75 0 0 1 .75-.75h.01a.75.75 0 0 1 .74.75v4.25h.25a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1 0-1.5h.25V9.25a.75.75 0 0 1 0-1.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
};

SeverityIcon.propTypes = {
  severity: (
    props,
    propName,
    componentName,
  ) => {
    const value = props[propName];

    if (
      value !== undefined
      && !Object.prototype.hasOwnProperty.call(SEVERITY_CONFIG, value)
    ) {
      return new Error(
        `Invalid prop \`${propName}\` supplied to \`${componentName}\`.`,
      );
    }

    return null;
  },
};

const DismissIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M5.22 5.22a.75.75 0 0 1 1.06 0L10 8.94l3.72-3.72a.75.75 0 1 1 1.06 1.06L11.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06L10 11.06l-3.72 3.72a.75.75 0 0 1-1.06-1.06L8.94 10 5.22 6.28a.75.75 0 0 1 0-1.06Z" />
  </svg>
);

/**
 * Presents browser-local system notices in an accessible live region.
 *
 * @returns {import('react').ReactNode} Global notice center.
 */
export const NoticeCenter = () => {
  const {
    notices,
    dismissNotice,
  } = useNotices();
  const [dismissalError, setDismissalError] = useState(null);
  const visibleNotices = notices.filter((notice) => (
    notice.message !== MISSING_DATASET_NOTICE_MESSAGE
  ));

  const handleDismiss = (noticeId) => {
    try {
      const result = dismissNotice(noticeId);

      if (result?.ok === false) {
        setDismissalError(
          result.error?.message
            ?? 'The system notice could not be dismissed.',
        );
        return;
      }

      setDismissalError(null);
    } catch {
      setDismissalError('The system notice could not be dismissed.');
    }
  };

  if (visibleNotices.length === 0 && dismissalError === null) {
    return null;
  }

  return (
    <section
      className="w-full"
      aria-label="System notices"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {dismissalError ? (
        <p
          className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          role="alert"
        >
          {dismissalError}
        </p>
      ) : null}

      <ul className="space-y-3" aria-label="Current system notices">
        {visibleNotices.map((notice) => {
          const severity = resolveSeverityConfig(notice.severity);

          return (
            <li
              key={notice.id}
              className={`rounded-lg border p-4 shadow-xs ${severity.containerClassName}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 shrink-0 ${severity.iconClassName}`}
                >
                  <SeverityIcon severity={notice.severity} />
                </span>

                <div className="min-w-0 flex-1">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${severity.badgeClassName}`}
                  >
                    {severity.label}
                  </span>
                  <p className="mt-1.5 text-sm leading-5">
                    {notice.message}
                  </p>
                </div>

                {notice.dismissible ? (
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-current opacity-70 transition hover:bg-neutral-0/60 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                    aria-label={`Dismiss ${severity.label.toLowerCase()} notice`}
                    onClick={() => handleDismiss(notice.id)}
                  >
                    <DismissIcon />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default NoticeCenter;