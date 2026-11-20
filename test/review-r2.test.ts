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

describe("measuring rows keeps the cached layout exact", () => {
  it("[VIR-G14b] after measurements in any order, starts, sizes and total equal a layout computed from scratch", () => {
    const sizes = [44, 12, 90, 30, 61];
    const measureSize = (element: Element): number =>
      sizes[Number(element.getAttribute("data-index")) % sizes.length] as number;
    const rowElement = (index: number) =>
      ({ isConnected: true, getAttribute: () => String(index) }) as unknown as Element;
    const patched = scrollable({
      count: 40,
      estimateSize: 25,
      gap: 3,
      paddingStart: 7,
      paddingEnd: 5,
      initialRect: { width: 0, height: 200 },
      measureSize,
    });
    patched.items();
    for (const row of [9, 0, 39, 17, 9, 3, 22]) patched.measureElement(rowElement(row));
    // The same measurements, with no layout read in between: one full computation at the end.
    const fresh = scrollable({
      count: 40,
      estimateSize: 25,
      gap: 3,
      paddingStart: 7,
      paddingEnd: 5,
      initialRect: { width: 0, height: 200 },
      measureSize,
    });
    for (const row of [9, 0, 39, 17, 3, 22]) fresh.measureElement(rowElement(row));
    // A size change after the first measurement of a row is patched too.
    sizes[9 % sizes.length] = 70;
    patched.measureElement(rowElement(9));
    fresh.measureElement(rowElement(9));
    expect(patched.totalSize()).toBe(fresh.totalSize());
    expect(patched.items().map((item) => [item.index, item.start, item.size])).toEqual(
      fresh.items().map((item) => [item.index, item.start, item.size]),
    );
    patched.scrollToOffset(600);
    fresh.scrollToOffset(600);
    expect(patched.items().map((item) => [item.index, item.start, item.size])).toEqual(
      fresh.items().map((item) => [item.index, item.start, item.size]),
    );
  });
});

describe("the measurements that wait for a read are bounded", () => {
  it("[VIR-G14c] 600 rows measured with no read in between (more than the 256 kept) give the layout a full computation gives", () => {
    const measureSize = (element: Element): number =>
      20 + (Number(element.getAttribute("data-index")) % 9);
    const rowElement = (index: number) =>
      ({ isConnected: true, getAttribute: () => String(index) }) as unknown as Element;
    const options = {
      count: 1000,
      estimateSize: 30,
      initialRect: { width: 0, height: 300 },
      measureSize,
    };
    const many = scrollable(options);
    many.items();
    for (let row = 599; row >= 0; row -= 1) many.measureElement(rowElement(row));
    const once = scrollable(options);
    for (let row = 0; row < 600; row += 1) once.measureElement(rowElement(row));
    expect(many.totalSize()).toBe(once.totalSize());
    many.scrollToOffset(9000);
    once.scrollToOffset(9000);
    expect(many.items().map((item) => [item.index, item.start])).toEqual(
      once.items().map((item) => [item.index, item.start]),
    );
  });
});
