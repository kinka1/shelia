import { useState } from 'react'
import { MagangHubCard } from '@/features/maganghub/MagangHubCard'
import { SheliaCard } from '@/features/shelia/SheliaCard'
import { useToday } from '@/features/shelia/useToday'
import { STATUS_LABEL } from '@/lib/attendance'

export default function Absen() {
  const shelia = useToday()
  const [sentAt, setSentAt] = useState<string | null>(null)
  const st = shelia.today?.status
  const sheliaText = st ? (STATUS_LABEL[st] || st).toLowerCase() : '…'
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Absen hari ini</h1>
        <p className="text-sm text-muted-foreground">
          Shelia: {sheliaText}. MagangHub: {sentAt ? `terkirim ${sentAt}` : 'belum diisi'}.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SheliaCard {...shelia} />
        <MagangHubCard onSentAt={setSentAt} />
      </div>
    </div>
  )
}
