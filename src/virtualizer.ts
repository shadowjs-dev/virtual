/**
 * The virtualizer: which rows of a long list are in view, and how far to scroll to reach one.
 * Built on signals: reading `items()` in an effect or in JSX subscribes to the scroll position, the
 * viewport, the count and the measured sizes; nothing else re-renders the list.
 * @packageDocumentation
 */
import { type Accessor, onMount, untrack, useSignal } from "@shadow-js/core";
import { type Kernel, registerKernel } from "./internal/kernel";
import { finite, type Layout, layoutOf, visibleRange } from "./internal/layout";

/**
 * The size of a row before it is measured, in pixels along the list's axis: one number for every
 * row, or a function of the row index. Used by {@link VirtualizerOptions.estimateSize}.
 *
 * @example
 * ```ts
 * import { createVirtualizer, type SizeEstimate } from "@shadow-js/virtual";
 *
 * // Section headers (every tenth row) are shorter than the other rows.
 * const estimate: SizeEstimate = (index) => (index % 10 === 0 ? 32 : 56);
 * const list = createVirtualizer({ count: 500, estimateSize: estimate });
 * console.log(list.totalSize()); // 26800
 * ```
 * @since 1.0.0
 */
export type SizeEstimate = number | ((index: number) => number);

/**
 * Options of {@link createVirtualizer} and {@link useVirtualizer}: how many rows there are, how big
 * they are, which element scrolls, and the spacing, grid, sticky and direction settings. Lengths are
 * in pixels along the list's axis (heights for a vertical list, widths for a horizontal one). The
 * options are read when the virtualizer is created; a `count` accessor is read again on every
 * layout, and `getScrollElement` is called by {@link Virtualizer.attach}.
 *
 * @example
 * ```ts
 * import { createVirtualizer, type VirtualizerOptions } from "@shadow-js/virtual";
 *
 * const options: VirtualizerOptions = {
 *   count: 1000,
 *   estimateSize: 40,
 *   overscan: 3,
 *   gap: 4,
 *   paddingStart: 8,
 *   paddingEnd: 8,
 *   getScrollElement: () => document.getElementById("feed"),
 * };
 * const list = createVirtualizer(options);
 * console.log(list.rowCount()); // 1000
 * ```
 * @since 1.0.0
 */
export interface VirtualizerOptions {
  /**
   * Number of items. With `lanes`, the virtualizer works on `Math.ceil(count / lanes)` rows. A signal
   * accessor makes it reactive: the layout and the rows in view follow it.
   */
  readonly count: number | Accessor<number>;
  /**
   * Returns the element that scrolls, or `window`. Called when {@link Virtualizer.attach} runs; when
   * it is missing or returns `null`, `attach` does nothing and the viewport stays at `initialRect`.
   */
  readonly getScrollElement?: () => HTMLElement | Window | null;
  /**
   * The size of a row before it is measured: a number for every row, or a function of the row index.
   * An estimate that is not a positive finite number (`0`, negative, `NaN`, `Infinity`) counts as `1`, so a bad estimate cannot
   * stack every row at one offset (which would render only the last rows).
   * @default 50
   */
  readonly estimateSize?: SizeEstimate;
  /**
   * Lists rows horizontally: sizes are widths, and the offset is the horizontal scroll position.
   * @default false
   */
  readonly horizontal?: boolean;
  /**
   * Extra rows rendered before and after the viewport. Rounded down; a negative value counts as `0`.
   * @default 1
   */
  readonly overscan?: number;
  /**
   * Space between two rows. There is no gap before the first row or after the last one.
   * @default 0
   */
  readonly gap?: number;
  /**
   * Space before the first row, included in the total size.
   * @default 0
   */
  readonly paddingStart?: number;
  /**
   * Space after the last row, included in the total size.
   * @default 0
   */
  readonly paddingEnd?: number;
  /**
   * Space kept clear at the start of the viewport when scrolling to a row (for a sticky header). It
   * is also the distance from the viewport start at which a sticky row is pinned.
   * @default 0
   */
  readonly scrollPaddingStart?: number;
  /**
   * Space kept clear at the end of the viewport when scrolling to a row.
   * @default 0
   */
  readonly scrollPaddingEnd?: number;
  /**
   * Distance from the start of the page to the start of the list, used only when the scroll element
   * is `window`: it is subtracted from the window's scroll position when reading the offset and added
   * back when scrolling.
   * @default 0
   */
  readonly scrollMargin?: number;
  /**
   * The key of an item, called with the index of the first item of a row. Measured sizes are stored
   * by key, so they follow the item when the list reorders. When it is missing, the key is the row
   * index.
   */
  readonly getItemKey?: (index: number) => unknown;
  /**
   * Items per row: makes a grid. The virtualizer then works on rows, and each {@link VirtualItem}
   * lists the item indexes it holds in `indexes`. Rounded down; a value below `1` counts as `1`.
   * @default 1
   */
  readonly lanes?: number;
  /**
   * For a horizontal list in a right-to-left scroller: the negative `scrollLeft` the browser reports
   * is read as a distance from the start, and scrolling writes a negative `scrollLeft`. Ignored when
   * `horizontal` is not `true`.
   * @default false
   */
  readonly rtl?: boolean;
  /**
   * The viewport size until the scroll element is attached (server rendering, first paint, tests).
   * `height` is used for a vertical list and `width` for a horizontal one. Without it the viewport is
   * `0` until `attach` runs, so only the first row and the overscan are listed.
   */
  readonly initialRect?: { readonly width: number; readonly height: number };
  /**
   * The scroll offset until the scroll element is attached; `attach` then reads the element's own
   * position.
   * @default 0
   */
  readonly initialOffset?: number;
  /**
   * Returns the size of a rendered row element along the list's axis. When it is missing, the
   * element's bounding box is used (`width` for a horizontal list, `height` otherwise). A result that
   * is not above `0` is ignored.
   */
  readonly measureSize?: (element: Element, horizontal: boolean) => number;
  /**
   * Keeps the rows in view where they are when a row above the viewport is measured: the scroll
   * position moves by the change of that row's size. Without it, measuring a row that starts before
   * the scroll offset shifts every row in view, and a list of rows of unknown height jumps while the
   * user scrolls up through rows not measured yet. Only a list attached to a scroll element has a
   * position to move.
   * @default true
   */
  readonly adjustScrollOnMeasure?: boolean;
}

/**
 * One row in view, as listed by {@link Virtualizer.items}. Render it at `start` and give its element
 * `data-index={item.index}` so {@link Virtualizer.measureElement} can measure it.
 *
 * @example
 * ```ts
 * import { createVirtualizer, type VirtualItem } from "@shadow-js/virtual";
 *
 * const list = createVirtualizer({
 *   count: 10,
 *   estimateSize: 30,
 *   overscan: 0,
 *   initialRect: { width: 0, height: 60 },
 * });
 * const rows: readonly VirtualItem[] = list.items();
 * console.log(rows.map((row) => `${row.index}: ${row.start}-${row.end}`)); // ["0: 0-30", "1: 30-60"]
 * ```
 * @since 1.0.0
 */
export interface VirtualItem {
  /** The row index: the item index without `lanes`, the grid row with them. */
  readonly index: number;
  /** The row's key: `getItemKey` of the row's first item, or the row index without it. */
  readonly key: unknown;
  /**
   * Where the row starts along the list's axis, padding included. A sticky row reports where it is
   * drawn, which is not its place in the list once it is pinned.
   */
  readonly start: number;
  /** Where the row ends: `start + size`. */
  readonly end: number;
  /** The row's size: its measured size, or its estimate until it is measured. */
  readonly size: number;
  /** The item indexes in this row: `[index]` without `lanes`; up to `lanes` indexes with them. */
  readonly indexes: readonly number[];
  /** True for a row of a sticky list (`withSticky` in `@shadow-js/virtual/sticky`). */
  readonly isSticky: boolean;
  /**
   * True for the sticky row currently pinned: the last sticky row at or before the start of
   * {@link Virtualizer.range}. It is listed even when its own place has scrolled out of the range.
   */
  readonly isActiveSticky: boolean;
}

/**
 * The virtualizer returned by {@link createVirtualizer} and {@link useVirtualizer}. The accessors
 * are signals: reading them in an effect or in JSX subscribes to the scroll position, the viewport,
 * the count and the measured sizes.
 *
 * @example
 * ```ts
 * import { createVirtualizer, type Virtualizer } from "@shadow-js/virtual";
 *
 * const list: Virtualizer = createVirtualizer({
 *   count: 1000,
 *   estimateSize: 30,
 *   overscan: 1,
 *   initialRect: { width: 0, height: 90 },
 * });
 * console.log(list.items().map((item) => item.index)); // [0, 1, 2, 3]
 * console.log(list.totalSize()); // 30000
 * ```
 * @since 1.0.0
 */
export interface Virtualizer {
  /**
   * The rows in view, widened by `overscan` and sorted by index, plus the pinned sticky row when it
   * has scrolled out of the range. Empty for an empty list. Reactive.
   */
  items(): readonly VirtualItem[];
  /**
   * Length of the whole list, padding and gaps included: the size to give the element that holds
   * the rows. Reactive.
   */
  totalSize(): number;
  /**
   * The first and last row index in view, inclusive and widened by `overscan`, or `undefined` for
   * an empty list. Reactive.
   */
  range(): { readonly start: number; readonly end: number } | undefined;
  /** Number of rows: `count`, or `Math.ceil(count / lanes)` with `lanes`. Reactive. */
  rowCount(): number;
  /** The current scroll offset along the list's axis. Reactive. */
  offset(): number;
  /** The viewport size along the list's axis. Reactive. */
  viewportSize(): number;
  /** True from a scroll event until no scroll event has arrived for 150 ms. Reactive. */
  isScrolling(): boolean;
  /** Forgets every measured size, so every row is laid out with its estimate again. */
  measure(): void;
  /**
   * Records the size of the element rendered for a row. Pass it to the row's `ref`. The element
   * needs a `data-index` attribute with the row index; an element without one, with an index that
   * is not a non-negative integer, or with a size that is not above `0` is ignored. An element that is
   * not in the document yet is measured on the next microtask, once it is connected. After
   * `attach`, the element is observed and measured again when it resizes. A row that starts above
   * the scroll offset moves the offset by its change of size (see `adjustScrollOnMeasure`).
   * @param element The row's element; `null` is ignored.
   */
  measureElement(element: Element | null): void;
  /**
   * Starts listening to the scroll element: scroll events, `resize` on `window`, and a
   * `ResizeObserver` (where it exists) on the element and the measured rows. Reads the element's
   * viewport size and scroll position at once. Does nothing when there is no scroll element.
   * `useVirtualizer` calls it on mount.
   * @returns The function that removes the listeners and the observer.
   */
  attach(): () => void;
}

const IDLE_MS = 150;

/**
 * Creates a virtualizer: works out which rows of a long list are in view and how far to scroll to
 * reach one. It adds no listener, observer or timer until {@link Virtualizer.attach} is called, so
 * it is safe to create on the server and in tests. In a component, use {@link useVirtualizer},
 * which attaches on mount.
 *
 * @param options What the list looks like and where it scrolls.
 * @returns The virtualizer.
 * @example
 * ```ts
 * import { createVirtualizer } from "@shadow-js/virtual";
 *
 * const grid = createVirtualizer({
 *   count: 10,
 *   lanes: 4,
 *   estimateSize: 120,
 *   overscan: 0,
 *   initialRect: { width: 0, height: 240 },
 * });
 * console.log(grid.rowCount()); // 3
 * console.log(grid.items().map((item) => item.indexes)); // [[0, 1, 2, 3], [4, 5, 6, 7]]
 *
 * const detach = grid.attach(); // no scroll element: does nothing
 * detach();
 * ```
 * @see {@link useVirtualizer}
 * @since 1.0.0
 */
export function createVirtualizer(options: VirtualizerOptions): Virtualizer {
  const horizontal = options.horizontal === true;
  const rtl = horizontal && options.rtl === true;
  // Options that are not finite numbers fall back to a value that keeps the list usable: a NaN
  // count or padding must not turn every row into NaN.
  const lanes = Math.max(1, Math.floor(finite(options.lanes, 1)));
  const overscan = Math.max(0, Math.floor(finite(options.overscan, 1)));
  const gap = finite(options.gap, 0);
  const paddingStart = finite(options.paddingStart, 0);
  const paddingEnd = finite(options.paddingEnd, 0);
  const scrollPaddingStart = finite(options.scrollPaddingStart, 0);
  const scrollPaddingEnd = finite(options.scrollPaddingEnd, 0);
  const scrollMargin = finite(options.scrollMargin, 0);
  const sized = options.estimateSize ?? 50;
  const estimate = typeof sized === "function" ? sized : () => sized;
  // A fixed estimate with no key function makes the layout a pure function of the row count and the
  // measured sizes, so it can be kept until one of those changes. A function estimate is called on
  // every layout, because it may read signals the caller expects to be tracked.
  const cacheable = typeof sized !== "function" && options.getItemKey === undefined;
  const measureSize =
    options.measureSize ??
    ((element: Element, axis: boolean): number => {
      const box = element.getBoundingClientRect();
      return axis ? box.width : box.height;
    });

  const countOf = (): number => {
    const count = typeof options.count === "number" ? options.count : options.count();
    return Number.isFinite(count) && count > 0 ? count : 0;
  };
  const rowsOf = (items: number): number => Math.ceil(items / lanes);
  const rowCount = (): number => rowsOf(countOf());
  const keyOfRow = (row: number): unknown =>
    options.getItemKey === undefined ? row : options.getItemKey(row * lanes);

  const measured = new Map<unknown, number>();
  const [version, setVersion] = useSignal(0);
  const [offset, setOffset] = useSignal(finite(options.initialOffset, 0));
  const [viewport, setViewport] = useSignal(
    options.initialRect === undefined
      ? 0
      : finite(horizontal ? options.initialRect.width : options.initialRect.height, 0),
  );
  const [scrolling, setScrolling] = useSignal(false);
  const measuredBump = (): void => {
    setVersion(untrack(version) + 1);
  };

  let cached: { rows: number; version: number; layout: Layout } | undefined;

  /**
   * Drops the measured sizes of keys that are no longer in the list, once there are more of them
   * than rows. Each key is a caller's object or string: a measured size must not keep a removed item
   * alive, and the map stays no larger than the list.
   */
  const forgetAbsent = (rows: number): void => {
    if (measured.size <= rows) return;
    const live = new Set<unknown>();
    for (let row = 0; row < rows; row += 1) live.add(keyOfRow(row));
    // Deleting the entry being visited is allowed by Map; no copy of the keys is made.
    for (const key of measured.keys()) {
      if (!live.has(key)) measured.delete(key);
    }
  };

  /** Starts, sizes and total of the rows. Reads the count and the measured sizes (tracked). */
  const layoutNow = (): Layout => {
    const current = version();
    const rows = rowCount();
    if (cacheable && cached !== undefined && cached.rows === rows && cached.version === current) {
      return cached.layout;
    }
    forgetAbsent(rows);
    const layout = layoutOf(rows, estimate, measured, keyOfRow, gap, paddingStart, paddingEnd);
    cached = cacheable ? { rows, version: current, layout } : undefined;
    return layout;
  };

  const itemsOfRow = (row: number, count: number): number[] => {
    const first = row * lanes;
    const last = Math.min(count, first + lanes);
    const out: number[] = [];
    for (let index = first; index < last; index += 1) out.push(index);
    return out;
  };

  const items = (): readonly VirtualItem[] => {
    const count = countOf();
    const layout = layoutNow();
    const range = visibleRange(layout, offset(), viewport(), overscan);
    if (range === undefined) return [];
    const make = (row: number): VirtualItem => {
      const size = layout.sizes[row] ?? 0;
      const start = layout.starts[row] ?? 0;
      return {
        index: row,
        key: keyOfRow(row),
        start,
        end: start + size,
        size,
        indexes: itemsOfRow(row, count),
        isSticky: false,
        isActiveSticky: false,
      };
    };
    // A feature entry (sticky rows) replaces the list of rows; without one, the rows in view.
    if (kernel.items !== undefined) return kernel.items(range, layout, make);
    const rows: VirtualItem[] = [];
    for (let row = range.start; row <= range.end; row += 1) rows.push(make(row));
    return rows;
  };

  /** The element the list is attached to; read by the offset writes of a scroll-to feature. */
  let attached: HTMLElement | Window | null = null;

  const scrollTo = (next: number, behavior: ScrollBehavior): void => {
    setOffset(next);
    if (attached === null) return;
    // The page's position counts from the page start; right to left, a horizontal position is negative.
    const at = next + (isWindow(attached) ? scrollMargin : 0);
    // `rtl` implies `horizontal`.
    attached.scrollTo({ [horizontal ? "left" : "top"]: rtl ? -at : at, behavior });
  };

  const readOffset = (element: HTMLElement | Window): number => {
    const page = isWindow(element);
    const raw = horizontal
      ? page
        ? element.scrollX
        : element.scrollLeft
      : page
        ? element.scrollY
        : element.scrollTop;
    // The page's position counts from the page start: its margin comes off.
    return Math.max(0, Math.abs(raw) - (page ? scrollMargin : 0));
  };
  const readViewport = (element: HTMLElement | Window): number => {
    if (isWindow(element)) return horizontal ? element.innerWidth : element.innerHeight;
    return horizontal ? element.clientWidth : element.clientHeight;
  };

  /**
   * Elements rendered for rows, observed so a size change re-measures them. Rows are added before
   * `attach` too (their `ref` runs during render); `attach` observes them then. The set is pruned of
   * elements that have left the document, and each one is unobserved on the way out: the observer
   * would otherwise keep every row ever rendered alive.
   */
  const observed = new Set<Element>();
  let observer: ResizeObserver | undefined;
  /** Drops the rows that have left the document from the set and from the observer. */
  const pruneObserved = (): void => {
    for (const node of [...observed]) {
      if (node.isConnected) continue;
      observed.delete(node);
      observer?.unobserve(node);
    }
  };
  /** The detach of the attachment in effect: a second `attach` replaces it. */
  let stopAttached: (() => void) | undefined;

  const virtualizer: Virtualizer = {
    items,
    totalSize: () => layoutNow().total,
    range: () => {
      const layout = layoutNow();
      return visibleRange(layout, offset(), viewport(), overscan);
    },
    rowCount,
    offset,
    viewportSize: viewport,
    isScrolling: scrolling,
    measure() {
      measured.clear();
      measuredBump();
    },
    measureElement(element) {
      if (element === null) return;
      // A row's `ref` runs before the row is inserted, when its box is still empty: measure once
      // it is connected (the next microtask, after the insertion of the same synchronous pass).
      if (!element.isConnected) {
        queueMicrotask(() => {
          if (element.isConnected) virtualizer.measureElement(element);
        });
        return;
      }
      const raw = element.getAttribute("data-index");
      if (raw === null) return;
      const row = Number(raw);
      if (!Number.isInteger(row) || row < 0) return;
      // Observed before the size check: a row that is hidden now (size 0) is measured once it shows.
      if (!observed.has(element)) {
        observed.add(element);
        observer?.observe(element);
      }
      const size = measureSize(element, horizontal);
      if (!(size > 0)) return;
      const key = keyOfRow(row);
      if (measured.get(key) !== size) {
        // A row that starts above the offset pushes the rows in view by its change of size: the scroll
        // follows it, at once. A row past the end of the list has no start, so nothing moves.
        const before = untrack(layoutNow);
        const grew =
          (before.starts[row] as number) < untrack(offset)
            ? size - (before.sizes[row] as number)
            : 0;
        measured.set(key, size);
        measuredBump();
        if (grew !== 0 && attached !== null && options.adjustScrollOnMeasure !== false)
          scrollTo(untrack(offset) + grew, "instant");
        kernel.measured?.();
      }
    },
    attach() {
      const element = options.getScrollElement?.() ?? null;
      if (element === null) return () => undefined;
      // One attachment at a time: a second attach replaces the first, so no listener or observer is left
      // behind by a call that was not paired with a detach.
      stopAttached?.();
      attached = element;
      const windowScroller = isWindow(element);
      let idle: ReturnType<typeof setTimeout> | undefined;
      const onScroll = (): void => {
        const moved = readOffset(element);
        kernel.scrolled?.(moved);
        pruneObserved();
        setOffset(moved);
        setScrolling(true);
        // Clearing a timer that has run, or none, does nothing.
        clearTimeout(idle);
        idle = setTimeout(() => {
          setScrolling(false);
        }, IDLE_MS);
      };
      const onResize = (): void => {
        setViewport(readViewport(element));
      };
      element.addEventListener("scroll", onScroll, { passive: true });
      if (windowScroller) element.addEventListener("resize", onResize);
      let ownObserver: ResizeObserver | undefined;
      if (typeof ResizeObserver === "function") {
        ownObserver = new ResizeObserver(() => {
          onResize();
          pruneObserved();
          for (const node of observed) virtualizer.measureElement(node);
        });
        if (!windowScroller) ownObserver.observe(element);
        for (const node of observed) {
          if (node.isConnected) ownObserver.observe(node);
        }
        observer = ownObserver;
      }
      const stop = (): void => {
        // Only the attachment in effect can stop: a stale or repeated detach is a no-op.
        if (stopAttached !== stop) return;
        stopAttached = undefined;
        element.removeEventListener("scroll", onScroll);
        if (windowScroller) element.removeEventListener("resize", onResize);
        clearTimeout(idle);
        ownObserver?.disconnect();
        if (observer === ownObserver) observer = undefined;
        observed.clear();
        if (attached === element) attached = null;
      };
      stopAttached = stop;
      setViewport(readViewport(element));
      setOffset(readOffset(element));
      return stop;
    },
  };
  // The feature entries reach the list through the kernel; they set the hooks.
  const kernel: Kernel = {
    lanes,
    padStart: scrollPaddingStart,
    padEnd: scrollPaddingEnd,
    layout: layoutNow,
    rowCount,
    offset,
    viewport,
    scrollTo,
  };
  registerKernel(virtualizer, kernel);
  return virtualizer;
}

/**
 * {@link createVirtualizer} for a component: it attaches to the scroll element when the owner is
 * mounted and detaches when the owner is disposed. Call it during a component's setup.
 *
 * @param options See {@link VirtualizerOptions}.
 * @returns The virtualizer.
 * @example
 * ```tsx
 * import { useVirtualizer } from "@shadow-js/virtual";
 *
 * const items = Array.from({ length: 5000 }, (_, index) => `Item ${index}`);
 *
 * export function Feed() {
 *   let scroller: HTMLElement | undefined;
 *   const list = useVirtualizer({
 *     count: items.length,
 *     estimateSize: 48,
 *     overscan: 4,
 *     getScrollElement: () => scroller ?? null,
 *   });
 *   return (
 *     <div
 *       ref={(element: HTMLElement) => {
 *         scroller = element;
 *       }}
 *       style="height: 320px; overflow: auto"
 *     >
 *       <div style={`height: ${list.totalSize()}px; position: relative`}>
 *         {() =>
 *           list.items().map((item) => (
 *             <div
 *               data-index={item.index}
 *               ref={(element: Element) => list.measureElement(element)}
 *               style={`position: absolute; width: 100%; transform: translateY(${item.start}px)`}
 *             >
 *               {items[item.index]}
 *             </div>
 *           ))
 *         }
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 * @see {@link useInfiniteLoader}
 * @since 1.0.0
 */
export function useVirtualizer(options: VirtualizerOptions): Virtualizer {
  const virtualizer = createVirtualizer(options);
  onMount(() => virtualizer.attach());
  return virtualizer;
}

/**
 * True for a window. `instanceof Window` is not used: a window from another frame (an iframe, a
 * popup) is a different realm, so it fails that test, and so does a window in some test
 * environments. Every window's `window` property is the window itself, and no element has one.
 */
function isWindow(value: HTMLElement | Window): value is Window {
  return (value as Partial<Window>).window === value;
}
