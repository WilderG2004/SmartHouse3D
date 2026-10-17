import { ExternalLink } from 'lucide-react'

/**
 * Dashboard de Grafana (infra/grafana) incrustado. Solo aparece si defines VITE_GRAFANA_URL.
 * Grafana ya viene con GF_SECURITY_ALLOW_EMBEDDING y acceso anónimo de solo lectura en docker-compose.
 */
export function GrafanaPanel() {
  const url = import.meta.env.VITE_GRAFANA_URL
  if (!url) return null

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Grafana · historial en InfluxDB</h3>
        <a
          href={url.replace(/[&?]kiosk/, '')}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs font-semibold text-brand-strong hover:underline"
        >
          Abrir <ExternalLink size={12} />
        </a>
      </div>
      <iframe title="Dashboard de Grafana" src={url} className="h-[560px] w-full rounded-xl bg-canvas" loading="lazy" />
    </div>
  )
}
