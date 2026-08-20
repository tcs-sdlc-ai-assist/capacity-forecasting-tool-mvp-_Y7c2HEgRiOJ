import {
  FILTER_DIMENSIONS,
  NO_RESULTS_REASONS,
  matchesForecastFilters,
  selectActiveFilterChips,
  selectActiveFilterCount,
  selectDimensionFilteredWorkItems,
  selectDynamicTeamColumns,
  selectFilterOptionDescriptors,
  selectFilterOptions,
  selectFilteredWorkItems,
  selectHasActiveCriteria,
  selectHasActiveFilters,
  selectHasActiveSearch,
  selectNoResultsState,
  selectNormalizedFilters,
  selectSearchedWorkItems,
  selectSortedWorkItems,
  selectVisibleWorkItems,
} from './datasetSelectors.js';
import { SEARCHABLE_FIELDS } from '../utils/search.js';
import {
  ASCENDING_PROGRAM_SORTING_FIXTURE,
  DESCENDING_POINTS_SORTING_FIXTURE,
  MULTI_COLUMN_SORTING_FIXTURE,
  createSortingDatasetFixture,
  createValidCapacityRecordFixture,
  createValidDatasetFixture,
  createValidWorkItemFixture,
} from '../../../test/fixtures.js';

const SEARCH_FIELD_VALUES = Object.freeze({
  program: 'Unique Search Program',
  epic: 'Unique Search Epic',
  itemId: 'UNIQUE-SEARCH-ITEM',
  feature: 'Unique Search Feature',
  featureWorkType: 'Unique Search Work Type',
  owner: 'Unique Search Owner',
  team: Object.freeze(['Unique Search Team']),
  art: 'Unique Search ART',
  status: 'Unique Search Status',
});

const getRecordIds = (workItems) => (
  workItems.map((workItem) => workItem.recordId)
);

describe('datasetSelectors', () => {
  describe('global search derivation', () => {
    it.each(SEARCHABLE_FIELDS)(
      'matches work items by the searchable %s field',
      (field) => {
        const fieldValue = SEARCH_FIELD_VALUES[field];
        const workItem = createValidWorkItemFixture({
          recordId: `search-${field}`,
          [field]: fieldValue,
        });
        const searchTerm = Array.isArray(fieldValue)
          ? fieldValue[0].toUpperCase()
          : fieldValue.toUpperCase();

        const result = selectSearchedWorkItems(
          [workItem],
          searchTerm,
        );

        expect(result).toEqual([workItem]);
      },
    );

    it('applies case-insensitive global search after dimension filters', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectFilteredWorkItems(dataset, {
        selectedPrograms: ['Alpha Program'],
        searchTerm: 'SECOND FEATURE',
      });

      expect(getRecordIds(result)).toEqual([
        'sorting-item-002',
      ]);
    });

    it('does not search fields outside the approved searchable fields', () => {
      const workItem = createValidWorkItemFixture({
        recordId: 'search-excluded-field',
        planningLevel: 'Hidden Planning Needle',
      });

      const result = selectSearchedWorkItems(
        [workItem],
        'Hidden Planning Needle',
      );

      expect(result).toEqual([]);
      expect(SEARCHABLE_FIELDS).not.toContain('planningLevel');
      expect(SEARCHABLE_FIELDS).not.toContain('estimatedPoints');
    });

    it('returns every work item when the search term is blank', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectSearchedWorkItems(dataset, '   ');

      expect(result).toEqual(dataset.workItems);
    });
  });

  describe('filter option and dynamic team-column derivation', () => {
    it('derives sorted unique options from work items and capacity records', () => {
      const baseDataset = createValidDatasetFixture();
      const dataset = createValidDatasetFixture({
        workItems: baseDataset.workItems,
        capacityRecords: [
          ...baseDataset.capacityRecords,
          createValidCapacityRecordFixture({
            team: 'Cirrus',
          }),
        ],
      });

      const options = selectFilterOptions(dataset);
      const descriptors = selectFilterOptionDescriptors(dataset);

      expect(options).toEqual({
        planningLevels: ['PI 2026.3'],
        owners: ['Test Manager', 'Test Planner'],
        programs: ['Customer Experience', 'Data Platform'],
        teams: ['Atlas', 'Beacon', 'Cirrus'],
        arts: ['Customer ART', 'Data ART'],
      });
      expect(descriptors.teams).toEqual([
        {
          value: 'Atlas',
          label: 'Atlas',
          count: 1,
        },
        {
          value: 'Beacon',
          label: 'Beacon',
          count: 1,
        },
        {
          value: 'Cirrus',
          label: 'Cirrus',
          count: 0,
        },
      ]);
    });

    it('orders planning level options as current PI, trains, then future PIs', () => {
      const options = selectFilterOptions({
        workItems: [
          createValidWorkItemFixture({
            recordId: 'pl-2027',
            planningLevel: '2027 PI 1',
          }),
          createValidWorkItemFixture({
            recordId: 'pl-manufacturing',
            planningLevel: 'Manufacturing Train',
          }),
          createValidWorkItemFixture({
            recordId: 'pl-current',
            planningLevel: 'Current PI',
          }),
          createValidWorkItemFixture({
            recordId: 'pl-tss',
            planningLevel: 'TSS Train',
          }),
          createValidWorkItemFixture({
            recordId: 'pl-2026',
            planningLevel: '2026 PI 4',
          }),
          createValidWorkItemFixture({
            recordId: 'pl-distribution',
            planningLevel: 'Distribution Train',
          }),
        ],
        capacityRecords: [],
      });

      expect(options.planningLevels).toEqual([
        'Current PI',
        'Distribution Train',
        'Manufacturing Train',
        'TSS Train',
        '2026 PI 4',
        '2027 PI 1',
      ]);
    });

    it('creates one TanStack-compatible allocation column per dataset team', () => {
      const baseDataset = createValidDatasetFixture();
      const dataset = createValidDatasetFixture({
        workItems: baseDataset.workItems,
        capacityRecords: [
          ...baseDataset.capacityRecords,
          createValidCapacityRecordFixture({
            team: 'Cirrus',
          }),
        ],
      });

      const columns = selectDynamicTeamColumns(dataset);
      const atlasColumn = columns.find((column) => (
        column.team === 'Atlas'
      ));
      const cirrusColumn = columns.find((column) => (
        column.team === 'Cirrus'
      ));

      expect(columns.map((column) => ({
        id: column.id,
        team: column.team,
        header: column.header,
      }))).toEqual([
        {
          id: 'team:Atlas',
          team: 'Atlas',
          header: 'Atlas',
        },
        {
          id: 'team:Beacon',
          team: 'Beacon',
          header: 'Beacon',
        },
        {
          id: 'team:Cirrus',
          team: 'Cirrus',
          header: 'Cirrus',
        },
      ]);
      expect(atlasColumn.accessorFn(dataset.workItems[0])).toBe(20);
      expect(cirrusColumn.accessorFn(dataset.workItems[0])).toBeNull();
    });

    it('returns empty options and columns for an invalid dataset source', () => {
      expect(selectFilterOptions(null)).toEqual({
        planningLevels: [],
        owners: [],
        programs: [],
        teams: [],
        arts: [],
      });
      expect(selectDynamicTeamColumns(null)).toEqual([]);
    });
  });

  describe('dimension filtering', () => {
    it('selects work items for one planning level', () => {
      const matchingItem = createValidWorkItemFixture({
        recordId: 'planning-level-match',
        planningLevel: 'PI 2026.3',
      });
      const otherItem = createValidWorkItemFixture({
        recordId: 'planning-level-other',
        planningLevel: 'PI 2026.4',
      });

      const result = selectDimensionFilteredWorkItems(
        [matchingItem, otherItem],
        {
          selectedPlanningLevels: ['PI 2026.4'],
        },
      );

      expect(getRecordIds(result)).toEqual([
        'planning-level-other',
      ]);
    });

    it('uses OR behavior for multiple values in the same category', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectDimensionFilteredWorkItems(dataset, {
        selectedOwners: [
          'Alex Planner',
          'Taylor Planner',
        ],
      });

      expect(getRecordIds(result)).toEqual([
        'sorting-item-003',
        'sorting-item-002',
        'sorting-item-004',
      ]);
    });

    it('uses AND behavior across different filter categories', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectDimensionFilteredWorkItems(dataset, {
        selectedPrograms: ['Alpha Program'],
        selectedOwners: ['Alex Planner'],
        selectedTeams: ['Beacon'],
      });

      expect(getRecordIds(result)).toEqual([
        'sorting-item-002',
      ]);
    });

    it('matches a work item when any team satisfies a team selection', () => {
      const workItem = createValidWorkItemFixture({
        team: ['Atlas', 'Beacon'],
      });

      expect(matchesForecastFilters(workItem, {
        selectedTeams: ['Beacon', 'Cirrus'],
      })).toBe(true);
      expect(matchesForecastFilters(workItem, {
        selectedTeams: ['Cirrus'],
      })).toBe(false);
    });

    it('normalizes filter aliases, duplicate selections, and sorting entries', () => {
      const normalized = selectNormalizedFilters({
        searchQuery: 'forecast term',
        planningLevels: [
          ' PI 2026.3 ',
          'PI 2026.3',
        ],
        owners: ['Test Planner', 'Test Planner'],
        sorting: [
          {
            id: ' program ',
            desc: false,
          },
          {
            id: 'program',
            desc: true,
          },
          {
            id: '',
            desc: false,
          },
        ],
      });

      expect(normalized).toEqual({
        searchTerm: 'forecast term',
        selectedPlanningLevels: ['PI 2026.3'],
        selectedOwners: ['Test Planner'],
        selectedPrograms: [],
        selectedTeams: [],
        selectedArts: [],
        sorting: [
          {
            id: 'program',
            desc: false,
          },
        ],
      });
    });
  });

  describe('sorting derivation', () => {
    it('sorts text columns in ascending order while preserving ties', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectSortedWorkItems(
        dataset,
        ASCENDING_PROGRAM_SORTING_FIXTURE,
      );

      expect(getRecordIds(result)).toEqual([
        'sorting-item-001',
        'sorting-item-002',
        'sorting-item-004',
        'sorting-item-003',
      ]);
    });

    it('sorts numeric columns in descending order', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectSortedWorkItems(
        dataset,
        DESCENDING_POINTS_SORTING_FIXTURE,
      );

      expect(getRecordIds(result)).toEqual([
        'sorting-item-001',
        'sorting-item-003',
        'sorting-item-002',
        'sorting-item-004',
      ]);
    });

    it('applies controlled multi-column sorting in priority order', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectVisibleWorkItems(
        dataset,
        {},
        MULTI_COLUMN_SORTING_FIXTURE,
      );

      expect(getRecordIds(result)).toEqual([
        'sorting-item-002',
        'sorting-item-001',
        'sorting-item-004',
        'sorting-item-003',
      ]);
    });

    it('sorts dynamic team allocations and places missing values last', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectSortedWorkItems(dataset, [
        {
          id: 'team:Atlas',
          desc: false,
        },
      ]);

      expect(getRecordIds(result)).toEqual([
        'sorting-item-003',
        'sorting-item-001',
        'sorting-item-002',
        'sorting-item-004',
      ]);
    });

    it('returns source order when sorting is empty or invalid', () => {
      const dataset = createSortingDatasetFixture();

      expect(selectSortedWorkItems(dataset, [])).toEqual(
        dataset.workItems,
      );
      expect(selectSortedWorkItems(dataset, [
        {
          id: '',
          desc: true,
        },
      ])).toEqual(dataset.workItems);
    });
  });

  describe('active filter chips', () => {
    it('creates labelled removable chips in dimension order', () => {
      const filters = {
        selectedPlanningLevels: ['PI 2026.3'],
        selectedOwners: ['Alex Planner', 'Taylor Planner'],
        selectedPrograms: ['Alpha Program'],
        selectedTeams: ['Beacon'],
        selectedArts: ['Data ART'],
        searchTerm: 'feature',
      };

      const chips = selectActiveFilterChips(filters);

      expect(chips).toEqual([
        {
          id: 'selectedPlanningLevels:PI 2026.3',
          filterKey: 'selectedPlanningLevels',
          field: 'planningLevel',
          category: 'Planning level',
          label: 'PI 2026.3',
          value: 'PI 2026.3',
        },
        {
          id: 'selectedOwners:Alex Planner',
          filterKey: 'selectedOwners',
          field: 'owner',
          category: 'Owner',
          label: 'Alex Planner',
          value: 'Alex Planner',
        },
        {
          id: 'selectedOwners:Taylor Planner',
          filterKey: 'selectedOwners',
          field: 'owner',
          category: 'Owner',
          label: 'Taylor Planner',
          value: 'Taylor Planner',
        },
        {
          id: 'selectedPrograms:Alpha Program',
          filterKey: 'selectedPrograms',
          field: 'program',
          category: 'Program',
          label: 'Alpha Program',
          value: 'Alpha Program',
        },
        {
          id: 'selectedTeams:Beacon',
          filterKey: 'selectedTeams',
          field: 'team',
          category: 'Team',
          label: 'Beacon',
          value: 'Beacon',
        },
        {
          id: 'selectedArts:Data ART',
          filterKey: 'selectedArts',
          field: 'art',
          category: 'ART',
          label: 'Data ART',
          value: 'Data ART',
        },
      ]);
      expect(selectActiveFilterCount(filters)).toBe(6);
      expect(selectHasActiveFilters(filters)).toBe(true);
      expect(selectHasActiveSearch(filters)).toBe(true);
      expect(selectHasActiveCriteria(filters)).toBe(true);
      expect(FILTER_DIMENSIONS.map((dimension) => dimension.key)).toEqual([
        'selectedPlanningLevels',
        'selectedOwners',
        'selectedPrograms',
        'selectedTeams',
        'selectedArts',
      ]);
    });

    it('does not create chips for search text or empty selections', () => {
      const filters = {
        searchTerm: 'feature',
        selectedOwners: [],
      };

      expect(selectActiveFilterChips(filters)).toEqual([]);
      expect(selectActiveFilterCount(filters)).toBe(0);
      expect(selectHasActiveFilters(filters)).toBe(false);
      expect(selectHasActiveSearch(filters)).toBe(true);
      expect(selectHasActiveCriteria(filters)).toBe(true);
    });
  });

  describe('zero-result detection', () => {
    it('identifies an empty dataset separately from filtered zero results', () => {
      const result = selectNoResultsState([], {});

      expect(result).toEqual({
        isNoResults: true,
        reason: NO_RESULTS_REASONS.EMPTY_DATASET,
        message: 'The active dataset does not contain any work items.',
        hasDataset: true,
        hasSourceRows: false,
        hasActiveFilters: false,
        hasActiveSearch: false,
        hasActiveCriteria: false,
        sourceRowCount: 0,
        visibleRowCount: 0,
      });
    });

    it('identifies no matches caused by active search and filters', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectNoResultsState(dataset, {
        searchTerm: 'missing searchable value',
        selectedPrograms: ['Alpha Program'],
      });

      expect(result).toMatchObject({
        isNoResults: true,
        reason: NO_RESULTS_REASONS.NO_MATCHES,
        message: 'No work items match the active filters and search.',
        hasDataset: true,
        hasSourceRows: true,
        hasActiveFilters: true,
        hasActiveSearch: true,
        hasActiveCriteria: true,
        sourceRowCount: 4,
        visibleRowCount: 0,
      });
    });

    it('reports available results when criteria match work items', () => {
      const dataset = createSortingDatasetFixture();

      const result = selectNoResultsState(dataset, {
        selectedPrograms: ['Alpha Program'],
      });

      expect(result).toMatchObject({
        isNoResults: false,
        reason: null,
        message: '',
        hasSourceRows: true,
        hasActiveFilters: true,
        hasActiveSearch: false,
        visibleRowCount: 2,
      });
    });
  });
});