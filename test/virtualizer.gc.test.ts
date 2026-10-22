/**
 * Memory of the virtualizer: the measured sizes it keeps by key must not hold on to the keys of rows
 * that have left the list, and attach and detach must not keep the scroll element alive. Runs in the
 * gc project, which starts Node with --expose-gc.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVirtualizer } from "../src/index";

/** The engine's collector; the gc project always runs with --expose-gc. */
function exposedGc(): () => void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc === undefined) throw new Error("the gc project must run with --expose-gc");
  return gc;
}

/** Yields to the next job: a WeakRef target made in the current job stays alive until that job ends. */
function nextJob(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

/**
 * Collects until every ref is gone, at most 25 forced collections. The checks and the collections are
 * in different jobs: `WeakRef.deref` keeps its target alive until the current job ends, so a check
 * made just before a collection in the same job would keep the target it read.
 */
async function collectUntilGone(refs: readonly WeakRef<object>[]): Promise<boolean> {
  const gc = exposedGc();
  for (let pass = 0; pass < 25; pass += 1) {
    await nextJob();
    if (refs.every((ref) => ref.deref() === undefined)) return true;
    await nextJob();
    gc();
  }
  await nextJob();
  return refs.every((ref) => ref.deref() === undefined);
}

/** A stand-in for a row element: `measureElement` reads only these members in a non-DOM environment. */
function fakeRow(index: number): Element {
  return {
    isConnected: true,
    getAttribute: (name: string) => (name === "data-index" ? String(index) : null),
  } as unknown as Element;
}

/** Creates `count` object keys and a WeakRef to each. The keys are made here, not in the test frame. */
function makeKeys(count: number): { keys: object[]; refs: WeakRef<object>[] } {
  const keys: object[] = [];
  const refs: WeakRef<object>[] = [];
  for (let index = 0; index < count; index += 1) {
    const key = { index };
    keys.push(key);
    refs.push(new WeakRef(key));
  }
  return { keys, refs };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("virtualizer memory", () => {
  it("[VIR-80] the measured size of a row that left the list is released with its key", async () => {
    const made = makeKeys(200);
    // The keys live in a variable the virtualizer reads: shrinking the variable replaces the array, so
    // the removed keys are referenced only by the virtualizer's measured sizes.
    let keys = made.keys;
    let rows = 200;
    const list = createVirtualizer({
      count: () => rows,
      estimateSize: 10,
      overscan: 0,
      initialRect: { width: 0, height: 100 },
      getItemKey: (index) => keys[index] ?? index,
      measureSize: () => 40,
    });
    for (let index = 0; index < 200; index += 1) list.measureElement(fakeRow(index));
    expect(list.totalSize()).toBe(200 * 40);
    // The list shrinks to two rows: the other keys are no longer in the list.
    rows = 2;
    keys = keys.slice(0, 2);
    made.keys.length = 0;
    list.items();
    const released = await collectUntilGone(made.refs.slice(2));
    expect(released).toBe(true);
    expect(list.totalSize()).toBe(2 * 40);
    expect(keys).toHaveLength(2);
  });

  it("[VIR-81] attach and detach, repeated, leave no listener and keep no scroll element alive", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {
          // Nothing to record: the test checks what the detach releases.
        }
        disconnect(): void {
          // The detach must call this; the test does not count it.
        }
      },
    );
    const refs: WeakRef<object>[] = [];
    const cycle = (): void => {
      const listeners = new Set<string>();
      const element = {
        addEventListener: (type: string) => listeners.add(type),
        removeEventListener: (type: string) => listeners.delete(type),
        clientHeight: 100,
        clientWidth: 0,
        scrollTop: 0,
        scrollLeft: 0,
      };
      refs.push(new WeakRef(element));
      const list = createVirtualizer({
        count: 50,
        estimateSize: 10,
        getScrollElement: () => element as unknown as HTMLElement,
      });
      const detach = list.attach();
      detach();
      expect(listeners.size).toBe(0);
    };
    for (let round = 0; round < 500; round += 1) cycle();
    expect(await collectUntilGone(refs)).toBe(true);
  });
});
