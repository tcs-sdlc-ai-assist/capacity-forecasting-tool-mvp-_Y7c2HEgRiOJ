import { Link } from 'react-router-dom';
import { APP_NAME } from '../config/appConfig.js';
import { useAuthContext } from '../providers/AuthProvider.jsx';

const HomeIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M9.47 2.97a.75.75 0 0 1 1.06 0l7 7a.75.75 0 1 1-1.06 1.06L16 10.56v5.69A1.75 1.75 0 0 1 14.25 18h-2.5A1.75 1.75 0 0 1 10 16.25V13H8.5v3.25A1.75 1.75 0 0 1 6.75 18h-1A1.75 1.75 0 0 1 4 16.25v-5.69l-.47.47a.75.75 0 0 1-1.06-1.06l7-7ZM5.5 9.06v7.19c0 .138.112.25.25.25h1a.25.25 0 0 0 .25-.25v-4A.75.75 0 0 1 7.75 11h3a.75.75 0 0 1 .75.75v4.5c0 .138.112.25.25.25h2.5a.25.25 0 0 0 .25-.25V9.06L10 4.56 5.5 9.06Z"
      clipRule="evenodd"
    />
  </svg>
);

const SignInIcon = () => (
  <svg
    className="h-4 w-4"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M3 4.75A2.75 2.75 0 0 1 5.75 2h5.5A2.75 2.75 0 0 1 14 4.75V6a.75.75 0 0 1-1.5 0V4.75c0-.69-.56-1.25-1.25-1.25h-5.5c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h5.5c.69 0 1.25-.56 1.25-1.25V14a.75.75 0 0 1 1.5 0v1.25A2.75 2.75 0 0 1 11.25 18h-5.5A2.75 2.75 0 0 1 3 15.25V4.75Zm10.47 3.22a.75.75 0 0 1 1.06 0l1.5 1.5a.75.75 0 0 1 0 1.06l-1.5 1.5a.75.75 0 1 1-1.06-1.06l.22-.22H8.75a.75.75 0 0 1 0-1.5h4.94l-.22-.22a.75.75 0 0 1 0-1.06Z"
      clipRule="evenodd"
    />
  </svg>
);

/**
 * Presents an accessible not-found route with an authentication-aware
 * destination.
 *
 * @returns {import('react').ReactNode} Not-found route page.
 */
export const NotFoundPage = () => {
  const auth = useAuthContext();
  const isAuthenticated = (
    auth.isAuthenticated
    || auth.status === 'authenticated'
  );
  const destination = isAuthenticated ? '/forecast' : '/login';
  const destinationLabel = isAuthenticated
    ? 'Return to forecast workspace'
    : 'Go to sign in';

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <section
        className="w-full max-w-lg rounded-xl border border-neutral-200 bg-neutral-0 p-6 text-center shadow-sm sm:p-8"
        aria-labelledby="not-found-title"
      >
        <span
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-2xl font-bold text-teal-800"
          aria-hidden="true"
        >
          404
        </span>

        <p className="mt-5 text-sm font-semibold text-teal-700">
          {APP_NAME}
        </p>

        <h1
          id="not-found-title"
          className="mt-1 text-2xl font-semibold text-neutral-900"
        >
          Page not found
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-600">
          The page you requested does not exist or is no longer available.
          Your browser-local data has not been changed.
        </p>

        <Link
          to={destination}
          replace
          className="mt-7 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800"
        >
          {isAuthenticated ? <HomeIcon /> : <SignInIcon />}
          {destinationLabel}
        </Link>

        <p className="mt-6 text-xs leading-5 text-neutral-500">
          Check the address and try again, or use the link above to return to
          an available page.
        </p>
      </section>
    </main>
  );
};

export default NotFoundPage;