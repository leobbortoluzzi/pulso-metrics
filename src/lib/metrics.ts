export type PerformanceMetrics = {
  spend: number
  revenue: number
  profit: number
  roas: number | null
  roi: number | null
}

export type SaleStatus = "approved" | "refunded" | "chargeback" | "pending"

export function calculatePerformance(
  spend: number,
  revenue: number
): PerformanceMetrics {
  const safeSpend = Number.isFinite(spend) ? spend : 0
  const safeRevenue = Number.isFinite(revenue) ? revenue : 0
  const profit = safeRevenue - safeSpend
  return {
    spend: safeSpend,
    revenue: safeRevenue,
    profit,
    roas: safeSpend > 0 ? safeRevenue / safeSpend : null,
    roi: safeSpend > 0 ? profit / safeSpend : null,
  }
}

export function approvedRevenue(
  sales: Array<{ amountBrl: number | null; status: SaleStatus }>
) {
  return sales.reduce((total, sale) => {
    return sale.status === "approved" && sale.amountBrl !== null
      ? total + sale.amountBrl
      : total
  }, 0)
}

export function currencyMinorUnit(currency: string) {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: currency.toUpperCase(),
      }).resolvedOptions().maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

export function amountMinorToMajor(amountMinor: number, currency: string) {
  const safeAmount = Number.isFinite(amountMinor) ? amountMinor : 0
  return safeAmount / 10 ** currencyMinorUnit(currency)
}

export function convertToBrl(
  amountMinor: number,
  currency: string,
  sellingRate = 1
) {
  const normalizedCurrency = currency.toUpperCase()
  if (
    normalizedCurrency !== "BRL" &&
    (!Number.isFinite(sellingRate) || sellingRate <= 0)
  ) {
    return null
  }
  return amountMinorToMajor(amountMinor, normalizedCurrency) * sellingRate
}
