/**
 * The internal handle a feature entry uses to extend a virtualizer: the layout, the signals and the
 * element, plus two hooks the core calls when a measurement or a scroll event happens. Only the
 * package's own entries reach it (through {@link kernelOf}); it is not part of the public API.
 * @packageDocumentation
 */
import type { VirtualItem } from "../virtualizer";
import type { Layout } from "./layout";

/** What a feature entry needs from a virtualizer. Hooks are optional: the core checks them. */
export interface Kernel {
  /** Items per row (`lanes`, at least 1). */
  readonly lanes: number;
  /** True for a horizontal list. */
  readonly horizontal: boolean;
  /** True for a right-to-left horizontal list. */
  readonly rtl: boolean;
  /** Distance from the page start to the list (window scroller). */
  readonly scrollMargin: number;
  /** Space kept clear at the start of the viewport. */
  readonly scrollPaddingStart: number;
  /** Space kept clear at the end of the viewport. */
  readonly scrollPaddingEnd: number;
  /** The layout of the rows. Reads the count and the measured sizes (tracked). */
  layout(): Layout;
  /** The number of rows (tracked). */
  rowCount(): number;
  /** The current scroll offset (tracked). */
  offset(): number;
  /** The viewport size along the list's axis (tracked). */
  viewport(): number;
  /** Sets the offset signal. The element is not written: a feature does that. */
  setOffset(next: number): void;
  /** The scrolled element once attached (a window included), otherwise `null`. */
  element(): HTMLElement | Window | null;
  /**
   * Builds the rows to list for a range (a feature may add rows, such as pinned sticky rows). `make`
   * builds the plain item of one row. Without this hook the core lists the rows in view.
   */
  items?: (
    range: { readonly start: number; readonly end: number },
    layout: Layout,
    make: (row: number) => VirtualItem,
  ) => readonly VirtualItem[];
  /** Called after a measurement changed a size. */
  measured?: () => void;
  /** Called on every scroll event with the offset it read. */
  scrolled?: (offset: number) => void;
}

/** The kernel of every virtualizer created by `createVirtualizer`, keyed by the virtualizer object. */
const kernels = new WeakMap<object, Kernel>();

/** Records the kernel of a virtualizer. Called by `createVirtualizer`. */
export function registerKernel(virtualizer: object, kernel: Kernel): void {
  kernels.set(virtualizer, kernel);
}

/**
 * The kernel of a virtualizer, for a feature entry. Throws when the object is not a virtualizer
 * created by this package.
 */
export function kernelOf(virtualizer: object): Kernel {
  const kernel = kernels.get(virtualizer);
  if (kernel === undefined)
    throw new TypeError("[shadow-js/virtual] not a virtualizer created by createVirtualizer");
  return kernel;
}
