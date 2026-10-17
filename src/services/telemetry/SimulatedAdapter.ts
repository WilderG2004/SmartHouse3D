/**
 * MODO DE DESARROLLO sin Node-RED (VITE_TELEMETRY_MODE=simulated).
 *
 * Aquí los datos los genera la propia app y la interfaz lo avisa con un banner ámbar. En el uso normal los genera
 * Node-RED (infra/nodered/src/*.js) y este archivo no interviene.
 *
 * Hace el papel de "firmware de los dispositivos + flujo de Node-RED" para poder desarrollar la interfaz sin backend:
 *   - mantiene el estado real de luces, sensores, clima, A/C, enchufes y seguridad,
 *   - ejecuta la lógica (PIR → luces 8 s, termostato, alarmas, escenas, cálculo de potencia),
 *   - publica TelemetryMessage cada segundo.
 *
 * El frontend no cambia entre un modo y otro porque solo conoce la interfaz TelemetryAdapter.
 */
import {
  AC_POWER,
  ALERTS,
  AIR_CONDITIONERS,
  CLIMATE,
  DEFAULT_LIGHT_COLOR,
  DOORS,
  INITIAL_LIGHTS_ON,
  LIGHTS,
  METER,
  PIRS,
  PIR_HOLD_MS,
  PLUGS,
  ROOMS,
  SCENES,
  SENSORS,
  SMOKE,
} from '../../config/house.config'
import type {
  AcState,
  DeviceCommand,
  EventLevel,
  HouseSnapshot,
  LightState,
  PlugState,
  PowerBreakdown,
  SecurityMode,
  SecurityState,
  WorldState,
} from '../../types/iot'
import { BaseAdapter } from './TelemetryAdapter'

const TICK_MS = 1000
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d

let eventSeq = 0

const SECURITY_LABEL: Record<SecurityMode, string> = {
  disarmed: 'Desarmada',
  home: 'Armada · en casa',
  away: 'Armada · fuera de casa',
}

export class SimulatedAdapter extends BaseAdapter {
  readonly mode = 'simulated' as const
  readonly label: string = 'SIMULACIÓN LOCAL (sin Node-RED)'

  protected lights: Record<string, LightState> = {}
  protected pirMotion: Record<string, boolean> = {}
  protected doors: Record<string, boolean> = {}
  protected smokePpm = SMOKE.normalPpm
  protected smokeLeak = false
  protected smokeAlarm = false
  protected kwh = 0
  protected tickHandle: ReturnType<typeof setInterval> | null = null

  /** Clima por habitación (valores sin redondear) */
  protected rooms: Record<string, { t: number; h: number }> = {}
  protected acs: Record<string, AcState> = {}
  protected plugs: Record<string, PlugState> = {}
  protected plugTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** A/C que ya avisaron "alcanzó la consigna" (evita llenar el log en cada ciclo) */
  protected acReached = new Set<string>()
  protected hourOverride: number | null = null
  protected security: SecurityState = { mode: 'disarmed', alarm: false, cause: null }
  /** Durante una escena se silencian los mensajes informativos individuales */
  protected quiet = false
  /** Eventos de sensor del modo local de desarrollo (con Node-RED los genera el flujo) */
  protected heatBoost = false
  protected humidityBoost = false
  /** Última potencia total (W) para evaluar la alerta de consumo */
  protected lastWatts = 0
  /** Alertas activas: id → nivel */
  protected alertState = new Map<string, boolean>()

  /** Temporizadores de "sin movimiento" por PIR */
  protected pirTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Luces que cada PIR encendió (y debe apagar al terminar) */
  protected pirAutoOn = new Map<string, Set<string>>()

  constructor() {
    super()
    for (const l of LIGHTS) {
      const pct = INITIAL_LIGHTS_ON[l.id]
      this.lights[l.id] = {
        id: l.id,
        on: pct !== undefined,
        intensity: pct ?? 100,
        color: DEFAULT_LIGHT_COLOR,
      }
    }
    for (const p of PIRS) this.pirMotion[p.id] = false
    for (const d of DOORS) this.doors[d.id] = false

    const t0 = this.outdoor(this.hour()) - CLIMATE.insulation
    for (const r of ROOMS) this.rooms[r.id] = { t: t0, h: 60 }
    for (const a of AIR_CONDITIONERS) {
      this.acs[a.id] = { id: a.id, on: false, mode: 'cool', setpoint: 24, fan: 'mid', running: false, watts: 0 }
    }
    for (const p of PLUGS) {
      this.plugs[p.id] = { id: p.id, on: !!p.initialOn, watts: p.initialOn ? p.watts : 0, kwh: 0 }
      if (p.initialOn) this.armPlugTimer(p.id)
    }
  }

  /* ───────────────────────────── ciclo de vida ───────────────────────────── */

  connect() {
    if (this.tickHandle) return
    this.emit({ type: 'connection', status: 'connected' })
    this.emit({ type: 'snapshot', state: this.snapshot() })
    this.log('info', 'Sistema', 'Simulador local iniciado')
    this.tick() // primera lectura inmediata
    this.tickHandle = setInterval(() => this.tick(), TICK_MS)
  }

  disconnect() {
    if (this.tickHandle) clearInterval(this.tickHandle)
    this.tickHandle = null
    this.pirTimers.forEach((t) => clearTimeout(t))
    this.pirTimers.clear()
    this.plugTimers.forEach((t) => clearTimeout(t))
    this.plugTimers.clear()
    this.emit({ type: 'connection', status: 'disconnected' })
  }

  /* ───────────────────────────── comandos ───────────────────────────── */

  send(cmd: DeviceCommand) {
    switch (cmd.kind) {
      case 'light.set':
        this.setLight(cmd.id, cmd.patch, true)
        break
      case 'smoke.simulate':
        this.smokeLeak = cmd.active
        this.log(
          cmd.active ? 'warning' : 'info',
          SMOKE.label,
          cmd.active ? 'Fuga de humo simulada iniciada' : 'Fuga de humo simulada detenida',
        )
        this.tick() // refleja el cambio sin esperar al siguiente ciclo
        break
      case 'pir.simulate':
        this.triggerPir(cmd.id)
        break
      case 'heat.simulate':
        this.heatBoost = cmd.active
        this.log(cmd.active ? 'warning' : 'info', 'Sensor de temperatura', cmd.active ? 'Evento de calor en la cocina iniciado' : 'Evento de calor en la cocina detenido')
        break
      case 'humidity.simulate':
        this.humidityBoost = cmd.active
        this.log(cmd.active ? 'warning' : 'info', 'Sensor de humedad', cmd.active ? 'Evento de humedad en el baño iniciado' : 'Evento de humedad en el baño detenido')
        break
      case 'door.set':
        this.setDoor(cmd.id, cmd.open)
        break
      case 'ac.set':
        this.setAc(cmd.id, cmd.patch)
        break
      case 'plug.set':
        this.setPlug(cmd.id, cmd.on)
        break
      case 'security.set':
        this.setSecurity(cmd.mode)
        break
      case 'security.simulateIntrusion':
        this.simulateIntrusion()
        break
      case 'scene.apply':
        this.applyScene(cmd.id)
        break
      case 'world.setHour':
        this.hourOverride = cmd.hour === null ? null : clamp(cmd.hour, 0, 23.99)
        if (cmd.hour === null) this.log('info', 'Reloj', 'Hora automática (la del equipo)')
        this.emitClimate(Date.now())
        break
    }
  }

  /* ───────────────────────────── reloj y exterior ───────────────────────────── */

  protected hour(): number {
    if (this.hourOverride !== null) return this.hourOverride
    const d = new Date()
    return d.getHours() + d.getMinutes() / 60
  }

  protected outdoor(hour: number): number {
    const { mean, amp, peakHour } = CLIMATE.outdoor
    return mean + amp * Math.cos(((hour - peakHour) / 24) * 2 * Math.PI)
  }

  /* ───────────────────────────── luces ───────────────────────────── */

  protected setLight(id: string, patch: Partial<Omit<LightState, 'id'>>, byUser: boolean) {
    const cur = this.lights[id]
    if (!cur) return
    const next = { ...cur, ...patch }
    if (patch.intensity !== undefined) {
      next.intensity = Math.max(0, Math.min(100, Math.round(patch.intensity)))
    }
    this.lights[id] = next

    // Si el usuario toca una luz, deja de ser "automática": el PIR ya no la apaga.
    if (byUser) this.pirAutoOn.forEach((set) => set.delete(id))

    this.emit({ type: 'light', id, patch: { ...patch, intensity: next.intensity } })

    // Los cambios automáticos (PIR) ya se registran con su propio mensaje.
    if (byUser && patch.on !== undefined && patch.on !== cur.on) {
      const label = LIGHTS.find((l) => l.id === id)?.label ?? id
      this.log('info', label, patch.on ? 'Luz encendida' : 'Luz apagada')
    }
  }

  /* ───────────────────────────── puertas ───────────────────────────── */

  protected setDoor(id: string, open: boolean) {
    const def = DOORS.find((d) => d.id === id)
    if (!def || this.doors[id] === open) return
    this.doors[id] = open
    this.emit({ type: 'door', ts: Date.now(), id, open })
    this.log('info', def.label, open ? 'Puerta abierta' : 'Puerta cerrada')
    // Solo las puertas con sensor (perímetro) disparan la alarma
    if (open && def.sensor) this.triggerAlarm(`${def.label} abierta`)
  }

  /* ───────────────────────────── PIR ───────────────────────────── */

  protected triggerPir(id: string) {
    const def = PIRS.find((p) => p.id === id)
    if (!def) return

    const wasActive = this.pirMotion[id]
    this.pirMotion[id] = true
    this.emit({ type: 'pir', ts: Date.now(), id, motion: true })
    if (!wasActive) this.log('info', def.label, 'Movimiento detectado')

    // Con la casa armada "fuera de casa", cualquier movimiento es una intrusión
    if (this.security.mode === 'away') this.triggerAlarm(`Movimiento en ${def.label}`)

    // Enciende las luces vinculadas (solo las que estaban apagadas)
    const auto = this.pirAutoOn.get(id) ?? new Set<string>()
    for (const lightId of def.lightIds) {
      const l = this.lights[lightId]
      if (l && !l.on) {
        this.setLight(lightId, { on: true }, false)
        auto.add(lightId)
        const label = LIGHTS.find((x) => x.id === lightId)?.label ?? lightId
        this.log('info', def.label, `Luz «${label}» encendida automáticamente (${PIR_HOLD_MS / 1000} s)`)
      }
    }
    this.pirAutoOn.set(id, auto)

    // Reinicia la cuenta de 8 s
    const prev = this.pirTimers.get(id)
    if (prev) clearTimeout(prev)
    this.pirTimers.set(
      id,
      setTimeout(() => this.releasePir(id), PIR_HOLD_MS),
    )
  }

  protected releasePir(id: string) {
    const def = PIRS.find((p) => p.id === id)
    this.pirTimers.delete(id)
    this.pirMotion[id] = false
    this.emit({ type: 'pir', ts: Date.now(), id, motion: false })

    const auto = this.pirAutoOn.get(id) ?? new Set<string>()
    const offLabels: string[] = []
    for (const lightId of auto) {
      // ¿Otro PIR todavía necesita esta luz?
      const heldByOther = [...this.pirAutoOn.entries()].some(
        ([otherId, set]) => otherId !== id && this.pirMotion[otherId] && set.has(lightId),
      )
      if (!heldByOther && this.lights[lightId]?.on) {
        this.setLight(lightId, { on: false }, false)
        offLabels.push(LIGHTS.find((x) => x.id === lightId)?.label ?? lightId)
      }
    }
    auto.clear()
    this.log(
      'info',
      def?.label ?? id,
      offLabels.length
        ? `Sin movimiento · luces apagadas (${offLabels.join(', ')})`
        : 'Sin movimiento',
    )
  }

  /* ───────────────────────────── A/C ───────────────────────────── */

  protected setAc(id: string, patch: Partial<Pick<AcState, 'on' | 'mode' | 'setpoint' | 'fan'>>) {
    const cur = this.acs[id]
    const def = AIR_CONDITIONERS.find((a) => a.id === id)
    if (!cur || !def) return

    const next: AcState = { ...cur, ...patch }
    if (patch.setpoint !== undefined) {
      next.setpoint = clamp(Math.round(patch.setpoint), CLIMATE.acSetpointMin, CLIMATE.acSetpointMax)
    }
    if (!next.on) {
      next.running = false
      next.watts = 0
    }
    this.acs[id] = next
    if (patch.on !== undefined || patch.setpoint !== undefined || patch.mode !== undefined) {
      this.acReached.delete(id)
    }

    this.emit({
      type: 'ac',
      id,
      patch: { on: next.on, mode: next.mode, setpoint: next.setpoint, fan: next.fan, running: next.running, watts: next.watts },
    })

    const who = `A/C ${def.label}`
    if (patch.on !== undefined && patch.on !== cur.on) {
      this.log('info', who, next.on ? `Encendido · ${next.mode === 'cool' ? `frío a ${next.setpoint} °C` : 'ventilador'}` : 'Apagado')
    } else if (patch.mode !== undefined && patch.mode !== cur.mode) {
      this.log('info', who, next.mode === 'cool' ? 'Modo frío' : 'Modo ventilador')
    }
  }

  /** Termostato con histéresis. Devuelve °C de enfriamiento aplicados en este ciclo. */
  protected runAc(ac: AcState, roomTemp: number): number {
    const factor = AC_POWER.fanFactor[ac.fan]
    let running = ac.running
    if (ac.on && ac.mode === 'cool') {
      if (!running && roomTemp > ac.setpoint + CLIMATE.hysteresis) running = true
      else if (running && roomTemp < ac.setpoint - CLIMATE.hysteresis) {
        running = false
        if (!this.acReached.has(ac.id)) {
          this.acReached.add(ac.id)
          const def = AIR_CONDITIONERS.find((a) => a.id === ac.id)
          this.log('info', `A/C ${def?.label ?? ac.id}`, `Alcanzó ${ac.setpoint} °C`)
        }
      }
    } else {
      running = false
    }
    ac.running = running
    ac.watts = !ac.on
      ? 0
      : running
        ? Math.round(AC_POWER.coolingW * factor * (0.92 + Math.random() * 0.16))
        : Math.round(AC_POWER.fanW * factor)
    return running ? CLIMATE.coolPerTick * factor : 0
  }

  /* ───────────────────────────── enchufes ───────────────────────────── */

  protected setPlug(id: string, on: boolean) {
    const cur = this.plugs[id]
    const def = PLUGS.find((p) => p.id === id)
    if (!cur || !def || cur.on === on) return
    this.plugs[id] = { ...cur, on, watts: on ? def.watts : 0 }
    this.emit({ type: 'plug', id, patch: { on, watts: this.plugs[id].watts } })
    this.log('info', def.label, on ? 'Enchufe encendido' : 'Enchufe apagado')
    if (on) this.armPlugTimer(id)
    else this.clearPlugTimer(id)
  }

  protected armPlugTimer(id: string) {
    const def = PLUGS.find((p) => p.id === id)
    this.clearPlugTimer(id)
    if (!def?.autoOffSec) return
    this.plugTimers.set(
      id,
      setTimeout(() => {
        this.plugTimers.delete(id)
        const cur = this.plugs[id]
        if (cur?.on) {
          this.plugs[id] = { ...cur, on: false, watts: 0 }
          this.emit({ type: 'plug', id, patch: { on: false, watts: 0 } })
          this.log('info', def.label, `Apagado automático (temporizador de ${def.autoOffSec} s)`)
        }
      }, def.autoOffSec * 1000),
    )
  }

  protected clearPlugTimer(id: string) {
    const t = this.plugTimers.get(id)
    if (t) clearTimeout(t)
    this.plugTimers.delete(id)
  }

  /* ───────────────────────────── seguridad ───────────────────────────── */

  protected setSecurity(mode: SecurityMode) {
    if (mode !== 'disarmed') {
      const open = DOORS.find((d) => d.sensor && this.doors[d.id])
      if (open) {
        this.log('warning', 'Seguridad', `No se puede armar: ${open.label} está abierta`)
        this.emit({ type: 'security', state: { ...this.security } })
        return
      }
    }
    this.security = { mode, alarm: false, cause: null }
    this.emit({ type: 'security', state: { ...this.security } })
    this.log(mode === 'disarmed' ? 'info' : 'warning', 'Seguridad', SECURITY_LABEL[mode])
  }

  protected triggerAlarm(cause: string) {
    if (this.security.mode === 'disarmed' || this.security.alarm) return
    this.security = { ...this.security, alarm: true, cause }
    this.emit({ type: 'security', state: { ...this.security } })
    this.log('critical', 'Seguridad', `ALARMA DE INTRUSIÓN: ${cause}`)
  }

  protected simulateIntrusion() {
    const door = DOORS.find((d) => d.sensor)
    const pir = PIRS.find((p) => p.primary) ?? PIRS[0]
    this.log('warning', 'Simulación', 'Intrusión simulada: puerta de entrada y movimiento')
    if (door) this.setDoor(door.id, true)
    setTimeout(() => this.triggerPir(pir.id), 1200)
  }

  /* ───────────────────────────── escenas ───────────────────────────── */

  protected applyScene(id: string) {
    const sc = SCENES.find((s) => s.id === id)
    if (!sc) return
    this.log('info', 'Escena', `«${sc.label}» activada`)

    this.quiet = true
    try {
      if (sc.doorsClose) DOORS.forEach((d) => this.setDoor(d.id, false))

      for (const l of LIGHTS) {
        const cfg = sc.lights[l.id]
        if (cfg) {
          this.setLight(l.id, { on: true, intensity: cfg.intensity, color: cfg.color ?? DEFAULT_LIGHT_COLOR }, true)
        } else if (sc.lightsOthers === 'off') {
          this.setLight(l.id, { on: false }, true)
        }
      }
      for (const a of AIR_CONDITIONERS) {
        const cfg = sc.ac?.[a.id]
        if (cfg) this.setAc(a.id, { on: cfg.on, mode: 'cool', ...(cfg.setpoint ? { setpoint: cfg.setpoint } : {}), ...(cfg.fan ? { fan: cfg.fan } : {}) })
        else if (sc.acOthers === 'off') this.setAc(a.id, { on: false })
      }
      for (const p of PLUGS) {
        const cfg = sc.plugs?.[p.id]
        if (cfg !== undefined) this.setPlug(p.id, cfg)
        else if (sc.plugsOthers === 'off') this.setPlug(p.id, false)
      }
      if (sc.security) this.setSecurity(sc.security)
    } finally {
      this.quiet = false
    }
  }

  /* ───────────────────────────── ciclo de 1 s ───────────────────────────── */

  protected tick() {
    const ts = Date.now()
    this.tickSmoke(ts)
    this.tickClimate(ts)
    this.tickPower(ts)
    this.syncAlerts(ts)
  }

  /**
   * Alertas: la APP compara las lecturas con los umbrales de ALERTS (humo, temperatura, humedad, consumo)
   * y con el estado de seguridad. Emite un mensaje `alert` solo cuando una alerta cambia.
   */
  protected syncAlerts(ts = Date.now()) {
    const want = new Map<string, { level: 'warning' | 'critical'; message: string; log: boolean }>()
    if (this.smokeAlarm) want.set('humo', { level: 'critical', message: `Humo ${Math.round(this.smokePpm)} ppm en la cocina (umbral ${SMOKE.alarmThresholdPpm})`, log: false })
    if (this.security.alarm) want.set('intrusion', { level: 'critical', message: this.security.cause ?? 'Intrusión detectada', log: false })

    for (const r of ROOMS) {
      const st = this.rooms[r.id]
      if (!st) continue
      const tid = `temperatura:${r.id}`
      if (st.t > ALERTS.tempHighC || (this.alertState.get(tid) && st.t > ALERTS.tempHighClearC)) {
        want.set(tid, { level: 'warning', message: `Temperatura alta en ${r.label}: ${st.t.toFixed(1)} °C`, log: true })
      }
      const hid = `humedad:${r.id}`
      if (st.h > ALERTS.humidityHighPct || (this.alertState.get(hid) && st.h > ALERTS.humidityHighClearPct)) {
        want.set(hid, { level: 'warning', message: `Humedad alta en ${r.label}: ${Math.round(st.h)} %`, log: true })
      }
    }
    if (this.lastWatts > ALERTS.powerHighW || (this.alertState.get('consumo') && this.lastWatts > ALERTS.powerHighClearW)) {
      want.set('consumo', { level: 'warning', message: `Consumo alto: ${Math.round(this.lastWatts)} W`, log: true })
    }

    for (const [id, a] of want) {
      if (this.alertState.get(id)) continue
      this.alertState.set(id, true)
      this.emit({ type: 'alert', ts, id, active: true, level: a.level, message: a.message })
      if (a.log) this.log(a.level === 'critical' ? 'critical' : 'warning', 'Alerta', a.message)
    }
    for (const id of [...this.alertState.keys()]) {
      if (want.has(id)) continue
      this.alertState.delete(id)
      this.emit({ type: 'alert', ts, id, active: false, level: 'warning', message: '' })
      if (!id.startsWith('humo') && id !== 'intrusion') this.log('info', 'Alerta', `Normalizada: ${id.replace(':', ' · ')}`)
    }
  }

  protected tickSmoke(ts: number) {
    const target = this.smokeLeak ? 470 + Math.random() * 40 : SMOKE.normalPpm + (Math.random() - 0.5) * 6
    const k = this.smokeLeak ? 0.4 : 0.25
    const ppm = Math.max(5, this.smokePpm + (target - this.smokePpm) * k + (Math.random() - 0.5) * 3)
    this.applySmokeReading(ppm, ts, this.smokeLeak)
  }

  /** Recibe una lectura de humo (local o de Node-RED), decide la alarma con histéresis y la publica. */
  protected applySmokeReading(ppm: number, ts: number, simulating: boolean) {
    this.smokePpm = ppm
    const wasAlarm = this.smokeAlarm
    // Histéresis: alarma al superar el umbral, se libera por debajo del 75 %
    if (!wasAlarm && this.smokePpm > SMOKE.alarmThresholdPpm) this.smokeAlarm = true
    if (wasAlarm && this.smokePpm < SMOKE.alarmThresholdPpm * 0.75) this.smokeAlarm = false

    if (this.smokeAlarm !== wasAlarm) {
      this.log(
        this.smokeAlarm ? 'critical' : 'info',
        SMOKE.label,
        this.smokeAlarm
          ? `ALARMA: humo ${Math.round(this.smokePpm)} ppm (umbral ${SMOKE.alarmThresholdPpm} ppm)`
          : 'Alarma de humo normalizada',
      )
    }

    this.emit({ type: 'smoke', ts, ppm: Math.round(this.smokePpm), alarm: this.smokeAlarm, simulating })
  }

  /** Vatios de luces y enchufes por habitación (para las ganancias de calor). */
  protected loadsByRoom() {
    const out: Record<string, number> = {}
    for (const l of LIGHTS) {
      const st = this.lights[l.id]
      const roomId = ROOMS.find((r) => r.label === l.room)?.id
      if (st.on && roomId) out[roomId] = (out[roomId] ?? 0) + (st.intensity / 100) * METER.lightMaxW
    }
    for (const p of PLUGS) {
      const st = this.plugs[p.id]
      if (st.on) out[p.room] = (out[p.room] ?? 0) + st.watts
    }
    return out
  }

  protected tickClimate(ts: number) {
    const tout = this.outdoor(this.hour())
    const loads = this.loadsByRoom()

    for (const room of ROOMS) {
      const st = this.rooms[room.id]
      const target = tout - CLIMATE.insulation + ((loads[room.id] ?? 0) / 1000) * CLIMATE.gainPerKw
      const heat = room.id === 'cocina' && this.heatBoost ? Math.max(0, SENSORS.events.heatKitchen.toC - target) : 0
      st.t += (target + heat - st.t) * CLIMATE.leakPerTick

      let cooling = 0
      for (const def of AIR_CONDITIONERS) {
        if (def.room === room.id) cooling += this.runAc(this.acs[def.id], st.t)
      }
      st.t -= cooling
      st.t += (Math.random() - 0.5) * 0.03

      // El aire frío y seco: el A/C también deshumidifica
      let hTarget = clamp(78 - (st.t - 20) * 2.2 - (cooling > 0 ? 10 : 0), 32, 90)
      if (room.id === 'bano_principal' && this.humidityBoost) hTarget = SENSORS.events.humidityBath.toPct
      st.h += (hTarget - st.h) * 0.04 + (Math.random() - 0.5) * 0.4
    }

    for (const def of AIR_CONDITIONERS) {
      const a = this.acs[def.id]
      this.emit({ type: 'ac', id: a.id, patch: { running: a.running, watts: a.watts } })
    }
    this.emitClimate(ts)
  }

  protected emitClimate(ts: number) {
    const hour = this.hour()
    const world: WorldState = {
      hour: round(hour, 2),
      outdoorTemp: round(this.outdoor(hour), 1),
      hourOverride: this.hourOverride !== null,
    }
    this.emit({
      type: 'climate',
      ts,
      rooms: Object.fromEntries(
        Object.entries(this.rooms).map(([id, r]) => [id, { temperature: round(r.t, 1), humidity: Math.round(r.h) }]),
      ),
      world,
    })
  }

  protected tickPower(ts: number) {
    // Base: nevera (con el ciclo del compresor) + standby
    const base = METER.baseLoadW + 6 * Math.sin(ts / 9000) + (Math.random() - 0.5) * 4

    let lights = 0
    for (const l of Object.values(this.lights)) if (l.on) lights += (l.intensity / 100) * METER.lightMaxW

    let ac = 0
    for (const a of Object.values(this.acs)) ac += a.watts

    const plugs = this.tickPlugs(ts)

    const breakdown: PowerBreakdown = {
      base: round(base, 1),
      lights: round(lights, 1),
      ac: Math.round(ac),
      plugs: Math.round(plugs),
    }
    const watts = round(breakdown.base + breakdown.lights + breakdown.ac + breakdown.plugs, 1)
    this.kwh += ((watts * (TICK_MS / 1000)) / 3600 / 1000) * METER.energyTimeScale

    this.lastWatts = watts
    this.emit({ type: 'power', ts, watts, kwhTotal: this.kwh, breakdown })
  }

  /** Consumo de los enchufes inteligentes (W y kWh). Devuelve los W totales. */
  protected tickPlugs(ts: number): number {
    let plugs = 0
    for (const def of PLUGS) {
      const p = this.plugs[def.id]
      const w = !p.on
        ? 0
        : def.profile === 'cycle'
          ? def.watts * (0.35 + 0.65 * Math.abs(Math.sin(ts / 4000))) // lavado / centrifugado
          : def.watts * (0.94 + Math.random() * 0.12)
      p.watts = Math.round(w)
      // kWh = W · h / 1000, acelerado por energyTimeScale
      p.kwh += ((p.watts * (TICK_MS / 1000)) / 3600 / 1000) * METER.energyTimeScale
      plugs += p.watts
      this.emit({ type: 'plug', id: def.id, patch: { watts: p.watts, kwh: p.kwh } })
    }
    return plugs
  }

  /* ───────────────────────────── utilidades ───────────────────────────── */

  protected snapshot(): HouseSnapshot {
    const hour = this.hour()
    return {
      lights: structuredClone(this.lights),
      smoke: { ppm: Math.round(this.smokePpm), alarm: this.smokeAlarm, simulating: this.smokeLeak },
      pir: Object.fromEntries(
        Object.entries(this.pirMotion).map(([id, motion]) => [id, { motion, lastTriggerAt: null }]),
      ),
      doors: Object.fromEntries(Object.entries(this.doors).map(([id, open]) => [id, { open }])),
      power: { watts: METER.baseLoadW, kwhTotal: this.kwh },
      climate: Object.fromEntries(
        Object.entries(this.rooms).map(([id, r]) => [id, { temperature: round(r.t, 1), humidity: Math.round(r.h) }]),
      ),
      acs: structuredClone(this.acs),
      plugs: structuredClone(this.plugs),
      security: { ...this.security },
      world: { hour: round(hour, 2), outdoorTemp: round(this.outdoor(hour), 1), hourOverride: this.hourOverride !== null },
    }
  }

  protected log(level: EventLevel, source: string, message: string) {
    if (this.quiet && level === 'info') return
    this.emit({
      type: 'event',
      event: { id: `sim-${Date.now()}-${eventSeq++}`, ts: Date.now(), level, source, message },
    })
  }
}
