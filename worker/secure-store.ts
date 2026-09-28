const encoder = new TextEncoder()
// The production Workers runtime currently caps each PBKDF2 call at 100,000.
const PASSWORD_HASH_ITERATIONS = 100_000

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

function secretVault(env: Env) {
  return env.SECRET_VAULT.get(env.SECRET_VAULT.idFromName("workspace"))
}

export async function encryptSecret(value: string, env: Env) {
  return secretVault(env).encryptSecret(value)
}

export async function decryptSecret(value: string, env: Env) {
  if (!value.startsWith("v2."))
    throw new Error("O valor criptografado está incompleto.")
  return secretVault(env).decryptSecret(value)
}

async function derivePassword(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: PASSWORD_HASH_ITERATIONS,
      },
      material,
      256
    )
  )
}

export async function createPasswordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePassword(password, salt)
  return `pbkdf2-sha256$${PASSWORD_HASH_ITERATIONS}$${encodeBase64(salt)}$${encodeBase64(hash)}`
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, iterationsText, saltText, hashText, extra] =
    encoded.split("$")
  const iterations = Number(iterationsText)
  if (
    algorithm !== "pbkdf2-sha256" ||
    extra !== undefined ||
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    iterations > PASSWORD_HASH_ITERATIONS ||
    !saltText ||
    !hashText
  )
    return false

  const salt = decodeBase64(saltText)
  const expected = decodeBase64(hashText)
  if (salt.byteLength !== 16 || expected.byteLength !== 32) return false
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  )
  const actual = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      256
    )
  )
  let mismatch = 0
  for (let index = 0; index < actual.length; index += 1)
    mismatch |= actual[index] ^ expected[index]
  return mismatch === 0
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
