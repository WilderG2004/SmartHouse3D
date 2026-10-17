/**
 * CONEXIÓN CON NODE-RED por WebSocket (la fuente de datos por defecto).
 *
 * En Node-RED:
 *   [websocket in]  path: /ws/casa-iot  ──▶ sesión + validación + lógica del flujo + InfluxDB ──▶ [websocket out] (mismo path)
 *
 *   ► Endpoint a configurar:  VITE_NODERED_WS_URL
 *        local:       ws://localhost:1880/ws/casa-iot
 *        desplegado:  wss://tu-backend.ejemplo.com/ws/casa-iot   (una página https NO puede abrir ws://: contenido mixto)
 *
 * SESIÓN (identidad de la pantalla, no de una persona; no hay usuarios ni contraseñas):
 *   - Toda conexión nueva es «lector»: ve los datos pero el servidor rechaza sus órdenes.
 *   - Con la clave de emparejamiento (la define quien administra el servidor) pasa a «operador» o «administrador».
 *   - La clave se guarda SOLO en sessionStorage (esta pestaña) y se vuelve a enviar al reconectar. Nunca se pone en un
 *     VITE_… (quedaría visible para cualquiera en el código descargado) ni se escribe en el registro.
 *   - Si el servidor te baja de rol (revocación) o la clave deja de valer, la interfaz se limita a reflejarlo.
 *
 * Protocolo (JSON, un objeto por mensaje WebSocket):
 *   - Node-RED → frontend: cualquier TelemetryMessage de src/types/iot.ts, más los mensajes de sesión
 *       {"type":"session","role":"operador"}  ·  {"type":"confirm","code":"3f9a1c02","kind":"security.set","summary":"Desarmar la alarma","ttlMs":15000}
 *       {"type":"reject","kind":"light.set","reason":"forbidden","need":"operador"}
 *   - frontend → Node-RED: cualquier DeviceCommand, más
 *       {"kind":"session.hello","key":"…"} · {"kind":"session.logout"} · {"kind":"confirm","code":"…"} · {"kind":"admin.revoke"}
 *
 * Si tus mensajes de Node-RED tienen otra forma, tradúcelos en `normalize()`.
 */
import type { DeviceCommand } from '../../types/iot'
import { BaseAdapter, type AdapterMessage } from './TelemetryAdapter'

const WS_URL = import.meta.env.VITE_NODERED_WS_URL ?? 'ws://localhost:1880/ws/casa-iot'
const KEY_STORE = 'casa.pairingKey'

/** sessionStorage puede no estar disponible (modo privado, bloqueado): la pantalla debe seguir funcionando sin él. */
const keyStore = {
  get(): string | null {
    try { return sessionStorage.getItem(KEY_STORE) } catch { return null }
  },
  set(k: string) {
    try { sessionStorage.setItem(KEY_STORE, k) } catch { /* sin almacenamiento: la clave no sobrevive a recargar */ }
  },
  clear() {
    try { sessionStorage.removeItem(KEY_STORE) } catch { /* nada */ }
  },
}

const SECURE = WS_URL.startsWith('wss://')
/** Una página https no puede abrir ws:// (el navegador lo bloquea): se avisa en vez de fallar en silencio. */
const MIXED_CONTENT = !SECURE && typeof location !== 'undefined' && location.protocol === 'https:'

export class WebSocketAdapter extends BaseAdapter {
  readonly mode = 'websocket' as const
  readonly label = 'Node-RED (WebSocket)'
  override readonly enforcesSessions = true
  override readonly secureTransport = SECURE

  private ws: WebSocket | null = null
  private retry = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private closedByUser = false
  /** Clave que se está probando (no se guarda hasta que el servidor la acepte). */
  private pendingKey: string | null = null

  connect() {
    this.closedByUser = false
    if (MIXED_CONTENT) {
      this.emit({ type: 'connection', status: 'disconnected' })
      this.emit({ type: 'reject', kind: 'conexion', reason: 'mixed_content' })
      return
    }
    this.emit({ type: 'connection', status: this.retry ? 'reconnecting' : 'connecting' })

    const ws = new WebSocket(WS_URL)
    this.ws = ws

    ws.onopen = () => {
      this.retry = 0
      this.emit({ type: 'connection', status: 'connected' })
      // Si esta pestaña ya estaba emparejada, se vuelve a emparejar ANTES de pedir nada
      const saved = keyStore.get()
      if (saved) ws.send(JSON.stringify({ kind: 'session.hello', key: saved }))
      // Pide el estado completo al conectar
      ws.send(JSON.stringify({ kind: 'snapshot.request' }))
    }

    ws.onmessage = (ev) => {
      try {
        const msg = this.normalize(JSON.parse(String(ev.data)))
        if (!msg) return
        if (msg.type === 'session' && this.pendingKey && msg.role !== 'lector') {
          keyStore.set(this.pendingKey) // el servidor la aceptó: ahora sí se recuerda en esta pestaña
          this.pendingKey = null
        }
        if (msg.type === 'reject' && msg.kind === 'session.hello') {
          this.pendingKey = null
          if (msg.reason === 'bad_key') keyStore.clear() // la clave guardada ya no vale (rotada o equivocada)
        }
        this.emit(msg)
      } catch (err) {
        console.warn('[WebSocketAdapter] mensaje inválido', err)
      }
    }

    ws.onclose = () => {
      // Una conexión nueva siempre empieza como «lector»
      this.emit({ type: 'session', role: 'lector' })
      if (this.closedByUser) return
      this.emit({ type: 'connection', status: 'reconnecting' })
      const delay = Math.min(15000, 1000 * 2 ** this.retry++) // backoff exponencial
      this.retryTimer = setTimeout(() => this.connect(), delay)
    }

    ws.onerror = () => ws.close()
  }

  disconnect() {
    this.closedByUser = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.ws?.close()
    this.ws = null
    this.emit({ type: 'connection', status: 'disconnected' })
  }

  send(command: DeviceCommand) {
    this.raw(command)
  }

  override pair(key: string) {
    const k = key.trim()
    if (!k) return
    this.pendingKey = k
    // Si el WebSocket no está abierto, el mensaje no sale: se avisa en el acto (si no, el diálogo se quedaría en «Comprobando…»)
    if (!this.raw({ kind: 'session.hello', key: k })) {
      this.pendingKey = null
      this.emit({ type: 'reject', kind: 'session.hello', reason: 'no_connection' })
    }
  }

  override unpair() {
    keyStore.clear()
    this.pendingKey = null
    this.raw({ kind: 'session.logout' })
  }

  override confirm(code: string) {
    this.raw({ kind: 'confirm', code })
  }

  override revokeOthers() {
    this.raw({ kind: 'admin.revoke' })
  }

  /** Envía el mensaje si el WebSocket está abierto. Devuelve false si no salió. */
  private raw(payload: object): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
      return true
    }
    console.warn('[WebSocketAdapter] sin conexión, mensaje descartado')
    return false
  }

  /** PUNTO DE ADAPTACIÓN: traduce el payload de Node-RED al contrato interno. */
  private normalize(raw: unknown): AdapterMessage | null {
    if (raw && typeof raw === 'object' && 'type' in raw) return raw as AdapterMessage
    return null
  }
}
