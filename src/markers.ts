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

/**
 * Кольцо метки: доли цветов показывают, сколько фото какого типа в точке.
 * Возвращает слой-картинку для CSS-переменной --ring; белый кружок с номером
 * рисуется поверх в том же элементе (см. .marker в index.css), поэтому не съезжает
 * на экранах с увеличением 125–150 %.
 */
export function ringBackground(photos: Photo[]): string {
  const types = TYPE_KEYS.filter(t => photos.some(p => p.type === t))
  // один цвет — сплошное кольцо без стыка (у кругового градиента на стыке бывает светлая черта)
  if (types.length <= 1) {
    const c = types.length ? typeColor(types[0]) : '#c4c9d1'
    return `linear-gradient(${c}, ${c})`
  }
  let angle = 0
  const stops: string[] = []
  for (const type of types) {
    const n = photos.filter(p => p.type === type).length
    const from = angle
    angle += (n / photos.length) * 360
    // маленький зазор между долями
    stops.push(`${typeColor(type)} ${from}deg ${angle - 3}deg`, `transparent ${angle - 3}deg ${angle}deg`)
  }
  return `conic-gradient(${stops.join(',')})`
}
