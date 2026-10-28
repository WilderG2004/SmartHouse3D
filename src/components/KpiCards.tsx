import { Receipt, ShieldAlert, ShieldCheck, ShieldOff, Thermometer, Zap } from 'lucide-react'
import { LIGHTS, METER, ROOMS, SMOKE, TARIFF_COP_PER_KWH } from '../config/house.config'
import { tempInk } from '../lib/climate'
import { fmtNumber } from '../lib/format'
import { useHouseStore } from '../store/useHouseStore'
import type { SecurityMode } from '../types/iot'

function Kpi({
  icon,
  tint,
  label,
  value,
  unit,
  hint,
  tone = 'text-fg',
  alert,
}: {
  icon: React.ReactNode
  /** Clases del circulo suave detras del icono (fondo + color del icono) */
  tint: string
  label: string
  value: string
  unit?: string
  hint: string
  tone?: string
  alert?: boolean
}) {
  return (
    <div className={`glass min-w-0 rounded-2xl px-3.5 py-2.5 ${alert ? 'alarm-pulse !border-bad' : ''}`} title={hint}>
      {/* Ícono más chico en el celular; sin ícono entre 1024 y 1279 px, donde las 4 tarjetas comparten fila con el panel */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl sm:h-9 sm:w-9 lg:hidden xl:grid ${tint}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-mute">{label}</p>
          <div className="flex min-w-0 items-baseline gap-1">
            <span className={`truncate text-lg font-bold tracking-tight sm:text-xl lg:text-lg xl:text-xl ${tone}`}>{value}</span>
            {unit && <span className="shrink-0 text-sm font-medium text-mute">{unit}</span>}
          </div>
        </div>
      </div>
      <p className="mt-1 truncate text-xs text-mute">{hint}</p>
    </div>
  )
}

const MODE_TEXT: Record<SecurityMode, string> = { disarmed: 'Desarmada', home: 'En casa', away: 'Fuera' }

export function KpiCards() {
  const power = useHouseStore((s) => s.power)
  const lights = useHouseStore((s) => s.lights)
  const climate = useHouseStore((s) => s.climate)
  const world = useHouseStore((s) => s.world)
  const smoke = useHouseStore((s) => s.smoke)
  const sec = useHouseStore((s) => s.security)
  const restricted = useHouseStore((s) => s.restricted)

  const on = Object.values(lights).filter((l) => l.on).length
  const rooms = ROOMS.map((r) => climate[r.id]).filter(Boolean)
  const avgT = rooms.reduce((a, r) => a + r.temperature, 0) / Math.max(1, rooms.length)
  const avgH = rooms.reduce((a, r) => a + r.humidity, 0) / Math.max(1, rooms.length)
  const cost = power.kwhTotal * TARIFF_COP_PER_KWH
  const b = power.breakdown
  const danger = sec.alarm || smoke.alarm

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        icon={<Zap size={18} />}
        tint="bg-warm-soft text-warm-strong"
        label="Potencia actual"
        value={restricted ? 'Oculta' : fmtNumber(power.watts, 0)}
        unit={restricted ? undefined : 'W'}
        hint={
          restricted
            ? 'El consumo y las luces no se muestran en la vista pública'
            : b
            ? `Base ${fmtNumber(b.base)} · luces ${fmtNumber(b.lights)} (${on}/${LIGHTS.length}) · A/C ${fmtNumber(b.ac)} · enchufes ${fmtNumber(b.plugs)} W`
            : `${on} de ${LIGHTS.length} luces encendidas`
        }
      />
      <Kpi
        icon={<Receipt size={18} />}
        tint="bg-brand-soft text-brand-strong"
        label="Energía y costo estimado"
        value={restricted ? 'Oculta' : fmtNumber(power.kwhTotal, 3)}
        unit={restricted ? undefined : 'kWh'}
        hint={restricted ? 'Empareja la pantalla para ver el consumo' : `≈ $${fmtNumber(cost)} COP a $${fmtNumber(TARIFF_COP_PER_KWH)}/kWh · ritmo ×${METER.energyTimeScale}`}
      />
      <Kpi
        icon={<Thermometer size={18} style={{ color: tempInk(avgT) }} />}
        tint="bg-raised"
        label="Clima interior"
        value={fmtNumber(avgT, 1)}
        unit="°C"
        hint={`Exterior ${fmtNumber(world.outdoorTemp, 1)}° · humedad media ${fmtNumber(avgH)} %`}
      />
      <Kpi
        icon={danger ? <ShieldAlert size={18} /> : restricted || sec.mode === 'disarmed' ? <ShieldOff size={18} /> : <ShieldCheck size={18} />}
        tint={danger ? 'bg-bad-soft text-bad-strong' : restricted || sec.mode === 'disarmed' ? 'bg-raised text-mute' : 'bg-ok-soft text-ok-strong'}
        label="Seguridad"
        value={restricted ? 'Oculta' : sec.alarm ? 'ALARMA' : MODE_TEXT[sec.mode]}
        tone={sec.alarm ? 'text-bad-strong' : 'text-fg'}
        alert={danger}
        hint={
          sec.alarm
            ? (sec.cause ?? 'Intrusión')
            : smoke.alarm
              ? `Humo crítico: ${fmtNumber(smoke.ppm)} ppm (umbral ${SMOKE.alarmThresholdPpm})`
              : `Humo ${fmtNumber(smoke.ppm)} ppm · Normal`
        }
      />
    </div>
  )
}
