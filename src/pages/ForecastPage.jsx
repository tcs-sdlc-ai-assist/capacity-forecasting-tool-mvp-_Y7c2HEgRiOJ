import ForecastWorkspaceShell from '../features/forecast/components/ForecastWorkspaceShell.jsx';

/**
 * Composes the protected forecast route.
 *
 * @returns {import('react').ReactNode} Forecast route page.
 */
export const ForecastPage = () => (
  <ForecastWorkspaceShell
    title="Capacity forecast"
    description="Explore planned work, team allocations, and capacity across planning levels."
  />
);

export default ForecastPage;
