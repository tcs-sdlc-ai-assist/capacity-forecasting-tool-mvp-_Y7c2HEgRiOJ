import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForecastMatrixTable from './ForecastMatrixTable.jsx';
import {
  createValidWorkItemFixture,
} from '../../../test/fixtures.js';

const createMatrixRow = () => {
  const workItem = createValidWorkItemFixture({
    recordId: 'matrix-work-item-001',
    planningLevel: 'PI 2026.3',
    program: 'Customer Experience',
    epic: 'Account modernization',
    itemId: 'MATRIX-101',
    feature: 'Self-service account recovery',
    featureWorkType: 'Business Feature',
    owner: 'Capacity Planner',
    estimatedPoints: 20,
    team: ['Atlas'],
    art: 'Customer ART',
    status: 'Committed',
    allocations: {
      Atlas: 20,
    },
  });

  const atlasMetric = {
    planningLevel: workItem.planningLevel,
    team: 'Atlas',
    recordId: workItem.recordId,
    rowIndex: 0,
    allocationPoints: 20,
    allocatedPoints: 20,
    cumulativeAllocationPoints: 20,
    capacityPoints: 40,
    effectiveCapacityPoints: 40,
    differentialPoints: 20,
    variancePoints: 20,
    utilizationPercent: 50,
    utilization: 50,
    state: 'healthy',
    capacityState: 'healthy',
    isAvailable: true,
    hasCapacityRecord: true,
  };

  return {
    ...workItem,
    capacityCells: [atlasMetric],
    capacityByTeam: {
      Atlas: atlasMetric,
    },
    capacityMetrics: {
      Atlas: atlasMetric,
    },
  };
};

const TEAM_COLUMNS = Object.freeze([
  Object.freeze({
    id: 'team:Atlas',
    team: 'Atlas',
    header: 'Atlas',
  }),
  Object.freeze({
    id: 'team:Beacon',
    team: 'Beacon',
    header: 'Beacon',
  }),
]);

describe('ForecastMatrixTable', () => {
  it('renders a semantic matrix with generated team columns and labelled allocation states', () => {
    render(
      <ForecastMatrixTable
        rows={[createMatrixRow()]}
        dynamicTeamColumns={TEAM_COLUMNS}
        sorting={[]}
        caption="Capacity allocation test matrix"
      />,
    );

    const table = screen.getByRole('table', {
      name: 'Capacity allocation test matrix',
    });

    expect(table).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {
      name: 'Atlas',
    })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {
      name: 'Beacon',
    })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader')).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);

    const availableAllocation = screen.getByRole('button', {
      name: 'Atlas: 20 allocation points, healthy.',
    });

    expect(availableAllocation).toBeEnabled();
    expect(availableAllocation).toHaveTextContent('20');
    expect(availableAllocation).toHaveTextContent('Healthy');
    expect(availableAllocation.tabIndex).toBe(0);

    availableAllocation.focus();
    expect(availableAllocation).toHaveFocus();

    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(
      'Beacon: Allocation unavailable.',
    )).not.toBeInTheDocument();
  });

  it('applies sticky positioning classes to the leading identity headers and cells', () => {
    render(
      <ForecastMatrixTable
        rows={[createMatrixRow()]}
        dynamicTeamColumns={TEAM_COLUMNS}
        sorting={[]}
      />,
    );

    const programHeader = screen.getByRole('columnheader', {
      name: 'Program',
    });

    expect(programHeader).toHaveClass('sticky', 'left-0', 'z-40');

    const programCell = screen.getByText('Customer Experience')
      .closest('td');

    expect(programCell).toHaveClass('sticky', 'left-0', 'z-10');
  });

  it('forwards sorting updates when a sortable identity header is activated', async () => {
    const user = userEvent.setup();
    const onSortingChange = vi.fn(() => ({
      ok: true,
      data: null,
    }));

    render(
      <ForecastMatrixTable
        rows={[createMatrixRow()]}
        dynamicTeamColumns={TEAM_COLUMNS}
        sorting={[]}
        onSortingChange={onSortingChange}
      />,
    );

    const programHeader = screen.getByRole('columnheader', {
      name: 'Program',
    });
    const sortButton = within(programHeader).getByRole('button', {
      name: 'Program',
    });

    expect(programHeader).toHaveAttribute('aria-sort', 'none');
    expect(sortButton).toHaveAttribute('title', 'Sort ascending');

    await user.click(sortButton);

    await waitFor(() => {
      expect(onSortingChange).toHaveBeenCalledTimes(1);
    });

    const sortingUpdate = onSortingChange.mock.calls[0][0];
    const nextSorting = typeof sortingUpdate === 'function'
      ? sortingUpdate([])
      : sortingUpdate;

    expect(nextSorting).toEqual([
      {
        id: 'program',
        desc: false,
      },
    ]);
  });

  it('renders an accessible empty state when no work items are available', () => {
    render(
      <ForecastMatrixTable
        rows={[]}
        dynamicTeamColumns={TEAM_COLUMNS}
        sorting={[]}
        emptyMessage="No matching matrix rows."
      />,
    );

    expect(screen.getByRole('table', {
      name: 'Forecast work items and team allocation capacity',
    })).toBeInTheDocument();
    expect(screen.getByText('No matching matrix rows.')).toBeInTheDocument();
    expect(screen.queryByLabelText(
      'Atlas: Allocation unavailable.',
    )).not.toBeInTheDocument();
  });
});