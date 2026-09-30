import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    // Preserve the raw stylesheet for palette and contrast regression checks.
    css: { include: [/src\/index\.css\?raw$/] },
  },
})
