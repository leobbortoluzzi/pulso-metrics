export type QueueMessage =
  | {
      type: "meta_sync"
      syncId: string
      accountId: string
      from: string
      to: string
      version?: number
    }
  | {
      type: "gateway_sync"
      syncId: string
      provider: "hotmart" | "kiwify"
      from: string
      to: string
      version?: number
    }
  | { type: "fx_rate"; currency: string; date: string }
