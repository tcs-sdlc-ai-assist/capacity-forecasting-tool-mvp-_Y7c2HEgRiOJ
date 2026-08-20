import { Outlet } from 'react-router-dom';
import { usePersistenceStatus } from '../../hooks/usePersistenceStatus.js';
import NoticeCenter from '../feedback/NoticeCenter.jsx';
import AppHeader from './AppHeader.jsx';

const PersistenceWarning = () => {
  const {
    error,
    isFailed,
    isMemoryOnly,
    lastError,
  } = usePersistenceStatus();

  if (!isMemoryOnly && !isFailed) {
    return null;
  }

  const message = lastError?.message
    ?? error?.message
    ?? (
      isMemoryOnly
        ? 'Browser storage is unavailable. Changes will be kept in memory for this session.'
        : 'The browser persistence status could not be read.'
    );

  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-xs"
      aria-labelledby="persistence-warning-title"
      role="status"
    >
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
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
        <div className="min-w-0">
          <h2
            id="persistence-warning-title"
            className="text-sm font-semibold"
          >
            {isMemoryOnly
              ? 'Changes are stored for this session only'
              : 'Browser storage status unavailable'}
          </h2>
          <p className="mt-1 text-sm leading-5 text-amber-900">
            {message}
          </p>
        </div>
      </div>
    </section>
  );
};

/**
 * Composes the shared shell for authenticated application routes.
 *
 * @returns {import('react').ReactNode} Protected page layout.
 */
export const AppLayout = () => (
  <div className="flex min-h-screen flex-col bg-neutral-50">
    <AppHeader />

    <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-4 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <NoticeCenter />
      <PersistenceWarning />

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  </div>
);

export default AppLayout;