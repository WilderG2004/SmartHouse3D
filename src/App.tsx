import { BarChart3, PanelRightClose, PanelRightOpen, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { BreakdownChart, ClimateChart, PowerChart, SmokeChart } from './components/Charts'
import { ControlPanel } from './components/ControlPanel'
import { EventLog } from './components/EventLog'
import { GrafanaPanel } from './components/GrafanaPanel'
import { Header } from './components/Header'
import { KpiCards } from './components/KpiCards'
import { PipelineStatus } from './components/PipelineStatus'
import { RangeTabs } from './components/RangeTabs'
import { SessionOverlays } from './components/SessionOverlays'
import { Viewer } from './components/Viewer'
import { useAlarmSound } from './hooks/useAlarmSound'
import { useTelemetry } from './hooks/useTelemetry'
import { useUiStore } from './store/useUiStore'

/** Gráficas, registro de eventos, pipeline y Grafana. En escritorio es una hoja de vidrio que sube sobre el 3D. */
function Analytics() {
  return (
    <section className="space-y-4" aria-label="Analítica">
      <RangeTabs />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <PowerChart />
            <BreakdownChart />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ClimateChart />
            <SmokeChart />
          </div>
        </div>
        <EventLog />
      </div>
      <PipelineStatus />
      <GrafanaPanel />
    </section>
  )
}

const WIDE = '(min-width: 1024px)'
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
/** true en escritorio (HUD sobre el 3D a pantalla completa) */
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches)

/**
 * HUD del gemelo digital.
 *   Escritorio (≥ 1024 px): la casa en 3D ocupa TODA la pantalla y encima flotan, como vidrio, la barra de estado con
 *   los 4 indicadores (arriba), el panel de control (derecha, plegable), los controles del visor y la hoja de analítica.
 *   Celular / tablet: lo mismo en columna (barra, indicadores, casa, panel, analítica).
 * Los controles del visor usan --hud-top y --hud-right (index.css) para no quedar debajo de la barra ni del panel.
 */
export default function App() {
  // Conecta el adaptador activo (simulador / Node-RED) con el store.
  useTelemetry()
  useAlarmSound()

  const root = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const analyticsOpen = useUiStore((s) => s.analyticsOpen)
  const setAnalyticsOpen = useUiStore((s) => s.setAnalyticsOpen)
  const collapsed = useUiStore((s) => s.panelCollapsed)
  const setCollapsed = useUiStore((s) => s.setPanelCollapsed)
  const wide = useWide()

  // La barra de arriba cambia de alto según el ancho (los chips bajan de línea): se mide para que los paneles del visor
  // empiecen justo debajo. En el celular la barra va en la columna y la variable vuelve a su valor de index.css.
  useEffect(() => {
    const el = top.current
    const hud = root.current
    if (!el || !hud) return
    const mq = window.matchMedia(WIDE)
    const sync = () => {
      if (mq.matches) hud.style.setProperty('--hud-top', `${el.offsetHeight + 24}px`)
      else hud.style.removeProperty('--hud-top')
    }
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    mq.addEventListener('change', sync)
    sync()
    return () => {
      ro.disconnect()
      mq.removeEventListener('change', sync)
    }
  }, [])

  // Esc cierra la hoja de analítica
  useEffect(() => {
    if (!analyticsOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAnalyticsOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [analyticsOpen, setAnalyticsOpen])

  return (
    <div ref={root} className="hud flex min-h-screen flex-col gap-3 p-3 lg:fixed lg:inset-0 lg:block lg:overflow-hidden lg:p-0" data-panel={collapsed ? 'collapsed' : 'open'}>
      {/* Barra de estado + indicadores */}
      <div ref={top} className="order-1 space-y-3 lg:absolute lg:left-3 lg:right-[var(--hud-right)] lg:top-3 lg:z-40">
        <Header />
        <KpiCards />
      </div>

      {/* La casa en 3D (a pantalla completa en escritorio) */}
      <div className="order-2">
        <Viewer />
      </div>

      {/* Panel de control: columna de vidrio a la derecha, con su propio scroll */}
      {/* Plegar solo existe en escritorio: en el celular el panel siempre va en la columna */}
      {collapsed && wide ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Mostrar el panel de control"
          aria-label="Mostrar el panel de control"
          className="glass order-3 hidden rounded-2xl p-3 text-fg hover:text-brand-strong lg:absolute lg:right-3 lg:top-3 lg:z-40 lg:block"
        >
          <PanelRightOpen size={20} />
        </button>
      ) : (
        <div className="glass order-3 overflow-hidden rounded-2xl lg:absolute lg:bottom-3 lg:right-3 lg:top-3 lg:z-40 lg:flex lg:w-[22rem] lg:flex-col xl:w-[26rem]">
          <div className="hidden items-center justify-between border-b border-line px-4 py-2 lg:flex">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal size={15} className="text-brand-strong" /> Panel de control
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Plegar el panel para ver más de la casa"
              aria-label="Plegar el panel de control"
              className="rounded-lg p-2 text-mute hover:bg-white/10 hover:text-fg"
            >
              <PanelRightClose size={16} />
            </button>
          </div>
          <div className="min-h-0 lg:flex-1 lg:overflow-y-auto">
            <ControlPanel />
          </div>
        </div>
      )}

      {/* Analítica: en el celular va en la columna; en escritorio es una hoja que se abre desde la barra */}
      {!wide && (
        <div className="order-4">
          <Analytics />
        </div>
      )}
      {wide && analyticsOpen && (
        <div
          role="dialog"
          aria-label="Analítica"
          className="glass sheet-in absolute bottom-3 left-3 right-[var(--hud-right)] top-[var(--hud-top)] z-[45] flex flex-col rounded-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-mute">
              <BarChart3 size={16} className="text-cool-strong" /> Gráficas, registro de eventos y pipeline de datos · Esc para cerrar
            </h2>
            <button
              type="button"
              onClick={() => setAnalyticsOpen(false)}
              aria-label="Cerrar la analítica"
              className="rounded-lg p-1.5 text-mute hover:bg-white/10 hover:text-fg"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <Analytics />
          </div>
        </div>
      )}

      <SessionOverlays />
    </div>
  )
}
