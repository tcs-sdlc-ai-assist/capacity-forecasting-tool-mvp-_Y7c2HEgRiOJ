import { STORAGE_PREFIX } from '../../constants/storageKeys.js';
import BrowserStorageAdapter from './browserStorageAdapter.js';

/**
 * Stable persistence facade used by browser-local repositories.
 */
export class PersistentStore {
  constructor(storageAdapter = new BrowserStorageAdapter()) {
    this.storageAdapter = storageAdapter;
  }

  /**
   * Reads a JSON-compatible value from storage.
   *
   * @param {string} key Storage key.
   * @returns {{ok: boolean, data: *|null, error?: object}} Read result.
   */
  get(key) {
    return this.storageAdapter.getJson(key);
  }

  /**
   * Writes a JSON-compatible value to storage.
   *
   * @param {string} key Storage key.
   * @param {*} value JSON-compatible value.
   * @returns {{ok: boolean, mode: 'localStorage'|'memory', error?: object}}
   * Write result.
   */
  set(key, value) {
    return this.storageAdapter.setJson(key, value);
  }

  /**
   * Removes a value from storage.
   *
   * @param {string} key Storage key.
   * @returns {{ok: boolean, removed: boolean, error?: object}} Remove result.
   */
  remove(key) {
    return this.storageAdapter.remove(key);
  }

  /**
   * Lists storage keys matching a prefix.
   *
   * @param {string} prefix Storage key prefix.
   * @returns {{ok: boolean, keys: string[], error?: object}} List result.
   */
  list(prefix = '') {
    return this.storageAdapter.list(prefix);
  }

  /**
   * Clears values within the CFT-owned namespace.
   *
   * @param {string} namespace CFT namespace prefix.
   * @returns {{ok: boolean, removedKeys: string[], error?: object}}
   * Clear result.
   */
  clearNamespace(namespace = STORAGE_PREFIX) {
    return this.storageAdapter.clearNamespace(namespace);
  }
}

export const persistentStore = new PersistentStore();

export default persistentStore;