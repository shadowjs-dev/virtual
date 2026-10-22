/**
 * The infinite-loading hook: when the last row in view is close to the end of the list, load the
 * next page. One page is loaded at a time.
 * @packageDocumentation
 */
import { type Accessor, untrack, useEffect, useSignal } from "@shadow-js/core";
import { finite } from "./internal/layout";
import type { Virtualizer } from "./virtualizer";

/**
 * Options of {@link useInfiniteLoader}: the list to watch, whether there is more, how to load it and
 * how close to the end loading starts.
 *
 * @example
 * ```ts
 * import { useSignal } from "@shadow-js/core";
 * import { createVirtualizer, type InfiniteLoaderOptions } from "@shadow-js/virtual";
 *
 * const [cursor, setCursor] = useSignal<string | undefined>("page-2");
 * const list = createVirtualizer({ count: 20, estimateSize: 40 });
 * const options: InfiniteLoaderOptions = {
 *   virtualizer: list,
 *   hasMore: () => cursor() !== undefined,
 *   loadMore: async () => {
 *     const response = await fetch(`/api/items?after=${cursor() ?? ""}`);
 *     const page = (await response.json()) as { next?: string };
 *     setCursor(page.next);
 *   },
 *   threshold: 5,
 * };
 * ```
 * @since 1.0.0
 */
export interface InfiniteLoaderOptions {
  /** The virtualizer whose rows in view are watched. */
  readonly virtualizer: Virtualizer;
  /** Whether another page exists. While it returns `false`, nothing is loaded. Read reactively. */
  readonly hasMore: Accessor<boolean>;
  /**
   * Loads the next page. When it returns a promise, the loader waits for it to settle before it can
   * load again; a rejection (or a thrown error) is reported by {@link InfiniteLoader.error}. Grow the
   * virtualizer's `count` with the new rows before the promise resolves.
   * Runs untracked, including requests started by `retry()`.
   */
  readonly loadMore: () => unknown;
  /**
   * How many rows before the last one count as near the end: a page is loaded once the last row in
   * view (overscan included) has an index of at least `rowCount() - 1 - threshold`. So `0` loads when
   * the final row is in view. Rounded down; a negative value counts as `0`.
   * @default 3
   */
  readonly threshold?: number;
}

/**
 * What {@link useInfiniteLoader} returns: the state of the current or last load, and a way to retry.
 *
 * @example
 * ```tsx
 * import { useSignal } from "@shadow-js/core";
 * import { useInfiniteLoader, useVirtualizer } from "@shadow-js/virtual";
 *
 * export function Status() {
 *   const [count, setCount] = useSignal(20);
 *   const list = useVirtualizer({ count, estimateSize: 40 });
 *   const more = useInfiniteLoader({
 *     virtualizer: list,
 *     hasMore: () => count() < 200,
 *     loadMore: () => setCount(count() + 20),
 *   });
 *   return (
 *     <p>
 *       {() => (more.loading() ? "Loading" : more.error() ? "Could not load" : "")}
 *       {() => (more.error() ? <button type="button" onClick={() => more.retry()}>Retry</button> : null)}
 *     </p>
 *   );
 * }
 * ```
 * @since 1.0.0
 */
export interface InfiniteLoader {
  /** True while a page is loading: from the call to `loadMore` until its promise settles. Reactive. */
  readonly loading: Accessor<boolean>;
  /**
   * The error the last load rejected with (or threw), or `undefined`. Cleared when the next load
   * starts. Reactive.
   */
  readonly error: Accessor<unknown>;
  /**
   * Loads the next page now, without waiting for the list to come near its end: the way to retry
   * after a failure. Does nothing while a page is loading, or when `hasMore()` is false.
   */
  retry(): void;
}

/**
 * Watches the rows in view and calls `loadMore` when the last of them is within `threshold` rows of
 * the end, unless a page is already loading, `hasMore()` is false or the list is empty. One page is
 * loaded at a time; when a page finishes, the check runs again for the new end.
 *
 * A page that finishes without adding rows, or that fails, is not requested again by the check: the
 * same end would ask for the same page in a loop. The check starts again when the count changes, and
 * {@link InfiniteLoader.retry} asks for the page directly. Call it during a component's setup: it runs
 * in an effect owned by the component.
 *
 * @param options The virtualizer, `hasMore`, `loadMore` and the threshold.
 * @returns The loading and error state, and `retry`.
 * @example
 * ```ts
 * import { useSignal } from "@shadow-js/core";
 * import { useInfiniteLoader, useVirtualizer } from "@shadow-js/virtual";
 *
 * // The first page is rendered by the caller: an empty list never asks for more.
 * export function useTimeline(first: string[], next: string, scroller: () => HTMLElement | null) {
 *   const [items, setItems] = useSignal(first);
 *   const [cursor, setCursor] = useSignal<string | undefined>(next);
 *   const list = useVirtualizer({
 *     count: () => items().length,
 *     estimateSize: 40,
 *     getScrollElement: scroller,
 *   });
 *   const loader = useInfiniteLoader({
 *     virtualizer: list,
 *     hasMore: () => cursor() !== undefined,
 *     loadMore: async () => {
 *       const response = await fetch(`/api/timeline?after=${cursor() ?? ""}`);
 *       const page = (await response.json()) as { items: string[]; next?: string };
 *       setItems([...items(), ...page.items]);
 *       setCursor(page.next);
 *     },
 *   });
 *   return { items, list, loader };
 * }
 * ```
 * @see {@link useVirtualizer}
 * @since 1.0.0
 */
export function useInfiniteLoader(options: InfiniteLoaderOptions): InfiniteLoader {
  const threshold = Math.max(0, Math.floor(finite(options.threshold, 3)));
  const [loading, setLoading] = useSignal(false);
  const [error, setError] = useSignal<unknown>(undefined);
  /** The row count of the last attempt that added no rows; the check waits for the count to change. */
  let stalledRows: number | undefined;

  /** Starts one page. The count is read when it starts and again when it settles. */
  const load = (): void => {
    const rowsAtStart = options.virtualizer.rowCount();
    setLoading(true);
    setError(undefined);
    const settle = (failed: boolean, failure?: unknown): void => {
      // The stall is recorded before `loading` turns false, so the check that runs then sees it.
      if (options.virtualizer.rowCount() === rowsAtStart) stalledRows = rowsAtStart;
      if (failed) setError(failure);
      setLoading(false);
    };
    new Promise<unknown>((resolve) => resolve(untrack(options.loadMore))).then(
      () => settle(false),
      (failure: unknown) => settle(true, failure),
    );
  };

  useEffect(() => {
    const last = options.virtualizer.items().at(-1)?.index ?? -1;
    const rows = options.virtualizer.rowCount();
    // `loading` is read tracked: when a page finishes, the check runs again for the new end.
    if (
      !options.hasMore() ||
      loading() ||
      last < 0 ||
      last < rows - 1 - threshold ||
      stalledRows === rows
    ) {
      return;
    }
    untrack(load);
  });

  return {
    loading,
    error,
    retry() {
      if (loading() || !options.hasMore()) return;
      stalledRows = undefined;
      load();
    },
  };
}
