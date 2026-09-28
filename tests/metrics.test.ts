import { describe, expect, it } from "vitest"
import {
  approvedRevenue,
  calculatePerformance,
  convertToBrl,
} from "../src/lib/metrics"
import { createPasswordHash, verifyPassword } from "../worker/secure-store"
import { normalizeSale } from "../worker/webhooks"

describe("first-access dashboard account", () => {
  it("stores a salted password hash and rejects a different password", async () => {
    const password = "senha segura para o workspace"
    const hash = await createPasswordHash(password)

    expect(hash).not.toContain(password)
    expect(hash.split("$")[0]).toBe("pbkdf2-sha256")
    expect(hash.split("$")[1]).toBe("100000")
    await expect(verifyPassword(password, hash)).resolves.toBe(true)
    await expect(verifyPassword("outra senha", hash)).resolves.toBe(false)
  })
})

describe("campaign performance formulas", () => {
  it("calculates ROAS, ROI and profit from net attributed revenue", () => {
    expect(calculatePerformance(250, 1000)).toEqual({
      spend: 250,
      revenue: 1000,
      profit: 750,
      roas: 4,
      roi: 3,
    })
  })

  it("does not invent ratios when spend is zero", () => {
    expect(calculatePerformance(0, 500)).toMatchObject({
      profit: 500,
      roas: null,
      roi: null,
    })
  })

  it("converts minor units with the PTAX selling rate", () => {
    expect(convertToBrl(1250, "USD", 5.2)).toBeCloseTo(65)
    expect(convertToBrl(1250, "BRL")).toBe(12.5)
    expect(convertToBrl(1250, "USD", 0)).toBeNull()
  })

  it("counts approved sales while excluding refunds and chargebacks", () => {
    expect(
      approvedRevenue([
        { amountBrl: 100, status: "approved" },
        { amountBrl: 50, status: "refunded" },
        { amountBrl: 20, status: "chargeback" },
        { amountBrl: null, status: "approved" },
      ])
    ).toBe(100)
  })
})

describe("gateway sale normalization", () => {
  it("keeps only transaction and attribution fields from a Hotmart event", () => {
    const normalized = normalizeSale("hotmart", {
      event: "PURCHASE_APPROVED",
      data: {
        buyer: { email: "private@example.com" },
        purchase: {
          transaction: "HP-123456789",
          status: "APPROVED",
          approved_date: "2026-09-27T12:00:00Z",
          full_price: { value: 97, currency_value: "BRL" },
          product: { id: 45, name: "Curso" },
          tracking: { utm_campaign_id: "1234567890", utm_source: "meta" },
        },
      },
    })
    expect(normalized).toMatchObject({
      externalId: "HP-123456789",
      status: "approved",
      productName: "Curso",
      amountMinor: 9700,
      campaignId: "1234567890",
      utmSource: "meta",
    })
    expect(normalized).not.toHaveProperty("buyer")
  })

  it("normalizes the documented Kiwify webhook fields without buyer data", () => {
    const normalized = normalizeSale("kiwify", {
      order_id: "KW-123",
      order_status: "paid",
      Commissions: { my_commission: "19900", currency: "BRL" },
      Product: { product_id: "lesson-1", product_name: "Aula" },
      TrackingParameters: { utm_campaign: "12345678", utm_content: "87654321" },
      Customer: { email: "private@example.com" },
    })
    expect(normalized).toMatchObject({
      externalId: "KW-123",
      status: "approved",
      amountMinor: 19900,
      productName: "Aula",
      campaignId: "12345678",
      adId: "87654321",
    })
    expect(normalized).not.toHaveProperty("Customer")
  })
})
