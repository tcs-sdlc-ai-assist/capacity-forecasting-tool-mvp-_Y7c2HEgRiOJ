import { getDemoUsers } from '../data/demoUsers.js';
import {
  getMockDataset,
  getMockDatasetMetadata,
} from '../data/mockDataset.js';

/**
 * Supplies independent copies of the bundled, known-good bootstrap fixtures.
 */
export class MockDatasetProvider {
  /**
   * Returns fresh copies of the bundled synthetic demo users.
   *
   * @returns {Array<{
   *   username: string,
   *   password: string,
   *   displayName: string
   * }>} Independent demo-user records.
   */
  getDemoUsers() {
    return getDemoUsers();
  }

  /**
   * Alias for retrieving bundled synthetic demo users.
   *
   * @returns {Array<{
   *   username: string,
   *   password: string,
   *   displayName: string
   * }>} Independent demo-user records.
   */
  getUsers() {
    return this.getDemoUsers();
  }

  /**
   * Returns a fresh canonical copy of the bundled mock dataset.
   *
   * @returns {object} Independent normalized dataset.
   */
  getDataset() {
    return getMockDataset();
  }

  /**
   * Alias for retrieving the bundled mock dataset.
   *
   * @returns {object} Independent normalized dataset.
   */
  getMockDataset() {
    return this.getDataset();
  }

  /**
   * Returns a fresh canonical copy of the bundled dataset metadata.
   *
   * @returns {object} Independent dataset metadata.
   */
  getDatasetMetadata() {
    return getMockDatasetMetadata();
  }

  /**
   * Alias for retrieving bundled mock dataset metadata.
   *
   * @returns {object} Independent dataset metadata.
   */
  getMetadata() {
    return this.getDatasetMetadata();
  }

  /**
   * Returns all known-good bootstrap fixtures as independent values.
   *
   * @returns {{
   *   users: object[],
   *   dataset: object,
   *   metadata: object
   * }} Bundled bootstrap data.
   */
  getBootstrapData() {
    return {
      users: this.getDemoUsers(),
      dataset: this.getDataset(),
      metadata: this.getDatasetMetadata(),
    };
  }
}

export const mockDatasetProvider = new MockDatasetProvider();

export default mockDatasetProvider;