import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

// jsdom lacks these; the lightbox and scrolling call them. Like current browsers, the scroll
// methods return a Promise, so an effect that accidentally returns one fails in tests too.
window.scrollTo = (() => Promise.resolve()) as unknown as typeof window.scrollTo;
Element.prototype.scrollIntoView = (() =>
  Promise.resolve()) as unknown as Element["scrollIntoView"];
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * IntersectionObserver stand-in: nothing intersects until a test calls `intersectAll()`, which
 * mimics scrolling every observed element into view.
 */
const observers = new Set<FakeIntersectionObserver>();
class FakeIntersectionObserver {
  readonly elements = new Set<Element>();
  readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.add(this);
  }
  observe(element: Element) {
    this.elements.add(element);
  }
  unobserve(element: Element) {
    this.elements.delete(element);
  }
  disconnect() {
    this.elements.clear();
    observers.delete(this);
  }
  takeRecords() {
    return [];
  }
  fire() {
    const entries = [...this.elements].map(
      (target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry,
    );
    if (entries.length > 0) this.callback(entries, this as unknown as IntersectionObserver);
  }
}
globalThis.IntersectionObserver =
  FakeIntersectionObserver as unknown as typeof IntersectionObserver;

export function intersectAll() {
  for (const observer of [...observers]) observer.fire();
}
