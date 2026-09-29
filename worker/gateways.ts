import { encryptSecret, decryptSecret } from "./secure-store"
import { ingestSale } from "./webhooks"
import type { QueueMessage } from "./messages"
import { checkpointSync, resumeSync } from "./sync-progress"

type Provider = "hotmart" | "kiwify"
type Credentials = {
  clientId: string
  clientSecret: string
  accountId?: string
}
type JsonRecord = Record<string, unknown>
const KIWIFY_MAX_RANGE_DAYS = 90
const DAY_IN_MS = 86_400_000

function splitDateRange(from: string, to: string, maxDays: number) {
  let start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    throw new Error("Período inválido para consulta à Kiwify.")

  const ranges: Array<{ from: string; to: string }> = []
  while (start <= end) {
    const rangeEnd = Math.min(end, start + (maxDays - 1) * DAY_IN_MS)
    ranges.push({
      from: new Date(start).toISOString().slice(0, 10),
      to: new Date(rangeEnd).toISOString().slice(0, 10),
    })
    start = rangeEnd + DAY_IN_MS
  }
  return ranges
}

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

const GATEWAY_PAGE_SIZE = 5
const HOTMART_STATUSES = [
  "APPROVED",
  "COMPLETE",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "CHARGEBACK",
]
const KIWIFY_STATUSES = [
  "paid",
  "approved",
  "chargedback",
  "refunded",
  "pending_refund",
  "refund_requested",
  "pending",
  "waiting_payment",
]
type GatewayCursor = {
  range: number
  status: number
  page: number
  pageToken: string
}

export function normalizeKiwifyApiSale(value: unknown) {
  const item = asRecord(value)
  const product = asRecord(item.product)
  return {
    ...item,
    order_id: item.id,
    order_status: item.status,
    amount_minor: Math.round(asNumber(item.net_amount)),
    product_id: product.id,
    product_name: product.name,
    tracking: item.tracking,
    // Keep the purchase date and the snapshot's update date as separate fields.
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

export async function consumeGatewaySync(
  env: Env,
  message: Extract<QueueMessage, { type: "gateway_sync" }>
) {
  const syncKey = `gateway:${message.provider}`
  const progress = await resumeSync<GatewayCursor>(env, message, syncKey, {
    range: 0,
    status: 0,
    page: 1,
    pageToken: "",
  })
  if (!progress) {
    await updateGatewayRunStatus(env, message.syncId)
    return
  }
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
  await env.DB.prepare(
    "UPDATE sync_run_accounts SET status = 'running', error_message = NULL, started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE sync_id = ? AND account_id = ?"
  )
    .bind(message.syncId, syncKey)
    .run()

  const ranges =
    message.provider === "kiwify"
      ? splitDateRange(message.from, message.to, KIWIFY_MAX_RANGE_DAYS)
      : [{ from: message.from, to: message.to }]
  const statuses =
    message.provider === "kiwify" ? KIWIFY_STATUSES : HOTMART_STATUSES
  const cursor = progress.cursor
  const range = ranges[cursor.range]
  if (!range || !statuses[cursor.status])
    throw new Error("Cursor de sincronização inválido.")
  const url = new URL(
    message.provider === "hotmart"
      ? "https://developers.hotmart.com/payments/api/v1/sales/history"
      : "https://public-api.kiwify.com/v1/sales"
  )
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  }
  if (message.provider === "hotmart") {
    url.searchParams.set(
      "start_date",
      String(Date.parse(`${range.from}T00:00:00.000Z`))
    )
    url.searchParams.set(
      "end_date",
      String(Date.parse(`${range.to}T23:59:59.999Z`))
    )
    url.searchParams.set("transaction_status", statuses[cursor.status])
    url.searchParams.set("max_results", String(GATEWAY_PAGE_SIZE))
    if (cursor.pageToken) url.searchParams.set("page_token", cursor.pageToken)
  } else {
    headers["x-kiwify-account-id"] = credentials.accountId ?? ""
    url.searchParams.set("start_date", `${range.from}T00:00:00.000Z`)
    url.searchParams.set("end_date", `${range.to}T23:59:59.999Z`)
    url.searchParams.set("status", statuses[cursor.status])
    url.searchParams.set("view_full_sale_details", "true")
    url.searchParams.set("page_size", String(GATEWAY_PAGE_SIZE))
    url.searchParams.set("page_number", String(cursor.page))
  }
  const body = await readJson(await fetch(url, { headers }))
  const collection = message.provider === "hotmart" ? body.items : body.data
  if (!Array.isArray(collection))
    throw new Error("O gateway retornou uma lista de vendas inválida.")
  if (collection.length > GATEWAY_PAGE_SIZE)
    throw new Error("O gateway não respeitou o tamanho da página solicitado.")
  const pendingFx = new Set<string>()
  for (const item of collection) {
    const sale =
      message.provider === "kiwify" ? normalizeKiwifyApiSale(item) : item
    const result = await ingestSale(env, message.provider, sale, false)
    if (result.needsFx) pendingFx.add(`${result.currency}|${result.date}`)
  }
  // Dispatch FX work before committing the page: a failed send retries this page.
  for (const key of pendingFx) {
    const [currency, date] = key.split("|")
    await env.SYNC_QUEUE.send({ type: "fx_rate", currency, date })
  }
  let next: GatewayCursor | null
  if (message.provider === "hotmart") {
    const pageToken = asText(asRecord(body.page_info).next_page_token)
    if (pageToken && pageToken === cursor.pageToken)
      throw new Error("A Hotmart repetiu o cursor de paginação.")
    next = pageToken ? { ...cursor, pageToken, page: cursor.page + 1 } : null
  } else {
    const pagination = asRecord(body.pagination)
    const pageSize = Number(pagination.page_size ?? GATEWAY_PAGE_SIZE)
    const count = Number(pagination.count ?? collection.length)
    next =
      collection.length >= pageSize && cursor.page * pageSize < count
        ? { ...cursor, page: cursor.page + 1 }
        : null
  }
  if (!next && cursor.status + 1 < statuses.length) {
    next = { ...cursor, status: cursor.status + 1, page: 1, pageToken: "" }
  } else if (!next && cursor.range + 1 < ranges.length) {
    next = { range: cursor.range + 1, status: 0, page: 1, pageToken: "" }
  }
  await checkpointSync(
    env,
    message,
    syncKey,
    progress.version,
    next,
    collection.length
  )
  if (!next) await updateGatewayRunStatus(env, message.syncId)
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
