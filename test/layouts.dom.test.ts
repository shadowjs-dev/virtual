/**
 * Horizontal, grid and variable-size lists over an element scroller: a horizontal row measured by its
 * width, a grid row measured by its data-index, scrollToIndex with lanes, RTL and smooth scrolls, and
 * sticky columns.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { withSticky } from "../src/sticky";
import { scrollable } from "./helpers/scrollable";

/** A scroll element with a writable size and scroll position. */
function scroller(size: { width: number; height: number }): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: size.width });
  Object.defineProperty(element, "clientHeight", { value: size.height });
  Object.defineProperty(element, "scrollTop", { value: 0, writable: true });
  Object.defineProperty(element, "scrollLeft", { value: 0, writable: true });
  document.body.append(element);
  return element;
}

/** An element that reports the given width and height from its bounding box. */
function box(index: number, width: number, height: number): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("data-index", String(index));
  element.getBoundingClientRect = () => ({ width, height, top: 0, left: 0 }) as DOMRect;
  return element;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("horizontal lists", () => {
  it("[VIR-73] a horizontal row is measured by its width, and the total follows the measured widths", () => {
    const virtualizer = scrollable({
      count: 4,
      horizontal: true,
      estimateSize: 100,
      overscan: 0,
      initialRect: { width: 250, height: 40 },
    });
    const card = box(1, 30, 999);
    document.body.append(card);
    virtualizer.measureElement(card);
    // The height of 999 is ignored: a horizontal list measures widths.
    expect(virtualizer.items().map((item) => item.size)).toEqual([100, 30, 100, 100]);
    // Four rows: 100 + 30 + 100 + 100.
    expect(virtualizer.totalSize()).toBe(330);
  });

  it("[VIR-74] a sticky column stays at the start of a horizontal scroller once its place has passed", () => {
    const element = scroller({ width: 100, height: 40 });
    const virtualizer = scrollable({
      count: 30,
      horizontal: true,
      estimateSize: 40,
      overscan: 0,
      getScrollElement: () => element,
    });
    withSticky(virtualizer, [0]);
    const detach = virtualizer.attach();
    element.scrollLeft = 200;
    element.dispatchEvent(new Event("scroll"));
    const pinned = virtualizer.items().find((item) => item.index === 0);
    expect(pinned?.isActiveSticky).toBe(true);
    expect(pinned?.start).toBe(200);
    detach();
  });

  it("[VIR-77] smooth scrolling passes the behavior to the element and still moves the offset at once", () => {
    const element = scroller({ width: 0, height: 100 });
    const scrollTo = vi.spyOn(element, "scrollTo").mockImplementation(() => undefined);
    const virtualizer = scrollable({
      count: 50,
      estimateSize: 10,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    virtualizer.scrollToOffset(120, { behavior: "smooth" });
    expect(virtualizer.offset()).toBe(120);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 120, behavior: "smooth" });
    detach();
    scrollTo.mockRestore();
  });

  it("[VIR-78] scrollToIndex in a right-to-left horizontal list writes a negative left", () => {
    const element = scroller({ width: 100, height: 40 });
    const scrollTo = vi.spyOn(element, "scrollTo").mockImplementation(() => undefined);
    const virtualizer = scrollable({
      count: 20,
      horizontal: true,
      rtl: true,
      estimateSize: 50,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    virtualizer.scrollToIndex(4, { align: "start" });
    expect(virtualizer.offset()).toBe(200);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: -200, behavior: "auto" });
    detach();
    scrollTo.mockRestore();
  });
});

describe("grids", () => {
  it("[VIR-79] scrollToIndex with lanes scrolls to the row that holds the item", () => {
    const virtualizer = scrollable({
      count: 30,
      lanes: 4,
      estimateSize: 20,
      overscan: 0,
      initialRect: { width: 0, height: 40 },
    });
    // Item 13 is in row 3 (items 12 to 15); row 3 starts at 60.
    virtualizer.scrollToIndex(13, { align: "start" });
    expect(virtualizer.offset()).toBe(60);
    // A 40px viewport from 60 shows rows 3 and 4 (80 to 100 starts after the last pixel at 99).
    expect(virtualizer.items().map((item) => item.index)).toEqual([3, 4]);
  });

  it("[VIR-82] measureElement reads data-index as the grid row, so a measured row changes its own row only", () => {
    const virtualizer = scrollable({
      count: 10,
      lanes: 3,
      estimateSize: 20,
      overscan: 0,
      initialRect: { width: 0, height: 100 },
    });
    const row = box(1, 0, 55);
    document.body.append(row);
    virtualizer.measureElement(row);
    expect(virtualizer.items().map((item) => item.size)).toEqual([20, 55, 20, 20]);
    expect(virtualizer.items()[1]?.indexes).toEqual([3, 4, 5]);
  });

  it("[VIR-83] a grid row with fewer items than lanes lists only the items that exist", () => {
    const virtualizer = scrollable({
      count: 7,
      lanes: 3,
      estimateSize: 20,
      overscan: 0,
      initialRect: { width: 0, height: 200 },
    });
    expect(virtualizer.rowCount()).toBe(3);
    expect(virtualizer.items().at(-1)?.indexes).toEqual([6]);
  });
});

describe("variable sizes", () => {
  it("[VIR-84] a size estimate that depends on the row index lays rows out with their own sizes", () => {
    const sizes = [10, 40, 15, 30];
    const virtualizer = scrollable({
      count: sizes.length,
      estimateSize: (index) => sizes[index] ?? 0,
      overscan: 0,
      initialRect: { width: 0, height: 1000 },
    });
    expect(virtualizer.items().map((item) => item.start)).toEqual([0, 10, 50, 65]);
    expect(virtualizer.totalSize()).toBe(95);
    virtualizer.measure();
    expect(virtualizer.totalSize()).toBe(95);
  });
});
