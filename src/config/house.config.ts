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
 *
 * Aquí se declara qué malla es cada puerta y hacia dónde abre. Para arreglarlo "de verdad"
 * en Blender, ver el README (sección «Puertas»).
 *
 * `mesh` es el nombre que ve three.js: GLTFLoader QUITA los puntos ("Cube.032" → "Cube032").
 */
export interface DoorDef {
  /** Clave de estado. Para puertas con sensor = nombre del Empty (Sensor_Puerta_*). */
  id: string
  label: string
  /** Nombre de la malla en three.js (sin puntos) */
  mesh: string
  kind: 'swing' | 'slide'
  /** swing: extremo del eje largo donde está la bisagra. Si abre "al revés", cámbialo. */
  hinge?: 'min' | 'max'
  /** swing: sentido del giro. Si choca con el mueble equivocado, pon -1. */
  dir?: 1 | -1
  /** true = tiene un Empty `id` en el modelo (muestra etiqueta flotante) */
  sensor?: boolean
}

export const DOOR_OPEN_ANGLE = Math.PI / 2 // 90°

export const DOORS: DoorDef[] = [
  { id: 'Sensor_Puerta_Entrada', label: 'Puerta de entrada', mesh: 'Cube032', kind: 'swing', hinge: 'min', dir: -1, sensor: true },
  { id: 'Sensor_Puerta_Garage', label: 'Puerta del garaje', mesh: 'Cube037', kind: 'slide', sensor: true },
  { id: 'Puerta_Sala_Principal', label: 'Entrada · Sala principal', mesh: 'Cube016', kind: 'swing', hinge: 'min', dir: 1 },
  { id: 'Puerta_Cocina', label: 'Entrada · Cocina', mesh: 'Cube030', kind: 'swing', hinge: 'min', dir: 1 },
  { id: 'Puerta_Lavanderia_2', label: 'Entrada · Lavandería 2', mesh: 'Cube028', kind: 'swing', hinge: 'min', dir: 1 },
  { id: 'Puerta_Lavanderia', label: 'Entrada · Lavandería', mesh: 'Cube026', kind: 'swing', hinge: 'min', dir: 1 },
  { id: 'Puerta_Dormitorio_Principal', label: 'Entrada · Dormitorio principal', mesh: 'Cube020', kind: 'swing', hinge: 'min', dir: 1 },
  { id: 'Puerta_Dormitorio_Principal_Interior', label: 'Interior · Dormitorio principal', mesh: 'Cube018', kind: 'swing', hinge: 'min', dir: 1 },
  { id: 'Puerta_Dormitorio_3', label: 'Interior · Dormitorio 3', mesh: 'Cube022', kind: 'swing', hinge: 'min', dir: 1 },
  { id: 'Puerta_Sala_Estudio', label: 'Interior · Sala de estudio', mesh: 'Cube024', kind: 'swing', hinge: 'min', dir: 1 },
  { id: 'Puerta_Bano_Visitas', label: 'Interior · Baño de visitas', mesh: 'Cube034', kind: 'swing', hinge: 'min', dir: 1 },
  { id: 'Puerta_Pasillo', label: 'Interior · Pasillo', mesh: 'Cube036', kind: 'swing', hinge: 'min', dir: 1 },
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

/* ─────────────────────── Corrección de materiales ─────────────────────── */

export type SurfaceKind = 'floor' | 'wall' | 'frame' | 'door' | 'furniture'

/**
 * Cómo interpretar los materiales con nombre del .glb exportado.
 * (En este modelo: "Material.001" = verde = muros, "Material" = magenta = marcos.)
 */
export const MATERIAL_ROLES: Record<string, SurfaceKind> = {
  'Material.001': 'wall',
  Material: 'frame',
}

/**
 * Colores de la casa (estilo escandinavo, calido y tranquilo).
 *  - Muros en blanco calido: la luz rebota y la casa se ve limpia.
 *  - Piso de roble claro: el unico color "calido" grande, da la sensacion de hogar.
 *  - Puertas en nogal medio: contraste suave con los muros.
 *  - Muebles en neutros calidos con 2 toques verde azulado, el mismo color de la interfaz, para que todo se vea de una sola paleta.
 */
export const PALETTE: Record<SurfaceKind, string[]> = {
  floor: ['#cfae85'],
  wall: ['#f6f3ee'],
  frame: ['#ffffff'],
  door: ['#8a6a4c'],
  furniture: ['#e6dfd2', '#d3c8b6', '#bfae96', '#a9b9b4', '#8fa8a3', '#c9d3d0'],
}

/** Acabado de cada superficie: 1 = mate total. Pisos y puertas con un poco mas de brillo se ven mas "reales". */
export const SURFACE_FINISH: Record<SurfaceKind, { roughness: number }> = {
  floor: { roughness: 0.7 },
  wall: { roughness: 0.95 },
  frame: { roughness: 0.8 },
  door: { roughness: 0.65 },
  furniture: { roughness: 0.85 },
}

/** true = conserva el color base del material original (si tenía uno propio). */
export const KEEP_ORIGINAL_COLORS = false

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
