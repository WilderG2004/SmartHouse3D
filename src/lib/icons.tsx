import { BatteryCharging, Coffee, Fan, Monitor, Tv, WashingMachine, type LucideIcon } from 'lucide-react'
import type { PlugIcon } from '../config/house.config'

export const PLUG_ICONS: Record<PlugIcon, LucideIcon> = {
  tv: Tv,
  pc: Monitor,
  coffee: Coffee,
  washer: WashingMachine,
  fan: Fan,
  charger: BatteryCharging,
}
