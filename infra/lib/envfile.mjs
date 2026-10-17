/**
 * Lector/escritor mínimo de archivos .env (sin dependencias) que CONSERVA comentarios y orden.
 * Soporta valores entre comillas simples ('…', literales: necesarias para el hash bcrypt, que lleva «$») y dobles.
 */
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'

export function parsear(texto) {
  const lineas = texto.split(/\r?\n/)
  const valores = {}
  for (const l of lineas) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l)
    if (!m) continue
    let v = m[2]
    if (/^'.*'$/.test(v) || /^".*"$/.test(v)) v = v.slice(1, -1)
    else v = v.replace(/\s+#.*$/, '')
    valores[m[1]] = v
  }
  return { lineas, valores }
}

export function leer(ruta) {
  return existsSync(ruta) ? parsear(readFileSync(ruta, 'utf8')) : { lineas: [], valores: {} }
}

/** Valor listo para escribir: entre comillas simples si tiene «$», espacios o «#». */
const fmt = (v) => (/[$\s#'"`\\]/.test(v) ? "'" + v.replace(/'/g, '') + "'" : v)

/** Cambia (o añade al final) las claves indicadas, manteniendo el resto del archivo igual. */
export function escribir(ruta, cambios, cabeceraSiNuevo = '') {
  const { lineas } = leer(ruta)
  const out = lineas.length ? [...lineas] : cabeceraSiNuevo ? cabeceraSiNuevo.split('\n') : []
  while (out.length && out[out.length - 1] === '') out.pop() // sin líneas en blanco sobrantes antes de añadir
  for (const [k, v] of Object.entries(cambios)) {
    const i = out.findIndex((l) => new RegExp('^\\s*(?:export\\s+)?' + k + '\\s*=').test(l))
    const linea = `${k}=${fmt(String(v))}`
    if (i >= 0) out[i] = linea
    else out.push(linea)
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  writeFileSync(ruta, out.join('\n') + '\n', { mode: 0o600 })
  try { chmodSync(ruta, 0o600) } catch { /* en Windows no aplica */ }
}
