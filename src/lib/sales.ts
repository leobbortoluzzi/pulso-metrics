import type { Sale } from "@/lib/dashboard-data"

export type SaleStatusFilter =
  "all" | "approved" | "refunded" | "chargeback" | "pending"

export type SaleAttributionFilter = "all" | "matched" | "unmatched"

export type SalesSummary = {
  total: number
  approved: number
  refunded: number
  chargebacks: number
  approvedRevenue: number
  averageTicket: number | null
  approvedAmountCount: number
  matched: number
}

export function summarizeSales(rows: Sale[]): SalesSummary {
  const approved = rows.filter((sale) => sale.status === "Aprovada")
  const convertedApproved = approved.filter(
    (sale) => !sale.amountLabel?.includes("aguardando PTAX")
  )
  const approvedRevenue = convertedApproved.reduce(
    (sum, sale) => sum + sale.amount,
    0
  )
  return {
    total: rows.length,
    approved: approved.length,
    refunded: rows.filter((sale) => sale.status === "Reembolsada").length,
    chargebacks: rows.filter((sale) => sale.status === "Chargeback").length,
    approvedRevenue,
    averageTicket: convertedApproved.length
      ? approvedRevenue / convertedApproved.length
      : null,
    approvedAmountCount: convertedApproved.length,
    matched: rows.filter((sale) => sale.matched).length,
  }
}
