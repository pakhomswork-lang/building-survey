// Метки точек на листе: размер и цветное кольцо (Р-24). Общие для телефона и компьютера.
import type { Photo } from './db'
import { TYPE_KEYS } from './format'
import { typeColor } from './typeColor'

// Размер метки на экране (Р-24). Пока лист отдалён или приближен немного, метка маленькая
// и не закрывает план. При сильном приближении растёт, но не больше MARKER_MAX.
const MARKER_MIN = 22
const MARKER_MAX = 34
/** С какого приближения (во сколько раз больше «лист целиком») метка начинает расти. */
const MARKER_GROW_FROM = 2.5

export function markerSize(scale: number): number {
  if (scale <= MARKER_GROW_FROM) return MARKER_MIN
  return Math.min(MARKER_MAX, MARKER_MIN * Math.sqrt(scale / MARKER_GROW_FROM))
}

/** Кольцо метки: доли цветов показывают, сколько фото какого типа в точке. */
export function ringBackground(photos: Photo[]): string {
  if (!photos.length) return '#c4c9d1'
  let angle = 0
  const stops: string[] = []
  for (const type of TYPE_KEYS) {
    const n = photos.filter(p => p.type === type).length
    if (!n) continue
    const from = angle
    angle += (n / photos.length) * 360
    // маленький зазор между долями, если типов несколько
    const gap = n === photos.length ? 0 : 3
    stops.push(`${typeColor(type)} ${from}deg ${angle - gap}deg`, `transparent ${angle - gap}deg ${angle}deg`)
  }
  return `conic-gradient(${stops.join(',')})`
}

