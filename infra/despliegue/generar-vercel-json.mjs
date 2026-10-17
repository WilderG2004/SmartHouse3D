#!/usr/bin/env node
/**
 * Genera  vercel.json  (cabeceras de seguridad para el frontend en Vercel) con la política CSP ajustada a TU backend.
 *
 *   node infra/despliegue/generar-vercel-json.mjs --backend casa-api.midominio.com [--grafana https://…] [--salida vercel.json]
 *
 * Por qué hace falta un script: Vercel no sustituye variables dentro de las cabeceras, y la CSP debe nombrar EXACTAMENTE
 * a qué servidores puede conectarse la página (connect-src). Lo que no esté en la lista, el navegador lo bloquea:
 * así, aunque alguien consiguiera inyectar un script en la página, no podría mandar datos a un servidor ajeno.
 *
 * Qué pone la política:
 *   default-src 'self'                       todo viene de tu propio dominio salvo lo que se permite abajo
 *   script-src 'self' 'wasm-unsafe-eval'    sin scripts en línea ni de terceros. 'wasm-unsafe-eval' SOLO deja compilar WebAssembly
 *                                            (el visor 3D decodifica el modelo con un módulo wasm); no habilita eval() de JavaScript
 *   style-src 'self' + style-src-attr 'unsafe-inline'   (React escribe estilos en atributos; las hojas de estilo son propias)
 *   connect-src 'self' wss://BACKEND https://BACKEND    el WebSocket y la API: lo ÚNICO externo a lo que puede hablar
 *   img-src 'self' data: blob:  ·  font-src 'self'  ·  worker-src 'self' blob:   (el visor 3D crea texturas y workers en memoria)
 *   frame-src (solo con --grafana)           para incrustar el panel de Grafana; sin la opción: 'none'
 *   object-src 'none' · base-uri 'none' · form-action 'none' · frame-ancestors 'none'   (nadie puede incrustar tu página)
 *
 * Límite honesto: la CSP y estas cabeceras protegen al NAVEGADOR del usuario. No protegen al backend: un script o un
 * programa que no sea un navegador ignora la CSP por completo (la defensa del backend es la clave de emparejamiento,
 * la validación en Node-RED y el proxy).
 */
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const here = dirname(fileURLToPath(import.meta.url))
const backend = String(opt('--backend', '')).replace(/^(https?|wss?):\/\//, '').replace(/\/.*$/, '')
const grafana = opt('--grafana', '')
const salida = resolve(opt('--salida', join(here, '..', '..', 'vercel.json')))

if (!/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?$/i.test(backend) && backend !== 'localhost') {
  console.error('Falta --backend con el nombre público de tu servidor, p. ej.:  --backend casa-api.midominio.com')
  process.exit(1)
}
let grafanaOrigin = ''
if (grafana) {
  try { grafanaOrigin = new URL(grafana).origin } catch { console.error('--grafana no es una URL válida'); process.exit(1) }
}

const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' wss://${backend} https://${backend}`,
  "worker-src 'self' blob:",
  grafanaOrigin ? `frame-src ${grafanaOrigin}` : "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const config = {
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
      ],
    },
    {
      source: '/assets/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
  ],
}
writeFileSync(salida, JSON.stringify(config, null, 2) + '\n')
console.log(`✔ ${salida}\n  connect-src → 'self' wss://${backend} https://${backend}${grafanaOrigin ? '\n  frame-src   → ' + grafanaOrigin : ''}`)
