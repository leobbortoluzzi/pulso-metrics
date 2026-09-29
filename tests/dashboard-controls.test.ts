import { describe, expect, it } from "vitest"
import {
  dateRangeForDays,
  daysBetween,
} from "../src/components/dashboard/date-range-utils"
import { summarizeSales } from "../src/lib/sales"
import type { Sale } from "../src/lib/dashboard-data"

describe("dashboard date range helpers", () => {
  it("creates the requested inclusive number of days", () => {
    const range = dateRangeForDays(14)

    expect(daysBetween(range)).toBe(14)
    expect(range.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("handles invalid or reversed date ranges safely", () => {
    expect(daysBetween({ from: "invalid", to: "2026-09-28" })).toBe(1)
    expect(daysBetween({ from: "2026-09-28", to: "2026-09-27" })).toBe(1)
  })
})

describe("sales summary", () => {
  it("counts statuses and excludes unconverted approved amounts", () => {
    const rows: Sale[] = [
      sale({
        id: "approved-brl",
        amount: 100,
        status: "Aprovada",
        matched: true,
      }),
      sale({
        id: "approved-foreign",
        amount: 450,
        amountLabel: "R$ 450 aguardando PTAX",
        status: "Aprovada",
      }),
      sale({ id: "refunded", status: "Reembolsada", matched: true }),
      sale({ id: "chargeback", status: "Chargeback" }),
      sale({ id: "pending", status: "Aguardando" }),
    ]

    expect(summarizeSales(rows)).toEqual({
      total: 5,
      approved: 2,
      refunded: 1,
      chargebacks: 1,
      approvedRevenue: 100,
      refundedRevenue: 100,
      chargebackRevenue: 100,
      netRevenue: 100,
      refundRate: 25,
      arpu: 100,
      averageTicket: 100,
      approvedAmountCount: 1,
      matched: 2,
    })
  })

  it("returns a null average when no approved sale has converted currency", () => {
    const rows = [
      sale({
        amountLabel: "R$ 120 aguardando PTAX",
        status: "Aprovada",
      }),
    ]

    expect(summarizeSales(rows)).toMatchObject({
      approved: 1,
      approvedRevenue: 0,
      averageTicket: null,
      approvedAmountCount: 0,
    })
  })
})

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "sale-id",
    date: "2026-09-28",
    product: "Produto",
    buyer: "Cliente",
    gateway: "Hotmart",
    amount: 100,
    status: "Aprovada",
    campaign: "Campanha",
    matched: false,
    ...overrides,
  }
}
