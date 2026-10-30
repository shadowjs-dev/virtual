import { describe, expect, it } from "vitest";
import { computeLayout, type LayoutInput } from "../src/index";

describe("computeLayout callbacks", () => {
  it("[VIR-R8-1] estimate and keyOf run as methods of the input, so a function that reads this keeps working", () => {
    const input: LayoutInput & { readonly base: number } = {
      base: 10,
      count: 2,
      estimate(this: { base: number }) {
        return this.base + 2;
      },
      measured: new Map(),
      keyOf(this: { base: number }, index: number) {
        return this.base + index;
      },
      gap: 0,
      paddingStart: 0,
      paddingEnd: 0,
    };
    expect(computeLayout(input).sizes).toEqual([12, 12]);
  });
});
