export class MemoryFallbackStore {
  constructor() {
    this.store = new Map();
  }

  /**
   * Retrieves a value from volatile storage.
   *
   * @param {string} key Storage key.
   * @returns {*} Stored value, or null when the key does not exist.
   */
  get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  /**
   * Stores a value for the lifetime of this store instance.
   *
   * @param {string} key Storage key.
   * @param {*} value Value to store.
   * @returns {void}
   */
  set(key, value) {
    this.store.set(key, value);
  }

  /**
   * Removes a value from volatile storage.
   *
   * @param {string} key Storage key.
   * @returns {boolean} Whether an existing value was removed.
   */
  remove(key) {
    return this.store.delete(key);
  }

  /**
   * Lists keys matching a namespace prefix.
   *
   * @param {string} namespace Namespace prefix.
   * @returns {string[]} Matching storage keys.
   */
  list(namespace = '') {
    if (typeof namespace !== 'string') {
      return [];
    }

    return Array.from(this.store.keys()).filter((key) => (
      typeof key === 'string' && key.startsWith(namespace)
    ));
  }

  /**
   * Removes all values whose keys match a namespace prefix.
   *
   * @param {string} namespace Namespace prefix.
   * @returns {string[]} Keys that were removed.
   */
  clearNamespace(namespace) {
    const keys = this.list(namespace);

    keys.forEach((key) => {
      this.store.delete(key);
    });

    return keys;
  }

  /**
   * Alias for clearing keys by prefix.
   *
   * @param {string} prefix Storage key prefix.
   * @returns {string[]} Keys that were removed.
   */
  clearByPrefix(prefix) {
    return this.clearNamespace(prefix);
  }
}

export default MemoryFallbackStore;