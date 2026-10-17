import {
  AlertTriangle,
  BookOpen,
  DoorClosed,
  DoorOpen,
  DoorOpen as AccessIcon,
  Droplets,
  Fan,
  Film,
  Flame,
  Home,
  Lightbulb,
  LightbulbOff,
  LogOut,
  Minus,
  Moon,
  Play,
  Plug,
  Plus,
  Radar,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Siren,
  Snowflake,
  Square,
  Sun,
  Thermometer,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import {
  AIR_CONDITIONERS,
  ALERTS,
  CLIMATE,
  DOORS,
  LIGHTS,
  PIRS,
  PIR_HOLD_MS,
  PLUGS,
  ROOMS,
  SCENES,
  SMOKE,
  type SceneIcon,
} from '../config/house.config'
import { useCan, useRole } from '../hooks/useCan'
import { commands } from '../hooks/useTelemetry'
import { tempColor, tempInk } from '../lib/climate'
import { fmtNumber } from '../lib/format'
import { PLUG_ICONS } from '../lib/icons'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import type { AcFan, AcMode, SecurityMode } from '../types/iot'
import { ReadOnlyBanner, RoleTag } from './Session'
import { GhostButton, SectionTitle, Segmented, Switch } from './ui'

/** Boton secundario: blanco con borde suave. Al pasar el mouse cambia de color segun lo que hace (rojo = peligro, etc.). */
const SOFT_BTN = 'border border-line bg-panel text-fg shadow-sm transition-colors'

/* ───────────────────────────── Simulación ───────────────────────────── */

function SimulationSection() {
  const smoke = useHouseStore((s) => s.smoke)
  const pir = useHouseStore((s) => s.pir)
  const primary = PIRS.find((p) => p.primary) ?? PIRS[0]
  const motion = pir[primary.id]?.motion
  const canSimulate = useCan('smoke.simulate')

  return (
    <section>
      <SectionTitle aside={<RoleTag need="administrador" />}>Simular eventos</SectionTitle>
      <fieldset disabled={!canSimulate} className="grid min-w-0 gap-2">
        <button
          type="button"
          onClick={() => commands.setSmokeLeak(!smoke.simulating)}
          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold transition-colors ${
            smoke.simulating ? 'bg-bad text-white' : `${SOFT_BTN} hover:border-bad hover:bg-bad-soft`
          }`}
        >
          <span className="flex items-center gap-2.5">
            {smoke.simulating ? <Square size={17} /> : <Siren size={17} className="text-bad-strong" />}
            {smoke.simulating ? 'Detener fuga de humo' : 'Simular fuga de humo'}
          </span>
          <span className="text-xs font-semibold opacity-80">{smoke.ppm} ppm</span>
        </button>

        <button
          type="button"
          onClick={() => commands.simulatePir(primary.id)}
          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold transition-colors ${
            motion ? 'bg-cool-strong text-white' : `${SOFT_BTN} hover:border-cool hover:bg-cool-soft`
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Radar size={17} className={motion ? '' : 'text-cool-strong'} />
            Simular presencia (PIR)
          </span>
          <span className="text-xs font-semibold opacity-80">{primary.label}</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => commands.simulateHeat()}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-semibold ${SOFT_BTN} hover:border-warm hover:bg-warm-soft`}
          >
            <Thermometer size={15} className="text-warm-strong" /> Calor en cocina
          </button>
          <button
            type="button"
            onClick={() => commands.simulateHumidity()}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-semibold ${SOFT_BTN} hover:border-cool hover:bg-cool-soft`}
          >
            <Droplets size={15} className="text-cool-strong" /> Humedad en baño
          </button>
        </div>
        <p className="px-1 text-xs text-mute">
          El sensor detecta presencia y la app enciende las luces vinculadas durante {PIR_HOLD_MS / 1000} s ; queda en el registro. Calor y humedad son lecturas altas del sensor: la app decide si es una alerta.
        </p>
      </fieldset>
    </section>
  )
}

/* ───────────────────────────── Sensores ───────────────────────────── */

function SensorsSection() {
  const smoke = useHouseStore((s) => s.smoke)
  const pir = useHouseStore((s) => s.pir)
  const canSimulate = useCan('pir.simulate')

  return (
    <section>
      <SectionTitle>Sensores</SectionTitle>
      <ul className="divide-y divide-line card !rounded-xl !shadow-none">
        <li className="flex items-center gap-3 px-3.5 py-3 text-sm">
          <Flame size={16} className={smoke.alarm ? 'text-bad-strong' : 'text-ok-strong'} />
          <span className="flex-1">{SMOKE.label}</span>
          <span className={`text-xs font-semibold ${smoke.alarm ? 'text-bad-strong' : 'text-mute'}`}>
            {smoke.ppm} ppm · {smoke.alarm ? 'Crítico' : 'Normal'}
          </span>
        </li>

        {PIRS.map((p) => {
          const active = pir[p.id]?.motion
          return (
            <li key={p.id} className="flex items-center gap-3 px-3.5 py-3 text-sm">
              <Radar size={16} className={active ? 'text-cool-strong' : 'text-mute'} />
              <span className="flex-1">{p.label}</span>
              <span className={`text-xs font-semibold ${active ? 'text-cool-strong' : 'text-mute'}`}>
                {active ? 'Movimiento' : 'Sin movimiento'}
              </span>
              <button
                type="button"
                onClick={() => commands.simulatePir(p.id)}
                disabled={!canSimulate}
                title={canSimulate ? undefined : 'Requiere rol Administrador'}
                aria-label={`Simular presencia en ${p.label}`}
                className="rounded-lg p-1.5 text-brand-strong hover:bg-brand-soft disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Play size={14} />
              </button>
            </li>
          )
        })}

      </ul>
    </section>
  )
}

/* ───────────────────────────── Puertas ───────────────────────────── */

function DoorsSection() {
  const doors = useHouseStore((s) => s.doors)
  const openCount = DOORS.filter((d) => doors[d.id]?.open).length
  const setAll = (open: boolean) => DOORS.forEach((d) => commands.setDoor(d.id, open))

  return (
    <section>
      <SectionTitle
        aside={
          <div className="flex items-center gap-0.5">
            <GhostButton onClick={() => setAll(true)}>Abrir todas</GhostButton>
            <GhostButton onClick={() => setAll(false)}>Cerrar todas</GhostButton>
          </div>
        }
      >
        Puertas <span className="font-medium text-mute">· {openCount} de {DOORS.length} abiertas</span>
      </SectionTitle>
      <ul className="divide-y divide-line card !rounded-xl !shadow-none">
        {DOORS.map((d) => {
          const open = !!doors[d.id]?.open
          return (
            <li key={d.id} className="flex items-center gap-3 px-3.5 py-3 text-sm">
              {open ? <DoorOpen size={16} className="text-warm-strong" /> : <DoorClosed size={16} className="text-mute" />}
              <span className="flex-1">{d.label}</span>
              <span className={`text-xs font-semibold ${open ? 'text-warm-strong' : 'text-mute'}`}>
                {open ? 'Abierta' : 'Cerrada'}
              </span>
              <Switch checked={open} onChange={(v) => commands.setDoor(d.id, v)} label={`Abrir ${d.label}`} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ───────────────────────────── Iluminación ───────────────────────────── */

function LightRow({ id, label }: { id: string; label: string }) {
  const l = useHouseStore((s) => s.lights[id])
  const flashing = useHouseStore(
    (s) => s.smoke.alarm && LIGHTS.find((x) => x.id === id)?.room === SMOKE.alarmRoom,
  )
  if (!l) return null

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={l.color}
          onChange={(e) => commands.setLight(id, { color: e.target.value })}
          aria-label={`Color de ${label}`}
        />
        <span className="flex-1 text-sm">{label}</span>
        {flashing && <span className="text-xs font-semibold text-bad-strong">Alarma</span>}
        <Switch checked={l.on} onChange={(on) => commands.setLight(id, { on })} label={`Encender ${label}`} />
      </div>
      <div className="mt-2.5 flex items-center gap-3 pl-[38px]">
        <input
          type="range"
          min={0}
          max={100}
          value={l.intensity}
          disabled={!l.on}
          onChange={(e) => commands.setLight(id, { intensity: Number(e.target.value) })}
          aria-label={`Intensidad de ${label}`}
        />
        <span className="w-10 text-right text-xs font-medium text-mute">{l.intensity}%</span>
      </div>
    </li>
  )
}

function LightsSection() {
  const lights = useHouseStore((s) => s.lights)
  const rooms = [...new Set(LIGHTS.map((l) => l.room))]
  const onCount = Object.values(lights).filter((l) => l.on).length

  const setAll = (on: boolean) => LIGHTS.forEach((l) => commands.setLight(l.id, { on }))

  return (
    <section>
      <SectionTitle
        aside={
          <div className="flex items-center gap-0.5">
            <GhostButton onClick={() => setAll(true)}>
              <Lightbulb size={14} /> Todas
            </GhostButton>
            <GhostButton onClick={() => setAll(false)}>
              <LightbulbOff size={14} /> Ninguna
            </GhostButton>
          </div>
        }
      >
        Iluminación <span className="font-medium text-mute">· {onCount} de {LIGHTS.length} encendidas</span>
      </SectionTitle>

      <div className="space-y-4">
        {rooms.map((room) => (
          <div key={room}>
            <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-mute">{room}</h3>
            <ul className="divide-y divide-line card !rounded-xl !shadow-none">
              {LIGHTS.filter((l) => l.room === room).map((l) => (
                <LightRow key={l.id} id={l.id} label={l.label} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ───────────────────────────── Alertas activas ───────────────────────────── */

function ActiveAlerts() {
  const alerts = useHouseStore((s) => s.alerts)
  const list = Object.values(alerts).sort((a, b) => (a.level === b.level ? a.since - b.since : a.level === 'critical' ? -1 : 1))

  return (
    <section>
      <SectionTitle
        aside={<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${list.length ? 'bg-bad-soft text-bad-strong' : 'bg-ok-soft text-ok-strong'}`}>{list.length ? `${list.length} activa(s)` : 'todo normal'}</span>}
      >
        Alertas
      </SectionTitle>
      {list.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-ok/40 bg-ok-soft/60 px-3.5 py-3 text-xs text-mute">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-ok-strong" />
          <span>
            Sin alertas. La app vigila: humo &gt; {SMOKE.alarmThresholdPpm} ppm, temperatura &gt; {ALERTS.tempHighC} °C, humedad &gt;{' '}
            {ALERTS.humidityHighPct} %, consumo &gt; {ALERTS.powerHighW} W y la alarma de seguridad.
          </span>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {list.map((a) => (
            <li
              key={a.id}
              className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs ${
                a.level === 'critical' ? 'border-bad bg-bad-soft' : 'border-warm bg-warm-soft'
              }`}
            >
              <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${a.level === 'critical' ? 'text-bad-strong' : 'text-warm-strong'}`} />
              <span className="flex-1 font-semibold leading-snug">{a.message}</span>
              <span className="shrink-0 text-mute">{new Date(a.since).toLocaleTimeString('es-CO', { hour12: false })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ───────────────────────────── Escenas ───────────────────────────── */

const SCENE_ICONS: Record<SceneIcon, LucideIcon> = {
  home: Home,
  film: Film,
  book: BookOpen,
  moon: Moon,
  logout: LogOut,
}

function ScenesSection() {
  return (
    <section>
      <SectionTitle>Escenas</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {SCENES.map((sc) => {
          const Icon = SCENE_ICONS[sc.icon]
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => commands.applyScene(sc.id)}
              className={`rounded-xl p-3.5 text-left ${SOFT_BTN} hover:border-brand hover:shadow-card`}
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand-strong">
                <Icon size={18} />
              </span>
              <div className="mt-2.5 text-sm font-semibold">{sc.label}</div>
              <div className="mt-0.5 text-xs leading-snug text-mute">{sc.hint}</div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ───────────────────────────── Seguridad ───────────────────────────── */

function SecuritySection() {
  const sec = useHouseStore((s) => s.security)
  const canSimulate = useCan('security.simulateIntrusion')

  return (
    <section>
      <SectionTitle>Seguridad</SectionTitle>
      {sec.alarm && (
        <div className="alarm-pulse mb-3 rounded-xl bg-bad p-3.5 text-white" role="alert">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ShieldAlert size={16} /> Alarma de intrusión
          </div>
          <p className="mt-1 text-xs opacity-90">{sec.cause}</p>
          <button
            type="button"
            onClick={() => commands.setSecurity('disarmed')}
            className="mt-2.5 rounded-lg bg-white/25 px-3 py-1.5 text-xs font-semibold hover:bg-white/35"
          >
            Silenciar y desarmar
          </button>
        </div>
      )}
      <Segmented<SecurityMode>
        label="Modo de seguridad"
        value={sec.mode}
        onChange={(m) => commands.setSecurity(m)}
        options={[
          { id: 'disarmed', label: 'Desarmada', icon: <ShieldOff size={13} /> },
          { id: 'home', label: 'En casa', icon: <ShieldCheck size={13} /> },
          { id: 'away', label: 'Fuera', icon: <Shield size={13} /> },
        ]}
      />
      <p className="mt-2 px-1 text-xs text-mute">
        «En casa» vigila las puertas exteriores. «Fuera» vigila además el movimiento de todos los PIR.
      </p>
      <button
        type="button"
        onClick={() => commands.simulateIntrusion()}
        disabled={!canSimulate}
        title={canSimulate ? undefined : 'Requiere rol Administrador'}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${SOFT_BTN} hover:border-bad hover:bg-bad-soft disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-panel`}
      >
        <Siren size={16} className="text-bad-strong" /> Simular intrusión
      </button>
    </section>
  )
}

/* ───────────────────────────── Clima y A/C ───────────────────────────── */

function RoomRow({ roomId }: { roomId: string }) {
  const room = ROOMS.find((r) => r.id === roomId)!
  const c = useHouseStore((s) => s.climate[roomId])
  const selected = useUiStore((s) => s.selectedRoom === roomId)
  const select = useUiStore((s) => s.setSelectedRoom)
  if (!c) return null
  const dot = tempColor(c.temperature)
  const ink = tempInk(c.temperature)

  return (
    <button
      type="button"
      onClick={() => select(roomId)}
      aria-pressed={selected}
      title="Ver su gráfica"
      className={`flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm transition-colors ${
        selected ? 'bg-raised' : 'hover:bg-raised/60'
      }`}
    >
      <span className="h-3 w-3 rounded-full" style={{ background: dot }} />
      <span className="flex-1">{room.label}</span>
      <span className="flex items-center gap-0.5 text-xs text-mute">
        <Droplets size={12} />
        {c.humidity}%
      </span>
      {c.lux !== undefined && (
        <span className="flex items-center gap-0.5 text-xs text-mute" title="Luminosidad">
          <Sun size={12} />
          {c.lux}
        </span>
      )}
      <span className="w-14 text-right font-semibold" style={{ color: ink }}>
        {fmtNumber(c.temperature, 1)}°
      </span>
    </button>
  )
}

function AcCard({ acId }: { acId: string }) {
  const def = AIR_CONDITIONERS.find((a) => a.id === acId)!
  const ac = useHouseStore((s) => s.acs[acId])
  const c = useHouseStore((s) => s.climate[def.room])
  if (!ac) return null

  const status = !ac.on
    ? 'Apagado'
    : ac.mode === 'fan'
      ? `Ventilador · ${ac.watts} W`
      : ac.running
        ? `Enfriando · ${fmtNumber(ac.watts)} W`
        : `En espera · ${ac.watts} W`

  return (
    <div className="card !rounded-xl !shadow-none overflow-hidden">
      <RoomRow roomId={def.room} />
      <div className="space-y-3.5 border-t border-line px-3.5 py-3.5">
        <div className="flex items-center gap-3">
          <Snowflake size={16} className={ac.on ? 'text-cool-strong' : 'text-mute'} />
          <div className="flex-1">
            <div className="text-sm font-semibold">Aire acondicionado</div>
            <div className={`text-xs ${ac.running ? 'font-semibold text-cool-strong' : 'text-mute'}`}>{status}</div>
          </div>
          <Switch checked={ac.on} onChange={(on) => commands.setAc(acId, { on })} label={`Encender A/C ${def.label}`} />
        </div>

        <div className={ac.on ? '' : 'pointer-events-none opacity-40'}>
          <Segmented<AcMode>
            label="Modo"
            value={ac.mode}
            onChange={(mode) => commands.setAc(acId, { mode })}
            options={[
              { id: 'cool', label: 'Frío', icon: <Snowflake size={12} /> },
              { id: 'fan', label: 'Ventilador', icon: <Fan size={12} /> },
            ]}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={ac.mode !== 'cool' || ac.setpoint <= CLIMATE.acSetpointMin}
                onClick={() => commands.setAc(acId, { setpoint: ac.setpoint - 1 })}
                aria-label="Bajar un grado"
                className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-fg hover:border-cool hover:bg-cool-soft disabled:opacity-35"
              >
                <Minus size={14} />
              </button>
              <div className="w-16 text-center">
                <div className="text-2xl font-bold leading-none">{ac.mode === 'cool' ? `${ac.setpoint}°` : '—'}</div>
                <div className="mt-1 text-xs text-mute">consigna</div>
              </div>
              <button
                type="button"
                disabled={ac.mode !== 'cool' || ac.setpoint >= CLIMATE.acSetpointMax}
                onClick={() => commands.setAc(acId, { setpoint: ac.setpoint + 1 })}
                aria-label="Subir un grado"
                className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-panel text-fg hover:border-cool hover:bg-cool-soft disabled:opacity-35"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="text-right text-xs text-mute">
              Ahora
              <div className="text-sm font-bold text-fg">{c ? `${fmtNumber(c.temperature, 1)}°` : '—'}</div>
            </div>
          </div>
          <div className="mt-3">
            <Segmented<AcFan>
              label="Velocidad del ventilador"
              value={ac.fan}
              onChange={(fan) => commands.setAc(acId, { fan })}
              options={[
                { id: 'low', label: 'Baja' },
                { id: 'mid', label: 'Media' },
                { id: 'high', label: 'Alta' },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ClimateSection() {
  const world = useHouseStore((s) => s.world)
  const acRooms = new Set(AIR_CONDITIONERS.map((a) => a.room))
  const others = ROOMS.filter((r) => !acRooms.has(r.id))

  return (
    <section className="space-y-4">
      <SectionTitle
        aside={
          <span className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium">
            <Thermometer size={13} style={{ color: tempInk(world.outdoorTemp) }} />
            Exterior {fmtNumber(world.outdoorTemp, 1)}°
          </span>
        }
      >
        Clima
      </SectionTitle>

      <div className="space-y-3">
        {AIR_CONDITIONERS.map((a) => (
          <AcCard key={a.id} acId={a.id} />
        ))}
      </div>

      <div>
        <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-mute">Sin aire acondicionado</h3>
        <div className="divide-y divide-line card !rounded-xl !shadow-none overflow-hidden">
          {others.map((r) => (
            <RoomRow key={r.id} roomId={r.id} />
          ))}
        </div>
      </div>
      <p className="px-1 text-xs text-mute">
        Confort entre {CLIMATE.comfortMin}° y {CLIMATE.comfortMax}°. Toca una habitación para ver su gráfica.
      </p>
    </section>
  )
}

/* ───────────────────────────── Enchufes ───────────────────────────── */

function PlugsSection() {
  const plugs = useHouseStore((s) => s.plugs)
  const total = Object.values(plugs).reduce((a, p) => a + (p.on ? p.watts : 0), 0)

  return (
    <section>
      <SectionTitle aside={<span className="rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok-strong">{fmtNumber(total)} W ahora</span>}>
        Enchufes inteligentes
      </SectionTitle>
      <ul className="divide-y divide-line card !rounded-xl !shadow-none">
        {PLUGS.map((def) => {
          const p = plugs[def.id]
          if (!p) return null
          const Icon = PLUG_ICONS[def.icon]
          const room = ROOMS.find((r) => r.id === def.room)?.label
          return (
            <li key={def.id} className="flex items-center gap-3 px-3.5 py-3.5 text-sm">
              <Icon size={18} className={p.on ? 'text-ok-strong' : 'text-mute'} />
              <div className="flex-1">
                <div className="font-semibold">{def.label}</div>
                <div className="text-xs text-mute">
                  {room} · {fmtNumber(p.kwh, 4)} kWh
                  {def.autoOffSec ? ` · apagado automático ${def.autoOffSec} s` : ''}
                </div>
              </div>
              <span className={`w-16 text-right text-xs font-semibold ${p.on ? 'text-ok-strong' : 'text-mute'}`}>
                {p.on ? `${fmtNumber(p.watts)} W` : 'Apagado'}
              </span>
              <Switch checked={p.on} onChange={(on) => commands.setPlug(def.id, on)} label={`Encender ${def.label}`} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ───────────────────────────── Panel con pestañas ───────────────────────────── */

type TabId = 'inicio' | 'luces' | 'clima' | 'enchufes' | 'accesos'

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'luces', label: 'Luces', icon: Lightbulb },
  { id: 'clima', label: 'Clima', icon: Thermometer },
  { id: 'enchufes', label: 'Enchufes', icon: Plug },
  { id: 'accesos', label: 'Accesos', icon: AccessIcon },
]

export function ControlPanel() {
  const [tab, setTab] = useState<TabId>('inicio')
  const alarm = useHouseStore((s) => s.security.alarm || s.smoke.alarm || Object.keys(s.alerts).length > 0)
  const { readOnly } = useRole()

  return (
    <aside>
      <nav
        role="tablist"
        aria-label="Secciones del panel"
        className="sticky top-0 z-10 flex gap-1 border-b border-line bg-canvas/90 px-3 py-2.5 backdrop-blur"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`relative flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold transition-colors ${
              tab === id ? 'bg-brand text-white shadow-sm' : 'text-mute hover:bg-raised hover:text-fg'
            }`}
          >
            <Icon size={17} />
            {label}
            {id === 'inicio' && alarm && <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-bad" />}
          </button>
        ))}
      </nav>

      <div className="space-y-5 p-5" role="tabpanel">
        {readOnly && <ReadOnlyBanner />}
        {/* Sesión de solo lectura: todos los controles del panel quedan desactivados (el servidor igualmente rechazaría las órdenes) */}
        <fieldset disabled={readOnly} className="min-w-0 space-y-7">
        {tab === 'inicio' && (
          <>
            <ActiveAlerts />
            <ScenesSection />
            <SecuritySection />
            <SimulationSection />
          </>
        )}
        {tab === 'luces' && <LightsSection />}
        {tab === 'clima' && <ClimateSection />}
        {tab === 'enchufes' && <PlugsSection />}
        {tab === 'accesos' && (
          <>
            <DoorsSection />
            <SensorsSection />
          </>
        )}
        </fieldset>
      </div>
    </aside>
  )
}
