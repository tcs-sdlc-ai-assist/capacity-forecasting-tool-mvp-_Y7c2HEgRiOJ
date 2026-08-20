import { STORAGE_KEYS } from '../constants/storageKeys.js';
import persistentStore from '../platform/storage/persistentStore.js';

const INVALID_PROFILES = 'INVALID_PROFILES';
const PROFILES_READ_FAILED = 'PROFILES_READ_FAILED';
const PROFILES_WRITE_FAILED = 'PROFILES_WRITE_FAILED';
const MAX_IMAGE_DATA_URL_LENGTH = 800000;

const createError = (code, message) => ({
  code,
  message,
});

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const isImageDataUrl = (value) => (
  typeof value === 'string'
  && value.startsWith('data:image/')
  && value.includes(';base64,')
  && value.length > 0
  && value.length <= MAX_IMAGE_DATA_URL_LENGTH
);

const normalizeUsername = (username) => (
  typeof username === 'string' ? username.trim().toLowerCase() : ''
);

const cloneProfiles = (profiles) => (
  Object.fromEntries(
    Object.entries(profiles).map(([username, imageDataUrl]) => (
      [username, imageDataUrl]
    )),
  )
);

const isProfileMap = (value) => {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).every(([username, imageDataUrl]) => (
    Boolean(normalizeUsername(username))
    && isImageDataUrl(imageDataUrl)
  ));
};

/**
 * Provides schema-aware access to per-account profile photos stored in the
 * browser.
 */
export class ProfileRepository {
  constructor(storage = persistentStore) {
    this.storage = storage;
    this.memoryOverride = false;
    this.memoryValue = {};
  }

  getProfiles() {
    if (this.memoryOverride) {
      return {
        ok: true,
        data: cloneProfiles(this.memoryValue),
      };
    }

    let result;

    try {
      result = this.storage.get(STORAGE_KEYS.PROFILES);
    } catch {
      return {
        ok: false,
        data: null,
        error: createError(
          PROFILES_READ_FAILED,
          'Profile photos could not be read from browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      return {
        ok: false,
        data: null,
        error: result?.error ?? createError(
          PROFILES_READ_FAILED,
          'Profile photos could not be read from browser storage.',
        ),
      };
    }

    if (result.data === null || result.data === undefined) {
      return {
        ok: true,
        data: {},
      };
    }

    if (!isProfileMap(result.data)) {
      return {
        ok: true,
        data: {},
      };
    }

    return {
      ok: true,
      data: cloneProfiles(result.data),
    };
  }

  /**
   * Returns the stored profile photo for a username.
   *
   * @param {string} username Account username.
   * @returns {{ok: boolean, data: string|null, error?: object}} Read result.
   */
  getImage(username) {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername) {
      return {
        ok: true,
        data: null,
      };
    }

    const result = this.getProfiles();

    if (!result.ok) {
      return {
        ok: false,
        data: null,
        error: result.error,
      };
    }

    return {
      ok: true,
      data: result.data[normalizedUsername] ?? null,
    };
  }

  saveProfiles(profiles) {
    let result;

    try {
      result = this.storage.set(STORAGE_KEYS.PROFILES, profiles);
    } catch {
      this.memoryOverride = true;
      this.memoryValue = cloneProfiles(profiles);

      return {
        ok: true,
        data: cloneProfiles(profiles),
        mode: 'memory',
        error: createError(
          PROFILES_WRITE_FAILED,
          'Profile photos could not be saved to browser storage.',
        ),
      };
    }

    if (!result?.ok) {
      this.memoryOverride = true;
      this.memoryValue = cloneProfiles(profiles);

      return {
        ok: true,
        data: cloneProfiles(profiles),
        mode: 'memory',
        error: result?.error ?? createError(
          PROFILES_WRITE_FAILED,
          'Profile photos could not be saved to browser storage.',
        ),
      };
    }

    this.memoryValue = cloneProfiles(profiles);
    this.memoryOverride = result.mode === 'memory';

    const response = {
      ok: true,
      data: cloneProfiles(profiles),
      mode: result.mode,
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }

  /**
   * Persists a profile photo for a username.
   *
   * @param {string} username Account username.
   * @param {string} imageDataUrl Image data URL.
   * @returns {{ok: boolean, data: string|null, error?: object}} Write result.
   */
  saveImage(username, imageDataUrl) {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_PROFILES,
          'A signed-in account is required to save a profile photo.',
        ),
      };
    }

    if (!isImageDataUrl(imageDataUrl)) {
      return {
        ok: false,
        data: null,
        error: createError(
          INVALID_PROFILES,
          'The selected image could not be saved as a profile photo.',
        ),
      };
    }

    const current = this.getProfiles();

    if (!current.ok) {
      return {
        ok: false,
        data: null,
        error: current.error,
      };
    }

    const nextProfiles = {
      ...current.data,
      [normalizedUsername]: imageDataUrl,
    };
    const result = this.saveProfiles(nextProfiles);

    if (!result.ok) {
      return result;
    }

    return {
      ...result,
      data: imageDataUrl,
    };
  }

  /**
   * Removes the stored profile photo for a username.
   *
   * @param {string} username Account username.
   * @returns {{ok: boolean, data: null, error?: object}} Remove result.
   */
  removeImage(username) {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername) {
      return {
        ok: true,
        data: null,
      };
    }

    const current = this.getProfiles();

    if (!current.ok) {
      return {
        ok: false,
        data: null,
        error: current.error,
      };
    }

    if (!(normalizedUsername in current.data)) {
      return {
        ok: true,
        data: null,
      };
    }

    const nextProfiles = { ...current.data };
    delete nextProfiles[normalizedUsername];

    const result = Object.keys(nextProfiles).length === 0
      ? this.clearProfiles()
      : this.saveProfiles(nextProfiles);

    if (!result.ok) {
      return {
        ok: false,
        data: null,
        error: result.error,
      };
    }

    return {
      ok: true,
      data: null,
      mode: result.mode,
    };
  }

  clearProfiles() {
    let result;

    try {
      result = this.storage.remove(STORAGE_KEYS.PROFILES);
    } catch {
      this.memoryOverride = true;
      this.memoryValue = {};

      return {
        ok: true,
        data: {},
        error: createError(
          PROFILES_WRITE_FAILED,
          'Profile photos could not be cleared from browser storage.',
        ),
      };
    }

    this.memoryValue = {};

    if (!result?.ok) {
      this.memoryOverride = true;

      return {
        ok: true,
        data: {},
        error: result?.error ?? createError(
          PROFILES_WRITE_FAILED,
          'Profile photos could not be cleared from browser storage.',
        ),
      };
    }

    this.memoryOverride = Boolean(result.error);

    const response = {
      ok: true,
      data: {},
    };

    if (result.error) {
      response.error = result.error;
    }

    return response;
  }
}

export const profileRepository = new ProfileRepository();

export default profileRepository;
