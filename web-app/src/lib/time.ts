export const wib = (at: number, secs = false) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', ...(secs && { second: '2-digit' }), hourCycle: 'h23',
  }).format(at).replace(/\./g, ':')
