import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // node:sqlite is a very new (experimental) Node built-in — Vite's own
    // hardcoded Node-builtins allowlist predates it, so without this it
    // tries to resolve "sqlite" as a package instead of leaving it to Node.
    server: {
      deps: {
        external: [/^(node:)?sqlite$/],
      },
    },
  },
})
