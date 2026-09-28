import { convertToBrl } from "../src/lib/metrics"
import { secretsMatch } from "./secure-store"
import { readWebhookToken } from "./settings"
import type { QueueMessage } from "./messages"

type Provider = "hotmart" | "kiwify"
type SaleStatus = "approved" | "refunded" | "chargeback" | "pending"
type JsonRecord = Record<string, unknown>

type NormalizedSale = {
  externalId: string
  status: SaleStatus
  productId: string | null
  productName: string
  currency: string
  amountMinor: number
  occurredAt: string
  campaignId: string | null
  adsetId: string | null
  adId: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function asText(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  )
    return Number(value)
  return null
}

function firstValue(...values: unknown[]) {
  return values.find(
    (value) => value !== null && value !== undefined && value !== ""
  )
}

function extractStatus(provider: Provider, value: unknown): SaleStatus {
  const normalized = (asText(value) ?? "").toLowerCase().replaceAll("-", "_")
  if (
    [
      "approved",
      "purchase_approved",
      "complete",
      "purchase_complete",
      "paid",
      "succeeded",
      "approved_payment",
    ].includes(normalized)
  )
    return "approved"
  if (
    [
      "refunded",
      "purchase_refunded",
      "partial_refund",
      "partially_refunded",
      "refund",
    ].includes(normalized)
  )
    return "refunded"
  if (
    [
      "chargeback",
      "purchase_chargeback",
      "chargedback",
      "dispute",
      "protested",
    ].includes(normalized)
  )
    return "chargeback"
  if (
    [
      "waiting_payment",
      "pending",
      "started",
      "processing",
      "under_analysis",
    ].includes(normalized)
  )
    return "pending"
  return provider === "hotmart" && normalized === "complete"
    ? "approved"
    : "pending"
}

function dateValue(value: unknown) {
  const numeric = asNumber(value)
  const date =
    numeric !== null
      ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
      : new Date(asText(value) ?? "")
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString()
}

function normalizeId(value: unknown) {
  const text = asText(value)
  return text && /^\d{5,}$/.test(text) ? text : null
}

function firstId(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeId(value)
    if (normalized) return normalized
  }
  return null
}

function getAttribution(
  provider: Provider,
  bodyValue: unknown,
  saleValue: unknown,
  purchaseValue: unknown
): Omit<
  NormalizedSale,
  | "externalId"
  | "status"
  | "productId"
  | "productName"
  | "currency"
  | "amountMinor"
  | "occurredAt"
> {
  const body = asRecord(bodyValue)
  const sale = asRecord(saleValue)
  const purchase = asRecord(purchaseValue)
  const origin = asRecord(firstValue(purchase.origin, sale.origin, body.origin))
  const tracking = asRecord(
    firstValue(
      purchase.tracking,
      sale.tracking,
      body.tracking,
      body.TrackingParameters,
      origin.tracking
    )
  )
  const utm = asRecord(
    firstValue(purchase.utm, sale.utm, body.utm, tracking.utm)
  )
  const source = asRecord(firstValue(body.data, body.event_data))
  const campaign = firstValue(
    utm.utm_campaign,
    tracking.utm_campaign,
    origin.utm_campaign,
    sale.utm_campaign,
    body.utm_campaign
  )
  const campaignId = firstId(
    sale.campaign_id,
    sale.meta_campaign_id,
    purchase.campaign_id,
    purchase.meta_campaign_id,
    tracking.campaign_id,
    tracking.utm_campaign_id,
    utm.campaign_id,
    utm.utm_campaign_id,
    campaign,
    body.campaign_id
  )
  const adsetId = firstId(
    sale.adset_id,
    sale.ad_set_id,
    purchase.adset_id,
    tracking.adset_id,
    tracking.ad_set_id,
    tracking.utm_adset_id,
    utm.adset_id,
    utm.utm_adset_id,
    utm.utm_term ?? tracking.utm_term
  )
  const adId = firstId(
    sale.ad_id,
    purchase.ad_id,
    tracking.ad_id,
    tracking.utm_ad_id,
    utm.ad_id,
    utm.utm_ad_id,
    utm.utm_content,
    tracking.utm_content,
    provider === "hotmart" ? origin.xcod : null
  )

  return {
    campaignId,
    adsetId,
    adId,
    utmSource: asText(
      firstValue(
        utm.utm_source,
        tracking.utm_source,
        sale.utm_source,
        body.utm_source,
        source.utm_source
      )
    ),
    utmMedium: asText(
      firstValue(
        utm.utm_medium,
        tracking.utm_medium,
        sale.utm_medium,
        body.utm_medium,
        source.utm_medium
      )
    ),
    utmCampaign: asText(campaign),
    utmContent: asText(
      firstValue(
        utm.utm_content,
        tracking.utm_content,
        sale.utm_content,
        body.utm_content
      )
    ),
    utmTerm: asText(
      firstValue(utm.utm_term, tracking.utm_term, sale.utm_term, body.utm_term)
    ),
  }
}

export function normalizeSale(
  provider: Provider,
  bodyValue: unknown
): NormalizedSale | null {
  const body = asRecord(bodyValue)
  const data = asRecord(body.data)
  const purchase = asRecord(
    firstValue(data.purchase, body.purchase, body.order, body)
  )
  const sale = asRecord(
    firstValue(data.sale, body.sale, purchase.sale, purchase)
  )
  const product = asRecord(
    firstValue(
      sale.product,
      purchase.product,
      data.product,
      body.product,
      body.Product
    )
  )
  const commissions = asRecord(
    firstValue(sale.commissions, purchase.commissions, body.Commissions)
  )
  const pricing = asRecord(
    firstValue(purchase.full_price, sale.full_price, purchase.price, sale.price)
  )
  const externalId = asText(
    firstValue(
      purchase.transaction,
      sale.transaction,
      sale.transaction_id,
      purchase.transaction_id,
      body.order_id,
      body.transaction_id,
      body.transaction,
      sale.id
    )
  )
  if (!externalId) return null

  const rawStatus = firstValue(
    body.event,
    body.event_type,
    body.order_status,
    body.status,
    sale.status,
    purchase.status
  )
  const status = extractStatus(provider, rawStatus)
  const currency = (
    asText(
      firstValue(
        pricing.currency_code,
        pricing.currency_value,
        pricing.currency,
        sale.currency,
        purchase.currency,
        commissions.currency,
        body.currency
      )
    ) ?? "BRL"
  ).toUpperCase()
  const explicitMinor = asNumber(
    firstValue(
      sale.amount_in_cents,
      purchase.amount_in_cents,
      body.amount_in_cents,
      sale.amount_minor,
      commissions.my_commission,
      commissions.charge_amount
    )
  )
  const price =
    asNumber(
      firstValue(
        pricing.value,
        sale.net_amount,
        sale.amount,
        purchase.amount,
        body.amount,
        body.order_value,
        commissions.my_commission,
        commissions.charge_amount
      )
    ) ?? 0
  const amountMinor =
    explicitMinor !== null
      ? Math.round(explicitMinor)
      : provider === "kiwify" && (body.order_id || body.order_status)
        ? Math.round(price)
        : Math.round(
            price *
              10 **
                (new Intl.NumberFormat("en", {
                  style: "currency",
                  currency,
                }).resolvedOptions().maximumFractionDigits ?? 2)
          )
  const occurredAt = dateValue(
    firstValue(
      purchase.approved_date,
      sale.approved_date,
      purchase.order_date,
      sale.created_at,
      body.created_at,
      body.createdAt,
      body.timestamp
    )
  )
  const productName =
    asText(
      firstValue(
        product.name,
        product.title,
        product.product_name,
        sale.product_name,
        purchase.product_name,
        body.product_name
      )
    ) ?? "Produto não identificado"

  return {
    externalId,
    status,
    productId: asText(
      firstValue(
        product.id,
        product.product_id,
        sale.product_id,
        purchase.product_id,
        body.product_id
      )
    ),
    productName,
    currency,
    amountMinor,
    occurredAt,
    ...getAttribution(provider, bodyValue, sale, purchase),
  }
}

function localDate(isoDate: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoDate))
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )
  return `${values.year}-${values.month}-${values.day}`
}

async function attributedAccount(db: D1Database, sale: NormalizedSale) {
  for (const [column, value] of [
    ["ad_id", sale.adId],
    ["adset_id", sale.adsetId],
    ["campaign_id", sale.campaignId],
  ] as const) {
    if (!value) continue
    const account = await db
      .prepare(
        `SELECT a.id, a.timezone_name FROM ad_accounts a JOIN ad_metrics m ON m.account_id = a.id WHERE m.${column} = ? ORDER BY m.date DESC LIMIT 1`
      )
      .bind(value)
      .first<{ id: string; timezone_name: string }>()
    if (account) return account
  }
  return null
}

export async function ingestSale(
  env: Env,
  provider: Provider,
  body: unknown,
  queueFx = true
) {
  const sale = normalizeSale(provider, body)
  if (!sale)
    throw new Error("O evento não contém um identificador de transação.")

  const account = await attributedAccount(env.DB, sale)
  const timeZone = account?.timezone_name ?? "UTC"
  const attributionDate = localDate(sale.occurredAt, timeZone)
  const event = asRecord(body)
  const eventName =
    asText(
      firstValue(event.event, event.event_type, event.order_status, sale.status)
    ) ?? sale.status
  const eventId = asText(firstValue(event.id, event.event_id, event.webhook_id))
  const eventKey = (
    eventId ?? `${sale.externalId}:${eventName}:${sale.status}`
  ).slice(0, 250)
  const duplicate = await env.DB.prepare(
    "SELECT event_key FROM webhook_events WHERE provider = ? AND event_key = ?"
  )
    .bind(provider, eventKey)
    .first<{ event_key: string }>()
  const fxRate =
    sale.currency === "BRL"
      ? { selling_rate: 1 }
      : await env.DB.prepare(
          "SELECT selling_rate FROM fx_rates WHERE currency = ? AND date <= ? ORDER BY date DESC LIMIT 1"
        )
          .bind(sale.currency, attributionDate)
          .first<{ selling_rate: number }>()
  const amountBrl = fxRate
    ? convertToBrl(sale.amountMinor, sale.currency, fxRate.selling_rate)
    : null

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO webhook_events (provider, event_key, processed_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(provider, event_key) DO NOTHING"
    ).bind(provider, eventKey),
    env.DB.prepare(
      `INSERT INTO sales (
      provider, external_id, status, product_id, product_name, currency, amount_minor,
      amount_brl, occurred_at, attribution_date, account_id, campaign_id, adset_id,
      ad_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, external_id) DO UPDATE SET
      status = excluded.status,
      product_id = excluded.product_id,
      product_name = excluded.product_name,
      currency = excluded.currency,
      amount_minor = excluded.amount_minor,
      amount_brl = excluded.amount_brl,
      occurred_at = excluded.occurred_at,
      attribution_date = excluded.attribution_date,
      account_id = COALESCE(excluded.account_id, sales.account_id),
      campaign_id = COALESCE(excluded.campaign_id, sales.campaign_id),
      adset_id = COALESCE(excluded.adset_id, sales.adset_id),
      ad_id = COALESCE(excluded.ad_id, sales.ad_id),
      utm_source = COALESCE(excluded.utm_source, sales.utm_source),
      utm_medium = COALESCE(excluded.utm_medium, sales.utm_medium),
      utm_campaign = COALESCE(excluded.utm_campaign, sales.utm_campaign),
      utm_content = COALESCE(excluded.utm_content, sales.utm_content),
      utm_term = COALESCE(excluded.utm_term, sales.utm_term),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    ).bind(
      provider,
      sale.externalId,
      sale.status,
      sale.productId,
      sale.productName,
      sale.currency,
      sale.amountMinor,
      amountBrl,
      sale.occurredAt,
      attributionDate,
      account?.id ?? null,
      sale.campaignId,
      sale.adsetId,
      sale.adId,
      sale.utmSource,
      sale.utmMedium,
      sale.utmCampaign,
      sale.utmContent,
      sale.utmTerm
    ),
  ])

  if (queueFx && sale.currency !== "BRL" && amountBrl === null) {
    const message: QueueMessage = {
      type: "fx_rate",
      currency: sale.currency,
      date: attributionDate,
    }
    await env.SYNC_QUEUE.send(message)
  }

  return {
    duplicateEvent: Boolean(duplicate),
    status: sale.status,
    currency: sale.currency,
    date: attributionDate,
    needsFx: amountBrl === null,
  }
}

export async function hotmartWebhookIsAuthorized(request: Request, env: Env) {
  const supplied = request.headers.get("X-HOTMART-HOTTOK") ?? ""
  const expected = await readWebhookToken(env, "hotmart")
  return Boolean(expected && (await secretsMatch(supplied, expected)))
}

export async function kiwifyWebhookIsAuthorized(request: Request, env: Env) {
  const supplied = new URL(request.url).searchParams.get("token") ?? ""
  const expected = await readWebhookToken(env, "kiwify")
  return Boolean(expected && (await secretsMatch(supplied, expected)))
}
