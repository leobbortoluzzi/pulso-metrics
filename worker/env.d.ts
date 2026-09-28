// Secrets are configured with `wrangler secret put` and cannot be stored in wrangler.jsonc.
interface Env {
  DASHBOARD_PASSWORD: string
  TOKEN_ENCRYPTION_KEY: string
  META_APP_ID: string
  META_APP_SECRET: string
  META_API_VERSION: string
  HOTMART_WEBHOOK_TOKEN: string
  KIWIFY_WEBHOOK_TOKEN: string
}
