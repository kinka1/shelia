import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { MagangHubCard } from '@/features/maganghub/MagangHubCard'
import { SheliaCard, sheliaDone } from '@/features/shelia/SheliaCard'
import { StatusPill } from '@/features/shelia/Sessions'
import { useToday } from '@/features/shelia/useToday'
import { STATUS_LABEL } from '@/lib/attendance'

export default function Absen() {
  const shelia = useToday()
  const [sentAt, setSentAt] = useState<string | null>(null)
  const st = shelia.today?.status
  const sheliaText = st ? (STATUS_LABEL[st] || st).toLowerCase() : '…'
  const n = Number(sheliaDone(shelia.today)) + Number(!!sentAt)
  return (
    <Card className="mx-auto w-full max-w-[720px] p-4 shadow-none sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Absen hari ini</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Shelia: {sheliaText}. MagangHub: {sentAt ? `terkirim ${sentAt}` : 'belum diisi'}.
          </p>
        </div>
        <StatusPill status={n === 2 ? 'closed' : ''} label={`${n} / 2 selesai`} />
      </div>
      <SheliaCard {...shelia} />
      <div className="my-6 border-t" />
      <MagangHubCard onSentAt={setSentAt} />
    </Card>
  )
}
