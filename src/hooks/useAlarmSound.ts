/**
 * Sirena (Web Audio, sin archivos) y aviso por voz (Web Speech) cuando hay una alarma.
 * Solo suena si el usuario activó el sonido en la cabecera: los navegadores bloquean
 * el audio hasta que hay un clic.
 */
import { useEffect, useRef } from 'react'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'es-ES'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function useAlarmSound() {
  const soundOn = useUiStore((s) => s.soundOn)
  const smokeAlarm = useHouseStore((s) => s.smoke.alarm)
  const secAlarm = useHouseStore((s) => s.security.alarm)
  const ctx = useRef<AudioContext | null>(null)
  const active = soundOn && (smokeAlarm || secAlarm)

  // Sirena de dos tonos mientras dure la alarma
  useEffect(() => {
    if (!active) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const c = (ctx.current ??= new Ctor())
    void c.resume()
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'square'
    gain.gain.value = 0.04
    osc.connect(gain).connect(c.destination)
    osc.start()
    let hi = false
    const swap = () => {
      hi = !hi
      osc.frequency.setValueAtTime(hi ? 960 : 700, c.currentTime)
    }
    swap()
    const timer = window.setInterval(swap, 450)
    return () => {
      window.clearInterval(timer)
      osc.stop()
      osc.disconnect()
      gain.disconnect()
    }
  }, [active])

  // Aviso por voz al comenzar cada alarma
  useEffect(() => {
    if (soundOn && smokeAlarm) speak('Alerta. Humo detectado en la cocina.')
  }, [smokeAlarm, soundOn])
  useEffect(() => {
    if (soundOn && secAlarm) speak('Alerta. Intrusión detectada.')
  }, [secAlarm, soundOn])

  useEffect(() => {
    if (!soundOn && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [soundOn])
}
