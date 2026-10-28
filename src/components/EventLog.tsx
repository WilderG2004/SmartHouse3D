import { AlertTriangle, Info, OctagonAlert, Trash2 } from 'lucide-react'
import { useLive } from '../hooks/useLive'
import { fmtTime } from '../lib/format'
import { useHouseStore } from '../store/useHouseStore'
import { HiddenNote } from './Session'
import type { EventLevel } from '../types/iot'

const LEVEL: Record<EventLevel, { icon: React.ReactNode; row: string }> = {
  info: { icon: <Info size={15} className="text-cool-strong" />, row: '' },
  warning: { icon: <AlertTriangle size={15} className="text-warm-strong" />, row: 'bg-warm-soft' },
  critical: { icon: <OctagonAlert size={15} className="text-bad-strong" />, row: 'bg-bad-soft' },
}

export function EventLog() {
  const events = useLive((s) => s.events)
  const clear = useHouseStore((s) => s.clearEvents)
  const restricted = useHouseStore((s) => s.restricted)

  return (
    <div className="card flex h-full min-h-[280px] flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Log de eventos del sistema</h3>
        <button
          type="button"
          onClick={clear}
          aria-label="Limpiar registro"
          title="Limpiar registro"
          className="rounded-lg p-1.5 text-mute hover:bg-raised hover:text-fg"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {restricted ? (
        <HiddenNote what="El registro de eventos" />
      ) : events.length === 0 ? (
        <p className="grid flex-1 place-items-center text-xs text-mute">Sin eventos todavía.</p>
      ) : (
        <ol className="-mx-1 flex-1 space-y-0.5 overflow-y-auto pr-1" aria-live="polite">
          {events.map((e) => (
            <li key={e.id} className={`flex gap-2.5 rounded-lg px-2 py-2 text-xs ${LEVEL[e.level].row}`}>
              <span className="mt-0.5">{LEVEL[e.level].icon}</span>
              <span className="w-[62px] shrink-0 text-mute">{fmtTime(e.ts)}</span>
              <span className="leading-snug">
                <span className="font-semibold">{e.source}: </span>
                <span className="text-fg/90">{e.message}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
