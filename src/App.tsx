import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  Filter,
  LayoutDashboard,
  Link2,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  Wallet,
  X,
  Zap,
} from "lucide-react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { currencyMinorUnit } from "@/lib/metrics"
import {
  accounts,
  campaigns,
  dailyMetrics,
  sales,
  type AdAccount,
  type Campaign,
  type Sale,
} from "@/lib/dashboard-data"

type Page = "overview" | "sales" | "integrations"
type Period = 7 | 14 | 30
type Level = "Campanhas" | "Conjuntos" | "Anúncios"
type Gateway = "Todos os gateways" | "Hotmart" | "Kiwify"

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

const compactCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
})

const numberFormat = new Intl.NumberFormat("pt-BR")
const accountColors = ["#dcece4", "#eee7d7", "#e6e2f0", "#e1e9ee", "#f1e4dc"]

function App() {
  const [authState, setAuthState] = useState<
    "checking" | "setup" | "demo" | "authenticated" | "required" | "error"
  >("checking")
  const [page, setPage] = useState<Page>("overview")
  const [period, setPeriod] = useState<Period>(14)
  const [accountFilter, setAccountFilter] = useState("all")
  const [productFilter, setProductFilter] = useState("Todos os produtos")
  const [gatewayFilter, setGatewayFilter] =
    useState<Gateway>("Todos os gateways")
  const [level, setLevel] = useState<Level>("Campanhas")
  const [query, setQuery] = useState("")
  const [chartMode, setChartMode] = useState<"Receita" | "Investimento">(
    "Receita"
  )
  const [syncing, setSyncing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [toast, setToast] = useState(readToastFromUrl)
  const [adAccountList, setAdAccountList] = useState(accounts)
  const [liveCampaigns, setLiveCampaigns] = useState<Campaign[] | null>(null)
  const [liveSales, setLiveSales] = useState<Sale[] | null>(null)
  const [liveSummary, setLiveSummary] = useState<{
    spend: number
    revenue: number
    profit: number
    roas: number | null
    roi: number | null
    sales: number
    clicks: number
    impressions: number
    attributedSales: number
    unmatchedSales: number
  } | null>(null)
  const [liveDaily, setLiveDaily] = useState<Array<{
    label: string
    spend: number
    revenue: number
  }> | null>(null)
  const [integrationStatus, setIntegrationStatus] = useState({
    meta: false,
    hotmart: false,
    kiwify: false,
  })
  const [productOptions, setProductOptions] = useState(uniqueProducts)
  const [activeSyncId, setActiveSyncId] = useState("")
  const [dataRefresh, setDataRefresh] = useState(0)

  const visibleCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR")
    return (liveCampaigns ?? campaigns).filter((campaign) => {
      const accountMatches =
        accountFilter === "all" || campaign.accountId === accountFilter
      const productMatches =
        liveCampaigns !== null ||
        productFilter === "Todos os produtos" ||
        campaign.product === productFilter
      const gatewayMatches =
        liveCampaigns !== null ||
        gatewayFilter === "Todos os gateways" ||
        campaign.gateway === gatewayFilter
      const queryMatches =
        !normalizedQuery ||
        campaign.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
      return accountMatches && productMatches && gatewayMatches && queryMatches
    })
  }, [accountFilter, gatewayFilter, liveCampaigns, productFilter, query])

  const scale = period / 14
  const totals = useMemo(() => {
    if (liveSummary) {
      const totalCampaignRevenue =
        liveCampaigns?.reduce((sum, campaign) => sum + campaign.revenue, 0) ?? 0
      const matchedRate = liveSummary.sales
        ? Math.round((liveSummary.attributedSales / liveSummary.sales) * 100)
        : 0
      return {
        spend: liveSummary.spend,
        revenue: liveSummary.revenue,
        orders: liveSummary.sales,
        clicks: liveSummary.clicks,
        impressions: liveSummary.impressions,
        matchRate: totalCampaignRevenue ? matchedRate : 0,
        profit: liveSummary.profit,
        roas: liveSummary.roas,
        roi: liveSummary.roi,
      }
    }
    const spend =
      visibleCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0) *
      scale
    const revenue =
      visibleCampaigns.reduce((sum, campaign) => sum + campaign.revenue, 0) *
      scale
    const orders = Math.round(
      visibleCampaigns.reduce((sum, campaign) => sum + campaign.sales, 0) *
        scale
    )
    const clicks = Math.round(
      visibleCampaigns.reduce((sum, campaign) => sum + campaign.clicks, 0) *
        scale
    )
    const impressions = Math.round(
      visibleCampaigns.reduce(
        (sum, campaign) => sum + campaign.impressions,
        0
      ) * scale
    )
    const matchedRevenue = visibleCampaigns.reduce(
      (sum, campaign) => sum + (campaign.revenue * campaign.matchRate) / 100,
      0
    )
    const baseRevenue = visibleCampaigns.reduce(
      (sum, campaign) => sum + campaign.revenue,
      0
    )
    const matchRate = baseRevenue
      ? Math.round((matchedRevenue / baseRevenue) * 100)
      : 0
    return {
      spend,
      revenue,
      orders,
      clicks,
      impressions,
      matchRate,
      profit: revenue - spend,
      roas: spend > 0 ? revenue / spend : null,
      roi: spend > 0 ? (revenue - spend) / spend : null,
    }
  }, [liveCampaigns, liveSummary, scale, visibleCampaigns])

  const filteredSales = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR")
    return (liveSales ?? sales).filter((sale) => {
      const gatewayMatches =
        gatewayFilter === "Todos os gateways" || sale.gateway === gatewayFilter
      const productMatches =
        productFilter === "Todos os produtos" || sale.product === productFilter
      const queryMatches =
        !normalizedQuery ||
        `${sale.id} ${sale.product} ${sale.campaign}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedQuery)
      return gatewayMatches && productMatches && queryMatches
    })
  }, [gatewayFilter, liveSales, productFilter, query])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session")
        if (!response.ok) throw new Error("Session check failed")

        const result = (await response.json()) as {
          configured?: boolean
          setupRequired?: boolean
          authenticated?: boolean
        }
        if (
          typeof result.configured !== "boolean" ||
          typeof result.setupRequired !== "boolean" ||
          typeof result.authenticated !== "boolean"
        ) {
          throw new Error("Invalid session response")
        }

        if (cancelled) return
        setAuthState(
          result.setupRequired
            ? "setup"
            : result.configured
              ? result.authenticated
                ? "authenticated"
                : "required"
              : "demo"
        )
      } catch {
        if (!cancelled) setAuthState(import.meta.env.DEV ? "demo" : "error")
      }
    }

    void checkSession()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (authState !== "authenticated") return

    const controller = new AbortController()
    const from = dateForDaysAgo(period)
    const to = dateForDaysAgo(1)
    const dashboardParams = new URLSearchParams({
      from,
      to,
      level:
        level === "Campanhas"
          ? "campaign"
          : level === "Conjuntos"
            ? "adset"
            : "ad",
    })
    if (accountFilter !== "all")
      dashboardParams.set("accountIds", accountFilter)
    if (gatewayFilter !== "Todos os gateways")
      dashboardParams.set("gateway", gatewayFilter.toLowerCase())
    if (productFilter !== "Todos os produtos")
      dashboardParams.set("product", productFilter)
    const salesParams = new URLSearchParams({ from, to, limit: "100" })
    if (accountFilter !== "all") salesParams.set("accountIds", accountFilter)
    if (gatewayFilter !== "Todos os gateways")
      salesParams.set("gateway", gatewayFilter.toLowerCase())
    if (productFilter !== "Todos os produtos")
      salesParams.set("product", productFilter)

    async function loadLiveData() {
      try {
        const [
          dashboardResponse,
          accountResponse,
          productsResponse,
          salesResponse,
          integrationsResponse,
        ] = await Promise.all([
          fetch(`/api/dashboard?${dashboardParams}`, {
            signal: controller.signal,
          }),
          fetch("/api/meta/accounts", { signal: controller.signal }),
          fetch("/api/products", { signal: controller.signal }),
          fetch(`/api/sales?${salesParams}`, { signal: controller.signal }),
          fetch("/api/integrations", { signal: controller.signal }),
        ])
        if (controller.signal.aborted) return
        if (dashboardResponse.ok) {
          const result = (await dashboardResponse.json()) as {
            source: string
            rows: Array<{
              id: string
              name: string
              accountId: string
              accountName: string
              spend: number
              revenue: number
              sales: number
              clicks: number
              impressions: number
              fxMissing: boolean
            }>
            summary: {
              spend: number
              revenue: number
              profit: number
              roas: number | null
              roi: number | null
              sales: number
              clicks: number
              impressions: number
              attributedSales: number
              unmatchedSales: number
            }
            daily?: Array<{ date: string; spend: number; revenue: number }>
          }
          if (result.source === "live") {
            setLiveCampaigns(
              result.rows.map((row) => ({
                id: row.id,
                name: row.name || row.id,
                accountId: row.accountId,
                accountName: row.accountName,
                status: "—",
                spend: Number(row.spend),
                revenue: Number(row.revenue),
                sales: Number(row.sales),
                clicks: Number(row.clicks),
                impressions: Number(row.impressions),
                product:
                  productFilter === "Todos os produtos"
                    ? "Vendas atribuídas"
                    : productFilter,
                gateway:
                  gatewayFilter === "Todos os gateways"
                    ? "Hotmart"
                    : gatewayFilter,
                matchRate: result.summary.sales
                  ? Math.round(
                      (result.summary.attributedSales / result.summary.sales) *
                        100
                    )
                  : 0,
                change: 0,
                fxMissing: row.fxMissing,
              }))
            )
            setLiveSummary(result.summary)
            setLiveDaily(
              result.daily?.map((item) => ({
                label: item.date.slice(8, 10),
                spend: item.spend,
                revenue: item.revenue,
              })) ?? []
            )
          }
        }
        if (accountResponse.ok) {
          const result = (await accountResponse.json()) as {
            accounts?: Array<{
              id: string
              name: string
              timezone_name: string
            }>
          }
          const colors = accountColors
          setAdAccountList(
            (result.accounts ?? []).map((account, index) => ({
              id: account.id,
              name: account.name,
              initials: account.name
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase(),
              color: colors[index % colors.length],
              timezone: account.timezone_name,
            }))
          )
        }
        if (productsResponse.ok) {
          const result = (await productsResponse.json()) as {
            products?: string[]
          }
          setProductOptions(result.products ?? [])
        }
        if (salesResponse.ok) {
          const result = (await salesResponse.json()) as {
            sales?: Array<Record<string, unknown>>
          }
          const liveRows = (result.sales ?? []).map((row): Sale => {
            const currencyCode =
              typeof row.currency === "string" ? row.currency : "BRL"
            const nativeAmount =
              Number(row.amount_minor ?? 0) /
              10 ** currencyMinorUnit(currencyCode)
            const convertedAmount =
              typeof row.amount_brl === "number" ? row.amount_brl : null
            const status =
              row.status === "approved"
                ? "Aprovada"
                : row.status === "refunded"
                  ? "Reembolsada"
                  : row.status === "chargeback"
                    ? "Chargeback"
                    : "Aguardando"
            const date =
              typeof row.occurred_at === "string"
                ? new Date(row.occurred_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"
            return {
              id: String(row.external_id ?? ""),
              date,
              product: String(row.product_name ?? "Produto não identificado"),
              buyer: "—",
              gateway: row.provider === "kiwify" ? "Kiwify" : "Hotmart",
              amount: convertedAmount ?? 0,
              amountLabel:
                new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: convertedAmount === null ? currencyCode : "BRL",
                }).format(convertedAmount ?? nativeAmount) +
                (convertedAmount === null ? " · aguardando PTAX" : ""),
              status,
              campaign: String(
                row.campaign_name ?? row.campaign_id ?? "Sem atribuição"
              ),
              matched: Boolean(row.campaign_id || row.adset_id || row.ad_id),
            }
          })
          setLiveSales(liveRows)
        }
        if (integrationsResponse.ok) {
          const result = (await integrationsResponse.json()) as {
            integrations?: Array<{
              provider: string
              has_token?: number
              has_credentials?: number
            }>
          }
          const status = { meta: false, hotmart: false, kiwify: false }
          for (const integration of result.integrations ?? []) {
            if (integration.provider === "meta")
              status.meta = integration.has_token === 1
            if (integration.provider === "hotmart")
              status.hotmart = integration.has_credentials === 1
            if (integration.provider === "kiwify")
              status.kiwify = integration.has_credentials === 1
          }
          setIntegrationStatus(status)
        }
      } catch (error) {
        if (!controller.signal.aborted)
          console.error("dashboard_load_failed", error)
      }
    }

    void loadLiveData()
    return () => controller.abort()
  }, [
    accountFilter,
    authState,
    dataRefresh,
    gatewayFilter,
    level,
    period,
    productFilter,
  ])

  useEffect(() => {
    if (!activeSyncId) return
    let cancelled = false
    let timer = 0
    async function pollSync() {
      try {
        const response = await fetch(`/api/sync/${activeSyncId}`)
        if (!response.ok)
          throw new Error(
            "Não foi possível consultar o andamento da sincronização."
          )
        const result = (await response.json()) as {
          status: string
          completed_count?: number
          requested_count?: number
        }
        if (cancelled) return
        if (["completed", "partial", "failed"].includes(result.status)) {
          setActiveSyncId("")
          setSyncing(false)
          setReconciling(false)
          setDataRefresh((value) => value + 1)
          setToast(
            result.status === "completed"
              ? "Sincronização concluída. Os dados foram atualizados."
              : result.status === "partial"
                ? "Atualização parcial. Verifique as contas com erro."
                : "A sincronização falhou. Revise a integração e tente novamente."
          )
          return
        }
        timer = window.setTimeout(pollSync, 1500)
      } catch (error) {
        if (cancelled) return
        setActiveSyncId("")
        setSyncing(false)
        setReconciling(false)
        setToast(
          error instanceof Error
            ? error.message
            : "Não foi possível consultar a sincronização."
        )
      }
    }
    timer = window.setTimeout(pollSync, 1200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activeSyncId])

  useEffect(() => {
    const navigateToIntegrations = () => setPage("integrations")
    const refreshDashboard = () => setDataRefresh((value) => value + 1)
    window.addEventListener("navigate-integrations", navigateToIntegrations)
    window.addEventListener("dashboard-refresh", refreshDashboard)
    return () => {
      window.removeEventListener(
        "navigate-integrations",
        navigateToIntegrations
      )
      window.removeEventListener("dashboard-refresh", refreshDashboard)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (
      params.has("integration") ||
      params.has("integration_error") ||
      params.has("access")
    ) {
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  async function requestSync() {
    if (!adAccountList.length) {
      setToast("Conecte primeiro uma conta Meta em Integrações.")
      return
    }
    setSyncing(true)
    let queued = false
    try {
      const response = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: dateForDaysAgo(period),
          to: dateForDaysAgo(1),
          accountIds:
            accountFilter === "all"
              ? adAccountList.map((account) => account.id)
              : [accountFilter],
        }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
        syncId?: string
      }
      if (!response.ok)
        throw new Error(
          result.error || "Conecte uma conta Meta para sincronizar."
        )
      if (result.syncId) {
        queued = true
        setActiveSyncId(result.syncId)
        setToast(
          "Atualização iniciada. As campanhas serão carregadas quando a fila terminar."
        )
      }
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar a atualização."
      )
    } finally {
      if (!queued) setSyncing(false)
    }
  }

  async function requestReconciliation() {
    setReconciling(true)
    let queued = false
    try {
      const response = await fetch("/api/gateways/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: dateForDaysAgo(period),
          to: dateForDaysAgo(1),
        }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
        syncId?: string
      }
      if (!response.ok)
        throw new Error(
          result.error || "Configure um gateway para reconciliar vendas."
        )
      if (result.syncId) {
        queued = true
        setActiveSyncId(result.syncId)
        setToast(
          "Reconciliação iniciada. As vendas serão atualizadas ao concluir."
        )
      }
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar a reconciliação."
      )
    } finally {
      if (!queued) setReconciling(false)
    }
  }

  function exportCsv() {
    const rows =
      page === "sales"
        ? filteredSales.map((sale) => [
            sale.id,
            sale.date,
            sale.product,
            sale.gateway,
            sale.amountLabel ?? sale.amount,
            sale.status,
            sale.campaign,
          ])
        : visibleCampaigns.map((campaign) => [
            campaign.id,
            campaign.name,
            campaign.product,
            campaign.gateway,
            campaign.spend,
            campaign.revenue,
            campaign.sales,
          ])
    const headers =
      page === "sales"
        ? [
            "transacao",
            "data",
            "produto",
            "gateway",
            "valor_brl",
            "status",
            "campanha",
          ]
        : [
            "id",
            "campanha",
            "produto",
            "gateway",
            "investimento_brl",
            "receita_brl",
            "vendas",
          ]
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n")
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `${page === "sales" ? "vendas" : "campanhas"}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function navigate(nextPage: Page) {
    setPage(nextPage)
    setMobileNavOpen(false)
    setQuery("")
  }

  if (authState === "checking")
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="brand-mark">
            <Activity size={18} />
          </span>
          <span>Carregando seu workspace…</span>
        </div>
      </div>
    )
  if (authState === "required")
    return (
      <LoginPage
        onLoggedIn={() => {
          setAdAccountList([])
          setAuthState("authenticated")
        }}
      />
    )
  if (authState === "setup")
    return (
      <SetupPage
        onAccountCreated={() => {
          setAdAccountList([])
          setAuthState("authenticated")
        }}
      />
    )
  if (authState === "error")
    return (
      <main className="auth-screen">
        <section className="login-card" role="alert">
          <div className="login-brand">
            <span className="brand-mark">
              <Activity size={18} strokeWidth={2.6} />
            </span>
            <span>
              pulso<span className="brand-period">.</span>
            </span>
          </div>
          <div className="panel-kicker">CONFIGURAÇÃO DO WORKSPACE</div>
          <h1>Não foi possível verificar seu acesso.</h1>
          <p>
            O servidor não conseguiu consultar a configuração do workspace. Se
            esta é a primeira publicação, aplique as migrations do D1 com{" "}
            <code>npm run db:remote</code> e atualize a página.
          </p>
          <button
            className="button button-primary"
            onClick={() => window.location.reload()}
            type="button"
          >
            Tentar novamente
            <RefreshCw size={15} />
          </button>
        </section>
      </main>
    )

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <Activity size={18} strokeWidth={2.6} />
          </div>
          <span>
            pulso<span className="brand-period">.</span>
          </span>
          <button
            className="icon-button sidebar-close"
            aria-label="Fechar menu"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">L</div>
          <div className="workspace-copy">
            <strong>Meu workspace</strong>
            <span>Plano pessoal</span>
          </div>
          <ChevronDown size={15} />
        </div>

        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav" aria-label="Navegação principal">
          <button
            className={`nav-item ${page === "overview" ? "active" : ""}`}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={18} />
            <span>Visão geral</span>
            <span className="nav-shortcut">⌘ 1</span>
          </button>
          <button
            className={`nav-item ${page === "sales" ? "active" : ""}`}
            onClick={() => navigate("sales")}
          >
            <ShoppingBag size={18} />
            <span>Vendas</span>
            <span className="nav-count">184</span>
          </button>
          <button
            className={`nav-item ${page === "integrations" ? "active" : ""}`}
            onClick={() => navigate("integrations")}
          >
            <Link2 size={18} />
            <span>Integrações</span>
            <span className="nav-dot" />
          </button>
        </nav>

        <div className="nav-caption accounts-caption">
          CONTAS DE ANÚNCIO{" "}
          <button
            aria-label="Adicionar conta"
            onClick={() => navigate("integrations")}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="account-list">
          {adAccountList.map((account) => (
            <button
              className="account-nav-item"
              key={account.id}
              onClick={() => {
                setAccountFilter(account.id)
                navigate("overview")
              }}
            >
              <span
                className="account-avatar"
                style={{ backgroundColor: account.color }}
              >
                {account.initials}
              </span>
              <span>{account.name}</span>
              <span className="account-status" />
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={17} />
            </div>
            <div>
              <strong>Precisa de ajuda?</strong>
              <span>Veja como configurar</span>
            </div>
            <ArrowRight size={15} />
          </div>
          <button className="profile-button">
            <div className="profile-avatar">LM</div>
            <span className="profile-copy">
              <strong>Leo Martins</strong>
              <small>Administrador</small>
            </span>
            <MoreHorizontal size={19} />
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu size={19} />
            </button>
            <div className="breadcrumb">
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>{pageTitle(page)}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="live-status">
              <span />{" "}
              {authState === "demo"
                ? "Ambiente de demonstração"
                : "Dados conectados"}
            </div>
            <button
              className="icon-button notification-button"
              aria-label="Notificações"
            >
              <Bell size={18} />
              <i />
            </button>
            <div className="topbar-divider" />
            <button className="topbar-help">
              <CircleHelp size={17} /> Ajuda
            </button>
            <div className="topbar-avatar">LM</div>
          </div>
        </header>

        <main className="page-content">
          {page === "overview" && (
            <OverviewPage
              period={period}
              setPeriod={setPeriod}
              accountFilter={accountFilter}
              setAccountFilter={setAccountFilter}
              productFilter={productFilter}
              setProductFilter={setProductFilter}
              gatewayFilter={gatewayFilter}
              setGatewayFilter={setGatewayFilter}
              level={level}
              setLevel={setLevel}
              query={query}
              setQuery={setQuery}
              chartMode={chartMode}
              setChartMode={setChartMode}
              totals={totals}
              rows={visibleCampaigns}
              accountOptions={adAccountList}
              integrationStatus={integrationStatus}
              productOptions={productOptions}
              dailyData={liveDaily ?? undefined}
              demo={authState === "demo"}
              live={liveCampaigns !== null}
              onSync={requestSync}
              onExport={exportCsv}
              syncing={syncing}
            />
          )}
          {page === "sales" && (
            <SalesPage
              period={period}
              setPeriod={setPeriod}
              gatewayFilter={gatewayFilter}
              setGatewayFilter={setGatewayFilter}
              productFilter={productFilter}
              setProductFilter={setProductFilter}
              query={query}
              setQuery={setQuery}
              rows={filteredSales}
              accountFilter={accountFilter}
              setAccountFilter={setAccountFilter}
              accountOptions={adAccountList}
              productOptions={productOptions}
              demo={authState === "demo"}
              onReconcile={requestReconciliation}
              onExport={exportCsv}
              reconciling={reconciling}
            />
          )}
          {page === "integrations" && (
            <IntegrationsPage
              onSync={requestSync}
              syncing={syncing}
              onToast={setToast}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            pulso<span className="brand-period">.</span>{" "}
            <span className="footer-muted">seus números, no ritmo certo.</span>
          </span>
          <span>
            {authState === "demo"
              ? "Dados fictícios para demonstração"
              : "Dados privados do workspace"}
          </span>
        </footer>
      </div>

      {toast && (
        <div className="toast-message" role="status">
          <span>
            <Check size={16} />
          </span>
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

type FiltersProps = {
  period: Period
  setPeriod: (period: Period) => void
  accountFilter?: string
  setAccountFilter?: (account: string) => void
  productFilter: string
  productOptions: string[]
  setProductFilter: (product: string) => void
  gatewayFilter: Gateway
  setGatewayFilter: (gateway: Gateway) => void
  query: string
  setQuery: (query: string) => void
  onExport: () => void
}

type OverviewPageProps = FiltersProps & {
  level: Level
  setLevel: (level: Level) => void
  chartMode: "Receita" | "Investimento"
  setChartMode: (mode: "Receita" | "Investimento") => void
  totals: {
    spend: number
    revenue: number
    orders: number
    clicks: number
    impressions: number
    matchRate: number
    profit: number
    roas: number | null
    roi: number | null
  }
  rows: Campaign[]
  accountOptions: AdAccount[]
  integrationStatus: { meta: boolean; hotmart: boolean; kiwify: boolean }
  dailyData?: Array<{ label: string; spend: number; revenue: number }>
  demo: boolean
  live: boolean
  onSync: () => void
  syncing: boolean
}

function OverviewPage(props: OverviewPageProps) {
  const accountName = props.accountOptions.find(
    (account) => account.id === props.accountFilter
  )?.name
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> PERFORMANCE{" "}
            <span className="eyebrow-period">
              · ÚLTIMOS {props.period} DIAS
            </span>
          </div>
          <h1>
            Visão geral<span className="heading-period">.</span>
          </h1>
          <p>Acompanhe o que está funcionando nas suas campanhas.</p>
        </div>
        <div className="heading-actions">
          <button
            className="button button-secondary export-button"
            onClick={props.onExport}
          >
            <Download size={16} /> Exportar
          </button>
          <button
            className="button button-primary"
            onClick={props.onSync}
            disabled={props.syncing}
          >
            <RefreshCw size={16} className={props.syncing ? "spin" : ""} />
            {props.syncing ? "Atualizando…" : "Atualizar anúncios"}
          </button>
        </div>
      </div>

      {props.demo && (
        <div className="demo-notice">
          <span className="notice-spark">
            <Sparkles size={15} />
          </span>
          <span>
            <strong>Você está vendo dados de demonstração.</strong> Conecte suas
            contas nas integrações para começar a acompanhar números reais.
          </span>
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("navigate-integrations"))
            }
          >
            Configurar agora <ArrowRight size={14} />
          </button>
        </div>
      )}

      <div className="filter-bar">
        <div className="period-switch" role="group" aria-label="Período">
          {([7, 14, 30] as Period[]).map((days) => (
            <button
              key={days}
              className={props.period === days ? "selected" : ""}
              onClick={() => props.setPeriod(days)}
            >
              {days} dias
            </button>
          ))}
          <button className="date-range-button" aria-label="Selecionar período">
            <CalendarDays size={15} />
            <ChevronDown size={13} />
          </button>
        </div>
        <div className="filter-divider" />
        <div className="select-filter">
          <span>Conta</span>
          <select
            aria-label="Filtrar por conta"
            value={props.accountFilter}
            onChange={(event) => props.setAccountFilter?.(event.target.value)}
          >
            <option value="all">Todas as contas</option>
            {props.accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
        <div className="filter-divider filter-divider-small" />
        <div className="select-filter product-filter">
          <span>Produto</span>
          <select
            aria-label="Filtrar por produto"
            value={props.productFilter}
            onChange={(event) => props.setProductFilter(event.target.value)}
          >
            <option>Todos os produtos</option>
            {props.productOptions.map((product) => (
              <option key={product}>{product}</option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
        <div className="filter-divider filter-divider-small" />
        <div className="select-filter gateway-filter">
          <span>Gateway</span>
          <select
            aria-label="Filtrar por gateway"
            value={props.gatewayFilter}
            onChange={(event) =>
              props.setGatewayFilter(event.target.value as Gateway)
            }
          >
            <option>Todos os gateways</option>
            <option>Hotmart</option>
            <option>Kiwify</option>
          </select>
          <ChevronDown size={13} />
        </div>
        <button className="filter-more" aria-label="Mais filtros">
          <Filter size={16} />
          <span>Filtros</span>
          <span className="filter-count">3</span>
        </button>
      </div>

      <section className="metrics-grid" aria-label="Indicadores principais">
        <MetricCard
          label="Investimento"
          value={currency.format(props.totals.spend)}
          detail="Meta Ads"
          trend={props.demo ? "8,2%" : undefined}
          positive={false}
          icon={<Wallet size={16} />}
          iconStyle="sage"
          progress={71}
        />
        <MetricCard
          label="Receita líquida"
          value={currency.format(props.totals.revenue)}
          detail="Após reembolsos"
          trend={props.demo ? "18,6%" : undefined}
          positive
          icon={<CircleDollarIcon />}
          iconStyle="lime"
          progress={82}
        />
        <MetricCard
          label="ROAS"
          value={
            props.totals.roas === null
              ? "—"
              : `${props.totals.roas.toFixed(2).replace(".", ",")}x`
          }
          detail="Receita atribuída ÷ investimento"
          trend={props.demo ? "0,42x" : undefined}
          positive
          icon={<BarChart3 size={16} />}
          iconStyle="lavender"
          progress={76}
        />
        <MetricCard
          label="ROI"
          value={
            props.totals.roi === null
              ? "—"
              : `${(props.totals.roi * 100).toFixed(1).replace(".", ",")}%`
          }
          detail="(Receita − investimento) ÷ investimento"
          trend={props.demo ? "21,4%" : undefined}
          positive
          icon={<ArrowUpRight size={17} />}
          iconStyle="coral"
          progress={68}
        />
      </section>

      <div className="secondary-metrics">
        <span>
          <span className="secondary-indicator indicator-green" />
          {numberFormat.format(props.totals.orders)} <b>vendas aprovadas</b>
        </span>
        <span>
          <span className="secondary-indicator indicator-blue" />
          {numberFormat.format(props.totals.clicks)} <b>cliques</b>
        </span>
        <span>
          <span className="secondary-indicator indicator-yellow" />
          {numberFormat.format(props.totals.impressions)} <b>impressões</b>
        </span>
        <span className="metric-account-note">
          {accountName
            ? `Conta: ${accountName}`
            : props.demo
              ? "3 contas de exemplo"
              : `${props.accountOptions.length} contas conectadas`}
        </span>
      </div>

      <div className="analytics-grid">
        <section className="panel performance-panel">
          <div className="panel-header chart-header">
            <div>
              <div className="panel-kicker">RESULTADO AO LONGO DO TEMPO</div>
              <h2>Ritmo de performance</h2>
            </div>
            <div className="chart-actions">
              <div className="chart-switch">
                <button
                  className={props.chartMode === "Receita" ? "active" : ""}
                  onClick={() => props.setChartMode("Receita")}
                >
                  Receita
                </button>
                <button
                  className={props.chartMode === "Investimento" ? "active" : ""}
                  onClick={() => props.setChartMode("Investimento")}
                >
                  Investimento
                </button>
              </div>
              <button
                className="icon-button subtle-icon"
                aria-label="Opções do gráfico"
              >
                <MoreHorizontal size={19} />
              </button>
            </div>
          </div>
          <div className="chart-legend">
            <span
              className={`legend-dot ${props.chartMode === "Receita" ? "legend-lime" : "legend-pine"}`}
            />
            {props.chartMode}{" "}
            <span className="chart-total">
              {compactCurrency.format(
                props.chartMode === "Receita"
                  ? props.totals.revenue
                  : props.totals.spend
              )}
            </span>
            <span className="chart-legend-note">no período selecionado</span>
          </div>
          <PerformanceChart
            mode={props.chartMode}
            days={props.period}
            data={props.dailyData}
          />
          <div className="chart-footer">
            <span>{chartBoundary(props.period, "start")}</span>
            <span>{chartBoundary(props.period, "middle")}</span>
            <span>{chartBoundary(props.period, "end")}</span>
            <span className="chart-timezone">
              Fuso:{" "}
              {accountName
                ? props.accountOptions.find((item) => item.name === accountName)
                    ?.timezone
                : "Horário da conta"}
            </span>
          </div>
        </section>

        <section className="panel attribution-panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">QUALIDADE DOS DADOS</div>
              <h2>Atribuição de vendas</h2>
            </div>
            <button
              className="icon-button subtle-icon"
              aria-label="Mais sobre atribuição"
            >
              <MoreHorizontal size={19} />
            </button>
          </div>
          <div className="match-summary">
            <div
              className="match-gauge"
              style={
                {
                  "--match": `${props.totals.matchRate}%`,
                } as React.CSSProperties
              }
            >
              <div className="gauge-inner">
                <strong>{props.totals.matchRate}%</strong>
                <span>atribuídas</span>
              </div>
            </div>
            <div className="match-copy">
              <strong>Boa leitura de origem</strong>
              <span>Pedidos vinculados a uma campanha.</span>
              <div className="match-status">
                <BadgeCheck size={14} /> Acompanhamento saudável
              </div>
            </div>
          </div>
          <div className="attribution-divider" />
          <div className="source-row">
            <span className="source-icon source-meta">
              <Activity size={15} />
            </span>
            <span className="source-name">Meta Ads</span>
            <strong>
              {props.demo
                ? "3 contas"
                : `${props.accountOptions.length} contas`}
            </strong>
            <span className="source-status">
              <i />{" "}
              {props.demo
                ? "Exemplo"
                : props.integrationStatus.meta
                  ? "Conectado"
                  : "Pendente"}
            </span>
          </div>
          <div className="source-row">
            <span className="source-icon source-hotmart">H</span>
            <span className="source-name">Hotmart</span>
            <strong>
              {props.demo
                ? "2 produtos"
                : props.integrationStatus.hotmart
                  ? "Configurado"
                  : "—"}
            </strong>
            <span className="source-status">
              <i />{" "}
              {props.demo
                ? "Exemplo"
                : props.integrationStatus.hotmart
                  ? "Conectado"
                  : "Pendente"}
            </span>
          </div>
          <div className="source-row">
            <span className="source-icon source-kiwify">K</span>
            <span className="source-name">Kiwify</span>
            <strong>
              {props.demo
                ? "2 produtos"
                : props.integrationStatus.kiwify
                  ? "Configurado"
                  : "—"}
            </strong>
            <span className="source-status">
              <i />{" "}
              {props.demo
                ? "Exemplo"
                : props.integrationStatus.kiwify
                  ? "Conectado"
                  : "Pendente"}
            </span>
          </div>
          <button
            className="panel-link"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("navigate-integrations"))
            }
          >
            Ver integrações <ArrowRight size={14} />
          </button>
        </section>
      </div>

      <section className="panel campaigns-panel">
        <div className="panel-header campaign-header">
          <div>
            <div className="panel-kicker">DETALHAMENTO</div>
            <h2>
              Campanhas <span className="table-count">{props.rows.length}</span>
            </h2>
          </div>
          <div className="table-tools">
            <div className="table-search">
              <Search size={15} />
              <input
                aria-label="Buscar campanha"
                placeholder="Buscar campanha..."
                value={props.query}
                onChange={(event) => props.setQuery(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <div className="level-switch">
              {(["Campanhas", "Conjuntos", "Anúncios"] as Level[]).map(
                (tab) => (
                  <button
                    key={tab}
                    className={props.level === tab ? "active" : ""}
                    onClick={() => props.setLevel(tab)}
                  >
                    {tab}
                  </button>
                )
              )}
            </div>
            <button
              className="icon-button subtle-icon settings-filter"
              aria-label="Configurar colunas"
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
        <CampaignTable
          rows={props.rows}
          level={props.level}
          period={props.period}
          accounts={props.accountOptions}
          live={props.live}
        />
        <div className="table-footer">
          <span>
            Exibindo{" "}
            <strong>
              {props.rows.length ? 1 : 0}–{props.rows.length}
            </strong>{" "}
            de <strong>{props.rows.length}</strong> campanhas
          </span>
          <div className="pagination">
            <button disabled aria-label="Página anterior">
              <ArrowLeft size={15} />
            </button>
            <button className="current-page">1</button>
            <button disabled aria-label="Próxima página">
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>
      <div className="disclaimer">
        <Clock3 size={13} /> Os dados são atualizados sob demanda. Vendas são
        contabilizadas pelo valor aprovado, descontados reembolsos e
        chargebacks.
      </div>
    </>
  )
}

function MetricCard({
  label,
  value,
  detail,
  trend,
  positive,
  icon,
  iconStyle,
  progress,
}: {
  label: string
  value: string
  detail: string
  trend?: string
  positive: boolean
  icon: React.ReactNode
  iconStyle: string
  progress: number
}) {
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <span className={`metric-icon ${iconStyle}`}>{icon}</span>
        <button className="metric-menu" aria-label={`Mais opções de ${label}`}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      <div className="metric-label">
        {label}
        <span className="metric-info" title={detail}>
          i
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-card-bottom">
        {trend ? (
          <>
            <span
              className={`trend-pill ${positive ? "trend-positive" : "trend-negative"}`}
            >
              {positive ? (
                <ArrowUpRight size={13} />
              ) : (
                <ArrowDownRight size={13} />
              )}
              {trend}
            </span>
            <span className="metric-comparison">vs. período anterior</span>
          </>
        ) : (
          <span className="metric-comparison">no período selecionado</span>
        )}
      </div>
      <div className="metric-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
    </article>
  )
}

function CircleDollarIcon() {
  return <span className="dollar-icon">R$</span>
}

function PerformanceChart({
  mode,
  days,
  data,
}: {
  mode: "Receita" | "Investimento"
  days: Period
  data?: Array<{ label: string; spend: number; revenue: number }>
}) {
  const points = (data ?? dailyMetrics).slice(
    -Math.min(days, data?.length ?? 14)
  )
  const values = points.map((point) =>
    mode === "Receita" ? point.revenue : point.spend
  )
  const max = Math.max(...values, 1) * 1.15
  const coords = values.map((value, index) => ({
    x: 40 + (index / Math.max(values.length - 1, 1)) * 700,
    y: 18 + (1 - value / max) * 138,
  }))
  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ")
  const area = `${line} L${coords.at(-1)?.x ?? 740},170 L40,170 Z`
  const yLabels =
    mode === "Receita"
      ? ["R$ 8 mil", "R$ 6 mil", "R$ 4 mil", "R$ 2 mil", "R$ 0"]
      : ["R$ 2 mil", "R$ 1,5 mil", "R$ 1 mil", "R$ 500", "R$ 0"]
  return (
    <div className="chart-wrap">
      <div className="chart-y-labels">
        {yLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <svg
        className="performance-chart"
        viewBox="0 0 760 176"
        role="img"
        aria-label={`${mode} diária nos últimos ${days} dias`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={mode === "Receita" ? "#b4d73f" : "#527b67"}
              stopOpacity=".23"
            />
            <stop
              offset="100%"
              stopColor={mode === "Receita" ? "#b4d73f" : "#527b67"}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        {[18, 56, 94, 132, 170].map((y) => (
          <line
            key={y}
            x1="40"
            y1={y}
            x2="755"
            y2={y}
            className="chart-gridline"
          />
        ))}
        <path d={area} fill="url(#chart-fill)" />
        <path
          d={line}
          fill="none"
          className={
            mode === "Receita"
              ? "chart-line chart-line-revenue"
              : "chart-line chart-line-spend"
          }
        />
        {coords.map((point, index) => (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              className={
                mode === "Receita" ? "chart-point-revenue" : "chart-point-spend"
              }
            >
              <title>
                {points[index].label} out: {currency.format(values[index])}
              </title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  )
}

function CampaignTable({
  rows,
  level,
  period,
  accounts: accountOptions,
  live,
}: {
  rows: Campaign[]
  level: Level
  period: Period
  accounts: AdAccount[]
  live: boolean
}) {
  if (!rows.length)
    return (
      <div className="empty-state">
        <Search size={21} />
        <strong>Nenhuma campanha encontrada</strong>
        <span>Tente ajustar os filtros para ampliar os resultados.</span>
      </div>
    )
  const expandedRows =
    live || level === "Campanhas"
      ? rows.map((campaign) => ({
          campaign,
          name: campaign.name,
          id: campaign.id,
          scale: 1,
        }))
      : rows.flatMap((campaign) =>
          (campaign.adsets ?? []).map((name, index) => ({
            campaign,
            name:
              level === "Anúncios" ? `${name} · Criativo ${index + 1}` : name,
            id: `${campaign.id}-${index}`,
            scale: 0.5,
          }))
        )
  return (
    <div className="table-scroll">
      <table className="data-table campaign-table">
        <thead>
          <tr>
            <th className="check-cell">
              <input aria-label="Selecionar todas as linhas" type="checkbox" />
            </th>
            <th className="campaign-name-head">
              {level === "Campanhas"
                ? "Campanha"
                : level === "Conjuntos"
                  ? "Conjunto de anúncios"
                  : "Anúncio"}
            </th>
            <th>Conta de anúncio</th>
            <th>Investimento</th>
            <th>Vendas</th>
            <th>Receita líquida</th>
            <th>ROAS</th>
            <th>CTR</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {expandedRows.map(
            ({ campaign, name, id, scale: rowScale }, index) => {
              const factor = live ? 1 : (period / 14) * rowScale
              const spend = campaign.spend * factor
              const revenue = campaign.revenue * factor
              const account = accountOptions.find(
                (item) => item.id === campaign.accountId
              )
              const initials =
                account?.initials ??
                campaign.accountName
                  ?.split(/\s+/)
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join("")
                  .toUpperCase() ??
                "—"
              const roas = spend > 0 ? revenue / spend : null
              return (
                <tr key={id}>
                  <td className="check-cell">
                    <input aria-label={`Selecionar ${name}`} type="checkbox" />
                  </td>
                  <td>
                    <div className="campaign-cell">
                      <span
                        className={`campaign-platform ${index % 2 ? "platform-meta" : ""}`}
                      >
                        <Activity size={14} />
                      </span>
                      <span className="campaign-copy">
                        <strong title={name}>{name}</strong>
                        <small>
                          <span
                            className={`status-dot ${campaign.status === "Ativa" ? "status-live" : campaign.status === "Pausada" ? "status-paused" : "status-unknown"}`}
                          />
                          {campaign.status}{" "}
                          <span className="cell-separator">·</span> ID{" "}
                          {id.slice(-6)}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="account-cell">
                      <span
                        className="account-avatar table-avatar"
                        style={{
                          backgroundColor: account?.color ?? accountColors[0],
                        }}
                      >
                        {initials}
                      </span>
                      <span>
                        {account?.name ??
                          campaign.accountName ??
                          campaign.accountId}
                      </span>
                    </div>
                  </td>
                  <td className="numeric-cell">{currency.format(spend)}</td>
                  <td className="numeric-cell">
                    {numberFormat.format(Math.round(campaign.sales * factor))}
                  </td>
                  <td className="numeric-cell revenue-cell">
                    {currency.format(revenue)}
                  </td>
                  <td>
                    <span
                      className={`roas-badge ${roas !== null && roas >= 3 ? "roas-good" : "roas-mid"}`}
                    >
                      {roas === null
                        ? "—"
                        : `${roas.toFixed(2).replace(".", ",")}x`}
                    </span>
                  </td>
                  <td className="numeric-cell">
                    {campaign.impressions > 0
                      ? `${((campaign.clicks / campaign.impressions) * 100).toFixed(2).replace(".", ",")}%`
                      : "—"}
                  </td>
                  <td>
                    <button
                      className="icon-button row-menu"
                      aria-label={`Opções para ${name}`}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  </td>
                </tr>
              )
            }
          )}
        </tbody>
      </table>
    </div>
  )
}

type SalesPageProps = FiltersProps & {
  rows: Sale[]
  demo: boolean
  accountFilter: string
  setAccountFilter: (account: string) => void
  accountOptions: AdAccount[]
  onReconcile: () => void
  reconciling: boolean
}

function SalesPage(props: SalesPageProps) {
  const approved = props.rows.filter((sale) => sale.status === "Aprovada")
  const approvedAmount = approved.reduce((sum, sale) => sum + sale.amount, 0)
  const matched = props.rows.filter((sale) => sale.matched).length
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> RECEITA{" "}
            <span className="eyebrow-period">· CONCILIAÇÃO DE PEDIDOS</span>
          </div>
          <h1>
            Vendas<span className="heading-period">.</span>
          </h1>
          <p>Pedidos dos seus gateways, com origem e status em um só lugar.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={props.onExport}>
            <Download size={16} /> Exportar
          </button>
          <button
            className="button button-primary"
            onClick={props.onReconcile}
            disabled={props.reconciling}
          >
            <RefreshCw size={16} className={props.reconciling ? "spin" : ""} />
            {props.reconciling ? "Buscando…" : "Reconciliar vendas"}
          </button>
        </div>
      </div>
      {props.demo && (
        <div className="demo-notice">
          <span className="notice-spark">
            <Sparkles size={15} />
          </span>
          <span>
            <strong>Dados fictícios para demonstração.</strong> As compras reais
            entram pelos webhooks e pela reconciliação dos gateways.
          </span>
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent("navigate-integrations"))
            }
          >
            Configurar gateways <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="sales-summary-grid">
        <div className="sales-summary-card">
          <span>Pedidos no período</span>
          <strong>{props.rows.length}</strong>
          <small>Hotmart e Kiwify</small>
        </div>
        <div className="sales-summary-card">
          <span>Receita aprovada</span>
          <strong>{currency.format(approvedAmount)}</strong>
          <small>
            {props.rows.some((sale) =>
              sale.amountLabel?.includes("aguardando PTAX")
            )
              ? "Conversão cambial pendente"
              : "Descontados estornos"}
          </small>
        </div>
        <div className="sales-summary-card">
          <span>Com atribuição</span>
          <strong>
            {matched} <em>/ {props.rows.length}</em>
          </strong>
          <small>
            {props.rows.length
              ? Math.round((matched / props.rows.length) * 100)
              : 0}
            % vinculados a anúncios
          </small>
        </div>
        <div className="sales-summary-card">
          <span>Ticket médio</span>
          <strong>
            {currency.format(
              approved.length ? approvedAmount / approved.length : 0
            )}
          </strong>
          <small>Pedidos aprovados</small>
        </div>
      </div>
      <section className="panel sales-panel">
        <div className="panel-header sales-table-heading">
          <div>
            <div className="panel-kicker">TRANSAÇÕES</div>
            <h2>
              Pedidos recebidos{" "}
              <span className="table-count">{props.rows.length}</span>
            </h2>
          </div>
          <div className="table-tools sales-tools">
            <div className="table-search">
              <Search size={15} />
              <input
                aria-label="Buscar venda"
                placeholder="Buscar por produto ou ID..."
                value={props.query}
                onChange={(event) => props.setQuery(event.target.value)}
              />
            </div>
            <select
              className="inline-filter"
              aria-label="Filtrar gateway"
              value={props.gatewayFilter}
              onChange={(event) =>
                props.setGatewayFilter(event.target.value as Gateway)
              }
            >
              <option>Todos os gateways</option>
              <option>Hotmart</option>
              <option>Kiwify</option>
            </select>
          </div>
        </div>
        <div className="sales-filter-row">
          <div className="period-switch">
            {([7, 14, 30] as Period[]).map((days) => (
              <button
                key={days}
                className={props.period === days ? "selected" : ""}
                onClick={() => props.setPeriod(days)}
              >
                {days} dias
              </button>
            ))}
          </div>
          <select
            className="inline-filter"
            aria-label="Filtrar conta de anúncio"
            value={props.accountFilter}
            onChange={(event) => props.setAccountFilter(event.target.value)}
          >
            <option value="all">Todas as contas</option>
            {props.accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <select
            className="inline-filter"
            aria-label="Filtrar produto"
            value={props.productFilter}
            onChange={(event) => props.setProductFilter(event.target.value)}
          >
            <option>Todos os produtos</option>
            {props.productOptions.map((product) => (
              <option key={product}>{product}</option>
            ))}
          </select>
          <div className="sales-live-note">
            <span /> Atualizado sob demanda
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table sales-table">
            <thead>
              <tr>
                <th>Transação</th>
                <th>Produto</th>
                <th>Gateway</th>
                <th>Data</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Atribuição</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {props.rows.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    <strong className="transaction-id">{sale.id}</strong>
                  </td>
                  <td>
                    <div className="product-cell">
                      <span className="product-mini-icon">
                        <ShoppingBag size={14} />
                      </span>
                      <strong>{sale.product}</strong>
                    </div>
                  </td>
                  <td>
                    <GatewayBadge gateway={sale.gateway} />
                  </td>
                  <td className="date-cell">{sale.date}</td>
                  <td
                    className={`numeric-cell ${sale.status === "Aprovada" ? "revenue-cell" : ""}`}
                  >
                    {sale.amountLabel ?? currency.format(sale.amount)}
                  </td>
                  <td>
                    <SaleStatus status={sale.status} />
                  </td>
                  <td>
                    <span
                      className={`attribution-pill ${sale.matched ? "matched" : "unmatched"}`}
                    >
                      {sale.matched ? (
                        <>
                          <Link2 size={12} /> {sale.campaign}
                        </>
                      ) : (
                        <>
                          <span /> Sem atribuição
                        </>
                      )}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button row-menu"
                      aria-label={`Detalhes da transação ${sale.id}`}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!props.rows.length && (
          <div className="empty-state">
            <Search size={21} />
            <strong>Nenhuma venda encontrada</strong>
            <span>Experimente outro produto, gateway ou termo de busca.</span>
          </div>
        )}
        <div className="table-footer">
          <span>
            Exibindo <strong>{props.rows.length}</strong>{" "}
            {props.demo ? "transações demonstrativas" : "transações"}
          </span>
          <div className="pagination">
            <button disabled aria-label="Página anterior">
              <ArrowLeft size={15} />
            </button>
            <button className="current-page">1</button>
            <button disabled aria-label="Próxima página">
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>
      <div className="disclaimer">
        <Clock3 size={13} /> Receita considera compras aprovadas menos
        reembolsos e chargebacks.
        {props.demo ? " Os valores do exemplo são fictícios." : ""}
      </div>
    </>
  )
}

function IntegrationsPage({
  onSync,
  syncing,
  onToast,
}: {
  onSync: () => void
  syncing: boolean
  onToast: (message: string) => void
}) {
  const [copyText, setCopyText] = useState("")
  const [credentialsProvider, setCredentialsProvider] = useState<
    "hotmart" | "kiwify" | null
  >(null)
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [kiwifyAccountId, setKiwifyAccountId] = useState("")
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [metaAppId, setMetaAppId] = useState("")
  const [metaAppSecret, setMetaAppSecret] = useState("")
  const [metaApiVersion, setMetaApiVersion] = useState("v24.0")
  const [metaConfigured, setMetaConfigured] = useState(false)
  const [savingMetaSettings, setSavingMetaSettings] = useState(false)
  const [hotmartWebhookToken, setHotmartWebhookToken] = useState("")
  const [kiwifyWebhookToken, setKiwifyWebhookToken] = useState("")
  const [savingWebhookSettings, setSavingWebhookSettings] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [connected, setConnected] = useState({
    meta: false,
    hotmart: false,
    kiwify: false,
  })
  const [webhookUrls, setWebhookUrls] = useState<{
    hotmart: string | null
    kiwify: string | null
  }>({
    hotmart: null,
    kiwify: null,
  })

  useEffect(() => {
    fetch("/api/integrations")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          result: {
            integrations?: Array<{
              provider: string
              has_token?: number
              has_credentials?: number
            }>
          } | null
        ) => {
          if (!result?.integrations) return
          const next = { meta: false, hotmart: false, kiwify: false }
          for (const integration of result.integrations) {
            if (integration.provider === "meta")
              next.meta = integration.has_token === 1
            if (integration.provider === "hotmart")
              next.hotmart = integration.has_credentials === 1
            if (integration.provider === "kiwify")
              next.kiwify = integration.has_credentials === 1
          }
          setConnected(next)
        }
      )
      .catch(() => undefined)
    fetch("/api/settings")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          result: {
            meta?: {
              configured?: boolean
              appId?: string
              apiVersion?: string
            }
            webhooks?: {
              hotmartUrl?: string | null
              kiwifyUrl?: string | null
            }
          } | null
        ) => {
          if (result?.meta) {
            setMetaConfigured(Boolean(result.meta.configured))
            setMetaAppId(result.meta.appId ?? "")
            setMetaApiVersion(result.meta.apiVersion ?? "v24.0")
          }
          if (result?.webhooks)
            setWebhookUrls({
              hotmart: result.webhooks.hotmartUrl ?? null,
              kiwify: result.webhooks.kiwifyUrl ?? null,
            })
        }
      )
      .catch(() => undefined)
  }, [])

  async function saveMetaSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingMetaSettings(true)
    try {
      const response = await fetch("/api/settings/meta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: metaAppId,
          appSecret: metaAppSecret,
          apiVersion: metaApiVersion,
        }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
        configured?: boolean
        appId?: string
        apiVersion?: string
      }
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar o app Meta.")
      setMetaConfigured(Boolean(result.configured))
      setMetaAppId(result.appId ?? metaAppId)
      setMetaApiVersion(result.apiVersion ?? metaApiVersion)
      setMetaAppSecret("")
      onToast("Configuração do aplicativo Meta salva com segurança.")
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o app Meta."
      )
    } finally {
      setSavingMetaSettings(false)
    }
  }

  async function saveWebhookSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload: Record<string, string> = {}
    if (hotmartWebhookToken.trim())
      payload.hotmartToken = hotmartWebhookToken.trim()
    if (kiwifyWebhookToken.trim())
      payload.kiwifyToken = kiwifyWebhookToken.trim()
    if (!Object.keys(payload).length) {
      onToast("Informe pelo menos um token para salvar.")
      return
    }

    setSavingWebhookSettings(true)
    try {
      const response = await fetch("/api/settings/webhooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
        webhooks?: {
          hotmartUrl?: string | null
          kiwifyUrl?: string | null
        }
      }
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar os tokens.")
      setWebhookUrls({
        hotmart: result.webhooks?.hotmartUrl ?? webhookUrls.hotmart,
        kiwify: result.webhooks?.kiwifyUrl ?? webhookUrls.kiwify,
      })
      setHotmartWebhookToken("")
      setKiwifyWebhookToken("")
      onToast("Tokens de webhook salvos com segurança.")
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar os tokens."
      )
    } finally {
      setSavingWebhookSettings(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirmNewPassword) {
      onToast("As novas senhas não coincidem.")
      return
    }
    setSavingPassword(true)
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error || "Não foi possível alterar a senha.")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmNewPassword("")
      onToast("Senha alterada. Sua sessão atual foi mantida.")
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar a senha."
      )
    } finally {
      setSavingPassword(false)
    }
  }

  function generateKiwifyToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    setKiwifyWebhookToken(
      Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    )
  }

  async function removeWebhook(provider: "hotmart" | "kiwify") {
    try {
      const response = await fetch(`/api/settings/webhooks/${provider}`, {
        method: "DELETE",
      })
      if (!response.ok)
        throw new Error("Não foi possível remover o token do webhook.")
      const result = (await response.json()) as {
        webhooks?: { hotmartUrl?: string | null; kiwifyUrl?: string | null }
      }
      setWebhookUrls({
        hotmart: result.webhooks?.hotmartUrl ?? null,
        kiwify: result.webhooks?.kiwifyUrl ?? null,
      })
      onToast(
        `Token ${provider === "hotmart" ? "Hotmart" : "Kiwify"} removido.`
      )
    } catch {
      onToast("Não foi possível remover o token do webhook.")
    }
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!credentialsProvider) return
    setSavingCredentials(true)
    try {
      const response = await fetch(
        `/api/integrations/${credentialsProvider}/credentials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            clientSecret,
            accountId: kiwifyAccountId,
          }),
        }
      )
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error || "Não foi possível conectar o gateway.")
      setConnected((current) => ({ ...current, [credentialsProvider]: true }))
      window.dispatchEvent(new Event("dashboard-refresh"))
      setCredentialsProvider(null)
      setClientId("")
      setClientSecret("")
      setKiwifyAccountId("")
      onToast(
        `${credentialsProvider === "hotmart" ? "Hotmart" : "Kiwify"} conectada com sucesso.`
      )
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Não foi possível conectar o gateway."
      )
    } finally {
      setSavingCredentials(false)
    }
  }

  async function copy(value: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopyText(value)
      window.setTimeout(() => setCopyText(""), 1800)
    } catch {
      onToast("Não foi possível copiar. Selecione e copie a URL manualmente.")
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> CONEXÕES{" "}
            <span className="eyebrow-period">· FONTES DE DADOS</span>
          </div>
          <h1>
            Integrações<span className="heading-period">.</span>
          </h1>
          <p>Conecte as fontes para reunir investimento e receita.</p>
        </div>
        <div className="heading-actions">
          <button
            className="button button-secondary"
            onClick={() =>
              onToast(
                "As conexões são configuradas pelo administrador do workspace."
              )
            }
          >
            <CircleHelp size={16} /> Central de ajuda
          </button>
          <button
            className="button button-primary"
            onClick={onSync}
            disabled={syncing}
          >
            <RefreshCw size={16} className={syncing ? "spin" : ""} /> Atualizar
            anúncios
          </button>
        </div>
      </div>
      <div className="integration-overview">
        <div className="integration-overview-icon">
          <Zap size={19} />
        </div>
        <div>
          <strong>Seu painel está pronto para receber dados</strong>
          <span>
            As integrações podem ser conectadas a várias contas de anúncio e
            produtos.
          </span>
        </div>
        <div className="integration-progress">
          <span>
            {Object.values(connected).filter(Boolean).length} de 3 conectadas
          </span>
          <div>
            <i
              style={{
                width: `${(Object.values(connected).filter(Boolean).length / 3) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
      <section className="panel workspace-config-panel">
        <div className="setup-heading">
          <div className="setup-step">1</div>
          <div>
            <div className="panel-kicker">CONFIGURAÇÃO DO WORKSPACE</div>
            <h2>Credenciais e segurança</h2>
            <p>
              Salve os dados de acesso das plataformas aqui. Os valores
              sensíveis ficam criptografados no Cloudflare.
            </p>
          </div>
        </div>
        <div className="workspace-config-grid">
          <form
            className="workspace-config-card"
            id="meta-settings"
            onSubmit={saveMetaSettings}
          >
            <div className="workspace-config-card-heading">
              <strong>Aplicativo Meta</strong>
              <span className={metaConfigured ? "configured" : "pending"}>
                {metaConfigured ? "Configurado" : "Necessário para OAuth"}
              </span>
            </div>
            <label>
              App ID
              <input
                autoComplete="off"
                required
                value={metaAppId}
                onChange={(event) => setMetaAppId(event.target.value)}
                placeholder="ID do app no Meta for Developers"
              />
            </label>
            <label>
              App Secret
              <input
                autoComplete="new-password"
                type="password"
                required={!metaConfigured}
                value={metaAppSecret}
                onChange={(event) => setMetaAppSecret(event.target.value)}
                placeholder={
                  metaConfigured
                    ? "Salvo; preencha para substituir"
                    : "App Secret"
                }
              />
            </label>
            <label>
              Versão da Graph API
              <input
                autoComplete="off"
                pattern="v[0-9]{1,3}\.[0-9]"
                required
                value={metaApiVersion}
                onChange={(event) => setMetaApiVersion(event.target.value)}
                placeholder="v24.0"
              />
            </label>
            <button
              className="button button-primary"
              disabled={savingMetaSettings}
            >
              {savingMetaSettings ? "Salvando…" : "Salvar aplicativo Meta"}
            </button>
          </form>
          <form
            className="workspace-config-card"
            onSubmit={saveWebhookSettings}
          >
            <div className="workspace-config-card-heading">
              <strong>Tokens dos webhooks</strong>
              <span
                className={
                  webhookUrls.hotmart || webhookUrls.kiwify
                    ? "configured"
                    : "pending"
                }
              >
                {webhookUrls.hotmart || webhookUrls.kiwify
                  ? "Tokens protegidos"
                  : "Adicione ao menos um token"}
              </span>
            </div>
            <label>
              Hotmart · HOTTOK
              <input
                autoComplete="new-password"
                type="password"
                value={hotmartWebhookToken}
                onChange={(event) => setHotmartWebhookToken(event.target.value)}
                placeholder={
                  webhookUrls.hotmart
                    ? "Salvo; preencha para substituir"
                    : "Cole o HOTTOK"
                }
              />
            </label>
            <label>
              Kiwify · token privado
              <input
                autoComplete="new-password"
                type="password"
                value={kiwifyWebhookToken}
                onChange={(event) => setKiwifyWebhookToken(event.target.value)}
                placeholder={
                  webhookUrls.kiwify
                    ? "Salvo; preencha para substituir"
                    : "Crie um token longo e aleatório"
                }
              />
            </label>
            <div className="workspace-config-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={generateKiwifyToken}
              >
                Gerar token seguro para Kiwify
              </button>
            </div>
            <p className="workspace-config-help">
              Campos vazios mantêm os tokens atuais. Ao trocar um token,
              atualize a configuração correspondente no gateway.
            </p>
            {(webhookUrls.hotmart || webhookUrls.kiwify) && (
              <div className="workspace-config-actions">
                {webhookUrls.hotmart && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void removeWebhook("hotmart")}
                  >
                    Remover HOTTOK
                  </button>
                )}
                {webhookUrls.kiwify && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void removeWebhook("kiwify")}
                  >
                    Remover token Kiwify
                  </button>
                )}
              </div>
            )}
            <button
              className="button button-primary"
              disabled={savingWebhookSettings}
            >
              {savingWebhookSettings ? "Salvando…" : "Salvar tokens"}
            </button>
          </form>
          <form className="workspace-config-card" onSubmit={changePassword}>
            <div className="workspace-config-card-heading">
              <strong>Conta administrativa</strong>
              <span className="configured">Protegida</span>
            </div>
            <label>
              Senha atual
              <input
                autoComplete="current-password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              Nova senha <span>(mínimo de 12 caracteres)</span>
              <input
                autoComplete="new-password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                autoComplete="new-password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
              />
            </label>
            <button className="button button-primary" disabled={savingPassword}>
              {savingPassword ? "Alterando…" : "Alterar senha"}
            </button>
          </form>
        </div>
      </section>
      <div className="section-title-row">
        <div>
          <h2>Fontes de dados</h2>
          <span>Configure cada plataforma uma única vez.</span>
        </div>
        <span className="secure-label">
          <span /> Conexões protegidas
        </span>
      </div>
      <div className="integration-grid">
        <IntegrationCard
          provider="Meta Ads"
          description="Contas de anúncio, campanhas e métricas de entrega."
          logo="meta"
          badge="Marketing API"
          state={connected.meta ? "Conectado" : "Não conectado"}
          action={connected.meta ? "Reconectar conta" : "Conectar conta"}
          onAction={() => {
            if (metaConfigured) {
              window.location.assign("/auth/meta/start")
              return
            }
            document
              .getElementById("meta-settings")
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
            onToast("Salve o App ID e o App Secret antes de conectar a Meta.")
          }}
        />
        <IntegrationCard
          provider="Hotmart"
          description="Vendas, reembolsos e dados de origem dos pedidos."
          logo="hotmart"
          badge="Webhook + API"
          state={connected.hotmart ? "Conectado" : "Não conectado"}
          action={
            connected.hotmart ? "Atualizar credenciais" : "Conectar gateway"
          }
          onAction={() => setCredentialsProvider("hotmart")}
        />
        <IntegrationCard
          provider="Kiwify"
          description="Pedidos aprovados, estornos e parâmetros UTM."
          logo="kiwify"
          badge="Webhook + API"
          state={connected.kiwify ? "Conectado" : "Não conectado"}
          action={
            connected.kiwify ? "Atualizar credenciais" : "Conectar gateway"
          }
          onAction={() => setCredentialsProvider("kiwify")}
        />
      </div>
      <section className="panel setup-panel" id="webhook-setup">
        <div className="setup-heading">
          <div className="setup-step">1</div>
          <div>
            <div className="panel-kicker">RECEBIMENTO DE VENDAS</div>
            <h2>Configure os webhooks</h2>
            <p>
              Adicione estas URLs nos painéis da Hotmart e da Kiwify para
              receber eventos de pedidos.
            </p>
          </div>
        </div>
        <div className="webhook-url-row">
          <div>
            <span>HOTMART · WEBHOOK DE VENDAS</span>
            <code>
              {webhookUrls.hotmart ?? "Configure o HOTTOK acima para ativar"}
            </code>
          </div>
          <button
            disabled={!webhookUrls.hotmart}
            onClick={() => webhookUrls.hotmart && copy(webhookUrls.hotmart)}
          >
            {copyText === webhookUrls.hotmart ? (
              <Check size={15} />
            ) : (
              <Link2 size={15} />
            )}
            {copyText === webhookUrls.hotmart ? "Copiado" : "Copiar URL"}
          </button>
        </div>
        <div className="webhook-url-row">
          <div>
            <span>KIWIFY · WEBHOOK DE VENDAS</span>
            <code>
              {webhookUrls.kiwify ?? "Configure um token acima para ativar"}
            </code>
          </div>
          <button
            disabled={!webhookUrls.kiwify}
            onClick={() => webhookUrls.kiwify && copy(webhookUrls.kiwify)}
          >
            {copyText === webhookUrls.kiwify ? (
              <Check size={15} />
            ) : (
              <Link2 size={15} />
            )}
            {copyText === webhookUrls.kiwify ? "Copiado" : "Copiar URL"}
          </button>
        </div>
        <div className="setup-footnote">
          <BadgeCheck size={15} /> A Hotmart valida o HOTTOK no cabeçalho do
          evento. A Kiwify valida o token privado incluído na URL.
        </div>
      </section>
      <section className="panel connection-note">
        <div className="note-icon">
          <ShieldIcon />
        </div>
        <div>
          <strong>Seus dados permanecem privados</strong>
          <span>
            Credenciais são criptografadas antes de serem salvas no D1. Dados de
            compradores não são armazenados no dashboard.
          </span>
        </div>
        <button
          onClick={() =>
            onToast(
              "A senha e as credenciais são protegidas no Worker; os tokens não são exibidos novamente após salvar."
            )
          }
        >
          Como funciona <ExternalLink size={13} />
        </button>
      </section>
      {credentialsProvider && (
        <div
          className="modal-scrim"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setCredentialsProvider(null)
          }}
        >
          <form className="credentials-modal" onSubmit={submitCredentials}>
            <div className="modal-heading">
              <div>
                <div className="panel-kicker">CONEXÃO SEGURA</div>
                <h2>
                  Conectar{" "}
                  {credentialsProvider === "hotmart" ? "Hotmart" : "Kiwify"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Fechar"
                onClick={() => setCredentialsProvider(null)}
              >
                <X size={17} />
              </button>
            </div>
            <p>
              As credenciais serão criptografadas no Worker e usadas somente
              para consultar suas vendas.
            </p>
            <label>
              Client ID
              <input
                autoComplete="off"
                required
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
            </label>
            <label>
              Client Secret
              <input
                autoComplete="new-password"
                required
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
              />
            </label>
            {credentialsProvider === "kiwify" && (
              <label>
                ID da conta Kiwify
                <input
                  autoComplete="off"
                  required
                  value={kiwifyAccountId}
                  onChange={(event) => setKiwifyAccountId(event.target.value)}
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setCredentialsProvider(null)}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                disabled={savingCredentials}
              >
                {savingCredentials ? "Validando…" : "Validar e conectar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function IntegrationCard({
  provider,
  description,
  logo,
  badge,
  state,
  action,
  onAction,
}: {
  provider: string
  description: string
  logo: string
  badge: string
  state: string
  action: string
  onAction: () => void
}) {
  return (
    <article className="integration-card">
      <div className="integration-card-top">
        <ProviderLogo name={logo} />
        <span className="integration-badge">{badge}</span>
      </div>
      <h3>{provider}</h3>
      <p>{description}</p>
      <div className="integration-card-state">
        <span /> {state}
      </div>
      <button onClick={onAction}>
        {action}
        <ArrowRight size={15} />
      </button>
    </article>
  )
}

function ProviderLogo({ name }: { name: string }) {
  if (name === "meta")
    return (
      <div className="provider-logo meta-logo">
        <Activity size={24} strokeWidth={2.3} />
      </div>
    )
  if (name === "hotmart")
    return <div className="provider-logo hotmart-logo">H</div>
  return <div className="provider-logo kiwify-logo">K</div>
}

function GatewayBadge({ gateway }: { gateway: Sale["gateway"] }) {
  return (
    <span
      className={`gateway-badge ${gateway === "Hotmart" ? "hotmart-badge" : "kiwify-badge"}`}
    >
      <i>{gateway === "Hotmart" ? "H" : "K"}</i>
      {gateway}
    </span>
  )
}

function SaleStatus({ status }: { status: Sale["status"] }) {
  const className =
    status === "Aprovada"
      ? "approved"
      : status === "Aguardando"
        ? "pending"
        : "reversed"
  return (
    <span className={`sale-status ${className}`}>
      <i />
      {status}
    </span>
  )
}

function ShieldIcon() {
  return (
    <span className="shield-shape">
      <BadgeCheck size={18} />
    </span>
  )
}

function SetupPage({ onAccountCreated }: { onAccountCreated: () => void }) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.")
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error || "Não foi possível criar a conta.")
      setPassword("")
      setConfirmPassword("")
      onAccountCreated()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível criar a conta."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark">
            <Activity size={18} strokeWidth={2.6} />
          </span>
          <span>
            pulso<span className="brand-period">.</span>
          </span>
        </div>
        <div className="panel-kicker">CONFIGURAÇÃO INICIAL</div>
        <h1>Crie sua conta administrativa.</h1>
        <p>
          Escolha uma senha para proteger este workspace. Esta etapa aparece
          somente no primeiro acesso.
        </p>
        <label>
          Senha <span>(mínimo de 12 caracteres)</span>
          <input
            autoFocus
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label>
          Confirmar senha
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <button className="button button-primary" disabled={submitting}>
          {submitting ? "Protegendo workspace…" : "Criar conta e continuar"}
          <ArrowRight size={15} />
        </button>
        <span className="login-security">
          <BadgeCheck size={13} /> A senha é armazenada como hash seguro
        </span>
      </form>
    </main>
  )
}

function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error || "Não foi possível entrar.")
      setPassword("")
      onLoggedIn()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível entrar."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark">
            <Activity size={18} strokeWidth={2.6} />
          </span>
          <span>
            pulso<span className="brand-period">.</span>
          </span>
        </div>
        <div className="panel-kicker">WORKSPACE PRIVADO</div>
        <h1>Bom ter você de volta.</h1>
        <p>Digite sua senha para acessar os dados de campanhas e vendas.</p>
        <label>
          Senha do workspace
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <button className="button button-primary" disabled={submitting}>
          {submitting ? "Verificando…" : "Entrar no workspace"}
          <ArrowRight size={15} />
        </button>
        <span className="login-security">
          <BadgeCheck size={13} /> Acesso protegido por sessão privada
        </span>
      </form>
    </main>
  )
}

const uniqueProducts = [
  ...new Set(campaigns.map((campaign) => campaign.product)),
]

function pageTitle(page: Page) {
  if (page === "sales") return "Vendas"
  if (page === "integrations") return "Integrações"
  return "Visão geral"
}

function dateForDaysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days + 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function readToastFromUrl() {
  if (typeof window === "undefined") return ""
  const params = new URLSearchParams(window.location.search)
  const integrationError = params.get("integration_error")
  if (integrationError) return integrationError
  if (params.get("integration") === "meta") {
    return `Meta conectada • ${params.get("accounts") ?? "0"} contas importadas.`
  }
  return ""
}

function chartBoundary(period: Period, position: "start" | "middle" | "end") {
  const daysAgo =
    position === "start"
      ? period
      : position === "middle"
        ? Math.ceil(period / 2)
        : 1
  const date = new Date()
  date.setDate(date.getDate() - daysAgo + 1)
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(date)
}

function csvCell(value: unknown) {
  const text = String(value ?? "")
  return `"${text.replaceAll('"', '""')}"`
}

export default App
