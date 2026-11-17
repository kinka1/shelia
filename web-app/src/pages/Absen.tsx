import { SheliaCard } from '@/features/shelia/SheliaCard'

export default function Absen() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Absen hari ini</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <SheliaCard />
        <div />
      </div>
    </div>
  )
}
