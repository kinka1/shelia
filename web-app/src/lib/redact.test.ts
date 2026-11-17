import { describe, expect, it } from 'vitest'
import { HIDDEN, describeBody, redactHeaders, redactJson, redactPath } from './redact'

describe('redact', () => {
  it('redacts nested secrets without mutating input', () => {
    const input = { password: 'p', data: { token: 't', employee: { name: 'A' } }, meta: { bypass_token: 'b' } }
    const copy = JSON.stringify(input)
    expect(redactJson(input)).toEqual({ password: HIDDEN, data: { token: HIDDEN, employee: { name: 'A' } }, meta: { bypass_token: HIDDEN } })
    expect(JSON.stringify(input)).toBe(copy)
  })

  it('redacts case-insensitively, inside arrays and Bypass_Token', () => {
    expect(redactJson({ Face_Token: 'x', list: [{ ACCESS_TOKEN: 'y' }] })).toEqual({ Face_Token: HIDDEN, list: [{ ACCESS_TOKEN: HIDDEN }] })
    expect(redactJson({ meta: { Bypass_Token: 'x' } })).toEqual({ meta: { Bypass_Token: HIDDEN } })
  })

  it('redacts the authorization header', () => {
    expect(redactHeaders({ authorization: 'Bearer abc', Accept: 'x' })).toEqual({ authorization: `Bearer ${HIDDEN}`, Accept: 'x' })
    const h = redactHeaders(new Headers({ Authorization: 'Bearer abc', Accept: 'x' }))
    expect(h.authorization).toBe(`Bearer ${HIDDEN}`)
    expect(h.accept).toBe('x')
    expect(redactHeaders(undefined)).toEqual({})
  })

  it('describes FormData', () => {
    const fd = new FormData()
    fd.append('lat', '1')
    fd.append('face_token', 'x')
    fd.append('file_photo', new File([new Uint8Array(2048)], 'selfie.jpg'))
    expect(describeBody(fd)).toEqual({ lat: '1', face_token: HIDDEN, file_photo: '[file selfie.jpg, 2 KB]' })
  })

  it('parses JSON string bodies, keeps plain text, handles null', () => {
    expect(describeBody('{"password":"p","a":1}')).toEqual({ password: HIDDEN, a: 1 })
    expect(describeBody('plain')).toBe('plain')
    expect(describeBody(null)).toBeNull()
    expect(describeBody(undefined)).toBeNull()
  })

  it('redacts query-string secrets, keeps pathname', () => {
    expect(redactPath('/api/x?token=abc&page=2')).toBe(`/api/x?token=${HIDDEN}&page=2`)
    expect(redactPath('/api/auth/login')).toBe('/api/auth/login')
    expect(redactPath('/api/x?Face_Token=a')).toBe(`/api/x?Face_Token=${HIDDEN}`)
  })
})
