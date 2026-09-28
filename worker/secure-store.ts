const encoder = new TextEncoder()

function decodeBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function encodeBase64(value: Uint8Array) {
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
  return encodeBase64(new Uint8Array(digest))
}

export async function secretsMatch(left: string, right: string) {
  if (left.length !== right.length) return false
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)])
  let mismatch = 0
  for (let index = 0; index < leftHash.length; index += 1) {
    mismatch |= leftHash.charCodeAt(index) ^ rightHash.charCodeAt(index)
  }
  return mismatch === 0
}

function encryptionKey(env: Env) {
  if (!env.TOKEN_ENCRYPTION_KEY)
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured")
  const key = decodeBase64(env.TOKEN_ENCRYPTION_KEY)
  if (key.byteLength !== 32)
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must contain 32 random bytes in base64"
    )
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ])
}

export async function encryptSecret(value: string, env: Env) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await encryptionKey(env)
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value)
  )
  return `${encodeBase64(iv)}.${encodeBase64(new Uint8Array(encrypted))}`
}

export async function decryptSecret(value: string, env: Env) {
  const [ivValue, ciphertextValue] = value.split(".")
  if (!ivValue || !ciphertextValue)
    throw new Error("Encrypted value is malformed")
  const iv = decodeBase64(ivValue)
  const ciphertext = decodeBase64(ciphertextValue)
  const key = await encryptionKey(env)
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  )
  return new TextDecoder().decode(decrypted)
}

export function randomToken(byteLength = 32) {
  return encodeBase64(crypto.getRandomValues(new Uint8Array(byteLength)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

export function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("Cookie") ?? ""
  const cookie = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null
}
