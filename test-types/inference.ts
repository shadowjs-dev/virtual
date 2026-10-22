import type { Accessor } from "@shadow-js/core";
import type { ScrollableVirtualizer, ScrollToOptions } from "../src/index";
import {
  type Align,
  computeLayout,
  createVirtualizer,
  type InfiniteLoader,
  type InfiniteLoaderOptions,
  type Layout,
  type LayoutInput,
  type SizeEstimate,
  useInfiniteLoader,
  useVirtualizer,
  type VirtualItem,
  type Virtualizer,
  type VirtualizerOptions,
} from "../src/index";
import { withScrollTo } from "../src/scroll-to";
import type { Equal, Expect } from "./support";

const count: Accessor<number> = () => 100;

// Positive: factories return the public interfaces.
const virtualizer = createVirtualizer({ count: 100, estimateSize: 40 });
type _Created = Expect<Equal<typeof virtualizer, Virtualizer>>;

const hooked = useVirtualizer({ count });
type _Hooked = Expect<Equal<typeof hooked, Virtualizer>>;

// Positive: the count option takes a number or an accessor.
const fromAccessor = createVirtualizer({ count });
type _FromAccessor = Expect<Equal<typeof fromAccessor, Virtualizer>>;

// Positive: estimateSize takes a constant or a per-index function.
const byIndex: SizeEstimate = (index) => (index % 2 === 0 ? 30 : 60);
const withEstimate = createVirtualizer({ count: 10, estimateSize: byIndex });
type _WithEstimate = Expect<Equal<typeof withEstimate, Virtualizer>>;

// Positive: the read side of the virtualizer.
const rows = virtualizer.items();
type _Items = Expect<Equal<typeof rows, readonly VirtualItem[]>>;

const range = virtualizer.range();
type _Range = Expect<
  Equal<typeof range, { readonly start: number; readonly end: number } | undefined>
>;

const detach = virtualizer.attach();
type _Attach = Expect<Equal<typeof detach, () => void>>;

type _Total = Expect<Equal<ReturnType<Virtualizer["totalSize"]>, number>>;
type _Rows = Expect<Equal<ReturnType<Virtualizer["rowCount"]>, number>>;
type _Scrolling = Expect<Equal<ReturnType<Virtualizer["isScrolling"]>, boolean>>;

// Positive: VirtualItem fields.
type _ItemIndex = Expect<Equal<VirtualItem["index"], number>>;
type _ItemKey = Expect<Equal<VirtualItem["key"], unknown>>;
type _ItemIndexes = Expect<Equal<VirtualItem["indexes"], readonly number[]>>;
type _ItemSticky = Expect<Equal<VirtualItem["isSticky"], boolean>>;

// Positive: the align union and the infinite loader.
type _Align = Expect<Equal<Align, "start" | "center" | "end" | "auto">>;

const scrollable = withScrollTo(virtualizer);
type _Scrollable = Expect<Equal<typeof scrollable, ScrollableVirtualizer>>;

const scrollOptions: ScrollToOptions = { align: "center", behavior: "smooth" };
type _ScrollOptions = Expect<Equal<typeof scrollOptions, ScrollToOptions>>;

const loaderOptions: InfiniteLoaderOptions = {
  virtualizer,
  hasMore: () => true,
  loadMore: () => undefined,
};
const loader = useInfiniteLoader(loaderOptions);
type _Loader = Expect<Equal<typeof loader, InfiniteLoader>>;
type _Loading = Expect<Equal<InfiniteLoader["loading"], Accessor<boolean>>>;
type _LoaderError = Expect<Equal<InfiniteLoader["error"], Accessor<unknown>>>;

// Positive: computeLayout returns starts, sizes and total.
const layoutInput: LayoutInput = {
  count: 3,
  estimate: () => 20,
  measured: new Map<unknown, number>(),
  keyOf: (index) => index,
  gap: 0,
  paddingStart: 0,
  paddingEnd: 0,
};
const layout = computeLayout(layoutInput);
type _Layout = Expect<Equal<typeof layout, Layout>>;
type _LayoutTotal = Expect<Equal<Layout["total"], number>>;

// Negative: the virtualizer options are checked.
// @ts-expect-error count is required
createVirtualizer({ estimateSize: 40 });

// @ts-expect-error count must be a number or an accessor, not a string
createVirtualizer({ count: "100" });

// @ts-expect-error estimateSize does not take a string
createVirtualizer({ count: 10, estimateSize: "large" });

// @ts-expect-error lanes must be a number
createVirtualizer({ count: 10, lanes: "2" });

// @ts-expect-error unknown options are rejected on an object literal
createVirtualizer({ count: 10, unknownOption: true });

const typedOptions: VirtualizerOptions = { count: 10 };
type _TypedOptions = Expect<Equal<typeof typedOptions, VirtualizerOptions>>;

// Negative: the read side is readonly and the plain virtualizer has no scroll methods.
// @ts-expect-error items() returns a readonly array
const mutableRows: VirtualItem[] = virtualizer.items();

// @ts-expect-error the plain virtualizer has no scrollToIndex
virtualizer.scrollToIndex(1);

// @ts-expect-error a plain virtualizer is not a ScrollableVirtualizer
const notScrollable: ScrollableVirtualizer = virtualizer;

// @ts-expect-error a range is not a number
const badRange: number = virtualizer.range();

// @ts-expect-error align does not accept an arbitrary string
const badScroll: ScrollToOptions = { align: "top" };

// @ts-expect-error the loader requires hasMore
useInfiniteLoader({ virtualizer, loadMore: () => undefined });

// @ts-expect-error the loader requires a virtualizer
useInfiniteLoader({ hasMore: () => true, loadMore: () => undefined });

// @ts-expect-error layout starts are readonly
layout.starts.push(0);

// @ts-expect-error computeLayout requires the full input
computeLayout({ count: 3 });
