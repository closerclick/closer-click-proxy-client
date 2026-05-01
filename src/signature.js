/**
 * ECDSA P-256 keypair management using SubtleCrypto, persisted in localStorage as JWK.
 * Public key in JWK form is what the proxy expects in `channel.data.publickey`.
 */
import { canonicalStringify } from './canonical.js'

const STORAGE_KEY = 'closer-click.proxy-client.keypair'

let cachedKeypair = null

async function loadOrCreate () {
  if (cachedKeypair) return cachedKeypair

  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const { privateJwk, publicJwk } = JSON.parse(raw)
        const privateKey = await crypto.subtle.importKey(
          'jwk', privateJwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true, ['sign']
        )
        const publicKey = await crypto.subtle.importKey(
          'jwk', publicJwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true, ['verify']
        )
        cachedKeypair = { privateKey, publicKey, publicJwk }
        return cachedKeypair
      } catch (e) {
        // corrupt entry, regenerate
      }
    }
  }

  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, ['sign', 'verify']
  )
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ privateJwk, publicJwk }))
  }
  cachedKeypair = { privateKey: pair.privateKey, publicKey: pair.publicKey, publicJwk }
  return cachedKeypair
}

/**
 * Returns the public key as a JWK string (what the proxy stores in data.publickey).
 */
export async function getPublicKeyJwk () {
  const { publicJwk } = await loadOrCreate()
  return JSON.stringify(publicJwk)
}

/**
 * Sign the canonical JSON of `data` and return base64 signature.
 */
export async function signData (data) {
  const { privateKey } = await loadOrCreate()
  const encoder = new TextEncoder()
  const bytes = encoder.encode(canonicalStringify(data))
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    bytes
  )
  return bufferToBase64(new Uint8Array(signature))
}

function bufferToBase64 (bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * Build the {data, signature} envelope for a channel name.
 */
export async function buildSignedChannel (channelName, extraData = {}) {
  const publickey = await getPublicKeyJwk()
  const data = { name: channelName, publickey, ...extraData }
  const signature = await signData(data)
  return { data, signature }
}
