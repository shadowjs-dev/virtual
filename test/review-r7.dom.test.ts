/**
 * Review round 7: a row measured above the viewport keeps the visible rows where they are (the scroll
 * offset follows the size change), and a smooth `scrollToIndex` keeps its re-alignment until the scroll
 * settles.
 */
import { useSignal } from "@shadow-js/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVirtualizer } from "../src/index";
import { scrollable } from "./helpers/scrollable";

/** A scroll element 100px tall whose scroll position is a plain writable property. */
function scroller(): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: 0 });
  Object.defineProperty(element, "clientHeight", { value: 100 });
  Object.defineProperty(element, "scrollTop", { value: 0, writable: true });
  Object.defineProperty(element, "scrollLeft", { value: 0, writable: true });
  document.body.append(element);
  return element;
}

/** A connected row element that reports the given height. */
function row(index: number, height: number): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("data-index", String(index));
  element.getBoundingClientRect = () => ({ width: 0, height, top: 0, left: 0 }) as DOMRect;
  document.body.append(element);
  return element;
}

/** Scrolls the element as the user would. */
function scrollTo(element: HTMLElement, top: number): void {
  element.scrollTop = top;
  element.dispatchEvent(new Event("scroll"));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("scroll compensation for a row measured above the viewport", () => {
  const make = (element: HTMLElement, extra: { adjustScrollOnMeasure?: boolean } = {}) => {
    const list = createVirtualizer({
      count: 100,
      estimateSize: 20,
      overscan: 0,
      getScrollElement: () => element,
      ...extra,
    });
    const detach = list.attach();
    scrollTo(element, 200);
    return { list, detach };
  };

  it("[VIR-R7-1] a row that starts above the offset moves the offset by its size change, so the visible rows stay", () => {
    const element = scroller();
    const scrollToSpy = vi.spyOn(element, "scrollTo").mockImplementation(() => undefined);
    const { list, detach } = make(element);
    const visible = list.items().find((item) => item.index === 12);
    expect(visible?.start).toBe(240);
    // Row 3 (starts at 60, above the offset 200) is measured 50px taller than its estimate.
    list.measureElement(row(3, 70));
    expect(list.offset()).toBe(250);
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 250, behavior: "instant" });
    const after = list.items().find((item) => item.index === 12);
    // The row is 50px lower in the list and 50px further scrolled: the same place on screen.
    expect((after?.start ?? 0) - list.offset()).toBe((visible?.start ?? 0) - 200);
    // Measured again with a smaller size: the offset follows back.
    list.measureElement(row(3, 40));
    expect(list.offset()).toBe(220);
    detach();
  });

  it("[VIR-R7-1] a row at or below the offset, and a row measured for the first time at the same size, leave it alone", () => {
    const element = scroller();
    const scrollToSpy = vi.spyOn(element, "scrollTo").mockImplementation(() => undefined);
    const { list, detach } = make(element);
    list.measureElement(row(10, 40));
    list.measureElement(row(15, 60));
    list.measureElement(row(2, 20));
    expect(list.offset()).toBe(200);
    expect(scrollToSpy).not.toHaveBeenCalled();
    detach();
  });

  it("[VIR-R7-1] adjustScrollOnMeasure false keeps the offset where it is", () => {
    const element = scroller();
    const scrollToSpy = vi.spyOn(element, "scrollTo").mockImplementation(() => undefined);
    const { list, detach } = make(element, { adjustScrollOnMeasure: false });
    list.measureElement(row(3, 70));
    expect(list.offset()).toBe(200);
    expect(scrollToSpy).not.toHaveBeenCalled();
    detach();
  });

  it("[VIR-R7-1] a list that is not attached has no scroll position to keep", () => {
    const list = createVirtualizer({
      count: 100,
      estimateSize: 20,
      overscan: 0,
      initialOffset: 200,
      initialRect: { width: 0, height: 100 },
    });
    list.measureElement(row(3, 70));
    expect(list.offset()).toBe(200);
  });
});

describe("a smooth scrollToIndex", () => {
  const make = () => {
    const element = scroller();
    const scrollToSpy = vi.spyOn(element, "scrollTo").mockImplementation(() => undefined);
    const list = scrollable({
      count: 100,
      estimateSize: 20,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = list.attach();
    list.scrollToIndex(50, { align: "start", behavior: "smooth" });
    return { element, scrollToSpy, list, detach };
  };

  it("[VIR-R7-2] keeps its re-alignment while the scroll is on its way", () => {
    const { element, scrollToSpy, list, detach } = make();
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 1000, behavior: "smooth" });
    // The browser reports positions on the way; a row below the viewport is measured 40px taller.
    scrollTo(element, 300);
    scrollTo(element, 400);
    list.measureElement(row(30, 60));
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 1040, behavior: "smooth" });
    detach();
  });

  it("[VIR-R7-2] arriving at the target ends the request when the layout did not move", () => {
    const { element, scrollToSpy, list, detach } = make();
    scrollTo(element, 600);
    scrollTo(element, 1000);
    const calls = scrollToSpy.mock.calls.length;
    list.measureElement(row(60, 60));
    expect(scrollToSpy).toHaveBeenCalledTimes(calls);
    detach();
  });

  it("[VIR-R7-2] arriving at a target the layout has left re-aligns once more, then lets go", () => {
    const element = scroller();
    const scrollToSpy = vi.spyOn(element, "scrollTo").mockImplementation(() => undefined);
    const [estimate, setEstimate] = useSignal(20);
    const list = scrollable({
      count: 100,
      estimateSize: (row) => (row < 50 ? estimate() : 20),
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = list.attach();
    list.scrollToIndex(50, { align: "start", behavior: "smooth" });
    scrollTo(element, 600);
    setEstimate(22);
    scrollTo(element, 1000);
    expect(scrollToSpy).toHaveBeenLastCalledWith({ top: 1100, behavior: "smooth" });
    const calls = scrollToSpy.mock.calls.length;
    scrollTo(element, 1100);
    expect(scrollToSpy).toHaveBeenCalledTimes(calls);
    setEstimate(24);
    scrollTo(element, 1100);
    expect(scrollToSpy).toHaveBeenCalledTimes(calls);
    detach();
  });

  it("[VIR-R7-2] a user scroll away from the target ends the request", () => {
    const { element, scrollToSpy, list, detach } = make();
    scrollTo(element, 400);
    scrollTo(element, 100);
    const calls = scrollToSpy.mock.calls.length;
    list.measureElement(row(30, 60));
    expect(scrollToSpy).toHaveBeenCalledTimes(calls);
    detach();
  });
});
