import { DurableObject } from "cloudflare:workers"

const ENCRYPTION_KEY_NAME = "workspace-encryption-key"
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encodeBase64(value: Uint8Array) {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export class SecretVault extends DurableObject<Env> {
  private keyPromise: Promise<CryptoKey> | null = null

  async encryptSecret(value: string) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await this.encryptionKey(),
      encoder.encode(value)
    )
    return `v2.${encodeBase64(iv)}.${encodeBase64(new Uint8Array(encrypted))}`
  }

  async decryptSecret(value: string) {
    const [version, ivValue, ciphertextValue] = value.split(".")
    if (version !== "v2" || !ivValue || !ciphertextValue)
      throw new Error("O valor criptografado está incompleto.")
    const iv = Uint8Array.from(atob(ivValue), (character) =>
      character.charCodeAt(0)
    )
    const ciphertext = Uint8Array.from(atob(ciphertextValue), (character) =>
      character.charCodeAt(0)
    )
    if (iv.byteLength !== 12 || ciphertext.byteLength < 16)
      throw new Error("O valor criptografado é inválido.")
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      await this.encryptionKey(),
      ciphertext
    )
    return decoder.decode(decrypted)
  }

  private encryptionKey() {
    this.keyPromise ??= this.loadOrCreateKey()
    return this.keyPromise
  }

  private async loadOrCreateKey(): Promise<CryptoKey> {
    const saved = await this.ctx.storage.get<string>(ENCRYPTION_KEY_NAME)
    const encoded =
      saved ?? encodeBase64(crypto.getRandomValues(new Uint8Array(32)))
    if (!saved) await this.ctx.storage.put(ENCRYPTION_KEY_NAME, encoded)
    const rawKey = Uint8Array.from(atob(encoded), (character) =>
      character.charCodeAt(0)
    )
    if (rawKey.byteLength !== 32)
      throw new Error("A chave de criptografia do workspace é inválida.")

    return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ])
  }
}
