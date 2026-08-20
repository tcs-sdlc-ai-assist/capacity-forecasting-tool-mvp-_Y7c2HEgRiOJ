import bootstrapService from './bootstrapService.js';

export const BOOTSTRAP_READINESS_STATUSES = Object.freeze({
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  READY: 'ready',
  FAILED: 'failed',
});

export const BOOTSTRAP_ORCHESTRATOR_ERROR_CODES = Object.freeze({
  INITIALIZATION_UNAVAILABLE: 'BOOTSTRAP_INITIALIZATION_UNAVAILABLE',
  INITIALIZATION_FAILED: 'BOOTSTRAP_INITIALIZATION_FAILED',
  INVALID_RESULT: 'BOOTSTRAP_INVALID_RESULT',
});

const createError = (code, message) => ({
  code,
  message,
});

const createFailureResult = (code, message) => ({
  ok: false,
  data: null,
  error: createError(code, message),
  warnings: [],
});

const isBootstrapResult = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && typeof value.ok === 'boolean'
);

const cloneWarnings = (warnings) => (
  Array.isArray(warnings)
    ? warnings.map((warning) => (
      warning !== null && typeof warning === 'object'
        ? { ...warning }
        : warning
    ))
    : []
);

const cloneError = (error) => (
  error !== null && typeof error === 'object'
    ? { ...error }
    : null
);

/**
 * Coordinates one-time application startup and publishes readiness snapshots.
 */
export class BootstrapOrchestrator {
  constructor(startupService = bootstrapService) {
    this.bootstrapService = startupService;
    this.initializationPromise = null;
    this.result = null;
    this.listeners = new Set();
    this.readinessStatus = BOOTSTRAP_READINESS_STATUSES.IDLE;
  }

  /**
   * Executes startup once and returns the shared initialization promise.
   *
   * Concurrent and subsequent callers receive the same promise, ensuring that
   * demo-user seeding, session restoration, dataset recovery, and preference
   * initialization are not repeated during the application lifetime.
   *
   * @returns {Promise<{
   *   ok: boolean,
   *   data: object|null,
   *   warnings?: object[],
   *   error?: object
   * }>} Bootstrap result containing hydrated application state.
   */
  initialize() {
    if (!this.initializationPromise) {
      this.initializationPromise = this.runInitialization();
    }

    return this.initializationPromise;
  }

  /**
   * Returns the current application-readiness snapshot.
   *
   * @returns {{
   *   status: string,
   *   initialized: boolean,
   *   ready: boolean,
   *   session: object|null,
   *   dataset: object|null,
   *   datasetMetadata: object|null,
   *   datasetStatus: string|null,
   *   persistenceMode: string|null,
   *   warnings: object[],
   *   error: object|null
   * }} Current readiness state.
   */
  getSnapshot() {
    const data = this.result?.data ?? null;
    const initialized = (
      this.readinessStatus === BOOTSTRAP_READINESS_STATUSES.READY
      || this.readinessStatus === BOOTSTRAP_READINESS_STATUSES.FAILED
    );

    return {
      status: this.readinessStatus,
      initialized,
      ready: this.readinessStatus === BOOTSTRAP_READINESS_STATUSES.READY,
      session: data?.session ?? null,
      dataset: data?.dataset ?? null,
      datasetMetadata: data?.datasetMetadata ?? data?.metadata ?? null,
      datasetStatus: data?.datasetStatus ?? null,
      persistenceMode: data?.persistenceMode ?? null,
      warnings: cloneWarnings(this.result?.warnings),
      error: cloneError(this.result?.error),
    };
  }

  /**
   * Alias for retrieving the current readiness snapshot.
   *
   * @returns {object} Current readiness state.
   */
  getReadinessSnapshot() {
    return this.getSnapshot();
  }

  /**
   * Returns the settled bootstrap result, or null before initialization ends.
   *
   * @returns {object|null} Bootstrap result.
   */
  getResult() {
    return this.result;
  }

  /**
   * Subscribes to application-readiness changes.
   *
   * @param {Function} listener Readiness listener.
   * @param {{fireImmediately?: boolean}} options Subscription options.
   * @returns {Function} Unsubscribe callback.
   */
  subscribe(listener, options = {}) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    this.listeners.add(listener);

    if (options?.fireImmediately === true) {
      listener(this.getSnapshot());
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Alias for subscribing to readiness changes.
   *
   * @param {Function} listener Readiness listener.
   * @param {{fireImmediately?: boolean}} options Subscription options.
   * @returns {Function} Unsubscribe callback.
   */
  subscribeToReadiness(listener, options = {}) {
    return this.subscribe(listener, options);
  }

  async runInitialization() {
    this.readinessStatus = BOOTSTRAP_READINESS_STATUSES.INITIALIZING;
    this.publishReadiness();

    let result;

    try {
      if (typeof this.bootstrapService?.initialize !== 'function') {
        result = createFailureResult(
          BOOTSTRAP_ORCHESTRATOR_ERROR_CODES.INITIALIZATION_UNAVAILABLE,
          'The application startup service is unavailable.',
        );
      } else {
        result = await this.bootstrapService.initialize();
      }
    } catch {
      result = createFailureResult(
        BOOTSTRAP_ORCHESTRATOR_ERROR_CODES.INITIALIZATION_FAILED,
        'The application could not complete startup.',
      );
    }

    if (!isBootstrapResult(result)) {
      result = createFailureResult(
        BOOTSTRAP_ORCHESTRATOR_ERROR_CODES.INVALID_RESULT,
        'The application startup service returned an invalid result.',
      );
    }

    this.result = result;
    this.readinessStatus = result.ok
      ? BOOTSTRAP_READINESS_STATUSES.READY
      : BOOTSTRAP_READINESS_STATUSES.FAILED;
    this.publishReadiness();

    return result;
  }

  publishReadiness() {
    const snapshot = this.getSnapshot();

    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // A failing consumer must not interrupt application initialization.
      }
    });
  }
}

export const bootstrapOrchestrator = new BootstrapOrchestrator();

export default bootstrapOrchestrator;