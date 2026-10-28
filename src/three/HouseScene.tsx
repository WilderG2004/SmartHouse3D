import { ContactShadows, Environment, Html, Lightformer, OrbitControls, Stats, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, Suspense, useEffect, useMemo, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { CAMERA_ZONES, MODEL_URL, VIEW } from '../config/house.config'
import { commands } from '../hooks/useTelemetry'
import { daylight } from '../lib/climate'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import { AcLayer } from './AcLayer'
import { computeZoneTargets, ZONE_DIR, zoneTargets } from './cameraZones'
import { ClimateLayer } from './ClimateLayer'
import { DoorAnimator } from './DoorAnimator'
import { prepareDoors, type DoorRigs } from './doors'
import { LightRig } from './LightRig'
import { collectMarkers } from './markers'
import { applyHouseMaterials, applyViewMode } from './materials'
import { PlugLayer } from './PlugLayer'
import { SensorLayer } from './SensorLayer'
import { skyState } from './skyState'
import { WalkMode } from './WalkMode'

/* ───────────── Puertas: brillo al pasar el mouse y tono cálido si están abiertas ───────────── */

/** Puerta bajo el mouse (se lee en cada cuadro, sin redibujar React) */
const hoverDoor: { id: string | null } = { id: null }
const HOVER_TINT = new THREE.Color('#7dd3fc')
const OPEN_TINT = new THREE.Color('#f59e0b')

function DoorHighlight({ rigs }: { rigs: DoorRigs }) {
  const glow = useMemo(() => new Map<string, number>(), [])
  useFrame((_, dt) => {
    const doors = useHouseStore.getState().doors
    rigs.forEach((rig, id) => {
      const mat = rig.leaf.material as THREE.MeshStandardMaterial
      const hovered = hoverDoor.id === id
      const goal = hovered ? 0.45 : doors[id]?.open ? 0.12 : 0
      const cur = glow.get(id) ?? 0
      if (cur === goal) return
      const next = Math.abs(cur - goal) < 0.005 ? goal : THREE.MathUtils.damp(cur, goal, 10, Math.min(dt, 0.1))
      glow.set(id, next)
      mat.emissive.copy(hovered ? HOVER_TINT : OPEN_TINT)
      mat.emissiveIntensity = next
    })
  })
  return null
}

/* ───────────── Modelo + luces + sensores ───────────── */

function House() {
  const { scene } = useGLTF(MODEL_URL)

  // Se ejecuta una vez por modelo cargado; todo es idempotente (seguro con React.StrictMode).
  const { markers, rigs, house } = useMemo(() => {
    const house = applyHouseMaterials(scene) // 1) materiales PBR por colección
    const rigs = prepareDoors(scene) // 2) pivotes en las bisagras
    const markers = collectMarkers(scene) // 3) Empties → coordenadas + log de nodos
    computeZoneTargets(markers) // 4) centros de las zonas de cámara
    return { markers, rigs, house }
  }, [scene])

  // Paredes sólidas / cortadas / rayos X y muebles: cambian materiales, no la escena (no hay que recompilar todo)
  const wallMode = useUiStore((s) => s.wallMode)
  const furniture = useUiStore((s) => s.furniture)
  const focus = useUiStore((s) => s.focus)
  const walking = useUiStore((s) => s.walking)
  useEffect(() => {
    // Al recorrer la casa todo vuelve a ser sólido: un mueble invisible igual frenaría el paso
    applyViewMode(house, walking ? { walls: 'solid', furniture: true, focus: false } : { walls: wallMode, furniture, focus })
  }, [house, wallMode, furniture, focus, walking])

  // Clic en una hoja de puerta = abrir / cerrar (pasa por el adaptador, como cualquier comando)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const id = e.object.userData.doorId as string | undefined
    if (!id) return
    if (e.delta > 4) return // fue un arrastre (girar o mirar alrededor), no un clic
    e.stopPropagation()
    commands.setDoor(id, !useHouseStore.getState().doors[id]?.open)
  }
  const doorOf = (e: ThreeEvent<PointerEvent>) => e.object.userData.doorId as string | undefined

  return (
    <>
      <primitive
        object={scene}
        onClick={onClick}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          const id = doorOf(e)
          if (!id) return
          hoverDoor.id = id
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => {
          const id = doorOf(e)
          if (!id) return
          if (hoverDoor.id === id) hoverDoor.id = null
          document.body.style.cursor = ''
        }}
      />
      <DoorAnimator rigs={rigs} />
      <DoorHighlight rigs={rigs} />
      <LightRig markers={markers} />
      <SensorLayer markers={markers} />
      <ClimateLayer markers={markers} />
      <AcLayer markers={markers} house={house} />
      <PlugLayer markers={markers} />
      <WalkMode scene={scene} rigs={rigs} markers={markers} />
      {/* Sombra de contacto bajo la casa: la «asienta» en el terreno. Se calcula una sola vez (frames=1). */}
      <ContactShadows
        position={[VIEW.target[0], 0.01, VIEW.target[2]]}
        scale={[72, 92]}
        resolution={1024}
        blur={2.6}
        opacity={0.5}
        far={14}
        frames={1}
        color="#0f172a"
      />
    </>
  )
}
useGLTF.preload(MODEL_URL)

/* ───────────── Cielo degradado, sol / luna y entorno según el modo Día / Noche ───────────── */

// Colores del cielo (arriba / horizonte) y del césped. De noche, azul profundo: las luces de la casa resaltan.
const DAY_TOP = new THREE.Color('#5f9fd8')
const DAY_HORIZON = new THREE.Color('#dfe9ef')
const NIGHT_TOP = new THREE.Color('#050916')
const NIGHT_HORIZON = new THREE.Color('#1b2640')
const DAY_GROUND = new THREE.Color('#b9cbb0')
const NIGHT_GROUND = new THREE.Color('#151d26')
const WHITE_SUN = new THREE.Color('#fff4e2')
const SUNRISE = new THREE.Color('#ffb98a') // sol al amanecer y al atardecer
const MOON = new THREE.Color('#8fa6dc')
const MOON_SKY = new THREE.Color('#9fb2e0') // luz ambiente de noche: azulada
const DAY_SKYLIGHT = new THREE.Color('#ffffff')

/** Cúpula con degradado vertical (no recibe niebla ni tono): el «fondo atmosférico» de la escena */
function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
}

function SkyRig({ ground }: { ground: React.RefObject<THREE.MeshStandardMaterial | null> }) {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sun = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  const sky = useMemo(makeSkyMaterial, [])
  const k = useRef(daylight(useHouseStore.getState().world.hour))
  const tint = useMemo(() => new THREE.Color(), [])

  useFrame((_, dt) => {
    const { skyMode, ambient } = useUiStore.getState()
    // Día / Noche fijan el cielo sin tocar la hora simulada de Node-RED; «auto» la sigue
    const hour = skyMode === 'day' ? 13 : skyMode === 'night' ? 23 : useHouseStore.getState().world.hour
    k.current = THREE.MathUtils.damp(k.current, daylight(hour), 2.5, Math.min(dt, 0.1))
    const f = k.current
    skyState.daylight = f

    sky.uniforms.top.value.copy(NIGHT_TOP).lerp(DAY_TOP, f)
    sky.uniforms.horizon.value.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, f)
    // Niebla del color del horizonte: el borde del terreno se funde con el cielo
    if (!scene.fog) scene.fog = new THREE.Fog('#dfe9ef', 150, 290)
    scene.fog.color.copy(sky.uniforms.horizon.value)
    ground.current?.color.copy(NIGHT_GROUND).lerp(DAY_GROUND, f)
    // Reflejos del entorno (acero, vidrio, cerámica): fuertes de día, casi nada de noche
    scene.environmentIntensity = ambient * (0.18 + 0.75 * f)

    if (hemi.current) {
      hemi.current.intensity = ambient * (0.55 + 1.35 * f)
      hemi.current.color.copy(MOON_SKY).lerp(DAY_SKYLIGHT, Math.min(1, f * 1.5))
    }
    if (sun.current) {
      // Sol de día y luna de noche: la única luz con sombra (las 17 de la casa no la proyectan, por rendimiento)
      const a = ((hour - 6) / 12) * Math.PI
      const up = Math.sin(a) > 0
      const ang = up ? a : a + Math.PI
      sun.current.intensity = ambient * (0.35 + 1.75 * f)
      tint.copy(SUNRISE).lerp(WHITE_SUN, Math.min(1, f * 1.6))
      sun.current.color.copy(MOON).lerp(tint, Math.min(1, f * 2.5))
      const t = VIEW.target
      sun.current.position.set(t[0] + Math.cos(ang) * 70, Math.max(24, Math.sin(ang) * 95), t[2] + 40)
      sun.current.target.position.set(t[0], t[1], t[2])
      sun.current.target.updateMatrixWorld()
    }
    if (fill.current) {
      // Luz de relleno: siempre del lado de la cámara, para que las paredes que se ven no queden grises.
      fill.current.intensity = ambient * (0.25 + 0.7 * f)
      fill.current.position.set(camera.position.x, camera.position.y * 0.9, camera.position.z)
      fill.current.target.position.set(...VIEW.target)
      fill.current.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <mesh position={VIEW.target} material={sky} renderOrder={-1} frustumCulled={false} raycast={() => null}>
        <sphereGeometry args={[420, 32, 16]} />
      </mesh>
      {/* Entorno de estudio hecho con paneles de luz: reflejos realistas sin descargar ningún HDR */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#4b5563']} />
        <Lightformer form="rect" intensity={2.2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[24, 24, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#dbe7ff" position={[-14, 4, 0]} rotation-y={Math.PI / 2} scale={[26, 5, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#ffeccc" position={[14, 4, 0]} rotation-y={-Math.PI / 2} scale={[26, 5, 1]} />
        <Lightformer form="ring" intensity={0.8} position={[0, 3, -14]} scale={7} />
      </Environment>
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
        shadow-radius={4}
      />
      <directionalLight ref={fill} position={[60, 50, 60]} intensity={0.5} color="#f3f7ff" />
    </>
  )
}

/* ───────────── Cámara: controles + vistas animadas (general, planta y zonas) ───────────── */

function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera)
  const request = useUiStore((s) => s.viewRequest)
  const walking = useUiStore((s) => s.walking)
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const center = useMemo(() => new THREE.Vector3(...VIEW.target), [])

  useEffect(() => {
    if (request.nonce === 0) return
    const p = request.preset
    if (p === 'iso' || p === 'top') {
      const off = p === 'top' ? VIEW.top : VIEW.iso
      goal.current = { pos: center.clone().add(new THREE.Vector3(...off)), target: center.clone() }
      return
    }
    const target = zoneTargets.get(p)
    const zone = CAMERA_ZONES.find((z) => z.id === p)
    if (!target || !zone) return
    goal.current = { pos: target.clone().addScaledVector(ZONE_DIR, zone.distance), target: target.clone() }
  }, [request, center])

  // Si el usuario arrastra a mitad del viaje, manda él: se cancela la animación
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const cancel = () => (goal.current = null)
    c.addEventListener('start', cancel)
    return () => c.removeEventListener('start', cancel)
  }, [])

  useFrame((_, dt) => {
    const g = goal.current
    const c = controls.current
    if (!g || !c || walking) return
    // Movimiento cinematográfico: rápido al salir y suave al llegar, igual en cualquier pantalla (por tiempo, no por cuadro)
    const e = 1 - Math.exp(-3.2 * Math.min(dt, 0.1))
    camera.position.lerp(g.pos, e)
    c.target.lerp(g.target, e)
    c.update()
    if (camera.position.distanceTo(g.pos) < 0.05 && c.target.distanceTo(g.target) < 0.05) goal.current = null
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!walking}
      target={VIEW.target}
      enableDamping
      dampingFactor={0.08}
      minDistance={10}
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
      dpr={walking ? [1, 1.5] : [1, 2]}
      camera={{ fov: 40, near: 0.5, far: 900, position: initial }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        // Tono «neutral» de Khronos: respeta los colores de los materiales (el blanco marfil sigue siendo marfil)
        gl.toneMapping = THREE.NeutralToneMapping
        gl.toneMappingExposure = 1.05
        gl.localClippingEnabled = true // paredes cortadas a media altura
        gl.transmissionResolutionScale = 0.5 // el vidrio refracta a media resolución: casi igual de bonito, mucho más liviano
      }}
    >
      <SkyRig ground={ground} />
      {/* Suelo exterior (césped): se aclara de día y se oscurece de noche. Más grande que la niebla: el borde no se ve */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[VIEW.target[0], -0.08, VIEW.target[2]]} receiveShadow>
        <circleGeometry args={[700, 96]} />
        <meshStandardMaterial ref={ground} color="#b9cbb0" roughness={1} />
      </mesh>
      <Suspense
        fallback={
          <Html center>
            <span className="glass rounded-full px-4 py-2 text-sm font-medium text-mute">Cargando modelo 3D…</span>
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
