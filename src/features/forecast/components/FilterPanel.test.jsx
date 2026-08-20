import {
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterPanel from './FilterPanel.jsx';

const FILTER_OPTIONS = Object.freeze({
  planningLevels: Object.freeze([
    'PI 2026.3',
    'PI 2026.4',
    'PI 2027.1',
  ]),
  owners: Object.freeze([
    'Alex Planner',
    'Taylor Planner',
    'Morgan Planner',
  ]),
  programs: Object.freeze([
    'Customer Experience',
    'Data Platform',
  ]),
  teams: Object.freeze([
    'Atlas',
    'Beacon',
  ]),
  arts: Object.freeze([
    'Customer ART',
    'Data ART',
  ]),
});

const renderFilterPanel = (props = {}) => render(
  <FilterPanel
    filterOptions={FILTER_OPTIONS}
    selectedPlanningLevel=""
    selectedOwners={[]}
    selectedPrograms={[]}
    selectedTeams={[]}
    selectedArts={[]}
    {...props}
  />,
);

describe('FilterPanel', () => {
  it('searches and selects a planning level using the keyboard', async () => {
    const user = userEvent.setup();
    const onPlanningLevelChange = vi.fn(() => ({
      ok: true,
      data: null,
    }));

    renderFilterPanel({
      onPlanningLevelChange,
    });

    const planningLevelInput = screen.getByRole('combobox', {
      name: 'Planning level',
    });

    await user.click(planningLevelInput);
    await user.type(planningLevelInput, '2027.1');

    const listbox = screen.getByRole('listbox', {
      name: 'Planning level options',
    });

    expect(within(listbox).getByRole('option', {
      name: 'PI 2027.1',
    })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', {
      name: 'PI 2026.3',
    })).not.toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => {
      expect(onPlanningLevelChange).toHaveBeenCalledWith(
        'PI 2027.1',
      );
    });

    expect(planningLevelInput).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('updates a multi-value filter and the complete filter state from keyboard interaction', async () => {
    const user = userEvent.setup();
    const onOwnersChange = vi.fn(() => ({
      ok: true,
      data: null,
    }));
    const onFiltersChange = vi.fn(() => ({
      ok: true,
      data: null,
    }));

    renderFilterPanel({
      selectedPlanningLevel: 'PI 2026.3',
      selectedOwners: ['Alex Planner'],
      selectedPrograms: ['Customer Experience'],
      selectedTeams: ['Atlas'],
      selectedArts: ['Customer ART'],
      onOwnersChange,
      onFiltersChange,
    });

    const ownerInput = screen.getByRole('combobox', {
      name: 'Owner',
    });

    await user.click(ownerInput);
    await user.type(ownerInput, 'Taylor');

    expect(screen.getByRole('option', {
      name: /Taylor Planner/,
    })).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => {
      expect(onOwnersChange).toHaveBeenCalledWith([
        'Alex Planner',
        'Taylor Planner',
      ]);
      expect(onFiltersChange).toHaveBeenCalledWith({
        selectedPlanningLevels: ['PI 2026.3'],
        selectedOwners: [
          'Alex Planner',
          'Taylor Planner',
        ],
        selectedPrograms: ['Customer Experience'],
        selectedTeams: ['Atlas'],
        selectedArts: ['Customer ART'],
      });
    });

    expect(ownerInput).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');

    expect(ownerInput).toHaveAttribute('aria-expanded', 'false');
  });

  it('selects all available values and clears the current multi-select filter', async () => {
    const user = userEvent.setup();
    const onOwnersChange = vi.fn(() => ({
      ok: true,
      data: null,
    }));

    renderFilterPanel({
      selectedOwners: ['Alex Planner'],
      onOwnersChange,
    });

    const ownerInput = screen.getByRole('combobox', {
      name: 'Owner',
    });

    await user.click(ownerInput);

    let listbox = screen.getByRole('listbox', {
      name: 'Owner options',
    });
    const selectAllButton = within(
      listbox.parentElement,
    ).getByRole('button', {
      name: 'Select all',
    });

    await user.click(selectAllButton);

    await waitFor(() => {
      expect(onOwnersChange).toHaveBeenNthCalledWith(1, [
        'Alex Planner',
        'Taylor Planner',
        'Morgan Planner',
      ]);
    });

    listbox = screen.getByRole('listbox', {
      name: 'Owner options',
    });
    const clearButton = within(
      listbox.parentElement,
    ).getByRole('button', {
      name: 'Clear',
    });

    await waitFor(() => {
      expect(clearButton).toBeEnabled();
    });

    await user.click(clearButton);

    await waitFor(() => {
      expect(onOwnersChange).toHaveBeenNthCalledWith(2, []);
    });
  });

  it('shows an empty option state and ignores keyboard selection when no values are available', async () => {
    const user = userEvent.setup();
    const onOwnersChange = vi.fn();

    renderFilterPanel({
      filterOptions: {
        ...FILTER_OPTIONS,
        owners: [],
      },
      onOwnersChange,
    });

    const ownerInput = screen.getByRole('combobox', {
      name: 'Owner',
    });

    await user.click(ownerInput);

    const listbox = screen.getByRole('listbox', {
      name: 'Owner options',
    });

    expect(
      within(listbox).getByText('No options available.'),
    ).toBeInTheDocument();
    expect(
      within(listbox.parentElement).getByRole('button', {
        name: 'Select all',
      }),
    ).toBeDisabled();

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onOwnersChange).not.toHaveBeenCalled();
    expect(ownerInput).toHaveAttribute('aria-expanded', 'true');
  });
});