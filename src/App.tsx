import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  Check,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Filter,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  Menu,
  MoreHorizontal,
  Plus,
  PiggyBank,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
  X,
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
import { SecurityPage } from "@/components/dashboard/security-page"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AD_TAX_RATE,
  calculateNetPerformance,
  currencyMinorUnit,
  PRODUCT_TAX_RATE,
} from "@/lib/metrics"
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

type Page =
  "overview" | "campaigns" | "funnel" | "sales" | "integrations" | "security"
type Period = number
const periodOptions: Period[] = [7, 14, 30, 90, 120]
type Level = "Campanhas" | "Conjuntos" | "Anúncios"
type Gateway = "Todos os gateways" | "Hotmart" | "Kiwify"
type CampaignPerformanceFilter = "all" | "with-sales" | "without-sales"
type CampaignColumn =
  | "account"
  | "spend"
  | "sales"
  | "revenue"
  | "profit"
  | "roas"
  | "cpa"
  | "cpc"
  | "cpm"
  | "ctr"

type DashboardTotals = {
  spend: number
  revenue: number
  orders: number
  refunds: number
  refundRate: number
  refundedRevenue: number
  chargebacks: number
  chargebackRevenue: number
  adTax: number
  productTax: number
  arpu: number | null
  clicks: number
  impressions: number
  matchRate: number
  profit: number
  roas: number | null
  roi: number | null
}

type FunnelMetrics = {
  impressions: number
  clicks: number
  landingPageViews: number | null
  checkouts: number | null
  purchases: number
}

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

const preciseCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
})

const numberFormat = new Intl.NumberFormat("pt-BR")
const demoFunnelMetrics: FunnelMetrics = {
  impressions: 184_230,
  clicks: 5_412,
  landingPageViews: 4_625,
  checkouts: 872,
  purchases: 149,
}
const campaignColumnOptions: Array<[CampaignColumn, string]> = [
  ["account", "Conta de anúncio"],
  ["spend", "Investimento"],
  ["sales", "Vendas"],
  ["revenue", "Receita líquida"],
  ["profit", "Lucro estimado"],
  ["roas", "ROAS"],
  ["cpa", "CPA"],
  ["cpc", "CPC"],
  ["cpm", "CPM"],
  ["ctr", "CTR"],
]
const campaignCsvHeaders = [
  "id",
  "nivel",
  "nome",
  "conta",
  "investimento_brl",
  "imposto_anuncios_brl",
  "vendas_aprovadas",
  "receita_brl",
  "imposto_produtos_brl",
  "lucro_estimado_brl",
  "roas",
  "cpa_brl",
  "cpc_brl",
  "cpm_brl",
  "ctr_percentual",
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

type FilterSelectOption = { value: string; label: string }

function FilterSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  options: FilterSelectOption[]
  ariaLabel: string
  className?: string
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onValueChange(nextValue)
      }}
    >
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function PeriodSelector({
  value,
  period,
  onPeriodChange,
  onDateRangeApply,
  ariaLabel,
  dateRangeClassName,
}: {
  value: DateRange
  period: Period
  onPeriodChange: (period: Period) => void
  onDateRangeApply: (range: DateRange) => void
  ariaLabel: string
  dateRangeClassName?: string
}) {
  return (
    <div className="period-switch">
      <ToggleGroup
        aria-label={ariaLabel}
        className="period-toggle"
        value={isPeriodSelected(value, period) ? [String(period)] : []}
        onValueChange={(selected) => {
          if (selected[0]) onPeriodChange(Number(selected[0]))
        }}
      >
        {periodOptions.map((days) => (
          <ToggleGroupItem key={days} value={String(days)}>
            {days} dias
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <DateRangeControl
        className={dateRangeClassName}
        onApply={onDateRangeApply}
        value={value}
      />
    </div>
  )
}

function App() {
  const [authState, setAuthState] = useState<
    "checking" | "setup" | "demo" | "authenticated" | "required" | "error"
  >("checking")
  const [page, setPage] = useState<Page>("overview")
  const [integrationTab, setIntegrationTab] = useState("meta")
  const [period, setPeriod] = useState<Period>(14)
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    dateRangeForDays(14)
  )
  const [accountFilter, setAccountFilter] = useState("all")
  const [productFilter, setProductFilter] = useState("Todos os produtos")
  const [gatewayFilter, setGatewayFilter] =
    useState<Gateway>("Todos os gateways")
  const [level, setLevel] = useState<Level>("Campanhas")
  const [campaignQuery, setCampaignQuery] = useState("")
  const [salesQuery, setSalesQuery] = useState("")
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
  const [liveFunnel, setLiveFunnel] = useState<FunnelMetrics | null>(null)
  const [funnelLoading, setFunnelLoading] = useState(false)
  const [funnelError, setFunnelError] = useState("")
  const [liveSales, setLiveSales] = useState<Sale[] | null>(null)
  const [liveSummary, setLiveSummary] = useState<{
    spend: number
    revenue: number
    allNetRevenue: number
    refundedRevenue: number
    chargebackRevenue: number
    profit: number
    roas: number | null
    roi: number | null
    sales: number
    refunds: number
    chargebacks: number
    refundRate: number
    arpu: number | null
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
    if (authState === "authenticated") setLiveCampaigns(null)
    resetResultPages()
  }

  function updateCampaignQuery(value: string) {
    setCampaignQuery(value)
    resetResultPages()
  }

  function updateSalesQuery(value: string) {
    setSalesQuery(value)
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

  const dashboardDemoSales = useMemo(
    () =>
      sales.filter((sale) => {
        const accountMatches =
          accountFilter === "all" || sale.accountId === accountFilter
        const productMatches =
          productFilter === "Todos os produtos" ||
          sale.product === productFilter
        const gatewayMatches =
          gatewayFilter === "Todos os gateways" ||
          sale.gateway === gatewayFilter
        return accountMatches && productMatches && gatewayMatches
      }),
    [accountFilter, gatewayFilter, productFilter]
  )

  const demoCampaignRows = useMemo(
    () =>
      campaigns.map((campaign) => {
        const reversedRevenue = dashboardDemoSales.reduce((sum, sale) => {
          const isReversed =
            sale.status === "Reembolsada" || sale.status === "Chargeback"
          const belongsToCampaign =
            sale.matched &&
            sale.accountId === campaign.accountId &&
            sale.campaign !== "Sem atribuição" &&
            campaign.name
              .toLocaleLowerCase("pt-BR")
              .includes(sale.campaign.toLocaleLowerCase("pt-BR"))
          return isReversed && belongsToCampaign ? sum + sale.amount : sum
        }, 0)
        return { ...campaign, revenue: campaign.revenue - reversedRevenue }
      }),
    [dashboardDemoSales]
  )

  const visibleCampaigns = useMemo(() => {
    const normalizedQuery = campaignQuery.trim().toLocaleLowerCase("pt-BR")
    const campaignSource =
      authState === "authenticated" ? (liveCampaigns ?? []) : demoCampaignRows
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
        `${campaign.name} ${campaign.id}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedQuery)
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
    campaignQuery,
    demoCampaignRows,
  ])

  const overviewCampaigns = useMemo(() => {
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
      return accountMatches && productMatches && gatewayMatches
    })
  }, [accountFilter, authState, gatewayFilter, liveCampaigns, productFilter])

  const scale = rangeDays / 14
  const totals = useMemo<DashboardTotals>(() => {
    if (authState === "authenticated" && !liveSummary) {
      return {
        spend: 0,
        revenue: 0,
        orders: 0,
        refunds: 0,
        refundRate: 0,
        refundedRevenue: 0,
        chargebacks: 0,
        chargebackRevenue: 0,
        adTax: 0,
        productTax: 0,
        arpu: null,
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
      const spend = liveSummary.spend
      const revenue = liveSummary.allNetRevenue
      const netPerformance = calculateNetPerformance(spend, revenue)
      return {
        spend,
        revenue,
        orders: liveSummary.sales,
        refunds: liveSummary.refunds,
        refundRate: liveSummary.refundRate,
        refundedRevenue: liveSummary.refundedRevenue,
        chargebacks: liveSummary.chargebacks,
        chargebackRevenue: liveSummary.chargebackRevenue,
        adTax: netPerformance.adTax,
        productTax: netPerformance.productTax,
        arpu: liveSummary.arpu,
        clicks: liveSummary.clicks,
        impressions: liveSummary.impressions,
        matchRate: totalCampaignRevenue ? matchedRate : 0,
        profit: netPerformance.profit,
        roas: netPerformance.roas,
        roi: netPerformance.roi,
      }
    }
    const spend =
      overviewCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0) *
      scale
    const approvedRevenue =
      overviewCampaigns.reduce((sum, campaign) => sum + campaign.revenue, 0) *
      scale
    const demoSalesSummary = summarizeSales(dashboardDemoSales)
    const revenue = approvedRevenue
    const orders = Math.round(
      overviewCampaigns.reduce((sum, campaign) => sum + campaign.sales, 0) *
        scale
    )
    const clicks = Math.round(
      overviewCampaigns.reduce((sum, campaign) => sum + campaign.clicks, 0) *
        scale
    )
    const impressions = Math.round(
      overviewCampaigns.reduce(
        (sum, campaign) => sum + campaign.impressions,
        0
      ) * scale
    )
    const matchedRevenue = overviewCampaigns.reduce(
      (sum, campaign) => sum + (campaign.revenue * campaign.matchRate) / 100,
      0
    )
    const baseRevenue = overviewCampaigns.reduce(
      (sum, campaign) => sum + campaign.revenue,
      0
    )
    const matchRate = baseRevenue
      ? Math.round((matchedRevenue / baseRevenue) * 100)
      : 0
    const netPerformance = calculateNetPerformance(spend, revenue)
    const settledSales =
      demoSalesSummary.approved +
      demoSalesSummary.refunded +
      demoSalesSummary.chargebacks
    return {
      spend,
      revenue,
      orders,
      refunds: demoSalesSummary.refunded,
      refundRate: settledSales
        ? (demoSalesSummary.refunded / settledSales) * 100
        : 0,
      refundedRevenue: demoSalesSummary.refundedRevenue,
      chargebacks: demoSalesSummary.chargebacks,
      chargebackRevenue: demoSalesSummary.chargebackRevenue,
      adTax: netPerformance.adTax,
      productTax: netPerformance.productTax,
      arpu: orders > 0 ? revenue / orders : null,
      clicks,
      impressions,
      matchRate,
      profit: netPerformance.profit,
      roas: netPerformance.roas,
      roi: netPerformance.roi,
    }
  }, [
    authState,
    dashboardDemoSales,
    liveCampaigns,
    liveSummary,
    overviewCampaigns,
    scale,
  ])

  const demoFilteredSales = useMemo(() => {
    const normalizedQuery = salesQuery.trim().toLocaleLowerCase("pt-BR")
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
    salesQuery,
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
        const [dashboardResponse, accountResponse, productsResponse] =
          await Promise.all([
            fetch(`/api/dashboard?${dashboardParams}`, {
              signal: controller.signal,
            }),
            fetch("/api/meta/accounts", { signal: controller.signal }),
            fetch("/api/products", { signal: controller.signal }),
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
              allNetRevenue: number
              approvedRevenue: number
              refundedRevenue: number
              chargebackRevenue: number
              profit: number
              roas: number | null
              roi: number | null
              sales: number
              refundedOrders: number
              chargebackOrders: number
              refundRate: number
              arpu: number | null
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
            setLiveSummary({
              ...result.summary,
              refunds: result.summary.refundedOrders,
              chargebacks: result.summary.chargebackOrders,
            })
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
            setLiveDaily(null)
          }
        } else {
          const result = (await dashboardResponse.json().catch(() => ({}))) as {
            error?: string
          }
          setDashboardError(
            result.error || "Não foi possível carregar os dados do dashboard."
          )
          setLiveCampaigns([])
          setLiveSummary(null)
          setLiveDaily(null)
        }
        if (accountResponse.ok) {
          const result = (await accountResponse.json()) as {
            accounts?: Array<{
              id: string
              name: string
              timezone_name: string
            }>
          }
          setAdAccountList(
            (result.accounts ?? []).map((account) => ({
              id: account.id,
              name: account.name,
              initials: account.name
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase(),
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
      } catch (error) {
        if (!controller.signal.aborted) {
          setDashboardError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o dashboard."
          )
          setLiveCampaigns([])
          setLiveSummary(null)
          setLiveDaily(null)
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
    if (page !== "funnel" || authState !== "authenticated") return

    const controller = new AbortController()
    const params = new URLSearchParams({
      from: dateRange.from,
      to: dateRange.to,
    })
    if (accountFilter !== "all") params.set("accountIds", accountFilter)

    async function loadFunnel() {
      setFunnelLoading(true)
      setFunnelError("")
      setLiveFunnel(null)
      try {
        const response = await fetch(`/api/funnel?${params}`, {
          signal: controller.signal,
        })
        const result = (await response.json().catch(() => ({}))) as {
          error?: string
          funnel?: FunnelMetrics
        }
        if (!response.ok || !result.funnel)
          throw new Error(result.error || "Não foi possível carregar o funil.")
        if (!controller.signal.aborted) setLiveFunnel(result.funnel)
      } catch (error) {
        if (!controller.signal.aborted) {
          setFunnelError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o funil."
          )
        }
      } finally {
        if (!controller.signal.aborted) setFunnelLoading(false)
      }
    }

    void loadFunnel()
    return () => controller.abort()
  }, [
    accountFilter,
    authState,
    dataRefresh,
    dateRange.from,
    dateRange.to,
    page,
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
    if (salesQuery.trim()) params.set("q", salesQuery.trim())
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
          setLiveSalesTotal(0)
          setLiveSalesSummary(null)
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
    salesQuery,
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

    const exportRows = visibleCampaigns.flatMap((campaign) => {
      if (authState === "authenticated" || level === "Campanhas") {
        return [
          {
            campaign,
            id: campaign.id,
            name: campaign.name,
            factor: authState === "authenticated" ? 1 : period / 14,
          },
        ]
      }
      const childNames = campaign.adsets?.length
        ? campaign.adsets
        : [campaign.name]
      return childNames.map((name, index) => ({
        campaign,
        id: `${campaign.id}-${index}`,
        name: level === "Anúncios" ? `${name} · Criativo ${index + 1}` : name,
        factor: (period / 14) * 0.5,
      }))
    })
    const rowsToExport = selectedOnly
      ? exportRows.filter((row) => selectedCampaignIds.includes(row.id))
      : exportRows
    if (selectedOnly && !rowsToExport.length) {
      setToast("Selecione pelo menos uma entidade para exportar.")
      return
    }
    const accountNames = new Map(
      adAccountList.map((item) => [item.id, item.name])
    )
    downloadCsv(
      selectedOnly ? "campanhas-selecionadas" : "campanhas",
      campaignCsvHeaders,
      rowsToExport.map(({ campaign, id, name, factor }) => {
        const spend = campaign.spend * factor
        const revenue = campaign.revenue * factor
        const salesCount = Math.round(campaign.sales * factor)
        const result = calculateNetPerformance(spend, revenue)
        const clicks = campaign.clicks * factor
        const impressions = campaign.impressions * factor
        return [
          id,
          level,
          name,
          accountNames.get(campaign.accountId) ?? campaign.accountName ?? "—",
          spend,
          result.adTax,
          salesCount,
          revenue,
          result.productTax,
          result.profit,
          result.roas,
          salesCount > 0 ? spend / salesCount : null,
          clicks > 0 ? spend / clicks : null,
          impressions > 0 ? (spend / impressions) * 1000 : null,
          impressions > 0 ? (clicks / impressions) * 100 : null,
        ]
      })
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
    if (salesQuery.trim()) params.set("q", salesQuery.trim())
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
    setCampaignQuery("")
    setSalesQuery("")
    resetResultPages()
  }

  function openIntegrations() {
    setHelpOpen(false)
    navigate("integrations")
  }

  function connectAccount() {
    setIntegrationTab("meta")
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
    setSalesQuery(
      authState === "authenticated"
        ? campaign.id
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
      setLiveSummary(null)
      setLiveDaily(null)
      setLiveSalesSummary(null)
      setLiveSalesTotal(0)
      setDashboardError("")
      setSalesError("")
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
              selfmetric<span className="brand-period">.</span>
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
            selfmetric<span className="brand-period">.</span>
          </span>
          <button
            className="icon-button sidebar-close"
            aria-label="Fechar menu"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={18} />
          </button>
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
          </button>
          <button
            className={`nav-item ${page === "campaigns" ? "active" : ""}`}
            onClick={() => navigate("campaigns")}
            aria-current={page === "campaigns" ? "page" : undefined}
          >
            <Megaphone size={18} />
            <span>Campanhas</span>
          </button>
          <button
            className={`nav-item ${page === "funnel" ? "active" : ""}`}
            onClick={() => navigate("funnel")}
            aria-current={page === "funnel" ? "page" : undefined}
          >
            <Filter size={18} />
            <span>Funil</span>
          </button>
          <button
            className={`nav-item ${page === "sales" ? "active" : ""}`}
            onClick={() => navigate("sales")}
            aria-current={page === "sales" ? "page" : undefined}
          >
            <ShoppingBag size={18} />
            <span>Vendas</span>
          </button>
          <button
            className={`nav-item ${page === "integrations" ? "active" : ""}`}
            onClick={() => navigate("integrations")}
            aria-current={page === "integrations" ? "page" : undefined}
          >
            <Link2 size={18} />
            <span>Integrações</span>
          </button>
          <button
            className={`nav-item ${page === "security" ? "active" : ""}`}
            onClick={() => navigate("security")}
            aria-current={page === "security" ? "page" : undefined}
          >
            <ShieldCheck size={18} />
            <span>Segurança</span>
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
              }}
            >
              <span className="account-avatar">{account.initials}</span>
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
                <Avatar className="profile-avatar">
                  <AvatarFallback>A</AvatarFallback>
                </Avatar>
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
                    navigate("security")
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
              chartMode={chartMode}
              setChartMode={setChartMode}
              totals={totals}
              accountOptions={adAccountList}
              productOptions={productOptions}
              dailyData={liveDaily ?? undefined}
              demo={authState === "demo"}
              onSync={requestSync}
              syncing={syncing}
              loading={dashboardLoading}
              error={dashboardError}
              onRetry={() => setDataRefresh((value) => value + 1)}
            />
          )}
          {page === "campaigns" && (
            <CampaignsPage
              period={period}
              setPeriod={updatePeriod}
              dateRange={dateRange}
              onDateRangeApply={applyDateRange}
              accountFilter={accountFilter}
              setAccountFilter={updateAccountFilter}
              accountOptions={adAccountList}
              productFilter={productFilter}
              productOptions={productOptions}
              setProductFilter={updateProductFilter}
              gatewayFilter={gatewayFilter}
              setGatewayFilter={updateGatewayFilter}
              query={campaignQuery}
              setQuery={updateCampaignQuery}
              performanceFilter={campaignPerformanceFilter}
              setPerformanceFilter={updateCampaignPerformanceFilter}
              level={level}
              setLevel={updateLevel}
              rows={visibleCampaigns}
              page={campaignPage}
              setPage={setCampaignPage}
              selectedIds={selectedCampaignIds}
              setSelectedIds={setSelectedCampaignIds}
              columns={campaignColumns}
              setColumns={setCampaignColumns}
              onExport={() => void exportCsv()}
              onExportSelected={() => void exportCsv(true)}
              onShowSales={showCampaignSales}
              onToast={setToast}
              demo={authState === "demo"}
              live={authState === "authenticated"}
              onSync={requestSync}
              syncing={syncing}
              loading={dashboardLoading}
              error={dashboardError}
              onRetry={() => setDataRefresh((value) => value + 1)}
            />
          )}
          {page === "funnel" && (
            <FunnelPage
              period={period}
              setPeriod={updatePeriod}
              dateRange={dateRange}
              onDateRangeApply={applyDateRange}
              accountFilter={accountFilter}
              setAccountFilter={setAccountFilter}
              accountOptions={adAccountList}
              metrics={
                authState === "authenticated" ? liveFunnel : demoFunnelMetrics
              }
              demo={authState === "demo"}
              loading={funnelLoading}
              error={funnelError}
              onRetry={() => setDataRefresh((value) => value + 1)}
              onSync={requestSync}
              onReconcile={requestReconciliation}
              syncing={syncing}
              reconciling={reconciling}
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
              query={salesQuery}
              setQuery={updateSalesQuery}
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
              selectedPlatform={integrationTab}
              onPlatformChange={setIntegrationTab}
              onSync={requestSync}
              syncing={syncing}
              onToast={setToast}
              onHelp={() => setHelpOpen(true)}
            />
          )}
          {page === "security" && <SecurityPage onToast={setToast} />}
        </main>
        <footer className="app-footer">
          <span>
            selfmetric<span className="brand-period">.</span>{" "}
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

type OverviewPageProps = {
  period: Period
  setPeriod: (period: Period) => void
  dateRange: DateRange
  onDateRangeApply: (range: DateRange) => void
  accountFilter: string
  setAccountFilter: (account: string) => void
  productFilter: string
  productOptions: string[]
  setProductFilter: (product: string) => void
  gatewayFilter: Gateway
  setGatewayFilter: (gateway: Gateway) => void
  chartMode: "Receita" | "Investimento"
  setChartMode: (mode: "Receita" | "Investimento") => void
  totals: DashboardTotals
  accountOptions: AdAccount[]
  dailyData?: Array<{ label: string; spend: number; revenue: number }>
  demo: boolean
  onSync: () => void
  syncing: boolean
  loading: boolean
  error: string
  onRetry: () => void
}

type CampaignsPageProps = {
  period: Period
  setPeriod: (period: Period) => void
  dateRange: DateRange
  onDateRangeApply: (range: DateRange) => void
  accountFilter: string
  setAccountFilter: (account: string) => void
  accountOptions: AdAccount[]
  productFilter: string
  productOptions: string[]
  setProductFilter: (product: string) => void
  gatewayFilter: Gateway
  setGatewayFilter: (gateway: Gateway) => void
  query: string
  setQuery: (query: string) => void
  performanceFilter: CampaignPerformanceFilter
  setPerformanceFilter: (filter: CampaignPerformanceFilter) => void
  level: Level
  setLevel: (level: Level) => void
  rows: Campaign[]
  page: number
  setPage: (page: number) => void
  selectedIds: string[]
  setSelectedIds: (ids: string[]) => void
  columns: Record<CampaignColumn, boolean>
  setColumns: (columns: Record<CampaignColumn, boolean>) => void
  onExport: () => void
  onExportSelected: () => void
  onShowSales: (campaign: Campaign) => void
  onToast: (message: string) => void
  demo: boolean
  live: boolean
  onSync: () => void
  syncing: boolean
  loading: boolean
  error: string
  onRetry: () => void
}

type FunnelPageProps = {
  period: Period
  setPeriod: (period: Period) => void
  dateRange: DateRange
  onDateRangeApply: (range: DateRange) => void
  accountFilter: string
  setAccountFilter: (account: string) => void
  accountOptions: AdAccount[]
  metrics: FunnelMetrics | null
  demo: boolean
  loading: boolean
  error: string
  onRetry: () => void
  onSync: () => void
  onReconcile: () => void
  syncing: boolean
  reconciling: boolean
}

const funnelStageLabels = [
  { title: "Viu o anúncio", label: "Impressões", source: "Meta Ads" },
  { title: "Clicou", label: "Cliques", source: "Meta Ads" },
  {
    title: "Viu a página",
    label: "Visualizações da página",
    source: "Evento PageView",
  },
  {
    title: "Chegou ao checkout",
    label: "Checkouts iniciados",
    source: "Evento InitiateCheckout",
  },
  {
    title: "Efetuou a compra",
    label: "Compras atribuídas",
    source: "Hotmart / Kiwify",
  },
] as const

function FunnelPage(props: FunnelPageProps) {
  const values: Array<number | null> = props.metrics
    ? [
        props.metrics.impressions,
        props.metrics.clicks,
        props.metrics.landingPageViews,
        props.metrics.checkouts,
        props.metrics.purchases,
      ]
    : [null, null, null, null, null]
  const impressions = values[0] ?? 0
  const pixelEventsMissing =
    props.metrics !== null &&
    (props.metrics.landingPageViews === null ||
      props.metrics.landingPageViews === 0 ||
      props.metrics.checkouts === null ||
      props.metrics.checkouts === 0)

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> CONVERSÃO{" "}
            <span className="eyebrow-period">
              · {formatRange(props.dateRange)}
            </span>
          </div>
          <h1>
            Funil<span className="heading-period">.</span>
          </h1>
          <p>Veja em quais etapas o tráfego avança até virar compra.</p>
        </div>
        <div className="heading-actions funnel-heading-actions">
          <Button
            className="dashboard-action dashboard-action-secondary"
            onClick={props.onReconcile}
            disabled={props.syncing || props.reconciling}
            size="lg"
            variant="outline"
          >
            <RefreshCw
              className={props.reconciling ? "spin" : ""}
              data-icon="inline-start"
            />
            {props.reconciling ? "Buscando vendas…" : "Reconciliar vendas"}
          </Button>
          <Button
            className="dashboard-action"
            onClick={props.onSync}
            disabled={props.syncing || props.reconciling}
            size="lg"
          >
            <RefreshCw
              className={props.syncing ? "spin" : ""}
              data-icon="inline-start"
            />
            {props.syncing ? "Atualizando…" : "Atualizar anúncios"}
          </Button>
        </div>
      </div>

      {props.demo && (
        <Alert className="demo-notice">
          <span className="notice-spark">
            <Sparkles size={15} />
          </span>
          <div className="demo-notice-copy">
            <AlertTitle>Funil de demonstração</AlertTitle>
            <AlertDescription>
              Os números exibidos são fictícios e servem apenas como exemplo.
            </AlertDescription>
          </div>
          <AlertAction className="demo-notice-action">
            <Button
              onClick={() =>
                window.dispatchEvent(new CustomEvent("navigate-integrations"))
              }
              size="sm"
              variant="link"
            >
              Configurar integrações <ArrowRight data-icon="inline-end" />
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div className="filter-bar funnel-date-filter">
        <PeriodSelector
          ariaLabel="Período do funil"
          onDateRangeApply={props.onDateRangeApply}
          onPeriodChange={props.setPeriod}
          period={props.period}
          value={props.dateRange}
        />
        <div className="filter-divider" />
        <div className="select-filter">
          <span>Conta</span>
          <FilterSelect
            ariaLabel="Filtrar funil por conta"
            value={props.accountFilter}
            onValueChange={props.setAccountFilter}
            className="select-filter-control"
            options={[
              { value: "all", label: "Todas as contas" },
              ...props.accountOptions.map((account) => ({
                value: account.id,
                label: account.name,
              })),
            ]}
          />
        </div>
      </div>

      {props.error && (
        <Alert className="inline-error" variant="destructive">
          <AlertTitle>Não foi possível carregar o funil</AlertTitle>
          <AlertDescription>{props.error}</AlertDescription>
          <AlertAction>
            <Button onClick={props.onRetry} size="sm" variant="outline">
              Tentar novamente
            </Button>
          </AlertAction>
        </Alert>
      )}

      <Card className="funnel-card">
        <CardHeader>
          <CardTitle>Etapas do funil</CardTitle>
          <CardDescription>
            A porcentagem principal mostra a conversão em relação à etapa
            anterior.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="funnel-stage-list" aria-label="Etapas de conversão">
            {funnelStageLabels.map((stage, index) => {
              const current = values[index] ?? null
              const previous = index > 0 ? (values[index - 1] ?? null) : null
              const conversion =
                index > 0 ? funnelConversion(current, previous) : null
              const overall = funnelConversion(current, impressions)
              const barWidth =
                current === null || impressions <= 0
                  ? 0
                  : Math.min((current / impressions) * 100, 100)
              const countLabel =
                props.loading && !props.metrics
                  ? "Carregando…"
                  : current === null
                    ? "—"
                    : numberFormat.format(current)

              return (
                <li key={stage.title}>
                  <Card className="funnel-stage-card">
                    <CardHeader>
                      <div>
                        <CardDescription>
                          ETAPA {String(index + 1).padStart(2, "0")}
                        </CardDescription>
                        <CardTitle>{stage.title}</CardTitle>
                      </div>
                      <Badge variant="secondary">
                        {index === 0
                          ? impressions > 0
                            ? "Base"
                            : "—"
                          : current === null
                            ? "Sem dado"
                            : `${formatFunnelPercent(conversion)} etapa anterior`}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <strong className="funnel-stage-count">
                        {countLabel}
                      </strong>
                      <span className="funnel-stage-label">{stage.label}</span>
                      <div className="funnel-stage-track" aria-hidden="true">
                        <span style={{ width: `${barWidth}%` }} />
                      </div>
                      <div className="funnel-stage-meta">
                        <span>{stage.source}</span>
                        {index === 0 ? (
                          <span>{impressions > 0 ? "100% do funil" : "—"}</span>
                        ) : (
                          <span>{formatFunnelPercent(overall)} do topo</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      <Alert className="funnel-source-note">
        <AlertTitle>
          {pixelEventsMissing
            ? "Não há eventos de página e checkout neste período"
            : "De onde vêm os números"}
        </AlertTitle>
        <AlertDescription>
          Impressões e cliques vêm da Meta. Visualização de página e início de
          checkout dependem dos eventos <code>PageView</code> e{" "}
          <code>InitiateCheckout</code> do Pixel. Compras vêm das vendas
          atribuídas da Hotmart e Kiwify; elas precisam ter IDs de campanha e
          vínculo com uma conta Meta. Configure os eventos no Pixel e atualize
          os anúncios se esperava ver essas etapas neste período.
        </AlertDescription>
      </Alert>
    </>
  )
}

function OverviewPage(props: OverviewPageProps) {
  const accountName = props.accountOptions.find(
    (account) => account.id === props.accountFilter
  )?.name
  const chartData = useMemo(() => {
    if (props.dailyData) return props.dailyData

    const dayCount = Math.max(1, Math.min(120, daysBetween(props.dateRange)))
    const sourcePoints = Array.from(
      { length: dayCount },
      (_, index) => dailyMetrics[index % dailyMetrics.length]
    )
    const spendWeight =
      sourcePoints.reduce((sum, point) => sum + point.spend, 0) || 1
    const revenueWeight =
      sourcePoints.reduce((sum, point) => sum + point.revenue, 0) || 1
    const date = new Date(`${props.dateRange.from}T00:00:00.000Z`)

    return sourcePoints.map((point, index) => {
      const pointDate = new Date(date)
      pointDate.setUTCDate(pointDate.getUTCDate() + index)
      return {
        label: pointDate.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          timeZone: "UTC",
        }),
        spend: (point.spend / spendWeight) * props.totals.spend,
        revenue: (point.revenue / revenueWeight) * props.totals.revenue,
      }
    })
  }, [
    props.dailyData,
    props.dateRange,
    props.totals.revenue,
    props.totals.spend,
  ])

  function exportChartData() {
    downloadCsv(
      "performance-diaria",
      ["data", "investimento_brl", "receita_brl"],
      chartData.map((point) => [point.label, point.spend, point.revenue])
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
          <Button
            className="dashboard-action"
            onClick={props.onSync}
            disabled={props.syncing}
            size="lg"
          >
            <RefreshCw
              className={props.syncing ? "spin" : ""}
              data-icon="inline-start"
            />
            {props.syncing ? "Atualizando…" : "Atualizar anúncios"}
          </Button>
        </div>
      </div>

      {props.demo && (
        <Alert className="demo-notice">
          <span className="notice-spark">
            <Sparkles size={15} />
          </span>
          <div className="demo-notice-copy">
            <AlertTitle>Dados de demonstração</AlertTitle>
            <AlertDescription>
              Conecte suas contas para acompanhar resultados reais.
            </AlertDescription>
          </div>
          <AlertAction className="demo-notice-action">
            <Button
              onClick={() =>
                window.dispatchEvent(new CustomEvent("navigate-integrations"))
              }
              size="sm"
              variant="link"
            >
              Configurar agora
              <ArrowRight data-icon="inline-end" />
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div className="filter-bar">
        <PeriodSelector
          ariaLabel="Período"
          onDateRangeApply={props.onDateRangeApply}
          onPeriodChange={props.setPeriod}
          period={props.period}
          value={props.dateRange}
        />
        <div className="filter-divider" />
        <div className="select-filter">
          <span>Conta</span>
          <FilterSelect
            ariaLabel="Filtrar por conta"
            value={props.accountFilter}
            onValueChange={props.setAccountFilter}
            className="select-filter-control"
            options={[
              { value: "all", label: "Todas as contas" },
              ...props.accountOptions.map((account) => ({
                value: account.id,
                label: account.name,
              })),
            ]}
          />
        </div>
        <div className="filter-divider filter-divider-small" />
        <div className="select-filter product-filter">
          <span>Produto</span>
          <FilterSelect
            ariaLabel="Filtrar por produto"
            value={props.productFilter}
            onValueChange={props.setProductFilter}
            className="select-filter-control"
            options={[
              { value: "Todos os produtos", label: "Todos os produtos" },
              ...props.productOptions.map((product) => ({
                value: product,
                label: product,
              })),
            ]}
          />
        </div>
        <div className="filter-divider filter-divider-small" />
        <div className="select-filter gateway-filter">
          <span>Gateway</span>
          <FilterSelect
            ariaLabel="Filtrar por gateway"
            value={props.gatewayFilter}
            onValueChange={(value) => props.setGatewayFilter(value as Gateway)}
            className="select-filter-control"
            options={[
              { value: "Todos os gateways", label: "Todos os gateways" },
              { value: "Hotmart", label: "Hotmart" },
              { value: "Kiwify", label: "Kiwify" },
            ]}
          />
        </div>
      </div>

      {props.error && (
        <Alert className="inline-error" variant="destructive">
          <AlertDescription>{props.error}</AlertDescription>
          <Button onClick={props.onRetry} size="sm" variant="outline">
            Tentar novamente
          </Button>
        </Alert>
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
          icon={<Wallet size={16} />}
          iconStyle="sage"
        />
        <MetricCard
          label="Receita líquida"
          value={currency.format(props.totals.revenue)}
          detail="Valor das vendas aprovadas; reembolsos e chargebacks excluídos"
          icon={<CircleDollarIcon />}
          iconStyle="lime"
        />
        <MetricCard
          label="Lucro estimado"
          value={preciseCurrency.format(props.totals.profit)}
          detail="Receita menos investimento e impostos estimados"
          icon={<PiggyBank size={17} />}
          iconStyle="sage"
        />
        <MetricCard
          label="ROAS"
          value={
            props.totals.roas === null
              ? "—"
              : `${props.totals.roas.toFixed(2).replace(".", ",")}x`
          }
          detail="Receita líquida ÷ investimento em anúncios"
          icon={<BarChart3 size={16} />}
          iconStyle="lavender"
        />
        <MetricCard
          label="ROI"
          value={
            props.totals.roi === null
              ? "—"
              : `${(props.totals.roi * 100).toFixed(1).replace(".", ",")}%`
          }
          detail="Lucro após impostos ÷ investimento com imposto sobre anúncios"
          icon={<ArrowUpRight size={17} />}
          iconStyle="coral"
        />
        <MetricCard
          iconStyle="sage"
          label="Taxa de reembolso"
          value={`${formatPercent(props.totals.refundRate)}%`}
          detail={`${numberFormat.format(props.totals.refunds)} pedidos reembolsados entre as vendas finalizadas`}
          icon={<RotateCcw size={16} />}
        />
        <MetricCard
          iconStyle="sage"
          label="Receita reembolsada"
          value={preciseCurrency.format(props.totals.refundedRevenue)}
          detail="Valor dos pedidos reembolsados no período"
          icon={<ArrowDownRight size={16} />}
        />
        <MetricCard
          iconStyle="sage"
          label="ARPU"
          value={
            props.totals.arpu === null
              ? "—"
              : preciseCurrency.format(props.totals.arpu)
          }
          detail="Receita líquida por venda aprovada; aproximação por pedido"
          icon={<UserRound size={16} />}
        />
        <MetricCard
          iconStyle="sage"
          label="Chargebacks"
          value={numberFormat.format(props.totals.chargebacks)}
          detail={`${preciseCurrency.format(props.totals.chargebackRevenue)} em valor contestado`}
          icon={<ShoppingBag size={16} />}
        />
        <MetricCard
          iconStyle="sage"
          label={`Imposto sobre anúncios · ${formatPercent(AD_TAX_RATE * 100)}%`}
          value={preciseCurrency.format(props.totals.adTax)}
          detail="Estimativa aplicada sobre o investimento em anúncios"
          icon={<Receipt size={16} />}
        />
        <MetricCard
          iconStyle="sage"
          label={`Imposto sobre produtos · ${formatPercent(PRODUCT_TAX_RATE * 100)}%`}
          value={preciseCurrency.format(props.totals.productTax)}
          detail="Estimativa aplicada sobre a receita líquida"
          icon={<Receipt size={16} />}
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
        <Card className="panel performance-panel">
          <CardHeader className="panel-header chart-header">
            <div>
              <div className="panel-kicker">RESULTADO AO LONGO DO TEMPO</div>
              <h2>Ritmo de performance</h2>
            </div>
            <div className="chart-actions">
              <ToggleGroup
                aria-label="Métrica do gráfico"
                className="chart-switch"
                onValueChange={(selected) => {
                  if (selected[0]) {
                    props.setChartMode(
                      selected[0] as "Receita" | "Investimento"
                    )
                  }
                }}
                value={[props.chartMode]}
              >
                <ToggleGroupItem value="Receita">Receita</ToggleGroupItem>
                <ToggleGroupItem value="Investimento">
                  Investimento
                </ToggleGroupItem>
              </ToggleGroup>
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
          </CardHeader>
          <CardContent className="performance-panel-content">
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
              data={chartData}
            />
            <div className="chart-footer">
              <span>{chartBoundary(props.dateRange, "start")}</span>
              <span>{chartBoundary(props.dateRange, "middle")}</span>
              <span>{chartBoundary(props.dateRange, "end")}</span>
              <span className="chart-timezone">
                Fuso:{" "}
                {accountName
                  ? props.accountOptions.find(
                      (item) => item.name === accountName
                    )?.timezone
                  : "Horário da conta"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="disclaimer">
        <Clock3 size={14} /> O lucro e o ROI incluem estimativas de 12,5% sobre
        anúncios e 6% sobre a receita líquida. ARPU usa vendas aprovadas como
        aproximação de usuários.
      </div>
    </>
  )
}

function CampaignSummaryCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className="campaign-summary-card">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <strong>{value}</strong>
        <span>{detail}</span>
      </CardContent>
    </Card>
  )
}

function CampaignsPage(props: CampaignsPageProps) {
  const periodFactor = props.live ? 1 : props.period / 14
  const spend =
    props.rows.reduce((sum, row) => sum + row.spend, 0) * periodFactor
  const revenue =
    props.rows.reduce((sum, row) => sum + row.revenue, 0) * periodFactor
  const orders =
    props.rows.reduce((sum, row) => sum + row.sales, 0) * periodFactor
  const performance = calculateNetPerformance(spend, revenue)
  const entityCount =
    props.live || props.level === "Campanhas"
      ? props.rows.length
      : props.rows.reduce(
          (sum, row) => sum + Math.max(1, row.adsets?.length ?? 1),
          0
        )

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> META ADS{" "}
            <span className="eyebrow-period">
              · {formatRange(props.dateRange)}
            </span>
          </div>
          <h1>
            Campanhas<span className="heading-period">.</span>
          </h1>
          <p>Compare resultados e abra cada item no Meta Ads.</p>
        </div>
        <div className="heading-actions campaigns-heading-actions">
          {props.selectedIds.length > 0 && (
            <Button
              className="dashboard-action dashboard-action-secondary"
              onClick={props.onExportSelected}
              size="lg"
              variant="outline"
            >
              <Download data-icon="inline-start" />
              Exportar {props.selectedIds.length} selecionadas
            </Button>
          )}
          <Button
            className="dashboard-action dashboard-action-secondary"
            onClick={props.onExport}
            size="lg"
            variant="outline"
          >
            <Download data-icon="inline-start" /> Exportar CSV
          </Button>
          <Button
            className="dashboard-action"
            onClick={props.onSync}
            disabled={props.syncing}
            size="lg"
          >
            <RefreshCw
              className={props.syncing ? "spin" : ""}
              data-icon="inline-start"
            />
            {props.syncing ? "Atualizando…" : "Atualizar anúncios"}
          </Button>
        </div>
      </div>

      {props.demo && (
        <Alert className="demo-notice">
          <span className="notice-spark">
            <Megaphone size={16} />
          </span>
          <div className="demo-notice-copy">
            <AlertTitle>Campanhas de demonstração</AlertTitle>
            <AlertDescription>
              Conecte uma conta Meta para consultar campanhas e anúncios reais.
            </AlertDescription>
          </div>
          <AlertAction className="demo-notice-action">
            <Button
              onClick={() =>
                window.dispatchEvent(new CustomEvent("navigate-integrations"))
              }
              size="sm"
              variant="link"
            >
              Conectar conta <ArrowRight data-icon="inline-end" />
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div className="filter-bar campaign-date-filter">
        <PeriodSelector
          ariaLabel="Período das campanhas"
          onDateRangeApply={props.onDateRangeApply}
          onPeriodChange={props.setPeriod}
          period={props.period}
          value={props.dateRange}
        />
      </div>

      <section className="campaign-summary-grid" aria-label="Resumo da seleção">
        <CampaignSummaryCard
          label="Entidades"
          value={numberFormat.format(entityCount)}
          detail={`${props.level.toLocaleLowerCase("pt-BR")} no filtro atual`}
        />
        <CampaignSummaryCard
          label="Investimento"
          value={preciseCurrency.format(spend)}
          detail="Total no período selecionado"
        />
        <CampaignSummaryCard
          label="Receita líquida"
          value={preciseCurrency.format(revenue)}
          detail="Atribuída às entidades listadas"
        />
        <CampaignSummaryCard
          label="ROAS consolidado"
          value={
            performance.roas === null
              ? "—"
              : `${performance.roas.toFixed(2).replace(".", ",")}x`
          }
          detail={`${numberFormat.format(orders)} vendas aprovadas atribuídas`}
        />
      </section>

      <section
        className="campaign-filter-panel"
        aria-label="Filtros de campanhas"
      >
        <div className="campaign-filter-heading">
          <Filter size={17} />
          <strong>Filtrar resultados</strong>
        </div>
        <div className="campaign-filters">
          <FilterSelect
            ariaLabel="Filtrar campanhas por conta"
            value={props.accountFilter}
            onValueChange={props.setAccountFilter}
            className="campaign-filter-control"
            options={[
              { value: "all", label: "Todas as contas" },
              ...props.accountOptions.map((account) => ({
                value: account.id,
                label: account.name,
              })),
            ]}
          />
          <FilterSelect
            ariaLabel="Filtrar campanhas por produto"
            value={props.productFilter}
            onValueChange={props.setProductFilter}
            className="campaign-filter-control"
            options={[
              { value: "Todos os produtos", label: "Todos os produtos" },
              ...props.productOptions.map((product) => ({
                value: product,
                label: product,
              })),
            ]}
          />
          <FilterSelect
            ariaLabel="Filtrar campanhas por gateway"
            value={props.gatewayFilter}
            onValueChange={(value) => props.setGatewayFilter(value as Gateway)}
            className="campaign-filter-control"
            options={[
              { value: "Todos os gateways", label: "Todos os gateways" },
              { value: "Hotmart", label: "Hotmart" },
              { value: "Kiwify", label: "Kiwify" },
            ]}
          />
          <FilterSelect
            ariaLabel="Filtrar campanhas pelo resultado"
            value={props.performanceFilter}
            onValueChange={(value) =>
              props.setPerformanceFilter(value as CampaignPerformanceFilter)
            }
            className="campaign-filter-control"
            options={[
              { value: "all", label: "Todos os resultados" },
              { value: "with-sales", label: "Com vendas" },
              { value: "without-sales", label: "Sem vendas" },
            ]}
          />
          <div className="table-search campaign-search">
            <Search size={17} />
            <Input
              aria-label="Buscar campanha, conjunto ou anúncio"
              placeholder="Buscar por nome ou ID"
              value={props.query}
              onChange={(event) => props.setQuery(event.target.value)}
            />
          </div>
        </div>
      </section>

      {props.error && (
        <Alert className="inline-error" variant="destructive">
          <AlertDescription>{props.error}</AlertDescription>
          <Button onClick={props.onRetry} size="sm" variant="outline">
            Tentar novamente
          </Button>
        </Alert>
      )}
      {props.loading && (
        <div aria-live="polite" className="loading-note">
          <RefreshCw className="spin" size={15} /> Atualizando dados do período…
        </div>
      )}

      <Card className="panel campaigns-panel">
        <CardHeader className="panel-header campaign-header">
          <div>
            <div className="panel-kicker">ESTRUTURA DE ANÚNCIOS</div>
            <h2>
              {props.level}{" "}
              <Badge className="table-count" variant="secondary">
                {entityCount}
              </Badge>
            </h2>
          </div>
          <div className="campaign-level-tools">
            <ToggleGroup
              aria-label="Nível de detalhamento"
              className="level-switch"
              onValueChange={(selected) => {
                if (selected[0]) props.setLevel(selected[0] as Level)
              }}
              value={[props.level]}
            >
              {(["Campanhas", "Conjuntos", "Anúncios"] as Level[]).map(
                (tab) => (
                  <ToggleGroupItem key={tab} value={tab}>
                    {tab}
                  </ToggleGroupItem>
                )
              )}
            </ToggleGroup>
            <Popover
              label="Configurar colunas da tabela"
              trigger={<Settings2 size={18} />}
              triggerClassName="icon-button subtle-icon settings-filter"
              panelClassName="column-menu"
            >
              {() => (
                <div className="column-menu-content">
                  <strong>Colunas visíveis</strong>
                  {campaignColumnOptions.map(([key, label]) => (
                    <label key={key}>
                      <input
                        checked={props.columns[key]}
                        onChange={(event) =>
                          props.setColumns({
                            ...props.columns,
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
        </CardHeader>
        {props.selectedIds.length > 0 && (
          <div className="selection-toolbar">
            <span>{props.selectedIds.length} entidade(s) selecionada(s)</span>
            <button onClick={props.onExportSelected} type="button">
              <Download size={15} /> Exportar selecionadas
            </button>
            <button onClick={() => props.setSelectedIds([])} type="button">
              Limpar seleção
            </button>
          </div>
        )}
        <CardContent className="campaigns-panel-content">
          <CampaignTable
            rows={props.rows}
            level={props.level}
            period={props.period}
            accounts={props.accountOptions}
            live={props.live}
            page={props.page}
            setPage={props.setPage}
            selectedIds={props.selectedIds}
            setSelectedIds={props.setSelectedIds}
            columns={props.columns}
            onShowSales={props.onShowSales}
            onToast={props.onToast}
          />
        </CardContent>
      </Card>
      <div className="disclaimer">
        <ExternalLink size={14} /> A pausa e a edição continuam no Meta Ads; o
        menu de cada linha abre a entidade diretamente lá.
      </div>
    </>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  iconStyle,
}: {
  label: string
  value: string
  detail: string
  icon: React.ReactNode
  iconStyle: string
}) {
  return (
    <Card className="metric-card">
      <CardHeader className="metric-card-top">
        <CardTitle className="metric-label">
          {label}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label={`Sobre ${label}`}
                  className="metric-info"
                  type="button"
                >
                  i
                </button>
              }
            />
            <TooltipContent>{detail}</TooltipContent>
          </Tooltip>
        </CardTitle>
        <CardAction>
          <span className={`metric-icon ${iconStyle}`}>{icon}</span>
        </CardAction>
      </CardHeader>
      <CardContent className="metric-card-content">
        <div className="metric-value">{value}</div>
        <div className="metric-card-bottom">
          <span className="metric-comparison">no período selecionado</span>
        </div>
      </CardContent>
    </Card>
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
  const yLabels = [1, 0.75, 0.5, 0.25, 0].map((ratio) =>
    compactCurrency.format(max * ratio)
  )
  const coords = values.map((value, index) => ({
    x: 40 + (index / Math.max(values.length - 1, 1)) * 700,
    y: 18 + (1 - value / max) * 138,
  }))
  const line = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ")
  const area = `${line} L${coords.at(-1)?.x ?? 740},170 L40,170 Z`
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
        <path
          d={area}
          className={
            mode === "Receita" ? "chart-area-revenue" : "chart-area-spend"
          }
          fillOpacity=".11"
        />
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
          (campaign.adsets?.length ? campaign.adsets : [campaign.name]).map(
            (name, index) => ({
              campaign,
              name:
                level === "Anúncios" ? `${name} · Criativo ${index + 1}` : name,
              id: `${campaign.id}-${index}`,
              scale: 0.5,
            })
          )
        )
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(expandedRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = expandedRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )
  const pageEntityIds = [...new Set(pageRows.map((row) => row.id))]
  const allSelected =
    pageEntityIds.length > 0 &&
    pageEntityIds.every((id) => selectedIds.includes(id))

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
        ? [...new Set([...selectedIds, ...pageEntityIds])]
        : selectedIds.filter((id) => !pageEntityIds.includes(id))
    )
  }

  if (!rows.length)
    return (
      <Empty className="empty-state">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Search />
          </EmptyMedia>
          <EmptyTitle>Nenhum item encontrado</EmptyTitle>
          <EmptyDescription>
            Tente ajustar os filtros para ampliar os resultados.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <>
      <Table
        className="data-table campaign-table"
        containerClassName="table-scroll"
      >
        <TableHeader>
          <TableRow>
            <TableHead className="check-cell">
              <input
                aria-label={`Selecionar todos os itens desta página de ${level.toLocaleLowerCase("pt-BR")}`}
                checked={allSelected}
                onChange={(event) => togglePage(event.target.checked)}
                type="checkbox"
              />
            </TableHead>
            <TableHead className="campaign-name-head">
              {level === "Campanhas"
                ? "Campanha"
                : level === "Conjuntos"
                  ? "Conjunto de anúncios"
                  : "Anúncio"}
            </TableHead>
            {columns.account && <TableHead>Conta de anúncio</TableHead>}
            {columns.spend && <TableHead>Investimento</TableHead>}
            {columns.sales && <TableHead>Vendas</TableHead>}
            {columns.revenue && <TableHead>Receita líquida</TableHead>}
            {columns.profit && <TableHead>Lucro est.</TableHead>}
            {columns.roas && <TableHead>ROAS</TableHead>}
            {columns.cpa && <TableHead>CPA</TableHead>}
            {columns.cpc && <TableHead>CPC</TableHead>}
            {columns.cpm && <TableHead>CPM</TableHead>}
            {columns.ctr && <TableHead>CTR</TableHead>}
            <TableHead aria-label="Ações" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map(({ campaign, name, id, scale: rowScale }, index) => {
            const factor = live ? 1 : (period / 14) * rowScale
            const spend = campaign.spend * factor
            const revenue = campaign.revenue * factor
            const rowOrders = Math.round(campaign.sales * factor)
            const clicks = campaign.clicks * factor
            const impressions = campaign.impressions * factor
            const rowProfit = calculateNetPerformance(spend, revenue).profit
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
              <TableRow key={id}>
                <TableCell className="check-cell">
                  <input
                    aria-label={`Selecionar campanha ${name}`}
                    checked={selectedIds.includes(id)}
                    onChange={(event) =>
                      toggleCampaign(id, event.target.checked)
                    }
                    type="checkbox"
                  />
                </TableCell>
                <TableCell>
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
                </TableCell>
                {columns.account && (
                  <TableCell>
                    <div className="account-cell">
                      <Avatar className="table-avatar" size="sm">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <span>
                        {account?.name ??
                          campaign.accountName ??
                          campaign.accountId}
                      </span>
                    </div>
                  </TableCell>
                )}
                {columns.spend && (
                  <TableCell className="numeric-cell">
                    {currency.format(spend)}
                  </TableCell>
                )}
                {columns.sales && (
                  <TableCell className="numeric-cell">
                    {numberFormat.format(rowOrders)}
                  </TableCell>
                )}
                {columns.revenue && (
                  <TableCell className="numeric-cell revenue-cell">
                    {currency.format(revenue)}
                  </TableCell>
                )}
                {columns.profit && (
                  <TableCell className="numeric-cell">
                    {preciseCurrency.format(rowProfit)}
                  </TableCell>
                )}
                {columns.roas && (
                  <TableCell>
                    <Badge
                      className="roas-badge"
                      variant={
                        roas !== null && roas >= 3 ? "default" : "secondary"
                      }
                    >
                      {roas === null
                        ? "—"
                        : `${roas.toFixed(2).replace(".", ",")}x`}
                    </Badge>
                  </TableCell>
                )}
                {columns.cpa && (
                  <TableCell className="numeric-cell">
                    {rowOrders > 0
                      ? preciseCurrency.format(spend / rowOrders)
                      : "—"}
                  </TableCell>
                )}
                {columns.cpc && (
                  <TableCell className="numeric-cell">
                    {clicks > 0 ? preciseCurrency.format(spend / clicks) : "—"}
                  </TableCell>
                )}
                {columns.cpm && (
                  <TableCell className="numeric-cell">
                    {impressions > 0
                      ? preciseCurrency.format((spend / impressions) * 1000)
                      : "—"}
                  </TableCell>
                )}
                {columns.ctr && (
                  <TableCell className="numeric-cell">
                    {impressions > 0
                      ? `${((clicks / impressions) * 100).toFixed(2).replace(".", ",")}%`
                      : "—"}
                  </TableCell>
                )}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label={`Opções para ${name}`}
                          className="row-menu"
                          size="icon"
                          variant="ghost"
                        >
                          <MoreHorizontal />
                        </Button>
                      }
                    />
                    <DropdownMenuContent
                      align="end"
                      className="row-action-menu"
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>
                          Ações de {level.toLocaleLowerCase("pt-BR")}
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => void copyCampaignId(id, onToast)}
                        >
                          <Copy data-icon="inline-start" /> Copiar ID
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            onShowSales(
                              live ? { ...campaign, id, name } : campaign
                            )
                          }
                        >
                          <ShoppingBag data-icon="inline-start" />
                          Ver vendas atribuídas
                        </DropdownMenuItem>
                        {live && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() =>
                                openMetaAds(
                                  campaign.accountId,
                                  id,
                                  level,
                                  onToast
                                )
                              }
                            >
                              <ExternalLink data-icon="inline-start" />
                              Abrir no Meta Ads
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
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
          <Button
            className="dashboard-action dashboard-action-secondary"
            onClick={props.onExport}
            size="lg"
            variant="outline"
          >
            <Download data-icon="inline-start" /> Exportar
          </Button>
          <Button
            className="dashboard-action"
            onClick={props.onReconcile}
            disabled={props.reconciling}
            size="lg"
          >
            <RefreshCw
              className={props.reconciling ? "spin" : ""}
              data-icon="inline-start"
            />
            {props.reconciling ? "Buscando…" : "Reconciliar vendas"}
          </Button>
        </div>
      </div>
      {props.demo && (
        <Alert className="demo-notice">
          <span className="notice-spark">
            <Sparkles size={15} />
          </span>
          <div className="demo-notice-copy">
            <AlertTitle>Dados de demonstração</AlertTitle>
            <AlertDescription>
              Pedidos reais chegam pelos webhooks e pela reconciliação dos
              gateways.
            </AlertDescription>
          </div>
          <AlertAction className="demo-notice-action">
            <Button
              onClick={() =>
                window.dispatchEvent(new CustomEvent("navigate-integrations"))
              }
              size="sm"
              variant="link"
            >
              Configurar gateways
              <ArrowRight data-icon="inline-end" />
            </Button>
          </AlertAction>
        </Alert>
      )}
      <div className="sales-summary-grid">
        <Card className="sales-summary-card">
          <CardHeader className="sales-summary-header">
            <CardTitle>Pedidos no período</CardTitle>
          </CardHeader>
          <CardContent>
            <strong className="sales-summary-value">
              {summary?.total ?? 0}
            </strong>
            <CardDescription>
              {summary?.approved ?? 0} aprovados
            </CardDescription>
          </CardContent>
        </Card>
        <Card className="sales-summary-card">
          <CardHeader className="sales-summary-header">
            <CardTitle>Receita aprovada</CardTitle>
          </CardHeader>
          <CardContent>
            <strong className="sales-summary-value">
              {currency.format(summary?.approvedRevenue ?? 0)}
            </strong>
            <CardDescription>
              {summary?.approvedAmountCount !== summary?.approved
                ? "Valores convertidos para BRL"
                : "Reembolsos e chargebacks excluídos"}
            </CardDescription>
          </CardContent>
        </Card>
        <Card className="sales-summary-card">
          <CardHeader className="sales-summary-header">
            <CardTitle>Com atribuição</CardTitle>
          </CardHeader>
          <CardContent>
            <strong className="sales-summary-value">
              {summary?.matched ?? 0} <em>/ {summary?.total ?? 0}</em>
            </strong>
            <CardDescription>
              {matchedRate}% vinculados a anúncios
            </CardDescription>
          </CardContent>
        </Card>
        <Card className="sales-summary-card">
          <CardHeader className="sales-summary-header">
            <CardTitle>Ticket médio</CardTitle>
          </CardHeader>
          <CardContent>
            <strong className="sales-summary-value">
              {summary?.averageTicket === null || !summary
                ? "—"
                : currency.format(summary.averageTicket)}
            </strong>
            <CardDescription>Pedidos aprovados convertidos</CardDescription>
          </CardContent>
        </Card>
      </div>
      <Card className="panel sales-panel">
        <CardHeader className="panel-header sales-table-heading">
          <div>
            <div className="panel-kicker">TRANSAÇÕES</div>
            <h2>
              Pedidos recebidos{" "}
              <Badge className="table-count" variant="secondary">
                {props.total}
              </Badge>
            </h2>
          </div>
          <div className="table-tools sales-tools">
            <div className="table-search">
              <Search size={15} />
              <Input
                aria-label="Buscar venda"
                placeholder="Buscar por produto, campanha ou ID..."
                value={props.query}
                onChange={(event) => props.setQuery(event.target.value)}
              />
            </div>
            <FilterSelect
              ariaLabel="Filtrar gateway"
              value={props.gatewayFilter}
              onValueChange={(value) =>
                props.setGatewayFilter(value as Gateway)
              }
              className="inline-filter"
              options={[
                { value: "Todos os gateways", label: "Todos os gateways" },
                { value: "Hotmart", label: "Hotmart" },
                { value: "Kiwify", label: "Kiwify" },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent className="sales-panel-content">
          <div className="sales-filter-row">
            <PeriodSelector
              ariaLabel="Período"
              dateRangeClassName="sales-date-range"
              onDateRangeApply={props.onDateRangeApply}
              onPeriodChange={props.setPeriod}
              period={props.period}
              value={props.dateRange}
            />
            <FilterSelect
              className="inline-filter"
              ariaLabel="Filtrar conta de anúncio"
              value={props.accountFilter}
              onValueChange={props.setAccountFilter}
              options={[
                { value: "all", label: "Todas as contas" },
                ...props.accountOptions.map((account) => ({
                  value: account.id,
                  label: account.name,
                })),
              ]}
            />
            <FilterSelect
              className="inline-filter"
              ariaLabel="Filtrar produto"
              value={props.productFilter}
              onValueChange={props.setProductFilter}
              options={[
                { value: "Todos os produtos", label: "Todos os produtos" },
                ...props.productOptions.map((product) => ({
                  value: product,
                  label: product,
                })),
              ]}
            />
            <FilterSelect
              className="inline-filter"
              ariaLabel="Filtrar status da venda"
              value={props.statusFilter}
              onValueChange={(value) =>
                props.setStatusFilter(value as SaleStatusFilter)
              }
              options={[
                { value: "all", label: "Todos os status" },
                { value: "approved", label: "Aprovadas" },
                { value: "refunded", label: "Reembolsadas" },
                { value: "chargeback", label: "Chargebacks" },
                { value: "pending", label: "Aguardando" },
              ]}
            />
            <FilterSelect
              className="inline-filter"
              ariaLabel="Filtrar atribuição"
              value={props.attributionFilter}
              onValueChange={(value) =>
                props.setAttributionFilter(value as SaleAttributionFilter)
              }
              options={[
                { value: "all", label: "Toda atribuição" },
                { value: "matched", label: "Atribuídas" },
                { value: "unmatched", label: "Sem atribuição" },
              ]}
            />
            <div className="sales-live-note">
              <span /> Atualizado sob demanda
            </div>
          </div>
          {props.error ? (
            <Alert className="inline-error sales-error" variant="destructive">
              <AlertDescription>{props.error}</AlertDescription>
              <Button onClick={props.onRetry} size="sm" variant="outline">
                Tentar novamente
              </Button>
            </Alert>
          ) : props.loading && !props.rows.length ? (
            <div aria-live="polite" className="loading-state">
              <RefreshCw className="spin" size={17} /> Carregando transações…
            </div>
          ) : props.rows.length ? (
            <Table
              className="data-table sales-table"
              containerClassName="table-scroll"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Transação</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Atribuição</TableHead>
                  <TableHead aria-label="Detalhes" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.rows.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <strong className="transaction-id">{sale.id}</strong>
                    </TableCell>
                    <TableCell>
                      <div className="product-cell">
                        <span className="product-mini-icon">
                          <ShoppingBag size={14} />
                        </span>
                        <strong>{sale.product}</strong>
                      </div>
                    </TableCell>
                    <TableCell>
                      <GatewayBadge gateway={sale.gateway} />
                    </TableCell>
                    <TableCell className="date-cell">{sale.date}</TableCell>
                    <TableCell
                      className={
                        "numeric-cell " +
                        (sale.status === "Aprovada" ? "revenue-cell" : "")
                      }
                    >
                      {sale.amountLabel ?? currency.format(sale.amount)}
                    </TableCell>
                    <TableCell>
                      <SaleStatus status={sale.status} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          "attribution-pill " +
                          (sale.matched ? "matched" : "unmatched")
                        }
                        variant={sale.matched ? "secondary" : "outline"}
                      >
                        {sale.matched ? (
                          <>
                            <Link2 data-icon="inline-start" /> {sale.campaign}
                          </>
                        ) : (
                          <>
                            <span /> Sem atribuição
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        aria-label={"Abrir detalhes da transação " + sale.id}
                        className="row-menu"
                        onClick={() => props.onSelectSale(sale)}
                        size="icon"
                        variant="ghost"
                      >
                        <ExternalLink />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="empty-state">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>Nenhuma venda encontrada</EmptyTitle>
                <EmptyDescription>
                  Experimente ajustar período, filtros ou busca.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
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
        </CardContent>
      </Card>
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
  selectedPlatform,
  onPlatformChange,
  onSync,
  syncing,
  onToast,
  onHelp,
}: {
  selectedPlatform: string
  onPlatformChange: (platform: string) => void
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

  async function saveWebhookSettings(
    event: FormEvent<HTMLFormElement>,
    provider: "hotmart" | "kiwify"
  ) {
    event.preventDefault()
    const payload: Record<string, string> = {}
    if (provider === "hotmart" && hotmartWebhookToken.trim())
      payload.hotmartToken = hotmartWebhookToken.trim()
    if (provider === "kiwify" && kiwifyWebhookToken.trim())
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
      if (provider === "hotmart") setHotmartWebhookToken("")
      else setKiwifyWebhookToken("")
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

  function generateKiwifyToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    setKiwifyWebhookToken(
      Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    )
  }

  async function removeWebhook(provider: "hotmart" | "kiwify") {
    if (savingWebhookSettings) return
    setSavingWebhookSettings(true)
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
      if (provider === "hotmart") setHotmartWebhookToken("")
      else setKiwifyWebhookToken("")
      onToast(
        `Token ${provider === "hotmart" ? "Hotmart" : "Kiwify"} removido.`
      )
    } catch {
      onToast("Não foi possível remover o token do webhook.")
    } finally {
      setSavingWebhookSettings(false)
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
          <Button variant="outline" size="lg" onClick={onHelp} type="button">
            <CircleHelp data-icon="inline-start" /> Central de ajuda
          </Button>
        </div>
      </div>
      <Tabs
        value={selectedPlatform}
        onValueChange={(value) => onPlatformChange(String(value))}
        className="integration-tabs"
      >
        <TabsList
          aria-label="Plataforma de integração"
          className="integration-tab-list"
        >
          <TabsTrigger value="meta">Meta Ads</TabsTrigger>
          <TabsTrigger value="hotmart">Hotmart</TabsTrigger>
          <TabsTrigger value="kiwify">Kiwify</TabsTrigger>
        </TabsList>
        <TabsContent value="meta" id="meta-integration">
          <div className="integration-section-heading">
            <h2>Meta Ads</h2>
            <p>Configure seu aplicativo e conecte as contas de anúncio.</p>
          </div>
          <div className="integration-settings-grid">
            <Card className="settings-panel">
              <CardHeader>
                <CardTitle>Aplicativo Meta</CardTitle>
                <CardDescription>
                  Dados do aplicativo criado no Meta for Developers.
                </CardDescription>
                <CardAction>
                  <Badge variant="outline">
                    {metaConfigured ? "Configurado" : "Não configurado"}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <form id="meta-settings" onSubmit={saveMetaSettings}>
                  <FieldGroup>
                    <Field data-disabled={savingMetaSettings}>
                      <FieldLabel htmlFor="meta-app-id">App ID</FieldLabel>
                      <Input
                        id="meta-app-id"
                        autoComplete="off"
                        required
                        disabled={savingMetaSettings}
                        value={metaAppId}
                        onChange={(event) => setMetaAppId(event.target.value)}
                        placeholder="ID do aplicativo"
                      />
                    </Field>
                    <Field data-disabled={savingMetaSettings}>
                      <FieldLabel htmlFor="meta-app-secret">
                        App Secret
                      </FieldLabel>
                      <Input
                        id="meta-app-secret"
                        autoComplete="new-password"
                        type="password"
                        required={!metaConfigured}
                        disabled={savingMetaSettings}
                        value={metaAppSecret}
                        onChange={(event) =>
                          setMetaAppSecret(event.target.value)
                        }
                        placeholder={
                          metaConfigured
                            ? "Salvo; preencha para substituir"
                            : "Secret do aplicativo"
                        }
                      />
                    </Field>
                    <Field data-disabled={savingMetaSettings}>
                      <FieldLabel htmlFor="meta-api-version">
                        Versão da Graph API
                      </FieldLabel>
                      <Input
                        id="meta-api-version"
                        autoComplete="off"
                        pattern="v[0-9]{1,3}\.[0-9]"
                        required
                        disabled={savingMetaSettings}
                        value={metaApiVersion}
                        onChange={(event) =>
                          setMetaApiVersion(event.target.value)
                        }
                        placeholder="v24.0"
                      />
                    </Field>
                    <div className="settings-actions">
                      <Button
                        type="submit"
                        disabled={savingMetaSettings}
                        size="lg"
                      >
                        {savingMetaSettings ? "Salvando…" : "Salvar aplicativo"}
                      </Button>
                    </div>
                  </FieldGroup>
                </form>
              </CardContent>
            </Card>
            <Card className="settings-panel">
              <CardHeader>
                <CardTitle>Contas de anúncio</CardTitle>
                <CardDescription>
                  Autorize o acesso às contas que deseja acompanhar.
                </CardDescription>
                <CardAction>
                  <Badge variant="outline">
                    {connected.meta ? "Conectado" : "Não conectado"}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="integration-connection-content">
                <p>
                  Salve o aplicativo ao lado e entre na Meta para escolher suas
                  contas. Você pode conectar várias contas de anúncio.
                </p>
                <div className="settings-actions">
                  <Button
                    type="button"
                    disabled={!metaConfigured || savingMetaSettings}
                    onClick={() => window.location.assign("/auth/meta/start")}
                    size="lg"
                  >
                    {connected.meta ? "Reconectar contas" : "Conectar contas"}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!connected.meta || syncing}
                    onClick={onSync}
                    size="lg"
                  >
                    <RefreshCw
                      className={syncing ? "spin" : ""}
                      data-icon="inline-start"
                    />
                    {syncing ? "Atualizando…" : "Atualizar anúncios"}
                  </Button>
                </div>
                {!metaConfigured && (
                  <p>Configure o aplicativo Meta para habilitar a conexão.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {(["hotmart", "kiwify"] as const).map((provider) => {
          const name = provider === "hotmart" ? "Hotmart" : "Kiwify"
          const webhookUrl = webhookUrls[provider]
          const token =
            provider === "hotmart" ? hotmartWebhookToken : kiwifyWebhookToken
          return (
            <TabsContent key={provider} value={provider}>
              <div className="integration-section-heading">
                <h2>{name}</h2>
                <p>
                  Conecte a API para consultar vendas e o webhook para receber
                  novos pedidos.
                </p>
              </div>
              <div className="integration-settings-grid">
                <Card className="settings-panel">
                  <CardHeader>
                    <CardTitle>Consulta de vendas pela API</CardTitle>
                    <CardDescription>
                      Recupere pedidos e reconcilie os dados de vendas da {name}
                      .
                    </CardDescription>
                    <CardAction>
                      <Badge variant="outline">
                        {connected[provider] ? "Conectado" : "Não conectado"}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="integration-connection-content">
                    <p>
                      {provider === "hotmart"
                        ? "Informe o Client ID e o Client Secret gerados na Hotmart."
                        : "Informe o Client ID, o Client Secret e o ID da sua conta Kiwify."}
                    </p>
                    <div className="settings-actions">
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => {
                          setClientId("")
                          setClientSecret("")
                          setKiwifyAccountId("")
                          setCredentialsProvider(provider)
                        }}
                      >
                        {connected[provider]
                          ? "Atualizar credenciais"
                          : "Conectar API"}
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                    </div>
                    <p>
                      A reconciliação de vendas pode ser iniciada nas abas
                      Vendas e Funil após conectar a API.
                    </p>
                  </CardContent>
                </Card>
                <Card className="settings-panel">
                  <CardHeader>
                    <CardTitle>Recebimento de pedidos por webhook</CardTitle>
                    <CardDescription>
                      Receba vendas, reembolsos e chargebacks enviados pela{" "}
                      {name}.
                    </CardDescription>
                    <CardAction>
                      <Badge variant="outline">
                        {webhookUrl ? "Token salvo" : "Não configurado"}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <form
                      onSubmit={(event) =>
                        void saveWebhookSettings(event, provider)
                      }
                    >
                      <FieldGroup>
                        <Field data-disabled={savingWebhookSettings}>
                          <FieldLabel htmlFor={`${provider}-webhook-token`}>
                            {provider === "hotmart"
                              ? "HOTTOK"
                              : "Token privado"}
                          </FieldLabel>
                          <Input
                            id={`${provider}-webhook-token`}
                            autoComplete="new-password"
                            type="password"
                            disabled={savingWebhookSettings}
                            value={token}
                            onChange={(event) =>
                              provider === "hotmart"
                                ? setHotmartWebhookToken(event.target.value)
                                : setKiwifyWebhookToken(event.target.value)
                            }
                            placeholder={
                              webhookUrl
                                ? "Salvo; preencha para substituir"
                                : provider === "hotmart"
                                  ? "Cole o HOTTOK da Hotmart"
                                  : "Crie ou gere um token seguro"
                            }
                          />
                          <FieldDescription>
                            {provider === "hotmart"
                              ? "Use o HOTTOK disponível nas configurações de webhook da Hotmart."
                              : "Gere um token e salve para criar a URL do webhook."}
                          </FieldDescription>
                        </Field>
                        <div className="settings-actions">
                          <Button
                            type="submit"
                            disabled={savingWebhookSettings || !token.trim()}
                            size="lg"
                          >
                            {savingWebhookSettings
                              ? "Salvando…"
                              : "Salvar token"}
                          </Button>
                          {provider === "kiwify" && (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={savingWebhookSettings}
                              onClick={generateKiwifyToken}
                            >
                              Gerar token seguro
                            </Button>
                          )}
                        </div>
                        <Field>
                          <FieldLabel htmlFor={`${provider}-webhook-url`}>
                            URL do webhook
                          </FieldLabel>
                          <Input
                            id={`${provider}-webhook-url`}
                            readOnly
                            value={webhookUrl ?? ""}
                            placeholder="Salve o token para obter a URL"
                          />
                          <FieldDescription>
                            Copie esta URL e cadastre no painel da {name}. Ao
                            substituir o token, atualize também a configuração
                            do gateway.
                          </FieldDescription>
                          <div className="settings-actions">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={!webhookUrl}
                              onClick={() =>
                                webhookUrl && void copy(webhookUrl)
                              }
                            >
                              {copyText === webhookUrl ? (
                                <Check data-icon="inline-start" />
                              ) : (
                                <Copy data-icon="inline-start" />
                              )}
                              {copyText === webhookUrl
                                ? "Copiado"
                                : "Copiar URL"}
                            </Button>
                            {webhookUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={savingWebhookSettings}
                                onClick={() => void removeWebhook(provider)}
                              >
                                Remover token
                              </Button>
                            )}
                          </div>
                        </Field>
                      </FieldGroup>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )
        })}
      </Tabs>
      <Alert className="integration-privacy-note">
        <AlertTitle>Credenciais protegidas</AlertTitle>
        <AlertDescription>
          Os segredos ficam protegidos e não são exibidos novamente após salvar.
        </AlertDescription>
      </Alert>
      <Dialog
        open={Boolean(credentialsProvider)}
        onOpenChange={(open) => {
          if (!open && !savingCredentials) setCredentialsProvider(null)
        }}
      >
        <DialogContent
          className="gateway-credentials-dialog"
          showCloseButton={!savingCredentials}
        >
          <DialogHeader>
            <DialogTitle>
              Conectar API da{" "}
              {credentialsProvider === "hotmart" ? "Hotmart" : "Kiwify"}
            </DialogTitle>
            <DialogDescription>
              Informe as credenciais geradas no painel da plataforma para
              consultar suas vendas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCredentials}>
            <FieldGroup>
              <Field data-disabled={savingCredentials}>
                <FieldLabel htmlFor="gateway-client-id">Client ID</FieldLabel>
                <Input
                  id="gateway-client-id"
                  autoComplete="off"
                  required
                  disabled={savingCredentials}
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                />
              </Field>
              <Field data-disabled={savingCredentials}>
                <FieldLabel htmlFor="gateway-client-secret">
                  Client Secret
                </FieldLabel>
                <Input
                  id="gateway-client-secret"
                  autoComplete="new-password"
                  required
                  type="password"
                  disabled={savingCredentials}
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                />
              </Field>
              {credentialsProvider === "kiwify" && (
                <Field data-disabled={savingCredentials}>
                  <FieldLabel htmlFor="gateway-account-id">
                    ID da conta Kiwify
                  </FieldLabel>
                  <Input
                    id="gateway-account-id"
                    autoComplete="off"
                    required
                    disabled={savingCredentials}
                    value={kiwifyAccountId}
                    onChange={(event) => setKiwifyAccountId(event.target.value)}
                  />
                </Field>
              )}
              <div className="settings-actions">
                <Button type="submit" disabled={savingCredentials} size="lg">
                  {savingCredentials ? "Validando…" : "Validar e conectar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingCredentials}
                  onClick={() => setCredentialsProvider(null)}
                >
                  Cancelar
                </Button>
              </div>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function GatewayBadge({ gateway }: { gateway: Sale["gateway"] }) {
  return (
    <Badge
      className={`gateway-badge ${gateway === "Hotmart" ? "hotmart-badge" : "kiwify-badge"}`}
      variant="outline"
    >
      <i>{gateway === "Hotmart" ? "H" : "K"}</i>
      {gateway}
    </Badge>
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
    <Badge
      className={`sale-status ${className}`}
      variant={className === "reversed" ? "destructive" : "secondary"}
    >
      <i />
      {status}
    </Badge>
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
            selfmetric<span className="brand-period">.</span>
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
            selfmetric<span className="brand-period">.</span>
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
    profit: true,
    roas: true,
    cpa: false,
    cpc: false,
    cpm: false,
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

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)
}

function funnelConversion(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous <= 0) return null
  return (current / previous) * 100
}

function formatFunnelPercent(value: number | null) {
  return value === null ? "—" : `${formatPercent(value)}%`
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

function openMetaAds(
  accountId: string,
  entityId: string,
  level: Level,
  onToast: (message: string) => void
) {
  const query = new URLSearchParams({
    act: accountId.replace(/^act_/, ""),
  })
  const selectedKey =
    level === "Campanhas"
      ? "selected_campaign_ids"
      : level === "Conjuntos"
        ? "selected_adset_ids"
        : "selected_ad_ids"
  query.set(selectedKey, JSON.stringify([entityId]))
  const popup = window.open(
    `https://adsmanager.facebook.com/adsmanager/manage/campaigns?${query}`,
    "_blank"
  )
  if (popup) popup.opener = null
  else onToast("O navegador bloqueou a abertura do Meta Ads.")
}

function csvCell(value: unknown) {
  const text = String(value ?? "")
  return `"${text.replaceAll('"', '""')}"`
}

export default App
