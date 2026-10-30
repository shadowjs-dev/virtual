/**
 * Sticky rows: a row listed as sticky stays at the top of the viewport once its place has scrolled
 * past, and the next sticky row pushes it out. An opt-in entry (`@shadow-js/virtual/sticky`): a list
 * without sticky rows does not pay for them.
 * @packageDocumentation
 */

import { kernelOf } from "./internal/kernel";
import { stickyStart } from "./internal/layout";
import type { Virtualizer } from "./virtualizer";

/**
 * Makes some rows sticky: they stay at the top of the viewport after their place has scrolled past,
 * and the next sticky row pushes the pinned one out when it arrives, so two headers never overlap.
 * The virtualizer returned is the object passed in; its `items()` lists the pinned row even when it
 * has scrolled out of the range in view, with `isSticky` and `isActiveSticky` set.
 *
 * @param virtualizer A virtualizer created by this package.
 * @param indexes The sticky row indexes, in any order (a sorted copy is kept).
 * @returns The same virtualizer.
 * @throws TypeError when the object was not created by this package.
 * @example
 * ```ts
 * import { createVirtualizer } from "@shadow-js/virtual";
 * import { withSticky } from "@shadow-js/virtual/sticky";
 *
 * const list = withSticky(
 *   createVirtualizer({ count: 40, estimateSize: 10, overscan: 0, initialRect: { width: 0, height: 50 } }),
 *   [0, 10],
 * );
 * console.log(list.items().map((item) => item.index)); // [0, 1, 2, 3, 4]
 * ```
 * @since 1.0.0
 */
export function withSticky(virtualizer: Virtualizer, indexes: readonly number[]): Virtualizer {
  const kernel = kernelOf(virtualizer);
  const sticky = [...indexes].sort((a, b) => a - b);
  kernel.items = (range, layout, make) => {
    // The sticky row that is pinned at the top is drawn even when it has scrolled out of range.
    let pinned: number | undefined;
    for (const row of sticky) {
      if (row <= range.start) pinned = row;
    }
    const rows: number[] = [];
    if (pinned !== undefined && pinned < range.start) rows.push(pinned);
    for (let row = range.start; row <= range.end; row += 1) rows.push(row);
    for (const row of sticky) {
      if (row > range.end) break;
      if (row >= range.start && !rows.includes(row)) rows.push(row);
    }
    rows.sort((a, b) => a - b);
    const currentOffset = kernel.offset();
    return rows.map((row) => {
      const item = make(row);
      if (!sticky.includes(row)) return item;
      const start = stickyStart(layout, row, sticky, currentOffset, kernel.padStart);
      return {
        ...item,
        start,
        end: start + item.size,
        isSticky: true,
        isActiveSticky: row === pinned,
      };
    });
  };
  return virtualizer;
}
