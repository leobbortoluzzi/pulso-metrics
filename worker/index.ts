import { Hono, type Context } from "hono"
import { calculatePerformance } from "../src/lib/metrics"
import {
  isDateRangeWithinLimit,
  MAX_DATE_RANGE_DAYS,
} from "../src/lib/date-range"
import { ensureDatabaseSchema } from "./database"
import {
  completeMetaAuthorization,
  beginMetaAuthorization,
  queueMetaSync,
  markMetaSyncFailed,
  consumeFxRate,
  consumeMetaSync,
} from "./meta"
import {
  consumeGatewaySync,
  markGatewaySyncFailed,
  removeGatewayCredentials,
  saveGatewayCredentials,
} from "./gateways"
import {
  createPasswordHash,
  randomToken,
  readCookie,
  sha256,
  verifyPassword,
} from "./secure-store"
import {
  removeWebhookToken,
  saveMetaConfiguration,
  saveWebhookTokens,
  workspaceSettingsView,
} from "./settings"
import {
  hotmartWebhookIsAuthorized,
  ingestSale,
  kiwifyWebhookIsAuthorized,
} from "./webhooks"
import type { QueueMessage } from "./messages"
import {
  querySales,
  type SalesAttributionFilter,
  type SalesStatusFilter,
} from "./sales-query"

export { SecretVault } from "./vault"

type Level = "campaign" | "adset" | "ad"
type MetricRow = {
  account_id: string
  account_name: string
  campaign_id: string
  campaign_name: string
  adset_id: string
  adset_name: string
  ad_id: string
  ad_name: string
  spend: number
  fx_missing: number
  impressions: number
  clicks: number
}
type SalesAggregate = {
  account_id: string | null
  campaign_id: string | null
  adset_id: string | null
  ad_id: string | null
  revenue: number
  orders: number
}

const app = new Hono<{ Bindings: Env }>()

async function dashboardAccount(env: Env) {
  return env.DB.prepare(
    "SELECT password_hash FROM owner_account WHERE id = 1"
  ).first<{ password_hash: string }>()
}

async function dashboardConfigured(env: Env) {
  return Boolean(await dashboardAccount(env))
}

function hasSameOrigin(context: Context<{ Bindings: Env }>) {
  const origin = context.req.header("Origin")
  return !origin || origin === new URL(context.req.url).origin
}

async function startDashboardSession(context: Context<{ Bindings: Env }>) {
  const token = randomToken()
  const tokenHash = await sha256(token)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(
      new Date().toISOString()
    ),
    context.env.DB.prepare(
      "INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)"
    ).bind(tokenHash, expiresAt),
  ])
  const secure =
    new URL(context.req.url).protocol === "https:" ? "; Secure" : ""
  context.header(
    "Set-Cookie",
    `pulso_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`
  )
}

app.onError((error, context) => {
  console.error("request_failed", {
    route: context.req.path.startsWith("/api/webhooks/kiwify")
      ? "/api/webhooks/kiwify"
      : context.req.path,
    message: error instanceof Error ? error.message : "unknown_error",
  })
  return context.json(
    { error: "Ocorreu um erro ao processar a solicitação." },
    500
  )
})

app.use("/api/*", async (context, next) => {
  await ensureDatabaseSchema(context.env.DB)

  const path = context.req.path
  const isPublic =
    path === "/api/health" ||
    path === "/api/auth/setup" ||
    path === "/api/auth/login" ||
    path === "/api/auth/session" ||
    path === "/api/webhooks/hotmart" ||
    path === "/api/webhooks/kiwify"
  if (isPublic) return next()

  if (!(await dashboardConfigured(context.env))) {
    return context.json(
      { error: "O acesso privado ainda não foi configurado no Worker." },
      503
    )
  }
  const token = readCookie(context.req.raw, "pulso_session")
  if (!token) return context.json({ error: "Faça login para continuar." }, 401)
  const tokenHash = await sha256(token)
  const session = await context.env.DB.prepare(
    "SELECT token_hash FROM sessions WHERE token_hash = ? AND expires_at > ?"
  )
    .bind(tokenHash, new Date().toISOString())
    .first<{ token_hash: string }>()
  if (!session)
    return context.json({ error: "Sua sessão expirou. Entre novamente." }, 401)
  await next()
})

app.use("/auth/meta/*", async (context, next) => {
  if (!(await dashboardConfigured(context.env)))
    return context.redirect("/?access_error=not_configured")
  const token = readCookie(context.req.raw, "pulso_session")
  if (!token) return context.redirect("/?access=login")
  const session = await context.env.DB.prepare(
    "SELECT token_hash FROM sessions WHERE token_hash = ? AND expires_at > ?"
  )
    .bind(await sha256(token), new Date().toISOString())
    .first<{ token_hash: string }>()
  if (!session) return context.redirect("/?access=login")
  await next()
})

app.get("/api/health", async (context) =>
  context.json({
    status: "ok",
    privateAccessConfigured: await dashboardConfigured(context.env),
  })
)

app.get("/api/auth/session", async (context) => {
  const account = await dashboardAccount(context.env)
  const configured = Boolean(account)
  const token = readCookie(context.req.raw, "pulso_session")
  if (!configured || !token)
    return context.json({
      configured,
      setupRequired: !configured,
      authenticated: false,
    })
  const session = await context.env.DB.prepare(
    "SELECT token_hash FROM sessions WHERE token_hash = ? AND expires_at > ?"
  )
    .bind(await sha256(token), new Date().toISOString())
    .first<{ token_hash: string }>()
  return context.json({
    configured,
    setupRequired: !configured,
    authenticated: Boolean(session),
  })
})

app.post("/api/auth/setup", async (context) => {
  if (!hasSameOrigin(context))
    return context.json({ error: "Origem da solicitação inválida." }, 403)
  if (await dashboardConfigured(context.env))
    return context.json({ error: "A conta administrativa já foi criada." }, 409)
  const body = await context.req
    .json<{ password?: string; confirmPassword?: string }>()
    .catch(() => null)
  const password = typeof body?.password === "string" ? body.password : ""
  const confirmPassword =
    typeof body?.confirmPassword === "string" ? body.confirmPassword : ""
  if (password.length < 12 || password.length > 128)
    return context.json(
      { error: "Use uma senha com pelo menos 12 caracteres." },
      400
    )
  if (password !== confirmPassword)
    return context.json({ error: "As senhas não coincidem." }, 400)

  const passwordHash = await createPasswordHash(password)
  const result = await context.env.DB.prepare(
    "INSERT INTO owner_account (id, password_hash) VALUES (1, ?) ON CONFLICT(id) DO NOTHING"
  )
    .bind(passwordHash)
    .run()
  if (result.meta.changes !== 1)
    return context.json({ error: "A conta administrativa já foi criada." }, 409)

  await startDashboardSession(context)
  return context.json({ configured: true, authenticated: true }, 201)
})

app.post("/api/auth/login", async (context) => {
  if (!hasSameOrigin(context))
    return context.json({ error: "Origem da solicitação inválida." }, 403)
  const account = await dashboardAccount(context.env)
  if (!account) {
    return context.json(
      { error: "Crie a conta administrativa para acessar o workspace." },
      409
    )
  }
  const body = await context.req.json<{ password?: string }>().catch(() => null)
  const password = typeof body?.password === "string" ? body.password : ""
  if (
    password.length > 200 ||
    !(await verifyPassword(password, account.password_hash))
  ) {
    return context.json({ error: "Senha incorreta." }, 401)
  }
  await startDashboardSession(context)
  return context.json({ authenticated: true })
})

app.put("/api/auth/password", async (context) => {
  if (!hasSameOrigin(context))
    return context.json({ error: "Origem da solicitação inválida." }, 403)
  const account = await dashboardAccount(context.env)
  if (!account)
    return context.json(
      { error: "A conta administrativa não foi encontrada." },
      409
    )
  const body = await context.req
    .json<{
      currentPassword?: string
      newPassword?: string
      confirmPassword?: string
    }>()
    .catch(() => null)
  const currentPassword =
    typeof body?.currentPassword === "string" ? body.currentPassword : ""
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : ""
  const confirmPassword =
    typeof body?.confirmPassword === "string" ? body.confirmPassword : ""
  if (!(await verifyPassword(currentPassword, account.password_hash)))
    return context.json({ error: "A senha atual está incorreta." }, 401)
  if (newPassword.length < 12 || newPassword.length > 128)
    return context.json(
      { error: "Use uma senha com pelo menos 12 caracteres." },
      400
    )
  if (newPassword !== confirmPassword)
    return context.json({ error: "As novas senhas não coincidem." }, 400)

  const passwordHash = await createPasswordHash(newPassword)
  const result = await context.env.DB.prepare(
    "UPDATE owner_account SET password_hash = ? WHERE id = 1 AND password_hash = ?"
  )
    .bind(passwordHash, account.password_hash)
    .run()
  if (result.meta.changes !== 1)
    return context.json(
      { error: "A senha foi alterada em outra solicitação. Entre novamente." },
      409
    )
  await context.env.DB.prepare("DELETE FROM sessions").run()
  await startDashboardSession(context)
  return context.json({ changed: true })
})

app.post("/api/auth/logout", async (context) => {
  const token = readCookie(context.req.raw, "pulso_session")
  if (token)
    await context.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256(token))
      .run()
  context.header(
    "Set-Cookie",
    "pulso_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  )
  return context.json({ authenticated: false })
})

app.get("/auth/meta/start", async (context) => {
  try {
    const redirect = await beginMetaAuthorization(context.env, context.req.url)
    return context.redirect(redirect)
  } catch (error) {
    return context.redirect(
      `/?integration_error=${encodeURIComponent(errorText(error))}`
    )
  }
})

app.get("/auth/meta/callback", async (context) => {
  try {
    const count = await completeMetaAuthorization(context.env, context.req.url)
    return context.redirect(`/?integration=meta&accounts=${count}`)
  } catch (error) {
    return context.redirect(
      `/?integration_error=${encodeURIComponent(errorText(error))}`
    )
  }
})

app.get("/api/integrations", async (context) => {
  const result = await context.env.DB.prepare(
    "SELECT provider, connected_at, access_token_ciphertext IS NOT NULL AS has_token, credentials_ciphertext IS NOT NULL AS has_credentials FROM integrations ORDER BY provider"
  ).all<{
    provider: string
    connected_at: string | null
    has_token: number
    has_credentials: number
  }>()
  return context.json({ integrations: result.results })
})

app.use("/api/settings/*", async (context, next) => {
  context.header("Cache-Control", "no-store")
  await next()
})

app.get("/api/settings", async (context) => {
  context.header("Cache-Control", "no-store")
  return context.json(await workspaceSettingsView(context.env, context.req.url))
})

app.put("/api/settings/meta", async (context) => {
  if (!hasSameOrigin(context))
    return context.json({ error: "Origem da solicitação inválida." }, 403)
  const body = await context.req.json<unknown>().catch(() => null)
  try {
    return context.json(await saveMetaConfiguration(context.env, body))
  } catch (error) {
    return context.json({ error: errorText(error) }, 400)
  }
})

app.put("/api/settings/webhooks", async (context) => {
  if (!hasSameOrigin(context))
    return context.json({ error: "Origem da solicitação inválida." }, 403)
  const body = await context.req.json<unknown>().catch(() => null)
  try {
    await saveWebhookTokens(context.env, body)
    return context.json(
      await workspaceSettingsView(context.env, context.req.url)
    )
  } catch (error) {
    return context.json({ error: errorText(error) }, 400)
  }
})

app.delete("/api/settings/webhooks/:provider", async (context) => {
  if (!hasSameOrigin(context))
    return context.json({ error: "Origem da solicitação inválida." }, 403)
  const provider = context.req.param("provider")
  if (provider !== "hotmart" && provider !== "kiwify")
    return context.json({ error: "Gateway não suportado." }, 404)
  await removeWebhookToken(context.env, provider)
  return context.json(await workspaceSettingsView(context.env, context.req.url))
})

app.post("/api/integrations/:provider/credentials", async (context) => {
  const provider = context.req.param("provider")
  if (provider !== "hotmart" && provider !== "kiwify")
    return context.json({ error: "Gateway não suportado." }, 404)
  const body = await context.req.json<unknown>().catch(() => null)
  if (!body)
    return context.json({ error: "Informe as credenciais do gateway." }, 400)
  try {
    const result = await saveGatewayCredentials(context.env, provider, body)
    return context.json(result)
  } catch (error) {
    return context.json({ error: errorText(error) }, 400)
  }
})

app.delete("/api/integrations/:provider/credentials", async (context) => {
  const provider = context.req.param("provider")
  if (provider !== "hotmart" && provider !== "kiwify")
    return context.json({ error: "Gateway não suportado." }, 404)
  await removeGatewayCredentials(context.env, provider)
  return context.json({ provider, connected: false })
})

app.get("/api/integrations/webhooks", async (context) => {
  context.header("Cache-Control", "no-store")
  const { webhooks } = await workspaceSettingsView(context.env, context.req.url)
  return context.json({
    hotmart: webhooks.hotmartUrl,
    kiwify: webhooks.kiwifyUrl,
  })
})

app.get("/api/meta/accounts", async (context) => {
  const result = await context.env.DB.prepare(
    "SELECT id, name, account_status, currency, timezone_name, business_name, updated_at FROM ad_accounts ORDER BY name"
  ).all()
  return context.json({ accounts: result.results })
})

app.get("/api/products", async (context) => {
  const result = await context.env.DB.prepare(
    "SELECT DISTINCT product_name FROM sales WHERE product_name != '' ORDER BY product_name"
  ).all<{ product_name: string }>()
  return context.json({
    products: result.results.map((row) => row.product_name),
  })
})

app.post("/api/meta/sync", async (context) => {
  const body = await context.req
    .json<{ from?: string; to?: string; accountIds?: unknown }>()
    .catch(() => null)
  const from = typeof body?.from === "string" ? body.from : ""
  const to = typeof body?.to === "string" ? body.to : ""
  const accountIds: string[] = Array.isArray(body?.accountIds)
    ? [
        ...new Set(
          body.accountIds.filter(
            (value: unknown): value is string =>
              typeof value === "string" && value.length <= 80
          )
        ),
      ]
    : []
  if (!isDate(from) || !isDate(to) || from > to)
    return context.json({ error: "Informe um período válido." }, 400)
  const id = crypto.randomUUID()
  try {
    const queued = await queueMetaSync(context.env, id, from, to, accountIds)
    return context.json({ syncId: id, ...queued }, 202)
  } catch (error) {
    return context.json({ error: errorText(error) }, 400)
  }
})

app.get("/api/sync/recent", async (context) => {
  const requestedLimit = Number(context.req.query("limit") ?? 5)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(10, Math.max(1, Math.floor(requestedLimit)))
    : 5
  const result = await context.env.DB.prepare(
    "SELECT id, type, status, date_from, date_to, requested_count, completed_count, error_message, created_at, completed_at FROM sync_runs ORDER BY created_at DESC LIMIT ?"
  )
    .bind(limit)
    .all()
  return context.json({ runs: result.results })
})

app.get("/api/sync/:id", async (context) => {
  const sync = await context.env.DB.prepare(
    "SELECT id, type, status, date_from, date_to, requested_count, completed_count, error_message, created_at, started_at, completed_at FROM sync_runs WHERE id = ?"
  )
    .bind(context.req.param("id"))
    .first()
  if (!sync)
    return context.json({ error: "Sincronização não encontrada." }, 404)
  const accounts = await context.env.DB.prepare(
    "SELECT account_id, status, rows_written, error_message, started_at, completed_at FROM sync_run_accounts WHERE sync_id = ? ORDER BY account_id"
  )
    .bind(context.req.param("id"))
    .all()
  return context.json({ ...sync, accounts: accounts.results })
})

app.get("/api/dashboard", async (context) => {
  const from = context.req.query("from") ?? ""
  const to = context.req.query("to") ?? ""
  if (!isDate(from) || !isDate(to) || from > to)
    return context.json({ error: "Informe datas válidas em from e to." }, 400)
  const level = parseLevel(context.req.query("level"))
  const accountIds = context.req.queries("accountIds") ?? []
  const queryAccountIds = accountIds
    .flatMap((entry) => entry.split(","))
    .filter(Boolean)
  if (queryAccountIds.length > 100)
    return context.json({ error: "O filtro aceita até 100 contas." }, 400)
  const gateway = parseGateway(context.req.query("gateway"))
  const product = context.req.query("product")?.slice(0, 150) ?? ""
  if (!isDateRangeWithinLimit(from, to)) {
    return context.json(
      {
        error: `O dashboard aceita intervalos de até ${MAX_DATE_RANGE_DAYS} dias.`,
      },
      400
    )
  }
  const metrics = await loadMetricRows(
    context.env.DB,
    from,
    to,
    queryAccountIds,
    level
  )
  const attributedSales = await loadAttributedSales(
    context.env.DB,
    from,
    to,
    queryAccountIds,
    level,
    gateway,
    product
  )
  const salesByKey = new Map(
    attributedSales.map((sale) => [metricKey(sale, level), sale])
  )
  const rows = metrics.map((metric) => {
    const sale = salesByKey.get(metricKey(metric, level))
    const spend = metric.spend
    const revenue = sale?.revenue ?? 0
    const performance = calculatePerformance(spend, revenue)
    return {
      id:
        level === "campaign"
          ? metric.campaign_id
          : level === "adset"
            ? metric.adset_id
            : metric.ad_id,
      name:
        level === "campaign"
          ? metric.campaign_name
          : level === "adset"
            ? metric.adset_name
            : metric.ad_name,
      accountId: metric.account_id,
      accountName: metric.account_name,
      spend,
      revenue,
      sales: sale?.orders ?? 0,
      impressions: metric.impressions,
      clicks: metric.clicks,
      roas: performance.roas,
      roi: performance.roi,
      fxMissing: metric.fx_missing > 0,
    }
  })

  const totalSpend = metrics.reduce((sum, row) => sum + row.spend, 0)
  const summarySales = await loadSalesSummary(
    context.env.DB,
    from,
    to,
    queryAccountIds,
    gateway,
    product
  )
  const attributedRevenue = attributedSales.reduce(
    (sum, sale) => sum + sale.revenue,
    0
  )
  const performance = calculatePerformance(totalSpend, attributedRevenue)
  const unmatched = await countUnmatchedSales(
    context.env.DB,
    from,
    to,
    queryAccountIds,
    gateway,
    product
  )
  const daily = await loadDailyData(
    context.env.DB,
    from,
    to,
    queryAccountIds,
    gateway,
    product
  )
  return context.json({
    source: "live",
    level,
    from,
    to,
    summary: {
      ...performance,
      revenue: attributedRevenue,
      allNetRevenue: summarySales.revenue,
      sales: summarySales.orders,
      impressions: metrics.reduce((sum, row) => sum + row.impressions, 0),
      clicks: metrics.reduce((sum, row) => sum + row.clicks, 0),
      attributedSales: attributedSales.reduce(
        (sum, sale) => sum + sale.orders,
        0
      ),
      unmatchedSales: unmatched,
    },
    daily,
    rows,
  })
})

app.get("/api/sales", async (context) => {
  const from = context.req.query("from") ?? ""
  const to = context.req.query("to") ?? ""
  if (!isDate(from) || !isDate(to) || from > to)
    return context.json({ error: "Informe datas válidas em from e to." }, 400)
  const provider = parseGateway(context.req.query("gateway"))
  const product = context.req.query("product")?.slice(0, 150) ?? ""
  const requestedStatus = context.req.query("status") ?? "all"
  const validStatuses = new Set([
    "all",
    "approved",
    "refunded",
    "chargeback",
    "pending",
  ])
  if (!validStatuses.has(requestedStatus))
    return context.json({ error: "Status de venda inválido." }, 400)
  const attribution = context.req.query("attribution") ?? "all"
  if (!new Set(["all", "matched", "unmatched"]).has(attribution))
    return context.json({ error: "Filtro de atribuição inválido." }, 400)
  const query = context.req.query("q")?.trim().slice(0, 100) ?? ""
  const accountQuery = context.req.queries("accountIds") ?? []
  const accountIds = accountQuery
    .flatMap((entry) => entry.split(","))
    .filter(Boolean)
  if (accountIds.length > 100)
    return context.json({ error: "O filtro aceita até 100 contas." }, 400)
  if (!isDateRangeWithinLimit(from, to)) {
    return context.json(
      {
        error: `A lista de vendas aceita intervalos de até ${MAX_DATE_RANGE_DAYS} dias.`,
      },
      400
    )
  }
  const rawLimit = Number(context.req.query("limit") ?? 50)
  const rawOffset = Number(context.req.query("offset") ?? 0)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
    : 50
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.floor(rawOffset))
    : 0
  return context.json(
    await querySales(context.env.DB, {
      from,
      to,
      accountIds,
      provider,
      product,
      status: requestedStatus as SalesStatusFilter,
      attribution: attribution as SalesAttributionFilter,
      query,
      limit,
      offset,
    })
  )
})

app.post("/api/gateways/reconcile", async (context) => {
  const body = await context.req
    .json<{ from?: string; to?: string }>()
    .catch(() => null)
  const from = typeof body?.from === "string" ? body.from : ""
  const to = typeof body?.to === "string" ? body.to : ""
  if (!isDate(from) || !isDate(to) || from > to) {
    return context.json(
      { error: "Informe um período válido para reconciliação." },
      400
    )
  }
  if (!isDateRangeWithinLimit(from, to)) {
    return context.json(
      {
        error: `A reconciliação aceita intervalos de até ${MAX_DATE_RANGE_DAYS} dias.`,
      },
      400
    )
  }
  const credentials = await context.env.DB.prepare(
    "SELECT provider FROM integrations WHERE provider IN ('hotmart', 'kiwify') AND credentials_ciphertext IS NOT NULL"
  ).all<{ provider: "hotmart" | "kiwify" }>()
  if (!credentials.results.length) {
    return context.json(
      {
        error:
          "Adicione as credenciais de API da Hotmart ou Kiwify em Integrações antes de reconciliar.",
      },
      409
    )
  }
  const id = crypto.randomUUID()
  const insertStatements = [
    context.env.DB.prepare(
      "INSERT INTO sync_runs (id, type, status, date_from, date_to, account_ids_json, requested_count) VALUES (?, 'gateways', 'queued', ?, ?, ?, ?)"
    ).bind(
      id,
      from,
      to,
      JSON.stringify(
        credentials.results.map((integration) => integration.provider)
      ),
      credentials.results.length
    ),
    ...credentials.results.map((integration) =>
      context.env.DB.prepare(
        "INSERT INTO sync_run_accounts (sync_id, account_id, status) VALUES (?, ?, 'queued')"
      ).bind(id, `gateway:${integration.provider}`)
    ),
  ]
  await context.env.DB.batch(insertStatements)
  const results = await Promise.allSettled(
    credentials.results.map((integration) =>
      context.env.SYNC_QUEUE.send({
        type: "gateway_sync",
        syncId: id,
        provider: integration.provider,
        from,
        to,
      } satisfies QueueMessage)
    )
  )
  const failedCount = results.filter(
    (result) => result.status === "rejected"
  ).length
  const failedProviders = results.flatMap((result, index) =>
    result.status === "rejected" ? [credentials.results[index].provider] : []
  )
  if (failedProviders.length) {
    await context.env.DB.batch(
      failedProviders.map((provider) =>
        context.env.DB.prepare(
          "UPDATE sync_run_accounts SET status = 'failed', error_message = 'Fila indisponível', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE sync_id = ? AND account_id = ?"
        ).bind(id, `gateway:${provider}`)
      )
    )
  }
  await context.env.DB.prepare("UPDATE sync_runs SET status = ? WHERE id = ?")
    .bind(failedCount === credentials.results.length ? "failed" : "queued", id)
    .run()
  return context.json(
    {
      syncId: id,
      queuedCount: credentials.results.length - failedCount,
      failedCount,
    },
    202
  )
})

app.post("/api/webhooks/hotmart", async (context) => {
  if (!(await hotmartWebhookIsAuthorized(context.req.raw, context.env)))
    return context.json({ error: "Token do webhook inválido." }, 401)
  return acceptWebhook(context, "hotmart")
})

app.post("/api/webhooks/kiwify", async (context) => {
  if (!(await kiwifyWebhookIsAuthorized(context.req.raw, context.env)))
    return context.json({ error: "Token do webhook inválido." }, 401)
  return acceptWebhook(context, "kiwify")
})

app.notFound((context) => context.json({ error: "Rota não encontrada." }, 404))

async function acceptWebhook(
  context: Context<{ Bindings: Env }>,
  provider: "hotmart" | "kiwify"
) {
  const body = await context.req.json<unknown>().catch(() => null)
  if (!body) return context.json({ error: "Corpo JSON inválido." }, 400)
  try {
    const result = await ingestSale(context.env, provider, body)
    return context.json({ received: true, ...result }, 202)
  } catch (error) {
    return context.json({ error: errorText(error) }, 400)
  }
}

async function loadMetricRows(
  db: D1Database,
  from: string,
  to: string,
  accountIds: string[],
  level: Level
) {
  const accountFilter = accountIds.length
    ? `AND m.account_id IN (${accountIds.map(() => "?").join(",")})`
    : ""
  const selectedIds =
    level === "campaign"
      ? "m.account_id, m.campaign_id"
      : level === "adset"
        ? "m.account_id, m.campaign_id, m.adset_id"
        : "m.account_id, m.campaign_id, m.adset_id, m.ad_id"
  const sql = `SELECT ${selectedIds},
    a.name AS account_name,
    MAX(m.campaign_name) AS campaign_name,
    MAX(m.adset_name) AS adset_name,
    MAX(m.ad_name) AS ad_name,
    SUM(COALESCE(m.spend_brl, 0)) AS spend,
    SUM(CASE WHEN m.spend_brl IS NULL THEN 1 ELSE 0 END) AS fx_missing,
    SUM(m.impressions) AS impressions,
    SUM(m.clicks) AS clicks
    FROM ad_metrics m JOIN ad_accounts a ON a.id = m.account_id
    WHERE m.date BETWEEN ? AND ? ${accountFilter}
    GROUP BY ${selectedIds}, a.name ORDER BY spend DESC LIMIT 500`
  const result = await db
    .prepare(sql)
    .bind(from, to, ...accountIds)
    .all<MetricRow>()
  return result.results
}

async function loadAttributedSales(
  db: D1Database,
  from: string,
  to: string,
  accountIds: string[],
  level: Level,
  gateway: string | null,
  product: string
) {
  const clauses = [
    "attribution_date BETWEEN ? AND ?",
    "status = 'approved'",
    "amount_brl IS NOT NULL",
    "campaign_id IS NOT NULL",
  ]
  const values: Array<string> = [from, to]
  if (accountIds.length) {
    clauses.push(`account_id IN (${accountIds.map(() => "?").join(",")})`)
    values.push(...accountIds)
  }
  if (gateway) {
    clauses.push("provider = ?")
    values.push(gateway)
  }
  if (product) {
    clauses.push("product_name = ?")
    values.push(product)
  }
  const keys =
    level === "campaign"
      ? "account_id, campaign_id"
      : level === "adset"
        ? "account_id, campaign_id, adset_id"
        : "account_id, campaign_id, adset_id, ad_id"
  const result = await db
    .prepare(
      `SELECT ${keys}, SUM(amount_brl) AS revenue, COUNT(*) AS orders FROM sales WHERE ${clauses.join(" AND ")} GROUP BY ${keys}`
    )
    .bind(...values)
    .all<SalesAggregate>()
  return result.results
}

async function loadSalesSummary(
  db: D1Database,
  from: string,
  to: string,
  accountIds: string[],
  gateway: string | null,
  product: string
) {
  const clauses = ["attribution_date BETWEEN ? AND ?", "status = 'approved'"]
  const values: Array<string> = [from, to]
  if (accountIds.length) {
    clauses.push(
      `(account_id IN (${accountIds.map(() => "?").join(",")}) OR account_id IS NULL)`
    )
    values.push(...accountIds)
  }
  if (gateway) {
    clauses.push("provider = ?")
    values.push(gateway)
  }
  if (product) {
    clauses.push("product_name = ?")
    values.push(product)
  }
  const result = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_brl), 0) AS revenue, COUNT(*) AS orders FROM sales WHERE ${clauses.join(" AND ")}`
    )
    .bind(...values)
    .first<{ revenue: number; orders: number }>()
  return result ?? { revenue: 0, orders: 0 }
}

async function loadDailyData(
  db: D1Database,
  from: string,
  to: string,
  accountIds: string[],
  gateway: string | null,
  product: string
) {
  const accountFilter = accountIds.length
    ? `AND m.account_id IN (${accountIds.map(() => "?").join(",")})`
    : ""
  const spendResult = await db
    .prepare(
      `SELECT m.date, COALESCE(SUM(m.spend_brl), 0) AS spend
    FROM ad_metrics m WHERE m.date BETWEEN ? AND ? ${accountFilter} GROUP BY m.date`
    )
    .bind(from, to, ...accountIds)
    .all<{ date: string; spend: number }>()

  const salesClauses = [
    "attribution_date BETWEEN ? AND ?",
    "status = 'approved'",
    "amount_brl IS NOT NULL",
    "campaign_id IS NOT NULL",
  ]
  const salesValues: Array<string> = [from, to]
  if (accountIds.length) {
    salesClauses.push(`account_id IN (${accountIds.map(() => "?").join(",")})`)
    salesValues.push(...accountIds)
  }
  if (gateway) {
    salesClauses.push("provider = ?")
    salesValues.push(gateway)
  }
  if (product) {
    salesClauses.push("product_name = ?")
    salesValues.push(product)
  }
  const revenueResult = await db
    .prepare(
      `SELECT attribution_date AS date, SUM(amount_brl) AS revenue
    FROM sales WHERE ${salesClauses.join(" AND ")} GROUP BY attribution_date`
    )
    .bind(...salesValues)
    .all<{ date: string; revenue: number }>()

  const points = new Map<string, { spend: number; revenue: number }>()
  for (const row of spendResult.results)
    points.set(row.date, { spend: row.spend, revenue: 0 })
  for (const row of revenueResult.results) {
    const point = points.get(row.date) ?? { spend: 0, revenue: 0 }
    point.revenue = row.revenue
    points.set(row.date, point)
  }
  const days: string[] = []
  const date = new Date(`${from}T00:00:00.000Z`)
  const last = new Date(`${to}T00:00:00.000Z`)
  while (date <= last) {
    days.push(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return days.map((day) => ({
    date: day,
    ...(points.get(day) ?? { spend: 0, revenue: 0 }),
  }))
}

async function countUnmatchedSales(
  db: D1Database,
  from: string,
  to: string,
  accountIds: string[],
  gateway: string | null,
  product: string
) {
  const clauses = [
    "attribution_date BETWEEN ? AND ?",
    "status = 'approved'",
    "campaign_id IS NULL AND adset_id IS NULL AND ad_id IS NULL",
  ]
  const values: Array<string> = [from, to]
  if (accountIds.length) {
    clauses.push(
      "(account_id IN (" +
        accountIds.map(() => "?").join(",") +
        ") OR account_id IS NULL)"
    )
    values.push(...accountIds)
  }
  if (gateway) {
    clauses.push("provider = ?")
    values.push(gateway)
  }
  if (product) {
    clauses.push("product_name = ?")
    values.push(product)
  }
  const result = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM sales WHERE ${clauses.join(" AND ")}`
    )
    .bind(...values)
    .first<{ total: number }>()
  return result?.total ?? 0
}

function metricKey(
  row:
    | Pick<MetricRow, "account_id" | "campaign_id" | "adset_id" | "ad_id">
    | SalesAggregate,
  level: Level
) {
  const parts = [row.account_id ?? "", row.campaign_id ?? ""]
  if (level !== "campaign") parts.push(row.adset_id ?? "")
  if (level === "ad") parts.push(row.ad_id ?? "")
  return parts.join("|")
}

function parseLevel(value: string | undefined): Level {
  if (value === "adset" || value === "ad") return value
  return "campaign"
}

function parseGateway(value: string | undefined) {
  return value === "hotmart" || value === "kiwify" ? value : null
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Erro desconhecido."
}

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<QueueMessage>, env: Env) {
    for (const message of batch.messages) {
      try {
        if (message.body.type === "meta_sync")
          await consumeMetaSync(env, message.body)
        else if (message.body.type === "gateway_sync")
          await consumeGatewaySync(env, message.body)
        else await consumeFxRate(env, message.body)
        message.ack()
      } catch (error) {
        console.error("queue_message_failed", {
          type: message.body.type,
          syncId:
            message.body.type === "meta_sync" ||
            message.body.type === "gateway_sync"
              ? message.body.syncId
              : undefined,
          message: errorText(error),
        })
        if (message.attempts >= 3 && message.body.type === "meta_sync")
          await markMetaSyncFailed(env, message.body, error)
        if (message.attempts >= 3 && message.body.type === "gateway_sync")
          await markGatewaySyncFailed(env, message.body, error)
        message.retry({ delaySeconds: 30 })
      }
    }
  },
}
