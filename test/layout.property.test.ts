/**
 * Property tests of the range math: each rule is checked against a brute-force reference over random
 * lists, with a fixed seed so a failure reproduces. The examples in layout.test.ts pin single cases;
 * these pin the rules for every list the generators can build.
 */
import fc from "fast-check";
import { describe, it } from "vitest";
import {
  type Align,
  alignedOffset,
  computeLayout,
  type Layout,
  stickyStart,
  visibleRange,
} from "../src/internal/layout";

const SEED = 42;
const RUNS = 300;

/** A list: sizes from 1 to 90, gaps and paddings from 0 to 12. */
const listArb = fc.record({
  sizes: fc.array(fc.integer({ min: 1, max: 90 }), { minLength: 1, maxLength: 40 }),
  gap: fc.integer({ min: 0, max: 12 }),
  paddingStart: fc.integer({ min: 0, max: 12 }),
  paddingEnd: fc.integer({ min: 0, max: 12 }),
});

function layoutOf(input: {
  sizes: number[];
  gap: number;
  paddingStart: number;
  paddingEnd: number;
}): Layout {
  return computeLayout({
    count: input.sizes.length,
    estimate: (index) => input.sizes[index] ?? 0,
    measured: new Map(),
    keyOf: (index) => index,
    gap: input.gap,
    paddingStart: input.paddingStart,
    paddingEnd: input.paddingEnd,
  });
}

/** The row that holds pixel `pixel` (the last row whose start is at or before it). */
function rowContaining(layout: Layout, pixel: number): number {
  let found = 0;
  for (let index = 0; index < layout.starts.length; index += 1) {
    if ((layout.starts[index] ?? 0) <= pixel) found = index;
  }
  return found;
}

describe("computeLayout (properties)", () => {
  it("[VIR-45] starts are contiguous with the gaps, and the total is both paddings, every size and the gaps between rows", () => {
    fc.assert(
      fc.property(listArb, (input) => {
        const layout = layoutOf(input);
        const n = input.sizes.length;
        let expectedTotal = input.paddingStart + input.paddingEnd;
        for (let index = 0; index < n; index += 1) {
          expectedTotal += input.sizes[index] ?? 0;
          if (index > 0) expectedTotal += input.gap;
          const expectedStart =
            input.paddingStart +
            input.sizes.slice(0, index).reduce((sum, size) => sum + size, 0) +
            input.gap * index;
          if (layout.starts[index] !== expectedStart) throw new Error(`start ${index}`);
        }
        if (layout.total !== expectedTotal) throw new Error("total");
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("[VIR-46] a measured size replaces the estimate under its key and moves every later row by the difference", () => {
    fc.assert(
      fc.property(
        listArb,
        fc.integer({ min: 0, max: 39 }),
        fc.integer({ min: 1, max: 200 }),
        (input, rawIndex, measuredSize) => {
          const n = input.sizes.length;
          const index = rawIndex % n;
          const before = layoutOf(input);
          const after = computeLayout({
            count: n,
            estimate: (row) => input.sizes[row] ?? 0,
            measured: new Map([[index, measuredSize]]),
            keyOf: (row) => row,
            gap: input.gap,
            paddingStart: input.paddingStart,
            paddingEnd: input.paddingEnd,
          });
          if (after.sizes[index] !== measuredSize) throw new Error("measured size used");
          const delta = measuredSize - (input.sizes[index] ?? 0);
          if (after.total !== before.total + delta) throw new Error("total moves by the delta");
          for (let row = index + 1; row < n; row += 1) {
            if (after.starts[row] !== (before.starts[row] ?? 0) + delta) {
              throw new Error(`row ${row} moved by the wrong amount`);
            }
          }
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("visibleRange (properties)", () => {
  it("[VIR-47] with no overscan the range is exactly the rows that hold the first and last pixel in view", () => {
    fc.assert(
      fc.property(
        listArb,
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 400 }),
        (input, rawOffset, viewport) => {
          const layout = layoutOf(input);
          const offset = rawOffset % Math.max(1, layout.total);
          const range = visibleRange(layout, offset, viewport, 0);
          const first = rowContaining(layout, offset);
          const last = rowContaining(layout, Math.min(offset + viewport - 1, layout.total - 1));
          if (range === undefined) throw new Error("non-empty list has a range");
          if (range.start !== first || range.end !== last) {
            throw new Error(`expected ${first}..${last}, got ${range.start}..${range.end}`);
          }
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("[VIR-48] overscan widens the range by exactly that many rows on each side, clamped to the list", () => {
    fc.assert(
      fc.property(
        listArb,
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 0, max: 6 }),
        (input, rawOffset, viewport, overscan) => {
          const layout = layoutOf(input);
          const n = layout.starts.length;
          const offset = rawOffset % Math.max(1, layout.total);
          const bare = visibleRange(layout, offset, viewport, 0);
          const wide = visibleRange(layout, offset, viewport, overscan);
          if (bare === undefined || wide === undefined) throw new Error("range");
          if (wide.start !== Math.max(0, bare.start - overscan)) throw new Error("start");
          if (wide.end !== Math.min(n - 1, bare.end + overscan)) throw new Error("end");
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("alignedOffset (properties)", () => {
  const alignArb = fc.constantFrom<Align>("start", "center", "end", "auto");

  it("[VIR-49] every alignment lands inside the scrollable range", () => {
    fc.assert(
      fc.property(
        listArb,
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 400 }),
        alignArb,
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        (input, rawIndex, rawCurrent, viewport, align, padStart, padEnd) => {
          const layout = layoutOf(input);
          const index = rawIndex % layout.starts.length;
          const max = Math.max(0, layout.total - viewport);
          const target = alignedOffset(
            layout,
            index,
            viewport,
            rawCurrent,
            align,
            padStart,
            padEnd,
          );
          if (target < 0 || target > max) throw new Error(`${target} outside 0..${max}`);
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("[VIR-50] start, end and center place the row at the edge or middle, clamped to the scrollable range", () => {
    fc.assert(
      fc.property(
        listArb,
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        (input, rawIndex, viewport, padStart, padEnd) => {
          const layout = layoutOf(input);
          const index = rawIndex % layout.starts.length;
          const start = layout.starts[index] ?? 0;
          const size = layout.sizes[index] ?? 0;
          const max = Math.max(0, layout.total - viewport);
          const clamp = (value: number) => Math.min(Math.max(0, value), max);
          const at = (align: Align) =>
            alignedOffset(layout, index, viewport, 0, align, padStart, padEnd);
          if (at("start") !== clamp(start - padStart)) throw new Error("start");
          if (at("end") !== clamp(start + size - viewport + padEnd)) throw new Error("end");
          if (at("center") !== clamp(start + size / 2 - viewport / 2)) throw new Error("center");
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it("[VIR-51] auto does not scroll when the row is fully visible, and scrolls to the nearer edge otherwise", () => {
    fc.assert(
      fc.property(
        listArb,
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (input, rawIndex, rawCurrent, viewport, padStart, padEnd) => {
          const layout = layoutOf(input);
          const index = rawIndex % layout.starts.length;
          const max = Math.max(0, layout.total - viewport);
          const current = Math.min(rawCurrent, max);
          const start = layout.starts[index] ?? 0;
          const end = start + (layout.sizes[index] ?? 0);
          const visible = start >= current + padStart && end <= current + viewport - padEnd;
          const target = alignedOffset(layout, index, viewport, current, "auto", padStart, padEnd);
          if (visible) {
            if (target !== current) throw new Error("moved a visible row");
          } else if (start < current + padStart) {
            if (target !== Math.min(Math.max(0, start - padStart), max)) throw new Error("above");
          } else if (target !== Math.min(Math.max(0, end - viewport + padEnd), max)) {
            throw new Error("below");
          }
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

describe("stickyStart (properties)", () => {
  it("[VIR-52] a sticky row is never drawn above its place, is at the top once passed, and never overlaps the next sticky row", () => {
    fc.assert(
      fc.property(
        listArb,
        fc.array(fc.integer({ min: 0, max: 39 }), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 20 }),
        (input, rawSticky, rawOffset, padStart) => {
          const layout = layoutOf(input);
          const n = layout.starts.length;
          const sticky = [...new Set(rawSticky.map((row) => row % n))].sort((a, b) => a - b);
          const offset = rawOffset % Math.max(1, layout.total);
          for (const index of sticky) {
            const natural = layout.starts[index] ?? 0;
            const size = layout.sizes[index] ?? 0;
            const drawn = stickyStart(layout, index, sticky, offset, padStart);
            if (drawn < natural) throw new Error("drawn above its place");
            const next = sticky.find((candidate) => candidate > index);
            if (next === undefined) {
              if (drawn !== Math.max(offset + padStart, natural)) throw new Error("last pinned");
            } else {
              const nextStart = layout.starts[next] ?? 0;
              if (drawn + size > Math.max(offset + padStart, nextStart)) throw new Error("overlap");
            }
          }
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
  });
});
