import { useDataset } from '../hooks/useDataset.js';
import ForecastWorkspaceShell from '../features/forecast/components/ForecastWorkspaceShell.jsx';

const isSyntheticDataset = (metadata) => (
  metadata?.sourceType === 'mock'
  || metadata?.sourceType === 'recovered-mock'
);

/**
 * Composes the protected forecast route and discloses bundled synthetic data.
 *
 * @returns {import('react').ReactNode} Forecast route page.
 */
export const ForecastPage = () => {
  const { metadata } = useDataset();
  const showDemoDisclosure = isSyntheticDataset(metadata);

  return (
    <div className="space-y-6">
      {showDemoDisclosure ? (
        <section
          className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-teal-950 shadow-xs"
          aria-labelledby="forecast-demo-data-title"
          role="note"
        >
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-teal-700"
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

            <div className="min-w-0">
              <h2
                id="forecast-demo-data-title"
                className="text-sm font-semibold"
              >
                Synthetic demo data
              </h2>
              <p className="mt-1 text-sm leading-5 text-teal-900">
                This workspace uses bundled fictional programs, people,
                teams, and capacity values for demonstration purposes. It
                does not contain production planning data.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <ForecastWorkspaceShell
        title="Capacity forecast"
        description="Explore planned work, team allocations, and capacity across planning levels."
      />
    </div>
  );
};

export default ForecastPage;