/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_MODE?: 'simulated' | 'websocket'
  readonly VITE_NODERED_WS_URL?: string
  readonly VITE_API_URL?: string
  readonly VITE_GRAFANA_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
