/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_MODE?: 'simulated' | 'websocket'
  readonly VITE_NODERED_WS_URL?: string
  readonly VITE_API_URL?: string
  readonly VITE_GRAFANA_URL?: string
  /** Vídeo guía del proyecto (enlace público). */
  readonly VITE_VIDEO_URL?: string
  /**
   * Clave de DEMOSTRACIÓN PÚBLICA (solo rol operador). Única excepción a la regla de no poner
   * claves en VITE_: aquí se publica a propósito. Su valor va en el panel de Vercel y en el .env
   * local, nunca en el repositorio. Ver src/config/demo.config.ts.
   */
  readonly VITE_DEMO_OPERADOR_KEY?: string
  readonly VITE_DEMO_OPERADOR_ALIAS?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
