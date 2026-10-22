/**
 * Measurement and resizing through the ResizeObserver, with a recording stand-in for it (happy-dom
 * reports no layout). Covers rows measured before `attach`, a row or the scroller changing size, the
 * detach of the observer, and rows that have left the document.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVirtualizer } from "../src/index";

/** Records what the virtualizer observes; `fire()` plays a resize notification to its callback. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  readonly unobserved: Element[] = [];
  disconnected = false;

  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
    this.unobserved.push(element);
  }

  disconnect(): void {
    this.observed.clear();
    this.disconnected = true;
  }

  fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** A scroll element whose client height the test writes through `setHeight`. */
type Scroller = HTMLElement & { setHeight(next: number): void };

/** A scroll element whose client size and scroll position the test writes. */
function scroller(height: number): Scroller {
  let clientHeight = height;
  const element = Object.assign(document.createElement("div"), {
    setHeight(next: number) {
      clientHeight = next;
    },
  });
  Object.defineProperty(element, "clientHeight", { get: () => clientHeight });
  Object.defineProperty(element, "clientWidth", { value: 0 });
  Object.defineProperty(element, "scrollTop", { value: 0, writable: true });
  Object.defineProperty(element, "scrollLeft", { value: 0, writable: true });
  document.body.append(element);
  return element;
}

/** A row element of a given height, with `data-index` set; `setHeight` changes what it reports. */
type Row = HTMLElement & { setHeight(next: number): void };

function row(index: number, height: number): Row {
  let current = height;
  const element = Object.assign(document.createElement("div"), {
    setHeight(next: number) {
      current = next;
    },
  });
  element.setAttribute("data-index", String(index));
  element.getBoundingClientRect = () => ({ height: current, width: 0 }) as DOMRect;
  return element;
}

function observerOf(): FakeResizeObserver {
  const observer = FakeResizeObserver.instances.at(-1);
  if (observer === undefined) throw new Error("no ResizeObserver was created");
  return observer;
}

afterEach(() => {
  document.body.innerHTML = "";
  FakeResizeObserver.instances = [];
  vi.unstubAllGlobals();
});

describe("ResizeObserver measurement", () => {
  it("[VIR-36] a second attach replaces the first: one scroll listener is active, and detaching the stale attach keeps the live one", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const element = scroller(50);
    const add = vi.spyOn(element, "addEventListener");
    const remove = vi.spyOn(element, "removeEventListener");
    const scrollListeners = (): number =>
      add.mock.calls.filter(([type]) => type === "scroll").length -
      remove.mock.calls.filter(([type]) => type === "scroll").length;
    const virtualizer = createVirtualizer({ count: 50, getScrollElement: () => element });
    const first = virtualizer.attach();
    const second = virtualizer.attach();
    expect(scrollListeners()).toBe(1);
    first();
    element.scrollTop = 20;
    element.dispatchEvent(new Event("scroll"));
    expect(virtualizer.offset()).toBe(20);
    second();
    expect(scrollListeners()).toBe(0);
    add.mockRestore();
    remove.mockRestore();
  });

  it("[VIR-37] rows measured before attach are observed when attach runs", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const element = scroller(100);
    const virtualizer = createVirtualizer({
      count: 10,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    // A row's ref runs during render, before the owner mounts and attaches.
    const early = row(2, 25);
    element.append(early);
    virtualizer.measureElement(early);
    const detach = virtualizer.attach();
    expect(observerOf().observed.has(early)).toBe(true);
    detach();
  });

  it("[VIR-38] a row that changes size is measured again when the observer reports it", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const element = scroller(100);
    const virtualizer = createVirtualizer({
      count: 3,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    const image = row(1, 40);
    element.append(image);
    virtualizer.measureElement(image);
    expect(virtualizer.totalSize()).toBe(10 + 40 + 10);
    // The image loads and grows: no scroll, no call from the app; only the observer knows.
    image.setHeight(90);
    observerOf().fire();
    expect(virtualizer.totalSize()).toBe(10 + 90 + 10);
    detach();
  });

  it("[VIR-39] the scroller's own resize (a window resize, a rotation, a split pane) updates the viewport through the observer", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const element = scroller(100);
    const virtualizer = createVirtualizer({
      count: 100,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    expect(virtualizer.viewportSize()).toBe(100);
    expect(virtualizer.items()).toHaveLength(10);
    // Rotate the device: the scroller gets taller and the observer reports it.
    element.setHeight(300);
    observerOf().fire();
    expect(virtualizer.viewportSize()).toBe(300);
    expect(virtualizer.items()).toHaveLength(30);
    detach();
  });

  it("[VIR-53] detach disconnects the observer, and a row measured afterward is not observed", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const element = scroller(100);
    const virtualizer = createVirtualizer({
      count: 10,
      estimateSize: 10,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    const observer = observerOf();
    detach();
    expect(observer.disconnected).toBe(true);
    const late = row(1, 30);
    element.append(late);
    virtualizer.measureElement(late);
    expect(observer.observed.has(late)).toBe(false);
    expect(observerOf()).toBe(observer);
  });

  it("[VIR-54] a row that has left the document is unobserved on the next scroll, so the observer does not keep it alive", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const element = scroller(100);
    const virtualizer = createVirtualizer({
      count: 100,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    const observer = observerOf();
    const gone = row(4, 10);
    element.append(gone);
    virtualizer.measureElement(gone);
    expect(observer.observed.has(gone)).toBe(true);
    gone.remove();
    element.dispatchEvent(new Event("scroll"));
    expect(observer.observed.has(gone)).toBe(false);
    expect(observer.unobserved).toContain(gone);
    detach();
  });

  it("[VIR-55] without ResizeObserver the virtualizer still attaches, measures and reads the viewport", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const element = scroller(40);
    const virtualizer = createVirtualizer({
      count: 10,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    const item = row(1, 30);
    element.append(item);
    virtualizer.measureElement(item);
    expect(virtualizer.totalSize()).toBe(10 + 30 + 10 * 8);
    expect(virtualizer.viewportSize()).toBe(40);
    expect(() => detach()).not.toThrow();
  });
});
