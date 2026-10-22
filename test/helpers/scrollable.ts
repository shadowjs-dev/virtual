/** Test helper: a virtualizer with the scroll-to entry, as an application using `scrollToIndex` would have. */
import { createVirtualizer, type VirtualizerOptions } from "../../src/index";
import { type ScrollableVirtualizer, withScrollTo } from "../../src/scroll-to";

export function scrollable(options: VirtualizerOptions): ScrollableVirtualizer {
  return withScrollTo(createVirtualizer(options));
}
