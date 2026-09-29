import {
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
} from "./secure-store"
import type { QueueMessage } from "./messages"
import {
  isDateRangeWithinLimit,
  MAX_DATE_RANGE_DAYS,
} from "../src/lib/date-range"
import { readMetaConfiguration } from "./settings"
import { checkpointSync, resumeSync } from "./sync-progress"
import { repairSaleAttributionPage } from "./attribution"

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback
}

async function requiredMetaConfig(env: Env) {
  const config = await readMetaConfiguration(env)
  if (!config)
    throw new Error("Configure o App ID e o App Secret da Meta em Integrações.")
  return config
}

function graphEndpoint(version: string, path: string) {
  return new URL(
    `https://graph.facebook.com/${version}/${path.replace(/^\/+/, "")}`
  )
}

async function graphJson(url: URL): Promise<JsonRecord> {
  const response = await fetch(url, { headers: { Accept: "application/json" } })
  const body = asRecord(await response.json().catch(() => ({})))
  if (!response.ok || body.error) {
    const error = asRecord(body.error)
    throw new Error(
      asText(error.message, `Meta Graph API retornou HTTP ${response.status}.`)
    )
  }
  return body
}

export async function beginMetaAuthorization(env: Env, requestUrl: string) {
  const config = await requiredMetaConfig(env)
  const state = randomToken(24)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await env.DB.prepare(
    "INSERT INTO oauth_states (state_hash, provider, expires_at) VALUES (?, 'meta', ?)"
  )
    .bind(await sha256(state), expiresAt)
    .run()

  const callbackUrl = new URL("/auth/meta/callback", requestUrl)
  const authorize = new URL(
    `https://www.facebook.com/${config.apiVersion}/dialog/oauth`
  )
  authorize.searchParams.set("client_id", config.appId)
  authorize.searchParams.set("redirect_uri", callbackUrl.toString())
  authorize.searchParams.set("state", state)
  authorize.searchParams.set("response_type", "code")
  authorize.searchParams.set("scope", "ads_read")
  return authorize.toString()
}

export async function completeMetaAuthorization(env: Env, requestUrl: string) {
  const config = await requiredMetaConfig(env)
  const version = config.apiVersion
  const incoming = new URL(requestUrl)
  const error =
    incoming.searchParams.get("error_description") ??
    incoming.searchParams.get("error")
  if (error) throw new Error(`A autorização Meta foi cancelada: ${error}`)

  const code = incoming.searchParams.get("code")
  const state = incoming.searchParams.get("state")
  if (!code || !state)
    throw new Error("A Meta não retornou o código de autorização esperado.")
  const stateHash = await sha256(state)
  const storedState = await env.DB.prepare(
    "SELECT state_hash FROM oauth_states WHERE state_hash = ? AND provider = 'meta' AND expires_at > ?"
  )
    .bind(stateHash, new Date().toISOString())
    .first<{ state_hash: string }>()
  if (!storedState)
    throw new Error(
      "A autorização expirou ou o estado OAuth não confere. Tente conectar novamente."
    )
  await env.DB.prepare("DELETE FROM oauth_states WHERE state_hash = ?")
    .bind(stateHash)
    .run()

  const callbackUrl = new URL("/auth/meta/callback", incoming.origin).toString()
  const shortTokenUrl = graphEndpoint(version, "oauth/access_token")
  shortTokenUrl.searchParams.set("client_id", config.appId)
  shortTokenUrl.searchParams.set("client_secret", config.appSecret)
  shortTokenUrl.searchParams.set("redirect_uri", callbackUrl)
  shortTokenUrl.searchParams.set("code", code)
  const shortToken = await graphJson(shortTokenUrl)
  const shortAccessToken = asText(shortToken.access_token)
  if (!shortAccessToken)
    throw new Error("A Meta não retornou um token de acesso.")

  const longTokenUrl = graphEndpoint(version, "oauth/access_token")
  longTokenUrl.searchParams.set("grant_type", "fb_exchange_token")
  longTokenUrl.searchParams.set("client_id", config.appId)
  longTokenUrl.searchParams.set("client_secret", config.appSecret)
  longTokenUrl.searchParams.set("fb_exchange_token", shortAccessToken)
  const longToken = await graphJson(longTokenUrl)
  const accessToken = asText(longToken.access_token, shortAccessToken)
  const tokenExpiry = Number(longToken.expires_in ?? shortToken.expires_in ?? 0)
  const expiresAt =
    tokenExpiry > 0
      ? new Date(Date.now() + tokenExpiry * 1000).toISOString()
      : null
  const accounts = await fetchAdAccounts(version, accessToken)
  if (!accounts.length)
    throw new Error(
      "A conta Meta autorizada não possui contas de anúncio acessíveis."
    )

  const encryptedToken = await encryptSecret(accessToken, env)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO integrations (provider, access_token_ciphertext, token_expires_at, connected_at, updated_at)
      VALUES ('meta', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(provider) DO UPDATE SET access_token_ciphertext = excluded.access_token_ciphertext,
      token_expires_at = excluded.token_expires_at, connected_at = excluded.connected_at,
      updated_at = excluded.updated_at`
    ).bind(encryptedToken, expiresAt),
    ...accounts.map((account) =>
      env.DB.prepare(
        `INSERT INTO ad_accounts (id, name, account_status, currency, timezone_name, business_name, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, account_status = excluded.account_status,
      currency = excluded.currency, timezone_name = excluded.timezone_name, business_name = excluded.business_name,
      updated_at = excluded.updated_at`
      ).bind(
        account.id,
        account.name,
        account.status,
        account.currency,
        account.timezone,
        account.business
      )
    ),
  ])
  return accounts.length
}

async function fetchAdAccounts(version: string, accessToken: string) {
  const accounts: Array<{
    id: string
    name: string
    status: number | null
    currency: string
    timezone: string
    business: string | null
  }> = []
  let url = graphEndpoint(version, "me/adaccounts")
  url.searchParams.set(
    "fields",
    "id,name,account_status,currency,timezone_name,business{name}"
  )
  url.searchParams.set("limit", "100")
  url.searchParams.set("access_token", accessToken)

  for (let page = 0; page < 20; page += 1) {
    const result = await graphJson(url)
    const data = Array.isArray(result.data) ? result.data : []
    for (const entry of data) {
      const account = asRecord(entry)
      const id = asText(account.id)
      if (!id) continue
      const business = asRecord(account.business)
      accounts.push({
        id,
        name: asText(account.name, id),
        status:
          typeof account.account_status === "number"
            ? account.account_status
            : null,
        currency: asText(account.currency, "BRL"),
        timezone: asText(account.timezone_name, "America/Sao_Paulo"),
        business: asText(business.name) || null,
      })
    }
    const next = asText(asRecord(result.paging).next)
    if (!next) return accounts
    const nextUrl = new URL(next)
    if (nextUrl.hostname !== "graph.facebook.com")
      throw new Error("Resposta de paginação inválida da Meta.")
    url = nextUrl
  }
  throw new Error("A busca de contas Meta excedeu o limite de páginas.")
}

export async function queueMetaSync(
  env: Env,
  syncId: string,
  from: string,
  to: string,
  accountIds: string[]
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    throw new Error("Informe um intervalo de datas válido.")
  if (!isDateRangeWithinLimit(from, to))
    throw new Error(
      `A atualização manual aceita intervalos válidos de até ${MAX_DATE_RANGE_DAYS} dias.`
    )
  if (accountIds.length < 1 || accountIds.length > 100)
    throw new Error("Selecione entre 1 e 100 contas de anúncio.")

  const placeholders = accountIds.map(() => "?").join(",")
  const accounts = await env.DB.prepare(
    `SELECT id FROM ad_accounts WHERE id IN (${placeholders})`
  )
    .bind(...accountIds)
    .all<{ id: string }>()
  if (accounts.results.length !== new Set(accountIds).size)
    throw new Error("Uma ou mais contas não estão conectadas ao workspace.")

  const statements = [
    env.DB.prepare(
      `INSERT INTO sync_runs (id, type, status, date_from, date_to, account_ids_json, requested_count)
      VALUES (?, 'meta', 'queued', ?, ?, ?, ?)`
    ).bind(syncId, from, to, JSON.stringify(accountIds), accountIds.length),
    ...accountIds.map((accountId) =>
      env.DB.prepare(
        "INSERT INTO sync_run_accounts (sync_id, account_id, status) VALUES (?, ?, 'queued')"
      ).bind(syncId, accountId)
    ),
  ]
  await env.DB.batch(statements)

  const results = await Promise.allSettled(
    accountIds.map((accountId) =>
      env.SYNC_QUEUE.send({
        type: "meta_sync",
        syncId,
        accountId,
        from,
        to,
      } satisfies QueueMessage)
    )
  )
  const rejectedAccounts = results.flatMap((result, index) =>
    result.status === "rejected" ? [accountIds[index]] : []
  )
  if (rejectedAccounts.length) {
    await env.DB.batch(
      rejectedAccounts.map((accountId) =>
        env.DB.prepare(
          "UPDATE sync_run_accounts SET status = 'failed', error_message = 'Fila indisponível', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_id = ? AND account_id = ?"
        ).bind(syncId, accountId)
      )
    )
  }
  const completedCount = accountIds.length - rejectedAccounts.length
  await env.DB.prepare(
    "UPDATE sync_runs SET status = ?, completed_count = ? WHERE id = ?"
  )
    .bind(completedCount ? "queued" : "failed", 0, syncId)
    .run()
  return { queuedCount: completedCount, failedCount: rejectedAccounts.length }
}

type Insight = {
  account_id?: string
  date_start?: string
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  spend?: string
  impressions?: string
  clicks?: string
  inline_link_clicks?: string | number
  actions?: Array<{
    action_type?: string
    value?: string | number
  }>
  ctr?: string
  cpc?: string
  cpm?: string
}

function metricCount(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null
  if (typeof value === "string" && !value.trim()) return null
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : null
}

function actionCount(actions: Insight["actions"], actionTypes: string[]) {
  if (!actions) return null
  for (const actionType of actionTypes) {
    const action = actions.find((item) => item.action_type === actionType)
    const count = metricCount(action?.value)
    if (count !== null) return count
  }
  return null
}

type MetaCursor =
  | { phase: "insights"; query: string | null }
  | { phase: "attribution"; afterId: number }

export async function consumeMetaSync(
  env: Env,
  message: Extract<QueueMessage, { type: "meta_sync" }>
) {
  const progress = await resumeSync<MetaCursor>(
    env,
    message,
    message.accountId,
    {
      phase: "insights",
      query: null,
    }
  )
  if (!progress) {
    await updateSyncRunStatus(env, message.syncId)
    return
  }
  if (progress.cursor.phase === "attribution") {
    const afterId = await repairSaleAttributionPage(
      env.DB,
      message.accountId,
      progress.cursor.afterId
    )
    const next: MetaCursor | null =
      afterId === null ? null : { phase: "attribution", afterId }
    await checkpointSync(
      env,
      message,
      message.accountId,
      progress.version,
      next,
      0
    )
    if (!next) await updateSyncRunStatus(env, message.syncId)
    return
  }
  const integration = await env.DB.prepare(
    "SELECT access_token_ciphertext FROM integrations WHERE provider = 'meta'"
  ).first<{ access_token_ciphertext: string | null }>()
  if (!integration?.access_token_ciphertext)
    throw new Error("A integração Meta não possui token de acesso.")
  const account = await env.DB.prepare(
    "SELECT id, currency FROM ad_accounts WHERE id = ?"
  )
    .bind(message.accountId)
    .first<{ id: string; currency: string }>()
  if (!account)
    throw new Error(`A conta ${message.accountId} não está conectada.`)

  await env.DB.prepare(
    "UPDATE sync_runs SET status = 'running', started_at = COALESCE(started_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = ?"
  )
    .bind(message.syncId)
    .run()
  await env.DB.prepare(
    "UPDATE sync_run_accounts SET status = 'running', started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_id = ? AND account_id = ?"
  )
    .bind(message.syncId, message.accountId)
    .run()

  const config = await requiredMetaConfig(env)
  const version = config.apiVersion
  const accessToken = await decryptSecret(
    integration.access_token_ciphertext,
    env
  )
  const url = graphEndpoint(version, `${message.accountId}/insights`)
  url.searchParams.set("level", "ad")
  url.searchParams.set("time_increment", "1")
  url.searchParams.set(
    "time_range",
    JSON.stringify({ since: message.from, until: message.to })
  )
  url.searchParams.set(
    "fields",
    "account_id,date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,inline_link_clicks,actions,ctr,cpc,cpm"
  )
  url.searchParams.set("limit", "5")
  if (progress.cursor.phase === "insights" && progress.cursor.query) {
    url.search = progress.cursor.query
  }
  url.searchParams.set("access_token", accessToken)

  const missingFxDates = new Set<string>()
  const result = await graphJson(url)
  if (!Array.isArray(result.data))
    throw new Error("A Meta retornou uma lista de métricas inválida.")
  const insights = result.data as Insight[]
  if (insights.length > 5)
    throw new Error("A Meta não respeitou o tamanho da página solicitado.")
  const statements = await Promise.all(
    insights
      .filter((item) => item.date_start && item.campaign_id)
      .map(async (item) => {
        const spend = Number(item.spend ?? 0)
        const linkClicks =
          metricCount(item.inline_link_clicks) ??
          actionCount(item.actions, ["link_click"]) ??
          Number(item.clicks ?? 0)
        const landingPageViews = actionCount(item.actions, [
          "landing_page_view",
          "onsite_conversion.landing_page_view",
          "omni_landing_page_view",
        ])
        const checkouts = actionCount(item.actions, [
          "offsite_conversion.fb_pixel_initiate_checkout",
          "offsite_conversion.initiate_checkout",
          "onsite_conversion.initiate_checkout",
          "initiate_checkout",
          "fb_mobile_initiated_checkout",
          "omni_initiated_checkout",
        ])
        const fx =
          account.currency === "BRL"
            ? { selling_rate: 1 }
            : await env.DB.prepare(
                "SELECT selling_rate FROM fx_rates WHERE currency = ? AND date <= ? ORDER BY date DESC LIMIT 1"
              )
                .bind(account.currency, item.date_start)
                .first<{ selling_rate: number }>()
        if (!fx && item.date_start) missingFxDates.add(item.date_start)
        return env.DB.prepare(
          `INSERT INTO ad_metrics (
    account_id, date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name,
    spend, spend_brl, impressions, clicks, ctr, cpc, cpm, link_clicks,
    landing_page_views, checkouts, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(account_id, date, campaign_id, adset_id, ad_id) DO UPDATE SET
    campaign_name = excluded.campaign_name, adset_name = excluded.adset_name, ad_name = excluded.ad_name,
    spend = excluded.spend, spend_brl = excluded.spend_brl, impressions = excluded.impressions, clicks = excluded.clicks,
    ctr = excluded.ctr, cpc = excluded.cpc, cpm = excluded.cpm,
    link_clicks = excluded.link_clicks,
    landing_page_views = excluded.landing_page_views,
    checkouts = excluded.checkouts,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
        ).bind(
          message.accountId,
          item.date_start,
          item.campaign_id,
          item.campaign_name ?? item.campaign_id,
          item.adset_id ?? "",
          item.adset_name ?? "",
          item.ad_id ?? "",
          item.ad_name ?? "",
          spend,
          fx ? spend * fx.selling_rate : null,
          Number(item.impressions ?? 0),
          Number(item.clicks ?? 0),
          Number(item.ctr ?? 0),
          Number(item.cpc ?? 0),
          Number(item.cpm ?? 0),
          linkClicks,
          landingPageViews,
          checkouts
        )
      })
  )
  if (statements.length) await env.DB.batch(statements)
  for (const date of missingFxDates) {
    await env.SYNC_QUEUE.send({
      type: "fx_rate",
      currency: account.currency,
      date,
    })
  }
  const next = asText(asRecord(result.paging).next)
  let cursor: MetaCursor = { phase: "attribution", afterId: 0 }
  if (next) {
    const nextUrl = new URL(next)
    if (
      nextUrl.hostname !== "graph.facebook.com" ||
      nextUrl.protocol !== "https:"
    )
      throw new Error("Resposta de paginação inválida da Meta.")
    nextUrl.searchParams.delete("access_token")
    if (nextUrl.search === progress.cursor.query)
      throw new Error("A Meta repetiu o cursor de paginação.")
    cursor = { phase: "insights", query: nextUrl.search }
  }
  await checkpointSync(
    env,
    message,
    message.accountId,
    progress.version,
    cursor,
    statements.length
  )
}

export async function markMetaSyncFailed(
  env: Env,
  message: Extract<QueueMessage, { type: "meta_sync" }>,
  error: unknown
) {
  const errorMessage =
    error instanceof Error
      ? error.message.slice(0, 300)
      : "Falha desconhecida ao sincronizar conta."
  await env.DB.prepare(
    "UPDATE sync_run_accounts SET status = 'failed', error_message = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_id = ? AND account_id = ?"
  )
    .bind(errorMessage, message.syncId, message.accountId)
    .run()
  await updateSyncRunStatus(env, message.syncId)
}

async function updateSyncRunStatus(env: Env, syncId: string) {
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

export async function consumeFxRate(
  env: Env,
  message: Extract<QueueMessage, { type: "fx_rate" }>
) {
  const currency = message.currency.toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("Código de moeda inválido para cotação PTAX.")
  const endDate = new Date(`${message.date}T12:00:00Z`)
  if (Number.isNaN(endDate.getTime()))
    throw new Error("Data inválida para cotação PTAX.")
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - 14)
  const formatDate = (date: Date) =>
    `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}-${date.getUTCFullYear()}`
  const url = new URL(
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)"
  )
  url.searchParams.set("@moeda", `'${currency}'`)
  url.searchParams.set("@dataInicial", `'${formatDate(startDate)}'`)
  url.searchParams.set("@dataFinalCotacao", `'${formatDate(endDate)}'`)
  url.searchParams.set("$format", "json")
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`BCB PTAX respondeu HTTP ${response.status}.`)
  const data = asRecord(await response.json())
  const quotes = Array.isArray(data.value) ? data.value.map(asRecord) : []
  const validQuotes = quotes
    .flatMap((quote) => {
      const rate = Number(quote.cotacaoVenda)
      const rawDate = asText(quote.dataHoraCotacao)
      const quoteDate = rawDate?.match(/\d{4}-\d{2}-\d{2}/)?.[0]
      return Number.isFinite(rate) &&
        rate > 0 &&
        quoteDate &&
        quoteDate <= message.date
        ? [{ rate, date: quoteDate }]
        : []
    })
    .sort((left, right) => right.date.localeCompare(left.date))
  const latest = validQuotes[0]
  if (!latest)
    throw new Error(
      `BCB PTAX não retornou cotação de venda para ${currency} até ${message.date}.`
    )

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO fx_rates (currency, date, selling_rate) VALUES (?, ?, ?)
      ON CONFLICT(currency, date) DO UPDATE SET selling_rate = excluded.selling_rate, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    ).bind(currency, latest.date, latest.rate),
    env.DB.prepare(
      `UPDATE sales SET amount_brl = (amount_minor / CAST(? AS REAL)) * ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE currency = ? AND attribution_date = ?`
    ).bind(
      10 **
        (new Intl.NumberFormat("en", {
          style: "currency",
          currency,
        }).resolvedOptions().maximumFractionDigits ?? 2),
      latest.rate,
      currency,
      message.date
    ),
    env.DB.prepare(
      `UPDATE ad_metrics SET spend_brl = spend * ? WHERE date = ? AND account_id IN (SELECT id FROM ad_accounts WHERE currency = ?)`
    ).bind(latest.rate, message.date, currency),
  ])
}
