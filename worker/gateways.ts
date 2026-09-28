import { encryptSecret, decryptSecret } from "./secure-store"
import { ingestSale } from "./webhooks"
import type { QueueMessage } from "./messages"

type Provider = "hotmart" | "kiwify"
type Credentials = {
  clientId: string
  clientSecret: string
  accountId?: string
}
type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function asText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : ""
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  )
    return Number(value)
  return 0
}

async function readJson(response: Response) {
  const body = asRecord(await response.json().catch(() => ({})))
  if (!response.ok) {
    const message = asText(body.message ?? body.error_description ?? body.error)
    throw new Error(message || `Gateway respondeu HTTP ${response.status}.`)
  }
  return body
}

async function accessToken(provider: Provider, credentials: Credentials) {
  const form = new URLSearchParams({ grant_type: "client_credentials" })
  let response: Response
  if (provider === "hotmart") {
    const basic = btoa(`${credentials.clientId}:${credentials.clientSecret}`)
    response = await fetch(
      "https://api-sec-vlc.hotmart.com/security/oauth/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      }
    )
  } else {
    form.set("client_id", credentials.clientId)
    form.set("client_secret", credentials.clientSecret)
    response = await fetch("https://public-api.kiwify.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form,
    })
  }
  const data = await readJson(response)
  const token = asText(data.access_token ?? data.token)
  if (!token)
    throw new Error("O gateway não retornou um token de acesso válido.")
  return token
}

export async function saveGatewayCredentials(
  env: Env,
  provider: Provider,
  input: unknown
) {
  const body = asRecord(input)
  const credentials: Credentials = {
    clientId: asText(body.clientId).trim(),
    clientSecret: asText(body.clientSecret).trim(),
    accountId: asText(body.accountId).trim() || undefined,
  }
  if (
    !credentials.clientId ||
    !credentials.clientSecret ||
    credentials.clientId.length > 300 ||
    credentials.clientSecret.length > 500
  ) {
    throw new Error("Informe o Client ID e o Client Secret válidos.")
  }
  if (provider === "kiwify" && !credentials.accountId)
    throw new Error("Informe o ID da conta Kiwify junto das credenciais.")
  await accessToken(provider, credentials)
  const ciphertext = await encryptSecret(JSON.stringify(credentials), env)
  await env.DB.prepare(
    `INSERT INTO integrations (provider, credentials_ciphertext, connected_at, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(provider) DO UPDATE SET credentials_ciphertext = excluded.credentials_ciphertext,
    connected_at = excluded.connected_at, updated_at = excluded.updated_at`
  )
    .bind(provider, ciphertext)
    .run()
  return { provider, connected: true }
}

export async function removeGatewayCredentials(env: Env, provider: Provider) {
  await env.DB.prepare(
    "UPDATE integrations SET credentials_ciphertext = NULL, connected_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE provider = ?"
  )
    .bind(provider)
    .run()
}

export async function consumeGatewaySync(
  env: Env,
  message: Extract<QueueMessage, { type: "gateway_sync" }>
) {
  const integration = await env.DB.prepare(
    "SELECT credentials_ciphertext FROM integrations WHERE provider = ?"
  )
    .bind(message.provider)
    .first<{ credentials_ciphertext: string | null }>()
  if (!integration?.credentials_ciphertext)
    throw new Error(
      `As credenciais ${message.provider} não estão configuradas.`
    )
  const credentials = JSON.parse(
    await decryptSecret(integration.credentials_ciphertext, env)
  ) as Credentials
  const token = await accessToken(message.provider, credentials)
  await env.DB.prepare(
    "UPDATE sync_runs SET status = 'running', started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = ?"
  )
    .bind(message.syncId)
    .run()
  const syncKey = `gateway:${message.provider}`
  await env.DB.prepare(
    "UPDATE sync_run_accounts SET status = 'running', started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_id = ? AND account_id = ?"
  )
    .bind(message.syncId, syncKey)
    .run()

  const pendingFx = new Set<string>()
  const imported =
    message.provider === "hotmart"
      ? await reconcileHotmart(env, token, message, pendingFx)
      : await reconcileKiwify(env, token, credentials, message, pendingFx)
  await Promise.all(
    [...pendingFx].map((key) => {
      const [currency, date] = key.split("|")
      return env.SYNC_QUEUE.send({
        type: "fx_rate",
        currency,
        date,
      } satisfies QueueMessage)
    })
  )
  await env.DB.prepare(
    "UPDATE sync_run_accounts SET status = 'completed', rows_written = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_id = ? AND account_id = ?"
  )
    .bind(imported, message.syncId, syncKey)
    .run()
  await updateGatewayRunStatus(env, message.syncId)
}

async function reconcileHotmart(
  env: Env,
  token: string,
  message: Extract<QueueMessage, { type: "gateway_sync" }>,
  pendingFx: Set<string>
) {
  const statuses = [
    "APPROVED",
    "COMPLETE",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
    "CHARGEBACK",
  ]
  const startDate = new Date(`${message.from}T00:00:00.000Z`).getTime()
  const endDate = new Date(`${message.to}T23:59:59.999Z`).getTime()
  let imported = 0
  for (const status of statuses) {
    let pageToken = ""
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(
        "https://developers.hotmart.com/payments/api/v1/sales/history"
      )
      url.searchParams.set("start_date", String(startDate))
      url.searchParams.set("end_date", String(endDate))
      url.searchParams.set("transaction_status", status)
      url.searchParams.set("max_results", "100")
      if (pageToken) url.searchParams.set("page_token", pageToken)
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })
      const body = await readJson(response)
      const items = Array.isArray(body.items) ? body.items : []
      for (const item of items) {
        const result = await ingestSale(env, "hotmart", item, false)
        if (result.needsFx) pendingFx.add(`${result.currency}|${result.date}`)
        imported += 1
      }
      pageToken = asText(asRecord(body.page_info).next_page_token)
      if (!pageToken) break
      if (page === 99)
        throw new Error("A busca Hotmart excedeu 100 páginas para um status.")
    }
  }
  return imported
}

async function reconcileKiwify(
  env: Env,
  token: string,
  credentials: Credentials,
  message: Extract<QueueMessage, { type: "gateway_sync" }>,
  pendingFx: Set<string>
) {
  const statuses = [
    "paid",
    "approved",
    "chargedback",
    "refunded",
    "pending_refund",
    "refund_requested",
    "pending",
    "waiting_payment",
  ]
  let imported = 0
  for (const status of statuses) {
    for (let page = 1; page <= 100; page += 1) {
      const url = new URL("https://public-api.kiwify.com/v1/sales")
      url.searchParams.set("start_date", `${message.from}T00:00:00.000Z`)
      url.searchParams.set("end_date", `${message.to}T23:59:59.999Z`)
      url.searchParams.set("status", status)
      url.searchParams.set("view_full_sale_details", "true")
      url.searchParams.set("page_size", "100")
      url.searchParams.set("page_number", String(page))
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-kiwify-account-id": credentials.accountId ?? "",
          Accept: "application/json",
        },
      })
      const body = await readJson(response)
      const items = Array.isArray(body.data) ? body.data : []
      for (const value of items) {
        const item = asRecord(value)
        const product = asRecord(item.product)
        const normalized = {
          ...item,
          order_id: item.id,
          order_status: item.status,
          amount_minor: Math.round(asNumber(item.net_amount) * 100),
          product_id: product.id,
          product_name: product.name,
          tracking: item.tracking,
          created_at: item.updated_at ?? item.created_at,
        }
        const result = await ingestSale(env, "kiwify", normalized, false)
        if (result.needsFx) pendingFx.add(`${result.currency}|${result.date}`)
        imported += 1
      }
      const pagination = asRecord(body.pagination)
      const current = Number(pagination.page_number ?? page)
      const pageSize = Number(pagination.page_size ?? 100)
      const count = Number(pagination.count ?? items.length)
      if (items.length < pageSize || current * pageSize >= count) break
      if (page === 100)
        throw new Error("A busca Kiwify excedeu 100 páginas para um status.")
    }
  }
  return imported
}

export async function markGatewaySyncFailed(
  env: Env,
  message: Extract<QueueMessage, { type: "gateway_sync" }>,
  error: unknown
) {
  const errorMessage =
    error instanceof Error
      ? error.message.slice(0, 300)
      : "Falha ao reconciliar o gateway."
  await env.DB.prepare(
    "UPDATE sync_run_accounts SET status = 'failed', error_message = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_id = ? AND account_id = ?"
  )
    .bind(errorMessage, message.syncId, `gateway:${message.provider}`)
    .run()
  await updateGatewayRunStatus(env, message.syncId)
}

async function updateGatewayRunStatus(env: Env, syncId: string) {
  const counts = await env.DB.prepare(
    `SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN status IN ('queued', 'running') THEN 1 ELSE 0 END) AS pending
    FROM sync_run_accounts WHERE sync_id = ?`
  )
    .bind(syncId)
    .first<{
      total: number
      completed: number
      failed: number
      pending: number
    }>()
  if (!counts || counts.pending > 0) return
  const status =
    counts.failed === 0
      ? "completed"
      : counts.completed > 0
        ? "partial"
        : "failed"
  await env.DB.prepare(
    "UPDATE sync_runs SET status = ?, completed_count = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  )
    .bind(status, counts.completed, syncId)
    .run()
}
