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
  refundedRevenue: number
  chargebackRevenue: number
  netRevenue: number
  refundRate: number
  arpu: number | null
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
  const refunded = rows.filter((sale) => sale.status === "Reembolsada")
  const convertedRefunds = refunded.filter(
    (sale) => !sale.amountLabel?.includes("aguardando PTAX")
  )
  const refundedRevenue = convertedRefunds.reduce(
    (sum, sale) => sum + sale.amount,
    0
  )
  const chargebacks = rows.filter((sale) => sale.status === "Chargeback")
  const convertedChargebacks = chargebacks.filter(
    (sale) => !sale.amountLabel?.includes("aguardando PTAX")
  )
  const chargebackRevenue = convertedChargebacks.reduce(
    (sum, sale) => sum + sale.amount,
    0
  )
  const settledCount = approved.length + refunded.length + chargebacks.length
  // Each transaction has its current status, rather than separate ledger entries.
  const netRevenue = approvedRevenue
  return {
    total: rows.length,
    approved: approved.length,
    refunded: refunded.length,
    chargebacks: chargebacks.length,
    approvedRevenue,
    refundedRevenue,
    chargebackRevenue,
    netRevenue,
    refundRate: settledCount ? (refunded.length / settledCount) * 100 : 0,
    arpu:
      convertedApproved.length > 0
        ? netRevenue / convertedApproved.length
        : null,
    averageTicket: convertedApproved.length
      ? approvedRevenue / convertedApproved.length
      : null,
    approvedAmountCount: convertedApproved.length,
    matched: rows.filter((sale) => sale.matched).length,
  }
}
