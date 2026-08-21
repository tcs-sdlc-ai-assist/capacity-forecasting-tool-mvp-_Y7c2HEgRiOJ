# Capacity Forecast Tool

A browser-local React application for exploring planned work, team allocations, effective capacity, utilization, and what-if scenarios across planning levels.

The application is built with React 18, Vite 5, Zustand, TanStack Table, Tailwind CSS, Papa Parse, Vitest, and Playwright. It has no runtime backend, shared database, or server-side authentication service.

## Demo warning

> **This project is demonstration software.**
>
> - Demo credentials are synthetic. The bundled forecast dataset is a 2026 PI 3 MART/ACI sample (136 work items, 12 teams).
> - Demo credentials are included in the client bundle and are not a production security boundary.
> - Do not enter enterprise credentials or import confidential, regulated, or production data.
> - Imported files and application state remain in the current browser, but browser extensions, endpoint controls, hosting analytics, and other client-side software must be evaluated separately.
> - There is no multi-user synchronization, centralized backup, or administrative recovery.

## Features

### Forecast workspace

- Capacity forecast matrix with sortable identity columns.
- Dynamic team allocation columns derived from the active dataset.
- Sticky Program, Epic, and Feature columns.
- Global search across:
  - Program
  - Epic
  - Item ID
  - Feature
  - Work type
  - Owner
  - Team
  - ART
  - Status
- Dataset-backed filters for planning level, owner, program, team, and ART.
- OR matching within one filter category and AND matching across categories.
- Active filter chips and no-results recovery actions.
- Loading, error, empty-dataset, and no-match states.

### Capacity analytics

- Running allocation totals calculated independently for each planning-level and team context.
- Effective capacity adjusted for:
  - Reserved support percentage
  - PTO impact points
  - Holiday impact points
- Utilization, differential, remaining capacity, and over-capacity calculations.
- Available, healthy, constrained, exceeded, and unavailable classifications.
- Configurable warning and over-capacity thresholds.
- Keyboard- and pointer-accessible capacity detail popovers.

### Dataset import

- Browser-local CSV and JSON parsing.
- Schema, shape, date, identity, and numeric validation.
- Deterministic work-item identifiers when source identifiers are absent.
- Import summaries with accepted, rejected, and warning counts.
- Non-blocking warnings for allocations without matching capacity records.
- Preservation of the current dataset when an import cannot be activated.
- Maximum file size of 10 MiB.
- Maximum of 100,000 source rows.

### What-if scenarios

- Browser-local scenario creation, selection, editing, saving, and removal.
- Scenario-specific team assignment and allocation changes.
- Baseline-versus-scenario comparisons.
- Team and planning-level comparison tables.
- Immutable projections that leave the active baseline dataset unchanged.
- Dataset-scoped scenario persistence.

### Browser-local persistence

- Eight-hour demo sessions.
- Startup restoration of datasets, filters, thresholds, notices, and scenarios.
- Automatic bootstrap of a bundled 136-work-item, 12-team 2026 PI 3 sample dataset.
- Recovery to known-good demo data when stored dataset content is malformed or incompatible.
- Memory-only fallback when durable browser storage is unavailable or full.
- Namespace-safe removal of keys owned by this application.

## Requirements

- Node.js 20
- npm
- A modern browser with JavaScript enabled
- Chromium for the supplied Playwright end-to-end suite

## Quick start

Install the exact dependency versions from `package-lock.json`:

```sh
npm ci
```

Start the Vite development server:

```sh
npm run dev
```

Vite prints the local development URL after startup.

## Environment configuration

Public build settings may be copied from the example file:

```sh
cp .env.example .env
```

Supported variables are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_APP_NAME` | `Capacity Forecast Tool` | Application name shown in the interface. |
| `VITE_SUPPORTED_SCHEMA_VERSION` | `1.0.0` | Dataset schema version accepted by the application. |
| `VITE_REFERENCE_DATE` | `2026-08-20` | Public reference date used by application configuration. |

Vite embeds all `VITE_*` values in client JavaScript. They are public and must never contain passwords, API keys, tokens, private URLs, or other secrets.

Keep `VITE_SUPPORTED_SCHEMA_VERSION` at `1.0.0` unless the schema, migration, import, and persistence implementations are upgraded together.

## Demo credentials

The sign-in page can fill these credentials automatically.

| User | Username | Password |
| --- | --- | --- |
| Capacity Planner | `planner` | `Planner@123` |
| Portfolio Manager | `manager` | `Manager@123` |
| Forecast Viewer | `viewer` | `Viewer@123` |

All three accounts are synthetic. Their credentials are stored in the client application and must not be replaced with real credentials.

A successful sign-in creates an eight-hour browser-local session. The session contains the username and display name, but not the password.

## Available commands

### Development

```sh
npm run dev
```

### Unit tests

```sh
npm run test
```

### Unit tests with coverage

```sh
npm run coverage
```

Coverage reports are written under `coverage/`.

### Lint

```sh
npm run lint
```

### Production build

```sh
npm run build
```

The static production application is written to `dist/`.

### Production preview

```sh
npm run preview
```

To use the same host and port as the Playwright configuration:

```sh
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

### End-to-end tests

Install Playwright Chromium once:

```sh
npx playwright install --with-deps chromium
```

Run the end-to-end suite:

```sh
npm run e2e
```

The Playwright web server command builds the application and starts a production preview automatically.

### Full local validation

```sh
npm run lint
npm run test
npm run coverage
npm run build
npm run e2e
```

## Import contract

Only CSV and JSON files are supported.

### File constraints

| Constraint | Value |
| --- | --- |
| Extensions | `.csv`, `.json` |
| MIME types | `text/csv`, `application/csv`, `application/json`, `text/json` |
| Common CSV browser MIME type | `application/vnd.ms-excel` for a `.csv` file |
| Maximum file size | 10 MiB |
| Maximum row count | 100,000 |
| Multiple files | Not supported |
| Spreadsheet files | `.xls` and `.xlsx` are not supported |
| Supported schema version | `1.0.0` |

When a MIME type is supplied, it must agree with the file extension. Files are parsed in the browser and are not uploaded by application code.

### Canonical dataset shape

```json
{
  "schemaVersion": "1.0.0",
  "workItems": [],
  "capacityRecords": [],
  "dimensions": {
    "planningLevels": [],
    "programs": [],
    "owners": [],
    "teams": [],
    "arts": [],
    "statuses": [],
    "workTypes": []
  }
}
```

`dimensions` is optional during import. When omitted, dimensions are derived from normalized work items.

A successful import must contain at least one valid work item. Capacity records are optional, although allocations without matching capacity records produce warnings and unavailable capacity analytics.

### Work-item fields

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `recordId` | No | String | Used when supplied; otherwise deterministically generated. |
| `planningLevel` | Yes | String | Planning context, such as `PI 2028.1`. |
| `program` | Yes | String | Program name. |
| `epic` | No | String | Epic name. |
| `itemId` | No | String | Used as the record ID when `recordId` is absent. |
| `feature` | Yes | String | Feature title. |
| `featureWorkType` | Yes | String | For example, `Business Feature` or `Enabler`. |
| `owner` | No | String | Work-item owner. |
| `estimatedPoints` | Yes | Non-negative number | Must be finite. |
| `team` | Yes | String or string array | At least one team is required. Delimited CSV values may use commas, semicolons, or pipes. |
| `art` | No | String | Agile Release Train. |
| `status` | No | String | Planning status. |
| `startDate` | No | ISO date | Must use `YYYY-MM-DD`. |
| `endDate` | No | ISO date | Must use `YYYY-MM-DD` and cannot precede `startDate`. |
| `allocations` | Yes in canonical data | Object | Maps team names to non-negative allocation points. |
| `allocationPoints` | Conditional | Non-negative number | May replace `allocations` for a single-team source row. |

For a single-team source row, allocation points may be derived from `estimatedPoints` when neither `allocations` nor `allocationPoints` is supplied. This produces a warning.

For multi-team work items, an allocation map is required.

Example:

```json
{
  "recordId": "work-item-001",
  "planningLevel": "PI 2028.1",
  "program": "Customer Experience",
  "epic": "Account modernization",
  "itemId": "CFT-101",
  "feature": "Self-service account recovery",
  "featureWorkType": "Business Feature",
  "owner": "Demo Planner",
  "estimatedPoints": 20,
  "team": ["Atlas", "Beacon"],
  "art": "Customer ART",
  "status": "Committed",
  "startDate": "2028-01-01",
  "endDate": "2028-03-31",
  "allocations": {
    "Atlas": 12,
    "Beacon": 8
  }
}
```

### Capacity-record fields

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `planningLevel` | Yes | String | Must match the related work-item planning context. |
| `team` | Yes | String | Combined with planning level to form the capacity identity. |
| `capacityPoints` | Yes | Non-negative number | Gross capacity. |
| `reservedSupportPercent` | No | Number from 0 to 100 | Defaults to `0`. |
| `ptoImpactPoints` | No | Non-negative number | Defaults to `0`. |
| `holidayImpactPoints` | No | Non-negative number | Defaults to `0`. |
| `confidence` | No | String | `High`, `Medium`, `Low`, or `Unknown`; defaults to `Unknown`. |

Example:

```json
{
  "planningLevel": "PI 2028.1",
  "team": "Atlas",
  "capacityPoints": 40,
  "reservedSupportPercent": 10,
  "ptoImpactPoints": 2,
  "holidayImpactPoints": 1,
  "confidence": "High"
}
```

Effective capacity is calculated as:

```text
capacityPoints × (1 - reservedSupportPercent / 100)
- ptoImpactPoints
- holidayImpactPoints
```

The result is clamped to zero.

### Supported JSON shapes

#### Canonical structured object

```json
{
  "schemaVersion": "1.0.0",
  "workItems": [
    {
      "planningLevel": "PI 2028.1",
      "program": "Customer Experience",
      "feature": "Account recovery",
      "featureWorkType": "Business Feature",
      "estimatedPoints": 8,
      "team": ["Atlas"],
      "allocations": {
        "Atlas": 8
      }
    }
  ],
  "capacityRecords": [
    {
      "planningLevel": "PI 2028.1",
      "team": "Atlas",
      "capacityPoints": 40,
      "reservedSupportPercent": 0,
      "ptoImpactPoints": 0,
      "holidayImpactPoints": 0,
      "confidence": "High"
    }
  ]
}
```

#### Rows or records object

```json
{
  "schemaVersion": "1.0.0",
  "records": [
    {
      "recordType": "workItem",
      "planningLevel": "PI 2028.1",
      "program": "Customer Experience",
      "feature": "Account recovery",
      "featureWorkType": "Business Feature",
      "estimatedPoints": 8,
      "team": "Atlas",
      "allocationPoints": 8
    },
    {
      "recordType": "capacityRecord",
      "planningLevel": "PI 2028.1",
      "team": "Atlas",
      "capacityPoints": 40
    }
  ]
}
```

The property may be named `records` or `rows`.

#### Flat array

```json
[
  {
    "recordType": "workItem",
    "planningLevel": "PI 2028.1",
    "program": "Customer Experience",
    "feature": "Account recovery",
    "featureWorkType": "Business Feature",
    "estimatedPoints": 8,
    "team": "Atlas",
    "allocationPoints": 8
  },
  {
    "recordType": "capacityRecord",
    "planningLevel": "PI 2028.1",
    "team": "Atlas",
    "capacityPoints": 40
  }
]
```

Flat records must be identifiable as work items or capacity records. Recognized type properties include `recordType`, `rowType`, `entityType`, `kind`, `type`, and `_type`.

### CSV format

CSV files require a non-empty header row and at least one non-empty data row. A mixed CSV can contain work-item and capacity rows distinguished by `recordType`.

Example:

```csv
recordType,planningLevel,program,epic,itemId,feature,featureWorkType,owner,estimatedPoints,team,art,status,startDate,endDate,allocationPoints,capacityPoints,reservedSupportPercent,ptoImpactPoints,holidayImpactPoints,confidence
workItem,PI 2028.1,Customer Experience,Account modernization,CFT-101,Account recovery,Business Feature,Demo Planner,8,Atlas,Customer ART,Committed,2028-01-01,2028-03-31,8,,,,,
capacityRecord,PI 2028.1,,,,,,,,Atlas,,,,,,40,0,0,0,High
```

Supported `recordType` values include:

- Work items: `workItem`, `feature`, `work`
- Capacity records: `capacityRecord`, `capacity`, `teamCapacity`

When `recordType` is absent, the normalizer treats rows containing capacity-specific fields as capacity records and other rows as work items.

### Header aliases

CSV headers are trimmed and matched case-insensitively after punctuation and spacing normalization. Common aliases include:

| Canonical field | Examples |
| --- | --- |
| `recordType` | `record_type`, `rowType`, `entityType`, `kind` |
| `recordId` | `record_id`, `record id` |
| `planningLevel` | `planning_level`, `planning level`, `pi`, `program increment`, `train` |
| `program` | `programme` |
| `itemId` | `item_id`, `item id`, `featureId`, `id` |
| `feature` | `title`, `name` |
| `featureWorkType` | `workType`, `work_type`, `work type` |
| `owner` | `assignee` |
| `estimatedPoints` | `storyPoints`, `story points`, `points` |
| `team` | `teams`, `teamName`, `team name` |
| `art` | `agileReleaseTrain`, `agile release train` |
| `status` | `state` |
| `startDate` | `start_date`, `start date` |
| `endDate` | `end_date`, `end date` |
| `allocations` | `teamAllocations`, `team allocations` |
| `allocationPoints` | `allocatedPoints`, `allocation` |
| `capacityPoints` | `capacity` |
| `reservedSupportPercent` | `supportPercent`, `support %` |
| `ptoImpactPoints` | `ptoImpact`, `pto` |
| `holidayImpactPoints` | `holidayImpact`, `holiday` |
| `confidence` | `capacityConfidence` |

Unknown columns are ignored. Duplicate headers are reported as diagnostics.

### Allocation map formats

JSON imports should use an object:

```json
{
  "Atlas": 12,
  "Beacon": 8
}
```

CSV allocation maps may use JSON text or delimited `team:value` entries, for example:

```text
Atlas:12;Beacon:8
```

### Deterministic record identifiers

Identifier precedence is:

1. A valid supplied `recordId`
2. A valid supplied `itemId`
3. A deterministic hash of non-personal business identity fields

Fallback identity fields include planning level, program, epic, feature, work type, teams, ART, start date, and end date. Owner values are not included in the fallback hash.

### Validation and activation behavior

The importer validates:

- Supported file extension and MIME type
- File size and row count
- JSON or CSV syntax
- Supported schema version
- Dataset shape
- Required identity values
- Finite numeric values
- Non-negative estimates, allocations, impacts, and capacity
- Reserved support range
- ISO calendar dates
- Date ordering
- Duplicate work-item identities
- Duplicate planning-level/team capacity identities
- At least one valid work item

Invalid rows are rejected individually. If at least one work item remains valid, the valid rows may be activated and the summary reports rejected rows. If no valid work item remains, activation fails.

The active dataset is preserved when parsing, normalization, metadata creation, or activation fails.

Missing capacity coverage is non-blocking. Affected allocation cells display `Unavailable`, while allocation totals remain visible.

## Capacity classifications

Default thresholds are:

```json
{
  "constrained": 80,
  "exceeded": 100
}
```

Classification rules are:

| Utilization | State |
| --- | --- |
| Exactly 0% | Available |
| Greater than 0% and below the constrained threshold | Healthy |
| From the constrained threshold through the exceeded threshold | Constrained |
| Above the exceeded threshold | Exceeded |
| Missing or non-positive effective capacity | Unavailable |

Threshold values must be finite, between `0` and `1000`, and ordered so that `constrained <= exceeded`.

## Architecture

The application uses a client-only layered architecture:

```text
React pages and components
        |
        v
Hooks and feature view models
        |
        v
Zustand stores and facades
        |
        v
Domain services and selectors
        |
        v
Schema-aware repositories
        |
        v
PersistentStore
        |
        v
BrowserStorageAdapter
        |
        +-- localStorage
        |
        +-- in-memory fallback
```

### Major responsibilities

- **Pages and components** render routes, controls, dialogs, tables, and accessible feedback.
- **Hooks** subscribe to stable external-store snapshots.
- **Feature stores** manage forecast preferences and scenario state.
- **Facades** provide stable application-facing APIs and synchronize service results.
- **Services** implement authentication, bootstrap, import, recovery, reset, and scenario behavior.
- **Selectors** derive filtered rows, running totals, capacity metrics, and summaries.
- **Domain schemas** normalize and validate persisted and imported data.
- **Repositories** isolate schema-aware reads and writes.
- **Storage adapters** provide fail-soft JSON persistence and memory fallback.

### Routing

The router is defined in `src/app/router.jsx`.

| Route | Access |
| --- | --- |
| `/login` | Public |
| `/forecast` | Requires an active demo session |
| `/` | Redirects to `/forecast` |
| Other paths | Not-found page |

Import and scenario interfaces are workspace views rendered from the forecast route rather than separate browser routes.

### Startup flow

At startup, the application:

1. Seeds bundled demo users when needed.
2. attempts to restore the browser-local session.
3. Restores the active dataset.
4. Bootstraps the bundled demo dataset if no dataset exists.
5. Recovers malformed or incompatible dataset state with bundled demo data.
6. Initializes default filters and thresholds.
7. Records the current persistence mode.
8. Synchronizes dataset, preference, scenario, and persistence facades.
9. Renders application routes after startup completes.

## Browser storage

All application-owned keys use the `cft.` namespace.

| Key | Purpose |
| --- | --- |
| `cft.demoUsers` | Bundled demo-user envelope. |
| `cft.session` | Active eight-hour demo session. |
| `cft.dataset.meta` | Active dataset metadata. |
| `cft.dataset.content` | Active normalized dataset. |
| `cft.import.lastSummary` | Most recent sanitized import summary. |
| `cft.persistence.status` | Durable or memory-only persistence status. |
| `cft.notices` | System notices. |
| `cft.filters` | Search, filters, and sorting preferences. |
| `cft.thresholds` | Capacity thresholds. |
| `cft.scenarios` | Dataset-scoped scenarios. |

The reset operation removes keys beginning with `cft.` and leaves unrelated browser storage keys unchanged.

### Persistence behavior

- Durable data is normally stored in `localStorage`.
- A JSON-safe in-memory mirror is maintained for the current page session.
- Storage quota, security, or availability failures switch the adapter to memory mode.
- Memory-only changes are lost when the page session ends.
- Data is isolated by browser, profile, device, site origin, and browsing mode.
- Preview and production deployment origins do not share data.
- Rollbacks of deployed assets do not roll back browser-local data.

## Project structure

```text
capacity-forecast-tool/
├── .github/
│   └── workflows/
│       └── ci.yml
├── e2e/
│   └── app.e2e.spec.js
├── public/
│   └── favicon.svg
├── src/
│   ├── app/
│   │   └── router.jsx
│   ├── components/
│   │   ├── auth/
│   │   ├── dialogs/
│   │   ├── feedback/
│   │   ├── forms/
│   │   └── layout/
│   ├── config/
│   ├── constants/
│   ├── data/
│   ├── domain/
│   ├── facades/
│   ├── features/
│   │   ├── forecast/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── selectors/
│   │   │   ├── store/
│   │   │   └── utils/
│   │   ├── import/
│   │   │   └── components/
│   │   ├── scenarios/
│   │   │   ├── components/
│   │   │   └── store/
│   │   └── settings/
│   │       └── components/
│   ├── hooks/
│   ├── pages/
│   ├── platform/
│   │   └── storage/
│   ├── providers/
│   ├── repositories/
│   ├── services/
│   │   └── import/
│   ├── stores/
│   ├── test/
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── .env.example
├── CHANGELOG.md
├── DEPLOYMENT.md
├── eslint.config.js
├── index.html
├── package.json
├── playwright.config.js
├── postcss.config.js
├── tailwind.config.js
├── vercel.json
├── vite.config.js
└── vitest.config.js
```

## Testing strategy

### Unit and component tests

Vitest runs in JSDOM with Testing Library support. Tests cover:

- Authentication and session lifecycle
- Startup bootstrap and dataset recovery
- Browser storage and memory fallback
- Import parsing, normalization, validation, and activation
- Dataset filtering, searching, and sorting
- Capacity calculations and running totals
- Threshold settings
- Scenario immutability and comparison totals
- Local-data reset behavior
- Forecast components and keyboard interactions

### End-to-end tests

Playwright covers critical workflows including:

- Protected route redirects
- Invalid and valid demo sign-in
- Session persistence across refresh
- Demo dataset bootstrap
- Search and filter recovery
- Keyboard access to capacity details
- Threshold persistence
- Scenario isolation from the baseline
- Invalid and valid JSON imports
- Clean-state rebootstrap after local data removal

### Continuous integration

GitHub Actions runs on pull requests and pushes to `main` using Node.js 20:

```sh
npm ci
npm run lint
npm run coverage
npm run build
npx playwright install --with-deps chromium
npm run e2e
```

## Accessibility

The interface is designed for keyboard and assistive-technology use.

Implemented behavior includes:

- Semantic headings, forms, tables, lists, dialogs, alerts, and status regions.
- Accessible names for search, filters, allocation states, and capacity metrics.
- Keyboard-operable sorting, listboxes, dialogs, scenario controls, and allocation details.
- Focus containment and focus restoration for modal dialogs.
- Escape-key dismissal for supported dialogs and capacity popovers.
- Visible focus indicators.
- Color-independent capacity state labels and icons.
- Screen-reader-only table captions and supplementary labels.
- Live regions for notices, result counts, loading states, and validation feedback.
- Horizontally scrollable table regions that can receive keyboard focus.
- Responsive layouts for smaller viewports.

When changing components, preserve semantic roles, accessible names, focus order, keyboard behavior, and non-color state indicators.

## Troubleshooting

### The application does not start

1. Confirm Node.js 20 is installed:

   ```sh
   node --version
   ```

2. Reinstall exact dependencies:

   ```sh
   rm -rf node_modules
   npm ci
   ```

3. Run the production build to expose compile errors:

   ```sh
   npm run build
   ```

4. Check the browser console for blocked storage or JavaScript execution.

### Sign-in fails

- Use one of the bundled credentials exactly as documented.
- Usernames are trimmed and matched case-insensitively.
- Passwords are case-sensitive.
- Do not use enterprise credentials.
- If stored demo-user data is invalid, reload the application to allow startup recovery.
- To perform a full reset, remove the current site's `cft.*` values or use the application’s local-data removal action.

### `/forecast` redirects to `/login`

The route requires an active, unexpired demo session. Sessions expire eight hours after issue. Sign in again using a bundled demo account.

### Refreshing a route returns a hosting 404

The host must return `index.html` for client routes. Vercel configuration is included in `vercel.json`. Other static hosts require an equivalent SPA fallback.

### Browser changes are not retained

The application may be operating in memory-only mode because:

- Browser storage is disabled.
- Storage access is blocked by privacy settings.
- The browser storage quota was exceeded.
- The page is running in a restricted or private browsing context.
- A storage operation failed.

Keep the page open to retain memory-only state. Free browser storage or adjust site permissions before reloading.

### An imported file is rejected

Verify that:

- The extension is `.csv` or `.json`.
- The MIME type matches the extension.
- The file is no larger than 10 MiB.
- The source contains no more than 100,000 rows.
- JSON uses a supported shape.
- `schemaVersion` is `1.0.0`.
- Required fields are present.
- Numeric fields are finite and non-negative.
- Dates use `YYYY-MM-DD`.
- At least one work item is valid.
- Work-item and capacity identities are not duplicated.

The validation summary reports accepted and rejected row counts. A failed import does not replace the current dataset.

### Capacity displays as unavailable

Capacity is unavailable when:

- No capacity record matches the work item’s planning level and team.
- Effective capacity is zero.
- Capacity data is invalid or incomplete.

Add a capacity record for the same planning-level/team combination and re-import the dataset.

### Filters appear to produce unexpected results

- Multiple selections within one category use OR matching.
- Different categories use AND matching.
- Global search is applied in addition to dimension filters.
- Global search does not search planning level or estimated points.
- Use active filter chips, **Clear search**, or **Clear filters** to broaden results.

### Scenario changes appear in the forecast

An active scenario intentionally projects its changes into the forecast matrix. Open the scenario workspace and clear the active scenario selection to return to the baseline view. The baseline dataset itself is not modified.

### Playwright cannot launch Chromium

Install the configured browser and system dependencies:

```sh
npx playwright install --with-deps chromium
```

Then rerun:

```sh
npm run e2e
```

### The preview port is already in use

Stop the process using port `4173`, or start a manual preview on another port. The supplied Playwright configuration expects `127.0.0.1:4173`.

## Deployment

The application is a static Vite build and does not require APIs, serverless functions, databases, secrets, queues, or object storage.

Build the production assets with:

```sh
npm ci
npm run build
```

Deploy the generated `dist/` directory to a static host configured with an SPA route fallback.

Vercel-ready settings and detailed production checks, rollback guidance, browser-storage considerations, and smoke-test steps are documented in [DEPLOYMENT.md](DEPLOYMENT.md).

## Privacy and security limitations

- Authentication is demo-only and browser-local.
- Demo credentials are publicly recoverable from the client bundle.
- The sign-in page does not protect sensitive information.
- There is no authorization model or role-based access enforcement.
- There is no server-side session validation or revocation.
- Imported data is not uploaded by application code, but it is processed in the browser runtime.
- Browser extensions and endpoint software may be able to observe page content.
- Browser storage is accessible to JavaScript running on the same origin.
- A cross-site scripting vulnerability could expose browser-local data.
- Hosting analytics and logging must be reviewed independently.
- There is no encryption layer added by the application for stored datasets.
- Clearing site data, changing origins, switching browsers, or using private browsing may remove or isolate saved state.
- Browser-local data cannot be centrally backed up or restored.
- Scenarios and datasets are not collaborative.
- Multiple users sharing one browser profile and origin may share the same local workspace.
- Do not use production credentials, personal data, confidential planning data, regulated data, or security-sensitive information.
- Public deployments should use HTTPS and appropriate hosting access controls.
- Any future production authentication, shared persistence, synchronization, or server-side processing requires a separate architecture and security review.

## Additional documentation

- [CHANGELOG.md](CHANGELOG.md) — release history and delivered capabilities.
- [DEPLOYMENT.md](DEPLOYMENT.md) — build, deployment, rollback, CI/CD, storage, and production smoke-test guidance.

## License

This project is private and proprietary.

No license is granted to use, copy, modify, distribute, sublicense, publish, or create derivative works from this software except under an explicit written agreement with the project owner. All rights are reserved.