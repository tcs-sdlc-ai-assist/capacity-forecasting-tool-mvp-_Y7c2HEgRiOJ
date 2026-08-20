export const SEARCHABLE_FIELDS = Object.freeze([
  'program',
  'epic',
  'itemId',
  'feature',
  'featureWorkType',
  'owner',
  'team',
  'art',
  'status',
]);

export const SEARCH_FIELDS = SEARCHABLE_FIELDS;

const normalizePrimitive = (value) => {
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
  ) {
    return '';
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return '';
  }

  const source = String(value);
  const unicodeNormalized = typeof source.normalize === 'function'
    ? source.normalize('NFKC')
    : source;

  return unicodeNormalized
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

/**
 * Normalizes a searchable field value.
 *
 * @param {*} value Searchable field value.
 * @returns {string} Normalized search text.
 */
export const normalizeSearchText = (value) => {
  if (Array.isArray(value)) {
    return value
      .map(normalizePrimitive)
      .filter(Boolean)
      .join(' ');
  }

  return normalizePrimitive(value);
};

/**
 * Builds normalized searchable text from approved work-item fields only.
 *
 * @param {object} workItem Work item to index for global search.
 * @returns {string} Normalized searchable text.
 */
export const buildSearchableText = (workItem = {}) => {
  if (
    workItem === null
    || typeof workItem !== 'object'
    || Array.isArray(workItem)
  ) {
    return '';
  }

  return SEARCHABLE_FIELDS
    .map((field) => normalizeSearchText(workItem[field]))
    .filter(Boolean)
    .join(' ');
};

export const createSearchableText = buildSearchableText;
export const getSearchableText = buildSearchableText;

/**
 * Determines whether a work item matches a global search term.
 *
 * @param {object} workItem Work item to search.
 * @param {*} searchTerm Global search term.
 * @returns {boolean} Whether the work item matches the search term.
 */
export const matchesGlobalSearch = (workItem, searchTerm) => {
  const normalizedSearchTerm = normalizeSearchText(searchTerm);

  if (!normalizedSearchTerm) {
    return true;
  }

  return buildSearchableText(workItem).includes(normalizedSearchTerm);
};

export const matchesSearch = matchesGlobalSearch;

export default buildSearchableText;