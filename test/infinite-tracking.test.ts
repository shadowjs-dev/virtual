import { createRoot, flushSync, useEffect, useSignal } from "@shadow-js/core";
import { isTracking } from "@shadow-js/core/extend";
import { expect, it } from "vitest";
import { createVirtualizer, useInfiniteLoader } from "../src/index";

it.each([false, true])(
  "[VIR-LOAD-TRACK-01] retry callbacks do not subscribe their caller and restore later tracking (throws: %s)",
  async (throws) => {
    const [secret, setSecret] = useSignal(0);
    const [tail, setTail] = useSignal(0);
    const tracking: boolean[] = [];
    const failure = new Error("load failed");
    let loadError: () => unknown = () => undefined;
    let runs = 0;
    const dispose = createRoot((disposeRoot) => {
      // An empty list stays idle automatically; retry isolates the explicit request path.
      const list = createVirtualizer({ count: 0, estimateSize: 10 });
      const loader = useInfiniteLoader({
        virtualizer: list,
        hasMore: () => true,
        loadMore: () => {
          tracking.push(isTracking());
          secret();
          if (throws) throw failure;
        },
      });
      loadError = loader.error;
      let attempted = false;
      useEffect(() => {
        runs += 1;
        if (!attempted) {
          attempted = true;
          loader.retry();
        }
        tail();
      });
      return disposeRoot;
    });
    try {
      flushSync();
      for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
      flushSync();
      expect(tracking).toEqual([false]);
      expect(loadError()).toBe(throws ? failure : undefined);
      const before = runs;
      setSecret(1);
      flushSync();
      expect(runs).toBe(before);
      setTail(1);
      flushSync();
      expect(runs).toBe(before + 1);
    } finally {
      dispose();
    }
  },
);
