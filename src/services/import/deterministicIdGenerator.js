export const DEFAULT_RECORD_ID_PREFIX = 'rec_';

export const FALLBACK_IDENTITY_FIELDS = Object.freeze([
  'planningLevel',
  'program',
  'epic',
  'feature',
  'featureWorkType',
  'team',
  'art',
  'startDate',
  'endDate',
]);

const FIELD_ALIASES = Object.freeze({
  recordId: Object.freeze([
    'recordId',
    'record_id',
    'record id',
  ]),
  itemId: Object.freeze([
    'itemId',
    'itemID',
    'item_id',
    'item id',
    'featureId',
    'feature_id',
    'feature id',
  ]),
  planningLevel: Object.freeze([
    'planningLevel',
    'planning_level',
    'planning level',
    'pi',
    'train',
  ]),
  program: Object.freeze([
    'program',
  ]),
  epic: Object.freeze([
    'epic',
  ]),
  feature: Object.freeze([
    'feature',
    'title',
  ]),
  featureWorkType: Object.freeze([
    'featureWorkType',
    'feature_work_type',
    'feature work type',
    'workType',
    'work_type',
    'work type',
  ]),
  team: Object.freeze([
    'team',
    'teams',
  ]),
  art: Object.freeze([
    'art',
  ]),
  startDate: Object.freeze([
    'startDate',
    'start_date',
    'start date',
  ]),
  endDate: Object.freeze([
    'endDate',
    'end_date',
    'end date',
  ]),
});

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const normalizeWhitespace = (value) => (
  value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

/**
 * Normalizes an identity value for deterministic comparison and hashing.
 *
 * @param {*} value Identity value to normalize.
 * @returns {string} Canonical identity value.
 */
export const normalizeIdentityValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return [...new Set(
      value
        .map(normalizeIdentityValue)
        .filter(Boolean),
    )]
      .sort()
      .join('\u001f');
  }

  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'boolean'
  ) {
    return '';
  }

  const stringValue = String(value);
  const unicodeNormalized = typeof stringValue.normalize === 'function'
    ? stringValue.normalize('NFKC')
    : stringValue;

  return normalizeWhitespace(unicodeNormalized).toLowerCase();
};

const normalizeSourceIdentifier = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }

  const stringValue = String(value);
  const unicodeNormalized = typeof stringValue.normalize === 'function'
    ? stringValue.normalize('NFKC')
    : stringValue;

  return normalizeWhitespace(unicodeNormalized);
};

const readFirstValue = (record, aliases) => {
  if (!isRecord(record)) {
    return undefined;
  }

  for (const alias of aliases) {
    if (
      Object.prototype.hasOwnProperty.call(record, alias)
      && record[alias] !== null
      && record[alias] !== undefined
    ) {
      return record[alias];
    }
  }

  return undefined;
};

const hash32 = (value, seed) => {
  let hash = seed >>> 0;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
};

/**
 * Produces a stable browser-safe 64-bit-equivalent hexadecimal hash.
 *
 * @param {string} value Canonical value to hash.
 * @returns {string} Sixteen-character lowercase hexadecimal hash.
 */
export const stableHash = (value) => {
  const source = typeof value === 'string' ? value : String(value ?? '');
  const first = hash32(source, 0x811c9dc5);
  const second = hash32(source, 0x9e3779b9);

  return (
    first.toString(16).padStart(8, '0')
    + second.toString(16).padStart(8, '0')
  );
};

const resolveRowRef = (rowRef) => {
  const candidate = isRecord(rowRef)
    ? rowRef.rowRef ?? rowRef.sourceRowNumber ?? rowRef.rowNumber
    : rowRef;
  const normalized = Number(candidate);

  return Number.isInteger(normalized) && normalized >= 1
    ? String(normalized)
    : 'unknown';
};

const createFallbackIdentity = (record, rowRef) => {
  const identity = FALLBACK_IDENTITY_FIELDS.map((field) => [
    field,
    normalizeIdentityValue(
      readFirstValue(record, FIELD_ALIASES[field]),
    ),
  ]);
  const hasIdentityValue = identity.some(([, value]) => Boolean(value));

  if (!hasIdentityValue) {
    return JSON.stringify([
      ['sourceRow', resolveRowRef(rowRef)],
    ]);
  }

  return JSON.stringify(identity);
};

const normalizePrefix = (prefix) => {
  if (typeof prefix !== 'string') {
    return DEFAULT_RECORD_ID_PREFIX;
  }

  const normalized = prefix
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 32);

  return normalized || DEFAULT_RECORD_ID_PREFIX;
};

/**
 * Generates stable record identifiers without incorporating owner or other
 * person-identifying fields into fallback hashes.
 */
export class DeterministicIdGenerator {
  constructor(prefix = DEFAULT_RECORD_ID_PREFIX) {
    const configuredPrefix = isRecord(prefix)
      ? prefix.prefix
      : prefix;

    this.prefix = normalizePrefix(configuredPrefix);
  }

  /**
   * Returns an explicit record ID or item ID when available. Otherwise, it
   * hashes normalized non-PII business identity fields.
   *
   * @param {object} rawRecord Source or normalized work-item record.
   * @param {number|object} [rowRef] Source row reference used only when all
   * identity fields are empty.
   * @returns {string} Stable record identifier.
   */
  generate(rawRecord = {}, rowRef = null) {
    const record = isRecord(rawRecord) ? rawRecord : {};
    const recordId = normalizeSourceIdentifier(
      readFirstValue(record, FIELD_ALIASES.recordId),
    );

    if (recordId && recordId.length <= 128) {
      return recordId;
    }

    const itemId = normalizeSourceIdentifier(
      readFirstValue(record, FIELD_ALIASES.itemId),
    );

    if (itemId && itemId.length <= 128) {
      return itemId;
    }

    const identity = itemId
      ? JSON.stringify([['itemId', normalizeIdentityValue(itemId)]])
      : createFallbackIdentity(record, rowRef);

    return `${this.prefix}${stableHash(identity)}`;
  }

  /**
   * Alias for generating a stable record identifier.
   *
   * @param {object} rawRecord Source or normalized work-item record.
   * @param {number|object} [rowRef] Source row reference.
   * @returns {string} Stable record identifier.
   */
  generateId(rawRecord, rowRef) {
    return this.generate(rawRecord, rowRef);
  }

  /**
   * Alias for generating a stable record identifier.
   *
   * @param {object} rawRecord Source or normalized work-item record.
   * @param {number|object} [rowRef] Source row reference.
   * @returns {string} Stable record identifier.
   */
  generateRecordId(rawRecord, rowRef) {
    return this.generate(rawRecord, rowRef);
  }
}

export const deterministicIdGenerator = new DeterministicIdGenerator();

/**
 * Generates a stable record identifier using the shared generator.
 *
 * @param {object} rawRecord Source or normalized work-item record.
 * @param {number|object} [rowRef] Source row reference.
 * @returns {string} Stable record identifier.
 */
export const generateDeterministicRecordId = (rawRecord, rowRef) => (
  deterministicIdGenerator.generate(rawRecord, rowRef)
);

export const generateRecordId = generateDeterministicRecordId;

export default deterministicIdGenerator;