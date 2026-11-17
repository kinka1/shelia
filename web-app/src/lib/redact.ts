export const HIDDEN = '[disembunyikan]'

const SECRET = /^(password|token|access_token|face_token|bypass_token|face_bypass_token)$/i

export function redactJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redactJson)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? HIDDEN : redactJson(x)]),
    )
  }
  return v
}

export function redactHeaders(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {}
  // Headers lowercases names; plain objects and pairs keep the caller's spelling.
  const out = Object.fromEntries(h instanceof Headers ? h.entries() : Array.isArray(h) ? h : Object.entries(h))
  for (const k of Object.keys(out)) if (k.toLowerCase() === 'authorization') out[k] = `Bearer ${HIDDEN}`
  return out
}

const fileLabel = (f: Blob & { name?: string }) => `[file ${f.name || 'blob'}, ${Math.ceil(f.size / 1024)} KB]`

export function describeBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return null
  if (typeof body === 'string') {
    try { return redactJson(JSON.parse(body)) } catch { return body }
  }
  if (body instanceof FormData) {
    const o: Record<string, string> = {}
    body.forEach((v, k) => { o[k] = SECRET.test(k) ? HIDDEN : typeof v === 'string' ? v : fileLabel(v) })
    return o
  }
  if (body instanceof Blob) return fileLabel(body)
  return String(body)
}

// "/api/x?token=a&page=2" -> "/api/x?token=[disembunyikan]&page=2"
export function redactPath(url: string): string {
  const i = url.indexOf('?')
  if (i < 0) return url
  const qs = url.slice(i + 1).split('&').map((kv) => {
    const j = kv.indexOf('=')
    if (j < 0) return kv
    let k = kv.slice(0, j)
    try { k = decodeURIComponent(k) } catch { /* keep raw */ }
    return SECRET.test(k) ? `${kv.slice(0, j)}=${HIDDEN}` : kv
  })
  return `${url.slice(0, i + 1)}${qs.join('&')}`
}
