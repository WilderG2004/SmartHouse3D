/**
 * Lo que se ve encima del 3D mientras recorres la casa en primera persona:
 * en que habitacion estas (con su temperatura), la puerta que tienes al frente (tecla E),
 * botones para ir a otra habitacion y un mini-mapa donde se ve donde estas parado, hacia donde miras,
 * las puertas y las luces (encendidas en ambar). Un clic en el mini-mapa te lleva a ese lugar.
 *
 * El movimiento en si esta en three/WalkMode.tsx; aqui solo se muestra.
 */
import { ChevronDown, ChevronUp, DoorClosed, DoorOpen, Droplets, Lightbulb, Thermometer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LIGHTS, ROOMS, roomLabel } from '../config/house.config'
import { fmtNumber } from '../lib/format'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import type { FloorPlan } from '../three/floorplan'
import { walkState } from '../three/walkState'

const MAP_W = 196
const PAD = 1.5 // margen del plano, en unidades del modelo

/* ───────────── Mini-mapa ───────────── */

function MiniMap() {
  const ref = useRef<HTMLCanvasElement>(null)
  const scaleRef = useRef({ s: 1, x0: 0, z0: 0 })

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    let builtFor: FloorPlan | null = null
    let base: HTMLCanvasElement | null = null // las paredes se dibujan una vez; el resto, 10 veces por segundo
    let H = MAP_W

    const build = (plan: FloorPlan) => {
      const { bounds: b } = plan
      const s = MAP_W / (b.maxX - b.minX + PAD * 2)
      H = Math.round((b.maxZ - b.minZ + PAD * 2) * s)
      scaleRef.current = { s, x0: b.minX - PAD, z0: b.minZ - PAD }
      cv.width = MAP_W * dpr
      cv.height = H * dpr
      cv.style.width = `${MAP_W}px`
      cv.style.height = `${H}px`

      base = document.createElement('canvas')
      base.width = cv.width
      base.height = cv.height
      const g = base.getContext('2d')!
      g.scale(dpr, dpr)
      const px = (x: number) => (x - scaleRef.current.x0) * s
      const pz = (z: number) => (z - scaleRef.current.z0) * s
      g.fillStyle = '#e4ece8'
      for (const f of plan.floors) g.fillRect(px(f.minX), pz(f.minZ), (f.maxX - f.minX) * s, (f.maxZ - f.minZ) * s)
      g.strokeStyle = '#3e564e'
      g.lineWidth = 1.4
      g.lineCap = 'round'
      g.beginPath()
      const d = plan.drawSegs
      for (let i = 0; i < d.length; i += 4) {
        g.moveTo(px(d[i]), pz(d[i + 1]))
        g.lineTo(px(d[i + 2]), pz(d[i + 3]))
      }
      g.stroke()
      builtFor = plan
    }

    const draw = () => {
      const plan = walkState.plan
      if (!plan) return
      if (plan !== builtFor) build(plan)
      if (!base) return
      const { s, x0, z0 } = scaleRef.current
      const px = (x: number) => (x - x0) * s
      const pz = (z: number) => (z - z0) * s

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, MAP_W, H)
      ctx.drawImage(base, 0, 0, MAP_W, H)

      // Puertas (con la posicion que tienen ahora)
      const doors = useHouseStore.getState().doors
      for (const dr of walkState.doors) {
        const p = dr.pts
        ctx.beginPath()
        ctx.moveTo(px(p[0]), pz(p[1]))
        for (let k = 1; k < 4; k++) ctx.lineTo(px(p[k * 2]), pz(p[k * 2 + 1]))
        ctx.closePath()
        ctx.fillStyle = doors[dr.id]?.open ? '#a65a06' : '#8a6a4c'
        ctx.fill()
      }

      // Luces
      const lights = useHouseStore.getState().lights
      for (const l of walkState.lights) {
        const on = !!lights[l.id]?.on
        ctx.beginPath()
        ctx.arc(px(l.x), pz(l.z), on ? 3.6 : 2.6, 0, Math.PI * 2)
        ctx.fillStyle = on ? '#f4a21d' : '#aab8b2'
        ctx.fill()
      }

      // La persona: un punto con el "cono" de lo que ve
      const cx = px(walkState.x)
      const cz = pz(walkState.z)
      const ang = Math.atan2(-Math.cos(walkState.yaw), -Math.sin(walkState.yaw))
      ctx.beginPath()
      ctx.moveTo(cx, cz)
      ctx.arc(cx, cz, 26, ang - 0.65, ang + 0.65)
      ctx.closePath()
      ctx.fillStyle = 'rgba(15, 118, 110, 0.22)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx, cz, 5.5, 0, Math.PI * 2)
      ctx.fillStyle = '#0f766e'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
    }

    draw()
    const id = window.setInterval(draw, 100)
    return () => window.clearInterval(id)
  }, [])

  const goThere = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const { s, x0, z0 } = scaleRef.current
    useUiStore.getState().requestWalkTo({ x: x0 + (e.clientX - r.left) / s, z: z0 + (e.clientY - r.top) / s })
  }

  return (
    <canvas
      ref={ref}
      onClick={goThere}
      title="Clic para ir a ese lugar"
      aria-label="Mini-mapa de la casa: clic para ir a ese lugar"
      className="block cursor-crosshair rounded-lg"
      width={MAP_W}
      height={MAP_W}
    />
  )
}

/* ───────────── Pantalla de recorrido ───────────── */

export function WalkHud() {
  const room = useUiStore((s) => s.walkRoom)
  const hint = useUiStore((s) => s.walkHint)
  const requestWalkTo = useUiStore((s) => s.requestWalkTo)
  // La lista de habitaciones tapa parte de la casa: arranca abierta solo en pantallas grandes
  const [places, setPlaces] = useState(() => window.innerWidth >= 1700)
  const climate = useHouseStore((s) => (room && room !== 'exterior' ? s.climate[room] : undefined))
  const lights = useHouseStore((s) => s.lights)
  const hintOpen = useHouseStore((s) => (hint ? !!s.doors[hint.id]?.open : false))

  const label = room === 'exterior' ? 'Afuera de la casa' : room ? roomLabel(room) : '…'
  const roomLights = room && room !== 'exterior' ? LIGHTS.filter((l) => l.room === roomLabel(room)) : []
  const lightsOn = roomLights.filter((l) => lights[l.id]?.on).length

  return (
    <>
      {/* Donde estoy */}
      <div className="glass pointer-events-none absolute left-3 top-[var(--hud-top)] z-30 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-full px-4 py-2 text-sm md:max-w-[calc(100%-17rem)]">
        <span className="font-semibold text-fg">{label}</span>
        {climate && (
          <>
            <span className="flex items-center gap-1 text-mute">
              <Thermometer size={14} /> {fmtNumber(climate.temperature, 1)} °C
            </span>
            <span className="flex items-center gap-1 text-mute">
              <Droplets size={14} /> {fmtNumber(climate.humidity)} %
            </span>
          </>
        )}
        {roomLights.length > 0 && (
          <span className="flex items-center gap-1 text-mute">
            <Lightbulb size={14} /> {lightsOn} de {roomLights.length} {roomLights.length === 1 ? 'luz' : 'luces'}
          </span>
        )}
      </div>

      {/* Mira */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-30 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 ring-2 ring-black/30" />

      {/* Puerta al frente */}
      {hint && (
        <div className="glass pointer-events-none absolute bottom-24 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium text-fg md:left-[calc((100%-var(--hud-right)+0.75rem)/2)] md:max-w-[calc(100%-var(--hud-right)-16rem)] lg:bottom-20">
          <kbd className="rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-bold text-brand-strong">E</kbd>
          {hintOpen ? <DoorOpen size={16} className="text-warm-strong" /> : <DoorClosed size={16} className="text-mute" />}
          <span className="min-w-0 truncate">
            {hintOpen ? 'Cerrar' : 'Abrir'} · {hint.label}
          </span>
        </div>
      )}

      {/* Ir a otra habitacion */}
      <div className="glass absolute right-[var(--hud-right)] top-[var(--hud-top)] z-30 hidden max-w-[15rem] flex-col gap-1.5 rounded-xl p-1.5 md:flex">
        <button
          type="button"
          onClick={() => setPlaces((v) => !v)}
          aria-expanded={places}
          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs font-semibold uppercase tracking-wide text-mute hover:bg-raised hover:text-fg"
        >
          Ir a
          {places ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {places && (
          <div className="flex flex-wrap gap-1 px-0.5 pb-0.5">
            {ROOMS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => requestWalkTo({ roomId: r.id })}
                aria-pressed={room === r.id}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                  room === r.id ? 'bg-brand-soft text-brand-strong' : 'text-mute hover:bg-raised hover:text-fg'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mini-mapa y ayuda */}
      <div className="glass absolute bottom-20 right-[var(--hud-right)] z-30 hidden flex-col gap-2 rounded-xl p-2.5 md:flex">
        <MiniMap />
        <p className="max-w-[196px] text-xs leading-snug text-mute">
          <b className="text-fg">W A S D</b> o flechas: caminar · <b className="text-fg">arrastra</b>: mirar · <b className="text-fg">Shift</b>: correr ·{' '}
          <b className="text-fg">E</b>: puerta · <b className="text-fg">Esc</b>: salir
        </p>
      </div>
    </>
  )
}
