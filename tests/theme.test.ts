import { describe, expect, it } from "vitest"
import themeCss from "../src/index.css?raw"

// For this neutral palette, OKLCH lightness cubed is relative luminance.
function contrast(foreground: number, background: number) {
  const lighter = Math.max(foreground, background) ** 3
  const darker = Math.min(foreground, background) ** 3
  return (lighter + 0.05) / (darker + 0.05)
}

function palette(selector: string) {
  const block = themeCss.match(
    new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]+)`)
  )?.[1]
  if (!block) throw new Error(`Missing ${selector}: ${themeCss.slice(0, 200)}`)
  return Object.fromEntries(
    Array.from(
      block.matchAll(/--([\w-]+): oklch\(([\d.]+) 0 0\);/g),
      ([, name, lightness]) => [name, Number(lightness)]
    )
  )
}

describe.each([":root", ".dark"])("%s theme contrast", (selector) => {
  const colors = palette(selector)

  it("keeps body and secondary text readable on every main surface", () => {
    for (const background of ["background", "card", "muted", "sidebar"]) {
      for (const foreground of ["foreground", "muted-foreground"]) {
        expect(
          contrast(colors[foreground], colors[background])
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it("keeps paired component foregrounds readable", () => {
    for (const surface of [
      "primary",
      "secondary",
      "accent",
      "popover",
      "card",
    ]) {
      expect(
        contrast(colors[`${surface}-foreground`], colors[surface])
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps icons and focus outlines visible", () => {
    for (const surface of ["background", "card", "muted"]) {
      expect(
        contrast(colors.foreground, colors[surface])
      ).toBeGreaterThanOrEqual(3)
      expect(contrast(colors.ring, colors[surface])).toBeGreaterThanOrEqual(3)
    }
  })

  it("keeps chart series visible against the chart surface", () => {
    for (const series of [
      "chart-1",
      "chart-2",
      "chart-3",
      "chart-4",
      "chart-5",
    ]) {
      expect(contrast(colors[series], colors.card)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe("semantic theme colors", () => {
  it("uses theme tokens instead of fixed opaque element colors", () => {
    expect(themeCss).not.toMatch(/#[\da-f]{3,8}\b/i)
    expect(themeCss).not.toMatch(
      /(?:color|background|fill|stroke):\s*(?:white|black)\b/
    )
    expect(themeCss).not.toMatch(/color:\s*var\(--muted\)/)
  })

  it("sets native control color schemes for both themes", () => {
    expect(themeCss.split(":root {")[1].split("}")[0]).toContain(
      "color-scheme: light"
    )
    expect(themeCss.split(".dark {")[1].split("}")[0]).toContain(
      "color-scheme: dark"
    )
  })
})
