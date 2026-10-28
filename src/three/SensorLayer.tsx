/**
 * Los 9 sensores del modelo (Empties «Sensor_*» y «Medidor_General»): marca 3D, anillo de radar cuando hay actividad,
 * haz hasta el piso para ver en qué punto de la habitación están, y una tarjeta de vidrio con su estado en vivo
 * (al pasar el mouse; con un clic queda fija). La etiqueta corta de siempre se puede ocultar desde «Capas».
 *
 * Todo lo animado se mueve en useFrame (sin redibujar React); React solo se entera cuando cambia el estado del sensor.
 */
import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { DoorClosed, DoorOpen, Flame, Pin, Radar, X, Zap, type LucideIcon } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { DOORS, LIGHTS, METER, PIRS, SMOKE, TARIFF_COP_PER_KWH, type PirDef } from '../config/house.config'
import { fmtClock, fmtNumber } from '../lib/format'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import type { Markers } from './markers'
import { NearHtml } from './NearHtml'

type Vec = THREE.Vector3

/** Colores semánticos del HUD: esmeralda = bien, ámbar = energía/puerta, cian = sensores/presencia, coral = alerta */
const C = { ok: '#10b981', amber: '#f59e0b', cyan: '#06b6d4', alert: '#f43f5e', idle: '#94a3b8' }

const LABEL_LIFT: [number, number, number] = [0, 1.7, 0]
const CARD_LIFT: [number, number, number] = [0, 2.4, 0]

/* ───────────── Piezas comunes ───────────── */

/** Dos anillos que se expanden y se desvanecen, como un radar. Solo se ven mientras el sensor está activo. */
function RadarRings({ active, color }: { active: boolean; color: string }) {
  const rings = useRef<(THREE.Mesh | null)[]>([])
  useFrame(({ clock }) => {
    rings.current.forEach((r, i) => {
      if (!r) return
      r.visible = active
      if (!active) return
      const t = (clock.elapsedTime * 0.7 + i / 2) % 1
      r.scale.setScalar(0.8 + t * 5)
      ;(r.material as THREE.MeshBasicMaterial).opacity = 0.65 * (1 - t)
    })
  })
  return (
    <>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => void (rings.current[i] = m)} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[0.82, 1, 48]} />
          <meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

/** Haz vertical hasta el piso: dice dónde está el sensor dentro de la habitación. */
function Beam({ height, color, strong }: { height: number; color: string; strong: boolean }) {
  return (
    <mesh position={[0, -height / 2, 0]} raycast={() => null}>
      <cylinderGeometry args={[0.05, 0.05, height, 6]} />
      <meshBasicMaterial color={color} transparent opacity={strong ? 0.55 : 0.18} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function Row({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400">{k}</dt>
      <dd className="font-semibold text-slate-100" style={tone ? { color: tone } : undefined}>
        {v}
      </dd>
    </div>
  )
}

interface SensorProps {
  id: string
  position: Vec
  title: string
  icon: LucideIcon
  /** Color del estado actual (marca, radar y pastilla) */
  color: string
  /** Hay actividad: pulso y radar */
  active: boolean
  status: string
  /** Etiqueta corta de siempre (capa «Sensores») */
  tag: ReactNode
  /** Filas de la tarjeta */
  rows: ReactNode
  shape?: 'octa' | 'box'
}

/** Marca + radar + haz + etiqueta + tarjeta. Hover = vista previa; clic = fija la tarjeta (otro clic la cierra). */
function SensorPin({ id, position, title, icon: Icon, color, active, status, tag, rows, shape = 'octa' }: SensorProps) {
  const [hover, setHover] = useState(false)
  const pinned = useUiStore((s) => s.pinnedSensor === id)
  const setPinned = useUiStore((s) => s.setPinnedSensor)
  const showTag = useUiStore((s) => s.layers.sensors || s.focus)
  const focus = useUiStore((s) => s.focus)
  const mesh = useRef<THREE.Mesh>(null)
  const open = hover || pinned

  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const pulse = active ? 1.25 + Math.sin(clock.elapsedTime * 7) * 0.2 : hover || pinned ? 1.25 : 1
    m.scale.setScalar(pulse * (focus ? 1.5 : 1))
    m.rotation.y += 0.01
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(true)
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    setHover(false)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return // fue un arrastre de cámara
    e.stopPropagation()
    setPinned(pinned ? null : id)
  }

  return (
    <group position={position}>
      <mesh ref={mesh} onPointerOver={over} onPointerOut={out} onClick={click}>
        {shape === 'box' ? <boxGeometry args={[0.9, 0.9, 0.9]} /> : <octahedronGeometry args={[0.55]} />}
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <RadarRings active={active} color={color} />
      <Beam height={position.y - 0.15} color={color} strong={active || open || focus} />

      {/* Los <Html> quedan montados y solo se vacían: montarlos y desmontarlos seguido da errores en drei */}
      <NearHtml position={LABEL_LIFT} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        {!open && showTag ? tag : null}
      </NearHtml>

      <Html position={CARD_LIFT} center zIndexRange={[40, 30]} style={{ pointerEvents: pinned ? 'auto' : 'none' }}>
        {open && (
          <div className="sensor-card" role="dialog" aria-label={title}>
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `${color}26`, color }}>
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-slate-50">{title}</p>
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'animate-ping-slow' : ''}`} style={{ background: color }} />
                  {status}
                </p>
              </div>
              {pinned && (
                <button
                  type="button"
                  onClick={() => setPinned(null)}
                  aria-label="Cerrar tarjeta"
                  className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <dl className="space-y-1 text-[12px]">{rows}</dl>
            <p className="mt-2.5 flex items-center gap-1 border-t border-white/10 pt-2 text-[11px] text-slate-500">
              <Pin size={11} /> {pinned ? 'Fijada · clic en el sensor para soltarla' : 'Clic para fijar'}
            </p>
          </div>
        )}
      </Html>
    </group>
  )
}

const HIDDEN = 'Oculto en la vista pública'

/* ───────────── Humo ───────────── */

function SmokeSensor({ position }: { position: Vec }) {
  const { ppm, alarm, simulating } = useHouseStore((s) => s.smoke)
  const color = alarm ? C.alert : C.ok
  return (
    <SensorPin
      id={SMOKE.id}
      position={position}
      title={SMOKE.label}
      icon={Flame}
      color={color}
      active={alarm}
      status={alarm ? 'Crítico' : 'Normal'}
      tag={
        <div className={`tag3d ${alarm ? 'alarm-pulse !border-bad !bg-bad !text-white' : ''}`}>
          <Flame size={14} style={{ color: alarm ? '#fff' : C.ok }} />
          <span>{fmtNumber(ppm)} ppm</span>
        </div>
      }
      rows={
        <>
          <Row k="Concentración" v={`${fmtNumber(ppm)} ppm`} tone={color} />
          <Row k="Umbral de alarma" v={`${fmtNumber(SMOKE.alarmThresholdPpm)} ppm`} />
          <Row k="Fuga simulada" v={simulating ? 'Activa' : 'No'} />
        </>
      }
    />
  )
}

/* ───────────── PIR ───────────── */

function PirSensor({ def, position }: { def: PirDef; position: Vec }) {
  const pir = useHouseStore((s) => s.pir[def.id])
  const hidden = useHouseStore((s) => s.restricted)
  const motion = pir?.motion ?? false
  const color = hidden ? C.idle : motion ? C.cyan : C.idle
  const lights = def.lightIds.map((id) => LIGHTS.find((l) => l.id === id)?.label ?? id)
  return (
    <SensorPin
      id={def.id}
      position={position}
      title={`Movimiento · ${def.label}`}
      icon={Radar}
      color={color}
      active={motion}
      status={hidden ? 'Oculto' : motion ? 'Movimiento detectado' : 'Sin movimiento'}
      tag={
        <div className={`tag3d ${motion ? '!border-cool !bg-cool !text-white' : '!px-2 text-mute'}`} title={def.label}>
          <Radar size={14} />
          {def.primary ? (hidden ? 'Oculto' : motion ? 'Movimiento detectado' : 'Sin movimiento') : motion && 'Movimiento'}
        </div>
      }
      rows={
        hidden ? (
          <Row k="Estado" v={HIDDEN} />
        ) : (
          <>
            <Row k="Movimiento" v={motion ? 'Sí' : 'No'} tone={motion ? C.cyan : undefined} />
            <Row k="Último disparo" v={pir?.lastTriggerAt ? fmtClock(pir.lastTriggerAt) : '—'} />
            <Row k="Enciende" v={lights.join(', ')} />
          </>
        )
      }
    />
  )
}

/* ───────────── Puertas con sensor ───────────── */

function DoorSensor({ id, label, position }: { id: string; label: string; position: Vec }) {
  const open = useHouseStore((s) => s.doors[id]?.open ?? false)
  const hidden = useHouseStore((s) => s.restricted)
  const color = hidden ? C.idle : open ? C.amber : C.ok
  return (
    <SensorPin
      id={id}
      position={position}
      title={label}
      icon={open ? DoorOpen : DoorClosed}
      color={color}
      active={open}
      status={hidden ? 'Oculto' : open ? 'Abierta' : 'Cerrada'}
      tag={
        <div className={`tag3d ${open ? '!border-warm !bg-warm-soft !text-warm-strong' : '!px-2 text-mute'}`}>
          {open ? <DoorOpen size={14} /> : <DoorClosed size={14} />}
          {open ? 'Abierta' : hidden && 'Oculto'}
        </div>
      }
      rows={
        hidden ? (
          <Row k="Estado" v={HIDDEN} />
        ) : (
          <>
            <Row k="Estado" v={open ? 'Abierta' : 'Cerrada'} tone={color} />
            <Row k="Tipo" v="Contacto magnético" />
            <Row k="Acción" v="Clic en la puerta para abrir o cerrar" />
          </>
        )
      }
    />
  )
}

/* ───────────── Medidor ───────────── */

function Meter({ position }: { position: Vec }) {
  const power = useHouseStore((s) => s.power)
  const hidden = useHouseStore((s) => s.restricted)
  const b = power.breakdown
  if (hidden) {
    return (
      <SensorPin
        id={METER.id}
        position={position}
        title={METER.label}
        icon={Zap}
        color={C.idle}
        active={false}
        status="Oculto"
        shape="box"
        tag={
          <div className="tag3d !px-2 text-mute">
            <Zap size={14} /> Oculto
          </div>
        }
        rows={<Row k="Consumo" v={HIDDEN} />}
      />
    )
  }
  return (
    <SensorPin
      id={METER.id}
      position={position}
      title={METER.label}
      icon={Zap}
      color={C.amber}
      active={false}
      status={`${fmtNumber(power.watts)} W`}
      shape="box"
      tag={
        <div className="tag3d">
          <Zap size={14} style={{ color: C.amber }} />
          {fmtNumber(power.watts)} W
        </div>
      }
      rows={
        <>
          <Row k="Potencia" v={`${fmtNumber(power.watts)} W`} tone={C.amber} />
          <Row k="Energía" v={`${fmtNumber(power.kwhTotal, 3)} kWh`} />
          <Row k="Costo estimado" v={`$${fmtNumber(power.kwhTotal * TARIFF_COP_PER_KWH)} COP`} />
          {b && <Row k="Luces · A/C · enchufes" v={`${fmtNumber(b.lights)} · ${fmtNumber(b.ac)} · ${fmtNumber(b.plugs)} W`} />}
        </>
      }
    />
  )
}

/* ───────────── Capa completa ───────────── */

export function SensorLayer({ markers }: { markers: Markers }) {
  const smokePos = markers.get(SMOKE.id)
  const meterPos = markers.get(METER.id)
  const doorSensors = useMemo(() => DOORS.filter((d) => d.sensor), [])

  return (
    <>
      {smokePos && <SmokeSensor position={smokePos} />}
      {meterPos && <Meter position={meterPos} />}
      {PIRS.map((def) => {
        const pos = markers.get(def.id)
        return pos ? <PirSensor key={def.id} def={def} position={pos} /> : null
      })}
      {doorSensors.map((def) => {
        const pos = markers.get(def.id)
        return pos ? <DoorSensor key={def.id} id={def.id} label={def.label} position={pos} /> : null
      })}
    </>
  )
}
