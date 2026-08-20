import noticeCenterStore from '../stores/noticeCenterStore.js';

export const NOTICE_CENTER_FACADE_ERROR_CODES = Object.freeze({
  DISMISS_UNAVAILABLE: 'NOTICE_CENTER_DISMISS_UNAVAILABLE',
  DISMISS_FAILED: 'NOTICE_CENTER_DISMISS_FAILED',
});

const createError = (code, message) => ({
  code,
  message,
});

const cloneNotices = (notices) => (
  Array.isArray(notices)
    ? notices
      .filter((notice) => (
        notice !== null
        && typeof notice === 'object'
        && !Array.isArray(notice)
      ))
      .map((notice) => ({ ...notice }))
    : []
);

const readStateNotices = (state) => (
  cloneNotices(state?.notices ?? state?.items)
);

/**
 * Exposes the stable public interface for browser-local system notices.
 */
export class NoticeCenterFacade {
  constructor(systemNoticeStore = noticeCenterStore) {
    this.noticeCenterStore = systemNoticeStore;
  }

  /**
   * Returns independent copies of the current system notices.
   *
   * @returns {object[]} Current sanitized system notices.
   */
  getNotices() {
    try {
      if (typeof this.noticeCenterStore?.getNotices === 'function') {
        return cloneNotices(this.noticeCenterStore.getNotices());
      }

      if (typeof this.noticeCenterStore?.getState === 'function') {
        return readStateNotices(this.noticeCenterStore.getState());
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Dismisses a notice when it exists and is marked dismissible.
   *
   * @param {string} noticeId Notice identifier.
   * @returns {{ok: boolean, removed: boolean, error?: object}}
   * Dismissal result.
   */
  dismissNotice(noticeId) {
    let dismiss;

    try {
      if (typeof this.noticeCenterStore?.dismissNotice === 'function') {
        dismiss = this.noticeCenterStore.dismissNotice.bind(
          this.noticeCenterStore,
        );
      } else {
        const state = this.noticeCenterStore?.getState?.();

        if (typeof state?.dismissNotice === 'function') {
          dismiss = state.dismissNotice;
        } else if (typeof state?.dismiss === 'function') {
          dismiss = state.dismiss;
        }
      }
    } catch {
      return {
        ok: false,
        removed: false,
        error: createError(
          NOTICE_CENTER_FACADE_ERROR_CODES.DISMISS_FAILED,
          'The system notice could not be dismissed.',
        ),
      };
    }

    if (typeof dismiss !== 'function') {
      return {
        ok: false,
        removed: false,
        error: createError(
          NOTICE_CENTER_FACADE_ERROR_CODES.DISMISS_UNAVAILABLE,
          'The system notice dismissal service is unavailable.',
        ),
      };
    }

    try {
      const result = dismiss(noticeId);

      if (
        result === null
        || typeof result !== 'object'
        || typeof result.ok !== 'boolean'
      ) {
        return {
          ok: false,
          removed: false,
          error: createError(
            NOTICE_CENTER_FACADE_ERROR_CODES.DISMISS_FAILED,
            'The system notice could not be dismissed.',
          ),
        };
      }

      return result;
    } catch {
      return {
        ok: false,
        removed: false,
        error: createError(
          NOTICE_CENTER_FACADE_ERROR_CODES.DISMISS_FAILED,
          'The system notice could not be dismissed.',
        ),
      };
    }
  }

  /**
   * Subscribes to system notice changes.
   *
   * @param {Function} listener Notice collection listener.
   * @param {{fireImmediately?: boolean}} options Subscription options.
   * @returns {Function} Unsubscribe callback.
   */
  subscribeToNotices(listener, options = {}) {
    if (typeof listener !== 'function') {
      return () => {};
    }

    const safeListener = (notices, previousNotices = []) => {
      try {
        listener(
          cloneNotices(notices),
          cloneNotices(previousNotices),
        );
      } catch {
        // A failing consumer must not interrupt notice-center updates.
      }
    };

    try {
      if (
        typeof this.noticeCenterStore?.subscribeToNotices === 'function'
      ) {
        const unsubscribe = this.noticeCenterStore.subscribeToNotices(
          safeListener,
          options,
        );

        return typeof unsubscribe === 'function'
          ? unsubscribe
          : () => {};
      }

      if (typeof this.noticeCenterStore?.subscribe !== 'function') {
        return () => {};
      }

      if (options?.fireImmediately === true) {
        safeListener(this.getNotices(), []);
      }

      const unsubscribe = this.noticeCenterStore.subscribe(
        (state, previousState) => {
          const notices = readStateNotices(state);
          const previousNotices = readStateNotices(previousState);

          if (
            state?.notices !== previousState?.notices
            || state?.items !== previousState?.items
          ) {
            safeListener(notices, previousNotices);
          }
        },
      );

      return typeof unsubscribe === 'function'
        ? unsubscribe
        : () => {};
    } catch {
      return () => {};
    }
  }

  /**
   * Alias for subscribing to system notice changes.
   *
   * @param {Function} listener Notice collection listener.
   * @param {{fireImmediately?: boolean}} options Subscription options.
   * @returns {Function} Unsubscribe callback.
   */
  subscribe(listener, options = {}) {
    return this.subscribeToNotices(listener, options);
  }
}

export const noticeCenterFacade = new NoticeCenterFacade();

export const getNotices = () => noticeCenterFacade.getNotices();

export const dismissNotice = (noticeId) => (
  noticeCenterFacade.dismissNotice(noticeId)
);

export const subscribeToNotices = (listener, options = {}) => (
  noticeCenterFacade.subscribeToNotices(listener, options)
);

export default noticeCenterFacade;