/**
 * Configuración de Node-RED para el gemelo digital (versión endurecida).
 *
 * Ningún secreto vive en este archivo: todo viene de variables de entorno (ver .env.example en la raíz).
 *
 *   NODERED_ADMIN_USER          usuario del EDITOR de Node-RED (no es un usuario de la casa). Por defecto «admin».
 *   NODERED_ADMIN_HASH          hash bcrypt de la contraseña del editor. Se genera con:  npm run seguridad:secretos
 *                               (o a mano:  npx node-red-admin hash-pw)
 *   NODERED_EDITOR              open → editor SIN contraseña (solo para pruebas locales; avisa en el registro)
 *   NODERED_CREDENTIAL_SECRET   clave con la que Node-RED cifra flows_cred.json (mín. 16 caracteres)
 *   NODERED_BIND                interfaz donde escucha (por defecto 127.0.0.1; en Docker, 0.0.0.0 dentro del contenedor
 *                               y el puerto se publica solo en 127.0.0.1 del anfitrión)
 *   NODERED_API_MAX             tamaño máximo de una petición HTTP (por defecto 1mb)
 *   + las variables CASA_* del control de handshake (ver seguridad-ws.js)
 *
 * Política del editor (falla cerrado):
 *   hash definido            → el editor pide usuario y contraseña (sesión de 1 h)
 *   sin hash + NODERED_EDITOR=open → editor abierto, con aviso. Solo para tu equipo, nunca en un servidor público.
 *   sin hash y sin «open»    → el editor y la API de administración quedan APAGADOS (los flujos siguen funcionando).
 *
 * Por qué importa: quien llega al editor puede leer el estado interno, cambiar el flujo y ejecutar código en el servidor.
 */
'use strict'
const { crearVerificador } = require('./seguridad-ws.js')

const env = process.env
const hash = String(env.NODERED_ADMIN_HASH || '').trim()
const abierto = /^open$/i.test(String(env.NODERED_EDITOR || '').trim())
const secreto = String(env.NODERED_CREDENTIAL_SECRET || '').trim()

if (secreto && secreto.length < 16) {
  console.warn('[seguridad] NODERED_CREDENTIAL_SECRET es demasiado corta (mínimo 16 caracteres): se ignora.')
}

const editor = hash ? 'protegido' : abierto ? 'abierto' : 'apagado'
if (editor === 'abierto') console.warn('[seguridad] ATENCIÓN: el editor de Node-RED está SIN contraseña (NODERED_EDITOR=open). Solo para tu equipo.')
if (editor === 'apagado') console.warn('[seguridad] El editor y la API de administración están APAGADOS (falta NODERED_ADMIN_HASH). Los flujos siguen funcionando. Para habilitarlo: npm run seguridad:secretos')

const settings = {
  flowFile: 'flows.json',

  // Cifra flows_cred.json en disco. Los tokens de InfluxDB NO están ahí: el archivo solo trae referencias ${VAR} (ver tools/build-flows.mts).
  credentialSecret: secreto.length >= 16 ? secreto : false,

  uiPort: env.PORT || 1880,
  uiHost: env.NODERED_BIND || '127.0.0.1',

  // Editor y API de administración
  ...(editor === 'apagado' ? { httpAdminRoot: false } : {}),
  ...(editor === 'protegido'
    ? {
        adminAuth: {
          type: 'credentials',
          sessionExpiryTime: 3600,
          users: [{ username: env.NODERED_ADMIN_USER || 'admin', password: hash, permissions: '*' }],
          // sin «default»: una petición sin credenciales no recibe ningún permiso
        },
      }
    : {}),

  // Tamaño máximo de una petición HTTP (la ingesta firmada pesa < 8 KB; desplegar un flujo desde el editor, bastante más)
  apiMaxLength: env.NODERED_API_MAX || '1mb',

  // Handshake del WebSocket: Origin permitido + conexiones por IP (ver seguridad-ws.js)
  webSocketNodeVerifyClient: crearVerificador(env),

  // Cabeceras mínimas en las rutas /api (CORS lo decide el propio flujo con la lista CASA_ALLOWED_ORIGINS)
  httpNodeMiddleware: (req, res, next) => {
    res.removeHeader('X-Powered-By')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    next()
  },

  diagnostics: { enabled: false, ui: false },
  exportGlobalContextKeys: false,
  // «audit» deja en el registro quién usó la API de administración
  logging: { console: { level: 'info', metrics: false, audit: editor !== 'apagado' } },
  editorTheme: { projects: { enabled: false } },
}

module.exports = settings
