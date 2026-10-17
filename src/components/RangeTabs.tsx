import { Activity } from 'lucide-react'
import { HISTORY_ENABLED, RANGE_LABEL, type HistoryRange } from '../services/history/historyApi'
import { useUiStore } from '../store/useUiStore'

const RANGES: HistoryRange[] = ['live', '15m', '1h', '24h']

/** Ventana de tiempo de las gráficas: en vivo o historial guardado en InfluxDB. */
export function RangeTabs() {
  const range = useUiStore((s) => s.historyRange)
  const setRange = useUiStore((s) => s.setHistoryRange)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-base font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand-strong">
          <Activity size={16} />
        </span>
        Analítica
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        {!HISTORY_ENABLED && (
          <span className="text-xs text-mute">Historial: requiere Node-RED + InfluxDB (VITE_TELEMETRY_MODE=websocket)</span>
        )}
        <div role="radiogroup" aria-label="Rango de las gráficas" className="flex rounded-xl border border-line bg-panel p-1 shadow-card">
          {RANGES.map((r) => {
            const disabled = r !== 'live' && !HISTORY_ENABLED
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={range === r}
                disabled={disabled}
                onClick={() => setRange(r)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  range === r ? 'bg-brand text-white' : 'text-mute hover:bg-raised hover:text-fg'
                } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
              >
                {RANGE_LABEL[r]}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
