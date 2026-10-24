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
