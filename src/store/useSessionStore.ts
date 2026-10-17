/**
 * Estado de la SESIÓN de esta pantalla: qué rol tiene, si está pidiendo emparejarse, qué acciones sensibles esperan
 * confirmación y los avisos de rechazo. (Los datos de la casa viven en useHouseStore.)
 *
 * Importante: el rol que se guarda aquí lo manda el SERVIDOR (mensaje `session`). La interfaz no se lo puede dar a sí misma;
 * si alguien lo cambiara desde la consola del navegador solo conseguiría ver botones: Node-RED seguiría rechazando las órdenes.
 */
import { create } from 'zustand'
import { REJECT_TEXT, ROLE_LABEL } from '../config/security.config'
import { telemetry } from '../services/telemetry'
import type { SessionMessage, SessionRole } from '../types/iot'

export interface Notice {
  id: number
  tone: 'info' | 'warn' | 'error'
  text: string
}
export interface PendingConfirm {
  code: string
  kind: string
  summary: string
  ttlMs: number
  expiresAt: number
}

interface SessionStore {
  role: SessionRole
  dialogOpen: boolean
  pairing: boolean
  pairError: string | null
  confirms: PendingConfirm[]
  notices: Notice[]
  openDialog: () => void
  closeDialog: () => void
  pair: (key: string) => void
  logout: () => void
  notify: (tone: Notice['tone'], text: string) => void
  dismiss: (id: number) => void
  dropConfirm: (code: string) => void
  handle: (msg: SessionMessage) => void
  reset: () => void
}

let nextId = 1
const NOTICE_MS = 7000
const PAIR_TIMEOUT_MS = 8000
let pairTimer: ReturnType<typeof setTimeout> | undefined
const stopPairTimer = () => {
  if (pairTimer) clearTimeout(pairTimer)
  pairTimer = undefined
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  // Sin servidor (modo simulado local) no hay sesiones: todo está permitido
  role: telemetry.enforcesSessions ? 'lector' : 'administrador',
  dialogOpen: false,
  pairing: false,
  pairError: null,
  confirms: [],
  notices: [],

  openDialog: () => set({ dialogOpen: true, pairError: null }),
  closeDialog: () => {
    stopPairTimer()
    set({ dialogOpen: false, pairError: null, pairing: false })
  },

  pair: (key) => {
    set({ pairing: true, pairError: null })
    // Si Node-RED no contesta (apagado, reiniciándose, mensaje perdido), el diálogo no se queda esperando para siempre
    stopPairTimer()
    pairTimer = setTimeout(() => {
      pairTimer = undefined
      if (get().pairing) set({ pairing: false, pairError: REJECT_TEXT.timeout })
    }, PAIR_TIMEOUT_MS)
    telemetry.pair(key)
  },
  logout: () => {
    telemetry.unpair()
    set({ confirms: [] })
  },

  notify: (tone, text) => {
    const { notices } = get()
    if (notices.some((n) => n.text === text)) return // el mismo aviso no se repite mientras siga en pantalla
    const id = nextId++
    set({ notices: [...notices, { id, tone, text }].slice(-4) })
    setTimeout(() => get().dismiss(id), NOTICE_MS)
  },
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  dropConfirm: (code) => set((s) => ({ confirms: s.confirms.filter((c) => c.code !== code) })),

  handle: (msg) => {
    switch (msg.type) {
      case 'session': {
        stopPairTimer()
        const before = get().role
        // «lector» mientras se estaba emparejando = se cortó la conexión antes de la respuesta: se avisa en el diálogo
        const lostWhilePairing = get().pairing && msg.role === 'lector'
        // Con un Node-RED caído, cada intento fallido de reconexión repite «lector»: el aviso del diálogo no se borra por eso
        const pairError = lostWhilePairing ? REJECT_TEXT.no_connection : msg.role === 'lector' ? get().pairError : null
        set({ role: msg.role, pairing: false, pairError, ...(msg.role === 'lector' ? { confirms: [] } : {}) })
        if (msg.revoked) get().notify('warn', 'Un administrador revocó las sesiones de control: esta pantalla vuelve a solo lectura.')
        else if (msg.role !== before && msg.role !== 'lector') {
          set({ dialogOpen: false })
          get().notify('info', `Sesión emparejada como ${ROLE_LABEL[msg.role]}.`)
        }
        return
      }
      case 'confirm':
        set((s) => ({
          confirms: [...s.confirms.filter((c) => c.code !== msg.code), { code: msg.code, kind: msg.kind, summary: msg.summary, ttlMs: msg.ttlMs, expiresAt: Date.now() + msg.ttlMs }].slice(-8),
        }))
        return
      case 'reject': {
        const texto = REJECT_TEXT[msg.reason] ?? `El servidor rechazó la orden (${msg.reason}).`
        if (msg.kind === 'session.hello') {
          stopPairTimer()
          // Fallo al emparejar: se muestra dentro del diálogo si está abierto, si no, como aviso
          if (get().dialogOpen) set({ pairing: false, pairError: texto })
          else {
            set({ pairing: false })
            get().notify('warn', msg.reason === 'bad_key' ? 'La clave guardada en esta pestaña ya no es válida: vuelve a emparejar.' : texto)
          }
          return
        }
        if (msg.reason === 'mixed_content') {
          get().notify('error', 'El navegador bloquea ws:// desde una página https (contenido mixto). Configura VITE_NODERED_WS_URL con una dirección wss://.')
          return
        }
        if (msg.reason === 'forbidden') {
          const need = msg.need ? ROLE_LABEL[msg.need] : null
          get().notify('warn', need ? `${texto} Necesita rol ${need}.` : texto)
          return
        }
        get().notify(msg.reason === 'bad_confirm' || msg.reason === 'expired' ? 'warn' : 'error', texto)
        return
      }
    }
  },

  // Se perdió la conexión: la sesión se pierde con ella
  reset: () => {
    stopPairTimer()
    set({ role: telemetry.enforcesSessions ? 'lector' : 'administrador', confirms: [], pairing: false })
  },
}))
