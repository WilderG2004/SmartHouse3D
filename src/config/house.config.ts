/**
 * Configuración central del gemelo digital.
 *
 * TODO lo que depende de los nombres de nodos del .glb vive aquí.
 * Si en Blender renombras un Empty, solo cambias el `id` correspondiente.
 * (Al cargar el modelo, la consola imprime todos los nombres de nodos y avisa
 *  de cuáles de esta lista no se encontraron.)
 */
import type { TimePoint } from '../types/iot'

export const MODEL_URL = '/Iot_Casa.glb'

/* ───────────────────────── Luces (Empties "Luz_*") ───────────────────────── */

export interface LightDef {
  /** Nombre EXACTO del Empty en el .glb */
  id: string
  label: string
  /** Se usa para agrupar en el panel y para la alarma de humo (ver SMOKE.alarmRoom) */
  room: string
}

export const DEFAULT_LIGHT_COLOR = '#ffe2b0'

export const LIGHTS: LightDef[] = [
  { id: 'Luz_Sala_Principal_1', label: 'Sala principal 1', room: 'Sala principal' },
  { id: 'Luz_Sala_Principal_2', label: 'Sala principal 2', room: 'Sala principal' },
  { id: 'Luz_Sala_Entrada_1', label: 'Sala de entrada 1', room: 'Sala de entrada' },
  { id: 'Luz_Sala_Entrada_2', label: 'Sala de entrada 2', room: 'Sala de entrada' },
  { id: 'Luz_Sala_Estudio_1', label: 'Sala de estudio 1', room: 'Sala de estudio' },
  { id: 'Luz_Sala_Estudio_2', label: 'Sala de estudio 2', room: 'Sala de estudio' },
  // OJO: en el modelo el nodo se llama "Concina" (sin K). Se respeta tal cual.
  { id: 'Luz_Concina_1', label: 'Cocina 1', room: 'Cocina' },
  { id: 'Luz_Concina_2', label: 'Cocina 2', room: 'Cocina' },
  { id: 'Luz_Lavanderia_1', label: 'Lavandería 1', room: 'Lavandería' },
  { id: 'Luz_Lavanderia_2', label: 'Lavandería 2', room: 'Lavandería' },
  { id: 'Luz_Garage', label: 'Garaje', room: 'Garaje' },
  { id: 'Luz_Dormitorio_Principal', label: 'Dormitorio principal', room: 'Dormitorio principal' },
  { id: 'Luz_Closet_Principal', label: 'Closet', room: 'Dormitorio principal' },
  { id: 'Luz_Dormitorio_2', label: 'Dormitorio 2', room: 'Dormitorio 2' },
  { id: 'Luz_Dormitorio_3', label: 'Dormitorio 3', room: 'Dormitorio 3' },
  { id: 'Luz_Baño_Principal', label: 'Baño principal', room: 'Baño principal' },
  { id: 'Luz_Baño_Visitas', label: 'Baño de visitas', room: 'Baño de visitas' },
]

/** Estado inicial de la simulación: qué luces arrancan encendidas. */
export const INITIAL_LIGHTS_ON: Record<string, number> = {
  Luz_Sala_Principal_1: 80,
  Luz_Sala_Principal_2: 80,
  Luz_Concina_1: 100,
}

/* ──────────────────────────── Sensor de humo ──────────────────────────── */

export const SMOKE = {
  id: 'Sensor_Humo_Cocina',
  label: 'Humo · Cocina',
  normalPpm: 12,
  alarmThresholdPpm: 400,
  /** Las luces de esta habitación parpadean en rojo mientras haya alarma. */
  alarmRoom: 'Cocina',
}

/* ───────────────────────────── Sensores PIR ───────────────────────────── */

export interface PirDef {
  id: string
  label: string
  /** Luces que este PIR enciende automáticamente (PIR_HOLD_MS). Ajusta a tu gusto. */
  lightIds: string[]
  /** PIR "principal": etiqueta 3D siempre con texto y el que usa el botón grande. */
  primary?: boolean
}

export const PIR_HOLD_MS = 8000

export const PIRS: PirDef[] = [
  {
    id: 'Sensor_PIR_Entrada_Sala_Principal',
    label: 'Entrada · Sala principal',
    lightIds: ['Luz_Sala_Entrada_1', 'Luz_Sala_Entrada_2'],
    primary: true,
  },
  {
    id: 'Sensor_PIR_Entrada_Cocina',
    label: 'Entrada · Cocina',
    lightIds: ['Luz_Concina_2', 'Luz_Lavanderia_1'],
  },
  {
    id: 'Sensor_PIR_Entrada_Dormitorio_Principal',
    label: 'Entrada · Dormitorio principal',
    lightIds: ['Luz_Dormitorio_Principal', 'Luz_Closet_Principal'],
  },
  {
    // OJO: en el modelo se escribe "Lavaneria" (sin d). Se respeta tal cual.
    id: 'Sensor_PIR_Entrada_Lavaneria',
    label: 'Entrada · Lavandería',
    lightIds: ['Luz_Lavanderia_2', 'Luz_Garage'],
  },
  {
    id: 'Sensor_PIR_Entrada_Lavaneria_2',
    label: 'Entrada · Lavandería 2',
    lightIds: ['Luz_Lavanderia_1', 'Luz_Lavanderia_2'],
  },
]

/* ───────────────────────────── Puertas ───────────────────────────── */

/**
 * PROBLEMA DEL MODELO (Blender) que se corrige por código en three/doors.ts:
 *   1. Las hojas de puerta son mallas sueltas llamadas Cube.016 … Cube.037 (sin nombre útil).
 *   2. Su origen (pivote) está en el CENTRO de la hoja, no en la bisagra → girarlas "en seco"
 *      las haría rotar sobre sí mismas atravesando el marco.
 *   3. La puerta del garaje (Cube.037) tiene el origen a ~67 unidades de distancia
 *      (comparte origen con los muros) y además no gira: se desliza hacia arriba.
 *   4. Las manijas son piezas sueltas (Plano.001 … Plano.011) que no cuelgan de su puerta:
 *      sin `handle` se quedarían flotando en el marco al abrir.
 *
 * Aquí se declara qué malla es cada puerta, su manija y hacia dónde abre. Para arreglarlo "de verdad"
 * en Blender, ver el README (sección «Puertas»).
 *
 * `mesh` y `handle` son el nombre que ve three.js: GLTFLoader QUITA los puntos ("Cube.032" → "Cube032").
 *
 * Sentidos elegidos (medidos sobre el plano del modelo): cada puerta abre HACIA DENTRO de la habitación a la que da
 * paso y queda casi pegada a una pared, para no tapar el pasillo. Las tres de la lavandería abren en el sentido
 * cocina → lavandería → garaje.
 */
export interface DoorDef {
  /** Clave de estado. Para puertas con sensor = nombre del Empty (Sensor_Puerta_*). */
  id: string
  label: string
  /** Nombre de la malla en three.js (sin puntos) */
  mesh: string
  kind: 'swing' | 'slide'
  /** swing: malla de la manija. Gira junto con la hoja y fija la bisagra en el borde contrario. */
  handle?: string
  /** swing: extremo del eje largo donde está la bisagra. Sin valor: el lado opuesto a la manija (o 'min' si no hay manija). */
  hinge?: 'min' | 'max'
  /** swing: sentido del giro. Si la puerta abre hacia el lado equivocado (p. ej. hacia el pasillo), cambia el signo. */
  dir?: 1 | -1
  /** true = tiene un Empty `id` en el modelo (muestra etiqueta flotante) */
  sensor?: boolean
}

export const DOOR_OPEN_ANGLE = Math.PI / 2 // 90°

export const DOORS: DoorDef[] = [
  { id: 'Sensor_Puerta_Entrada', label: 'Puerta de entrada', mesh: 'Cube032', handle: 'Plano009', kind: 'swing', dir: 1, sensor: true }, // hacia la sala de entrada
  { id: 'Sensor_Puerta_Garage', label: 'Puerta del garaje', mesh: 'Cube037', kind: 'slide', sensor: true },
  { id: 'Puerta_Sala_Principal', label: 'Entrada · Sala principal', mesh: 'Cube016', handle: 'Plano001', kind: 'swing', dir: 1 }, // hacia la sala principal
  { id: 'Puerta_Cocina', label: 'Entrada · Cocina', mesh: 'Cube030', handle: 'Plano008', kind: 'swing', dir: -1 }, // cocina → lavandería
  { id: 'Puerta_Lavanderia_2', label: 'Entrada · Lavandería 2', mesh: 'Cube028', handle: 'Plano007', kind: 'swing', dir: -1 },
  { id: 'Puerta_Lavanderia', label: 'Entrada · Lavandería', mesh: 'Cube026', handle: 'Plano006', kind: 'swing', dir: -1 }, // → garaje
  { id: 'Puerta_Dormitorio_Principal', label: 'Entrada · Dormitorio principal', mesh: 'Cube020', handle: 'Plano003', kind: 'swing', dir: 1 }, // hacia el dormitorio
  { id: 'Puerta_Dormitorio_Principal_Interior', label: 'Interior · Dormitorio principal', mesh: 'Cube018', handle: 'Plano002', kind: 'swing', dir: 1 }, // hacia el closet
  { id: 'Puerta_Dormitorio_3', label: 'Interior · Dormitorio 3', mesh: 'Cube022', handle: 'Plano004', kind: 'swing', dir: 1 }, // hacia el dormitorio
  { id: 'Puerta_Sala_Estudio', label: 'Interior · Sala de estudio', mesh: 'Cube024', handle: 'Plano005', kind: 'swing', dir: 1 }, // hacia el estudio
  { id: 'Puerta_Bano_Visitas', label: 'Interior · Baño de visitas', mesh: 'Cube034', handle: 'Plano010', kind: 'swing', dir: 1 }, // hacia el baño principal
  { id: 'Puerta_Pasillo', label: 'Interior · Pasillo', mesh: 'Cube036', handle: 'Plano011', kind: 'swing', dir: 1 }, // hacia el baño de visitas
]

/* ──────────────────────────── Medidor de energía ──────────────────────────── */

export const METER = {
  id: 'Medidor_General',
  label: 'Medidor general',
  /** Nevera, router, standby… */
  baseLoadW: 80,
  /** Potencia de cada luz al 100 % */
  lightMaxW: 15,
  /**
   * Multiplica el tiempo al integrar kWh: 60 → 1 s real = 1 min simulado.
   * Así el acumulado y el costo se mueven de forma visible en una demo.
   * Ponlo en 1 para tiempo real.
   */
  energyTimeScale: 60,
}

/** Tarifa de ejemplo (COP por kWh). AJÚSTALA a la de tu factura; no es un dato oficial. */
export const TARIFF_COP_PER_KWH = 950

/* ───────────────────────────── Escena 3D ───────────────────────────── */

export const VIEW = {
  /** Centro de la casa (calculado con la geometría real del modelo). */
  target: [9, 1.5, -10.8] as [number, number, number],
  /** Offsets de cámara respecto al target. */
  iso: [46, 54, 52] as [number, number, number],
  top: [0, 120, 0.1] as [number, number, number],
}

/**
 * Recorrido en primera persona (three/WalkMode.tsx).
 * Piezas del modelo que NO frenan al caminar (nombre de la malla, sin puntos). Son las que dejan un cuarto sin acceso:
 *   - Cubo002 = la cama del Dormitorio 2: queda a 0,6 de la pared, pegada a la puerta, y no dejaria entrar.
 * Si agregas muebles en Blender y alguno tapa una puerta, anota aqui su nombre.
 */
export const WALK_THROUGH = ['Cubo002']

/**
 * Intensidad del PointLight al 100 % (unidades físicas de three.js, decay = 2).
 * Las luces del modelo cuelgan a 7–14 u de altura, por eso el valor es alto.
 * Si la casa se ve muy oscura/quemada, ajusta este número.
 */
export const LIGHT_INTENSITY_AT_100 = 380
export const LIGHT_DISTANCE = 48
export const ALARM_FLASH_HZ = 1.8
export const AMBIENT_DEFAULT = 0.7

/* ─────────────────────── Materiales por colección (Blender) ─────────────────────── */

/** Tipo de superficie que usan el mini-mapa y los choques del recorrido (`floor` no frena; lo demás sí). */
export type SurfaceKind = 'floor' | 'wall' | 'frame' | 'door' | 'furniture'

/**
 * Las colecciones de Blender. El exportador glTF las aplanó (todas las mallas cuelgan de la escena), así que aquí se
 * vuelven a armar por NOMBRE de malla (el que ve three.js, sin puntos: "Cubo.052" → "Cubo052"). Los nombres y la cuenta
 * de cada una salen de leer el .glb: paredes 1, piso 4, ventanas 11 (+ el Empty Cube003), puertas 23 (hojas y marcos),
 * chapas 12, y los 67 muebles «Cubo…» repartidos como en Blender.
 */
export type CollectionId =
  | 'paredes'
  | 'piso'
  | 'ventanas'
  | 'puertas'
  | 'chapas'
  | 'camas'
  | 'mesasSillasSofas'
  | 'mesaTv'
  | 'armarios'
  | 'mesitas'
  | 'bano'
  | 'cocina'
  | 'lavanderia'

const serie = (prefix: string, nums: number[]) => nums.map((n) => (n === 0 ? prefix : prefix + String(n).padStart(3, '0')))
const rango = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

export const COLLECTIONS: Record<CollectionId, { label: string; meshes: string[]; furniture?: boolean }> = {
  paredes: { label: 'Paredes', meshes: ['Cube'] },
  piso: { label: 'Piso', meshes: serie('Plano', rango(12, 15)) },
  ventanas: { label: 'Ventanas', meshes: serie('Cube', [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]) },
  puertas: { label: 'Puertas', meshes: serie('Cube', [14, 15, 16, ...rango(18, 37)]) },
  chapas: { label: 'Chapas de la puerta', meshes: serie('Plano', rango(0, 11)) },
  camas: { label: 'Camas', meshes: serie('Cubo', [0, 1, 2]), furniture: true },
  mesitas: { label: 'Mesitas de noche', meshes: serie('Cubo', [3, 4, 5, 6]), furniture: true },
  mesaTv: { label: 'Mesa de TV', meshes: serie('Cubo', [7, 12, 13, 14, 15, 22]), furniture: true },
  armarios: { label: 'Armarios', meshes: serie('Cubo', [8, 9, 10, 11]), furniture: true },
  lavanderia: { label: 'Lavandería', meshes: serie('Cubo', rango(52, 55)), furniture: true },
  cocina: { label: 'Decoración cocina', meshes: serie('Cubo', rango(57, 60)), furniture: true },
  bano: { label: 'Decoración baño', meshes: serie('Cubo', [32, 33, 34, 56, ...rango(61, 66)]), furniture: true },
  mesasSillasSofas: {
    label: 'Mesas, sillas y sofás',
    meshes: serie('Cubo', [...rango(16, 21), 23, 24, ...rango(25, 31), ...rango(35, 51)]),
    furniture: true,
  },
}

/**
 * Acabados PBR. `physical` = MeshPhysicalMaterial (vidrio, cerámica esmaltada); el resto, MeshStandardMaterial.
 * Colores de casa real: muros marfil, piso de roble claro, puertas de nogal, textiles neutros con dos acentos.
 */
export interface Finish {
  color: string
  roughness: number
  metalness?: number
  physical?: { transmission?: number; ior?: number; thickness?: number; clearcoat?: number; clearcoatRoughness?: number }
  /** Textura de tablas de madera generada en el navegador (sin descargar imágenes) */
  woodPlanks?: boolean
}

export type FinishId =
  | 'wallPaint'
  | 'floorOak'
  | 'glass'
  | 'doorWalnut'
  | 'doorFrameOak'
  | 'handleSteel'
  | 'cabinetOak'
  | 'tvWalnut'
  | 'tableWood'
  | 'linenPearl'
  | 'fabricBeige'
  | 'fabricPetrol'
  | 'fabricTerracotta'
  | 'ceramic'
  | 'steel'
  | 'quartz'

export const FINISHES: Record<FinishId, Finish> = {
  wallPaint: { color: '#f4f1ea', roughness: 0.85 },
  floorOak: { color: '#ffffff', roughness: 0.35, metalness: 0.05, woodPlanks: true },
  glass: { color: '#e4f3f7', roughness: 0.05, physical: { transmission: 0.9, ior: 1.5, thickness: 0.3 } },
  doorWalnut: { color: '#6e4b33', roughness: 0.5 },
  doorFrameOak: { color: '#a98058', roughness: 0.55 },
  handleSteel: { color: '#d5d8dc', roughness: 0.2, metalness: 0.9 },
  cabinetOak: { color: '#9c7552', roughness: 0.55 },
  tvWalnut: { color: '#5a3d2b', roughness: 0.45 },
  tableWood: { color: '#7a5639', roughness: 0.45 },
  linenPearl: { color: '#d5d7da', roughness: 0.9 },
  fabricBeige: { color: '#d8c6a6', roughness: 0.9 },
  fabricPetrol: { color: '#2f5f6e', roughness: 0.9 },
  fabricTerracotta: { color: '#b8613f', roughness: 0.9 },
  ceramic: { color: '#f7f7f4', roughness: 0.15, physical: { clearcoat: 0.6, clearcoatRoughness: 0.1 } },
  steel: { color: '#c8ccd1', roughness: 0.22, metalness: 0.9 },
  quartz: { color: '#ecebe7', roughness: 0.25, physical: { clearcoat: 0.35, clearcoatRoughness: 0.2 } },
}

/** Acabado de cada colección (las hojas de puerta, los textiles y los electrodomésticos se afinan abajo). */
export const COLLECTION_FINISH: Record<CollectionId, FinishId> = {
  paredes: 'wallPaint',
  piso: 'floorOak',
  ventanas: 'glass',
  puertas: 'doorFrameOak',
  chapas: 'handleSteel',
  camas: 'linenPearl',
  mesitas: 'cabinetOak',
  mesaTv: 'tvWalnut',
  armarios: 'cabinetOak',
  lavanderia: 'ceramic',
  cocina: 'steel',
  bano: 'ceramic',
  mesasSillasSofas: 'fabricBeige',
}

const todas = (names: string[], finish: FinishId) => Object.fromEntries(names.map((n) => [n, finish])) as Record<string, FinishId>

/** Excepciones por malla: mesas de madera, isla y mesón de cuarzo, electrodomésticos de acero, sofás y sillas en color. */
export const MESH_FINISH: Record<string, FinishId> = {
  ...todas(serie('Cubo', [23, 24, 26, 31, 41]), 'tableWood'), // mesas de centro, escritorio, comedor
  ...todas(serie('Cubo', [16, 18, 20, 21, 36, 37, 38, 39, 40]), 'fabricTerracotta'), // poltronas y bancos
  ...todas(serie('Cubo', [19, 25, 27, 28, 29, 30]), 'fabricPetrol'), // sofás de las salas y puffs
  Cubo017: 'linenPearl',
  Cubo035: 'quartz', // isla de la cocina
  Cubo060: 'quartz', // mesón de la cocina
  Cubo053: 'steel', // lavadora y secadora
  Cubo054: 'steel',
  Cubo066: 'glass', // división de la ducha
}

/** Paredes «cortadas»: altura (u del modelo) a la que se cortan para ver el interior. Las puertas miden ~4,8. */
export const WALL_CUT_HEIGHT = 5.4

/* ─────────────────────── Luces: tonos rápidos ─────────────────────── */

export const LIGHT_PRESETS = [
  { id: 'warm', label: 'Cálida', hint: '3000 K', color: '#ffb46b' },
  { id: 'cold', label: 'Fría', hint: '6000 K', color: '#e6efff' },
  { id: 'alert', label: 'Alerta', hint: 'rojo', color: '#ff3b3b' },
] as const

/* ─────────────────────── Cámara: vistas por zona ─────────────────────── */

/**
 * Botones de cámara del visor. Cada zona apunta al centro de sus luces (Empties «Luz_*» de esas habitaciones) y la mira
 * en diagonal desde `distance` unidades. Para agregar una zona basta con listar sus habitaciones (`LIGHTS[].room`).
 */
export const CAMERA_ZONES = [
  { id: 'sala', label: 'Sala / TV', rooms: ['Sala principal', 'Sala de entrada'], distance: 36 },
  { id: 'dormitorios', label: 'Habitaciones', rooms: ['Dormitorio principal', 'Dormitorio 2', 'Dormitorio 3'], distance: 40 },
  { id: 'cocina', label: 'Cocina', rooms: ['Cocina'], distance: 30 },
  { id: 'banos', label: 'Baños', rooms: ['Baño principal', 'Baño de visitas'], distance: 26 },
  { id: 'lavanderia', label: 'Lavandería', rooms: ['Lavandería', 'Garaje'], distance: 30 },
] as const

export type CameraZoneId = (typeof CAMERA_ZONES)[number]['id']

/* ───────────────────────────── Habitaciones ───────────────────────────── */

export interface RoomDef {
  id: string
  /** Debe coincidir con `LIGHTS[].room`: de ahí se calcula el centro de la habitación */
  label: string
  /** Radio (u) de la mancha del mapa de calor */
  radius: number
}

export const ROOMS: RoomDef[] = [
  { id: 'sala_principal', label: 'Sala principal', radius: 8 },
  { id: 'sala_entrada', label: 'Sala de entrada', radius: 6.5 },
  { id: 'sala_estudio', label: 'Sala de estudio', radius: 6 },
  { id: 'cocina', label: 'Cocina', radius: 7 },
  { id: 'lavanderia', label: 'Lavandería', radius: 5 },
  { id: 'garaje', label: 'Garaje', radius: 6.5 },
  { id: 'dormitorio_principal', label: 'Dormitorio principal', radius: 7 },
  { id: 'dormitorio_2', label: 'Dormitorio 2', radius: 5 },
  { id: 'dormitorio_3', label: 'Dormitorio 3', radius: 5 },
  { id: 'bano_principal', label: 'Baño principal', radius: 4 },
  { id: 'bano_visitas', label: 'Baño de visitas', radius: 3.5 },
]

export const roomLabel = (id: string) => ROOMS.find((r) => r.id === id)?.label ?? id

/* ───────────────────────────── Clima y A/C ───────────────────────────── */

export const CLIMATE = {
  /** Rango de confort (°C) para colorear y etiquetar */
  comfortMin: 22,
  comfortMax: 26,
  /** Temperatura exterior: media ± amplitud, con el máximo a `peakHour` (clima cálido) */
  outdoor: { mean: 29, amp: 5, peakHour: 15 },
  /** La casa queda ~3 °C por debajo del exterior (igual que los sensores simulados de Node-RED) */
  insulation: 3,
  /** °C que suman luces y enchufes por cada kW encendido en la habitación */
  gainPerKw: 1.5,
  /** Fracción de la diferencia con el exterior que se cierra por segundo */
  leakPerTick: 0.01,
  /** °C que enfría el compresor por segundo (a velocidad media) */
  coolPerTick: 0.16,
  /** Histéresis del termostato (±°C alrededor de la consigna) */
  hysteresis: 0.5,
  acSetpointMin: 16,
  acSetpointMax: 30,
}

export const AC_POWER = {
  /** Compresor trabajando (a velocidad media) */
  coolingW: 1100,
  /** Solo ventilador */
  fanW: 60,
  fanFactor: { low: 0.75, mid: 1, high: 1.25 } as Record<'low' | 'mid' | 'high', number>,
}

export interface AcDef {
  /** Si existe un Empty con este nombre en el .glb, el equipo se coloca ahí */
  id: string
  label: string
  room: string
  /** Desplazamiento (x, z) respecto al centro de la habitación */
  offset: [number, number]
}

export const AIR_CONDITIONERS: AcDef[] = [
  { id: 'AC_Sala_Principal', label: 'Sala principal', room: 'sala_principal', offset: [3.5, 0] },
  { id: 'AC_Dormitorio_Principal', label: 'Dormitorio principal', room: 'dormitorio_principal', offset: [2.5, 0] },
  { id: 'AC_Dormitorio_2', label: 'Dormitorio 2', room: 'dormitorio_2', offset: [2, 0] },
  { id: 'AC_Dormitorio_3', label: 'Dormitorio 3', room: 'dormitorio_3', offset: [2, 0] },
  { id: 'AC_Sala_Estudio', label: 'Sala de estudio', room: 'sala_estudio', offset: [2.5, 0] },
  { id: 'AC_Cocina', label: 'Cocina', room: 'cocina', offset: [2.5, 0] },
]

/** Y de las marcas virtuales (clima, A/C) sobre el borde de los muros */
export const DEVICE_Y = { climate: 6.2, ac: 4.3, plug: 1.6 }

/* ───────────────────────────── Alertas (las calcula Node-RED) ───────────────────────────── */

/**
 * Node-RED compara cada lectura con estos umbrales (nodo «Alertas (umbrales)») y levanta o normaliza las alertas;
 * la interfaz solo las muestra. El simulador local de desarrollo usa los mismos valores.
 * «Clear» = valor por debajo del cual la alerta se normaliza (histéresis: evita que parpadee).
 */
export const ALERTS = {
  tempHighC: 32,
  tempHighClearC: 31,
  humidityHighPct: 85,
  humidityHighClearPct: 80,
  powerHighW: 1500,
  powerHighClearW: 1350,
  // El humo usa SMOKE.alarmThresholdPpm; la intrusión depende del modo de seguridad.
}

/* ───────────────────── Realismo de los sensores (lo genera Node-RED) ───────────────────── */

export const SENSORS = {
  /** Fracción de luz natural que llega a cada habitación (luminosidad). */
  luxFactor: { default: 0.8, garaje: 0.3, bano_principal: 0.4, bano_visitas: 0.4, lavanderia: 0.5 } as Record<string, number>,
  /** Lux de una habitación con ventanas a mediodía, y lux que añade cada bombillo al 100 %. */
  luxMaxIndoor: 450,
  luxPerLightAt100: 180,
  noise: { temperature: 0.12, humidity: 0.8, lux: 12 },
  /**
   * Eventos domésticos que Node-RED genera al azar (everySec = intervalo medio) y que también se pueden
   * pedir con los botones «Simular…» de la interfaz. Son lecturas realistas: cocinar sube la temperatura (y un
   * poco de humo) de la cocina; una ducha sube la humedad del baño. Nada se enciende solo.
   */
  events: {
    heatKitchen: { everySec: 300, durationSec: 75, toC: 36 },
    humidityBath: { everySec: 360, durationSec: 60, toPct: 93 },
  },
}

/* ───────────────────────── Enchufes inteligentes ───────────────────────── */

export type PlugIcon = 'tv' | 'pc' | 'coffee' | 'washer' | 'fan' | 'charger'

export interface PlugDef {
  /** Si existe un Empty con este nombre en el .glb, el enchufe se coloca ahí */
  id: string
  label: string
  room: string
  watts: number
  icon: PlugIcon
  /** steady = consumo estable · cycle = sube y baja (lavadora) */
  profile?: 'steady' | 'cycle'
  /** Temporizador de apagado automático */
  autoOffSec?: number
  initialOn?: boolean
  offset: [number, number]
}

export const PLUGS: PlugDef[] = [
  { id: 'Enchufe_TV_Sala', label: 'Televisor', room: 'sala_principal', watts: 110, icon: 'tv', initialOn: true, offset: [-3, 3] },
  { id: 'Enchufe_PC_Estudio', label: 'Computador', room: 'sala_estudio', watts: 180, icon: 'pc', offset: [-2, 2] },
  { id: 'Enchufe_Cafetera', label: 'Cafetera', room: 'cocina', watts: 850, icon: 'coffee', autoOffSec: 20, offset: [-2.5, 2] },
  { id: 'Enchufe_Lavadora', label: 'Lavadora', room: 'lavanderia', watts: 450, icon: 'washer', profile: 'cycle', offset: [0, 2] },
  { id: 'Enchufe_Ventilador_D2', label: 'Ventilador', room: 'dormitorio_2', watts: 55, icon: 'fan', offset: [-2, 1.5] },
  { id: 'Enchufe_Cargador_DP', label: 'Cargador', room: 'dormitorio_principal', watts: 20, icon: 'charger', initialOn: true, offset: [-2, 2] },
]

/* ───────────────────────────── Escenas ───────────────────────────── */

export type SceneIcon = 'home' | 'film' | 'book' | 'moon' | 'logout'

export interface SceneDef {
  id: string
  label: string
  hint: string
  icon: SceneIcon
  /** Luces que se encienden (intensidad %, color opcional) */
  lights: Record<string, { intensity: number; color?: string }>
  /** off = apaga las demás luces · keep = no las toca */
  lightsOthers: 'off' | 'keep'
  ac?: Record<string, { on: boolean; setpoint?: number; fan?: 'low' | 'mid' | 'high' }>
  acOthers?: 'off' | 'keep'
  plugs?: Record<string, boolean>
  plugsOthers?: 'off' | 'keep'
  doorsClose?: boolean
  security?: 'disarmed' | 'home' | 'away'
}

export const SCENES: SceneDef[] = [
  {
    id: 'llegue',
    label: 'Llegué a casa',
    hint: 'Luces de entrada y sala, A/C en la sala',
    icon: 'home',
    lights: {
      Luz_Sala_Entrada_1: { intensity: 80 },
      Luz_Sala_Entrada_2: { intensity: 80 },
      Luz_Sala_Principal_1: { intensity: 70 },
      Luz_Sala_Principal_2: { intensity: 70 },
    },
    lightsOthers: 'keep',
    ac: { AC_Sala_Principal: { on: true, setpoint: 24, fan: 'mid' } },
    security: 'disarmed',
  },
  {
    id: 'cine',
    label: 'Cine',
    hint: 'Sala tenue en ámbar, TV encendida',
    icon: 'film',
    lights: {
      Luz_Sala_Principal_1: { intensity: 12, color: '#ff9f5a' },
      Luz_Sala_Principal_2: { intensity: 12, color: '#ff9f5a' },
    },
    lightsOthers: 'off',
    ac: { AC_Sala_Principal: { on: true, setpoint: 23, fan: 'low' } },
    plugs: { Enchufe_TV_Sala: true },
  },
  {
    id: 'estudio',
    label: 'Estudio',
    hint: 'Luz fría, computador y A/C del estudio',
    icon: 'book',
    lights: {
      Luz_Sala_Estudio_1: { intensity: 100, color: '#e6f2ff' },
      Luz_Sala_Estudio_2: { intensity: 100, color: '#e6f2ff' },
    },
    lightsOthers: 'off',
    ac: { AC_Sala_Estudio: { on: true, setpoint: 24, fan: 'mid' } },
    plugs: { Enchufe_PC_Estudio: true },
  },
  {
    id: 'dormir',
    label: 'Dormir',
    hint: 'Todo apagado, A/C suave, casa armada',
    icon: 'moon',
    lights: {},
    lightsOthers: 'off',
    ac: { AC_Dormitorio_Principal: { on: true, setpoint: 25, fan: 'low' } },
    acOthers: 'off',
    plugs: { Enchufe_Cargador_DP: true },
    plugsOthers: 'off',
    doorsClose: true,
    security: 'home',
  },
  {
    id: 'fuera',
    label: 'Salir de casa',
    hint: 'Apaga todo, cierra puertas y arma la alarma',
    icon: 'logout',
    lights: {},
    lightsOthers: 'off',
    acOthers: 'off',
    plugsOthers: 'off',
    doorsClose: true,
    security: 'away',
  },
]

export type HistorySeed = { power: TimePoint[]; smoke: TimePoint[] }
