import {
  useCallback,
  useSyncExternalStore,
} from 'react';
import noticeCenterFacade from '../facades/noticeCenterFacade.js';

const createNoticesSnapshot = (notices) => Object.freeze(
  Array.isArray(notices)
    ? notices.map((notice) => Object.freeze({ ...notice }))
    : [],
);

const areNoticesEqual = (first, second) => (
  first.length === second.length
  && first.every((notice, index) => {
    const candidate = second[index];

    return (
      notice.id === candidate.id
      && notice.code === candidate.code
      && notice.severity === candidate.severity
      && notice.message === candidate.message
      && notice.dismissible === candidate.dismissible
      && notice.createdAt === candidate.createdAt
    );
  })
);

let noticesSnapshot = createNoticesSnapshot(
  noticeCenterFacade.getNotices(),
);

const updateNoticesSnapshot = (notices) => {
  const nextSnapshot = createNoticesSnapshot(notices);

  if (!areNoticesEqual(noticesSnapshot, nextSnapshot)) {
    noticesSnapshot = nextSnapshot;
    return true;
  }

  return false;
};

const getNoticesSnapshot = () => noticesSnapshot;

const subscribeToNotices = (listener) => {
  const unsubscribe = noticeCenterFacade.subscribeToNotices(
    (notices) => {
      updateNoticesSnapshot(notices);
      listener();
    },
  );
  const currentNotices = noticeCenterFacade.getNotices();

  if (updateNoticesSnapshot(currentNotices)) {
    listener();
  }

  return unsubscribe;
};

/**
 * Subscribes a React component to system notices and exposes a stable
 * dismissal action.
 *
 * @returns {{
 *   notices: object[],
 *   dismissNotice: Function
 * }} Current system notices and dismissal action.
 */
export const useNotices = () => {
  const notices = useSyncExternalStore(
    subscribeToNotices,
    getNoticesSnapshot,
    getNoticesSnapshot,
  );

  const dismissNotice = useCallback(
    (noticeId) => noticeCenterFacade.dismissNotice(noticeId),
    [],
  );

  return {
    notices,
    dismissNotice,
  };
};

export default useNotices;