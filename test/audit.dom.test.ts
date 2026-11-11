/** Findings of the router-data audit: each test asserts what the list does. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVirtualizer } from "../src/index";

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  constructor(_callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(element: Element): void {
    this.observed.add(element);
  }
  unobserve(element: Element): void {
    this.observed.delete(element);
  }
  disconnect(): void {
    this.observed.clear();
  }
}

afterEach(() => {
  document.body.innerHTML = "";
  FakeResizeObserver.instances = [];
  vi.unstubAllGlobals();
});

describe("attach after detach", () => {
  it("[VIR-A1] rows that are still in the document are observed again when the list is re-attached", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const element = document.createElement("div");
    Object.defineProperty(element, "clientHeight", { value: 100 });
    document.body.append(element);
    const virtualizer = createVirtualizer({
      count: 10,
      estimateSize: 10,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    const row = document.createElement("div");
    row.setAttribute("data-index", "2");
    row.getBoundingClientRect = () => ({ height: 25, width: 0 }) as DOMRect;
    element.append(row);
    virtualizer.measureElement(row);
    detach();
    virtualizer.attach();
    expect(FakeResizeObserver.instances.at(-1)?.observed.has(row)).toBe(true);
  });
});

describe("sticky rows that the list does not have", () => {
  it("[VIR-A2] a sticky index past the end of the list does not push the pinned header out of view", async () => {
    const { withSticky } = await import("../src/sticky");
    const list = withSticky(
      createVirtualizer({
        count: 40,
        estimateSize: 10,
        overscan: 0,
        initialRect: { width: 0, height: 50 },
        initialOffset: 300,
      }),
      [0, 10, 100],
    );
    const header = list.items().find((item) => item.isActiveSticky);
    expect(header?.index).toBe(10);
    // Pinned at the top of the viewport (offset 300), as it is when the next header is not there.
    expect(header?.start).toBe(300);
  });

  it("[VIR-A3] a negative or fractional sticky index is not a row", async () => {
    const { withSticky } = await import("../src/sticky");
    const list = withSticky(
      createVirtualizer({
        count: 40,
        estimateSize: 10,
        overscan: 0,
        initialRect: { width: 0, height: 50 },
        initialOffset: 300,
      }),
      [-1, 2.5],
    );
    expect(list.items().map((item) => item.index)).toEqual([30, 31, 32, 33, 34]);
  });
});
