# Changelog

All notable changes to the Capacity Forecast Tool are documented in this file.

## [1.0.0] - 2026-08-20

Initial release of the browser-local Capacity Forecast Tool.

### Added

#### Forecast workspace

- Capacity forecast matrix with sortable work-item identity columns and dynamic team allocation columns.
- Sticky Program, Epic, and Feature columns for horizontal navigation.
- Global search across programs, epics, item IDs, features, work types, owners, teams, ARTs, and statuses.
- Dataset-backed filters for planning level, owner, program, team, and ART.
- Active filter chips and clear-search or clear-filter recovery actions.
- Dedicated empty-dataset, no-results, loading, and error states.
- Bundled synthetic demo dataset containing 36 work items across 12 teams and six planning levels.

#### Capacity analytics

- Running allocation totals calculated independently for each planning-level and team context.
- Effective capacity calculations that account for reserved support, PTO impact, and holiday impact.
- Utilization, remaining capacity, over-capacity, and differential calculations.
- Capacity classifications for available, healthy, constrained, exceeded, and unavailable states.
- Configurable warning and over-capacity thresholds, persisted in browser storage.
- Keyboard- and pointer-accessible capacity detail popovers.

#### Dataset import

- Browser-local CSV and JSON parsing and validation.
- Support for canonical JSON datasets, structured row collections, and identifiable flat record arrays.
- CSV header aliases for supported work-item and capacity fields.
- Validation of required values, numeric fields, non-negative values, ISO dates, duplicate identities, schema versions, and dataset shape.
- Deterministic work-item identifiers when source identifiers are absent.
- Import summaries with accepted row, rejected row, and warning counts.
- Non-blocking warnings for allocations without matching capacity records.
- Preservation of the active dataset when an import cannot be validated or activated.
- Explicit rejection of unsupported formats, including spreadsheet files such as XLS and XLSX.
- Maximum import size of 10 MiB and maximum row count of 100,000.

#### What-if scenarios

- Browser-local scenario creation, selection, editing, saving, and removal.
- Scenario-specific team assignment and allocation changes.
- Baseline-versus-scenario comparisons for estimates, allocations, effective capacity, variance, and utilization.
- Team and planning-level comparison tables.
- Immutable scenario projections that leave the active baseline dataset unchanged.
- Dataset-scoped scenario persistence.

#### Demo authentication and persistence

- Demo-only sign-in using bundled synthetic planner, manager, and viewer accounts.
- Eight-hour browser-local sessions with protected forecast routing.
- Startup restoration of sessions, datasets, filters, thresholds, notices, and scenarios.
- Automatic bootstrap of the bundled demo dataset when no active dataset exists.
- Recovery to known-good demo data when stored dataset content is malformed or incompatible.
- Memory-only fallback when durable browser storage is unavailable or its quota is exceeded.
- Persistence status and recovery notices.
- Confirmed removal of all `cft.` browser-storage data without affecting data owned by other applications.

#### Accessibility and user experience

- Semantic headings, forms, dialogs, tables, live regions, alerts, and status messages.
- Keyboard-operable search, filters, sorting, dialogs, scenario controls, and capacity details.
- Dialog focus containment and focus restoration.
- Accessible names for allocation states and capacity metrics.
- Visible focus indicators and color-independent state labels.
- Responsive layouts and horizontally scrollable data tables.

#### Setup and delivery

- Vite 5 and React 18 application setup.
- Tailwind CSS styling with responsive utility classes.
- Production build and preview scripts.
- Vercel single-page application rewrite configuration.
- Vercel-ready static deployment with browser-route fallback to `index.html`.
- Configurable public application name and supported schema version through `VITE_*` environment variables.
- Example environment configuration in `.env.example`.
- GitHub Actions validation for linting, unit-test coverage, production builds, and Playwright end-to-end tests.

### Setup

Requirements:

- Node.js 20
- npm

Install dependencies and start the development server:

```sh
npm ci
npm run dev
```

Optional public build settings can be copied from `.env.example` into a local `.env` file:

```sh
cp .env.example .env
```

Create and preview a production build:

```sh
npm run build
npm run preview
```

### Testing

Run the available validation commands:

```sh
npm run lint
npm run test
npm run coverage
npm run build
npm run e2e
```

Playwright requires Chromium to be installed before local end-to-end execution:

```sh
npx playwright install --with-deps chromium
```

The end-to-end suite covers protected routing, demo sign-in, browser persistence, search and filters, capacity details, thresholds, scenarios, dataset imports, and clean-state rebootstrap.

### Import support

Supported file extensions:

- `.csv`
- `.json`

Supported MIME types:

- `text/csv`
- `application/csv`
- `application/json`
- `text/json`

Imports are parsed and validated in the browser. Source files are not uploaded by the application.

The supported dataset schema version is `1.0.0`. A normalized dataset contains:

- `schemaVersion`
- `workItems`
- `capacityRecords`
- Derived `dimensions`

Work items include planning context, feature metadata, assigned teams, estimates, dates, and per-team allocations. Capacity records include planning level, team, capacity points, support reservation, PTO impact, holiday impact, and confidence.

### Local-only limitations

- The application has no server-side API, shared database, or multi-user synchronization.
- Authentication is for demonstration only and is not a production security boundary.
- Demo credentials are bundled with the client application and must not be replaced with real credentials.
- Datasets, sessions, preferences, notices, and scenarios are stored only in the current browser.
- Clearing site data, using private browsing, changing browsers, or changing devices can remove or isolate saved state.
- Memory-only fallback data is lost when the page or browser session ends.
- Scenario changes are not collaborative and cannot be shared directly between users.
- Imports support CSV and JSON only; spreadsheet formats are not supported.
- Capacity calculations depend on the completeness and accuracy of imported allocation and capacity records.
- Deployments must use HTTPS and appropriate hosting controls if exposed beyond local demonstration use.

### Vercel readiness

- `vercel.json` rewrites all application routes to `index.html` for React Router compatibility.
- The production application is emitted to Vite's `dist` directory.
- No serverless functions, databases, secrets, or runtime backend configuration are required.
- Public configuration must use `VITE_*` variables because values are embedded in the client build.
- Any configured `VITE_*` value must be treated as public and must not contain secrets.