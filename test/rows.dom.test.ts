/**
 * Keyed row reuse: rows rendered with `For` keyed by `VirtualItem.key` keep their DOM node across a
 * scroll and across a measurement above them. The row's position is read reactively from the item
 * accessor, so the same node moves instead of being rebuilt.
 */
import { createRoot, flushSync } from "@shadow-js/core";
import { effect, For, insert } from "@shadow-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { createVirtualizer, type VirtualItem } from "../src/index";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A scroll element that is 300px tall, with an inner box where the rows are inserted. */
function scroller(): { element: HTMLElement; inner: HTMLElement } {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientHeight", { value: 300 });
  Object.defineProperty(element, "clientWidth", { value: 0 });
  Object.defineProperty(element, "scrollTop", { value: 0, writable: true });
  Object.defineProperty(element, "scrollLeft", { value: 0, writable: true });
  const inner = document.createElement("div");
  element.append(inner);
  document.body.append(element);
  return { element, inner };
}

describe("keyed row reuse", () => {
  it("[VIR-85] a row keeps its DOM node across a scroll and a measurement above it, and moves to its new place", () => {
    const { element, inner } = scroller();
    let list: ReturnType<typeof createVirtualizer> | undefined;
    const detach = createRoot((disposeRoot) => {
      list = createVirtualizer({
        count: 50,
        estimateSize: 30,
        overscan: 0,
        getScrollElement: () => element,
      });
      const detachList = list.attach();
      const rows = For({
        get each() {
          return list?.items() ?? [];
        },
        key: (item: VirtualItem) => item.key,
        children: (item: () => VirtualItem) => {
          const row = document.createElement("div");
          effect(() => {
            row.setAttribute("data-index", String(item().index));
            row.style.transform = `translateY(${item().start}px)`;
          });
          return row;
        },
      });
      insert(inner, rows);
      return () => {
        detachList();
        disposeRoot();
      };
    });
    flushSync();
    const before = inner.querySelector<HTMLElement>('[data-index="5"]');
    expect(before).not.toBeNull();

    // Scroll by two rows: row 5 is still in view.
    element.scrollTop = 60;
    element.dispatchEvent(new Event("scroll"));
    flushSync();
    expect(inner.querySelector<HTMLElement>('[data-index="5"]')).toBe(before);

    // A row above it is measured taller: row 5 moves down by 60px, on the same node, and the scroll
    // offset follows by the same 60px, so the row stays where it is on screen.
    const above = document.createElement("div");
    above.setAttribute("data-index", "1");
    above.getBoundingClientRect = () => ({ height: 90, width: 0 }) as DOMRect;
    document.body.append(above);
    list?.measureElement(above);
    flushSync();
    const after = inner.querySelector<HTMLElement>('[data-index="5"]');
    expect(after).toBe(before);
    // Rows 0 to 4 start at 0, 30, 120, 150 and 180 once row 1 is 90px: row 5 starts at 210.
    expect(after?.style.transform).toBe("translateY(210px)");
    expect(list?.offset()).toBe(120);
    detach();
  });
});
