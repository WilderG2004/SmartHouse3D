/**
 * «Pipeline IoT»: demuestra EN VIVO que los datos salen de Node-RED y pasan por InfluxDB.
 * Todo lo que muestra son señales reales:
 *   1 · Node-RED genera datos   → ritmo y antigüedad de los mensajes que llegan por el WebSocket
 *   2 · Guarda en InfluxDB      → contadores que Node-RED publica por cada lote que envía (y sus errores)
 *   3 · Verificado en InfluxDB  → Node-RED LEE de InfluxDB cada 5 s cuántos puntos hay y cuál fue el último
 *   4 · API → interfaz          → consultas del historial atendidas leyendo InfluxDB
 */
import { ChevronRight, Database, Globe, Radio, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fmtNumber } from '../lib/format'
import { telemetry } from '../services/telemetry'
import { useHouseStore } from '../store/useHouseStore'

type Level = 'ok' | 'warn' | 'error' | 'idle'

/** Estilo de la etiqueta de estado de cada paso: fondo suave + texto oscuro (se lee bien) + punto de color. */
const BADGE: Record<Level, string> = {
  ok: 'bg-ok-soft text-ok-strong',
  warn: 'bg-warm-soft text-warm-strong',
  error: 'bg-bad-soft text-bad-strong',
  idle: 'bg-raised text-mute',
}
const DOT: Record<Level, string> = { ok: 'bg-ok', warn: 'bg-warm', error: 'bg-bad', idle: 'bg-mute' }

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

/** Mensajes por segundo, medidos sobre los últimos ~5 s de datos recibidos. */
function useRate(now: number) {
  const samples = useRef<{ t: number; n: number }[]>([])
  const total = useHouseStore((s) => s.stream.total)
  samples.current.push({ t: now, n: total })
  samples.current = samples.current.filter((x) => now - x.t <= 5500)
  const first = samples.current[0]
  const dt = (now - first.t) / 1000
  return dt >= 1 ? (total - first.n) / dt : 0
}

const ago = (ts: number | null | undefined, now: number) => {
  if (!ts) return '—'
  const d = Math.max(0, now - ts)
  if (d < 1500) return 'ahora mismo'
  if (d < 60_000) return `hace ${(d / 1000).toFixed(1).replace('.', ',')} s`
  return `hace ${Math.round(d / 60_000)} min`
}

function Step({
  n,
  icon,
  title,
  level,
  label,
  lines,
  last,
}: {
  n: number
  icon: ReactNode
  title: string
  level: Level
  label: string
  lines: ReactNode[]
  last?: boolean
}) {
  return (
    <div className="relative rounded-xl border border-line bg-white/[0.03] p-4">
      <div className="flex items-start gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-mute">Paso {n}</div>
          <div className="text-sm font-semibold leading-snug text-fg">{title}</div>
        </div>
      </div>
      <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[level]}`}>
        <span className={`h-2 w-2 rounded-full ${DOT[level]} ${level === 'ok' ? 'animate-pulse' : ''}`} />
        {label}
      </span>
      <ul className="mt-2.5 space-y-1 text-xs leading-snug text-mute">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {!last && (
        <span
          aria-hidden
          className="absolute -right-[18px] top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full border border-line bg-panel text-mute shadow-sm xl:grid"
        >
          <ChevronRight size={14} />
        </span>
      )}
    </div>
  )
}

export function PipelineStatus() {
  const now = useNow()
  const rate = useRate(now)
  const connection = useHouseStore((s) => s.connection)
  const lastAt = useHouseStore((s) => s.stream.lastAt)
  const { writes, store, api } = useHouseStore((s) => s.pipeline)

  if (telemetry.mode === 'simulated') {
    return (
      <section className="flex items-start gap-3 rounded-2xl border border-warm bg-warm-soft p-4 text-sm">
        <TriangleAlert size={20} className="mt-0.5 shrink-0 text-warm-strong" />
        <div>
          <div className="font-semibold text-warm-strong">Simulación local: estos datos NO vienen de Node-RED</div>
          <p className="mt-1 text-xs text-fg/80">
            Los genera la propia app para desarrollar sin backend. Para ver el pipeline real (Node-RED → InfluxDB → interfaz) inicia Node-RED y pon{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px]">VITE_TELEMETRY_MODE=websocket</code> en el{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px]">.env</code>.
          </p>
        </div>
      </section>
    )
  }

  /* 1 · Node-RED genera datos */
  const fresh = lastAt > 0 && now - lastAt < 3500
  const gen: Level = connection !== 'connected' ? 'error' : fresh ? 'ok' : 'warn'
  const genLabel = connection !== 'connected' ? 'sin conexión' : fresh ? 'generando' : 'sin datos'

  /* 2 · Guarda en InfluxDB */
  const errRecent = !!writes?.lastErrorAt && now - writes.lastErrorAt < 20_000
  const sav: Level = !writes ? 'idle' : errRecent ? 'error' : writes.lastBatchAt && now - writes.lastBatchAt < 7000 ? 'ok' : 'warn'
  const savLabel = !writes ? 'esperando' : errRecent ? 'con errores' : sav === 'ok' ? 'guardando' : 'sin lotes'

  /* 3 · Verificado en InfluxDB (lectura real) */
  const ver: Level = !store ? 'idle' : !store.ok ? 'error' : store.checkedAt && now - store.checkedAt < 20_000 ? 'ok' : 'warn'
  const verLabel = !store ? 'verificando' : !store.ok ? 'no responde' : ver === 'ok' ? 'confirmado' : 'desactualizado'

  /* 4 · API → interfaz */
  const apiLevel: Level = !api || api.requests === 0 ? 'idle' : api.errors > 0 && api.lastAt && now - api.lastAt < 20_000 && api.requests === 0 ? 'error' : 'ok'
  const apiLabel = !api || api.requests === 0 ? 'sin consultas' : 'sirviendo'

  return (
    <section className="card p-5" aria-label="Pipeline IoT">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-base font-semibold">Pipeline IoT · en vivo</h2>
        <p className="text-sm text-mute">Node-RED genera → guarda en InfluxDB → lo lee de vuelta → lo sirve a esta interfaz.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Step
          n={1}
          icon={<Radio size={15} />}
          title="Node-RED genera datos"
          level={gen}
          label={genLabel}
          lines={[
            <>
              <b className="font-semibold text-fg">{rate.toFixed(1).replace('.', ',')}</b> mensajes/s · último {ago(lastAt, now)}
            </>,
            'Temperatura, humedad, luz, humo, consumo y equipos',
          ]}
        />
        <Step
          n={2}
          icon={<Database size={15} />}
          title="Guarda en InfluxDB"
          level={sav}
          label={savLabel}
          lines={
            writes
              ? [
                  <>
                    <b className="font-semibold text-fg">{fmtNumber(writes.points)}</b> puntos enviados en {fmtNumber(writes.batches)} lotes
                  </>,
                  `Último lote ${ago(writes.lastBatchAt, now)}`,
                  ...(writes.errors > 0 ? [<span key="e" className="text-bad-strong">{writes.errors} error(es){writes.lastError ? `: ${writes.lastError}` : ''}</span>] : []),
                ]
              : ['Esperando el primer lote…']
          }
        />
        <Step
          n={3}
          icon={<ShieldCheck size={15} />}
          title="Verificado en InfluxDB"
          level={ver}
          label={verLabel}
          lines={
            store
              ? store.ok
                ? [
                    <>
                      <b className="font-semibold text-fg">{fmtNumber(store.points10m ?? 0)}</b> puntos de consumo en los últimos 10 min
                    </>,
                    `Último dato guardado ${ago(store.lastPointAt, now)} · lectura de ${store.readMs ?? '—'} ms`,
                  ]
                : [<span key="e" className="text-bad-strong">{store.error ?? 'InfluxDB no responde'}</span>]
              : ['Node-RED está leyendo de InfluxDB…']
          }
        />
        <Step
          n={4}
          icon={<Globe size={15} />}
          title="API → interfaz"
          level={apiLevel}
          label={apiLabel}
          last
          lines={
            api && api.requests > 0
              ? [
                  <>
                    <b className="font-semibold text-fg">{fmtNumber(api.requests)}</b> consultas del historial atendidas
                  </>,
                  `Última: ${api.lastRoute ?? '—'} · ${api.lastMs ?? '—'} ms · ${api.lastPoints ?? '—'} puntos ${ago(api.lastAt, now)}`,
                ]
              : ['Aún sin consultas: elige 15 min, 1 h o 24 h en las gráficas y se leerá de InfluxDB.']
          }
        />
      </div>
    </section>
  )
}
