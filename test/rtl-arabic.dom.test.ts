/**
 * The virtualizer with Arabic keys and in a right-to-left scroller: a measured row follows its key when the data is
 * reordered, and `scrollToIndex` writes the negative `scrollLeft` an RTL scroller expects.
 */
import { flushSync, useSignal } from "@shadow-js/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollable } from "./helpers/scrollable";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("RTL and Arabic keys", () => {
  it("[VIR-RTL-01] a measured row keeps its measurement with its Arabic key when the order changes", () => {
    const [order, setOrder] = useSignal(["أحمد", "بدر", "سارة"]);
    const virtualizer = scrollable({
      count: 3,
      estimateSize: 10,
      overscan: 0,
      getItemKey: (index) => order()[index],
      initialRect: { width: 0, height: 100 },
    });
    const element = document.createElement("div");
    element.setAttribute("data-index", "1");
    element.getBoundingClientRect = () => ({ height: 42, width: 0 }) as DOMRect;
    document.body.append(element);
    virtualizer.measureElement(element);
    expect(virtualizer.items().map((item) => item.size)).toEqual([10, 42, 10]);
    // The measured row moves to the front: its measured size goes with its key.
    setOrder(["بدر", "أحمد", "سارة"]);
    flushSync();
    expect(virtualizer.items().map((item) => [item.key, item.size])).toEqual([
      ["بدر", 42],
      ["أحمد", 10],
      ["سارة", 10],
    ]);
  });

  it("[VIR-RTL-02] scrollToIndex on a horizontal RTL list scrolls to a negative position", () => {
    const element = document.createElement("div");
    Object.defineProperty(element, "clientWidth", { value: 50 });
    Object.defineProperty(element, "clientHeight", { value: 20 });
    Object.defineProperty(element, "scrollLeft", { value: 0, writable: true });
    const scrollTo = vi.fn();
    element.scrollTo = scrollTo as unknown as typeof element.scrollTo;
    document.body.append(element);
    const virtualizer = scrollable({
      count: 100,
      horizontal: true,
      rtl: true,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    virtualizer.scrollToIndex(40, { align: "start" });
    const call = scrollTo.mock.calls[0]?.[0] as { left: number } | undefined;
    expect(call?.left).toBe(-400);
    detach();
  });

  it("[VIR-RTL-03] the first items of an RTL list are laid out from the start, whatever the digits in their labels", () => {
    const virtualizer = scrollable({
      count: 5,
      horizontal: true,
      rtl: true,
      estimateSize: 20,
      overscan: 0,
      getItemKey: (index) => `عنصر ${["٠", "١", "٢", "٣", "٤"][index]}`,
      initialRect: { width: 50, height: 10 },
    });
    expect(virtualizer.items().map((item) => [item.key, item.start])).toEqual([
      ["عنصر ٠", 0],
      ["عنصر ١", 20],
      ["عنصر ٢", 40],
    ]);
  });
});
