---
name: shadowjs-virtual
description: "Work with @shadow-js/virtual. Headless list and grid virtualization that renders only the rows in view. Use when a project imports it, or when asked to add, configure or debug it."
---

# @shadow-js/virtual

Version 1.0.3. Headless list and grid virtualization that renders only the rows in view.

## Where to read more

- @shadow-js/virtual: https://virtual.shadowjs.net
- Source and issues: https://github.com/shadowjs-dev/virtual
- The package README is the full reference for options and behavior; read it before changing a configuration.

## Install

```sh
npm install @shadow-js/virtual @shadow-js/core @shadow-js/web
```

## Peer dependencies

| Package | Range | Required |
| --- | --- | --- |
| `@shadow-js/core` | `^1.0.3` | yes |
| `@shadow-js/web` | `^1.0.3` | yes |

## Import paths

Import only from these paths. Never from `dist` or `src`: files that are not listed here are private and change without notice.

- `@shadow-js/virtual`
- `@shadow-js/virtual/scroll-to`
- `@shadow-js/virtual/sticky`

## Quick start

```ts
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

## Working rules

- Run `npm run check` before proposing a change; it lints, builds, type-checks and tests.
- Keep a public change documented: TSDoc on every exported symbol, and a CHANGELOG entry.
- To change this repository rather than use the package, read AGENTS.md: the layout, the commands, the rules and how a pull request is reviewed.
