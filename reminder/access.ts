import { createPublicKey, verify as rsaVerify, type KeyObject } from 'node:crypto'

/**
 * Verifies a Cloudflare Access JWT (Cf-Access-Jwt-Assertion) and returns its lower-cased email, or null.
 * The plain Cf-Access-Authenticated-User-Email header is never trusted: anything on the Docker network could forge it.
 */
export function createVerifier(o: { team: string; aud: string; fetch?: typeof fetch; now?: () => number; timeoutMs?: number }) {
  const get = o.fetch ?? fetch
  const now = o.now ?? Date.now
  const url = `https://${o.team}.cloudflareaccess.com/cdn-cgi/access/certs`
  let keys = new Map<string, KeyObject>()
  let fetchedAt = -Infinity
  let inflight: Promise<void> | null = null

  async function load() {
    try {
      const r = await get(url, { signal: AbortSignal.timeout(o.timeoutMs ?? 10_000) })
      if (!r.ok) throw new Error(`certs ${r.status}`)
      const body = (await r.json()) as { keys?: any[] }
      keys = new Map((body.keys ?? []).filter((k) => k.kid).map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]))
      fetchedAt = now() // the 60 s limit only starts after a successful fetch
    } catch (e) {
      console.error('reminder: Access certs fetch failed:', e instanceof Error ? e.message : e)
    }
  }

  async function keyFor(kid: string): Promise<KeyObject | undefined> {
    // Concurrent callers share one in-flight fetch. A kid still unknown after a successful fetch is
    // refetched at most once a minute (Cloudflare rotates keys), so junk tokens cannot hammer the endpoint.
    if (inflight) await inflight
    if (!keys.has(kid) && now() - fetchedAt >= 60_000) {
      inflight ??= load().finally(() => { inflight = null })
      await inflight
    }
    return keys.get(kid)
  }

  return async function verify(jwt: string | undefined): Promise<string | null> {
    try {
      const parts = (jwt ?? '').split('.')
      if (parts.length !== 3 || !parts[2]) return null
      const head = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
      if (head.alg !== 'RS256' || typeof head.kid !== 'string') return null
      const key = await keyFor(head.kid)
      if (!key) return null
      const ok = rsaVerify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))
      if (!ok) return null
      const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      const aud = Array.isArray(c.aud) ? c.aud : [c.aud]
      if (!aud.includes(o.aud)) return null
      if (typeof c.exp !== 'number' || c.exp * 1000 <= now()) return null
      return typeof c.email === 'string' && c.email.includes('@') ? c.email.toLowerCase() : null
    } catch {
      return null
    }
  }
}
