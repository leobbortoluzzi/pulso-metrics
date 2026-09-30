import { describe, expect, it } from "vitest"
import themeCss from "../src/index.css?raw"

type Color = number[]

function contrast(foreground: Color, background: Color) {
  function luminance(color: Color) {
    return color.reduce((sum, channel, index) => {
      const value = channel / 255
      const linear =
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      return sum + linear * [0.2126, 0.7152, 0.0722][index]
    }, 0)
  }
  const left = luminance(foreground)
  const right = luminance(background)
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05)
}

function declarations(selector: string) {
  const block = themeCss.match(
    new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]+)`)
  )?.[1]
  if (!block) throw new Error(`Missing theme: ${selector}`)
  return Object.fromEntries(
    Array.from(block.matchAll(/--([\w-]+):\s*([^;]+);/g), ([, name, value]) => [
      name,
      value,
    ])
  )
}

function palette(selector: string) {
  const values = { ...declarations(":root"), ...declarations(selector) }
  function resolve(name: string): Color {
    const value = values[name]
      ?.replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .trim()
    if (/^#[\da-f]{6}$/i.test(value)) {
      return [1, 3, 5].map((offset) =>
        parseInt(value.slice(offset, offset + 2), 16)
      )
    }
    const alias = value?.match(/^var\(--([\w-]+)\)$/)
    if (alias) return resolve(alias[1])
    const mix = value?.match(
      /^color-mix\(in srgb, var\(--([\w-]+)\) (\d+)%, var\(--([\w-]+)\)\)$/
    )
    if (mix) {
      const weight = Number(mix[2]) / 100
      const background = resolve(mix[3])
      return resolve(mix[1]).map(
        (channel, index) => channel * weight + background[index] * (1 - weight)
      )
    }
    throw new Error(`Unsupported theme color: ${name}=${value}`)
  }
  return resolve
}

describe.each([":root", ".dark"])("%s theme contrast", (selector) => {
  const color = palette(selector)

  it("keeps body and secondary text readable on every main surface", () => {
    for (const background of ["background", "card", "muted", "sidebar"]) {
      for (const foreground of ["foreground", "muted-foreground"]) {
        expect(
          contrast(color(foreground), color(background))
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it("keeps component foregrounds readable", () => {
    for (const surface of [
      "primary",
      "secondary",
      "accent",
      "popover",
      "card",
    ]) {
      expect(
        contrast(color(`${surface}-foreground`), color(surface))
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("keeps icons and focus outlines visible", () => {
    for (const surface of ["background", "card", "muted"]) {
      expect(
        contrast(color("foreground"), color(surface))
      ).toBeGreaterThanOrEqual(3)
      expect(contrast(color("ring"), color(surface))).toBeGreaterThanOrEqual(3)
    }
  })

  it("keeps rendered chart strokes visible", () => {
    for (const series of ["chart-revenue-stroke", "chart-spend-stroke"]) {
      expect(contrast(color(series), color("card"))).toBeGreaterThanOrEqual(3)
    }
  })

  it("keeps error text readable on cards and tinted alerts", () => {
    const tinted = color("destructive").map(
      (channel, index) => channel * 0.2 + color("card")[index] * 0.8
    )
    expect(
      contrast(color("destructive-text"), color("card"))
    ).toBeGreaterThanOrEqual(4.5)
    expect(contrast(color("destructive-text"), tinted)).toBeGreaterThanOrEqual(
      4.5
    )
  })
})

describe("semantic theme colors", () => {
  it("keeps the requested palette colors", () => {
    expect(declarations(":root")).toMatchObject({
      background: "#fcfcfc",
      primary: "#000000",
      "chart-1": "#ffae04",
      "chart-2": "#2d62ef",
      destructive: "#e54b4f",
    })
    expect(declarations(".dark")).toMatchObject({
      background: "#000000",
      primary: "#ffffff",
      "chart-1": "#ffae04",
      "chart-2": "#2671f4",
      destructive: "#ff5b5b",
    })
  })

  it("uses tokens instead of fixed colors in element rules", () => {
    const elementRules = themeCss.replace(/--[\w-]+:[^;]+;/g, "")
    expect(elementRules).not.toMatch(/#[\da-f]{3,8}\b/i)
    expect(elementRules).not.toMatch(/(?:rgb|hsl)a?\(/)
    expect(elementRules).not.toMatch(
      /(?:color|background|fill|stroke):\s*(?:white|black)\b/
    )
    expect(elementRules).not.toMatch(/color:\s*var\(--muted\)/)
  })

  it("uses the palette instead of element-specific dark overrides", () => {
    expect(themeCss).not.toMatch(/\.dark\s+\.[\w-]/)
    expect(themeCss).toContain("background: var(--sidebar-accent)")
    expect(themeCss).toContain("background: var(--overlay)")
  })

  it("keeps the native control reset from overriding UI component colors", () => {
    expect(themeCss).toContain("button:not([data-slot])")
    expect(themeCss).not.toContain('button:not([data-slot="button"])')
  })

  it("matches each chart fill to its series", () => {
    expect(themeCss).toMatch(
      /\.chart-area-revenue\s*\{\s*fill: var\(--chart-1\)/
    )
    expect(themeCss).toMatch(/\.chart-area-spend\s*\{\s*fill: var\(--chart-3\)/)
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
