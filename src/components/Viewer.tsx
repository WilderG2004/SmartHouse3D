import { Box, Droplets, Flame, Footprints, Lightbulb, LogOut, Map as MapIcon, Plug, Snowflake, Sun, Tags, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useCan } from '../hooks/useCan'
import { commands } from '../hooks/useTelemetry'
import { fmtHour } from '../lib/climate'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore, type LayerKey } from '../store/useUiStore'
import { HouseScene } from '../three/HouseScene'
import { WalkHud } from './WalkHud'

function ToolButton({
  active,
  onClick,
  children,
  label,
  compact,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  label: string
  /** Solo el icono (el nombre queda como ayuda al pasar el mouse) */
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'bg-brand-soft text-brand-strong' : 'text-mute hover:bg-raised hover:text-fg'
      }`}
    >
      {children}
      {!compact && <span className="hidden md:inline">{label}</span>}
    </button>
  )
}

const LAYERS: { key: LayerKey; label: string; icon: LucideIcon }[] = [
  { key: 'sensors', label: 'Sensores', icon: Tags },
  { key: 'bulbs', label: 'Bombillos', icon: Lightbulb },
  { key: 'climate', label: 'Temperatura', icon: Droplets },
  { key: 'ac', label: 'A/C', icon: Snowflake },
  { key: 'plugs', label: 'Enchufes', icon: Plug },
  { key: 'heat', label: 'Mapa de calor', icon: Flame },
]

export function Viewer() {
  const layers = useUiStore((s) => s.layers)
  const toggleLayer = useUiStore((s) => s.toggleLayer)
  const ambient = useUiStore((s) => s.ambient)
  const setAmbient = useUiStore((s) => s.setAmbient)
  const requestView = useUiStore((s) => s.requestView)
  const walking = useUiStore((s) => s.walking)
  const setWalking = useUiStore((s) => s.setWalking)
  const box = useRef<HTMLDivElement>(null)
  const alarm = useHouseStore((s) => s.smoke.alarm || s.security.alarm)
  // Solo valores que cambian poco (la hora se muestra en HH:MM): si no, todo el visor se redibujaba cada segundo
  const hourText = useHouseStore((s) => fmtHour(s.world.hour))
  const hourStep = useHouseStore((s) => Math.floor(s.world.hour * 2) / 2)
  const hourOverride = useHouseStore((s) => s.world.hourOverride)
  const canSetHour = useCan('world.setHour')

  // Al empezar el recorrido, la casa se acomoda en pantalla para que el panel de la derecha quede al lado
  useEffect(() => {
    if (walking) box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [walking])

  return (
    <div
      ref={box}
      data-walking={walking}
      className={`card relative min-h-[480px] overflow-hidden transition-all ${walking ? 'h-[76vh]' : 'h-[62vh]'} ${
        alarm ? '!border-bad ring-4 ring-bad/25' : ''
      }`}
    >
      <HouseScene />

      {/* Barra de herramientas */}
      <div className="glass absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-0.5 rounded-xl p-1">
        <ToolButton
          active={walking}
          onClick={() => setWalking(!walking)}
          label={walking ? 'Salir del recorrido' : 'Recorrer la casa'}
        >
          {walking ? <LogOut size={15} /> : <Footprints size={15} />}
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-line" />
        <ToolButton
          onClick={() => {
            setWalking(false)
            requestView('iso')
          }}
          label="Vista general"
        >
          <Box size={15} />
        </ToolButton>
        <ToolButton
          onClick={() => {
            setWalking(false)
            requestView('top')
          }}
          label="Planta"
        >
          <MapIcon size={15} />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-line" />
        {LAYERS.map(({ key, label, icon: Icon }) => (
          <ToolButton key={key} active={layers[key]} onClick={() => toggleLayer(key)} label={label} compact={walking}>
            <Icon size={15} />
          </ToolButton>
        ))}
      </div>

      {/* Hora del día y brillo */}
      <div className="glass absolute bottom-3 left-3 z-30 flex flex-col gap-2.5 rounded-xl px-3.5 py-3 text-xs text-mute">
        <label className="flex items-center gap-2.5">
          <Sun size={16} className="shrink-0 text-warm-strong" />
          <span className="w-11 shrink-0 text-sm font-semibold text-fg">{hourText}</span>
          <input
            type="range"
            min={0}
            max={23.5}
            step={0.5}
            value={hourStep}
            onChange={(e) => commands.setHour(Number(e.target.value))}
            disabled={!canSetHour}
            title={canSetHour ? undefined : 'Cambiar la hora simulada requiere rol Administrador'}
            aria-label="Hora del día simulada"
            className="w-36 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => commands.setHour(null)}
            disabled={!hourOverride || !canSetHour}
            className="rounded-md px-2 py-0.5 text-xs font-semibold text-brand-strong hover:bg-brand-soft disabled:text-mute disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Auto
          </button>
        </label>
        <label className="flex items-center gap-2.5">
          <Lightbulb size={16} className="shrink-0" />
          <span className="w-11 shrink-0">Brillo</span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={ambient}
            onChange={(e) => setAmbient(Number(e.target.value))}
            aria-label="Brillo ambiental"
            className="w-36"
          />
        </label>
      </div>

      {walking ? (
        <WalkHud />
      ) : (
        <p className="glass pointer-events-none absolute bottom-3 right-3 z-30 hidden rounded-lg px-3 py-2 text-xs text-mute lg:block">
          Arrastra para girar · rueda para acercar · clic en bombillos, puertas, A/C y enchufes
        </p>
      )}
    </div>
  )
}
