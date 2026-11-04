import { BarChart3, CirclePlay, Home, Thermometer, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react'
import { VIDEO_URL } from '../config/demo.config'
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

const chip = 'flex min-h-8 items-center gap-2 rounded-full border bg-white/[0.04] px-3 py-1.5 text-sm'

export function Header() {
  const status = useHouseStore((s) => s.connection)
  const world = useHouseStore((s) => s.world)
  const soundOn = useUiStore((s) => s.soundOn)
  const toggleSound = useUiStore((s) => s.toggleSound)
  const analyticsOpen = useUiStore((s) => s.analyticsOpen)
  const setAnalyticsOpen = useUiStore((s) => s.setAnalyticsOpen)
  const s = STATUS[status]
  const online = status === 'connected'

  return (
    <header className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
      <div className="flex items-center gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950 shadow-[0_0_24px_rgb(16_185_129/0.45)]">
          <Home size={20} />
        </span>
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            SmartHouse3D <span className="font-medium text-mute">· Casa IoT</span>
          </h1>
          <p className="hidden text-xs text-mute 2xl:block">Iluminación, clima, energía y seguridad en una sola vista</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAnalyticsOpen(!analyticsOpen)}
          aria-pressed={analyticsOpen}
          title="Gráficas, registro de eventos y estado del pipeline de datos"
          className={`${chip} hidden font-semibold transition-colors lg:flex ${
            analyticsOpen ? 'border-cool bg-cool-soft text-cool-strong' : 'border-line text-fg hover:border-cool'
          }`}
        >
          <BarChart3 size={16} />
          Analítica
        </button>

        {VIDEO_URL && (
          <a
            href={VIDEO_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Vídeo guía: recorrido por el proyecto y sus funciones (se abre en otra pestaña)"
            className={`${chip} border-line font-semibold text-fg transition-colors hover:border-cool hover:text-cool-strong`}
          >
            <CirclePlay size={16} />
            <span className="hidden lg:inline">Vídeo guía</span>
          </a>
        )}

        <div className={`${chip} border-line`}>
          <Thermometer size={16} style={{ color: tempInk(world.outdoorTemp) }} />
          <span className="font-semibold">{fmtNumber(world.outdoorTemp, 1)}° exterior</span>
          <span className="hidden text-mute xl:inline">· {fmtHour(world.hour)}</span>
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
          <span className="hidden 2xl:inline">Sonido {soundOn ? 'activado' : 'apagado'}</span>
        </button>

        <SessionChip />
        <TransportChip />

        <div className={`${chip} ${telemetry.mode === 'simulated' ? 'border-warm bg-warm-soft' : 'border-line'}`}>
          {online ? <Wifi size={16} className="text-ok-strong" /> : <WifiOff size={16} className="text-bad-strong" />}
          <span className="hidden font-semibold 2xl:inline">{telemetry.label}</span>
          <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
          <span className="text-mute">{s.text}</span>
        </div>
      </div>
    </header>
  )
}
