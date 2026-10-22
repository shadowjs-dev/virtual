/**
 * The layout arithmetic of the virtualizer, with no DOM: offsets from sizes, the visible range,
 * the offset that aligns an item, and the sticky anchor. Property tests compare the binary searches
 * against a linear scan (fast-check, fixed seed).
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  alignedOffset,
  computeLayout,
  indexAtOffset,
  stickyStart,
  visibleRange,
} from "../src/internal/layout";

const sizes = (values: number[]) => (index: number) => values[index] ?? 10;

describe("computeLayout", () => {
  it("[VIR-1] starts are the running sum of sizes, offset by padding and gaps, and the total includes the end padding", () => {
    const layout = computeLayout({
      count: 3,
      estimate: sizes([10, 20, 30]),
      measured: new Map(),
      keyOf: (index) => index,
      gap: 2,
      paddingStart: 5,
      paddingEnd: 7,
    });
    expect(layout.starts).toEqual([5, 17, 39]);
    expect(layout.total).toBe(5 + 10 + 2 + 20 + 2 + 30 + 7);
  });

  it("[VIR-2] a measured size replaces the estimate under its key", () => {
    const layout = computeLayout({
      count: 2,
      estimate: () => 50,
      measured: new Map([["b", 12]]),
      keyOf: (index) => (index === 1 ? "b" : index),
      gap: 0,
      paddingStart: 0,
      paddingEnd: 0,
    });
    expect(layout.sizes).toEqual([50, 12]);
    expect(layout.total).toBe(62);
  });

  it("[VIR-3] an empty list has no items and no size", () => {
    const layout = computeLayout({
      count: 0,
      estimate: () => 10,
      measured: new Map(),
      keyOf: (index) => index,
      gap: 0,
      paddingStart: 0,
      paddingEnd: 0,
    });
    expect(layout.starts).toEqual([]);
    expect(layout.total).toBe(0);
    expect(indexAtOffset(layout, 100)).toBe(-1);
  });
});

describe("indexAtOffset and visibleRange", () => {
  const layoutOf = (values: number[]) =>
    computeLayout({
      count: values.length,
      estimate: sizes(values),
      measured: new Map(),
      keyOf: (index) => index,
      gap: 0,
      paddingStart: 0,
      paddingEnd: 0,
    });

  it("[VIR-4] the item at an offset is the last one that starts at or before it", () => {
    const layout = layoutOf([10, 10, 10]);
    expect([0, 9, 10, 19, 20, 500].map((offset) => indexAtOffset(layout, offset))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
  });

  it("[VIR-5] the visible range covers the viewport and adds overscan on both sides, clamped to the list", () => {
    const layout = layoutOf(Array.from({ length: 100 }, () => 10));
    expect(visibleRange(layout, 95, 20, 1)).toEqual({ start: 8, end: 12 });
    expect(visibleRange(layout, 0, 10, 2)).toEqual({ start: 0, end: 2 });
    expect(visibleRange(layout, 985, 500, 0)).toEqual({ start: 98, end: 99 });
    expect(visibleRange(layoutOf([]), 0, 100, 1)).toBeUndefined();
  });

  it("[VIR-6] binary search agrees with a linear scan (property, seed 42)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 80 }), { minLength: 1, maxLength: 60 }),
        fc.integer({ min: 0, max: 5000 }),
        (values, offset) => {
          const layout = layoutOf(values);
          let expected = 0;
          for (let index = 0; index < layout.starts.length; index += 1) {
            if ((layout.starts[index] ?? 0) <= offset) expected = index;
          }
          expect(indexAtOffset(layout, offset)).toBe(expected);
        },
      ),
      { seed: 42 },
    );
  });
});

describe("alignedOffset", () => {
  const layout = computeLayout({
    count: 10,
    estimate: () => 100,
    measured: new Map(),
    keyOf: (index) => index,
    gap: 0,
    paddingStart: 0,
    paddingEnd: 0,
  });

  it("[VIR-7] start, center and end place item 5 at the viewport edges and middle", () => {
    expect(alignedOffset(layout, 5, 300, 0, "start", 0, 0)).toBe(500);
    expect(alignedOffset(layout, 5, 300, 0, "center", 0, 0)).toBe(400);
    expect(alignedOffset(layout, 5, 300, 0, "end", 0, 0)).toBe(300);
  });

  it("[VIR-8] auto keeps the current offset when the item is already fully visible, and never leaves the scrollable range", () => {
    expect(alignedOffset(layout, 2, 300, 150, "auto", 0, 0)).toBe(150);
    expect(alignedOffset(layout, 0, 300, 450, "auto", 0, 0)).toBe(0);
    expect(alignedOffset(layout, 9, 300, 0, "start", 0, 0)).toBe(700);
  });

  it("[VIR-9] scroll padding keeps the target clear of the edge", () => {
    expect(alignedOffset(layout, 5, 300, 0, "start", 20, 0)).toBe(480);
    expect(alignedOffset(layout, 5, 300, 0, "end", 0, 20)).toBe(320);
  });
});

describe("stickyStart", () => {
  it("[VIR-10] an active sticky item stays at the top of the viewport while its own position is passed, and is pushed out by the next sticky item", () => {
    const layout = computeLayout({
      count: 10,
      estimate: () => 40,
      measured: new Map(),
      keyOf: (index) => index,
      gap: 0,
      paddingStart: 0,
      paddingEnd: 0,
    });
    // Item 0 is sticky. Scrolled to 100 the item (natural start 0) is pinned to 100.
    expect(stickyStart(layout, 0, [0], 100, 0)).toBe(100);
    // Item 3 (natural start 120) is pinned to the offset until item 4 (natural start 160) reaches
    // the top; then item 4 pushes item 3 up so the two never overlap.
    expect(stickyStart(layout, 3, [3, 4], 150, 0)).toBe(120);
    expect(stickyStart(layout, 3, [3, 4], 200, 0)).toBe(160);
  });
});
