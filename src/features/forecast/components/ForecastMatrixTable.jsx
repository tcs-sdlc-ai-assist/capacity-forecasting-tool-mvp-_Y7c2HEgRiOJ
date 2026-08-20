import {
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import AllocationCell from './AllocationCell.jsx';
import {
  useForecastViewStore,
} from '../store/forecastViewStore.js';

const STICKY_COLUMN_CONFIG = Object.freeze({
  program: Object.freeze({
    headerClassName: 'sticky left-0 z-30 w-40 min-w-40 max-w-40',
    cellClassName: 'sticky left-0 z-10 w-40 min-w-40 max-w-40',
  }),
  epic: Object.freeze({
    headerClassName: 'sticky left-40 z-30 w-48 min-w-48 max-w-48',
    cellClassName: 'sticky left-40 z-10 w-48 min-w-48 max-w-48',
  }),
  feature: Object.freeze({
    headerClassName: 'sticky left-[22rem] z-30 w-80 min-w-80 max-w-80',
    cellClassName: 'sticky left-[22rem] z-10 w-80 min-w-80 max-w-80',
  }),
});

const IDENTITY_COLUMN_CONFIG = Object.freeze([
  Object.freeze({
    id: 'program',
    header: 'Program',
    accessorKey: 'program',
    className: 'w-40 min-w-40 max-w-40',
  }),
  Object.freeze({
    id: 'epic',
    header: 'Epic',
    accessorKey: 'epic',
    className: 'w-48 min-w-48 max-w-48',
  }),
  Object.freeze({
    id: 'feature',
    header: 'Feature',
    accessorKey: 'feature',
    className: 'w-80 min-w-80 max-w-80',
  }),
  Object.freeze({
    id: 'itemId',
    header: 'Item ID',
    accessorKey: 'itemId',
    className: 'w-32 min-w-32 max-w-32',
  }),
  Object.freeze({
    id: 'featureWorkType',
    header: 'Work type',
    accessorKey: 'featureWorkType',
    className: 'w-36 min-w-36 max-w-36',
  }),
  Object.freeze({
    id: 'owner',
    header: 'Owner',
    accessorKey: 'owner',
    className: 'w-40 min-w-40 max-w-40',
  }),
  Object.freeze({
    id: 'estimatedPoints',
    header: 'Estimated points',
    accessorKey: 'estimatedPoints',
    className: 'w-32 min-w-32 max-w-32 text-right',
  }),
  Object.freeze({
    id: 'team',
    header: 'Assigned teams',
    accessorFn: (row) => (
      Array.isArray(row?.team) ? row.team.join(', ') : ''
    ),
    className: 'w-44 min-w-44 max-w-44',
  }),
  Object.freeze({
    id: 'art',
    header: 'ART',
    accessorKey: 'art',
    className: 'w-40 min-w-40 max-w-40',
  }),
  Object.freeze({
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    className: 'w-32 min-w-32 max-w-32',
  }),
  Object.freeze({
    id: 'startDate',
    header: 'Start date',
    accessorKey: 'startDate',
    className: 'w-32 min-w-32 max-w-32',
  }),
  Object.freeze({
    id: 'endDate',
    header: 'End date',
    accessorKey: 'endDate',
    className: 'w-32 min-w-32 max-w-32',
  }),
]);

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const hasOwn = (value, key) => (
  isRecord(value)
  && Object.prototype.hasOwnProperty.call(value, key)
);

const normalizeText = (value) => (
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
);

const normalizeSorting = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const identifiers = new Set();

  return value
    .filter((sort) => (
      isRecord(sort)
      && typeof sort.id === 'string'
      && sort.id.trim()
    ))
    .map((sort) => ({
      id: sort.id.trim(),
      desc: Boolean(sort.desc),
    }))
    .filter((sort) => {
      if (identifiers.has(sort.id)) {
        return false;
      }

      identifiers.add(sort.id);
      return true;
    });
};

const resolveTeamName = (column) => {
  const explicitTeam = normalizeText(column?.team);

  if (explicitTeam) {
    return explicitTeam;
  }

  const id = normalizeText(column?.id);

  if (!id) {
    return '';
  }

  const prefixes = [
    'team:',
    'allocation:',
    'allocations.',
    'allocations:',
  ];
  const prefix = prefixes.find((candidate) => id.startsWith(candidate));

  return prefix ? id.slice(prefix.length).trim() : id;
};

const resolveTeams = (columns, rows) => {
  const teams = [];

  const addTeam = (value) => {
    const team = normalizeText(value);

    if (team && !teams.includes(team)) {
      teams.push(team);
    }
  };

  if (Array.isArray(columns)) {
    columns.forEach((column) => {
      if (
        typeof column === 'string'
        || typeof column === 'number'
      ) {
        addTeam(column);
      } else {
        addTeam(resolveTeamName(column));
      }
    });
  }

  if (teams.length === 0) {
    rows.forEach((row) => {
      if (isRecord(row?.capacityByTeam)) {
        Object.keys(row.capacityByTeam).forEach(addTeam);
      } else if (isRecord(row?.capacityMetrics)) {
        Object.keys(row.capacityMetrics).forEach(addTeam);
      }

      if (isRecord(row?.allocations)) {
        Object.keys(row.allocations).forEach(addTeam);
      }
    });
  }

  return teams;
};

const formatCellValue = (value, columnId) => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (
    columnId === 'estimatedPoints'
    && typeof value === 'number'
    && Number.isFinite(value)
  ) {
    const rounded = Math.round(value * 10) / 10;

    return Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1);
  }

  if (Array.isArray(value)) {
    return value.join(', ') || '—';
  }

  return String(value);
};

const resolveCapacityMetric = (row, team) => {
  if (
    isRecord(row?.capacityByTeam)
    && isRecord(row.capacityByTeam[team])
  ) {
    return row.capacityByTeam[team];
  }

  if (
    isRecord(row?.capacityMetrics)
    && isRecord(row.capacityMetrics[team])
  ) {
    return row.capacityMetrics[team];
  }

  if (Array.isArray(row?.capacityCells)) {
    return row.capacityCells.find((metric) => (
      normalizeText(metric?.team) === team
    )) ?? null;
  }

  return null;
};

const createIdentityColumns = () => (
  IDENTITY_COLUMN_CONFIG.map((config) => ({
    id: config.id,
    accessorKey: config.accessorKey,
    accessorFn: config.accessorFn,
    header: config.header,
    enableSorting: true,
    cell: ({ getValue }) => (
      <span
        className="block overflow-hidden text-ellipsis"
        title={normalizeText(getValue()) || undefined}
      >
        {formatCellValue(getValue(), config.id)}
      </span>
    ),
    meta: {
      className: config.className,
      identity: true,
      sticky: Boolean(STICKY_COLUMN_CONFIG[config.id]),
    },
  }))
);

const createTeamColumns = (teams) => (
  teams.map((team) => ({
    id: `team:${team}`,
    header: team,
    accessorFn: (row) => (
      hasOwn(row?.allocations, team)
        ? row.allocations[team]
        : null
    ),
    enableSorting: false,
    cell: ({
      getValue,
      row,
    }) => {
      const workItem = row.original;
      const metric = resolveCapacityMetric(workItem, team);
      const hasAllocation = hasOwn(workItem?.allocations, team);

      return (
        <AllocationCell
          value={hasAllocation ? getValue() : null}
          hasAllocation={hasAllocation}
          metric={metric}
          workItem={workItem}
          team={team}
          planningLevel={normalizeText(workItem?.planningLevel)}
          feature={normalizeText(workItem?.feature)}
        />
      );
    },
    meta: {
      className: 'w-36 min-w-36 max-w-36',
      identity: false,
      sticky: false,
      team,
    },
  }))
);

const getStickyConfig = (columnId) => (
  STICKY_COLUMN_CONFIG[columnId] ?? null
);

const getHeaderClassName = (column) => {
  const stickyConfig = getStickyConfig(column.id);
  const baseClassName = (
    'border-b border-r border-neutral-300 bg-neutral-100 '
    + 'px-3 py-3 text-left align-bottom text-xs font-semibold '
    + 'uppercase tracking-wide text-neutral-700 last:border-r-0'
  );

  if (stickyConfig) {
    return `${baseClassName} ${stickyConfig.headerClassName}`;
  }

  return `${baseClassName} relative z-20 ${column.columnDef.meta?.className ?? ''}`;
};

const getCellClassName = (column, rowIndex) => {
  const stickyConfig = getStickyConfig(column.id);
  const backgroundClassName = rowIndex % 2 === 0
    ? 'bg-neutral-0'
    : 'bg-neutral-50';
  const baseClassName = (
    'border-b border-r border-neutral-200 px-3 py-2.5 '
    + 'align-top text-sm text-neutral-800 last:border-r-0'
  );

  if (stickyConfig) {
    return `${baseClassName} ${stickyConfig.cellClassName} ${backgroundClassName}`;
  }

  return `${baseClassName} ${column.columnDef.meta?.className ?? ''} ${backgroundClassName}`;
};

const SortIndicator = ({ direction }) => (
  <span
    className="inline-flex w-3 shrink-0 justify-center text-teal-700"
    aria-hidden="true"
  >
    {direction === 'asc' ? (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10.53 5.47a.75.75 0 0 0-1.06 0l-4 4a.75.75 0 0 0 1.06 1.06L9.25 7.81v6.44a.75.75 0 0 0 1.5 0V7.81l2.72 2.72a.75.75 0 1 0 1.06-1.06l-4-4Z"
          clipRule="evenodd"
        />
      </svg>
    ) : direction === 'desc' ? (
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M9.47 14.53a.75.75 0 0 0 1.06 0l4-4a.75.75 0 1 0-1.06-1.06l-2.72 2.72V5.75a.75.75 0 0 0-1.5 0v6.44L6.53 9.47a.75.75 0 0 0-1.06 1.06l4 4Z"
          clipRule="evenodd"
        />
      </svg>
    ) : (
      <svg
        className="h-3.5 w-3.5 text-neutral-400"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M6.47 7.53a.75.75 0 0 0 1.06 0L10 5.06l2.47 2.47a.75.75 0 1 0 1.06-1.06l-3-3a.75.75 0 0 0-1.06 0l-3 3a.75.75 0 0 0 0 1.06ZM13.53 12.47a.75.75 0 0 0-1.06 0L10 14.94l-2.47-2.47a.75.75 0 0 0-1.06 1.06l3 3a.75.75 0 0 0 1.06 0l3-3a.75.75 0 0 0 0-1.06Z" />
      </svg>
    )}
  </span>
);

SortIndicator.propTypes = {
  direction: PropTypes.oneOf([
    false,
    'asc',
    'desc',
  ]).isRequired,
};

const resolveErrorMessage = (error) => {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return '';
};

/**
 * Renders the horizontally scrollable forecast allocation matrix.
 *
 * Identity columns are controlled by TanStack Table sorting state. Team
 * allocation columns are derived from the supplied dynamic column descriptors
 * and display cumulative capacity analytics for each visible row.
 *
 * @param {{
 *   rows?: object[],
 *   data?: object[],
 *   dynamicTeamColumns?: Array<object|string>,
 *   teamColumns?: Array<object|string>,
 *   teams?: Array<object|string>,
 *   sorting?: Array<{id: string, desc: boolean}>,
 *   onSortingChange?: Function,
 *   isLoading?: boolean,
 *   loading?: boolean,
 *   error?: object|string,
 *   title?: string,
 *   caption?: string,
 *   emptyMessage?: string,
 *   className?: string
 * }} props Matrix table properties.
 * @returns {import('react').ReactNode} Forecast matrix table.
 */
export const ForecastMatrixTable = ({
  rows = undefined,
  data = undefined,
  dynamicTeamColumns = undefined,
  teamColumns = undefined,
  teams = undefined,
  sorting = undefined,
  onSortingChange = null,
  isLoading = false,
  loading = false,
  error = null,
  title = 'Forecast matrix',
  caption = 'Forecast work items and team allocation capacity',
  emptyMessage = 'No work items are available for the current forecast view.',
  className = '',
}) => {
  const storeSorting = useForecastViewStore((state) => state.sorting);
  const setStoreSorting = useForecastViewStore(
    (state) => state.setSorting,
  );
  const [sortingError, setSortingError] = useState(null);
  const [isSorting, setIsSorting] = useState(false);
  const resolvedRows = Array.isArray(rows)
    ? rows
    : Array.isArray(data)
      ? data
      : [];
  const resolvedSorting = normalizeSorting(
    sorting ?? storeSorting,
  );
  const suppliedTeamColumns = dynamicTeamColumns
    ?? teamColumns
    ?? teams;
  const resolvedTeams = useMemo(
    () => resolveTeams(suppliedTeamColumns, resolvedRows),
    [resolvedRows, suppliedTeamColumns],
  );
  const columns = useMemo(
    () => [
      ...createIdentityColumns(),
      ...createTeamColumns(resolvedTeams),
    ],
    [resolvedTeams],
  );

  const handleSortingChange = (updater) => {
    if (isSorting) {
      return;
    }

    const callback = onSortingChange ?? setStoreSorting;

    setSortingError(null);
    setIsSorting(true);

    let result;

    try {
      result = callback(updater);
    } catch (callbackError) {
      setSortingError({
        code: 'FORECAST_MATRIX_SORT_FAILED',
        message: resolveErrorMessage(callbackError)
          || 'The forecast matrix sorting could not be updated.',
      });
      setIsSorting(false);
      return;
    }

    Promise.resolve(result)
      .then((resolvedResult) => {
        if (resolvedResult?.ok === false) {
          setSortingError({
            code: resolvedResult.error?.code
              ?? 'FORECAST_MATRIX_SORT_FAILED',
            message: resolveErrorMessage(resolvedResult.error)
              || 'The forecast matrix sorting could not be updated.',
          });
        }
      })
      .catch((callbackError) => {
        setSortingError({
          code: 'FORECAST_MATRIX_SORT_FAILED',
          message: resolveErrorMessage(callbackError)
            || 'The forecast matrix sorting could not be updated.',
        });
      })
      .finally(() => {
        setIsSorting(false);
      });
  };

  const table = useReactTable({
    data: resolvedRows,
    columns,
    state: {
      sorting: resolvedSorting,
    },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => (
      normalizeText(row?.recordId) || `forecast-row-${index}`
    ),
    enableMultiSort: true,
    sortDescFirst: false,
  });
  const suppliedErrorMessage = resolveErrorMessage(error);
  const isTableLoading = isLoading || loading;
  const columnCount = Math.max(1, table.getAllLeafColumns().length);

  return (
    <section
      className={`overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0 shadow-sm ${className}`}
      aria-labelledby="forecast-matrix-title"
      aria-busy={isTableLoading || isSorting || undefined}
    >
      <div className="flex flex-col gap-2 border-b border-neutral-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2
            id="forecast-matrix-title"
            className="text-lg font-semibold text-neutral-900"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            {resolvedRows.length} work item
            {resolvedRows.length === 1 ? '' : 's'}
            {' · '}
            {resolvedTeams.length} team
            {resolvedTeams.length === 1 ? '' : 's'}
          </p>
        </div>

        <p className="text-xs text-neutral-500">
          Scroll horizontally to view team allocations.
        </p>
      </div>

      {suppliedErrorMessage ? (
        <div
          className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-800 sm:px-6"
          role="alert"
        >
          {suppliedErrorMessage}
        </div>
      ) : null}

      {sortingError ? (
        <div
          className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-800 sm:px-6"
          role="alert"
        >
          {sortingError.message}
        </div>
      ) : null}

      <div
        className="max-w-full overflow-x-auto overscroll-x-contain"
        tabIndex={0}
        role="region"
        aria-label="Scrollable forecast matrix"
      >
        <table className="min-w-max border-separate border-spacing-0">
          <caption className="sr-only">{caption}</caption>

          <thead className="relative z-20">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const ariaSort = sorted === 'asc'
                    ? 'ascending'
                    : sorted === 'desc'
                      ? 'descending'
                      : canSort
                        ? 'none'
                        : undefined;
                  const sortLabel = sorted === 'asc'
                    ? 'Sort descending'
                    : sorted === 'desc'
                      ? 'Clear sorting'
                      : 'Sort ascending';

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={ariaSort}
                      className={getHeaderClassName(header.column)}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="flex min-h-8 w-full items-center justify-between gap-2 rounded-sm text-left transition-colors hover:text-teal-800 disabled:cursor-wait disabled:opacity-60"
                          disabled={isSorting}
                          title={sortLabel}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="min-w-0">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </span>
                          <SortIndicator direction={sorted} />
                        </button>
                      ) : (
                        <span className="block min-h-8 py-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {isTableLoading ? (
              <tr>
                <td
                  colSpan={columnCount}
                  className="border-b border-neutral-200 bg-neutral-0 px-6 py-12 text-center"
                >
                  <span
                    className="mx-auto block h-7 w-7 animate-spin rounded-full border-4 border-teal-100 border-t-teal-700"
                    aria-hidden="true"
                  />
                  <span
                    className="mt-3 block text-sm font-medium text-neutral-700"
                    role="status"
                  >
                    Loading forecast matrix…
                  </span>
                </td>
              </tr>
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className="group"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={getCellClassName(
                        cell.column,
                        rowIndex,
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columnCount}
                  className="bg-neutral-0 px-6 py-12 text-center text-sm text-neutral-600"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const teamColumnPropType = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.number,
  PropTypes.shape({
    id: PropTypes.string,
    team: PropTypes.string,
    header: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.func,
      PropTypes.node,
    ]),
    accessorFn: PropTypes.func,
  }),
]);

const sortingPropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  desc: PropTypes.bool,
});

ForecastMatrixTable.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object),
  data: PropTypes.arrayOf(PropTypes.object),
  dynamicTeamColumns: PropTypes.arrayOf(teamColumnPropType),
  teamColumns: PropTypes.arrayOf(teamColumnPropType),
  teams: PropTypes.arrayOf(teamColumnPropType),
  sorting: PropTypes.arrayOf(sortingPropType),
  onSortingChange: PropTypes.func,
  isLoading: PropTypes.bool,
  loading: PropTypes.bool,
  error: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      code: PropTypes.string,
      message: PropTypes.string,
    }),
  ]),
  title: PropTypes.string,
  caption: PropTypes.string,
  emptyMessage: PropTypes.string,
  className: PropTypes.string,
};

export default ForecastMatrixTable;