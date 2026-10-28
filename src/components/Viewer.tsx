import {
  Armchair,
  Bath,
  BedDouble,
  Box,
  ChefHat,
  ChevronDown,
  Droplets,
  Flame,
  Footprints,
  Layers,
  Lightbulb,
  LogOut,
  Map as MapIcon,
  Moon,
  Plug,
  ScanEye,
  Snowflake,
  Sparkles,
  Sun,
  SunMoon,
  Tags,
  Tv,
  WashingMachine,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CAMERA_ZONES, type CameraZoneId } from '../config/house.config'
import { useCan } from '../hooks/useCan'
import { commands } from '../hooks/useTelemetry'
import { fmtHour } from '../lib/climate'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore, type LayerKey, type SkyMode, type ViewPreset } from '../store/useUiStore'
import { HouseScene } from '../three/HouseScene'
import type { WallMode } from '../three/materials'
import { Segmented, Switch } from './ui'
import { WalkHud } from './WalkHud'

/* ───────────── Barra de cámara (abajo, al centro) ───────────── */

const ZONE_ICONS: Record<CameraZoneId, LucideIcon> = {
  sala: Tv,
  dormitorios: BedDouble,
  cocina: ChefHat,
  banos: Bath,
  lavanderia: WashingMachine,
}

const VIEWS: { id: ViewPreset; label: string; icon: LucideIcon }[] = [
  { id: 'iso', label: 'Vista general', icon: Box },
  { id: 'top', label: 'Planta', icon: MapIcon },
  ...CAMERA_ZONES.map((z) => ({ id: z.id, label: z.label, icon: ZONE_ICONS[z.id] })),
]

function DockButton({
  active,
  onClick,
  label,
  icon: Icon,
  tone = 'brand',
}: {
  active?: boolean
  onClick: () => void
  label: string
  icon: LucideIcon
  tone?: 'brand' | 'warm'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all ${
        active
          ? tone === 'warm'
            ? 'bg-warm text-slate-950 shadow-[0_0_18px_rgb(245_158_11/0.45)]'
            : 'bg-brand-soft text-brand-strong ring-1 ring-brand/50'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon size={16} />
      <span className="hidden 2xl:inline">{label}</span>
    </button>
  )
}

function CameraDock() {
  const requestView = useUiStore((s) => s.requestView)
  const current = useUiStore((s) => s.viewRequest.preset)
  const walking = useUiStore((s) => s.walking)
  const setWalking = useUiStore((s) => s.setWalking)

  return (
    <nav
      aria-label="Cámara"
      className="glass absolute bottom-3 left-[calc((100%-var(--hud-right)+0.75rem)/2)] z-30 flex max-w-[calc(100%-var(--hud-right)-0.75rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-2xl p-1.5"
    >
      {VIEWS.map((v) => (
        <DockButton
          key={v.id}
          label={v.label}
          icon={v.icon}
          active={!walking && current === v.id}
          onClick={() => {
            setWalking(false)
            requestView(v.id)
          }}
        />
      ))}
      <span className="mx-1 h-6 w-px shrink-0 bg-white/10" />
      <DockButton
        tone="warm"
        active={walking}
        onClick={() => setWalking(!walking)}
        label={walking ? 'Salir del recorrido' : 'Recorrer la casa'}
        icon={walking ? LogOut : Footprints}
      />
    </nav>
  )
}

/* ───────────── Panel de capas y ambiente (izquierda) ───────────── */

const LAYERS: { key: LayerKey; label: string; icon: LucideIcon }[] = [
  { key: 'sensors', label: 'Etiquetas', icon: Tags },
  { key: 'bulbs', label: 'Bombillos', icon: Lightbulb },
  { key: 'climate', label: 'Temperatura', icon: Droplets },
  { key: 'ac', label: 'A/C', icon: Snowflake },
  { key: 'plugs', label: 'Enchufes', icon: Plug },
  { key: 'heat', label: 'Mapa de calor', icon: Flame },
]

const WALL_MODES: { id: WallMode; label: string }[] = [
  { id: 'solid', label: 'Sólidas' },
  { id: 'cut', label: 'Cortadas' },
  { id: 'xray', label: 'Rayos X' },
]

const SKY_MODES: { id: SkyMode; label: string; icon: React.ReactNode }[] = [
  { id: 'auto', label: 'Auto', icon: <SunMoon size={14} /> },
  { id: 'day', label: 'Día', icon: <Sun size={14} /> },
  { id: 'night', label: 'Noche', icon: <Moon size={14} /> },
]

function ToggleRow({ icon: Icon, label, hint, checked, onChange }: { icon: LucideIcon; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={16} className={checked ? 'text-brand-strong' : 'text-mute'} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {hint && <p className="text-xs leading-tight text-mute">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

function LayersTab() {
  const layers = useUiStore((s) => s.layers)
  const toggleLayer = useUiStore((s) => s.toggleLayer)
  const wallMode = useUiStore((s) => s.wallMode)
  const setWallMode = useUiStore((s) => s.setWallMode)
  const furniture = useUiStore((s) => s.furniture)
  const setFurniture = useUiStore((s) => s.setFurniture)
  const focus = useUiStore((s) => s.focus)
  const setFocus = useUiStore((s) => s.setFocus)

  return (
    <div className="space-y-3.5">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mute">Paredes</p>
        <Segmented
          value={focus ? 'xray' : wallMode}
          options={WALL_MODES}
          onChange={(m) => {
            setFocus(false)
            setWallMode(m)
          }}
          label="Paredes"
        />
      </div>
      <ToggleRow icon={Armchair} label="Muebles" hint={furniture ? 'Visibles' : 'Solo estructura'} checked={furniture} onChange={setFurniture} />
      <ToggleRow icon={Sparkles} label="Destacar sensores y luces" hint="Casa translúcida" checked={focus} onChange={setFocus} />
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-mute">Capas</p>
        <div className="grid grid-cols-2 gap-1">
          {LAYERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={layers[key]}
              onClick={() => toggleLayer(key)}
              className={`flex min-h-8 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                layers[key] ? 'bg-cool-soft text-cool-strong' : 'text-mute hover:bg-white/5 hover:text-fg'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function AmbientTab() {
  const skyMode = useUiStore((s) => s.skyMode)
  const setSkyMode = useUiStore((s) => s.setSkyMode)
  const ambient = useUiStore((s) => s.ambient)
  const setAmbient = useUiStore((s) => s.setAmbient)
  // Solo valores que cambian poco (la hora se muestra en HH:MM): si no, el panel se redibujaba cada segundo
  const hourText = useHouseStore((s) => fmtHour(s.world.hour))
  const hourStep = useHouseStore((s) => Math.floor(s.world.hour * 2) / 2)
  const hourOverride = useHouseStore((s) => s.world.hourOverride)
  const canSetHour = useCan('world.setHour')

  return (
    <div className="space-y-3.5 text-xs text-mute">
      <div>
        <p className="mb-1.5 font-semibold uppercase tracking-wide">Modo</p>
        <Segmented value={skyMode} options={SKY_MODES} onChange={setSkyMode} label="Modo día o noche" />
        <p className="mt-1.5 leading-snug">
          {skyMode === 'auto' ? 'Sigue la hora simulada de la casa.' : 'Solo cambia la vista: la hora de la casa sigue igual.'}
        </p>
      </div>
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
        />
      </label>
    </div>
  )
}

function SidePanel() {
  const [tab, setTab] = useState<'capas' | 'ambiente'>('capas')
  // En el celular empieza plegado para no tapar la casa
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1280) // entre 1024 y 1279 px taparía media casa

  return (
    <div className="glass absolute left-3 top-[var(--hud-top)] z-30 w-72 max-w-[calc(100%-1.5rem)] rounded-2xl">
      <div className="flex items-center gap-1 p-1.5">
        {open ? (
          <div className="flex-1">
            <Segmented
              value={tab}
              onChange={setTab}
              label="Panel del visor"
              options={[
                { id: 'capas', label: 'Capas', icon: <Layers size={14} /> },
                { id: 'ambiente', label: 'Ambiente', icon: <SunMoon size={14} /> },
              ]}
            />
          </div>
        ) : (
          <span className="flex flex-1 items-center gap-2 px-2 text-sm font-semibold">
            <ScanEye size={16} className="text-cool-strong" /> Capas y ambiente
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Plegar el panel' : 'Desplegar el panel'}
          className="rounded-lg p-2 text-mute hover:bg-white/10 hover:text-fg"
        >
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-line p-3.5">
          {tab === 'capas' ? <LayersTab /> : <AmbientTab />}
          <p className="mt-3.5 border-t border-line pt-2.5 text-xs leading-snug text-mute">
            Arrastra para girar · rueda para acercar · pasa el mouse por un sensor o una puerta; clic para fijar o abrir
          </p>
        </div>
      )}
    </div>
  )
}

/* ───────────── Visor ───────────── */

export function Viewer() {
  const walking = useUiStore((s) => s.walking)
  const box = useRef<HTMLDivElement>(null)
  const alarm = useHouseStore((s) => s.smoke.alarm || s.security.alarm)

  // En el celular (visor en la página, no a pantalla completa) el recorrido acomoda la casa en pantalla
  useEffect(() => {
    if (walking && window.innerWidth < 1024) box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [walking])

  return (
    <div
      ref={box}
      data-walking={walking}
      className="relative h-[78vh] min-h-[520px] overflow-hidden rounded-2xl border border-line lg:fixed lg:inset-0 lg:z-0 lg:h-auto lg:min-h-0 lg:rounded-none lg:border-0"
    >
      <HouseScene />

      {/* Alarma: viñeta roja que late alrededor de la escena */}
      {alarm && <div aria-hidden className="alarm-vignette pointer-events-none absolute inset-0 z-20" />}

      {!walking && <SidePanel />}
      <CameraDock />

      {walking && <WalkHud />}
    </div>
  )
}
