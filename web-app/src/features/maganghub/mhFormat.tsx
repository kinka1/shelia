import { StatusPill } from '@/features/shelia/Sessions'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const fmtDate = (d?: string) => {
  if (typeof d !== 'string') return '-'
  const [y, m, day] = d.split('-')
  return MONTHS[Number(m) - 1] ? `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}` : d
}

// StatusPill memakai kunci status sesi; dipetakan ke tint yang sama.
const STATUS: Record<string, [string, string]> = {
  PRESENT: ['closed', 'Hadir'],
  PERMIT: ['late', 'Izin'],
  SICK: ['late', 'Sakit'],
  ABSENT: ['rejected', 'Tidak hadir'],
  // state review pembimbing di MagangHub asli
  APPROVED: ['closed', 'Disetujui'],
  REJECTED: ['rejected', 'Ditolak'],
  PENDING: ['open', 'Menunggu review'],
  SUBMITTED: ['open', 'Menunggu review'],
  WAITING: ['open', 'Menunggu review'],
}
export const MhStatusPill = ({ status }: { status?: string }) => {
  const [key, label] = STATUS[status ?? ''] ?? ['', status || '-']
  return <StatusPill status={key} label={label} />
}
