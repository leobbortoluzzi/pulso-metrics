export const MAX_DATE_RANGE_DAYS = 120

const DAY_IN_MS = 86_400_000

export function isDateRangeWithinLimit(
  from: string,
  to: string,
  maxDays = MAX_DATE_RANGE_DAYS
) {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)

  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end >= start &&
    (end - start) / DAY_IN_MS < maxDays
  )
}
