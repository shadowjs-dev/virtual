/**
 * Scrolling a virtualized list to a row or an offset: `scrollToIndex` with an alignment, and
 * `scrollToOffset`. An opt-in entry (`@shadow-js/virtual/scroll-to`): a list that never scrolls
 * programmatically does not pay for it.
 * @packageDocumentation
 */
import { untrack } from "@shadow-js/core";
import { kernelOf } from "./internal/kernel";
import { type Align, alignedOffset } from "./internal/layout";
import type { Virtualizer } from "./virtualizer";

/**
 * Options of {@link ScrollableVirtualizer.scrollToIndex} and
 * {@link ScrollableVirtualizer.scrollToOffset}.
 *
 * @example
 * ```ts
 * import { createVirtualizer } from "@shadow-js/virtual";
 * import { type ScrollToOptions, withScrollTo } from "@shadow-js/virtual/scroll-to";
 *
 * const list = withScrollTo(
 *   createVirtualizer({ count: 100, estimateSize: 20, initialRect: { width: 0, height: 200 } }),
 * );
 * const options: ScrollToOptions = { align: "start", behavior: "smooth" };
 * list.scrollToIndex(50, options);
 * console.log(list.offset()); // 1000
 * ```
 * @since 1.0.0
 */
export interface ScrollToOptions {
  /**
   * Where the row goes in the viewport; see {@link Align}. `"auto"` scrolls only when the row is not
   * fully visible. Ignored by `scrollToOffset`.
   * @default "auto"
   */
  readonly align?: Align;
  /**
   * Passed to the scroll element's `scrollTo`: `"smooth"` animates where the browser supports it.
   * The virtualizer's `offset()` takes the target value at once either way.
   * @default "auto"
   */
  readonly behavior?: "auto" | "smooth";
}

/**
 * A virtualizer with the scroll methods: what {@link withScrollTo} returns. The object is the one
 * passed in, so every method of {@link Virtualizer} works on it as before.
 *
 * @example
 * ```ts
 * import { createVirtualizer } from "@shadow-js/virtual";
 * import { type ScrollableVirtualizer, withScrollTo } from "@shadow-js/virtual/scroll-to";
 *
 * const list: ScrollableVirtualizer = withScrollTo(
 *   createVirtualizer({ count: 10, estimateSize: 30, initialRect: { width: 0, height: 60 } }),
 * );
 * list.scrollToOffset(999999);
 * console.log(list.offset()); // 240
 * ```
 * @since 1.0.0
 */
export interface ScrollableVirtualizer extends Virtualizer {
  /**
   * Scrolls so that the item at `index` is in view with the alignment (the row that holds it, with
   * `lanes`). An index past either end of the list scrolls to the nearest row, and an empty list
   * ignores the request. The request is applied again each time a measurement changes the layout,
   * until the user scrolls somewhere else. A `"smooth"` request ignores the positions the scroll
   * reports on its way, and ends when it arrives, after one more alignment if the layout moved.
   * @param index The item index.
   * @param options The alignment and the scroll behavior.
   */
  scrollToIndex(index: number, options?: ScrollToOptions): void;
  /**
   * Scrolls to an offset, clamped between `0` and the largest offset that still shows the end of
   * the list.
   * @param offset The target offset along the list's axis.
   * @param options The scroll behavior; `align` is ignored.
   */
  scrollToOffset(offset: number, options?: ScrollToOptions): void;
}

/**
 * Adds `scrollToIndex` and `scrollToOffset` to a virtualizer made by `createVirtualizer` or
 * `useVirtualizer`. It writes the scroll position to the element (or the window) and to the offset
 * signal, so `offset()` takes the target at once.
 *
 * @param virtualizer A virtualizer created by this package.
 * @returns The same object, with the scroll methods.
 * @throws TypeError when the object was not created by this package.
 * @example
 * ```tsx
 * import { For } from "@shadow-js/web";
 * import { type VirtualItem, useVirtualizer } from "@shadow-js/virtual";
 * import { withScrollTo } from "@shadow-js/virtual/scroll-to";
 *
 * export function Jumper(props: { items: string[] }) {
 *   let scroller: HTMLElement | undefined;
 *   const list = withScrollTo(
 *     useVirtualizer({
 *       count: props.items.length,
 *       estimateSize: 40,
 *       getScrollElement: () => scroller ?? null,
 *     }),
 *   );
 *   return (
 *     <div>
 *       <button type="button" onClick={() => list.scrollToIndex(0, { align: "start" })}>
 *         Top
 *       </button>
 *       <div ref={(element: HTMLElement) => { scroller = element; }} style="height: 240px; overflow: auto">
 *         <div style={`height: ${list.totalSize()}px`}>
 *           <For each={list.items()} key={(item: VirtualItem) => item.key}>
 *             {(item: () => VirtualItem) => (
 *               <div data-index={item().index} ref={(element: Element) => list.measureElement(element)}
 *                 style={`position: absolute; top: ${item().start}px`}>{props.items[item().index]}</div>
 *             )}
 *           </For>
 *         </div>
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 * @since 1.0.0
 */
export function withScrollTo(virtualizer: Virtualizer): ScrollableVirtualizer {
  const kernel = kernelOf(virtualizer);
  /**
   * The last scroll-to-row request. Measuring the rows above it can move it (estimates are replaced
   * by real sizes), so it is re-applied after each measurement until the user scrolls on their own.
   * `applied` is the offset asked of the element, `last` the last position the element reported.
   */
  let pending: { row: number; options: ScrollToOptions; applied: number; last: number } | undefined;

  const targetOf = (row: number, options: ScrollToOptions): number =>
    alignedOffset(
      untrack(kernel.layout),
      row,
      untrack(kernel.viewport),
      untrack(kernel.offset),
      options.align ?? "auto",
      kernel.padStart,
      kernel.padEnd,
    );

  /** Scrolls to the row of a request (every read is untracked) and notes the offset it asked for. */
  const align = (request: NonNullable<typeof pending>): void => {
    request.applied = targetOf(request.row, request.options);
    kernel.scrollTo(request.applied, request.options.behavior ?? "auto");
  };

  kernel.measured = () => {
    if (pending !== undefined) align(pending);
  };
  kernel.scrolled = (moved) => {
    const request = pending;
    if (request === undefined) return;
    const { applied, last, options } = request;
    request.last = moved;
    if (Math.abs(moved - applied) <= 1) {
      // A smooth scroll has arrived: it ends the request, after one more alignment if the layout moved meanwhile.
      if (options.behavior !== "smooth") return;
      if (Math.abs(targetOf(request.row, options) - moved) > 1) align(request);
      else pending = undefined;
    } else if (!(options.behavior === "smooth" && (moved - last) * (moved - applied) <= 0)) {
      // A scroll that is not the one a request applied is the user's: stop re-aligning. A smooth scroll reports the
      // positions on its way, between where it was and where it goes: those are not the user's.
      pending = undefined;
    }
  };

  return Object.assign(virtualizer, {
    scrollToIndex(index: number, options: ScrollToOptions = {}): void {
      untrack(() => {
        const rows = kernel.rowCount();
        if (rows === 0) return;
        // An index past either end scrolls to the nearest row: a request is never silently a scroll to the top.
        // Infinity is the end of the list (and -Infinity its start); only a NaN has no place, and goes to the start.
        const wanted = Math.floor((Number.isNaN(index) ? 0 : index) / kernel.lanes);
        const row = Math.min(Math.max(0, wanted), rows - 1);
        pending = { row, options, applied: 0, last: kernel.offset() };
        align(pending);
      });
    },
    scrollToOffset(next: number, options: ScrollToOptions = {}): void {
      untrack(() => {
        // `align` has no meaning for a raw offset: it is accepted for symmetry with `scrollToIndex`.
        const layout = kernel.layout();
        const wanted = Number.isFinite(next) ? next : 0;
        const clamped = Math.min(
          Math.max(0, wanted),
          Math.max(0, layout.total - kernel.viewport()),
        );
        kernel.scrollTo(clamped, options.behavior ?? "auto");
      });
    },
  });
}
