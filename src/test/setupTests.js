import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
} from 'vitest';

const clearBrowserStorage = () => {
  try {
    window.localStorage.clear();
  } catch {
    // Tests must remain isolated when browser storage is unavailable.
  }

  try {
    window.sessionStorage.clear();
  } catch {
    // Tests must remain isolated when browser storage is unavailable.
  }
};

class ResizeObserverPolyfill {
  observe() {}

  unobserve() {}

  disconnect() {}
}

class IntersectionObserverPolyfill {
  constructor() {
    this.root = null;
    this.rootMargin = '0px';
    this.thresholds = [0];
  }

  observe() {}

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }
}

if (typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = ResizeObserverPolyfill;
}

if (typeof window.IntersectionObserver !== 'function') {
  window.IntersectionObserver = IntersectionObserverPolyfill;
}

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return true;
      },
    }),
  });
}

if (
  typeof window.Element?.prototype?.scrollIntoView
  !== 'function'
) {
  Object.defineProperty(window.Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value() {},
  });
}

if (typeof window.requestAnimationFrame !== 'function') {
  window.requestAnimationFrame = (callback) => (
    window.setTimeout(() => callback(window.performance.now()), 0)
  );
}

if (typeof window.cancelAnimationFrame !== 'function') {
  window.cancelAnimationFrame = (handle) => {
    window.clearTimeout(handle);
  };
}

beforeEach(() => {
  clearBrowserStorage();
});

afterEach(() => {
  cleanup();
  clearBrowserStorage();
});