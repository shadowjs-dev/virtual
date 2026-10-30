<p align="center"><img src="https://raw.githubusercontent.com/shadowjs-dev/virtual/main/.github/banner.png" alt="ShadowJS" width="100%"></p>

# @shadow-js/virtual

[![npm](https://img.shields.io/npm/v/@shadow-js/virtual.svg)](https://www.npmjs.com/package/@shadow-js/virtual)
[![CI](https://github.com/shadowjs-dev/virtual/actions/workflows/ci.yml/badge.svg)](https://github.com/shadowjs-dev/virtual/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://github.com/shadowjs-dev/virtual/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue.svg)](https://www.typescriptlang.org/)

Headless virtualization for ShadowJS 1.0.0: the rows of a long list that are in view, measured row sizes,
scrolling to a row with alignment, sticky rows, grids (`lanes`), horizontal and right-to-left lists, and an
infinite-loading hook. It renders nothing: you render the rows it returns. Everything is signals, so a scroll
updates the rows and the total height only.

## Install

```sh
npm install @shadow-js/virtual
```

## Quick start

```ts title="virtual.test.ts" test
import { createVirtualizer } from "@shadow-js/virtual";
import { expect, it } from "vitest";

it("returns the rows in view with overscan", () => {
  const list = createVirtualizer({
    count: 1000,
    estimateSize: 30,
    overscan: 1,
    initialRect: { width: 0, height: 90 },
  });
  expect(list.items().map((item) => item.index)).toEqual([0, 1, 2, 3]);
  expect(list.totalSize()).toBe(30000);
});
```

In a component, `useVirtualizer({ count, estimateSize, getScrollElement })` attaches to the scroll element
on mount and detaches on dispose; render `list.items()` inside the element sized to `list.totalSize()`.

## API

- `createVirtualizer(options)`: the virtualizer (`items`, `totalSize`, `range`, `offset`, `measureElement`, `measure`, `attach`).
- `@shadow-js/virtual/scroll-to`: `withScrollTo(list)` adds `scrollToIndex` and `scrollToOffset`.
- `@shadow-js/virtual/sticky`: `withSticky(list, indexes)` makes rows sticky.
- `useVirtualizer(options)`: `createVirtualizer` attached to the owner's mount.
- `useInfiniteLoader({ virtualizer, hasMore, loadMore, threshold })`: loads the next page near the end; returns `loading`, `error` and `retry()`.
- `computeLayout(input)`: the layout arithmetic (starts, sizes, total) as a pure function.

## Links

- Reference: `/reference/virtual/` on the documentation site.

## Production error codes

A production build keeps a short code instead of the development explanation, so message text never reaches user bundles. Search this table for the code.

| Code | Development explanation |
| --- | --- |
| `VIRTUAL_KERNEL` | not a virtualizer created by createVirtualizer. |

## Dependencies

- Runtime: none.
- Peers: `@shadow-js/core` and `@shadow-js/web` `^1.0.3`: reactive state and rendering for the virtualizers.

## Types

- Names from the root: `createVirtualizer`, `ScrollableVirtualizer`, `InfiniteLoader`, `InfiniteLoaderOptions`, `ScrollToOptions`, `Align`, `Layout`, `computeLayout`.
- Type tests in `test-types/` are compile-time checks; `npm run typecheck:types` runs them.

## Support

- Node.js `>=22.12.0`. ESM only: use `import`; `require` is not supported.
- Browsers: current evergreen releases.
- Versioning: every `@shadow-js/*` package releases together at one version. Upgrade them as one set.
- Documentation: [ShadowJS documentation](https://shadowjs.net).

## Using, changing and contributing

- **Use the package** (a person or a coding agent that builds with it): this README, and [SKILL.md](SKILL.md), the short page an agent reads first.
- **Change the package** (fix a bug, add a feature): [AGENTS.md](AGENTS.md) says how the repository is laid out, how to implement and test a change, and how a pull request is reviewed. It is written for people and coding agents alike.
- **Take part**: [CONTRIBUTING.md](CONTRIBUTING.md) is the short guide; [SECURITY.md](SECURITY.md) is for vulnerabilities.
