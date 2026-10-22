import { createConfig } from "./build/tsdown-preset.mjs";

export default createConfig({
  packageDir: import.meta.dirname,
  entries: {
    index: "src/index.ts",
    "scroll-to": "src/scroll-to.ts",
    sticky: "src/sticky.ts",
  },
});
