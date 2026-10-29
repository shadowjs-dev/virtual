/**
 * Options that are not finite numbers, and index arguments outside the list. A virtualizer is fed
 * by application code, so a NaN count or a lanes value of NaN must not turn every row into NaN.
 */
import { describe, expect, it } from "vitest";
import { computeLayout } from "../src/index";
import { scrollable } from "./helpers/scrollable";

const rect = { width: 0, height: 100 };

describe("invalid options", () => {
  it("[VIR-40] a NaN or negative count is an empty list with no size", () => {
    for (const count of [Number.NaN, -3]) {
      const list = scrollable({ count, estimateSize: 10, initialRect: rect });
      expect(list.rowCount()).toBe(0);
      expect(list.items()).toEqual([]);
      expect(list.range()).toBeUndefined();
      expect(list.totalSize()).toBe(0);
    }
  });

  it("[VIR-41] a NaN lanes, overscan, gap or padding falls back to its default", () => {
    const reference = scrollable({ count: 5, estimateSize: 10, initialRect: rect });
    const broken = scrollable({
      count: 5,
      estimateSize: 10,
      initialRect: rect,
      lanes: Number.NaN,
      overscan: Number.NaN,
      gap: Number.NaN,
      paddingStart: Number.NaN,
      paddingEnd: Number.NaN,
    });
    expect(broken.rowCount()).toBe(5);
    expect(broken.totalSize()).toBe(reference.totalSize());
    expect(broken.items().map((item) => item.index)).toEqual(
      reference.items().map((item) => item.index),
    );
    expect(broken.items().map((item) => item.indexes)).toEqual([[0], [1], [2], [3], [4]]);
  });

  it("[VIR-42] a NaN or negative size estimate is laid out as the 1px minimum, never as NaN", () => {
    const layout = computeLayout({
      count: 3,
      estimate: (index) => (index === 1 ? Number.NaN : -5),
      measured: new Map(),
      keyOf: (index) => index,
      gap: 0,
      paddingStart: 0,
      paddingEnd: 0,
    });
    expect(layout.sizes).toEqual([1, 1, 1]);
    expect(layout.total).toBe(3);
    const list = scrollable({
      count: 3,
      estimateSize: () => Number.NaN,
      initialRect: rect,
    });
    expect(list.totalSize()).toBe(3);
    expect(Number.isNaN(list.items()[0]?.start)).toBe(false);
  });
});

describe("index arguments outside the list", () => {
  it("[VIR-43] scrollToIndex past the last row scrolls to the last row, not to the top", () => {
    const list = scrollable({ count: 100, estimateSize: 10, initialRect: rect });
    list.scrollToIndex(99, { align: "start" });
    const lastRowOffset = list.offset();
    expect(lastRowOffset).toBe(900);
    list.scrollToOffset(300);
    list.scrollToIndex(500, { align: "start" });
    expect(list.offset()).toBe(lastRowOffset);
  });

  it("[VIR-44] scrollToIndex below zero scrolls to the first row, and an empty list ignores the request", () => {
    const list = scrollable({ count: 100, estimateSize: 10, initialRect: rect });
    list.scrollToOffset(300);
    list.scrollToIndex(-4, { align: "start" });
    expect(list.offset()).toBe(0);
    const empty = scrollable({ count: 0, estimateSize: 10, initialRect: rect });
    expect(() => empty.scrollToIndex(5, { align: "start" })).not.toThrow();
    expect(empty.offset()).toBe(0);
  });
});
