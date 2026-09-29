export type DateRange = { from: string; to: string }

export function daysBetween(range: DateRange) {
  const from = Date.parse(`${range.from}T00:00:00Z`)
  const to = Date.parse(`${range.to}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 1
  return Math.floor((to - from) / 86_400_000) + 1
}

export function formatRange(range: DateRange) {
  return `${formatDate(range.from)} – ${formatDate(range.to)}`
}

export function dateRangeForDays(days: number): DateRange {
  return { from: dateForDaysAgo(days), to: dateForDaysAgo(1) }
}

function dateForDaysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days + 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date)
}
