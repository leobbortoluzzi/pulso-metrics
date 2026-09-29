import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Filter,
  LayoutDashboard,
  Link2,
  LogOut,
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
import { HelpGuide } from "@/components/dashboard/help-guide"
import { DateRangeControl } from "@/components/dashboard/date-range-control"
import {
  dateRangeForDays,
  daysBetween,
  formatRange,
  type DateRange,
} from "@/components/dashboard/date-range-utils"
import { Pagination } from "@/components/dashboard/pagination"
import { Popover } from "@/components/dashboard/popover"
import { SaleDetails } from "@/components/dashboard/sale-details"
import { currencyMinorUnit } from "@/lib/metrics"
import {
  summarizeSales,
  type SaleAttributionFilter,
  type SaleStatusFilter,
  type SalesSummary,
} from "@/lib/sales"
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
type Period = number
type Level = "Campanhas" | "Conjuntos" | "Anúncios"
type Gateway = "Todos os gateways" | "Hotmart" | "Kiwify"
type CampaignPerformanceFilter = "all" | "with-sales" | "without-sales"
type CampaignColumn = "account" | "spend" | "sales" | "revenue" | "roas" | "ctr"

type SyncActivity = {
  id: string
  type: "meta" | "gateways"
  status: "queued" | "running" | "completed" | "partial" | "failed"
  date_from: string
  date_to: string
  requested_count: number
  completed_count: number
  error_message: string | null
  created_at: string
  completed_at: string | null
}

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
const campaignColumnOptions: Array<[CampaignColumn, string]> = [
  ["account", "Conta de anúncio"],
  ["spend", "Investimento"],
  ["sales", "Vendas"],
  ["revenue", "Receita líquida"],
  ["roas", "ROAS"],
  ["ctr", "CTR"],
]
const campaignCsvHeaders = [
  "id",
  "campanha",
  "produto",
  "gateway",
  "investimento_brl",
  "receita_brl",
  "vendas",
]
const salesCsvHeaders = [
  "transacao",
  "data",
  "produto",
  "gateway",
  "valor_brl",
  "status",
  "campanha",
]

function App() {
  const [authState, setAuthState] = useState<
    "checking" | "setup" | "demo" | "authenticated" | "required" | "error"
  >("checking")
  const [page, setPage] = useState<Page>("overview")
  const [period, setPeriod] = useState<Period>(14)
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    dateRangeForDays(14)
  )
  const [accountFilter, setAccountFilter] = useState("all")
  const [productFilter, setProductFilter] = useState("Todos os produtos")
  const [gatewayFilter, setGatewayFilter] =
    useState<Gateway>("Todos os gateways")
  const [level, setLevel] = useState<Level>("Campanhas")
  const [query, setQuery] = useState("")
  const [campaignPerformanceFilter, setCampaignPerformanceFilter] =
    useState<CampaignPerformanceFilter>("all")
  const [saleStatusFilter, setSaleStatusFilter] =
    useState<SaleStatusFilter>("all")
  const [saleAttributionFilter, setSaleAttributionFilter] =
    useState<SaleAttributionFilter>("all")
  const [campaignPage, setCampaignPage] = useState(1)
  const [salesPage, setSalesPage] = useState(1)
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([])
  const [campaignColumns, setCampaignColumns] = useState(readCampaignColumns)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [recentActivity, setRecentActivity] = useState<SyncActivity[]>([])
  const [liveSalesTotal, setLiveSalesTotal] = useState(0)
  const [liveSalesSummary, setLiveSalesSummary] = useState<SalesSummary | null>(
    null
  )
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesError, setSalesError] = useState("")
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState("")
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
  const rangeDays = daysBetween(dateRange)

  function resetResultPages() {
    setCampaignPage(1)
    setSalesPage(1)
    setSelectedCampaignIds([])
  }

  function updateAccountFilter(value: string) {
    setAccountFilter(value)
    resetResultPages()
  }

  function updateProductFilter(value: string) {
    setProductFilter(value)
    resetResultPages()
  }

  function updateGatewayFilter(value: Gateway) {
    setGatewayFilter(value)
    resetResultPages()
  }

  function updateLevel(value: Level) {
    setLevel(value)
    resetResultPages()
  }

  function updateQuery(value: string) {
    setQuery(value)
    resetResultPages()
  }

  function updateCampaignPerformanceFilter(value: CampaignPerformanceFilter) {
    setCampaignPerformanceFilter(value)
    resetResultPages()
  }

  function updateSaleStatusFilter(value: SaleStatusFilter) {
    setSaleStatusFilter(value)
    resetResultPages()
  }

  function updateSaleAttributionFilter(value: SaleAttributionFilter) {
    setSaleAttributionFilter(value)
    resetResultPages()
  }

  const visibleCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR")
    const campaignSource =
      authState === "authenticated" ? (liveCampaigns ?? []) : campaigns
    return campaignSource.filter((campaign) => {
      const accountMatches =
        accountFilter === "all" || campaign.accountId === accountFilter
      const productMatches =
        authState === "authenticated" ||
        productFilter === "Todos os produtos" ||
        campaign.product === productFilter
      const gatewayMatches =
        authState === "authenticated" ||
        gatewayFilter === "Todos os gateways" ||
        campaign.gateway === gatewayFilter
      const queryMatches =
        !normalizedQuery ||
        campaign.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery)
      const performanceMatches =
        campaignPerformanceFilter === "all" ||
        (campaignPerformanceFilter === "with-sales" && campaign.sales > 0) ||
        (campaignPerformanceFilter === "without-sales" && campaign.sales === 0)
      return (
        accountMatches &&
        productMatches &&
        gatewayMatches &&
        queryMatches &&
        performanceMatches
      )
    })
  }, [
    accountFilter,
    authState,
    campaignPerformanceFilter,
    gatewayFilter,
    liveCampaigns,
    productFilter,
    query,
  ])

  const scale = rangeDays / 14
  const totals = useMemo(() => {
    if (authState === "authenticated" && !liveSummary) {
      return {
        spend: 0,
        revenue: 0,
        orders: 0,
        clicks: 0,
        impressions: 0,
        matchRate: 0,
        profit: 0,
        roas: null,
        roi: null,
      }
    }
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
  }, [authState, liveCampaigns, liveSummary, scale, visibleCampaigns])

  const demoFilteredSales = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR")
    return sales.filter((sale) => {
      const gatewayMatches =
        gatewayFilter === "Todos os gateways" || sale.gateway === gatewayFilter
      const productMatches =
        productFilter === "Todos os produtos" || sale.product === productFilter
      const accountMatches =
        accountFilter === "all" || sale.accountId === accountFilter
      const queryMatches =
        !normalizedQuery ||
        `${sale.id} ${sale.product} ${sale.campaign}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedQuery)
      const statusMatches =
        saleStatusFilter === "all" ||
        (saleStatusFilter === "approved" && sale.status === "Aprovada") ||
        (saleStatusFilter === "refunded" && sale.status === "Reembolsada") ||
        (saleStatusFilter === "chargeback" && sale.status === "Chargeback") ||
        (saleStatusFilter === "pending" && sale.status === "Aguardando")
      const attributionMatches =
        saleAttributionFilter === "all" ||
        (saleAttributionFilter === "matched" && sale.matched) ||
        (saleAttributionFilter === "unmatched" && !sale.matched)
      return (
        gatewayMatches &&
        productMatches &&
        accountMatches &&
        queryMatches &&
        statusMatches &&
        attributionMatches
      )
    })
  }, [
    accountFilter,
    gatewayFilter,
    productFilter,
    query,
    saleAttributionFilter,
    saleStatusFilter,
  ])

  const displayedSales =
    authState === "authenticated"
      ? (liveSales ?? [])
      : demoFilteredSales.slice((salesPage - 1) * 25, salesPage * 25)
  const salesTotal =
    authState === "authenticated" ? liveSalesTotal : demoFilteredSales.length
  const demoSalesSummary = useMemo(
    () => summarizeSales(demoFilteredSales),
    [demoFilteredSales]
  )
  const salesSummary =
    authState === "authenticated" ? liveSalesSummary : demoSalesSummary

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(""), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    window.localStorage.setItem(
      "pulso:campaign-columns",
      JSON.stringify(campaignColumns)
    )
  }, [campaignColumns])

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
    const from = dateRange.from
    const to = dateRange.to
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
    async function loadLiveData() {
      setDashboardLoading(true)
      setDashboardError("")
      try {
        const [
          dashboardResponse,
          accountResponse,
          productsResponse,
          integrationsResponse,
        ] = await Promise.all([
          fetch(`/api/dashboard?${dashboardParams}`, {
            signal: controller.signal,
          }),
          fetch("/api/meta/accounts", { signal: controller.signal }),
          fetch("/api/products", { signal: controller.signal }),
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
          } else {
            setLiveCampaigns([])
            setLiveSummary(null)
          }
        } else {
          const result = (await dashboardResponse.json().catch(() => ({}))) as {
            error?: string
          }
          setDashboardError(
            result.error || "Não foi possível carregar os dados do dashboard."
          )
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
        if (!controller.signal.aborted) {
          setDashboardError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o dashboard."
          )
          console.error("dashboard_load_failed", error)
        }
      } finally {
        if (!controller.signal.aborted) setDashboardLoading(false)
      }
    }

    void loadLiveData()
    return () => controller.abort()
  }, [
    accountFilter,
    authState,
    dataRefresh,
    dateRange.from,
    dateRange.to,
    gatewayFilter,
    level,
    productFilter,
  ])

  useEffect(() => {
    if (authState !== "authenticated") return
    const controller = new AbortController()
    const params = new URLSearchParams({
      from: dateRange.from,
      to: dateRange.to,
      limit: "25",
      offset: String((salesPage - 1) * 25),
    })
    if (accountFilter !== "all") params.set("accountIds", accountFilter)
    if (gatewayFilter !== "Todos os gateways")
      params.set("gateway", gatewayFilter.toLowerCase())
    if (productFilter !== "Todos os produtos")
      params.set("product", productFilter)
    if (query.trim()) params.set("q", query.trim())
    if (saleStatusFilter !== "all") params.set("status", saleStatusFilter)
    if (saleAttributionFilter !== "all")
      params.set("attribution", saleAttributionFilter)

    async function loadSales() {
      setSalesLoading(true)
      setSalesError("")
      try {
        const response = await fetch(`/api/sales?${params}`, {
          signal: controller.signal,
        })
        const result = (await response.json().catch(() => ({}))) as {
          error?: string
          sales?: Array<Record<string, unknown>>
          total?: number
          summary?: SalesSummary
        }
        if (!response.ok)
          throw new Error(
            result.error || "Não foi possível carregar as vendas."
          )
        if (controller.signal.aborted) return
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
        setLiveSalesTotal(result.total ?? 0)
        setLiveSalesSummary(result.summary ?? null)
        const lastPage = Math.max(1, Math.ceil((result.total ?? 0) / 25))
        if (salesPage > lastPage) setSalesPage(lastPage)
      } catch (error) {
        if (!controller.signal.aborted) {
          setSalesError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar as vendas."
          )
          setLiveSales([])
        }
      } finally {
        if (!controller.signal.aborted) setSalesLoading(false)
      }
    }

    void loadSales()
    return () => controller.abort()
  }, [
    accountFilter,
    authState,
    dataRefresh,
    dateRange.from,
    dateRange.to,
    gatewayFilter,
    productFilter,
    query,
    saleAttributionFilter,
    saleStatusFilter,
    salesPage,
  ])

  useEffect(() => {
    if (authState !== "authenticated") return
    const controller = new AbortController()
    let timer = 0
    async function loadRecentActivity() {
      try {
        const response = await fetch("/api/sync/recent?limit=5", {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Could not load recent sync activity")
        const result = (await response.json()) as { runs?: SyncActivity[] }
        if (!controller.signal.aborted) setRecentActivity(result.runs ?? [])
      } catch (error) {
        if (!controller.signal.aborted)
          console.error("recent_activity_load_failed", error)
      }
      if (!controller.signal.aborted && activeSyncId)
        timer = window.setTimeout(loadRecentActivity, 4000)
    }
    void loadRecentActivity()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [activeSyncId, authState, dataRefresh])

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
          from: dateRange.from,
          to: dateRange.to,
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
          from: dateRange.from,
          to: dateRange.to,
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

  function updatePeriod(days: number) {
    setPeriod(days)
    setDateRange(dateRangeForDays(days))
    resetResultPages()
  }

  function applyDateRange(range: DateRange) {
    setDateRange(range)
    setPeriod(daysBetween(range))
    resetResultPages()
  }

  async function exportCsv(selectedOnly = false) {
    if (page === "sales") {
      const rows =
        authState === "authenticated"
          ? await loadSalesForExport()
          : demoFilteredSales.map((sale) => [
              sale.id,
              sale.date,
              sale.product,
              sale.gateway,
              sale.amountLabel ?? sale.amount,
              sale.status,
              sale.campaign,
            ])
      if (rows) downloadCsv("vendas", salesCsvHeaders, rows)
      return
    }

    const campaignsToExport = selectedOnly
      ? visibleCampaigns.filter((campaign) =>
          selectedCampaignIds.includes(campaign.id)
        )
      : visibleCampaigns
    if (selectedOnly && !campaignsToExport.length) {
      setToast("Selecione pelo menos uma campanha para exportar.")
      return
    }
    downloadCsv(
      selectedOnly ? "campanhas-selecionadas" : "campanhas",
      campaignCsvHeaders,
      campaignsToExport.map((campaign) => [
        campaign.id,
        campaign.name,
        campaign.product,
        campaign.gateway,
        campaign.spend,
        campaign.revenue,
        campaign.sales,
      ])
    )
  }

  async function loadSalesForExport() {
    const params = new URLSearchParams({
      from: dateRange.from,
      to: dateRange.to,
      limit: "100",
    })
    if (accountFilter !== "all") params.set("accountIds", accountFilter)
    if (gatewayFilter !== "Todos os gateways")
      params.set("gateway", gatewayFilter.toLowerCase())
    if (productFilter !== "Todos os produtos")
      params.set("product", productFilter)
    if (query.trim()) params.set("q", query.trim())
    if (saleStatusFilter !== "all") params.set("status", saleStatusFilter)
    if (saleAttributionFilter !== "all")
      params.set("attribution", saleAttributionFilter)

    const rows: unknown[][] = []
    let offset = 0
    let total = Number.POSITIVE_INFINITY
    try {
      while (offset < total) {
        params.set("offset", String(offset))
        const response = await fetch(`/api/sales?${params}`)
        const result = (await response.json().catch(() => ({}))) as {
          error?: string
          sales?: Array<Record<string, unknown>>
          total?: number
        }
        if (!response.ok)
          throw new Error(
            result.error || "Não foi possível exportar as vendas."
          )
        const batch = result.sales ?? []
        total = result.total ?? batch.length
        rows.push(
          ...batch.map((sale) => {
            const currencyCode =
              typeof sale.currency === "string" ? sale.currency : "BRL"
            const amountBrl =
              typeof sale.amount_brl === "number" ? sale.amount_brl : null
            const minorAmount =
              Number(sale.amount_minor ?? 0) /
              10 ** currencyMinorUnit(currencyCode)
            const status =
              sale.status === "approved"
                ? "Aprovada"
                : sale.status === "refunded"
                  ? "Reembolsada"
                  : sale.status === "chargeback"
                    ? "Chargeback"
                    : "Aguardando"
            return [
              sale.external_id,
              sale.occurred_at,
              sale.product_name,
              sale.provider === "kiwify" ? "Kiwify" : "Hotmart",
              amountBrl ?? `${minorAmount} ${currencyCode} · aguardando PTAX`,
              status,
              sale.campaign_name ?? sale.campaign_id ?? "Sem atribuição",
            ]
          })
        )
        if (!batch.length) break
        offset += batch.length
      }
      return rows
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Não foi possível exportar."
      )
      return null
    }
  }

  function navigate(nextPage: Page) {
    setPage(nextPage)
    setMobileNavOpen(false)
    updateQuery("")
  }

  function openIntegrations() {
    setHelpOpen(false)
    navigate("integrations")
  }

  function connectAccount() {
    navigate("integrations")
    window.setTimeout(
      () =>
        document
          .getElementById("meta-integration")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0
    )
  }

  function showCampaignSales(campaign: Campaign) {
    setPage("sales")
    setMobileNavOpen(false)
    setAccountFilter(campaign.accountId)
    setProductFilter("Todos os produtos")
    setGatewayFilter("Todos os gateways")
    setSaleStatusFilter("all")
    setSaleAttributionFilter("matched")
    setQuery(
      authState === "authenticated"
        ? campaign.name
        : (campaign.name.split("•").at(-1)?.trim() ?? campaign.name)
    )
    resetResultPages()
  }

  async function logOut() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) throw new Error("Não foi possível encerrar a sessão.")
      setAuthState("required")
      setLiveCampaigns(null)
      setLiveSales(null)
      setRecentActivity([])
      setToast("")
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Não foi possível sair."
      )
    }
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
          <div className="workspace-avatar">P</div>
          <div className="workspace-copy">
            <strong>Meu workspace</strong>
            <span>Workspace único</span>
          </div>
        </div>

        <div className="nav-caption">WORKSPACE</div>
        <nav className="main-nav" aria-label="Navegação principal">
          <button
            className={`nav-item ${page === "overview" ? "active" : ""}`}
            onClick={() => navigate("overview")}
            aria-current={page === "overview" ? "page" : undefined}
          >
            <LayoutDashboard size={18} />
            <span>Visão geral</span>
            <span className="nav-shortcut">⌘ 1</span>
          </button>
          <button
            className={`nav-item ${page === "sales" ? "active" : ""}`}
            onClick={() => navigate("sales")}
            aria-current={page === "sales" ? "page" : undefined}
          >
            <ShoppingBag size={18} />
            <span>Vendas</span>
            <span className="nav-count">{salesTotal}</span>
          </button>
          <button
            className={`nav-item ${page === "integrations" ? "active" : ""}`}
            onClick={() => navigate("integrations")}
            aria-current={page === "integrations" ? "page" : undefined}
          >
            <Link2 size={18} />
            <span>Integrações</span>
            <span
              className={
                integrationStatus.meta ||
                integrationStatus.hotmart ||
                integrationStatus.kiwify
                  ? "nav-dot nav-dot-ready"
                  : "nav-dot nav-dot-pending"
              }
            />
          </button>
        </nav>

        <div className="nav-caption accounts-caption">
          CONTAS DE ANÚNCIO{" "}
          <button
            aria-label="Adicionar conta"
            onClick={connectAccount}
            title="Conectar uma conta Meta"
            type="button"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="account-list">
          {adAccountList.map((account) => (
            <button
              className={`account-nav-item ${accountFilter === account.id ? "selected" : ""}`}
              key={account.id}
              onClick={() => {
                updateAccountFilter(account.id)
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
          {!adAccountList.length && authState === "authenticated" && (
            <span className="account-list-empty">Nenhuma conta conectada</span>
          )}
        </div>

        <div className="sidebar-bottom">
          <button
            className="help-card"
            onClick={() => setHelpOpen(true)}
            type="button"
          >
            <div className="help-icon">
              <CircleHelp size={17} />
            </div>
            <div>
              <strong>Precisa de ajuda?</strong>
              <span>Veja como configurar</span>
            </div>
            <ArrowRight size={15} />
          </button>
          <Popover
            label="Menu da conta"
            trigger={
              <>
                <div className="profile-avatar">A</div>
                <span className="profile-copy">
                  <strong>Administrador</strong>
                  <small>Workspace privado</small>
                </span>
                <MoreHorizontal size={19} />
              </>
            }
            triggerClassName="profile-button"
            panelClassName="profile-menu"
          >
            {(close) => (
              <div className="popover-actions">
                <strong>Conta administrativa</strong>
                <button
                  onClick={() => {
                    close()
                    navigate("integrations")
                    window.setTimeout(
                      () =>
                        document
                          .getElementById("account-security")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          }),
                      0
                    )
                  }}
                  type="button"
                >
                  <Settings2 size={15} /> Alterar senha
                </button>
                <button
                  onClick={() => {
                    close()
                    void logOut()
                  }}
                  type="button"
                >
                  <LogOut size={15} /> Sair do dashboard
                </button>
              </div>
            )}
          </Popover>
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
            <Popover
              label="Atividade recente"
              trigger={
                <>
                  <Bell size={18} />
                  {recentActivity.some((run) =>
                    ["queued", "running", "partial", "failed"].includes(
                      run.status
                    )
                  ) && <i />}
                </>
              }
              triggerClassName="icon-button notification-button"
              panelClassName="activity-menu"
            >
              {() => (
                <div className="activity-feed">
                  <div className="popover-heading">
                    <strong>Atividade recente</strong>
                    <span>{recentActivity.length}</span>
                  </div>
                  {recentActivity.length ? (
                    recentActivity.map((run) => (
                      <article className="activity-item" key={run.id}>
                        <span className={`activity-state ${run.status}`} />
                        <div>
                          <strong>
                            {run.type === "meta"
                              ? "Atualização de anúncios"
                              : "Reconciliação de vendas"}
                          </strong>
                          <span>{syncStatusLabel(run.status)}</span>
                          <small>
                            {formatActivityDate(
                              run.completed_at ?? run.created_at
                            )}
                          </small>
                          {run.error_message && (
                            <small className="activity-error">
                              {run.error_message}
                            </small>
                          )}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="popover-empty">
                      Nenhuma sincronização registrada neste workspace.
                    </p>
                  )}
                </div>
              )}
            </Popover>
            <div className="topbar-divider" />
            <button
              className="topbar-help"
              onClick={() => setHelpOpen(true)}
              type="button"
            >
              <CircleHelp size={17} /> Ajuda
            </button>
            <div aria-label="Administrador" className="topbar-avatar">
              A
            </div>
          </div>
        </header>

        <main className="page-content">
          {page === "overview" && (
            <OverviewPage
              period={period}
              setPeriod={updatePeriod}
              dateRange={dateRange}
              onDateRangeApply={applyDateRange}
              accountFilter={accountFilter}
              setAccountFilter={updateAccountFilter}
              productFilter={productFilter}
              setProductFilter={updateProductFilter}
              gatewayFilter={gatewayFilter}
              setGatewayFilter={updateGatewayFilter}
              level={level}
              setLevel={updateLevel}
              query={query}
              setQuery={updateQuery}
              campaignPerformanceFilter={campaignPerformanceFilter}
              setCampaignPerformanceFilter={updateCampaignPerformanceFilter}
              campaignPage={campaignPage}
              setCampaignPage={setCampaignPage}
              selectedCampaignIds={selectedCampaignIds}
              setSelectedCampaignIds={setSelectedCampaignIds}
              campaignColumns={campaignColumns}
              setCampaignColumns={setCampaignColumns}
              onExportSelected={() => void exportCsv(true)}
              onShowCampaignSales={showCampaignSales}
              onToast={setToast}
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
              onExport={() => void exportCsv()}
              syncing={syncing}
              loading={dashboardLoading}
              error={dashboardError}
              onRetry={() => setDataRefresh((value) => value + 1)}
            />
          )}
          {page === "sales" && (
            <SalesPage
              period={period}
              setPeriod={updatePeriod}
              dateRange={dateRange}
              onDateRangeApply={applyDateRange}
              gatewayFilter={gatewayFilter}
              setGatewayFilter={updateGatewayFilter}
              productFilter={productFilter}
              setProductFilter={updateProductFilter}
              query={query}
              setQuery={updateQuery}
              rows={displayedSales}
              total={salesTotal}
              summary={salesSummary}
              page={salesPage}
              setPage={setSalesPage}
              loading={salesLoading}
              error={salesError}
              onRetry={() => setDataRefresh((value) => value + 1)}
              statusFilter={saleStatusFilter}
              setStatusFilter={updateSaleStatusFilter}
              attributionFilter={saleAttributionFilter}
              setAttributionFilter={updateSaleAttributionFilter}
              onSelectSale={setSelectedSale}
              accountFilter={accountFilter}
              setAccountFilter={updateAccountFilter}
              accountOptions={adAccountList}
              productOptions={productOptions}
              demo={authState === "demo"}
              onReconcile={requestReconciliation}
              onExport={() => void exportCsv()}
              reconciling={reconciling}
            />
          )}
          {page === "integrations" && (
            <IntegrationsPage
              onSync={requestSync}
              syncing={syncing}
              onToast={setToast}
              onHelp={() => setHelpOpen(true)}
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
      {helpOpen && (
        <HelpGuide
          onClose={() => setHelpOpen(false)}
          onOpenIntegrations={openIntegrations}
        />
      )}
      {selectedSale && (
        <SaleDetails
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onToast={setToast}
        />
      )}
    </div>
  )
}

type FiltersProps = {
  period: Period
  setPeriod: (period: Period) => void
  dateRange: DateRange
  onDateRangeApply: (range: DateRange) => void
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
  campaignPerformanceFilter: "all" | "with-sales" | "without-sales"
  setCampaignPerformanceFilter: (
    filter: "all" | "with-sales" | "without-sales"
  ) => void
  campaignPage: number
  setCampaignPage: (page: number) => void
  selectedCampaignIds: string[]
  setSelectedCampaignIds: (ids: string[]) => void
  campaignColumns: Record<CampaignColumn, boolean>
  setCampaignColumns: (columns: Record<CampaignColumn, boolean>) => void
  onExportSelected: () => void
  onShowCampaignSales: (campaign: Campaign) => void
  onToast: (message: string) => void
  accountOptions: AdAccount[]
  integrationStatus: { meta: boolean; hotmart: boolean; kiwify: boolean }
  dailyData?: Array<{ label: string; spend: number; revenue: number }>
  demo: boolean
  live: boolean
  onSync: () => void
  syncing: boolean
  loading: boolean
  error: string
  onRetry: () => void
}

function OverviewPage(props: OverviewPageProps) {
  const accountName = props.accountOptions.find(
    (account) => account.id === props.accountFilter
  )?.name
  const activeFilterCount =
    Number(props.accountFilter !== "all") +
    Number(props.productFilter !== "Todos os produtos") +
    Number(props.gatewayFilter !== "Todos os gateways") +
    Number(props.campaignPerformanceFilter !== "all")

  function exportChartData() {
    const points = props.dailyData ?? dailyMetrics
    downloadCsv(
      "performance-diaria",
      ["data", "investimento_brl", "receita_brl"],
      points.map((point) => [point.label, point.spend, point.revenue])
    )
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> PERFORMANCE{" "}
            <span className="eyebrow-period">
              · {formatRange(props.dateRange)}
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
              className={
                isPeriodSelected(props.dateRange, days) ? "selected" : ""
              }
              onClick={() => props.setPeriod(days)}
            >
              {days} dias
            </button>
          ))}
          <DateRangeControl
            onApply={props.onDateRangeApply}
            value={props.dateRange}
          />
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
        <Popover
          label="Mais filtros de campanhas"
          trigger={
            <>
              <Filter size={16} />
              <span>Filtros</span>
              <span className="filter-count">{activeFilterCount}</span>
            </>
          }
          triggerClassName="filter-more"
          panelClassName="advanced-filter-menu"
        >
          {(close) => (
            <div className="popover-actions">
              <strong>Campanhas</strong>
              <label
                className="popover-select-label"
                htmlFor="campaign-performance-filter"
              >
                Resultado atribuído
              </label>
              <select
                id="campaign-performance-filter"
                onChange={(event) =>
                  props.setCampaignPerformanceFilter(
                    event.target
                      .value as OverviewPageProps["campaignPerformanceFilter"]
                  )
                }
                value={props.campaignPerformanceFilter}
              >
                <option value="all">Todas as campanhas</option>
                <option value="with-sales">Com vendas</option>
                <option value="without-sales">Sem vendas</option>
              </select>
              <button
                onClick={() => {
                  props.setCampaignPerformanceFilter("all")
                  close()
                }}
                type="button"
              >
                Limpar filtro avançado
              </button>
            </div>
          )}
        </Popover>
      </div>

      {props.error && (
        <div className="inline-error" role="alert">
          <span>{props.error}</span>
          <button onClick={props.onRetry} type="button">
            Tentar novamente
          </button>
        </div>
      )}
      {props.loading && (
        <div aria-live="polite" className="loading-note">
          <RefreshCw className="spin" size={14} /> Atualizando dados do período…
        </div>
      )}

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
              <Popover
                label="Opções do gráfico"
                trigger={<MoreHorizontal size={19} />}
                triggerClassName="icon-button subtle-icon"
                panelClassName="chart-menu"
              >
                {(close) => (
                  <div className="popover-actions">
                    <strong>Dados do gráfico</strong>
                    <button
                      onClick={() => {
                        exportChartData()
                        close()
                      }}
                      type="button"
                    >
                      <Download size={15} /> Baixar série em CSV
                    </button>
                  </div>
                )}
              </Popover>
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
            days={daysBetween(props.dateRange)}
            data={props.dailyData}
          />
          <div className="chart-footer">
            <span>{chartBoundary(props.dateRange, "start")}</span>
            <span>{chartBoundary(props.dateRange, "middle")}</span>
            <span>{chartBoundary(props.dateRange, "end")}</span>
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
            <Popover
              label="Como a atribuição é calculada"
              trigger={<MoreHorizontal size={19} />}
              triggerClassName="icon-button subtle-icon"
              panelClassName="attribution-help-menu"
            >
              {() => (
                <div className="attribution-help-copy">
                  <strong>Como funciona</strong>
                  <p>
                    Uma venda é atribuída quando o webhook inclui identificador
                    de campanha, conjunto ou anúncio. O vínculo pode levar em
                    conta UTMs e dados da Meta disponíveis no período.
                  </p>
                </div>
              )}
            </Popover>
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
            <Popover
              label="Configurar colunas da tabela"
              trigger={<Settings2 size={17} />}
              triggerClassName="icon-button subtle-icon settings-filter"
              panelClassName="column-menu"
            >
              {() => (
                <div className="column-menu-content">
                  <strong>Colunas visíveis</strong>
                  {campaignColumnOptions.map(([key, label]) => (
                    <label key={key}>
                      <input
                        checked={props.campaignColumns[key]}
                        onChange={(event) =>
                          props.setCampaignColumns({
                            ...props.campaignColumns,
                            [key]: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </Popover>
          </div>
        </div>
        {props.selectedCampaignIds.length > 0 && (
          <div className="selection-toolbar">
            <span>
              {props.selectedCampaignIds.length} campanha(s) selecionada(s)
            </span>
            <button onClick={props.onExportSelected} type="button">
              <Download size={14} /> Exportar selecionadas
            </button>
            <button
              onClick={() => props.setSelectedCampaignIds([])}
              type="button"
            >
              Limpar seleção
            </button>
          </div>
        )}
        <CampaignTable
          rows={props.rows}
          level={props.level}
          period={props.period}
          accounts={props.accountOptions}
          live={props.live}
          page={props.campaignPage}
          setPage={props.setCampaignPage}
          selectedIds={props.selectedCampaignIds}
          setSelectedIds={props.setSelectedCampaignIds}
          columns={props.campaignColumns}
          onShowSales={props.onShowCampaignSales}
          onToast={props.onToast}
        />
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
  days: number
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
        <path d={area} fill="#0066cc" fillOpacity=".08" />
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
  page,
  setPage,
  selectedIds,
  setSelectedIds,
  columns,
  onShowSales,
  onToast,
}: {
  rows: Campaign[]
  level: Level
  period: Period
  accounts: AdAccount[]
  live: boolean
  page: number
  setPage: (page: number) => void
  selectedIds: string[]
  setSelectedIds: (ids: string[]) => void
  columns: Record<CampaignColumn, boolean>
  onShowSales: (campaign: Campaign) => void
  onToast: (message: string) => void
}) {
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
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(expandedRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = expandedRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )
  const pageCampaignIds = [...new Set(pageRows.map((row) => row.campaign.id))]
  const allSelected =
    pageCampaignIds.length > 0 &&
    pageCampaignIds.every((id) => selectedIds.includes(id))

  function toggleCampaign(id: string, checked: boolean) {
    setSelectedIds(
      checked
        ? [...new Set([...selectedIds, id])]
        : selectedIds.filter((selectedId) => selectedId !== id)
    )
  }

  function togglePage(checked: boolean) {
    setSelectedIds(
      checked
        ? [...new Set([...selectedIds, ...pageCampaignIds])]
        : selectedIds.filter((id) => !pageCampaignIds.includes(id))
    )
  }

  if (!rows.length)
    return (
      <div className="empty-state">
        <Search size={21} />
        <strong>Nenhuma campanha encontrada</strong>
        <span>Tente ajustar os filtros para ampliar os resultados.</span>
      </div>
    )

  return (
    <>
      <div className="table-scroll">
        <table className="data-table campaign-table">
          <thead>
            <tr>
              <th className="check-cell">
                <input
                  aria-label="Selecionar todas as campanhas desta página"
                  checked={allSelected}
                  onChange={(event) => togglePage(event.target.checked)}
                  type="checkbox"
                />
              </th>
              <th className="campaign-name-head">
                {level === "Campanhas"
                  ? "Campanha"
                  : level === "Conjuntos"
                    ? "Conjunto de anúncios"
                    : "Anúncio"}
              </th>
              {columns.account && <th>Conta de anúncio</th>}
              {columns.spend && <th>Investimento</th>}
              {columns.sales && <th>Vendas</th>}
              {columns.revenue && <th>Receita líquida</th>}
              {columns.roas && <th>ROAS</th>}
              {columns.ctr && <th>CTR</th>}
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ campaign, name, id, scale: rowScale }, index) => {
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
                    <input
                      aria-label={`Selecionar campanha ${name}`}
                      checked={selectedIds.includes(campaign.id)}
                      onChange={(event) =>
                        toggleCampaign(campaign.id, event.target.checked)
                      }
                      type="checkbox"
                    />
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
                  {columns.account && (
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
                  )}
                  {columns.spend && (
                    <td className="numeric-cell">{currency.format(spend)}</td>
                  )}
                  {columns.sales && (
                    <td className="numeric-cell">
                      {numberFormat.format(Math.round(campaign.sales * factor))}
                    </td>
                  )}
                  {columns.revenue && (
                    <td className="numeric-cell revenue-cell">
                      {currency.format(revenue)}
                    </td>
                  )}
                  {columns.roas && (
                    <td>
                      <span
                        className={`roas-badge ${roas !== null && roas >= 3 ? "roas-good" : "roas-mid"}`}
                      >
                        {roas === null
                          ? "—"
                          : `${roas.toFixed(2).replace(".", ",")}x`}
                      </span>
                    </td>
                  )}
                  {columns.ctr && (
                    <td className="numeric-cell">
                      {campaign.impressions > 0
                        ? `${((campaign.clicks / campaign.impressions) * 100).toFixed(2).replace(".", ",")}%`
                        : "—"}
                    </td>
                  )}
                  <td>
                    <Popover
                      label={`Opções para ${name}`}
                      trigger={<MoreHorizontal size={17} />}
                      triggerClassName="icon-button row-menu"
                      panelClassName="row-action-menu"
                      portal
                    >
                      {(close) => (
                        <div className="popover-actions">
                          <strong>Ações da campanha</strong>
                          <button
                            onClick={() => {
                              void copyCampaignId(campaign.id, onToast)
                              close()
                            }}
                            type="button"
                          >
                            <Copy size={15} /> Copiar ID
                          </button>
                          <button
                            onClick={() => {
                              onShowSales(campaign)
                              close()
                            }}
                            type="button"
                          >
                            <ShoppingBag size={15} /> Ver vendas atribuídas
                          </button>
                        </div>
                      )}
                    </Popover>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Exibindo{" "}
          <strong>
            {expandedRows.length ? (currentPage - 1) * pageSize + 1 : 0}–
            {Math.min(currentPage * pageSize, expandedRows.length)}
          </strong>{" "}
          de <strong>{expandedRows.length}</strong> linhas
        </span>
        <Pagination
          label="campanhas"
          onChange={setPage}
          page={currentPage}
          pageSize={pageSize}
          totalItems={expandedRows.length}
        />
      </div>
    </>
  )
}

type SalesPageProps = FiltersProps & {
  rows: Sale[]
  total: number
  summary: SalesSummary | null
  page: number
  setPage: (page: number) => void
  loading: boolean
  error: string
  onRetry: () => void
  statusFilter: SaleStatusFilter
  setStatusFilter: (filter: SaleStatusFilter) => void
  attributionFilter: SaleAttributionFilter
  setAttributionFilter: (filter: SaleAttributionFilter) => void
  onSelectSale: (sale: Sale) => void
  demo: boolean
  accountFilter: string
  setAccountFilter: (account: string) => void
  accountOptions: AdAccount[]
  onReconcile: () => void
  reconciling: boolean
}

function SalesPage(props: SalesPageProps) {
  const summary = props.summary
  const matchedRate = summary?.total
    ? Math.round((summary.matched / summary.total) * 100)
    : 0
  const firstRow = props.total ? (props.page - 1) * 25 + 1 : 0
  const lastRow = Math.min(props.page * 25, props.total)

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> RECEITA{" "}
            <span className="eyebrow-period">
              · {formatRange(props.dateRange)}
            </span>
          </div>
          <h1>
            Vendas<span className="heading-period">.</span>
          </h1>
          <p>Pedidos dos seus gateways, com origem e status em um só lugar.</p>
        </div>
        <div className="heading-actions">
          <button
            className="button button-secondary"
            onClick={props.onExport}
            type="button"
          >
            <Download size={16} /> Exportar
          </button>
          <button
            className="button button-primary"
            onClick={props.onReconcile}
            disabled={props.reconciling}
            type="button"
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
            type="button"
          >
            Configurar gateways <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="sales-summary-grid">
        <div className="sales-summary-card">
          <span>Pedidos no período</span>
          <strong>{summary?.total ?? 0}</strong>
          <small>{summary?.approved ?? 0} aprovados</small>
        </div>
        <div className="sales-summary-card">
          <span>Receita aprovada</span>
          <strong>{currency.format(summary?.approvedRevenue ?? 0)}</strong>
          <small>
            {summary?.approvedAmountCount !== summary?.approved
              ? "Valores convertidos para BRL"
              : "Reembolsos e chargebacks excluídos"}
          </small>
        </div>
        <div className="sales-summary-card">
          <span>Com atribuição</span>
          <strong>
            {summary?.matched ?? 0} <em>/ {summary?.total ?? 0}</em>
          </strong>
          <small>{matchedRate}% vinculados a anúncios</small>
        </div>
        <div className="sales-summary-card">
          <span>Ticket médio</span>
          <strong>
            {summary?.averageTicket === null || !summary
              ? "—"
              : currency.format(summary.averageTicket)}
          </strong>
          <small>Pedidos aprovados convertidos</small>
        </div>
      </div>
      <section className="panel sales-panel">
        <div className="panel-header sales-table-heading">
          <div>
            <div className="panel-kicker">TRANSAÇÕES</div>
            <h2>
              Pedidos recebidos{" "}
              <span className="table-count">{props.total}</span>
            </h2>
          </div>
          <div className="table-tools sales-tools">
            <div className="table-search">
              <Search size={15} />
              <input
                aria-label="Buscar venda"
                placeholder="Buscar por produto, campanha ou ID..."
                value={props.query}
                onChange={(event) => props.setQuery(event.target.value)}
              />
            </div>
            <select
              className="inline-filter"
              aria-label="Filtrar gateway"
              onChange={(event) =>
                props.setGatewayFilter(event.target.value as Gateway)
              }
              value={props.gatewayFilter}
            >
              <option>Todos os gateways</option>
              <option>Hotmart</option>
              <option>Kiwify</option>
            </select>
          </div>
        </div>
        <div className="sales-filter-row">
          <div className="period-switch" role="group" aria-label="Período">
            {([7, 14, 30] as Period[]).map((days) => (
              <button
                key={days}
                className={
                  isPeriodSelected(props.dateRange, days) ? "selected" : ""
                }
                onClick={() => props.setPeriod(days)}
                type="button"
              >
                {days} dias
              </button>
            ))}
            <DateRangeControl
              className="sales-date-range"
              onApply={props.onDateRangeApply}
              value={props.dateRange}
            />
          </div>
          <select
            className="inline-filter"
            aria-label="Filtrar conta de anúncio"
            onChange={(event) => props.setAccountFilter(event.target.value)}
            value={props.accountFilter}
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
            onChange={(event) => props.setProductFilter(event.target.value)}
            value={props.productFilter}
          >
            <option>Todos os produtos</option>
            {props.productOptions.map((product) => (
              <option key={product}>{product}</option>
            ))}
          </select>
          <select
            className="inline-filter"
            aria-label="Filtrar status da venda"
            onChange={(event) =>
              props.setStatusFilter(event.target.value as SaleStatusFilter)
            }
            value={props.statusFilter}
          >
            <option value="all">Todos os status</option>
            <option value="approved">Aprovadas</option>
            <option value="refunded">Reembolsadas</option>
            <option value="chargeback">Chargebacks</option>
            <option value="pending">Aguardando</option>
          </select>
          <select
            className="inline-filter"
            aria-label="Filtrar atribuição"
            onChange={(event) =>
              props.setAttributionFilter(
                event.target.value as SaleAttributionFilter
              )
            }
            value={props.attributionFilter}
          >
            <option value="all">Toda atribuição</option>
            <option value="matched">Atribuídas</option>
            <option value="unmatched">Sem atribuição</option>
          </select>
          <div className="sales-live-note">
            <span /> Atualizado sob demanda
          </div>
        </div>
        {props.error ? (
          <div className="inline-error sales-error" role="alert">
            <span>{props.error}</span>
            <button onClick={props.onRetry} type="button">
              Tentar novamente
            </button>
          </div>
        ) : props.loading && !props.rows.length ? (
          <div aria-live="polite" className="loading-state">
            <RefreshCw className="spin" size={17} /> Carregando transações…
          </div>
        ) : props.rows.length ? (
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
                  <th aria-label="Detalhes" />
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
                      className={
                        "numeric-cell " +
                        (sale.status === "Aprovada" ? "revenue-cell" : "")
                      }
                    >
                      {sale.amountLabel ?? currency.format(sale.amount)}
                    </td>
                    <td>
                      <SaleStatus status={sale.status} />
                    </td>
                    <td>
                      <span
                        className={
                          "attribution-pill " +
                          (sale.matched ? "matched" : "unmatched")
                        }
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
                        aria-label={"Abrir detalhes da transação " + sale.id}
                        className="icon-button row-menu"
                        onClick={() => props.onSelectSale(sale)}
                        type="button"
                      >
                        <ExternalLink size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Search size={21} />
            <strong>Nenhuma venda encontrada</strong>
            <span>Experimente ajustar período, filtros ou busca.</span>
          </div>
        )}
        <div className="table-footer">
          <span>
            Exibindo{" "}
            <strong>
              {firstRow}–{lastRow}
            </strong>{" "}
            de <strong>{props.total}</strong>{" "}
            {props.demo ? "transações demonstrativas" : "transações"}
          </span>
          <Pagination
            label="vendas"
            onChange={props.setPage}
            page={props.page}
            pageSize={25}
            totalItems={props.total}
          />
        </div>
      </section>
      <div className="disclaimer">
        <Clock3 size={13} /> Receita aprovada em BRL considera apenas conversões
        disponíveis. Reembolsos e chargebacks aparecem na lista e não entram no
        total aprovado.
        {props.demo ? " Os valores do exemplo são fictícios." : ""}
      </div>
    </>
  )
}

function IntegrationsPage({
  onSync,
  syncing,
  onToast,
  onHelp,
}: {
  onSync: () => void
  syncing: boolean
  onToast: (message: string) => void
  onHelp: () => void
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
            onClick={onHelp}
            type="button"
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
          <form
            className="workspace-config-card"
            id="account-security"
            onSubmit={changePassword}
          >
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
          id="meta-integration"
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
  id,
  provider,
  description,
  logo,
  badge,
  state,
  action,
  onAction,
}: {
  id?: string
  provider: string
  description: string
  logo: string
  badge: string
  state: string
  action: string
  onAction: () => void
}) {
  return (
    <article className="integration-card" id={id}>
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

function readCampaignColumns(): Record<CampaignColumn, boolean> {
  const defaults: Record<CampaignColumn, boolean> = {
    account: true,
    spend: true,
    sales: true,
    revenue: true,
    roas: true,
    ctr: true,
  }
  if (typeof window === "undefined") return defaults
  try {
    const stored = JSON.parse(
      window.localStorage.getItem("pulso:campaign-columns") ?? "{}"
    ) as Partial<Record<CampaignColumn, unknown>>
    for (const [key] of campaignColumnOptions) {
      if (typeof stored[key] === "boolean") defaults[key] = stored[key]
    }
  } catch {
    return defaults
  }
  return defaults
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function syncStatusLabel(status: SyncActivity["status"]) {
  if (status === "queued") return "Na fila"
  if (status === "running") return "Em andamento"
  if (status === "completed") return "Concluída"
  if (status === "partial") return "Concluída parcialmente"
  return "Falhou"
}

function formatActivityDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Data indisponível"
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date)
}

function pageTitle(page: Page) {
  if (page === "sales") return "Vendas"
  if (page === "integrations") return "Integrações"
  return "Visão geral"
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

function chartBoundary(range: DateRange, position: "start" | "middle" | "end") {
  const date = new Date(`${range.from}T00:00:00Z`)
  if (position === "end") date.setTime(Date.parse(`${range.to}T00:00:00Z`))
  if (position === "middle")
    date.setUTCDate(
      date.getUTCDate() + Math.floor((daysBetween(range) - 1) / 2)
    )
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date)
}

function isPeriodSelected(range: DateRange, days: number) {
  const preset = dateRangeForDays(days)
  return preset.from === range.from && preset.to === range.to
}

async function copyCampaignId(
  campaignId: string,
  onToast: (message: string) => void
) {
  try {
    await navigator.clipboard.writeText(campaignId)
    onToast("ID da campanha copiado.")
  } catch {
    onToast("Não foi possível copiar o ID.")
  }
}

function csvCell(value: unknown) {
  const text = String(value ?? "")
  return `"${text.replaceAll('"', '""')}"`
}

export default App
