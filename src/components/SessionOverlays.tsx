/**
 * Ventanas y avisos de la sesión: emparejar, confirmar una acción sensible y mensajes de rechazo.
 * Se montan una sola vez en App.
 */
import { CircleCheck, Info, KeyRound, LogOut, ShieldAlert, Timer, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ROLE_HELP, ROLE_LABEL } from '../config/security.config'
import { telemetry } from '../services/telemetry'
import { useSessionStore, type Notice, type PendingConfirm } from '../store/useSessionStore'

/** Marco común de las ventanas: fondo oscuro, foco dentro, Esc para cerrar. */
function Modal({ title, icon, onClose, children }: { title: string; icon: ReactNode; onClose?: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  // onClose cambia en cada render (la cuenta regresiva repinta): se guarda en una ref para montar el foco una sola vez
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeRef.current) {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-md p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {icon} {title}
          </h2>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-mute hover:bg-raised hover:text-fg">
              <X size={16} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

function PairDialog() {
  const role = useSessionStore((s) => s.role)
  const user = useSessionStore((s) => s.user)
  const pairing = useSessionStore((s) => s.pairing)
  const error = useSessionStore((s) => s.pairError)
  const close = useSessionStore((s) => s.closeDialog)
  const pair = useSessionStore((s) => s.pair)
  const logout = useSessionStore((s) => s.logout)
  const [key, setKey] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!key.trim() || pairing) return
    pair(key)
    setKey('') // la clave no se queda en pantalla ni en el estado de React
  }

  // Ya emparejada: se muestra el rol y se puede cerrar la sesión de control (o revocar las demás)
  if (role !== 'lector' || user) {
    return (
      <Modal title="Sesión emparejada" icon={<KeyRound size={18} className="text-brand-strong" />} onClose={close}>
        <p className="text-sm">
          Esta pantalla actúa como <strong>{ROLE_LABEL[role]}</strong>
          {user && (
            <>
              {' '}con el usuario <strong>{user}</strong> (queda en la auditoría)
            </>
          )}
          .
        </p>
        <p className="mt-1 text-xs text-mute">{ROLE_HELP[role]}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            data-autofocus
            onClick={() => {
              logout()
              close()
            }}
            className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3.5 py-2 text-sm font-semibold hover:border-brand"
          >
            <LogOut size={15} /> Cerrar sesión (vista pública)
          </button>
          {role === 'administrador' && (
            <button
              type="button"
              onClick={() => {
                telemetry.revokeOthers()
                close()
              }}
              title="Baja a solo lectura a las demás pantallas y congela el emparejamiento 5 minutos"
              className="flex items-center gap-2 rounded-xl border border-bad bg-bad-soft px-3.5 py-2 text-sm font-semibold text-bad-strong hover:bg-bad hover:text-white"
            >
              <ShieldAlert size={15} /> Revocar las otras sesiones
            </button>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Emparejar esta pantalla" icon={<KeyRound size={18} className="text-brand-strong" />} onClose={close}>
      <form onSubmit={submit}>
        <p className="text-xs text-mute">
          Pega tu <strong>clave personal</strong> (la que te dio quien administra el servidor) o una clave compartida. El servidor decide qué rol
          recibe esta pantalla y anota tu nombre en la auditoría. Se guarda solo en esta pestaña.
        </p>
        <label className="mt-3 block text-xs font-semibold" htmlFor="pair-key">
          Clave de emparejamiento
        </label>
        <input
          id="pair-key"
          data-autofocus
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          maxLength={128}
          className="mt-1 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-brand"
          aria-describedby={error ? 'pair-error' : undefined}
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p id="pair-error" role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-bad-strong">
            <TriangleAlert size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-xl px-3.5 py-2 text-sm font-semibold text-mute hover:bg-raised">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!key.trim() || pairing}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/85 disabled:opacity-50"
          >
            {pairing ? 'Comprobando…' : 'Emparejar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Cuenta regresiva hasta `expiresAt`, en décimas de segundo. */
function useRemaining(expiresAt: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [])
  return Math.max(0, expiresAt - now)
}

function ConfirmDialog({ c, total }: { c: PendingConfirm; total: number }) {
  const drop = useSessionStore((s) => s.dropConfirm)
  const remaining = useRemaining(c.expiresAt)
  useEffect(() => {
    if (remaining <= 0) drop(c.code)
  }, [remaining, c.code, drop])

  return (
    <Modal title="Confirmar acción" icon={<ShieldAlert size={18} className="text-warm-strong" />} onClose={() => drop(c.code)}>
      <p className="text-sm font-semibold">{c.summary}</p>
      <p className="mt-1 text-xs text-mute">
        Es una acción sensible: el servidor no la ejecuta hasta que la confirmes con este código de un solo uso, que solo sirve para esta pantalla.
      </p>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-raised px-3.5 py-2.5">
        <code className="font-mono text-lg font-bold tracking-widest" aria-label="Código de confirmación">
          {c.code}
        </code>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-mute" aria-live="off">
          <Timer size={14} /> {(remaining / 1000).toFixed(1)} s
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
        <div className="h-full bg-warm transition-[width] duration-200" style={{ width: `${Math.min(100, (remaining / Math.max(1, c.ttlMs)) * 100)}%` }} />
      </div>
      {total > 1 && <p className="mt-2 text-xs text-mute">Hay {total - 1} más en espera.</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => drop(c.code)} className="rounded-xl px-3.5 py-2 text-sm font-semibold text-mute hover:bg-raised">
          Cancelar
        </button>
        <button
          type="button"
          data-autofocus
          onClick={() => {
            telemetry.confirm(c.code)
            drop(c.code)
          }}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/85"
        >
          Confirmar
        </button>
      </div>
    </Modal>
  )
}

const TONE: Record<Notice['tone'], { box: string; icon: ReactNode }> = {
  info: { box: 'border-ok bg-ok-soft text-ok-strong', icon: <CircleCheck size={16} /> },
  warn: { box: 'border-warm bg-warm-soft text-warm-strong', icon: <Info size={16} /> },
  error: { box: 'border-bad bg-bad-soft text-bad-strong', icon: <TriangleAlert size={16} /> },
}

function Notices() {
  const notices = useSessionStore((s) => s.notices)
  const dismiss = useSessionStore((s) => s.dismiss)
  if (!notices.length) return null
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[60] flex flex-col items-center gap-2 sm:left-auto sm:items-end">
      {notices.map((n) => (
        <div
          key={n.id}
          role={n.tone === 'info' ? 'status' : 'alert'}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-card ${TONE[n.tone].box}`}
        >
          <span className="mt-0.5 shrink-0">{TONE[n.tone].icon}</span>
          <p className="flex-1 font-medium text-fg">{n.text}</p>
          <button type="button" onClick={() => dismiss(n.id)} aria-label="Cerrar aviso" className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function SessionOverlays() {
  const dialogOpen = useSessionStore((s) => s.dialogOpen)
  const confirms = useSessionStore((s) => s.confirms)
  return (
    <>
      {dialogOpen && <PairDialog />}
      {!dialogOpen && confirms.length > 0 && <ConfirmDialog key={confirms[0].code} c={confirms[0]} total={confirms.length} />}
      <Notices />
    </>
  )
}
