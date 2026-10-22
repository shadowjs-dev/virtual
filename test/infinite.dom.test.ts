/**
 * The infinite loader: failures, retries, pages that add no rows, synchronous throws, the empty list,
 * `hasMore`, and the threshold edges. Each case counts the calls to `loadMore`, so a loop that
 * requests the same page again fails the test.
 */
import { createRoot, flushSync, useSignal } from "@shadow-js/core";
import { afterEach, describe, expect, it } from "vitest";
import { type InfiniteLoader, useInfiniteLoader } from "../src/index";
import type { ScrollableVirtualizer } from "../src/scroll-to";
import { scrollable } from "./helpers/scrollable";

/** Lets queued microtasks run (no timers): a rejected or resolved page settles in a few turns. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

/** A loader over a list of `rows` rows of 10px in a 100px viewport, with its own owner. */
function loaderFor(options: {
  rows: number;
  threshold?: number;
  hasMore?: () => boolean;
  loadMore: () => unknown;
}): { loader: InfiniteLoader; list: ScrollableVirtualizer; dispose: () => void } {
  let loader: InfiniteLoader | undefined;
  let list: ScrollableVirtualizer | undefined;
  const dispose = createRoot((disposeRoot) => {
    list = scrollable({
      count: options.rows,
      estimateSize: 10,
      overscan: 0,
      initialRect: { width: 0, height: 100 },
    });
    loader = useInfiniteLoader({
      virtualizer: list,
      hasMore: options.hasMore ?? (() => true),
      threshold: options.threshold ?? 2,
      loadMore: options.loadMore,
    });
    return disposeRoot;
  });
  if (loader === undefined || list === undefined) throw new Error("owner did not run");
  return { loader, list, dispose };
}

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

describe("useInfiniteLoader failures", () => {
  it("[VIR-60] a page that rejects is not requested again by itself: loadMore runs once and the error is reported", async () => {
    let calls = 0;
    const failure = new Error("offline");
    const { loader, dispose } = loaderFor({
      rows: 10,
      loadMore: () => {
        calls += 1;
        return Promise.reject(failure);
      },
    });
    disposers.push(dispose);
    flushSync();
    await settle();
    flushSync();
    await settle();
    expect(calls).toBe(1);
    expect(loader.error()).toBe(failure);
    expect(loader.loading()).toBe(false);
  });

  it("[VIR-61] a synchronous throw from loadMore is reported as the error, not thrown into the owner", async () => {
    const failure = new Error("bad cursor");
    const { loader, dispose } = loaderFor({
      rows: 10,
      loadMore: () => {
        throw failure;
      },
    });
    disposers.push(dispose);
    flushSync();
    await settle();
    expect(loader.error()).toBe(failure);
    expect(loader.loading()).toBe(false);
  });

  it("[VIR-62] a failed page is retried by retry(), which clears the error when the new attempt starts", async () => {
    let calls = 0;
    let shouldFail = true;
    const { loader, dispose } = loaderFor({
      rows: 10,
      loadMore: () => {
        calls += 1;
        return shouldFail ? Promise.reject(new Error("once")) : Promise.resolve();
      },
    });
    disposers.push(dispose);
    flushSync();
    await settle();
    expect(loader.error()).toBeInstanceOf(Error);
    shouldFail = false;
    loader.retry();
    expect(loader.error()).toBeUndefined();
    expect(loader.loading()).toBe(true);
    await settle();
    flushSync();
    expect(calls).toBe(2);
    expect(loader.loading()).toBe(false);
    expect(loader.error()).toBeUndefined();
  });

  it("[VIR-63] retry() while a page is loading does not start a second request", async () => {
    let calls = 0;
    const { loader, dispose } = loaderFor({
      rows: 10,
      loadMore: () => {
        calls += 1;
        return new Promise<void>(() => undefined);
      },
    });
    disposers.push(dispose);
    flushSync();
    expect(loader.loading()).toBe(true);
    loader.retry();
    flushSync();
    expect(calls).toBe(1);
  });
});

describe("useInfiniteLoader pages", () => {
  it("[VIR-64] a page that resolves without adding rows is not requested again until the list grows", async () => {
    let calls = 0;
    const { loader, dispose } = loaderFor({
      rows: 10,
      loadMore: () => {
        calls += 1;
        return Promise.resolve();
      },
    });
    disposers.push(dispose);
    flushSync();
    await settle();
    flushSync();
    await settle();
    expect(calls).toBe(1);
    expect(loader.loading()).toBe(false);
  });

  it("[VIR-65] when a page adds rows and the new end is still near the viewport, the next page loads at once", async () => {
    const [count, setCount] = useSignal(10);
    let calls = 0;
    let list: ScrollableVirtualizer | undefined;
    const dispose = createRoot((disposeRoot) => {
      // A 300px viewport shows 30 rows, so each new page's end is still in view.
      list = scrollable({
        count,
        estimateSize: 10,
        overscan: 0,
        initialRect: { width: 0, height: 300 },
      });
      useInfiniteLoader({
        virtualizer: list,
        hasMore: () => count() < 40,
        threshold: 2,
        loadMore: async () => {
          calls += 1;
          await Promise.resolve();
          setCount(count() + 10);
        },
      });
      return disposeRoot;
    });
    disposers.push(dispose);
    flushSync();
    for (let round = 0; round < 6; round += 1) {
      await settle();
      flushSync();
    }
    // 10 -> 20 -> 30 -> 40 rows: three pages, then hasMore is false.
    expect(calls).toBe(3);
    expect(list?.rowCount()).toBe(40);
  });

  it("[VIR-66] hasMore false and an empty list never call loadMore", async () => {
    let calls = 0;
    const idle = loaderFor({
      rows: 10,
      hasMore: () => false,
      loadMore: () => {
        calls += 1;
      },
    });
    disposers.push(idle.dispose);
    const none = loaderFor({
      rows: 0,
      loadMore: () => {
        calls += 1;
      },
    });
    disposers.push(none.dispose);
    flushSync();
    await settle();
    expect(calls).toBe(0);
  });

  it("[VIR-67] threshold 0 loads only once the last row is in view", async () => {
    let calls = 0;
    const { list, dispose } = loaderFor({
      rows: 30,
      threshold: 0,
      loadMore: () => {
        calls += 1;
        return new Promise<void>(() => undefined);
      },
    });
    disposers.push(dispose);
    flushSync();
    expect(calls).toBe(0);
    list.scrollToIndex(29, { align: "end" });
    flushSync();
    expect(calls).toBe(1);
  });
});
