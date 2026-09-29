export type AdAccount = {
  id: string
  name: string
  initials: string
  timezone: string
}

export type Campaign = {
  id: string
  name: string
  accountId: string
  accountName?: string
  status: "Ativa" | "Pausada" | "—"
  spend: number
  revenue: number
  sales: number
  clicks: number
  impressions: number
  product: string
  gateway: "Hotmart" | "Kiwify"
  matchRate: number
  change: number
  adsets?: string[]
}

export type Sale = {
  id: string
  accountId?: string
  date: string
  product: string
  buyer: string
  gateway: "Hotmart" | "Kiwify"
  amount: number
  amountLabel?: string
  status: "Aprovada" | "Reembolsada" | "Chargeback" | "Aguardando"
  campaign: string
  matched: boolean
}

export const accounts: AdAccount[] = [
  {
    id: "act_1029384756",
    name: "Aurora Digital",
    initials: "AD",
    timezone: "America/Sao_Paulo",
  },
  {
    id: "act_5647382910",
    name: "Crescer Mais",
    initials: "CM",
    timezone: "America/Sao_Paulo",
  },
  {
    id: "act_9182736450",
    name: "Projeto Leve",
    initials: "PL",
    timezone: "America/Fortaleza",
  },
]

export const campaigns: Campaign[] = [
  {
    id: "1202084100285401",
    name: "[ESCALA] Método Aurora • VSL 02",
    accountId: "act_1029384756",
    status: "Ativa",
    spend: 6842.5,
    revenue: 24638.4,
    sales: 64,
    clicks: 4620,
    impressions: 168430,
    product: "Método Aurora",
    gateway: "Hotmart",
    matchRate: 97,
    change: 18.4,
    adsets: ["Interesses • Mulheres 25-44", "Lookalike compradores 2%"],
  },
  {
    id: "1202084100285402",
    name: "[CBO] Desafio 21 dias • Criativo UGC",
    accountId: "act_5647382910",
    status: "Ativa",
    spend: 5128.2,
    revenue: 17342.9,
    sales: 48,
    clicks: 3984,
    impressions: 140210,
    product: "Desafio 21 dias",
    gateway: "Kiwify",
    matchRate: 94,
    change: 12.1,
    adsets: ["Broad • Brasil", "Engajamento 180 dias"],
  },
  {
    id: "1202084100285403",
    name: "[ABO] Planner financeiro • Reels",
    accountId: "act_1029384756",
    status: "Ativa",
    spend: 3986.1,
    revenue: 12672,
    sales: 39,
    clicks: 3116,
    impressions: 118740,
    product: "Planner financeiro",
    gateway: "Hotmart",
    matchRate: 91,
    change: 6.8,
    adsets: ["Interesse finanças pessoais", "Lookalike leads 1%"],
  },
  {
    id: "1202084100285404",
    name: "[ESCALA] Inglês sem medo • UGC 04",
    accountId: "act_9182736450",
    status: "Ativa",
    spend: 3424.8,
    revenue: 11782.6,
    sales: 22,
    clicks: 2480,
    impressions: 104560,
    product: "Inglês sem medo",
    gateway: "Kiwify",
    matchRate: 89,
    change: 24.5,
    adsets: ["Broad • 18-35", "Interesses educação"],
  },
  {
    id: "1202084100285405",
    name: "[TESTE] Ebook receitas leves • Estático",
    accountId: "act_5647382910",
    status: "Pausada",
    spend: 2460.75,
    revenue: 6676.1,
    sales: 11,
    clicks: 2128,
    impressions: 92780,
    product: "Ebook receitas leves",
    gateway: "Hotmart",
    matchRate: 82,
    change: -8.2,
    adsets: ["Receitas saudáveis", "Público amplo"],
  },
]

export const sales: Sale[] = [
  {
    id: "HP00294710",
    accountId: "act_1029384756",
    date: "Hoje, 10:42",
    product: "Método Aurora",
    buyer: "Marina R.",
    gateway: "Hotmart",
    amount: 397,
    status: "Aprovada",
    campaign: "VSL 02",
    matched: true,
  },
  {
    id: "KW00831294",
    accountId: "act_5647382910",
    date: "Hoje, 10:18",
    product: "Desafio 21 dias",
    buyer: "Carlos M.",
    gateway: "Kiwify",
    amount: 197,
    status: "Aprovada",
    campaign: "Criativo UGC",
    matched: true,
  },
  {
    id: "HP00294698",
    accountId: "act_1029384756",
    date: "Hoje, 09:56",
    product: "Planner financeiro",
    buyer: "Ana C.",
    gateway: "Hotmart",
    amount: 147,
    status: "Aprovada",
    campaign: "Reels",
    matched: true,
  },
  {
    id: "KW00831261",
    accountId: "act_9182736450",
    date: "Hoje, 09:31",
    product: "Inglês sem medo",
    buyer: "Rafael G.",
    gateway: "Kiwify",
    amount: 297,
    status: "Aprovada",
    campaign: "UGC 04",
    matched: true,
  },
  {
    id: "HP00294642",
    accountId: "act_1029384756",
    date: "Hoje, 09:02",
    product: "Método Aurora",
    buyer: "Joana P.",
    gateway: "Hotmart",
    amount: 397,
    status: "Reembolsada",
    campaign: "VSL 02",
    matched: true,
  },
  {
    id: "KW00831190",
    accountId: "act_5647382910",
    date: "Hoje, 08:44",
    product: "Desafio 21 dias",
    buyer: "Pedro F.",
    gateway: "Kiwify",
    amount: 197,
    status: "Aprovada",
    campaign: "Sem atribuição",
    matched: false,
  },
  {
    id: "HP00294588",
    accountId: "act_5647382910",
    date: "Ontem, 22:17",
    product: "Ebook receitas leves",
    buyer: "Luiza B.",
    gateway: "Hotmart",
    amount: 67,
    status: "Chargeback",
    campaign: "Estático",
    matched: true,
  },
  {
    id: "KW00831134",
    accountId: "act_9182736450",
    date: "Ontem, 21:50",
    product: "Inglês sem medo",
    buyer: "Felipe A.",
    gateway: "Kiwify",
    amount: 297,
    status: "Aprovada",
    campaign: "UGC 04",
    matched: true,
  },
  {
    id: "HP00294521",
    accountId: "act_1029384756",
    date: "Ontem, 20:26",
    product: "Método Aurora",
    buyer: "Beatriz L.",
    gateway: "Hotmart",
    amount: 397,
    status: "Aprovada",
    campaign: "VSL 02",
    matched: true,
  },
  {
    id: "KW00831096",
    accountId: "act_1029384756",
    date: "Ontem, 19:43",
    product: "Planner financeiro",
    buyer: "Sem identificação",
    gateway: "Kiwify",
    amount: 147,
    status: "Aguardando",
    campaign: "Sem atribuição",
    matched: false,
  },
]

export const dailyMetrics = [
  { label: "01", spend: 3940, revenue: 11400 },
  { label: "02", spend: 4380, revenue: 14200 },
  { label: "03", spend: 4050, revenue: 11900 },
  { label: "04", spend: 4920, revenue: 16700 },
  { label: "05", spend: 4680, revenue: 15300 },
  { label: "06", spend: 5320, revenue: 18400 },
  { label: "07", spend: 4960, revenue: 17000 },
  { label: "08", spend: 5820, revenue: 20600 },
  { label: "09", spend: 5470, revenue: 18800 },
  { label: "10", spend: 6210, revenue: 21900 },
  { label: "11", spend: 5870, revenue: 20100 },
  { label: "12", spend: 6580, revenue: 23800 },
  { label: "13", spend: 6120, revenue: 21400 },
  { label: "14", spend: 7050, revenue: 25100 },
]
