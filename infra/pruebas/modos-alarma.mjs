/**
 * Ejecuta los nodos 20-puertas.js y 30-pir.js tal cual estan en el repositorio, con el contexto
 * de Node-RED simulado, y comprueba el comportamiento de los tres modos de alarma.
 */
import fs from 'node:fs'

import { fileURLToPath } from "node:url"
import path from "node:path"
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const cuerpo = (f) => fs.readFileSync(path.join(RAIZ, "infra/nodered/src", f), 'utf8')

// Configuracion minima, con los mismos ids que house.config.ts
const cfg = {
  DOORS: [
    { id: 'Sensor_Puerta_Entrada', label: 'Puerta de entrada', sensor: true, pir: null },
    { id: 'Puerta_Sala_Estudio', label: 'Interior · Sala de estudio', sensor: false, pir: 'Sensor_PIR_Entrada_Dormitorio_Principal' },
  ],
  PIRS: [{ id: 'Sensor_PIR_Entrada_Dormitorio_Principal', label: 'Entrada · Dormitorio principal', lightIds: ['Luz_Dormitorio_Principal'] }],
  PIR_HOLD_MS: 8000,
  LIGHTS: [{ id: 'Luz_Dormitorio_Principal', label: 'Dormitorio principal' }],
}

const correr = (archivo, cmd, S) => {
  const out = [], cmds = [], delayed = []
  const ctx = {
    cfg, S, cmd, now: Date.now(), out, cmds, delayed,
    log: () => {},
    nameOf: (lista, id) => (lista.find((x) => x.id === id) || {}).label || id,
    done: () => ({ out, cmds }),
  }
  const fn = new Function(...Object.keys(ctx), cuerpo(archivo))
  fn(...Object.values(ctx))
  return { out, cmds }
}

const estado = (modo) => ({
  security: { mode: modo, alarm: false, cause: null },
  doors: {}, pirMotion: {}, pirUntil: {}, pirAuto: {},
  lights: { Luz_Dormitorio_Principal: { on: false } },
})

const casos = []
const apunta = (nombre, ok, detalle) => casos.push({ nombre, ok, detalle })

for (const modo of ['disarmed', 'home', 'away']) {
  // 1 · puerta INTERIOR abierta
  const S = estado(modo)
  const r = correr('20-puertas.js', { kind: 'door.set', id: 'Puerta_Sala_Estudio', open: true }, S)
  const pir = r.cmds.find((c) => c.kind === 'pir.simulate')
  const alarma = r.cmds.find((c) => c.kind === 'security.trigger')
  apunta(`[${modo}] puerta interior: despierta el detector`, modo === 'disarmed' ? !pir : !!pir, pir ? 'pir.simulate silent=' + pir.silent : 'ninguno')
  apunta(`[${modo}] puerta interior: NO suena la alarma`, !alarma, alarma ? 'DISPARO: ' + alarma.cause : 'sin disparo')

  // 2 · ese detector, con la casa en ese modo, no debe disparar por ser silencioso
  if (pir) {
    const r2 = correr('30-pir.js', Object.assign({ kind: 'pir.simulate' }, pir), S)
    const alarma2 = r2.cmds.find((c) => c.kind === 'security.trigger')
    const luz = r2.cmds.find((c) => c.kind === 'light.set' && c.patch && c.patch.on)
    apunta(`[${modo}] detector silencioso: NO suena la alarma`, !alarma2, alarma2 ? 'DISPARO: ' + alarma2.cause : 'sin disparo')
    apunta(`[${modo}] detector silencioso: enciende la luz`, !!luz, luz ? luz.id : 'ninguna')
  }

  // 3 · puerta del PERIMETRO
  const S3 = estado(modo)
  const r3 = correr('20-puertas.js', { kind: 'door.set', id: 'Sensor_Puerta_Entrada', open: true }, S3)
  const alarma3 = r3.cmds.find((c) => c.kind === 'security.trigger')
  // El disparo se manda siempre; quien decide si suena es «Seguridad». Hay que pasarlo por ese nodo.
  if (alarma3) correr('60-seguridad.js', alarma3, S3)
  const suena = S3.security.alarm
  apunta(`[${modo}] puerta de entrada: ${modo === 'disarmed' ? 'NO' : 'SI'} suena`, modo === 'disarmed' ? !suena : suena, suena ? 'ALARMA: ' + S3.security.cause : 'en silencio')

  // 4 · movimiento REAL (no silencioso)
  const S4 = estado(modo)
  const r4 = correr('30-pir.js', { kind: 'pir.simulate', id: 'Sensor_PIR_Entrada_Dormitorio_Principal' }, S4)
  const alarma4 = r4.cmds.find((c) => c.kind === 'security.trigger')
  apunta(`[${modo}] movimiento real: ${modo === 'away' ? 'SI' : 'no'} dispara`, modo === 'away' ? !!alarma4 : !alarma4, alarma4 ? alarma4.cause : 'sin disparo')
}

let fallos = 0
for (const c of casos) {
  if (!c.ok) fallos++
  console.log((c.ok ? '  ok  ' : ' FALLA') + '  ' + c.nombre.padEnd(52) + c.detalle)
}
console.log('\n' + (fallos ? fallos + ' fallo(s)' : 'las ' + casos.length + ' comprobaciones pasan'))
process.exit(fallos ? 1 : 0)
