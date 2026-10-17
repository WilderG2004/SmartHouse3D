import { Home, Thermometer, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import { fmtHour, tempInk } from '../lib/climate'
import { fmtNumber } from '../lib/format'
import { telemetry } from '../services/telemetry'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import { SessionChip, TransportChip } from './Session'
import type { ConnectionStatus } from '../types/iot'

const STATUS: Record<ConnectionStatus, { text: string; dot: string }> = {
  connecting: { text: 'Conectando…', dot: 'bg-warm' },
  connected: { text: 'En línea', dot: 'bg-ok' },
  reconnecting: { text: 'Reconectando…', dot: 'bg-warm' },
  disconnected: { text: 'Desconectado', dot: 'bg-bad' },
}

const chip = 'flex items-center gap-2 rounded-full border bg-panel px-3.5 py-2 text-sm shadow-card'

export function Header() {
  const status = useHouseStore((s) => s.connection)
  const world = useHouseStore((s) => s.world)
  const soundOn = useUiStore((s) => s.soundOn)
  const toggleSound = useUiStore((s) => s.toggleSound)
  const s = STATUS[status]
  const online = status === 'connected'

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
      <div className="flex items-center gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-card">
          <Home size={22} />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Casa IoT <span className="font-medium text-mute">· Gemelo digital</span>
          </h1>
          <p className="text-sm text-mute">Iluminación, clima, energía y seguridad en una sola vista</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className={`${chip} border-line`}>
          <Thermometer size={16} style={{ color: tempInk(world.outdoorTemp) }} />
          <span className="font-semibold">{fmtNumber(world.outdoorTemp, 1)}° exterior</span>
          <span className="text-mute">· {fmtHour(world.hour)}</span>
        </div>

        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundOn}
          title="Sirena y aviso por voz cuando salte una alarma"
          className={`${chip} font-semibold transition-colors ${
            soundOn ? 'border-brand text-brand-strong' : 'border-line text-mute hover:text-fg'
          }`}
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          Sonido {soundOn ? 'activado' : 'apagado'}
        </button>

        <SessionChip />
        <TransportChip />

        <div className={`${chip} ${telemetry.mode === 'simulated' ? 'border-warm bg-warm-soft' : 'border-line'}`}>
          {online ? <Wifi size={16} className="text-ok-strong" /> : <WifiOff size={16} className="text-bad-strong" />}
          <span className="font-semibold">{telemetry.label}</span>
          <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
          <span className="text-mute">{s.text}</span>
        </div>
      </div>
    </header>
  )
}
