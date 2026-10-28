import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AIR_CONDITIONERS, ROOMS, SMOKE } from '../config/house.config'
import { useRangeData, type HistoryState } from '../hooks/useHistory'
import { useLive } from '../hooks/useLive'
import { fmtClock, fmtDateTime, fmtNumber, fmtTime } from '../lib/format'
import { fetchClimateRange, fetchPowerRange, fetchSmokeRange } from '../services/history/historyApi'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import type { PowerPoint, TimePoint } from '../types/iot'
import { HiddenNote } from './Session'

/** Formato de los ejes según el rango: segundos en vivo, HH:MM en historial. */
const tickFmt = (range: string) => (range === 'live' || range === '15m' ? fmtTime : fmtClock)
const labelFmt = (range: string) => (range === 'live' ? (v: unknown) => fmtTime(Number(v)) : (v: unknown) => fmtDateTime(Number(v)))

const axis = { stroke: '#94a3b8', fontSize: 12 }
const GRID = 'rgba(255, 255, 255, 0.07)'
const tooltipStyle = {
  background: 'rgba(15, 23, 42, 0.92)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: 12,
  fontSize: 13,
  color: '#e2e8f0',
  boxShadow: '0 12px 30px rgba(2, 6, 23, 0.5)',
}

const CATEGORIES = [
  { key: 'base', label: 'Base (nevera y standby)', color: '#64748b' },
  { key: 'lights', label: 'Luces', color: '#f59e0b' },
  { key: 'ac', label: 'Aire acondicionado', color: '#06b6d4' },
  { key: 'plugs', label: 'Enchufes', color: '#10b981' },
] as const

function ChartShell({
  title,
  children,
  aside,
  height = 'h-48',
}: {
  title: string
  children: React.ReactNode
  aside?: React.ReactNode
  height?: string
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      <div className={height}>{children}</div>
    </div>
  )
}

function Empty({ h }: { h?: HistoryState<unknown> }) {
  const text =
    h && h.range !== 'live'
      ? h.error
        ? h.authNeeded
          ? h.error
          : 'No se pudo cargar el historial. ¿Node-RED e InfluxDB están en marcha?'
        : h.loading || h.data === null
          ? 'Cargando historial…'
          : 'Aún no hay datos guardados en este rango.'
      : 'Esperando lecturas…'
  return <div className="grid h-full place-items-center px-4 text-center text-xs text-mute">{text}</div>
}

/* ───────────── Consumo por categoría (áreas apiladas) ───────────── */

export function PowerChart() {
  const live = useLive((s) => s.powerHistory)
  const restricted = useHouseStore((s) => s.restricted)
  const h = useRangeData(fetchPowerRange)
  const data = h.range === 'live' ? live : (h.data ?? [])
  return (
    <ChartShell title="Curva de consumo eléctrico (W)">
      {restricted && h.range === 'live' ? (
        <HiddenNote what="El consumo eléctrico" />
      ) : data.length < 2 ? (
        <Empty h={h} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data as PowerPoint[]} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="ts" tickFormatter={tickFmt(h.range)} minTickGap={48} {...axis} />
            <YAxis width={48} {...axis} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={labelFmt(h.range)}
              formatter={(v, name) => [`${fmtNumber(Number(v))} W`, name]}
            />
            {CATEGORIES.map((c) => (
              <Area
                key={c.key}
                name={c.label}
                type="monotone"
                dataKey={c.key}
                stackId="p"
                stroke={c.color}
                fill={c.color}
                fillOpacity={0.3}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  )
}

/* ───────────── Reparto actual (dona) ───────────── */

export function BreakdownChart() {
  const power = useLive((s) => s.power)
  const restricted = useHouseStore((s) => s.restricted)
  const b = power.breakdown
  const parts = CATEGORIES.map((c) => ({ ...c, value: b ? b[c.key] : c.key === 'base' ? power.watts : 0 }))
  const total = parts.reduce((a, p) => a + p.value, 0) || 1

  if (restricted) {
    return (
      <ChartShell title="¿En qué se va la energía?" height="h-auto">
        <HiddenNote what="El reparto del consumo" />
      </ChartShell>
    )
  }

  return (
    <ChartShell title="¿En qué se va la energía?" height="h-auto">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-36 w-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={parts.filter((p) => p.value > 0)}
                dataKey="value"
                innerRadius={46}
                outerRadius={66}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {parts
                  .filter((p) => p.value > 0)
                  .map((p) => (
                    <Cell key={p.key} fill={p.color} />
                  ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-xl font-bold leading-none">{fmtNumber(total)}</div>
              <div className="mt-0.5 text-xs text-mute">W totales</div>
            </div>
          </div>
        </div>
        <ul className="w-full space-y-1.5 text-xs">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
              <span className="flex-1 text-mute">{p.label}</span>
              <span className="font-semibold">{fmtNumber(p.value)} W</span>
              <span className="w-9 text-right text-mute">{fmtNumber((p.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartShell>
  )
}

/* ───────────── Temperatura de una habitación vs exterior ───────────── */

export function ClimateChart() {
  const roomId = useUiStore((s) => s.selectedRoom)
  const setRoom = useUiStore((s) => s.setSelectedRoom)
  const liveHistory = useLive((s) => s.climateHistory[roomId], roomId)
  const outdoor = useLive((s) => s.outdoorHistory)
  const h = useRangeData((minutes) => fetchClimateRange(roomId, minutes), [roomId])
  const ac = useHouseStore((s) => {
    const def = AIR_CONDITIONERS.find((a) => a.room === roomId)
    return def ? s.acs[def.id] : undefined
  })

  const outMap = new Map(outdoor.map((p) => [p.ts, p.value]))
  const data =
    h.range === 'live'
      ? (liveHistory ?? []).map((p: TimePoint) => ({ ts: p.ts, room: p.value, outdoor: outMap.get(p.ts) }))
      : (h.data ?? []).map((p) => ({ ts: p.ts, room: p.value, outdoor: p.outdoor ?? undefined }))

  return (
    <ChartShell
      title="Temperatura (°C)"
      aside={
        <select
          value={roomId}
          onChange={(e) => setRoom(e.target.value)}
          aria-label="Habitación"
          className="rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs font-semibold text-fg"
        >
          {ROOMS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      }
    >
      {data.length < 2 ? (
        <Empty h={h} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="ts" tickFormatter={tickFmt(h.range)} minTickGap={48} {...axis} />
            <YAxis
              width={48}
              domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
              {...axis}
            />
            {ac?.on && ac.mode === 'cool' && (
              <ReferenceLine
                y={ac.setpoint}
                stroke="#06b6d4"
                strokeDasharray="5 4"
                label={{ value: 'Consigna A/C', fill: '#22d3ee', fontSize: 12, position: 'insideTopLeft' }}
              />
            )}
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={labelFmt(h.range)}
              formatter={(v, name) => [`${fmtNumber(Number(v), 1)} °C`, name]}
            />
            <Line name="Habitación" type="monotone" dataKey="room" stroke="#f59e0b" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line name="Exterior" type="monotone" dataKey="outdoor" stroke="#94a3b8" strokeWidth={1.75} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  )
}

/* ───────────── Humo ───────────── */

export function SmokeChart() {
  const live = useLive((s) => s.smokeHistory)
  const h = useRangeData(fetchSmokeRange)
  const data = h.range === 'live' ? live : (h.data ?? [])
  return (
    <ChartShell title="Historial del sensor de humo (ppm)">
      {data.length < 2 ? (
        <Empty h={h} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data as TimePoint[]} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="ts" tickFormatter={tickFmt(h.range)} minTickGap={48} {...axis} />
            <YAxis domain={[0, 'dataMax + 60']} width={48} {...axis} />
            <ReferenceLine
              y={SMOKE.alarmThresholdPpm}
              stroke="#f43f5e"
              strokeDasharray="5 4"
              label={{ value: 'Umbral', fill: '#fb7185', fontSize: 12, position: 'insideTopLeft' }}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={labelFmt(h.range)}
              formatter={(v) => [`${fmtNumber(Number(v))} ppm`, 'Humo']}
            />
            <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  )
}
