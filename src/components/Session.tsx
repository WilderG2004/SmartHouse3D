/**
 * Piezas visibles de la SESIÓN en la interfaz: chip de cifrado, chip de rol, aviso de «solo lectura» y etiqueta de rol.
 * Nada de esto es un control de acceso (lo es Node-RED); sirve para que se vea en qué estado está esta pantalla.
 */
import { Eye, EyeOff, KeyRound, Lock, LockOpen, ShieldCheck, UserRound } from 'lucide-react'
import { ROLE_LABEL } from '../config/security.config'
import { useRole } from '../hooks/useCan'
import { telemetry } from '../services/telemetry'
import { useSessionStore } from '../store/useSessionStore'
import type { SessionRole } from '../types/iot'

const chip = 'flex min-h-8 items-center gap-2 rounded-full border bg-white/[0.04] px-3 py-1.5 text-sm'

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
      <span className="hidden font-semibold xl:inline">{ok ? 'Canal cifrado' : 'Sin cifrar'}</span>
    </div>
  )
}

/** Rol de esta pantalla. Al hacer clic abre el diálogo para emparejar (o para cerrar la sesión de control). */
export function SessionChip() {
  const { role, enforced } = useRole()
  const user = useSessionStore((s) => s.user)
  const openDialog = useSessionStore((s) => s.openDialog)
  if (!enforced) return null
  const control = role !== 'lector' || !!user
  const Icon = role === 'lector' ? (user ? UserRound : Eye) : role === 'operador' ? KeyRound : ShieldCheck
  return (
    <button
      type="button"
      onClick={openDialog}
      aria-haspopup="dialog"
      title={control ? 'Sesión emparejada. Clic para ver o cerrar.' : 'Vista pública. Clic para emparejar esta pantalla con tu clave.'}
      className={`${chip} font-semibold transition-colors ${
        control ? 'border-brand text-brand-strong' : 'border-line text-mute hover:text-fg'
      }`}
    >
      <Icon size={16} />
      {ROLE_LABEL[role]}
      {user && <span className="font-medium text-mute">· {user}</span>}
    </button>
  )
}

/** Aviso fijo arriba del panel de control cuando la sesión solo puede ver. */
export function ReadOnlyBanner() {
  const openDialog = useSessionStore((s) => s.openDialog)
  const user = useSessionStore((s) => s.user)
  if (user) {
    return (
      <div className="rounded-xl border border-line bg-raised p-3.5 text-sm" role="note">
        <p className="flex items-center gap-2 font-semibold">
          <Eye size={16} /> Solo lectura · {user}
        </p>
        <p className="mt-1 text-xs text-mute">Tu usuario puede ver todo, pero no dar órdenes. Los controles están desactivados.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-warm bg-warm-soft p-3.5 text-sm" role="note">
      <p className="flex items-center gap-2 font-semibold text-warm-strong">
        <Eye size={16} /> Vista pública
      </p>
      <p className="mt-1 text-xs text-fg">
        Ves luces, clima, energía y humo. La alarma, el movimiento, las puertas, los eventos y el historial solo llegan a una
        pantalla emparejada (revelan si hay alguien en casa), y el servidor rechaza sus órdenes.
      </p>
      <button
        type="button"
        onClick={openDialog}
        className="mt-2.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand/85"
      >
        Emparejar con la clave
      </button>
    </div>
  )
}

/**
 * Lo que va en lugar de un dato que la vista pública no recibe (alarma, movimiento, puertas, eventos, alertas).
 * Sin botón: suele quedar dentro del panel desactivado; para emparejar está el chip de rol de arriba.
 */
export function HiddenNote({ what }: { what: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-raised px-3.5 py-3 text-xs text-mute" role="note">
      <EyeOff size={16} className="mt-0.5 shrink-0" />
      <span>{what} no se muestra en la vista pública: revelaría si hay alguien en casa. Empareja la pantalla para verlo.</span>
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
