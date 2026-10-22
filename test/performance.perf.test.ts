/**
 * Performance budgets for lists of a million rows. The budgets are generous for a loaded CI machine:
 * a scroll must not re-lay-out the list, and one measurement may re-lay-out it once. Each test takes
 * the median of several runs, so one slow run does not fail it.
 */
import { describe, expect, it } from "vitest";
import { scrollable } from "./helpers/scrollable";

const ROWS = 1_000_000;
/** The budget of one `items()` call during a scroll, in milliseconds (median). */
const SCROLL_READ_BUDGET_MS = 1;
/** The budget of the one layout pass a measurement triggers at a million rows, in milliseconds. */
const LAYOUT_PASS_BUDGET_MS = 90;

/** The median of `samples` timings of `run`, in milliseconds. */
function medianMs(samples: number, run: (sample: number) => void): number {
  const times: number[] = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    run(sample);
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] ?? 0;
}

describe("virtualizer performance budgets", () => {
  it("[VIR-75] reading the rows during a scroll costs a fraction of a millisecond at a million rows", () => {
    const list = scrollable({
      count: ROWS,
      estimateSize: 30,
      overscan: 4,
      initialRect: { width: 0, height: 900 },
    });
    list.items();
    const median = medianMs(41, (sample) => {
      list.scrollToOffset(sample * 997);
      list.items();
      list.totalSize();
    });
    expect(median).toBeLessThan(SCROLL_READ_BUDGET_MS);
  });

  it("[VIR-76] one measurement re-lays-out a million rows within the layout budget", () => {
    const list = scrollable({
      count: ROWS,
      estimateSize: 30,
      overscan: 4,
      initialRect: { width: 0, height: 900 },
      measureSize: (_element, horizontal) => (horizontal ? 1 : 42),
    });
    list.items();
    const median = medianMs(9, (sample) => {
      const row = {
        isConnected: true,
        getAttribute: () => String(sample),
      } as unknown as Element;
      list.measureElement(row);
      list.items();
    });
    expect(median).toBeLessThan(LAYOUT_PASS_BUDGET_MS);
    expect(list.totalSize()).toBeGreaterThan(30 * ROWS);
  });
});
