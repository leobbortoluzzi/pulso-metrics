export type SaleAttribution = {
  campaignId: string | null
  adsetId: string | null
  adId: string | null
}

export function attributionDate(occurredAt: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(occurredAt))
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )
  return `${values.year}-${values.month}-${values.day}`
}

export async function resolveSaleAttribution(
  db: D1Database,
  sale: SaleAttribution
) {
  if (!sale.adId && !sale.adsetId && !sale.campaignId) return null
  const match = await db
    .prepare(
      `SELECT a.id, a.timezone_name, m.campaign_id, m.adset_id, m.ad_id
       FROM ad_accounts a JOIN ad_metrics m ON m.account_id = a.id
       WHERE m.ad_id = ? OR m.adset_id = ? OR m.campaign_id = ?
       ORDER BY CASE WHEN m.ad_id = ? THEN 0
         WHEN m.adset_id = ? THEN 1 ELSE 2 END, m.date DESC LIMIT 1`
    )
    .bind(sale.adId, sale.adsetId, sale.campaignId, sale.adId, sale.adsetId)
    .first<{
      id: string
      timezone_name: string
      campaign_id: string
      adset_id: string
      ad_id: string
    }>()
  if (!match) return null
  const matchedAd = Boolean(sale.adId && sale.adId === match.ad_id)
  const matchedAdset = Boolean(sale.adsetId && sale.adsetId === match.adset_id)
  return {
    accountId: match.id,
    timeZone: match.timezone_name,
    campaignId: matchedAd || matchedAdset ? match.campaign_id : sale.campaignId,
    adsetId: matchedAd ? match.adset_id || null : sale.adsetId,
    adId: sale.adId,
  }
}

export async function repairSaleAttributionPage(
  db: D1Database,
  accountId: string,
  afterId: number
) {
  const rows = await db
    .prepare(
      `SELECT s.id, s.occurred_at, s.campaign_id, s.adset_id, s.ad_id
     FROM sales s WHERE s.id > ?
       AND (s.account_id IS NULL OR s.campaign_id IS NULL
         OR (s.ad_id IS NOT NULL AND s.adset_id IS NULL))
       AND EXISTS (SELECT 1 FROM ad_metrics m WHERE m.account_id = ?
         AND (m.ad_id = s.ad_id OR m.adset_id = s.adset_id OR m.campaign_id = s.campaign_id))
     ORDER BY s.id LIMIT 5`
    )
    .bind(afterId, accountId)
    .all<{
      id: number
      occurred_at: string
      campaign_id: string | null
      adset_id: string | null
      ad_id: string | null
    }>()
  for (const sale of rows.results) {
    const match = await resolveSaleAttribution(db, {
      campaignId: sale.campaign_id,
      adsetId: sale.adset_id,
      adId: sale.ad_id,
    })
    if (!match || match.accountId !== accountId) continue
    await db
      .prepare(
        `UPDATE sales SET account_id = ?, campaign_id = ?, adset_id = ?,
       attribution_date = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
      )
      .bind(
        match.accountId,
        match.campaignId,
        match.adsetId,
        attributionDate(sale.occurred_at, match.timeZone),
        sale.id
      )
      .run()
  }
  return rows.results.length === 5 ? rows.results[4].id : null
}
