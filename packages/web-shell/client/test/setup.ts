import { vi } from 'vitest';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const globalWithDom = globalThis as typeof globalThis & {
  Element?: typeof Element;
  Range?: typeof Range;
  ResizeObserver?: typeof ResizeObserver;
};

function createEmptyDOMRect(): DOMRect {
  if (typeof DOMRect === 'function') {
    return new DOMRect(0, 0, 0, 0);
  }

  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function createEmptyDOMRectList(): DOMRectList {
  return {
    length: 0,
    item: () => null,
  } as DOMRectList;
}

// Tests assert en-US formatting. On Windows, Node takes the default locale
// from the system settings and ignores LANG (set in vitest.config.ts), so
// a call that names no locale is pinned to en-US here.
const TEST_LOCALE = 'en-US';
{
  const NumberFormat = Intl.NumberFormat;
  const DateTimeFormat = Intl.DateTimeFormat;
  const pinned = <T extends (...args: never[]) => unknown>(format: T): T =>
    new Proxy(format, {
      apply: (target, self, [locales, options]) =>
        Reflect.apply(target, self, [locales ?? TEST_LOCALE, options]),
      construct: (target, [locales, options]) =>
        Reflect.construct(target, [locales ?? TEST_LOCALE, options]),
    });
  Intl.NumberFormat = pinned(NumberFormat);
  Intl.DateTimeFormat = pinned(DateTimeFormat);
  const toLocale = <K extends string>(
    proto: Record<K, (locales?: unknown, options?: unknown) => string>,
    name: K,
  ) => {
    const original = proto[name];
    proto[name] = function (this: unknown, locales, options) {
      return original.call(this, locales ?? TEST_LOCALE, options);
    };
  };
  toLocale(Number.prototype as never, 'toLocaleString');
  toLocale(BigInt.prototype as never, 'toLocaleString');
  toLocale(Date.prototype as never, 'toLocaleString');
  toLocale(Date.prototype as never, 'toLocaleDateString');
  toLocale(Date.prototype as never, 'toLocaleTimeString');
}

// Node 25+ has its own Web Storage globals, which read as undefined without
// --localstorage-file and hide jsdom's: `window.localStorage.clear()` then
// throws. Hand the jsdom ones back.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom
  ?.window;
if (jsdomWindow) {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    if (globalThis[name] === undefined) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get: () => jsdomWindow[name],
      });
    }
  }
}

if (typeof globalWithDom.ResizeObserver === 'undefined') {
  globalWithDom.ResizeObserver = class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

if (
  typeof globalWithDom.Element !== 'undefined' &&
  !globalWithDom.Element.prototype.scrollIntoView
) {
  globalWithDom.Element.prototype.scrollIntoView = () => {};
}

// jsdom implements getClientRects()/getBoundingClientRect() on Element but not
// on Range. CodeMirror's `measureTextSize` calls them on a text Range from a
// `requestAnimationFrame` measure pass, so in jsdom that async callback throws
// `TypeError: getClientRects is not a function`. Vitest surfaces it as an
// *unhandled error* that fails the whole run (exit 1) even when every test
// passes — and because it depends on rAF timing, it's flaky. Return empty
// geometry (CodeMirror already handles the no-layout case).
if (typeof globalWithDom.Range !== 'undefined') {
  const rangePrototype = globalWithDom.Range.prototype as Range & {
    getBoundingClientRect?: () => DOMRect;
    getClientRects?: () => DOMRectList;
  };

  rangePrototype.getBoundingClientRect ??= createEmptyDOMRect;
  rangePrototype.getClientRects ??= createEmptyDOMRectList;
}

if (typeof navigator !== 'undefined' && !navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(() => Promise.resolve()),
    },
  });
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(() =>
        Promise.reject(new Error('getUserMedia is not mocked for this test')),
      ),
    },
  });
}
