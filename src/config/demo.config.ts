/**
 * Material de DEMOSTRACIÓN PÚBLICA de la casa.
 *
 * El proyecto es académico y está publicado para que cualquiera pueda ver cómo funciona el sistema completo.
 * Aquí viven dos cosas que solo tienen sentido en ese contexto: el enlace al vídeo guía y, si se configura,
 * una credencial de prueba que la pantalla ofrece en el diálogo de emparejamiento.
 *
 * ⚠ LEE ESTO ANTES DE TOCAR LA CREDENCIAL
 *
 * Todo lo que empieza por VITE_ se copia DENTRO del código que descarga el navegador: lo que pongas aquí es
 * PÚBLICO para siempre. La regla general del proyecto (ver AGENTS.md y .env.example) es que NUNCA va una clave
 * en una variable VITE_. Esta es la única excepción, y es deliberada: el objetivo es justamente que la clave se
 * vea. Para que la excepción no se convierta en un agujero:
 *
 *   1. Se publica SOLO el rol de operador. El de administrador no se expone: puede lanzar simulaciones, mover
 *      la hora simulada y revocar las demás sesiones, lo que congelaría el emparejamiento cinco minutos.
 *   2. El valor se define en el panel de Vercel (Settings ▸ Environment Variables) y, en local, en el archivo
 *      .env, que Git ignora. NUNCA en el repositorio: este archivo solo lee el nombre de la variable, y si no
 *      está definida la pantalla no muestra nada y pide la clave como siempre.
 *   3. Lo más limpio es una clave PERSONAL dedicada, que se quita sin tocar nada más y deja su propio rastro
 *      en la auditoría:
 *          npm run seguridad:secretos -- --usuario demo-operador:operador
 *      Si en su lugar se publica la clave compartida CASA_PAIRING_KEY, la demostración funciona igual, pero la
 *      auditoría registrará a todo el mundo como «compartida-operador» y rotarla echará también a las personas
 *      del equipo que la estén usando.
 *   4. Para cerrar la demostración basta con borrar la variable en Vercel (y, si era personal, su entrada de
 *      CASA_USERS en Render). No hace falta cambiar código.
 *
 * Qué puede hacer quien use esta clave: manejar luces, climatización, tomacorrientes, puertas, escenas y la
 * alarma, y consultar el historial completo. Las acciones sensibles (desarmar, abrir el perímetro) siguen
 * pidiendo confirmación con código. La casa es simulada: no hay puertas reales que abrir.
 */
import type { SessionRole } from '../types/iot'

/** Vídeo guía del proyecto. No es un secreto: es un enlace público. */
export const VIDEO_URL = import.meta.env.VITE_VIDEO_URL ?? 'https://youtu.be/J3dBYM0y5j0'

export interface DemoCredential {
  role: Extract<SessionRole, 'operador'>
  /** Alias con el que el servidor la registra en la auditoría. Solo informativo. */
  alias: string
  key: string
}

const clave = (import.meta.env.VITE_DEMO_OPERADOR_KEY ?? '').trim()

/**
 * Credencial que la pantalla ofrece en el diálogo de emparejamiento.
 * Vacío = no se configuró y el bloque de demostración no aparece.
 */
export const DEMO_CREDENTIAL: DemoCredential | null =
  clave.length >= 8
    ? { role: 'operador', alias: import.meta.env.VITE_DEMO_OPERADOR_ALIAS ?? 'demo-operador', key: clave }
    : null
