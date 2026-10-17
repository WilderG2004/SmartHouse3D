/**
 * Estado del gemelo digital (lado lectura).
 * Solo lo modifican los mensajes del adaptador (apply). La UI nunca escribe aquí
 * directamente: envía comandos con `telemetry.send(...)` y espera el eco.
 */
import { create } from 'zustand'
import {
  AIR_CONDITIONERS,
  DEFAULT_LIGHT_COLOR,
  DOORS,
  LIGHTS,
  PIRS,
  PLUGS,
  ROOMS,
  SMOKE,
} from '../config/house.config'
import type {
  AcState,
  ActiveAlert,
  ConnectionStatus,
  DoorState,
  LightState,
  PipelineState,
  PirState,
  PlugState,
  PowerPoint,
  PowerState,
  RoomClimate,
  SecurityState,
  SmokeState,
  SystemEvent,
  TelemetryMessage,
  TimePoint,
  WorldState,
} from '../types/iot'

const MAX_POINTS = 150
const MAX_EVENTS = 200

interface HouseStore {
  connection: ConnectionStatus
  lights: Record<string, LightState>
  smoke: SmokeState
  pir: Record<string, PirState>
  doors: Record<string, DoorState>
  power: PowerState
  climate: Record<string, RoomClimate>
  acs: Record<string, AcState>
  plugs: Record<string, PlugState>
  security: SecurityState
  world: WorldState
  powerHistory: PowerPoint[]
  smokeHistory: TimePoint[]
  climateHistory: Record<string, TimePoint[]>
  outdoorHistory: TimePoint[]
  events: SystemEvent[]
  /** Alertas activas (las levanta la app comparando las lecturas con los umbrales) */
  alerts: Record<string, ActiveAlert>
  /** Lo que Node-RED informa del pipeline (guardado en InfluxDB, verificación, consultas) */
  pipeline: PipelineState
  /** Mensajes recibidos de la fuente de datos (para medir el ritmo real) */
  stream: { total: number; lastAt: number }
  apply: (msg: TelemetryMessage) => void
  seedHistory: (seed: { power: PowerPoint[]; smoke: TimePoint[] }) => void
  clearEvents: () => void
}

const push = <T extends TimePoint>(arr: T[], p: T) => [...arr, p].slice(-MAX_POINTS)

export const useHouseStore = create<HouseStore>((set) => ({
  connection: 'connecting',
  lights: Object.fromEntries(
    LIGHTS.map((l) => [l.id, { id: l.id, on: false, intensity: 100, color: DEFAULT_LIGHT_COLOR }]),
  ),
  smoke: { ppm: SMOKE.normalPpm, alarm: false, simulating: false },
  pir: Object.fromEntries(PIRS.map((p) => [p.id, { motion: false, lastTriggerAt: null }])),
  doors: Object.fromEntries(DOORS.map((d) => [d.id, { open: false }])),
  power: { watts: 0, kwhTotal: 0 },
  climate: Object.fromEntries(ROOMS.map((r) => [r.id, { temperature: 26, humidity: 60 }])),
  acs: Object.fromEntries(
    AIR_CONDITIONERS.map((a) => [
      a.id,
      { id: a.id, on: false, mode: 'cool', setpoint: 24, fan: 'mid', running: false, watts: 0 } as AcState,
    ]),
  ),
  plugs: Object.fromEntries(PLUGS.map((p) => [p.id, { id: p.id, on: false, watts: 0, kwh: 0 }])),
  security: { mode: 'disarmed', alarm: false, cause: null },
  world: { hour: 12, outdoorTemp: 29, hourOverride: false },
  powerHistory: [],
  smokeHistory: [],
  climateHistory: {},
  outdoorHistory: [],
  events: [],
  alerts: {},
  pipeline: {},
  stream: { total: 0, lastAt: 0 },

  apply: (msg) =>
    set((s) => {
      const r = ((): Partial<HouseStore> | HouseStore => {
      switch (msg.type) {
        case 'snapshot':
          return {
            lights: { ...s.lights, ...msg.state.lights },
            smoke: msg.state.smoke,
            pir: { ...s.pir, ...msg.state.pir },
            doors: { ...s.doors, ...msg.state.doors },
            power: msg.state.power,
            climate: { ...s.climate, ...msg.state.climate },
            acs: { ...s.acs, ...msg.state.acs },
            plugs: { ...s.plugs, ...msg.state.plugs },
            security: msg.state.security,
            world: msg.state.world,
            events: msg.state.events ? msg.state.events.slice(0, MAX_EVENTS) : s.events,
            alerts: msg.state.alerts ? Object.fromEntries(msg.state.alerts.map((a) => [a.id, a])) : s.alerts,
            pipeline: msg.state.pipeline ?? s.pipeline,
          }
        case 'light': {
          const cur = s.lights[msg.id]
          if (!cur) return s
          return { lights: { ...s.lights, [msg.id]: { ...cur, ...msg.patch } } }
        }
        case 'smoke':
          return {
            smoke: { ppm: msg.ppm, alarm: msg.alarm ?? s.smoke.alarm, simulating: msg.simulating ?? s.smoke.simulating },
            smokeHistory: push(s.smokeHistory, { ts: msg.ts, value: msg.ppm }),
          }
        case 'pir':
          return {
            pir: {
              ...s.pir,
              [msg.id]: {
                motion: msg.motion,
                lastTriggerAt: msg.motion ? msg.ts : (s.pir[msg.id]?.lastTriggerAt ?? null),
              },
            },
          }
        case 'door':
          return { doors: { ...s.doors, [msg.id]: { open: msg.open } } }
        case 'power': {
          const b = msg.breakdown
          const point: PowerPoint = {
            ts: msg.ts,
            value: msg.watts,
            // Sin desglose del backend, todo se cuenta como carga base
            base: b ? b.base : msg.watts,
            lights: b?.lights ?? 0,
            ac: b?.ac ?? 0,
            plugs: b?.plugs ?? 0,
          }
          return {
            power: { watts: msg.watts, kwhTotal: msg.kwhTotal, breakdown: b },
            powerHistory: push(s.powerHistory, point),
          }
        }
        case 'climate': {
          const climate = { ...s.climate }
          const climateHistory = { ...s.climateHistory }
          for (const [room, c] of Object.entries(msg.rooms)) {
            climate[room] = c
            climateHistory[room] = push(climateHistory[room] ?? [], { ts: msg.ts, value: c.temperature })
          }
          return {
            climate,
            climateHistory,
            world: msg.world,
            outdoorHistory: push(s.outdoorHistory, { ts: msg.ts, value: msg.world.outdoorTemp }),
          }
        }
        case 'ac': {
          const cur = s.acs[msg.id]
          if (!cur) return s
          return { acs: { ...s.acs, [msg.id]: { ...cur, ...msg.patch } } }
        }
        case 'plug': {
          const cur = s.plugs[msg.id]
          if (!cur) return s
          return { plugs: { ...s.plugs, [msg.id]: { ...cur, ...msg.patch } } }
        }
        case 'alert': {
          const alerts = { ...s.alerts }
          if (msg.active) alerts[msg.id] = { id: msg.id, level: msg.level, message: msg.message, since: alerts[msg.id]?.since ?? msg.ts }
          else delete alerts[msg.id]
          return { alerts }
        }
        case 'security':
          return { security: msg.state }
        case 'event':
          return { events: [msg.event, ...s.events].slice(0, MAX_EVENTS) }
        case 'connection':
          return { connection: msg.status }
        case 'pipeline':
          return {
            pipeline: {
              writes: msg.writes ? { ...s.pipeline.writes, ...msg.writes } : s.pipeline.writes,
              store: msg.store !== undefined ? msg.store : s.pipeline.store,
              api: msg.api ? { ...s.pipeline.api, ...msg.api } : s.pipeline.api,
            },
          }
      }
      })()
      // Cada mensaje de la fuente de datos cuenta para el ritmo que muestra el panel del pipeline
      return msg.type === 'connection' ? r : { ...r, stream: { total: s.stream.total + 1, lastAt: Date.now() } }
    }),

  seedHistory: (seed) =>
    set((s) => ({
      powerHistory: [...seed.power, ...s.powerHistory].slice(-MAX_POINTS),
      smokeHistory: [...seed.smoke, ...s.smokeHistory].slice(-MAX_POINTS),
    })),

  clearEvents: () => set({ events: [] }),
}))
