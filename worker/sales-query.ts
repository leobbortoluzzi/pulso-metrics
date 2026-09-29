export type SalesStatusFilter =
  "all" | "approved" | "refunded" | "chargeback" | "pending"

export type SalesAttributionFilter = "all" | "matched" | "unmatched"

export type SalesQuery = {
  from: string
  to: string
  accountIds: string[]
  provider: "hotmart" | "kiwify" | null
  product: string
  status: SalesStatusFilter
  attribution: SalesAttributionFilter
  query: string
  limit: number
  offset: number
}

export type SalesQueryResult = {
  sales: Record<string, unknown>[]
  total: number
  limit: number
  offset: number
  summary: {
    total: number
    approved: number
    refunded: number
    chargebacks: number
    approvedRevenue: number
    averageTicket: number | null
    approvedAmountCount: number
    matched: number
  }
}

export async function querySales(
  database: D1Database,
  query: SalesQuery
): Promise<SalesQueryResult> {
  const clauses = ["attribution_date BETWEEN ? AND ?"]
  const values: Array<string | number> = [query.from, query.to]
  if (query.accountIds.length) {
    clauses.push(`account_id IN (${query.accountIds.map(() => "?").join(",")})`)
    values.push(...query.accountIds)
  }
  if (query.provider) {
    clauses.push("provider = ?")
    values.push(query.provider)
  }
  if (query.product) {
    clauses.push("product_name = ?")
    values.push(query.product)
  }
  if (query.status === "pending") {
    clauses.push("status NOT IN ('approved', 'refunded', 'chargeback')")
  } else if (query.status !== "all") {
    clauses.push("status = ?")
    values.push(query.status)
  }
  if (query.attribution === "matched")
    clauses.push(
      "(campaign_id IS NOT NULL OR adset_id IS NOT NULL OR ad_id IS NOT NULL)"
    )
  if (query.attribution === "unmatched")
    clauses.push("campaign_id IS NULL AND adset_id IS NULL AND ad_id IS NULL")
  if (query.query) {
    const escapedQuery = `%${query.query.replace(/[!%_]/g, "!$&")}%`
    clauses.push(
      "(external_id LIKE ? ESCAPE '!' OR product_name LIKE ? ESCAPE '!' OR campaign_id LIKE ? ESCAPE '!' OR adset_id LIKE ? ESCAPE '!' OR ad_id LIKE ? ESCAPE '!' OR utm_source LIKE ? ESCAPE '!' OR utm_medium LIKE ? ESCAPE '!' OR utm_campaign LIKE ? ESCAPE '!' OR utm_content LIKE ? ESCAPE '!' OR utm_term LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM ad_metrics m WHERE m.campaign_id = sales.campaign_id AND m.campaign_name LIKE ? ESCAPE '!'))"
    )
    values.push(...Array.from({ length: 11 }, () => escapedQuery))
  }

  const where = clauses.join(" AND ")
  const [sales, summary] = await Promise.all([
    database
      .prepare(
        `SELECT provider, external_id, status, product_id, product_name, currency, amount_minor, amount_brl, occurred_at, attribution_date, campaign_id, adset_id, ad_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, (SELECT campaign_name FROM ad_metrics m WHERE m.campaign_id = sales.campaign_id ORDER BY m.date DESC LIMIT 1) AS campaign_name FROM sales WHERE ${where} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...values, query.limit, query.offset)
      .all<Record<string, unknown>>(),
    database
      .prepare(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_count, SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded_count, SUM(CASE WHEN status = 'chargeback' THEN 1 ELSE 0 END) AS chargeback_count, SUM(CASE WHEN status = 'approved' AND amount_brl IS NOT NULL THEN amount_brl ELSE 0 END) AS approved_revenue_brl, SUM(CASE WHEN status = 'approved' AND amount_brl IS NOT NULL THEN 1 ELSE 0 END) AS approved_amount_count, SUM(CASE WHEN campaign_id IS NOT NULL OR adset_id IS NOT NULL OR ad_id IS NOT NULL THEN 1 ELSE 0 END) AS matched_count FROM sales WHERE ${where}`
      )
      .bind(...values)
      .first<{
        total: number
        approved_count: number | null
        refunded_count: number | null
        chargeback_count: number | null
        approved_revenue_brl: number | null
        approved_amount_count: number | null
        matched_count: number | null
      }>(),
  ])

  const total = summary?.total ?? 0
  const approvedRevenue = summary?.approved_revenue_brl ?? 0
  const approvedAmountCount = summary?.approved_amount_count ?? 0
  return {
    sales: sales.results,
    total,
    limit: query.limit,
    offset: query.offset,
    summary: {
      total,
      approved: summary?.approved_count ?? 0,
      refunded: summary?.refunded_count ?? 0,
      chargebacks: summary?.chargeback_count ?? 0,
      approvedRevenue,
      averageTicket:
        approvedAmountCount > 0 ? approvedRevenue / approvedAmountCount : null,
      approvedAmountCount,
      matched: summary?.matched_count ?? 0,
    },
  }
}
