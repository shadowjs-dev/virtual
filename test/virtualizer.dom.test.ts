/**
 * The signal-based virtualizer in happy-dom: viewport and overscan, scrolling through the scroll
 * event, horizontal and RTL lists, measurement of elements, scroll-to with alignment, grid lanes,
 * sticky rows, the attach lifecycle, and the infinite loader.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { afterEach, describe, expect, it } from "vitest";
import { useInfiniteLoader, useVirtualizer } from "../src/index";
import { withSticky } from "../src/sticky";
import { scrollable } from "./helpers/scrollable";

/** A scroll element with a fixed viewport and writable scroll position. */
function scroller(size: { width?: number; height?: number }): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: size.width ?? 0 });
  Object.defineProperty(element, "clientHeight", { value: size.height ?? 0 });
  Object.defineProperty(element, "scrollTop", { value: 0, writable: true });
  Object.defineProperty(element, "scrollLeft", { value: 0, writable: true });
  document.body.append(element);
  return element;
}

/** Lets queued microtasks run (no timers). */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

function indexesOf(items: readonly { index: number }[]): number[] {
  return items.map((item) => item.index);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("createVirtualizer", () => {
  it("[VIR-20] items cover the viewport from the offset, widened by overscan", () => {
    const virtualizer = scrollable({
      count: 100,
      estimateSize: 10,
      overscan: 1,
      initialRect: { width: 0, height: 25 },
    });
    expect(indexesOf(virtualizer.items())).toEqual([0, 1, 2, 3]);
    expect(virtualizer.totalSize()).toBe(1000);
  });

  it("[VIR-21] a scroll event moves the window of items to the new position", () => {
    const element = scroller({ height: 25 });
    const virtualizer = scrollable({
      count: 100,
      estimateSize: 10,
      overscan: 1,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    element.scrollTop = 95;
    element.dispatchEvent(new Event("scroll"));
    flushSync();
    expect(virtualizer.offset()).toBe(95);
    expect(indexesOf(virtualizer.items())).toEqual([8, 9, 10, 11, 12]);
    expect(virtualizer.isScrolling()).toBe(true);
    detach();
  });

  it("[VIR-22] a horizontal list uses the width and the horizontal scroll position", () => {
    const element = scroller({ width: 30, height: 100 });
    const virtualizer = scrollable({
      count: 50,
      horizontal: true,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    element.scrollLeft = 40;
    element.dispatchEvent(new Event("scroll"));
    expect(indexesOf(virtualizer.items())).toEqual([4, 5, 6]);
    detach();
  });

  it("[VIR-23] an RTL horizontal list reads a negative scroll position as its distance from the start", () => {
    const element = scroller({ width: 25, height: 100 });
    const virtualizer = scrollable({
      count: 50,
      horizontal: true,
      rtl: true,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    element.scrollLeft = -120;
    element.dispatchEvent(new Event("scroll"));
    expect(virtualizer.offset()).toBe(120);
    expect(indexesOf(virtualizer.items())).toEqual([12, 13, 14]);
    detach();
  });

  it("[VIR-24] a measured element replaces its estimate, and the total follows", () => {
    const virtualizer = scrollable({
      count: 3,
      estimateSize: 10,
      overscan: 0,
      initialRect: { width: 0, height: 100 },
    });
    const element = document.createElement("div");
    element.setAttribute("data-index", "1");
    element.getBoundingClientRect = () => ({ height: 42, width: 0 }) as DOMRect;
    document.body.append(element);
    virtualizer.measureElement(element);
    expect(virtualizer.totalSize()).toBe(10 + 42 + 10);
    expect(virtualizer.items().map((item) => item.size)).toEqual([10, 42, 10]);
    virtualizer.measure();
    expect(virtualizer.totalSize()).toBe(30);
  });

  it("[VIR-25] scrollToIndex moves the offset (and the element) so the row is at the chosen alignment", () => {
    const element = scroller({ height: 100 });
    const virtualizer = scrollable({
      count: 50,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    virtualizer.scrollToIndex(20, { align: "start" });
    expect(virtualizer.offset()).toBe(200);
    expect(element.scrollTop).toBe(200);
    virtualizer.scrollToIndex(20, { align: "center" });
    expect(virtualizer.offset()).toBe(155);
    virtualizer.scrollToIndex(20, { align: "end" });
    expect(virtualizer.offset()).toBe(110);
    detach();
  });

  it("[VIR-35] a scroll-to request is re-aligned when a measured row above it changes the layout, until the user scrolls", () => {
    const element = scroller({ height: 100 });
    const virtualizer = scrollable({
      count: 100,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    virtualizer.scrollToIndex(50, { align: "start" });
    expect(virtualizer.offset()).toBe(500);
    // Row 10 is really 40px tall: everything after it moves down by 30px.
    const tall = document.createElement("div");
    tall.setAttribute("data-index", "10");
    tall.getBoundingClientRect = () => ({ height: 40, width: 0 }) as DOMRect;
    document.body.append(tall);
    virtualizer.measureElement(tall);
    expect(virtualizer.offset()).toBe(530);
    // The user scrolls somewhere else: the request is no longer followed.
    element.scrollTop = 120;
    element.dispatchEvent(new Event("scroll"));
    // A row below the new position changes the layout: the request is not followed, and nothing above moves.
    const later = document.createElement("div");
    later.setAttribute("data-index", "30");
    later.getBoundingClientRect = () => ({ height: 70, width: 0 }) as DOMRect;
    document.body.append(later);
    virtualizer.measureElement(later);
    expect(virtualizer.offset()).toBe(120);
    detach();
    tall.remove();
    later.remove();
  });

  it("[VIR-26] a reactive count changes the total and the items", () => {
    const [count, setCount] = useSignal(10);
    const virtualizer = scrollable({
      count,
      estimateSize: 10,
      overscan: 0,
      initialRect: { width: 0, height: 100 },
    });
    expect(virtualizer.totalSize()).toBe(100);
    setCount(4);
    expect(virtualizer.totalSize()).toBe(40);
    expect(indexesOf(virtualizer.items())).toEqual([0, 1, 2, 3]);
  });

  it("[VIR-27] lanes make a grid: each row item lists the item indexes it holds", () => {
    const virtualizer = scrollable({
      count: 10,
      lanes: 3,
      estimateSize: 20,
      overscan: 0,
      initialRect: { width: 0, height: 100 },
    });
    expect(virtualizer.totalSize()).toBe(4 * 20);
    expect(virtualizer.items().map((item) => item.indexes)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9],
    ]);
  });

  it("[VIR-28] a sticky row stays at the top of the viewport after it is passed, and the row it stays for is the active one", () => {
    const element = scroller({ height: 50 });
    const virtualizer = scrollable({
      count: 40,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    withSticky(virtualizer, [0, 10]);
    const detach = virtualizer.attach();
    element.scrollTop = 150;
    element.dispatchEvent(new Event("scroll"));
    // Row 10 (sticky, natural start 100) is pinned at the offset; row 0 has scrolled away.
    const sticky = virtualizer.items().find((item) => item.index === 10);
    expect(sticky?.isSticky).toBe(true);
    expect(sticky?.isActiveSticky).toBe(true);
    expect(sticky?.start).toBe(150);
    expect(virtualizer.items().some((item) => item.index === 0)).toBe(false);
    detach();
  });

  it("[VIR-29] getItemKey keeps a measured size with its item when the list changes", () => {
    const keys = ["a", "b", "c"];
    const virtualizer = scrollable({
      count: 3,
      estimateSize: 10,
      overscan: 0,
      getItemKey: (index) => keys[index] ?? index,
      initialRect: { width: 0, height: 100 },
    });
    const element = document.createElement("div");
    element.setAttribute("data-index", "1");
    element.getBoundingClientRect = () => ({ height: 50, width: 0 }) as DOMRect;
    document.body.append(element);
    virtualizer.measureElement(element);
    expect(virtualizer.items().map((item) => item.size)).toEqual([10, 50, 10]);
    keys.reverse();
    expect(virtualizer.items().map((item) => item.size)).toEqual([10, 50, 10]);
    expect(virtualizer.items()[0]?.key).toBe("c");
    expect(virtualizer.items()[1]?.key).toBe("b");
  });

  it("[VIR-30] attach listens for scroll; the detach function removes the listener", () => {
    const element = scroller({ height: 50 });
    const calls: string[] = [];
    const add = element.addEventListener.bind(element);
    const remove = element.removeEventListener.bind(element);
    element.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      calls.push(`add:${type}`);
      add(type, listener, options);
    };
    element.removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      calls.push(`remove:${type}`);
      remove(type, listener, options);
    };
    const virtualizer = scrollable({ count: 5, getScrollElement: () => element });
    const detach = virtualizer.attach();
    detach();
    expect(calls).toEqual(["add:scroll", "remove:scroll"]);
  });

  it("[VIR-34] a row whose ref runs before it is inserted is measured once it is connected", async () => {
    const virtualizer = scrollable({
      count: 3,
      estimateSize: 10,
      overscan: 0,
      initialRect: { width: 0, height: 100 },
    });
    const row = document.createElement("div");
    row.setAttribute("data-index", "1");
    row.getBoundingClientRect = () => ({ height: 40, width: 0 }) as DOMRect;
    virtualizer.measureElement(row);
    expect(virtualizer.totalSize()).toBe(30);
    document.body.append(row);
    await settle();
    expect(virtualizer.totalSize()).toBe(60);
  });

  it("[VIR-31] without a scroll element the virtualizer uses its initial rectangle and attach does nothing", () => {
    const virtualizer = scrollable({
      count: 5,
      estimateSize: 10,
      initialRect: { width: 0, height: 15 },
      overscan: 0,
    });
    const detach = virtualizer.attach();
    expect(indexesOf(virtualizer.items())).toEqual([0, 1]);
    expect(() => detach()).not.toThrow();
  });

  it("[VIR-32] useVirtualizer attaches when mounted and detaches when its owner is disposed", () => {
    const element = scroller({ height: 50 });
    let attached = 0;
    const original = element.addEventListener.bind(element);
    element.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === "scroll") attached += 1;
      original(type, listener, options);
    };
    let dispose = (): void => undefined;
    createRoot((disposeRoot) => {
      dispose = disposeRoot;
      useVirtualizer({ count: 5, getScrollElement: () => element });
    });
    expect(attached).toBe(0);
    flushSync();
    expect(attached).toBe(1);
    dispose();
  });
});

describe("useInfiniteLoader", () => {
  it("[VIR-33] loads the next page when the last visible row is near the end, one at a time, and stops when there is no more", async () => {
    const [count, setCount] = useSignal(10);
    const [more, setMore] = useSignal(true);
    let loads = 0;
    const finish: Array<() => void> = [];
    let virtualizer: ReturnType<typeof scrollable> | undefined;
    createRoot(() => {
      virtualizer = scrollable({
        count,
        estimateSize: 10,
        overscan: 0,
        initialRect: { width: 0, height: 100 },
      });
      useInfiniteLoader({
        virtualizer,
        hasMore: more,
        threshold: 2,
        loadMore: () =>
          new Promise<void>((resolve) => {
            loads += 1;
            finish.push(() => {
              setCount(count() + 10);
              resolve();
            });
          }),
      });
    });
    const list = virtualizer as ReturnType<typeof scrollable>;
    flushSync();
    expect(loads).toBe(1);
    flushSync();
    expect(loads).toBe(1);
    finish.shift()?.();
    await settle();
    flushSync();
    // Rows 0 to 9 are visible of 20: the end is not near yet.
    expect(loads).toBe(1);
    list.scrollToIndex(15, { align: "start" });
    flushSync();
    expect(loads).toBe(2);
    setMore(false);
    flushSync();
    finish.shift()?.();
    await settle();
    list.scrollToIndex(25, { align: "start" });
    flushSync();
    expect(loads).toBe(2);
  });
});
