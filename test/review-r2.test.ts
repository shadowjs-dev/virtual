/** Second review round: an estimate that is not a positive number must not break the range of rows. */
import { describe, expect, it } from "vitest";
import { computeLayout } from "../src/index";
import { scrollable } from "./helpers/scrollable";

const rect = { width: 0, height: 200 };

describe("a size estimate of zero", () => {
  it("[VRT-R2-11] 1000 items with estimateSize 0 render from the first row, not only the last ones", () => {
    const list = scrollable({ count: 1000, estimateSize: 0, initialRect: rect, overscan: 0 });
    const indexes = list.items().map((item) => item.index);
    expect(indexes[0]).toBe(0);
    expect(indexes.length).toBeGreaterThan(0);
    // At the 1px minimum 200px of viewport shows 200 rows (a row more at the edge), never the whole list.
    expect(indexes.length).toBeLessThanOrEqual(201);
    expect(list.totalSize()).toBe(1000);
  });

  it("[VRT-R2-11] scrolling shows the rows at that offset", () => {
    const list = scrollable({ count: 1000, estimateSize: () => 0, initialRect: rect, overscan: 0 });
    list.scrollToOffset(500);
    const indexes = list.items().map((item) => item.index);
    expect(indexes[0]).toBe(500);
    expect(indexes.at(-1)).toBeLessThanOrEqual(701);
  });

  it("[VRT-R2-11] negative, NaN and infinite estimates are the minimum; a measured zero stays zero", () => {
    const layout = computeLayout({
      count: 4,
      estimate: (index) => [-3, Number.NaN, Number.POSITIVE_INFINITY, 12][index] ?? 0,
      measured: new Map([[3, 0]]),
      keyOf: (index) => index,
      gap: 0,
      paddingStart: 0,
      paddingEnd: 0,
    });
    expect(layout.sizes).toEqual([1, 1, 1, 0]);
  });
});
