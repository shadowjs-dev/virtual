/**
 * Review round: a right-to-left window list with a scroll margin writes the negative of offset plus
 * margin, and `scrollToIndex` with an infinite index goes to the matching end of the list.
 */
import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { scrollable } from "./helpers/scrollable";

const spies: MockInstance[] = [];

afterEach(() => {
  document.body.innerHTML = "";
  for (const spy of spies.splice(0)) spy.mockRestore();
});

function listElement(): { element: HTMLElement; scrollTo: ReturnType<typeof vi.fn> } {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: 50 });
  Object.defineProperty(element, "clientHeight", { value: 50 });
  Object.defineProperty(element, "scrollTop", { value: 0, writable: true });
  const scrollTo = vi.fn();
  element.scrollTo = scrollTo as unknown as typeof element.scrollTo;
  document.body.append(element);
  return { element, scrollTo };
}

describe("scroll positions at the edges", () => {
  it("[VIR-REV-1] a right-to-left list on the window adds the scroll margin on the negative side, as it reads it back", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    spies.push(scrollTo);
    Object.defineProperty(window, "scrollX", { value: 0, writable: true, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 320, writable: true, configurable: true });
    const virtualizer = scrollable({
      count: 100,
      horizontal: true,
      rtl: true,
      estimateSize: 10,
      scrollMargin: 100,
      getScrollElement: () => window,
    });
    const detach = virtualizer.attach();
    virtualizer.scrollToOffset(30);
    // The page is 130 from its start, and an RTL page reports that as scrollX -130.
    expect(scrollTo).toHaveBeenLastCalledWith({ left: -130, behavior: "auto" });
    Object.defineProperty(window, "scrollX", { value: -130, writable: true, configurable: true });
    window.dispatchEvent(new Event("scroll"));
    expect(virtualizer.offset()).toBe(30);
    detach();
    delete (window as unknown as Record<string, unknown>)["scrollX"];
    delete (window as unknown as Record<string, unknown>)["innerWidth"];
  });

  it("[VIR-REV-2] scrollToIndex(Infinity) scrolls to the last row and scrollToIndex(-Infinity) to the first", () => {
    const { element, scrollTo } = listElement();
    const virtualizer = scrollable({
      count: 100,
      estimateSize: 10,
      overscan: 0,
      getScrollElement: () => element,
    });
    const detach = virtualizer.attach();
    virtualizer.scrollToIndex(Number.POSITIVE_INFINITY, { align: "end" });
    // 100 rows of 10 in a viewport of 50: the end of the list is at 950.
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 950, behavior: "auto" });
    virtualizer.scrollToIndex(Number.NEGATIVE_INFINITY, { align: "start" });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
    detach();
  });
});
