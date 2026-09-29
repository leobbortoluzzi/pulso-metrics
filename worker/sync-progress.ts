import type { QueueMessage } from "./messages"

type SyncMessage = Extract<QueueMessage, { type: "meta_sync" | "gateway_sync" }>

// Persist each checkpoint before dispatching the continuation. An old delivery
// can resend the saved continuation if its original send failed.
export async function resumeSync<T>(
  env: Env,
  message: SyncMessage,
  accountId: string,
  initialCursor: T
) {
  const row = await env.DB.prepare(
    `SELECT status, cursor_json, cursor_version FROM sync_run_accounts
     WHERE sync_id = ? AND account_id = ?`
  )
    .bind(message.syncId, accountId)
    .first<{
      status: string
      cursor_json: string | null
      cursor_version: number
    }>()
  if (!row)
    throw new Error("A sincronização não possui um registro de progresso.")
  if (row.status === "completed") return null
  if ((message.version ?? 0) !== row.cursor_version) {
    await env.SYNC_QUEUE.send({ ...message, version: row.cursor_version })
    return null
  }
  return {
    version: row.cursor_version,
    cursor: row.cursor_json
      ? (JSON.parse(row.cursor_json) as T)
      : initialCursor,
  }
}

export async function checkpointSync<T>(
  env: Env,
  message: SyncMessage,
  accountId: string,
  version: number,
  nextCursor: T | null,
  rowsWritten: number
) {
  const result = await env.DB.prepare(
    `UPDATE sync_run_accounts SET cursor_json = ?, cursor_version = cursor_version + 1,
     rows_written = rows_written + ?, status = ?, error_message = NULL,
     completed_at = CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END
     WHERE sync_id = ? AND account_id = ? AND cursor_version = ? AND status != 'completed'`
  )
    .bind(
      nextCursor === null ? null : JSON.stringify(nextCursor),
      rowsWritten,
      nextCursor === null ? "completed" : "running",
      nextCursor === null ? 1 : 0,
      message.syncId,
      accountId,
      version
    )
    .run()
  if (result.meta.changes > 0 && nextCursor !== null) {
    await env.SYNC_QUEUE.send({ ...message, version: version + 1 })
  }
}
