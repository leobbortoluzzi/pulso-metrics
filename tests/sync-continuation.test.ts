import { env } from "cloudflare:workers"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ensureDatabaseSchema } from "../worker/database"
import { consumeGatewaySync } from "../worker/gateways"
import { consumeMetaSync } from "../worker/meta"
import { encryptSecret } from "../worker/secure-store"
import { saveMetaConfiguration } from "../worker/settings"
import type { QueueMessage } from "../worker/messages"

const runtime = env as Env
type SyncMessage = Extract<QueueMessage, { type: "gateway_sync" | "meta_sync" }>
const period = { from: "2026-09-01", to: "2026-09-29" }

beforeEach(async () => {
  await ensureDatabaseSchema(runtime.DB)
  await runtime.DB.batch(
    [
      "sync_run_accounts",
      "sync_runs",
      "sales",
      "webhook_events",
      "ad_metrics",
      "ad_accounts",
      "fx_rates",
      "integrations",
      "workspace_settings",
    ].map((table) => runtime.DB.prepare(`DELETE FROM ${table}`))
  )
})
afterEach(() => vi.unstubAllGlobals())

async function seedSync(message: SyncMessage) {
  const accountId =
    message.type === "gateway_sync"
      ? `gateway:${message.provider}`
      : message.accountId
  await runtime.DB.batch([
    runtime.DB.prepare(
      "INSERT INTO sync_runs (id, type, status, date_from, date_to, requested_count) VALUES (?, ?, 'queued', ?, ?, 1)"
    ).bind(
      message.syncId,
      message.type === "gateway_sync" ? "gateways" : "meta",
      message.from,
      message.to
    ),
    runtime.DB.prepare(
      "INSERT INTO sync_run_accounts(sync_id, account_id, status) VALUES (?, ?, 'queued')"
    ).bind(message.syncId, accountId),
  ])
  if (message.type === "gateway_sync") {
    await runtime.DB.prepare(
      "INSERT INTO integrations(provider, credentials_ciphertext) VALUES (?, ?)"
    )
      .bind(
        message.provider,
        await encryptSecret(
          JSON.stringify({
            clientId: "client",
            clientSecret: "secret",
            accountId: "account",
          }),
          runtime
        )
      )
      .run()
  } else {
    await saveMetaConfiguration(runtime, { appId: "app", appSecret: "secret" })
    await runtime.DB.batch([
      runtime.DB.prepare(
        "INSERT INTO integrations(provider, access_token_ciphertext) VALUES ('meta', ?)"
      ).bind(await encryptSecret("private-meta-token", runtime)),
      runtime.DB.prepare(
        "INSERT INTO ad_accounts(id, name, currency, timezone_name) VALUES (?, 'Conta', 'USD', 'America/Sao_Paulo')"
      ).bind(message.accountId),
    ])
  }
}

function harness(beforePrepare?: (sql: string) => void) {
  const messages: QueueMessage[] = []
  const send = vi.fn(async (message: QueueMessage) => {
    messages.push(message)
  })
  let queries = 0
  const database = {
    prepare(sql: string) {
      beforePrepare?.(sql)
      queries += 1
      // Count statements conservatively, leaving one query for schema validation.
      if (queries > 49)
        throw new Error("D1 Free invocation query budget exceeded")
      return runtime.DB.prepare(sql)
    },
    batch: runtime.DB.batch.bind(runtime.DB),
  } as D1Database
  const boundedRuntime = {
    ...runtime,
    DB: database,
    SYNC_QUEUE: { send } as unknown as Queue,
  }
  async function consume(message: SyncMessage) {
    queries = 0
    if (message.type === "gateway_sync")
      await consumeGatewaySync(boundedRuntime, message)
    else await consumeMetaSync(boundedRuntime, message)
    expect(queries).toBeLessThanOrEqual(49)
  }
  async function drain() {
    let iterations = 0
    while (messages.length) {
      if (++iterations > 300) throw new Error("Continuation did not converge")
      const message = messages.shift()!
      if (message.type !== "fx_rate") await consume(message)
    }
  }
  return { messages, send, consume, drain }
}

function mockGateway(provider: "kiwify" | "hotmart", total: number) {
  return vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.pathname.endsWith("/token"))
        return Response.json({ access_token: "gateway-token" })
      const pageSize = Number(
        url.searchParams.get(
          provider === "kiwify" ? "page_size" : "max_results"
        )
      )
      expect(pageSize).toBe(5)
      const status = url.searchParams.get(
        provider === "kiwify" ? "status" : "transaction_status"
      )
      const active = status === (provider === "kiwify" ? "paid" : "APPROVED")
      const page = Number(
        url.searchParams.get(
          provider === "kiwify" ? "page_number" : "page_token"
        ) ?? 1
      )
      const count = active ? total : 0
      const items = Array.from(
        {
          length: Math.max(
            0,
            Math.min(pageSize, count - (page - 1) * pageSize)
          ),
        },
        (_, index) => {
          const id = String((page - 1) * pageSize + index)
          return provider === "kiwify"
            ? {
                id,
                status: "paid",
                net_amount: 10000,
                currency: "USD",
                created_at: "2026-09-10T12:00:00Z",
                updated_at: "2026-09-20T12:00:00Z",
              }
            : {
                purchase: {
                  transaction: id,
                  status: "APPROVED",
                  approved_date: "2026-09-10T12:00:00Z",
                  price: { value: 100, currency_code: "USD" },
                },
              }
        }
      )
      return provider === "kiwify"
        ? Response.json({
            data: items,
            pagination: { page_number: page, page_size: pageSize, count },
          })
        : Response.json({
            items,
            page_info: {
              next_page_token:
                page * pageSize < count ? String(page + 1) : null,
            },
          })
    })
  )
}

describe("bounded gateway synchronization", () => {
  it("retries a partially written page without double counting its progress", async () => {
    const message: SyncMessage = {
      type: "gateway_sync",
      syncId: "partial",
      provider: "kiwify",
      ...period,
    }
    await seedSync(message)
    mockGateway("kiwify", 5)
    let inserts = 0
    const queue = harness((sql) => {
      if (sql.includes("INSERT INTO sales") && ++inserts === 3) {
        throw new Error("Temporary database failure")
      }
    })
    await expect(queue.consume(message)).rejects.toThrow(
      "Temporary database failure"
    )
    expect(
      await runtime.DB.prepare("SELECT COUNT(*) AS total FROM sales").first(
        "total"
      )
    ).toBe(2)
    expect(
      await runtime.DB.prepare(
        "SELECT cursor_version FROM sync_run_accounts"
      ).first("cursor_version")
    ).toBe(0)
    await queue.consume(message)
    await queue.drain()
    expect(
      await runtime.DB.prepare("SELECT COUNT(*) AS total FROM sales").first(
        "total"
      )
    ).toBe(5)
    expect(
      await runtime.DB.prepare(
        "SELECT rows_written FROM sync_run_accounts"
      ).first("rows_written")
    ).toBe(5)
  })

  it("continues across all date ranges in a 120-day Kiwify import", async () => {
    const message: SyncMessage = {
      type: "gateway_sync",
      syncId: "ranges",
      provider: "kiwify",
      from: "2026-06-01",
      to: "2026-09-28",
    }
    await seedSync(message)
    mockGateway("kiwify", 0)
    const queue = harness()
    await queue.consume(message)
    await queue.drain()
    const starts = new Set(
      vi
        .mocked(fetch)
        .mock.calls.map(([input]) => new URL(String(input)))
        .filter((url) => url.pathname.endsWith("/sales"))
        .map((url) => url.searchParams.get("start_date"))
    )
    expect(starts).toEqual(
      new Set(["2026-06-01T00:00:00.000Z", "2026-08-30T00:00:00.000Z"])
    )
    expect(
      await runtime.DB.prepare("SELECT status FROM sync_runs").first("status")
    ).toBe("completed")
  })

  it.each(["kiwify", "hotmart"] as const)(
    "imports more than one hundred %s sales within the free query budget",
    async (provider) => {
      const message: SyncMessage = {
        type: "gateway_sync",
        syncId: "bulk",
        provider,
        ...period,
      }
      await seedSync(message)
      mockGateway(provider, 105)
      const queue = harness()
      await queue.consume(message)
      await queue.drain()
      expect(
        await runtime.DB.prepare("SELECT COUNT(*) AS total FROM sales").first(
          "total"
        )
      ).toBe(105)
      expect(
        await runtime.DB.prepare(
          "SELECT status, rows_written FROM sync_run_accounts"
        ).first()
      ).toMatchObject({ status: "completed", rows_written: 105 })
      expect(
        await runtime.DB.prepare("SELECT status FROM sync_runs").first("status")
      ).toBe("completed")
    }
  )

  it("recovers a continuation that failed to enqueue after its checkpoint", async () => {
    const message: SyncMessage = {
      type: "gateway_sync",
      syncId: "retry",
      provider: "kiwify",
      ...period,
    }
    await seedSync(message)
    mockGateway("kiwify", 6)
    const queue = harness()
    queue.send.mockImplementationOnce(async () => {}) // First message is the FX request.
    queue.send.mockRejectedValueOnce(new Error("Temporary queue failure"))
    await expect(queue.consume(message)).rejects.toThrow(
      "Temporary queue failure"
    )
    expect(
      await runtime.DB.prepare(
        "SELECT cursor_version FROM sync_run_accounts"
      ).first("cursor_version")
    ).toBe(1)
    const callsBeforeRetry = vi.mocked(fetch).mock.calls.length
    await queue.consume(message)
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBeforeRetry)
    await queue.drain()
    expect(
      await runtime.DB.prepare(
        "SELECT rows_written FROM sync_run_accounts"
      ).first("rows_written")
    ).toBe(6)
  })

  it("ignores a replay after the synchronization has completed", async () => {
    const message: SyncMessage = {
      type: "gateway_sync",
      syncId: "complete",
      provider: "kiwify",
      ...period,
    }
    await seedSync(message)
    mockGateway("kiwify", 1)
    const queue = harness()
    await queue.consume(message)
    await queue.drain()
    const calls = vi.mocked(fetch).mock.calls.length
    await queue.consume(message)
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)
    expect(queue.messages).toHaveLength(0)
  })
})

describe("bounded Meta synchronization and attribution repair", () => {
  it("imports multiple pages and repairs old ad-only sales before completing", async () => {
    const message: SyncMessage = {
      type: "meta_sync",
      syncId: "meta",
      accountId: "act_1",
      ...period,
    }
    await seedSync(message)
    await runtime.DB.prepare(
      `INSERT INTO sales(provider, external_id, status, amount_brl, occurred_at, attribution_date, ad_id)
       VALUES ('kiwify', 'old-sale', 'approved', 100, '2026-09-10T01:00:00Z', '2026-09-10', '333333')`
    ).run()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input)
        )
        expect(url.hostname).toBe("graph.facebook.com")
        expect(url.searchParams.get("limit")).toBe("5")
        expect(url.searchParams.get("access_token")).toBe("private-meta-token")
        const after = Number(url.searchParams.get("after") ?? 0)
        const data = Array.from(
          { length: Math.min(5, 60 - after) },
          (_, index) => ({
            date_start: "2026-09-10",
            campaign_id: "111111",
            adset_id: "222222",
            ad_id:
              index + after === 0 ? "333333" : String(400000 + index + after),
            spend: "10",
          })
        )
        const next =
          after + 5 < 60
            ? `https://graph.facebook.com/v24.0/act_1/insights?limit=5&after=${after + 5}&access_token=private-meta-token`
            : undefined
        return Response.json({ data, paging: { next } })
      })
    )
    const queue = harness()
    await queue.consume(message)
    const cursor = await runtime.DB.prepare(
      "SELECT cursor_json FROM sync_run_accounts"
    ).first<string>("cursor_json")
    expect(cursor).not.toContain("private-meta-token")
    await queue.drain()
    expect(
      await runtime.DB.prepare(
        "SELECT COUNT(*) AS total FROM ad_metrics"
      ).first("total")
    ).toBe(60)
    expect(
      await runtime.DB.prepare(
        "SELECT account_id, campaign_id, adset_id, attribution_date FROM sales"
      ).first()
    ).toMatchObject({
      account_id: "act_1",
      campaign_id: "111111",
      adset_id: "222222",
      attribution_date: "2026-09-09",
    })
    expect(
      await runtime.DB.prepare(
        "SELECT status, rows_written FROM sync_run_accounts"
      ).first()
    ).toMatchObject({ status: "completed", rows_written: 60 })
  })
})
