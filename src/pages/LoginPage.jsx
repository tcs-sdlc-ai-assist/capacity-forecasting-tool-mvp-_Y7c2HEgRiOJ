import {
  useRef,
  useState,
} from 'react';
import {
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { APP_NAME } from '../config/appConfig.js';
import { DEMO_USERS } from '../data/demoUsers.js';
import { useAuthContext } from '../providers/AuthProvider.jsx';

const DEFAULT_REDIRECT_PATH = '/forecast';
const GENERIC_LOGIN_ERROR = (
  'Sign-in was unsuccessful. Check the demo username and password and try again.'
);

const isSafeLocalPath = (value) => (
  typeof value === 'string'
  && value.startsWith('/')
  && !value.startsWith('//')
  && !value.includes('\\')
  && !/[\u0000-\u001f\u007f-\u009f]/.test(value)
);

const resolveRedirectPath = (from) => {
  if (typeof from === 'string') {
    const routePath = from.split(/[?#]/, 1)[0];

    return isSafeLocalPath(from) && routePath !== '/login'
      ? from
      : DEFAULT_REDIRECT_PATH;
  }

  if (
    from === null
    || typeof from !== 'object'
    || Array.isArray(from)
  ) {
    return DEFAULT_REDIRECT_PATH;
  }

  const pathname = typeof from.pathname === 'string'
    ? from.pathname
    : '';

  if (!isSafeLocalPath(pathname) || pathname === '/login') {
    return DEFAULT_REDIRECT_PATH;
  }

  const search = typeof from.search === 'string'
    && from.search.startsWith('?')
    ? from.search
    : '';
  const hash = typeof from.hash === 'string'
    && from.hash.startsWith('#')
    ? from.hash
    : '';

  return `${pathname}${search}${hash}`;
};

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

const WarningIcon = () => (
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

/**
 * Renders the public demo-only sign-in page.
 *
 * @returns {import('react').ReactNode} Local demo authentication page.
 */
export const LoginPage = () => {
  const auth = useAuthContext();
  const location = useLocation();
  const navigate = useNavigate();
  const passwordInputRef = useRef(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');
  const redirectPath = resolveRedirectPath(location.state?.from);

  if (auth.isAuthenticated || auth.status === 'authenticated') {
    return <Navigate replace to={redirectPath} />;
  }

  const selectDemoUser = (user) => {
    if (isSubmitting) {
      return;
    }

    setUsername(user.username);
    setPassword(user.password);
    setLoginError('');
    passwordInputRef.current?.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!username.trim() || !password) {
      setLoginError(GENERIC_LOGIN_ERROR);
      return;
    }

    setIsSubmitting(true);
    setLoginError('');

    try {
      const result = await auth.login({
        username: username.trim(),
        password,
      });

      if (!result?.ok || !result.data?.session) {
        setPassword('');
        setLoginError(GENERIC_LOGIN_ERROR);
        passwordInputRef.current?.focus();
        return;
      }

      navigate(redirectPath, {
        replace: true,
        state: null,
      });
    } catch {
      setPassword('');
      setLoginError(GENERIC_LOGIN_ERROR);
      passwordInputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 sm:px-6 sm:py-14 lg:px-8 flex items-center justify-center">
      <div className="mx-auto w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
        
        {/* Left Side: Branding and Login Form */}
        <div className="flex flex-col">
          <header className="mb-8">
            <div
              className="grid h-12 w-12 grid-cols-3 items-end gap-1 rounded-xl bg-teal-700 p-2.5 shadow-sm"
              aria-hidden="true"
            >
              <span className="h-2.5 rounded-sm bg-white" />
              <span className="h-5 rounded-sm bg-white" />
              <span className="h-7 rounded-sm bg-white" />
            </div>
            <p className="mt-6 text-sm font-bold tracking-wide text-teal-700 uppercase">
              {APP_NAME}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
              Sign in to the demo
            </h1>
            <p className="mt-3 text-base leading-relaxed text-neutral-600 max-w-sm">
              Use one of the synthetic accounts to open the browser-local forecast workspace.
            </p>
          </header>

          <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-0 shadow-md">
            <form
              className="space-y-5 p-6 sm:p-8"
              aria-busy={isSubmitting || undefined}
              onSubmit={handleSubmit}
            >
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-sm font-semibold text-neutral-800"
                >
                  Username
                </label>
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  maxLength={64}
                  className="mt-2 min-h-11 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm text-neutral-900 shadow-sm transition-colors placeholder:text-neutral-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:cursor-not-allowed disabled:bg-neutral-50"
                  value={username}
                  placeholder="Enter a demo username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  disabled={isSubmitting}
                  aria-describedby="demo-credential-warning"
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setLoginError('');
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-semibold text-neutral-800"
                >
                  Password
                </label>
                <input
                  ref={passwordInputRef}
                  id="login-password"
                  name="password"
                  type="password"
                  maxLength={128}
                  className="mt-2 min-h-11 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm text-neutral-900 shadow-sm transition-colors placeholder:text-neutral-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 disabled:cursor-not-allowed disabled:bg-neutral-50"
                  value={password}
                  placeholder="Enter the demo password"
                  autoComplete="current-password"
                  required
                  disabled={isSubmitting}
                  aria-describedby="demo-credential-warning"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setLoginError('');
                  }}
                />
              </div>

              {loginError ? (
                <div
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
                  role="alert"
                >
                  {loginError}
                </div>
              ) : null}

              <button
                type="submit"
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden="true"
                  />
                ) : (
                  <SignInIcon />
                )}
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div
              id="demo-credential-warning"
              className="border-t border-amber-200 bg-amber-50/50 px-6 py-4 text-amber-900"
              role="note"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-amber-600">
                  <WarningIcon />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">
                    Demo-only authentication
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800/90">
                    Do not use your enterprise credentials. This sign-in is local to this browser and is not a security boundary.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Side: Demo Accounts */}
        <div className="flex flex-col">
          <section
            className="rounded-2xl border border-neutral-200 bg-neutral-0 p-6 sm:p-8 shadow-sm"
            aria-labelledby="demo-accounts-title"
          >
            <h2
              id="demo-accounts-title"
              className="text-lg font-bold text-neutral-900"
            >
              Available demo accounts
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Choose an account to fill the sign-in form. There is no account
              registration or enterprise identity integration.
            </p>

            <ul className="mt-6 space-y-3">
              {DEMO_USERS.map((user) => (
                <li key={user.username}>
                  <button
                    type="button"
                    className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left transition-all hover:border-teal-300 hover:bg-teal-50 hover:shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSubmitting}
                    aria-label={`Use ${user.displayName} demo account`}
                    onClick={() => selectDemoUser(user)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-neutral-900 group-hover:text-teal-900">
                        {user.displayName}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-neutral-500 group-hover:text-teal-700">
                        Username: {user.username}
                      </span>
                    </span>
                    <span className="shrink-0 rounded bg-white px-2.5 py-1 text-xs font-semibold text-teal-700 border border-neutral-200 shadow-xs group-hover:border-teal-200 group-hover:bg-teal-100">
                      Use account
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-sm font-bold text-neutral-900">
                Demo passwords
              </p>
              <ul className="mt-2 space-y-1.5">
                {DEMO_USERS.map((user) => (
                  <li key={`${user.username}-password`} className="flex items-baseline justify-between text-sm">
                    <span className="text-neutral-600">{user.username}</span>
                    <code className="rounded bg-neutral-200/60 px-1.5 py-0.5 font-mono text-xs font-bold text-neutral-800">
                      {user.password}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <p className="mt-8 text-center text-xs leading-relaxed text-neutral-500">
            Dataset and session information remain in this browser. <br className="hidden sm:block" />
            No source data is uploaded to a remote service.
          </p>
        </div>

      </div>
    </main>
  );
};

export default LoginPage;