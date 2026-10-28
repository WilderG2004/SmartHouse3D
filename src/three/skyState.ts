/**
 * Cuánta luz de día hay en la escena AHORA (0 = noche, 1 = mediodía), ya suavizada.
 * La escribe el cielo (HouseScene → SkyRig) en cada cuadro y la leen las luces y los sensores sin pasar por React.
 */
import * as THREE from 'three'

export const skyState = { daylight: 1 }

let glow: THREE.CanvasTexture | null = null

/** Halo radial (canvas) compartido por bombillos y sensores: se suma a lo que hay detrás, como un resplandor. */
export function glowTexture() {
  if (glow) return glow
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.12)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  glow = new THREE.CanvasTexture(c)
  glow.colorSpace = THREE.SRGBColorSpace
  return glow
}
