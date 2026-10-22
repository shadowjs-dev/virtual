/**
 * `@shadow-js/virtual`: headless virtualization. Rows in view, measurement, sticky rows, grids, RTL and
 * infinite loading, over signals. Scrolling to a row is in `@shadow-js/virtual/scroll-to`.
 * @packageDocumentation
 */

export type { InfiniteLoader, InfiniteLoaderOptions } from "./infinite";
export { useInfiniteLoader } from "./infinite";
export type { Align } from "./internal/layout";
export { computeLayout, type Layout, type LayoutInput } from "./internal/layout";
// The scroll methods are an opt-in entry (`@shadow-js/virtual/scroll-to`): only their types are here.
export type { ScrollableVirtualizer, ScrollToOptions } from "./scroll-to";
export type {
  SizeEstimate,
  VirtualItem,
  Virtualizer,
  VirtualizerOptions,
} from "./virtualizer";
export { createVirtualizer, useVirtualizer } from "./virtualizer";
