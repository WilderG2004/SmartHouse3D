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
    <div className={`card p-4 ${alert ? 'alarm-pulse !border-bad' : ''}`}>
      <div className="flex items-center gap-2.5 text-sm font-medium text-mute">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tint}`}>{icon}</span>
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tracking-tight 2xl:text-3xl ${tone}`}>{value}</span>
        {unit && <span className="text-base font-medium text-mute">{unit}</span>}
      </div>
      <p className="mt-1.5 text-xs leading-snug text-mute">{hint}</p>
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

  const on = Object.values(lights).filter((l) => l.on).length
  const rooms = ROOMS.map((r) => climate[r.id]).filter(Boolean)
  const avgT = rooms.reduce((a, r) => a + r.temperature, 0) / Math.max(1, rooms.length)
  const avgH = rooms.reduce((a, r) => a + r.humidity, 0) / Math.max(1, rooms.length)
  const cost = power.kwhTotal * TARIFF_COP_PER_KWH
  const b = power.breakdown
  const danger = sec.alarm || smoke.alarm

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        icon={<Zap size={18} />}
        tint="bg-warm-soft text-warm-strong"
        label="Potencia actual"
        value={fmtNumber(power.watts, 0)}
        unit="W"
        hint={
          b
            ? `Base ${fmtNumber(b.base)} · luces ${fmtNumber(b.lights)} (${on}/${LIGHTS.length}) · A/C ${fmtNumber(b.ac)} · enchufes ${fmtNumber(b.plugs)} W`
            : `${on} de ${LIGHTS.length} luces encendidas`
        }
      />
      <Kpi
        icon={<Receipt size={18} />}
        tint="bg-brand-soft text-brand-strong"
        label="Energía y costo estimado"
        value={fmtNumber(power.kwhTotal, 3)}
        unit="kWh"
        hint={`≈ $${fmtNumber(cost)} COP a $${fmtNumber(TARIFF_COP_PER_KWH)}/kWh · ritmo ×${METER.energyTimeScale}`}
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
        icon={danger ? <ShieldAlert size={18} /> : sec.mode === 'disarmed' ? <ShieldOff size={18} /> : <ShieldCheck size={18} />}
        tint={danger ? 'bg-bad-soft text-bad-strong' : sec.mode === 'disarmed' ? 'bg-raised text-mute' : 'bg-ok-soft text-ok-strong'}
        label="Seguridad"
        value={sec.alarm ? 'ALARMA' : MODE_TEXT[sec.mode]}
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
