/**
 * The window as the scroll element: the page's scroll position less `scrollMargin`, the window's own
 * size on resize (an orientation change), right-to-left horizontal scrolling of the window, and the
 * removal of the resize listener on detach. happy-dom's window has fixed scroll values, so the test
 * writes them and records `scrollTo`.
 */
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { scrollable } from "./helpers/scrollable";

/**
 * Spies this file creates. They are restored here, not with vi.restoreAllMocks: that would also undo
 * the console spies of vitest.setup.ts, which check the console after each test.
 */
const spies: Array<MockInstance> = [];
function spyOnWindow<K extends "scrollTo" | "addEventListener" | "removeEventListener">(
  name: K,
): MockInstance {
  const spy = vi.spyOn(window, name);
  spies.push(spy);
  return spy;
}

type WindowProperty = "scrollX" | "scrollY" | "innerWidth" | "innerHeight";

const saved = new Map<WindowProperty, PropertyDescriptor | undefined>();

/** Makes a window property writable so the test can move the page. */
function setWindowValue(name: WindowProperty, value: number): void {
  if (!saved.has(name)) saved.set(name, Object.getOwnPropertyDescriptor(window, name));
  Object.defineProperty(window, name, { value, writable: true, configurable: true });
}

beforeEach(() => {
  setWindowValue("scrollX", 0);
  setWindowValue("scrollY", 0);
  setWindowValue("innerWidth", 320);
  setWindowValue("innerHeight", 200);
});

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor === undefined) delete (window as unknown as Record<string, unknown>)[name];
    else Object.defineProperty(window, name, descriptor);
  }
  saved.clear();
  for (const spy of spies.splice(0)) spy.mockRestore();
});

describe("the window as the scroll element", () => {
  it("[VIR-68] the offset is the page's scroll position less the scroll margin, so a list below a header starts at zero", () => {
    setWindowValue("scrollY", 250);
    const virtualizer = scrollable({
      count: 100,
      estimateSize: 10,
      scrollMargin: 100,
      getScrollElement: () => window,
    });
    const detach = virtualizer.attach();
    expect(virtualizer.offset()).toBe(150);
    expect(virtualizer.viewportSize()).toBe(200);
    detach();
  });

  it("[VIR-69] scrollToOffset scrolls the page to the offset plus the scroll margin", () => {
    const scrollTo = spyOnWindow("scrollTo").mockImplementation(() => undefined);
    const virtualizer = scrollable({
      count: 100,
      estimateSize: 10,
      scrollMargin: 100,
      getScrollElement: () => window,
    });
    const detach = virtualizer.attach();
    virtualizer.scrollToOffset(40);
    expect(virtualizer.offset()).toBe(40);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 140, behavior: "auto" });
    detach();
  });

  it("[VIR-70] an orientation change (a window resize) updates the viewport of a vertical and of a horizontal list", () => {
    const vertical = scrollable({
      count: 100,
      estimateSize: 10,
      getScrollElement: () => window,
    });
    const horizontal = scrollable({
      count: 100,
      horizontal: true,
      estimateSize: 10,
      getScrollElement: () => window,
    });
    const detachVertical = vertical.attach();
    const detachHorizontal = horizontal.attach();
    expect(vertical.viewportSize()).toBe(200);
    expect(horizontal.viewportSize()).toBe(320);
    // Rotate: the window gets wider and shorter.
    setWindowValue("innerWidth", 600);
    setWindowValue("innerHeight", 120);
    window.dispatchEvent(new Event("resize"));
    expect(vertical.viewportSize()).toBe(120);
    expect(horizontal.viewportSize()).toBe(600);
    // 120px shows 12 rows; the default overscan of 1 adds one below.
    expect(vertical.items()).toHaveLength(13);
    detachVertical();
    detachHorizontal();
  });

  it("[VIR-71] a right-to-left horizontal list on the window writes a negative left and reads it back as a distance from the start", () => {
    const scrollTo = spyOnWindow("scrollTo").mockImplementation(() => undefined);
    const virtualizer = scrollable({
      count: 100,
      horizontal: true,
      rtl: true,
      estimateSize: 10,
      getScrollElement: () => window,
    });
    const detach = virtualizer.attach();
    virtualizer.scrollToOffset(30);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: -30, behavior: "auto" });
    setWindowValue("scrollX", -70);
    window.dispatchEvent(new Event("scroll"));
    expect(virtualizer.offset()).toBe(70);
    detach();
  });

  it("[VIR-72] detach removes the window's resize listener and the scroll listener", () => {
    const add = spyOnWindow("addEventListener");
    const remove = spyOnWindow("removeEventListener");
    const virtualizer = scrollable({
      count: 10,
      estimateSize: 10,
      getScrollElement: () => window,
    });
    const detach = virtualizer.attach();
    const resizeAdded = add.mock.calls.filter(([type]) => type === "resize");
    const scrollAdded = add.mock.calls.filter(([type]) => type === "scroll");
    expect(resizeAdded).toHaveLength(1);
    expect(scrollAdded).toHaveLength(1);
    detach();
    expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(["resize", "scroll"]);
    expect(remove.mock.calls.find(([type]) => type === "resize")?.[1]).toBe(resizeAdded[0]?.[1]);
  });
});
