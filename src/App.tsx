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

/**
 * Orden de la pagina (de lo mas importante a lo mas tecnico):
 *   1. Resumen en 4 tarjetas   2. La casa en 3D   3. Estado del pipeline de datos   4. Analitica (graficas y registro)
 * A la derecha, el panel de control con su propio scroll.
 */
export default function App() {
  // Conecta el adaptador activo (simulador / Node-RED) con el store.
  useTelemetry()
  useAlarmSound()

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
      {/* Columna principal */}
      <main className="min-w-0">
        <Header />
        <div className="space-y-6 px-6 pb-10">
          <KpiCards />
          <Viewer />
          <PipelineStatus />

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
          </section>

          <GrafanaPanel />
        </div>
      </main>

      <SessionOverlays />

      {/* Panel lateral con scroll propio */}
      <div className="border-l border-line bg-canvas lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <ControlPanel />
      </div>
    </div>
  )
}
