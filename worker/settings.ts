import { decryptSecret, encryptSecret } from "./secure-store"

type MetaConfiguration = {
  appId: string
  appSecret: string
  apiVersion: string
}

type JsonRecord = Record<string, unknown>
type WebhookProvider = "hotmart" | "kiwify"

const DEFAULT_META_API_VERSION = "v24.0"
const SETTING_KEYS = {
  meta: "meta_credentials",
  hotmart: "hotmart_webhook_token",
  kiwify: "kiwify_webhook_token",
} as const

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {}
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

async function readCiphertext(env: Env, key: string) {
  const row = await env.DB.prepare(
    "SELECT value_ciphertext FROM workspace_settings WHERE key = ?"
  )
    .bind(key)
    .first<{ value_ciphertext: string }>()
  return row?.value_ciphertext ?? null
}

async function writeSetting(env: Env, key: string, value: string) {
  const ciphertext = await encryptSecret(value, env)
  await env.DB.prepare(
    `INSERT INTO workspace_settings (key, value_ciphertext, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(key) DO UPDATE SET value_ciphertext = excluded.value_ciphertext,
    updated_at = excluded.updated_at`
  )
    .bind(key, ciphertext)
    .run()
}

export async function readMetaConfiguration(env: Env) {
  const ciphertext = await readCiphertext(env, SETTING_KEYS.meta)
  if (!ciphertext) return null
  const value = asRecord(JSON.parse(await decryptSecret(ciphertext, env)))
  const appId = asText(value.appId)
  const appSecret = asText(value.appSecret)
  const apiVersion = asText(value.apiVersion)
  if (!appId || !appSecret || !/^v\d{1,3}\.\d$/.test(apiVersion)) return null
  return { appId, appSecret, apiVersion } satisfies MetaConfiguration
}

export async function saveMetaConfiguration(env: Env, input: unknown) {
  const body = asRecord(input)
  const existing = await readMetaConfiguration(env)
  const appId = asText(body.appId) || existing?.appId || ""
  const appSecret = asText(body.appSecret) || existing?.appSecret || ""
  const apiVersion =
    asText(body.apiVersion) || existing?.apiVersion || DEFAULT_META_API_VERSION

  if (!appId || !appSecret)
    throw new Error("Informe o App ID e o App Secret da Meta.")
  if (appId.length > 300 || appSecret.length > 500)
    throw new Error("As credenciais Meta excedem o tamanho permitido.")
  if (!/^v\d{1,3}\.\d$/.test(apiVersion))
    throw new Error("A versão da API Meta deve seguir o formato vNN.N.")

  await writeSetting(
    env,
    SETTING_KEYS.meta,
    JSON.stringify({ appId, appSecret, apiVersion })
  )
  return { configured: true, appId, apiVersion }
}

export async function readWebhookToken(env: Env, provider: WebhookProvider) {
  const ciphertext = await readCiphertext(env, SETTING_KEYS[provider])
  return ciphertext ? decryptSecret(ciphertext, env) : null
}

export async function saveWebhookTokens(env: Env, input: unknown) {
  const body = asRecord(input)
  let updated = false
  for (const provider of ["hotmart", "kiwify"] as const) {
    const inputKey = provider === "hotmart" ? "hotmartToken" : "kiwifyToken"
    if (typeof body[inputKey] !== "string") continue
    const token = asText(body[inputKey])
    if (!token) continue
    if (token.length < 8 || token.length > 500)
      throw new Error(
        `O token de webhook ${provider} deve ter entre 8 e 500 caracteres.`
      )
    await writeSetting(env, SETTING_KEYS[provider], token)
    updated = true
  }
  return { updated }
}

export async function removeWebhookToken(env: Env, provider: WebhookProvider) {
  await env.DB.prepare("DELETE FROM workspace_settings WHERE key = ?")
    .bind(SETTING_KEYS[provider])
    .run()
}

export async function workspaceSettingsView(env: Env, requestUrl: string) {
  const [meta, hotmartToken, kiwifyToken] = await Promise.all([
    readMetaConfiguration(env),
    readWebhookToken(env, "hotmart"),
    readWebhookToken(env, "kiwify"),
  ])
  const hotmartUrl = hotmartToken
    ? new URL("/api/webhooks/hotmart", requestUrl).toString()
    : null
  const kiwifyUrl = kiwifyToken
    ? new URL(
        `/api/webhooks/kiwify?token=${encodeURIComponent(kiwifyToken)}`,
        requestUrl
      ).toString()
    : null

  return {
    meta: {
      configured: Boolean(meta),
      appId: meta?.appId ?? "",
      apiVersion: meta?.apiVersion ?? DEFAULT_META_API_VERSION,
    },
    webhooks: {
      hotmartConfigured: Boolean(hotmartToken),
      kiwifyConfigured: Boolean(kiwifyToken),
      hotmartUrl,
      kiwifyUrl,
    },
  }
}
