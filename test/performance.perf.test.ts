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

  it("[VIR-G14] fifty rows measured in one pass of a million-row list cost about one layout pass, not fifty", () => {
    const list = scrollable({
      count: ROWS,
      estimateSize: 30,
      overscan: 4,
      initialRect: { width: 0, height: 900 },
      measureSize: (element, horizontal) =>
        horizontal ? 1 : 40 + (Number(element.getAttribute("data-index")) % 7),
    });
    list.items();
    const rowElement = (index: number) =>
      ({ isConnected: true, getAttribute: () => String(index) }) as unknown as Element;
    let pass = 0;
    const median = medianMs(5, () => {
      // Each sample measures fifty rows not measured before, as a list that shows a new screen does.
      for (let row = 0; row < 50; row += 1) list.measureElement(rowElement(pass * 50 + row));
      pass += 1;
      list.items();
    });
    // Fifty full passes would take fifty times the budget of one; patching the cached layout shifts numbers only.
    expect(median).toBeLessThan(LAYOUT_PASS_BUDGET_MS * 2);
  });
});
