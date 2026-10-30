/**
 * The layout arithmetic of the virtualizer. Pure functions over numbers: no DOM, no signals, so
 * every rule is tested without a browser. A layout is the starts and sizes of every row (or item)
 * in one list, computed from estimates and measured sizes.
 * @packageDocumentation
 */

/**
 * Where a row lands in the viewport when the virtualizer scrolls to it.
 *
 * - `"start"`: the row's start at the start of the viewport, less `scrollPaddingStart`.
 * - `"end"`: the row's end at the end of the viewport, plus `scrollPaddingEnd`.
 * - `"center"`: the row's middle at the middle of the viewport.
 * - `"auto"`: no scroll when the row is fully visible (inside the scroll padding); otherwise
 *   `"start"` when the row is before the view and `"end"` when it is after it.
 *
 * The resulting offset is always clamped to the scrollable range, so the last rows cannot be
 * brought higher than the end of the list allows.
 *
 * @example
 * ```ts
 * import { type Align, createVirtualizer } from "@shadow-js/virtual";
 * import { withScrollTo } from "@shadow-js/virtual/scroll-to";
 *
 * const list = withScrollTo(
 *   createVirtualizer({ count: 100, estimateSize: 20, initialRect: { width: 0, height: 200 } }),
 * );
 * const align: Align = "center";
 * list.scrollToIndex(50, { align });
 * console.log(list.offset()); // 910
 * ```
 * @see `ScrollToOptions` in `@shadow-js/virtual/scroll-to`
 * @since 1.0.0
 */
export type Align = "start" | "center" | "end" | "auto";

/**
 * The input of {@link computeLayout}: how many rows there are, their estimated and measured sizes,
 * and the spacing around them. All lengths are in pixels along the list's axis.
 *
 * @example
 * ```ts
 * import { computeLayout, type LayoutInput } from "@shadow-js/virtual";
 *
 * const input: LayoutInput = {
 *   count: 3,
 *   estimate: () => 40,
 *   measured: new Map([["b", 64]]),
 *   keyOf: (index) => ["a", "b", "c"][index],
 *   gap: 8,
 *   paddingStart: 16,
 *   paddingEnd: 16,
 * };
 * console.log(computeLayout(input).sizes); // [40, 64, 40]
 * ```
 * @since 1.0.0
 */
export interface LayoutInput {
  /** Number of rows (items, or grid rows). `0` gives an empty layout whose total is the padding. */
  readonly count: number;
  /**
   * The size of row `index` when it has no measured size. Called only for rows whose key is not in
   * `measured`.
   */
  readonly estimate: (index: number) => number;
  /** Measured sizes by row key. A measured size replaces the estimate of the row with that key. */
  readonly measured: ReadonlyMap<unknown, number>;
  /** The key of row `index`, used to look up its size in `measured`. */
  readonly keyOf: (index: number) => unknown;
  /** Space between two rows. There is no gap before the first row or after the last one. */
  readonly gap: number;
  /** Space before the first row: the start of row 0. */
  readonly paddingStart: number;
  /** Space after the last row, included in the total. */
  readonly paddingEnd: number;
}

/**
 * The layout of a list, returned by {@link computeLayout}: where each row starts, how long it is,
 * and the length of the whole list. All lengths are in pixels along the list's axis.
 *
 * @example
 * ```ts
 * import { computeLayout, type Layout } from "@shadow-js/virtual";
 *
 * const layout: Layout = computeLayout({
 *   count: 3,
 *   estimate: () => 10,
 *   measured: new Map(),
 *   keyOf: (index) => index,
 *   gap: 0,
 *   paddingStart: 0,
 *   paddingEnd: 0,
 * });
 * const lastEnd = (layout.starts[2] ?? 0) + (layout.sizes[2] ?? 0);
 * console.log(lastEnd === layout.total); // true
 * ```
 * @since 1.0.0
 */
export interface Layout {
  /** The start offset of each row, by row index. Ascending; the first is `paddingStart`. */
  readonly starts: readonly number[];
  /** The size of each row, by row index: its measured size, or its estimate. */
  readonly sizes: readonly number[];
  /** Length of the whole list: both paddings, every row and the gaps between rows. */
  readonly total: number;
}

/**
 * The size a row is laid out with when its estimate is not a positive finite number.
 * @example
 * MIN_ESTIMATE; // 1
 * @since 1.0.0
 */
export const MIN_ESTIMATE = 1;

const usableEstimate = (raw: number): number =>
  raw > 0 && Number.isFinite(raw) ? raw : MIN_ESTIMATE;

/**
 * Computes the starts, sizes and total length of a list from estimated and measured row sizes.
 * Pure arithmetic in O(count), with no DOM; the virtualizer runs it on every layout change, and it
 * is exported for tests and custom renderers.
 *
 * A row's size is its measured size, or its estimate; an estimate that is not a positive finite number (`0`, negative, `NaN`,
 * `Infinity`) counts as `1`, so a list with a bad estimate still has distinct row offsets and a sane range.
 *
 * @param input The row count, the sizes and the spacing.
 * @returns The layout. Row `i` starts at `paddingStart` plus the sizes and gaps of the rows before
 *   it; the total adds `paddingEnd` after the last row (no gap after it).
 * @example
 * ```ts
 * import { computeLayout } from "@shadow-js/virtual";
 *
 * const sizes = [10, 20, 30];
 * const layout = computeLayout({
 *   count: sizes.length,
 *   estimate: (index) => sizes[index] ?? 10,
 *   measured: new Map(),
 *   keyOf: (index) => index,
 *   gap: 2,
 *   paddingStart: 5,
 *   paddingEnd: 7,
 * });
 * console.log(layout.starts); // [5, 17, 39]
 * console.log(layout.total); // 76
 * ```
 * @see {@link createVirtualizer}
 * @since 1.0.0
 */
export function computeLayout(input: LayoutInput): Layout {
  // The callbacks run as methods of `input`, as they always have, so a `function` that reads `this` keeps working.
  return layoutOf(
    input.count,
    (index) => input.estimate(index),
    input.measured,
    (index) => input.keyOf(index),
    input.gap,
    input.paddingStart,
    input.paddingEnd,
  );
}

/**
 * {@link computeLayout} with positional arguments, for the virtualizer: an object literal repeats its property names in
 * every bundle that builds a virtualizer.
 * @internal
 */
export function layoutOf(
  count: number,
  estimate: (index: number) => number,
  measured: ReadonlyMap<unknown, number>,
  keyOf: (index: number) => unknown,
  gap: number,
  paddingStart: number,
  paddingEnd: number,
): Layout {
  const starts: number[] = [];
  const sizes: number[] = [];
  // A count that is not a positive number (NaN, negative) is an empty list: a NaN must not reach the arithmetic.
  const rows = count > 0 ? Math.floor(count) : 0;
  let cursor = paddingStart;
  for (let index = 0; index < rows; index += 1) {
    const known = measured.get(keyOf(index));
    // A measured size is what the browser reported, and a hidden row really is 0 (a NaN or negative one lays out as 0). An
    // estimate that is not a positive number (0, negative, NaN, Infinity) would put every row at one offset, so the whole list
    // would count as "in view" and only its last rows would render: it lays out as the smallest size instead.
    const size = known !== undefined ? (known > 0 ? known : 0) : usableEstimate(estimate(index));
    starts.push(cursor);
    sizes.push(size);
    cursor += size + gap;
  }
  // The gap after the last row is not there: the end padding follows the last size directly.
  const total = rows === 0 ? paddingStart + paddingEnd : cursor - gap + paddingEnd;
  return { starts, sizes, total };
}

/**
 * The index of the row at an offset: the last row that starts at or before it. Binary search.
 * Returns -1 for an empty list. Not exported from the package entry.
 *
 * @param layout The layout.
 * @param offset The offset along the list's axis.
 * @returns The row index, `0` for an offset before the first row, or `-1` for an empty list.
 * @internal
 */
export function indexAtOffset(layout: Layout, offset: number): number {
  const { starts } = layout;
  if (starts.length === 0) return -1;
  let low = 0;
  let high = starts.length - 1;
  let answer = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((starts[middle] ?? 0) <= offset) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return answer;
}

/**
 * The rows that intersect the viewport from `offset` for `viewport` pixels, widened by `overscan`
 * rows on each side and clamped to the list. `undefined` for an empty list. Not exported from the
 * package entry.
 *
 * @param layout The layout.
 * @param offset The scroll offset.
 * @param viewport The viewport size along the list's axis.
 * @param overscan Extra rows on each side.
 * @returns The first and last row index, inclusive, or `undefined` for an empty list.
 * @internal
 */
export function visibleRange(
  layout: Layout,
  offset: number,
  viewport: number,
  overscan: number,
): { readonly start: number; readonly end: number } | undefined {
  const count = layout.starts.length;
  if (count === 0) return undefined;
  const first = indexAtOffset(layout, offset);
  const last = indexAtOffset(layout, offset + Math.max(0, viewport - 1));
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(count - 1, Math.max(first, last) + overscan),
  };
}

/**
 * The largest scroll offset that still shows the end of the list (`0` when the list fits the
 * viewport). Not exported from the package entry.
 *
 * @param layout The layout.
 * @param viewport The viewport size along the list's axis.
 * @returns `max(0, total - viewport)`.
 * @internal
 */
export function maxOffset(layout: Layout, viewport: number): number {
  return Math.max(0, layout.total - viewport);
}

/**
 * The scroll offset that brings row `index` into view with the given alignment. The scroll padding
 * keeps the row clear of the viewport edges (`scrollPaddingStart` at the top or left,
 * `scrollPaddingEnd` at the bottom or right). The result is clamped to the scrollable range.
 *
 * - `start`: the row's start at the top (minus `scrollPaddingStart`).
 * - `end`: the row's end at the bottom (plus `scrollPaddingEnd`).
 * - `center`: the row in the middle.
 * - `auto`: unchanged when the row is fully visible; otherwise `start` when it is above the view and
 *   `end` when it is below.
 *
 * Not exported from the package entry: `withScrollTo` (`@shadow-js/virtual/scroll-to`) uses it.
 *
 * @param layout The layout.
 * @param index The row to bring into view.
 * @param viewport The viewport size along the list's axis.
 * @param current The current scroll offset (used by `auto`).
 * @param align The alignment.
 * @param scrollPaddingStart Space kept clear at the start of the viewport.
 * @param scrollPaddingEnd Space kept clear at the end of the viewport.
 * @returns The target offset, between `0` and the largest scroll offset.
 * @internal
 */
export function alignedOffset(
  layout: Layout,
  index: number,
  viewport: number,
  current: number,
  align: Align,
  scrollPaddingStart: number,
  scrollPaddingEnd: number,
): number {
  const start = layout.starts[index] ?? 0;
  const size = layout.sizes[index] ?? 0;
  const end = start + size;
  const toStart = start - scrollPaddingStart;
  const toEnd = end - viewport + scrollPaddingEnd;
  let target: number;
  if (align === "start") {
    target = toStart;
  } else if (align === "end") {
    target = toEnd;
  } else if (align === "center") {
    target = start + size / 2 - viewport / 2;
  } else if (
    start >= current + scrollPaddingStart &&
    end <= current + viewport - scrollPaddingEnd
  ) {
    target = current;
  } else {
    target = start < current + scrollPaddingStart ? toStart : toEnd;
  }
  return Math.min(Math.max(0, target), maxOffset(layout, viewport));
}

/**
 * Where a sticky row is drawn: at the offset (plus `paddingStart`) once its natural position has
 * been passed, and pushed up by the next sticky row when that one arrives at the top, so two sticky
 * rows never overlap. Returns the natural start for a row that has not been passed. Not exported
 * from the package entry.
 *
 * @param layout The layout.
 * @param index The sticky row.
 * @param stickyIndexes All sticky rows, ascending.
 * @param offset The current scroll offset.
 * @param paddingStart Space kept above the sticky row.
 * @returns The offset the sticky row is drawn at.
 * @internal
 */
export function stickyStart(
  layout: Layout,
  index: number,
  stickyIndexes: readonly number[],
  offset: number,
  paddingStart: number,
): number {
  const natural = layout.starts[index] ?? 0;
  const size = layout.sizes[index] ?? 0;
  const pinned = Math.max(offset + paddingStart, natural);
  const next = stickyIndexes.find((candidate) => candidate > index);
  if (next === undefined) return pinned;
  const nextStart = layout.starts[next] ?? 0;
  const nextPinned = Math.max(offset + paddingStart, nextStart);
  return Math.min(pinned, nextPinned - size);
}

/**
 * `value` when it is a finite number, otherwise `fallback`. Shared by the options of the virtualizer and the loader.
 * @example
 * ```ts
 * finite(undefined, 3); // 3
 * finite(Number.NaN, 3); // 3
 * finite(7.5, 3); // 7.5
 * ```
 * @since 1.0.0
 */
export function finite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}
