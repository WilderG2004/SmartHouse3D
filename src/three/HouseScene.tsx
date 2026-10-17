import { Html, OrbitControls, Stats, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, Suspense, useEffect, useMemo, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { MODEL_URL, VIEW } from '../config/house.config'
import { commands } from '../hooks/useTelemetry'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import { AcLayer } from './AcLayer'
import { ClimateLayer } from './ClimateLayer'
import { DoorAnimator } from './DoorAnimator'
import { prepareDoors } from './doors'
import { LightRig } from './LightRig'
import { PlugLayer } from './PlugLayer'
import { SensorLayer } from './SensorLayer'
import { WalkMode } from './WalkMode'
import { applySolidMaterials } from './materials'
import { collectMarkers } from './markers'
import { daylight } from '../lib/climate'

/* ───────────── Modelo + luces + sensores ───────────── */

function House() {
  const { scene } = useGLTF(MODEL_URL)

  // Se ejecuta una vez por modelo cargado; todo es idempotente (seguro con React.StrictMode).
  const { markers, rigs } = useMemo(() => {
    applySolidMaterials(scene) // 1) materiales sólidos
    const rigs = prepareDoors(scene) // 2) pivotes en las bisagras
    return { markers: collectMarkers(scene), rigs } // 3) Empties → coordenadas + log de nodos
  }, [scene])

  // Clic en una hoja de puerta = abrir / cerrar (pasa por el adaptador, como cualquier comando)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const id = e.object.userData.doorId as string | undefined
    if (!id) return
    if (e.delta > 4) return // fue un arrastre (girar o mirar alrededor), no un clic
    e.stopPropagation()
    commands.setDoor(id, !useHouseStore.getState().doors[id]?.open)
  }
  const isDoor = (e: ThreeEvent<PointerEvent>) => !!e.object.userData.doorId

  return (
    <>
      <primitive
        object={scene}
        onClick={onClick}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => isDoor(e) && (document.body.style.cursor = 'pointer')}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => isDoor(e) && (document.body.style.cursor = '')}
      />
      <DoorAnimator rigs={rigs} />
      <LightRig markers={markers} />
      <SensorLayer markers={markers} />
      <ClimateLayer markers={markers} />
      <AcLayer markers={markers} />
      <PlugLayer markers={markers} />
      <WalkMode scene={scene} rigs={rigs} markers={markers} />
    </>
  )
}
useGLTF.preload(MODEL_URL)

/* ───────────── Cielo, sol y luz ambiental según la hora simulada ───────────── */

// Dia: cielo claro y cesped verde salvia (el verde combina con la madera del piso y con el color de la interfaz).
// Noche: crepusculo azul grisaceo suave, no negro, para que la pantalla no se sienta pesada y las luces igual resalten.
const NIGHT_SKY = new THREE.Color('#2c3853')
const DAY_SKY = new THREE.Color('#e8f0f4')
const NIGHT_GROUND = new THREE.Color('#2f3d4a')
const DAY_GROUND = new THREE.Color('#cfdfcf')
const WHITE_SUN = new THREE.Color('#fff6e6')
const SUNRISE = new THREE.Color('#ffb98a') // color del sol al amanecer y al atardecer
const MOON_SKY = new THREE.Color('#b9c6e6') // luz ambiente de noche: azulada, como la luna
const DAY_SKYLIGHT = new THREE.Color('#ffffff')

function SkyRig({ ground }: { ground: React.RefObject<THREE.MeshStandardMaterial | null> }) {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const k = useRef(daylight(useHouseStore.getState().world.hour))

  useFrame((_, dt) => {
    const hour = useHouseStore.getState().world.hour
    const ambient = useUiStore.getState().ambient
    k.current = THREE.MathUtils.damp(k.current, daylight(hour), 2.5, Math.min(dt, 0.1))
    const f = k.current

    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color()
    scene.background.copy(NIGHT_SKY).lerp(DAY_SKY, f)
    // Niebla del mismo color del cielo: el borde del terreno se funde con el horizonte
    if (!scene.fog) scene.fog = new THREE.Fog(scene.background.clone(), 150, 270)
    scene.fog.color.copy(scene.background)
    ground.current?.color.copy(NIGHT_GROUND).lerp(DAY_GROUND, f)

    // Sin "tone mapping" los blancos se ven blancos; por eso estas intensidades son las de una luz real (ver README de src/three).
    if (hemi.current) {
      hemi.current.intensity = ambient * (1.3 + 1.2 * f)
      hemi.current.color.copy(MOON_SKY).lerp(DAY_SKYLIGHT, Math.min(1, f * 1.5))
    }
    if (sun.current) {
      // El sol es la luz principal (con sombras). Se vuelve naranja suave al amanecer y al atardecer.
      sun.current.intensity = ambient * (0.4 + 1.7 * f)
      sun.current.color.copy(SUNRISE).lerp(WHITE_SUN, Math.min(1, f * 1.6))
      const a = ((hour - 6) / 12) * Math.PI // 0 al amanecer → π al atardecer
      const t = VIEW.target
      sun.current.position.set(t[0] + Math.cos(a) * 70, Math.max(18, Math.sin(a) * 95), t[2] + 40)
      sun.current.target.position.set(t[0], t[1], t[2])
      sun.current.target.updateMatrixWorld()
    }
    if (fill.current) {
      // Luz de relleno: siempre del lado de la camara, para que las paredes que se ven no queden grises.
      fill.current.intensity = ambient * (0.5 + 0.8 * f)
      fill.current.position.set(camera.position.x, camera.position.y * 0.9, camera.position.z)
      fill.current.target.position.set(...VIEW.target)
      fill.current.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#d9d2c4', 1]} />
      <directionalLight
        ref={sun}
        position={[40, 90, 30]}
        intensity={1}
        color="#fff6e6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-62}
        shadow-camera-right={62}
        shadow-camera-top={62}
        shadow-camera-bottom={-62}
        shadow-camera-near={5}
        shadow-camera-far={320}
        shadow-bias={-0.0004}
        shadow-normalBias={0.35}
      />
      <directionalLight ref={fill} position={[60, 50, 60]} intensity={0.5} color="#f3f7ff" />
    </>
  )
}

/* ───────────── Cámara: controles + vistas predefinidas animadas ───────────── */

function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera)
  const request = useUiStore((s) => s.viewRequest)
  const walking = useUiStore((s) => s.walking)
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const target = useMemo(() => new THREE.Vector3(...VIEW.target), [])

  useEffect(() => {
    if (request.nonce === 0) return
    const off = request.preset === 'top' ? VIEW.top : VIEW.iso
    goal.current = { pos: target.clone().add(new THREE.Vector3(...off)), target: target.clone() }
  }, [request, target])

  useFrame(() => {
    const g = goal.current
    const c = controls.current
    if (!g || !c || walking) return
    camera.position.lerp(g.pos, 0.09)
    c.target.lerp(g.target, 0.09)
    c.update()
    if (camera.position.distanceTo(g.pos) < 0.1) goal.current = null
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!walking}
      target={VIEW.target}
      enableDamping
      dampingFactor={0.08}
      minDistance={12}
      maxDistance={220}
      maxPolarAngle={Math.PI / 2.05}
    />
  )
}

/* ───────────── Escena ───────────── */

/** Abre la pagina con ?fps para ver el panel de cuadros por segundo (medir el rendimiento en cada equipo). */
const SHOW_STATS = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fps')

// memo: HouseScene no recibe nada, asi que React no la vuelve a dibujar cuando se redibuja el visor. Antes, cada segundo
// (con los datos nuevos) se repasaba TODA la escena 3D (luces, etiquetas, sensores...) sin ningun cambio real.
export const HouseScene = memo(function HouseScene() {
  const ground = useRef<THREE.MeshStandardMaterial>(null)
  // Dentro de la casa la pantalla se llena de paredes; en pantallas de alta densidad (x2) se dibuja a x1,5 para ir mas liviano
  const walking = useUiStore((s) => s.walking)
  const initial: [number, number, number] = [
    VIEW.target[0] + VIEW.iso[0],
    VIEW.target[1] + VIEW.iso[1],
    VIEW.target[2] + VIEW.iso[2],
  ]
  return (
    <Canvas
      shadows
      flat
      dpr={walking ? [1, 1.5] : [1, 2]}
      camera={{ fov: 40, near: 0.5, far: 900, position: initial }}
      gl={{ antialias: true }}
    >
      <SkyRig ground={ground} />
      {/* Suelo exterior (cesped): se aclara de día y se oscurece de noche */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[VIEW.target[0], -0.08, VIEW.target[2]]}>
        <circleGeometry args={[160, 72]} />
        <meshStandardMaterial ref={ground} color="#cfdfcf" roughness={1} />
      </mesh>
      <Suspense
        fallback={
          <Html center>
            <span className="glass rounded-full px-4 py-2 text-sm font-medium text-mute">
              Cargando modelo 3D…
            </span>
          </Html>
        }
      >
        <House />
      </Suspense>
      <CameraRig />
      {SHOW_STATS && <Stats />}
    </Canvas>
  )
})
