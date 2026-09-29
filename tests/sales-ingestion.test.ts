import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, it } from "vitest"
import { ensureDatabaseSchema } from "../worker/database"
import { ingestSale } from "../worker/webhooks"
import { repairSaleAttributionPage } from "../worker/attribution"
import { normalizeKiwifyApiSale } from "../worker/gateways"
import { querySales } from "../worker/sales-query"
import worker from "../worker/index"
import { sha256 } from "../worker/secure-store"

const runtime = env as Env

beforeEach(async () => {
  await ensureDatabaseSchema(runtime.DB)
  await runtime.DB.batch(
    [
      "sales",
      "webhook_events",
      "ad_metrics",
      "ad_accounts",
      "sessions",
      "owner_account",
    ].map((table) => runtime.DB.prepare(`DELETE FROM ${table}`))
  )
})

function event(overrides: Record<string, unknown> = {}) {
  return {
    order_id: "order-1",
    order_status: "paid",
    amount_minor: 10000,
    currency: "BRL",
    created_at: "2026-09-20T01:00:00Z",
    ...overrides,
  }
}

async function storedSale() {
  return runtime.DB.prepare(
    "SELECT * FROM sales WHERE external_id = 'order-1'"
  ).first<Record<string, unknown>>()
}

async function seedAd() {
  await runtime.DB.batch([
    runtime.DB.prepare(
      "INSERT INTO ad_accounts (id, name, currency, timezone_name) VALUES ('act_1', 'Conta', 'BRL', 'America/Sao_Paulo')"
    ),
    runtime.DB.prepare(
      `INSERT INTO ad_metrics (account_id, date, campaign_id, campaign_name,
       adset_id, ad_id, spend_brl) VALUES ('act_1', '2026-09-20', '111111', 'Campanha', '222222', '333333', 20)`
    ),
  ])
}

describe("transactional sale ingestion", () => {
  it("orders Hotmart events using their creation timestamps and original event IDs", async () => {
    const purchase = {
      transaction: "order-1",
      approved_date: "2026-09-20T12:00:00Z",
      price: { value: 100, currency_code: "BRL" },
    }
    await ingestSale(runtime, "hotmart", {
      id: "refund",
      event: "PURCHASE_REFUNDED",
      creation_date: Date.parse("2026-09-25T12:00:00Z"),
      data: { purchase },
    })
    await ingestSale(runtime, "hotmart", {
      id: "late-approval",
      event: "PURCHASE_APPROVED",
      creation_date: Date.parse("2026-09-20T12:00:00Z"),
      data: { purchase },
    })
    expect(await storedSale()).toMatchObject({
      status: "refunded",
      occurred_at: "2026-09-20T12:00:00.000Z",
    })
  })

  it("does not let a repeated approval undo a refund", async () => {
    const approved = event({ webhook_id: "approval" })
    await ingestSale(runtime, "kiwify", approved)
    await ingestSale(
      runtime,
      "kiwify",
      event({ webhook_id: "refund", order_status: "refunded" })
    )
    const result = await ingestSale(runtime, "kiwify", approved)
    expect(result.duplicateEvent).toBe(true)
    expect((await storedSale())?.status).toBe("refunded")
  })

  it("rejects older events even when their delivery IDs are different", async () => {
    await ingestSale(
      runtime,
      "kiwify",
      event({
        webhook_id: "refund",
        order_status: "refunded",
        updated_at: "2026-09-25T12:00:00Z",
      })
    )
    await ingestSale(
      runtime,
      "kiwify",
      event({
        webhook_id: "late-approval",
        updated_at: "2026-09-20T12:00:00Z",
      })
    )
    expect((await storedSale())?.status).toBe("refunded")
  })

  it("does not regress terminal statuses when event dates are unavailable", async () => {
    await ingestSale(runtime, "kiwify", event({ order_status: "chargedback" }))
    await ingestSale(runtime, "kiwify", event({ order_status: "refunded" }))
    await ingestSale(runtime, "kiwify", event())
    expect((await storedSale())?.status).toBe("chargeback")
  })

  it("accepts an explicitly newer corrected status", async () => {
    await ingestSale(
      runtime,
      "kiwify",
      event({
        order_status: "refunded",
        updated_at: "2026-09-25T12:00:00Z",
      })
    )
    await ingestSale(
      runtime,
      "kiwify",
      event({ updated_at: "2026-09-26T12:00:00Z" })
    )
    expect((await storedSale())?.status).toBe("approved")
  })

  it("handles concurrent duplicate deliveries atomically", async () => {
    const results = await Promise.all([
      ingestSale(runtime, "kiwify", event({ webhook_id: "same-event" })),
      ingestSale(runtime, "kiwify", event({ webhook_id: "same-event" })),
    ])
    expect(results.filter((result) => result.duplicateEvent)).toHaveLength(1)
    expect(
      await runtime.DB.prepare("SELECT COUNT(*) AS total FROM sales").first(
        "total"
      )
    ).toBe(1)
    expect(
      await runtime.DB.prepare(
        "SELECT COUNT(*) AS total FROM webhook_events"
      ).first("total")
    ).toBe(1)
  })

  it("treats an API order ID as a transaction ID instead of an event ID", async () => {
    await ingestSale(runtime, "kiwify", event({ id: "order-1" }))
    await ingestSale(
      runtime,
      "kiwify",
      event({ id: "order-1", order_status: "refunded" })
    )
    expect((await storedSale())?.status).toBe("refunded")
  })

  it("preserves the purchase date when a refund only has an event timestamp", async () => {
    await ingestSale(runtime, "kiwify", event())
    await ingestSale(runtime, "kiwify", {
      order_id: "order-1",
      order_status: "refunded",
      amount_minor: 10000,
      timestamp: "2026-09-25T12:00:00Z",
    })
    expect((await storedSale())?.occurred_at).toBe("2026-09-20T01:00:00.000Z")
  })

  it("uses the Kiwify purchase date even when the snapshot was updated later", async () => {
    await ingestSale(
      runtime,
      "kiwify",
      normalizeKiwifyApiSale({
        id: "order-1",
        status: "paid",
        net_amount: 10000,
        created_at: "2026-09-20T01:00:00Z",
        updated_at: "2026-09-25T12:00:00Z",
      })
    )
    expect(await storedSale()).toMatchObject({
      occurred_at: "2026-09-20T01:00:00.000Z",
      attribution_date: "2026-09-20",
      last_event_at: "2026-09-25T12:00:00.000Z",
    })
  })
})

describe("sale attribution", () => {
  it("resolves the entire hierarchy from just the ad ID, using the account timezone", async () => {
    await seedAd()
    await ingestSale(
      runtime,
      "kiwify",
      event({ tracking: { ad_id: "333333" } })
    )
    expect(await storedSale()).toMatchObject({
      account_id: "act_1",
      campaign_id: "111111",
      adset_id: "222222",
      ad_id: "333333",
      attribution_date: "2026-09-19",
    })
  })

  it("resolves a campaign from a set without inventing an ad ID", async () => {
    await seedAd()
    await ingestSale(
      runtime,
      "kiwify",
      event({ tracking: { adset_id: "222222" } })
    )
    expect(await storedSale()).toMatchObject({
      campaign_id: "111111",
      adset_id: "222222",
      ad_id: null,
    })
  })

  it("repairs sales that arrived before their Meta metrics", async () => {
    await ingestSale(
      runtime,
      "kiwify",
      event({ tracking: { ad_id: "333333" } })
    )
    expect((await storedSale())?.account_id).toBeNull()
    await seedAd()
    await repairSaleAttributionPage(runtime.DB, "act_1", 0)
    expect(await storedSale()).toMatchObject({
      account_id: "act_1",
      campaign_id: "111111",
      adset_id: "222222",
      attribution_date: "2026-09-19",
    })
  })
})

describe("revenue from current transaction statuses", () => {
  it("keeps the retained revenue in sales, campaign metrics and daily chart", async () => {
    await seedAd()
    const tracking = { ad_id: "333333" }
    await ingestSale(
      runtime,
      "kiwify",
      event({ tracking, created_at: "2026-09-20T12:00:00Z" })
    )
    await ingestSale(
      runtime,
      "kiwify",
      event({
        tracking,
        order_id: "order-2",
        created_at: "2026-09-20T12:00:00Z",
      })
    )
    await ingestSale(
      runtime,
      "kiwify",
      event({
        tracking,
        order_id: "order-2",
        order_status: "refunded",
        created_at: "2026-09-20T12:00:00Z",
      })
    )
    const sales = await querySales(runtime.DB, {
      from: "2026-09-20",
      to: "2026-09-20",
      accountIds: ["act_1"],
      provider: null,
      product: "",
      status: "all",
      attribution: "all",
      query: "",
      limit: 25,
      offset: 0,
    })
    expect(sales.summary).toMatchObject({
      approvedRevenue: 100,
      netRevenue: 100,
      refundedRevenue: 100,
      arpu: 100,
    })
    await runtime.DB.batch([
      runtime.DB.prepare(
        "INSERT INTO owner_account(id, password_hash) VALUES (1, 'test-hash')"
      ),
      runtime.DB.prepare(
        "INSERT INTO sessions(token_hash, expires_at) VALUES (?, ?)"
      ).bind(
        await sha256("test-session"),
        new Date(Date.now() + 60_000).toISOString()
      ),
    ])
    const response = await worker.fetch(
      new Request(
        "https://example.com/api/dashboard?from=2026-09-20&to=2026-09-20&accountIds=act_1&level=campaign",
        { headers: { Cookie: "pulso_session=test-session" } }
      ),
      runtime
    )
    expect(response.status).toBe(200)
    const dashboard = (await response.json()) as {
      summary: { revenue: number; allNetRevenue: number }
      rows: Array<{ revenue: number }>
      daily: Array<{ revenue: number }>
    }
    expect(dashboard.summary).toMatchObject({
      revenue: 100,
      allNetRevenue: 100,
    })
    expect(dashboard.rows[0].revenue).toBe(100)
    expect(dashboard.daily[0].revenue).toBe(100)
  })
})
