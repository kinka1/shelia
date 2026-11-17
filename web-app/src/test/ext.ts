import { vi } from 'vitest'
/** Pretend the Phoenix MagangHub extension is installed; `answer` gets each message. */
export function stubExt(answer: (msg: any) => any) {
  const sendMessage = vi.fn((_id: string, msg: any, cb: (r: any) => void) => { void Promise.resolve(answer(msg)).then(cb) })
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
  return sendMessage
}
