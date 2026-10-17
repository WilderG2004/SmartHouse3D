/**
 * Piezas visibles de la SESIÓN en la interfaz: chip de cifrado, chip de rol, aviso de «solo lectura» y etiqueta de rol.
 * Nada de esto es un control de acceso (lo es Node-RED); sirve para que se vea en qué estado está esta pantalla.
 */
import { Eye, KeyRound, Lock, LockOpen, ShieldCheck } from 'lucide-react'
import { ROLE_LABEL } from '../config/security.config'
import { useRole } from '../hooks/useCan'
import { telemetry } from '../services/telemetry'
import { useSessionStore } from '../store/useSessionStore'
import type { SessionRole } from '../types/iot'

const chip = 'flex items-center gap-2 rounded-full border bg-panel px-3.5 py-2 text-sm shadow-card'

/** Candado: ¿el canal con el backend va cifrado (wss://) o no (ws://)? */
export function TransportChip() {
  if (telemetry.secureTransport === null) return null
  const ok = telemetry.secureTransport
  return (
    <div
      className={`${chip} ${ok ? 'border-line' : 'border-warm bg-warm-soft'}`}
      title={
        ok
          ? 'La conexión con el backend va cifrada (wss://).'
          : 'La conexión con el backend NO va cifrada (ws://): solo es aceptable en tu propio equipo. Desplegado, usa wss://.'
      }
    >
      {ok ? <Lock size={16} className="text-ok-strong" /> : <LockOpen size={16} className="text-warm-strong" />}
      <span className="font-semibold">{ok ? 'Canal cifrado' : 'Sin cifrar'}</span>
    </div>
  )
}

/** Rol de esta pantalla. Al hacer clic abre el diálogo para emparejar (o para cerrar la sesión de control). */
export function SessionChip() {
  const { role, enforced } = useRole()
  const openDialog = useSessionStore((s) => s.openDialog)
  if (!enforced) return null
  const control = role !== 'lector'
  const Icon = role === 'lector' ? Eye : role === 'operador' ? KeyRound : ShieldCheck
  return (
    <button
      type="button"
      onClick={openDialog}
      aria-haspopup="dialog"
      title={control ? 'Sesión emparejada. Clic para ver o cerrar.' : 'Esta pantalla solo puede ver. Clic para emparejarla con la clave.'}
      className={`${chip} font-semibold transition-colors ${
        control ? 'border-brand text-brand-strong' : 'border-line text-mute hover:text-fg'
      }`}
    >
      <Icon size={16} />
      {ROLE_LABEL[role]}
    </button>
  )
}

/** Aviso fijo arriba del panel de control cuando la sesión solo puede ver. */
export function ReadOnlyBanner() {
  const openDialog = useSessionStore((s) => s.openDialog)
  return (
    <div className="rounded-xl border border-warm bg-warm-soft p-3.5 text-sm" role="note">
      <p className="flex items-center gap-2 font-semibold text-warm-strong">
        <Eye size={16} /> Solo lectura
      </p>
      <p className="mt-1 text-xs text-fg">
        Puedes ver todo, pero el servidor rechaza las órdenes de una pantalla sin emparejar. Los controles están desactivados.
      </p>
      <button
        type="button"
        onClick={openDialog}
        className="mt-2.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong"
      >
        Emparejar con la clave
      </button>
    </div>
  )
}

/** Etiqueta pequeña «Solo Administrador» para los controles que exigen ese rol. */
export function RoleTag({ need }: { need: SessionRole }) {
  const { role, enforced } = useRole()
  if (!enforced || role === need || role === 'administrador') return null
  return (
    <span className="flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-mute" title={`Requiere rol ${ROLE_LABEL[need]}`}>
      <Lock size={11} /> Solo {ROLE_LABEL[need]}
    </span>
  )
}
