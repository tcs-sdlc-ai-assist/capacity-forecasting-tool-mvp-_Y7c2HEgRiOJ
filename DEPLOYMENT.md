# Deployment Guide

The Capacity Forecast Tool is a client-only React application built with Vite. It is deployed as static assets and does not require server-side APIs, serverless functions, databases, secrets, or runtime backend services.

## Requirements

- Node.js 20
- npm
- A static hosting environment with single-page application route fallback
- HTTPS for deployments exposed beyond local demonstration use

Install the exact dependency versions from `package-lock.json`:

```sh
npm ci
```

## Local development

Start the Vite development server:

```sh
npm run dev
```

Vite prints the local URL after startup. Development data is stored in the browser associated with that origin.

Run the local validation suite before deployment:

```sh
npm run lint
npm run test
npm run coverage
npm run build
```

Install Playwright Chromium before running end-to-end tests locally:

```sh
npx playwright install --with-deps chromium
npm run e2e
```

## Production build

Create the production bundle:

```sh
npm ci
npm run build
```

Vite writes the static application to:

```text
dist/
```

The production build contains HTML, JavaScript, CSS, and other static assets. No backend artifact is produced.

Preview the production build locally:

```sh
npm run preview
```

To expose the preview server on a specific interface and port:

```sh
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

The preview server is intended for validation and is not a production application server.

## Production checks

Before promoting a deployment, verify:

1. `npm ci` completes without dependency changes.
2. `npm run lint` completes with no warnings or errors.
3. `npm run coverage` completes successfully.
4. `npm run build` produces the `dist` directory.
5. `npm run e2e` passes against a production build.
6. Direct navigation to `/login` loads the application.
7. Direct navigation to `/forecast` loads the application and redirects an unauthenticated browser to `/login`.
8. A valid demo account can sign in and reach `/forecast`.
9. Refreshing `/forecast` preserves an active, unexpired browser-local session.
10. CSV and JSON imports remain browser-local.
11. Thresholds, filters, scenarios, and the active dataset persist after refresh when browser storage is available.
12. Removing CFT-owned browser data signs the user out and allows the bundled demo state to bootstrap on the next load.

Demo credentials are bundled with the client and must never be replaced with real credentials.

## Public environment variables

Vite exposes variables prefixed with `VITE_` to browser code. These values are embedded into the generated JavaScript during the build and are public.

Supported optional variables include:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_APP_NAME` | `Capacity Forecast Tool` | Public application name displayed in the interface. |
| `VITE_SUPPORTED_SCHEMA_VERSION` | `1.0.0` | Dataset schema version accepted by the application. |
| `VITE_REFERENCE_DATE` | `2026-08-20` | Public reference date used by application configuration. |

A local starting point is available in `.env.example`:

```sh
cp .env.example .env
```

Do not place passwords, API keys, tokens, private URLs, or other secrets in any `VITE_*` variable.

Environment values must be configured before the production build. Changing a Vercel environment variable requires a new deployment because there is no runtime configuration service.

Changing `VITE_SUPPORTED_SCHEMA_VERSION` without a corresponding compatible schema and migration implementation can cause stored or imported datasets to be rejected. Keep the configured value at `1.0.0` unless the application code has been upgraded for another schema version.

## Vercel deployment

The repository is ready for static deployment on Vercel.

### Project settings

Use the following settings if Vercel does not detect them automatically:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js version | 20 |

No serverless functions, databases, storage products, or secret environment variables are required.

### Deploy from Git

1. Import the repository into Vercel.
2. Select the Vite framework preset.
3. confirm the build command is `npm run build`.
4. Confirm the output directory is `dist`.
5. Configure optional public `VITE_*` variables for the required Vercel environments.
6. Deploy the project.
7. Run the production checks against the generated deployment URL.

Vercel preview deployments can be used for pull requests or non-production branches. Production deployment should be associated with the repository’s production branch, normally `main`.

### Deploy with the Vercel CLI

If the Vercel CLI is available in the deployment environment, create a preview deployment with:

```sh
vercel
```

Create a production deployment with:

```sh
vercel --prod
```

The Vercel CLI is not a project dependency and is not required for local development or CI validation.

## Single-page application rewrite

React Router handles browser routes in the client. Requests for application routes must return `index.html` so the router can resolve the requested location.

The repository includes `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This rewrite allows direct navigation and refreshes for routes such as:

```text
/login
/forecast
```

The rewrite is not an API proxy and does not create backend endpoints. Static assets continue to be served by Vercel while application routes fall back to `index.html`.

For another static host, configure the equivalent “all non-file routes to `index.html`” fallback. Without this behavior, direct navigation or refresh on a client route may return a host-level 404 response.

## CI/CD

GitHub Actions validation is defined in `.github/workflows/ci.yml`.

The workflow runs for:

- Pull requests
- Pushes to `main`

The validation job uses Node.js 20 and performs:

```sh
npm ci
npm run lint
npm run coverage
npm run build
npx playwright install --with-deps chromium
npm run e2e
```

The job has read-only repository content permissions and a 30-minute timeout. Concurrent runs for the same workflow and Git reference are cancelled when a newer run starts.

Recommended branch protection requires the CI validation job to pass before changes are merged into `main`.

When Vercel Git integration is enabled:

- Pull requests can receive Vercel preview deployments.
- Merges or pushes to the configured production branch can create production deployments.
- Vercel deployment status and GitHub Actions validation should both be checked before promotion.

The repository does not contain a workflow that manually invokes Vercel. Deployment ownership remains with the configured Vercel project or an external release process.

## Rollback

Use Vercel deployment history to roll back production:

1. Open the project in Vercel.
2. Locate the last known-good production deployment.
3. Promote or redeploy that deployment to production.
4. Verify `/login`, `/forecast`, authentication, persistence, imports, and scenario behavior.
5. Confirm the public environment values match the version being restored.

A deployment rollback changes static application assets only. It does not automatically remove or roll back data stored in users’ browsers.

Browser-local data may have been written by a newer application version. Before releasing a schema or storage change:

- Preserve compatibility with existing `cft.` values where possible.
- Add explicit migration or recovery behavior for incompatible content.
- Keep dataset schema configuration aligned with the deployed code.
- Test upgrade and rollback behavior using populated browser storage.
- Communicate when users must remove local data to recover from incompatible state.

If stored dataset content is malformed or incompatible with the current supported schema, startup recovery replaces it with the bundled synthetic demo dataset. Users can also use the application’s local-data removal action when a complete reset is required.

## Browser storage operations

Application state is stored under the `cft.` namespace in the current browser. Stored data can include:

- Demo user records
- Active demo session
- Active dataset content and metadata
- Import summary
- Persistence status
- Notices
- Forecast filters
- Capacity thresholds
- Scenarios

There is no shared database or centralized administrative view of this data.

Operational consequences include:

- Data is isolated by browser, profile, device, and site origin.
- Preview and production deployment origins have separate browser storage.
- Moving to a different domain does not migrate local data.
- Clearing site data removes the user’s saved workspace.
- Private browsing can isolate or discard saved state.
- Storage quotas and browser privacy policies can prevent durable writes.
- When durable storage is unavailable, the application falls back to memory for the current page session.
- Memory-only changes are lost when the page or browser session ends.
- Browser-local scenarios are not collaborative and cannot be centrally restored.
- Rollbacks do not restore a user’s previous dataset, filters, thresholds, or scenarios.
- Hosting operators cannot back up or recover browser-local data from Vercel.

The application’s reset operation removes keys beginning with `cft.` and leaves unrelated browser storage keys unchanged.

## Security and privacy

This deployment is demonstration software and does not provide production authentication.

- Demo usernames and passwords are included in the client bundle.
- Authentication is browser-local and is not a security boundary.
- Sessions last up to eight hours and are stored in the browser.
- Imported files are parsed in the browser and are not uploaded by application code.
- No server receives imported dataset content.
- No production credentials or confidential data should be used.
- Public deployments should use HTTPS and appropriate hosting access controls.
- Vercel project access controls can restrict deployment access, but they do not convert the application’s demo sign-in into production authentication.

Review hosting analytics, logging, browser extensions, and organizational endpoint controls separately when evaluating whether a dataset is appropriate for local browser processing.

## Backend and infrastructure

The application has no runtime backend services.

It does not require:

- API servers
- Serverless functions
- Databases
- Object storage
- Message queues
- Scheduled jobs
- Authentication providers
- Shared caches
- Runtime secrets
- Server-side session storage

All forecast calculations, imports, validation, filtering, threshold classification, and scenario projections run in the browser.

Vercel serves only the compiled static assets and applies the SPA rewrite. Any future introduction of shared persistence, production authentication, synchronization, or server-side processing requires a separate architecture, security review, deployment plan, and operations model.

## Post-deployment smoke test

Use a fresh browser context for the initial smoke test:

1. Open `/forecast`.
2. Confirm the application redirects to `/login`.
3. Sign in with a bundled demo account.
4. Confirm the synthetic demo disclosure appears.
5. Confirm the dataset reports 36 work items and 12 teams.
6. Search for a known item such as `CFT-1201`.
7. Open a capacity detail popover with keyboard focus.
8. Change and save capacity thresholds.
9. Refresh and confirm the threshold values persist.
10. Create a scenario and change an allocation.
11. Confirm the scenario projection does not modify the baseline.
12. Import a valid CSV or JSON dataset.
13. Refresh and confirm the imported dataset remains active.
14. Verify direct refresh on `/forecast` does not produce a host-level 404.
15. Remove CFT-owned browser data and reload.
16. Confirm the application returns to `/login` and clean demo data is bootstrapped.

Use a separate fresh browser context to verify first-run behavior after each production promotion.