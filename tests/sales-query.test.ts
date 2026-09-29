import { describe, expect, it } from "vitest"
import { querySales } from "../worker/sales-query"

describe("sales query", () => {
  it("applies filters with bound values and returns the unpaged summary", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = []
    const database = {
      prepare(sql: string) {
        const record = { sql, values: [] as unknown[] }
        statements.push(record)
        const statement = {
          bind(...values: unknown[]) {
            record.values = values
            return statement
          },
          async all() {
            return { results: [{ external_id: "sale-1" }] }
          },
          async first() {
            return {
              total: 23,
              approved_count: 12,
              refunded_count: 2,
              chargeback_count: 1,
              approved_revenue_brl: 4200,
              approved_amount_count: 10,
              matched_count: 18,
            }
          },
        }
        return statement
      },
    } as unknown as D1Database

    const result = await querySales(database, {
      from: "2026-09-01",
      to: "2026-09-28",
      accountIds: ["act_1"],
      provider: "hotmart",
      product: "Curso",
      status: "all",
      attribution: "matched",
      query: "curso_%",
      limit: 25,
      offset: 25,
    })

    expect(result).toMatchObject({
      sales: [{ external_id: "sale-1" }],
      total: 23,
      limit: 25,
      offset: 25,
      summary: {
        total: 23,
        approved: 12,
        refunded: 2,
        chargebacks: 1,
        approvedRevenue: 4200,
        averageTicket: 420,
        approvedAmountCount: 10,
        matched: 18,
      },
    })
    expect(statements).toHaveLength(2)
    expect(statements[0].sql).toContain("campaign_id IS NOT NULL")
    expect(statements[0].sql).toContain("LIKE ? ESCAPE '!'")
    expect(statements[0].values).toEqual([
      "2026-09-01",
      "2026-09-28",
      "act_1",
      "hotmart",
      "Curso",
      ...Array.from({ length: 11 }, () => "%curso!_!%%"),
      25,
      25,
    ])
    expect(statements[1].values).toEqual(statements[0].values.slice(0, -2))
  })
})
